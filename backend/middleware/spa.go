package middleware

import (
	"compress/gzip"
	"crypto/sha256"
	"encoding/base64"
	"io"
	"io/fs"
	"net/http"
	"strconv"
	"strings"
	"sync"
)

const (
	// immutableCacheControl is applied to content-hashed assets under static/.
	// rsbuild's realContentHash guarantees the filename changes when the bytes
	// change, so the response is safe to cache for a year and never revalidate.
	immutableCacheControl = "public, max-age=31536000, immutable"

	// revalidateCacheControl is applied to index.html and the SPA fallback.
	// no-cache forces a conditional revalidation on every load so a deploy is
	// picked up immediately, while still allowing a 304 when unchanged.
	revalidateCacheControl = "no-cache"

	// staticPrefix is the directory holding content-hashed build output.
	staticPrefix = "static/"
)

// gzipWriterPool reuses gzip.Writer instances across requests to avoid
// per-request allocation of the (fairly large) compression state.
var gzipWriterPool = sync.Pool{
	New: func() any {
		return gzip.NewWriter(io.Discard)
	},
}

// compressibleTypes lists content-type prefixes worth gzipping. Already
// compressed formats (woff2, png, ico, webp, gzip) are intentionally absent —
// re-compressing them wastes CPU and usually grows the payload.
var compressibleTypes = []string{
	"text/",
	"application/javascript",
	"text/javascript",
	"application/json",
	"image/svg+xml",
}

// NewSPA returns a handler that serves static files from fsys with SPA fallback.
// Any request whose path does not match a real file is served index.html,
// allowing the frontend router to handle client-side routes.
//
// It layers three transport optimisations over the bare file server:
//
//   - Cache-Control: content-hashed assets under static/ are marked immutable;
//     index.html and the SPA fallback are marked no-cache so deploys are seen
//     immediately while still permitting a 304.
//   - ETag: a content-derived strong validator so revalidating requests (chiefly
//     index.html, which is no-cache) get a 304 instead of the full body. The
//     embedded FS exposes no modification time, so http.FileServerFS would
//     otherwise send no validator at all.
//   - gzip: compressible responses are gzipped on the fly when the client
//     advertises Accept-Encoding: gzip.
func NewSPA(fsys fs.FS) http.Handler {
	fileServer := http.FileServerFS(fsys)
	etags := &etagCache{fsys: fsys, cache: map[string]string{}}

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Try to open the requested file (strip leading slash).
		reqPath := r.URL.Path
		if len(reqPath) > 0 && reqPath[0] == '/' {
			reqPath = reqPath[1:]
		}

		if reqPath == "" {
			reqPath = "."
		}

		servePath := reqPath
		isAsset := false

		switch info, err := fs.Stat(fsys, reqPath); {
		case err != nil:
			// File doesn't exist — serve index.html for SPA routing.
			r.URL.Path = "/"
			servePath = "index.html"
		case info.IsDir():
			// A directory request (notably "/") is served its index.html.
			servePath = "index.html"
		default:
			isAsset = true
		}

		// Content-hashed assets under static/ never change for a given URL, so
		// they are safe to cache forever. Everything else (index.html and the
		// SPA fallback) must revalidate.
		if isAsset && strings.HasPrefix(reqPath, staticPrefix) {
			w.Header().Set("Cache-Control", immutableCacheControl)
		} else {
			w.Header().Set("Cache-Control", revalidateCacheControl)
		}

		// Set a content-derived ETag so http.ServeContent can answer
		// If-None-Match with a 304. Without it the embedded FS (zero modtime)
		// yields no validator and every revalidation re-sends the full body.
		if etag := etags.get(servePath); etag != "" {
			w.Header().Set("Etag", etag)
		}

		if !clientAcceptsGzip(r) {
			fileServer.ServeHTTP(w, r)

			return
		}

		// Advertise that the response varies by Accept-Encoding so shared
		// caches store the encoded and identity variants separately.
		w.Header().Add("Vary", "Accept-Encoding")

		gz := &gzipResponseWriter{ResponseWriter: w}
		defer gz.Close()

		fileServer.ServeHTTP(gz, r)
	})
}

// etagCache lazily computes and memoises a strong ETag per file path. The
// embedded frontend FS is immutable for the lifetime of the process, so a
// computed digest is valid forever and the cache only ever grows to the number
// of distinct served files.
type etagCache struct {
	fsys  fs.FS
	mu    sync.RWMutex
	cache map[string]string
}

// get returns a quoted strong ETag for path, or "" if the file cannot be read.
func (c *etagCache) get(path string) string {
	c.mu.RLock()
	etag, ok := c.cache[path]
	c.mu.RUnlock()

	if ok {
		return etag
	}

	etag = c.compute(path)

	c.mu.Lock()
	c.cache[path] = etag
	c.mu.Unlock()

	return etag
}

// compute reads the file and derives a SHA-256 based ETag. A miss (unreadable
// file) is cached as "" so it is not retried on every request.
func (c *etagCache) compute(path string) string {
	data, err := fs.ReadFile(c.fsys, path)
	if err != nil {
		return ""
	}

	sum := sha256.Sum256(data)

	return `"` + base64.RawURLEncoding.EncodeToString(sum[:16]) + `"`
}

// clientAcceptsGzip reports whether the request advertises gzip support with a
// non-zero quality value.
func clientAcceptsGzip(r *http.Request) bool {
	for token := range strings.SplitSeq(r.Header.Get("Accept-Encoding"), ",") {
		name, params, _ := strings.Cut(strings.TrimSpace(token), ";")
		if !strings.EqualFold(strings.TrimSpace(name), "gzip") {
			continue
		}

		// A coding offered with q=0 is explicitly refused.
		for p := range strings.SplitSeq(params, ";") {
			key, val, found := strings.Cut(strings.TrimSpace(p), "=")
			if !found || !strings.EqualFold(strings.TrimSpace(key), "q") {
				continue
			}

			if q, err := strconv.ParseFloat(strings.TrimSpace(val), 64); err == nil && q == 0 {
				return false
			}
		}

		return true
	}

	return false
}

// isCompressible reports whether a Content-Type is worth gzipping.
func isCompressible(contentType string) bool {
	// Strip any "; charset=..." parameter before matching.
	mediaType, _, _ := strings.Cut(contentType, ";")
	mediaType = strings.TrimSpace(strings.ToLower(mediaType))

	for _, prefix := range compressibleTypes {
		if strings.HasPrefix(mediaType, prefix) {
			return true
		}
	}

	return false
}

// gzipResponseWriter wraps an http.ResponseWriter and transparently gzips the
// body when, at WriteHeader time, the response looks compressible. The decision
// is deferred until the headers are known because the underlying file server
// sets Content-Type, Content-Length and ETag itself.
type gzipResponseWriter struct {
	http.ResponseWriter

	gz          *gzip.Writer
	wroteHeader bool
	compressing bool
}

// WriteHeader decides whether to gzip based on the status code and the headers
// the file server has populated, fixes up the affected headers, then writes the
// status line exactly once.
func (g *gzipResponseWriter) WriteHeader(status int) {
	if g.wroteHeader {
		return
	}

	g.wroteHeader = true

	header := g.Header()

	// 304 Not Modified (and other bodyless responses) carry no body to
	// compress, so leave them untouched. 206 Partial Content carries byte-range
	// semantics over the identity representation; gzip would corrupt the range.
	skipCompression := status == http.StatusNotModified ||
		status == http.StatusNoContent ||
		status == http.StatusPartialContent

	// Only compress when the file server declared a compressible type and has
	// not already encoded the body.
	if !skipCompression && isCompressible(header.Get("Content-Type")) &&
		header.Get("Content-Encoding") == "" {
		g.compressing = true

		header.Set("Content-Encoding", "gzip")

		// The byte length now changes, and range requests over an encoded body
		// are not meaningful here, so drop the stale Content-Length and
		// Accept-Ranges that the file server computed for the identity body.
		header.Del("Content-Length")
		header.Del("Accept-Ranges")

		// A strong ETag identifies the identity bytes; the gzipped body is a
		// different representation, so weaken it to stay HTTP-correct.
		weakenETag(header)

		writer, _ := gzipWriterPool.Get().(*gzip.Writer)
		writer.Reset(g.ResponseWriter)
		g.gz = writer
	}

	g.ResponseWriter.WriteHeader(status)
}

// Write streams the body through the gzip writer when compressing, or directly
// otherwise. It also covers handlers that write a body without an explicit
// WriteHeader call (implicit 200).
func (g *gzipResponseWriter) Write(b []byte) (int, error) {
	if !g.wroteHeader {
		g.WriteHeader(http.StatusOK)
	}

	if g.compressing {
		return g.gz.Write(b)
	}

	return g.ResponseWriter.Write(b)
}

// Close flushes and returns the pooled gzip writer. It is safe to call when no
// compression took place.
func (g *gzipResponseWriter) Close() {
	if g.gz == nil {
		return
	}

	_ = g.gz.Close()
	g.gz.Reset(io.Discard)
	gzipWriterPool.Put(g.gz)
	g.gz = nil
}

// weakenETag converts a strong ETag into a weak one so it correctly describes a
// transfer-encoded representation rather than the exact identity bytes. A weak
// validator (W/"...") still allows conditional GETs to return 304.
func weakenETag(header http.Header) {
	etag := header.Get("Etag")
	if etag == "" || strings.HasPrefix(etag, "W/") {
		return
	}

	header.Set("Etag", "W/"+etag)
}
