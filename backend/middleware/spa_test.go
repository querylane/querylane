package middleware

import (
	"compress/gzip"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"testing/fstest"
)

// gzipEncoding is the Content-Encoding token the middleware emits.
const gzipEncoding = "gzip"

// newTestFS builds an in-memory frontend dist tree resembling the rsbuild
// output: content-hashed assets under static/ plus a root index.html.
func newTestFS() fstest.MapFS {
	indexHTML := []byte("<!doctype html><html><head></head><body><div id=\"root\"></div></body></html>")
	js := []byte(strings.Repeat("console.log('hello world');\n", 64))
	css := []byte(strings.Repeat(".a{color:red}\n", 64))
	svg := []byte("<svg xmlns=\"http://www.w3.org/2000/svg\"></svg>")
	woff2 := []byte("wOF2 binary font payload that should not be re-compressed at all")

	return fstest.MapFS{
		"index.html":                     {Data: indexHTML},
		"static/js/main.abc123.js":       {Data: js},
		"static/css/main.def456.css":     {Data: css},
		"static/svg/logo.789abc.svg":     {Data: svg},
		"static/font/inter.0a1b2c.woff2": {Data: woff2},
	}
}

func TestSPACacheControl(t *testing.T) {
	t.Parallel()

	handler := NewSPA(newTestFS())

	tests := []struct {
		name      string
		path      string
		wantCache string
	}{
		{
			name:      "hashed js asset is immutable",
			path:      "/static/js/main.abc123.js",
			wantCache: "public, max-age=31536000, immutable",
		},
		{
			name:      "hashed css asset is immutable",
			path:      "/static/css/main.def456.css",
			wantCache: "public, max-age=31536000, immutable",
		},
		{
			name:      "hashed woff2 asset is immutable",
			path:      "/static/font/inter.0a1b2c.woff2",
			wantCache: "public, max-age=31536000, immutable",
		},
		{
			name:      "root falls back to index and is no-cache",
			path:      "/",
			wantCache: "no-cache",
		},
		{
			name:      "explicit index.html is no-cache",
			path:      "/index.html",
			wantCache: "no-cache",
		},
		{
			name:      "unknown SPA route is no-cache",
			path:      "/instances/42/databases",
			wantCache: "no-cache",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			req := httptest.NewRequest(http.MethodGet, tt.path, nil)
			rec := httptest.NewRecorder()
			handler.ServeHTTP(rec, req)

			res := rec.Result()
			defer res.Body.Close()

			if got := res.Header.Get("Cache-Control"); got != tt.wantCache {
				t.Errorf("Cache-Control = %q, want %q", got, tt.wantCache)
			}
		})
	}
}

func TestSPAGzip(t *testing.T) {
	t.Parallel()

	handler := NewSPA(newTestFS())

	tests := []struct {
		name           string
		path           string
		acceptEncoding string
		wantGzip       bool
	}{
		{
			name:           "js compressed when gzip accepted",
			path:           "/static/js/main.abc123.js",
			acceptEncoding: "gzip",
			wantGzip:       true,
		},
		{
			name:           "css compressed when gzip accepted",
			path:           "/static/css/main.def456.css",
			acceptEncoding: "gzip, deflate, br",
			wantGzip:       true,
		},
		{
			name:           "svg compressed when gzip accepted",
			path:           "/static/svg/logo.789abc.svg",
			acceptEncoding: "gzip",
			wantGzip:       true,
		},
		{
			name:           "index html compressed when gzip accepted",
			path:           "/",
			acceptEncoding: "gzip",
			wantGzip:       true,
		},
		{
			name:           "js not compressed without accept-encoding",
			path:           "/static/js/main.abc123.js",
			acceptEncoding: "",
			wantGzip:       false,
		},
		{
			name:           "woff2 not compressed even with gzip accepted",
			path:           "/static/font/inter.0a1b2c.woff2",
			acceptEncoding: "gzip",
			wantGzip:       false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			req := httptest.NewRequest(http.MethodGet, tt.path, nil)
			if tt.acceptEncoding != "" {
				req.Header.Set("Accept-Encoding", tt.acceptEncoding)
			}

			rec := httptest.NewRecorder()
			handler.ServeHTTP(rec, req)

			res := rec.Result()
			defer res.Body.Close()

			if tt.wantGzip {
				assertGzipped(t, res)
			} else if enc := res.Header.Get("Content-Encoding"); enc == gzipEncoding {
				t.Errorf("Content-Encoding = gzip, want identity for %s", tt.path)
			}
		})
	}
}

// assertGzipped verifies that res carries a valid, decodable gzip body and the
// headers required for a transfer-encoded response.
func assertGzipped(t *testing.T, res *http.Response) {
	t.Helper()

	if enc := res.Header.Get("Content-Encoding"); enc != gzipEncoding {
		t.Fatalf("Content-Encoding = %q, want gzip", enc)
	}

	gr, err := gzip.NewReader(res.Body)
	if err != nil {
		t.Fatalf("gzip.NewReader: %v", err)
	}
	defer gr.Close()

	decoded, err := io.ReadAll(gr)
	if err != nil {
		t.Fatalf("read gzip body: %v", err)
	}

	if len(decoded) == 0 {
		t.Error("decoded gzip body is empty")
	}

	// A gzipped response must advertise Vary and must not leak a stale
	// (now-wrong) Content-Length for the encoded body.
	if vary := res.Header.Get("Vary"); !strings.Contains(vary, "Accept-Encoding") {
		t.Errorf("Vary = %q, want it to contain Accept-Encoding", vary)
	}

	if cl := res.Header.Get("Content-Length"); cl != "" {
		t.Errorf("Content-Length = %q, want empty for gzipped response", cl)
	}
}

func TestSPAGzipWeakensETag(t *testing.T) {
	t.Parallel()

	handler := NewSPA(newTestFS())

	req := httptest.NewRequest(http.MethodGet, "/static/js/main.abc123.js", nil)
	req.Header.Set("Accept-Encoding", "gzip")

	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	res := rec.Result()
	defer res.Body.Close()

	etag := res.Header.Get("Etag")
	if etag == "" {
		t.Fatal("expected an ETag on the gzipped response")
	}

	if !strings.HasPrefix(etag, "W/") {
		t.Errorf("Etag = %q, want a weak ETag (W/ prefix) on gzipped response", etag)
	}
}

func TestSPAIdentityETagIsStrong(t *testing.T) {
	t.Parallel()

	handler := NewSPA(newTestFS())

	req := httptest.NewRequest(http.MethodGet, "/static/js/main.abc123.js", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	res := rec.Result()
	defer res.Body.Close()

	etag := res.Header.Get("Etag")
	if etag == "" {
		t.Fatal("expected an ETag on the identity response")
	}

	if strings.HasPrefix(etag, "W/") {
		t.Errorf("Etag = %q, want a strong ETag (no W/ prefix) on identity response", etag)
	}
}

func TestSPAFallbackServesIndex(t *testing.T) {
	t.Parallel()

	handler := NewSPA(newTestFS())

	req := httptest.NewRequest(http.MethodGet, "/instances/42/databases", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	res := rec.Result()
	defer res.Body.Close()

	if res.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want 200", res.StatusCode)
	}

	body, err := io.ReadAll(res.Body)
	if err != nil {
		t.Fatalf("read body: %v", err)
	}

	if !strings.Contains(string(body), "id=\"root\"") {
		t.Errorf("fallback body does not look like index.html: %q", body)
	}
}

func TestSPAConditionalGet304(t *testing.T) {
	t.Parallel()

	handler := NewSPA(newTestFS())

	// First request: learn the ETag the file server assigns (identity).
	req := httptest.NewRequest(http.MethodGet, "/static/js/main.abc123.js", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	res := rec.Result()
	res.Body.Close()

	etag := res.Header.Get("Etag")
	if etag == "" {
		t.Fatal("expected an ETag so conditional GET can produce a 304")
	}

	// Second request with If-None-Match should yield 304 and no body, even
	// when gzip is accepted (304 has no body to compress).
	req2 := httptest.NewRequest(http.MethodGet, "/static/js/main.abc123.js", nil)
	req2.Header.Set("Accept-Encoding", "gzip")
	req2.Header.Set("If-None-Match", etag)

	rec2 := httptest.NewRecorder()
	handler.ServeHTTP(rec2, req2)

	res2 := rec2.Result()
	defer res2.Body.Close()

	if res2.StatusCode != http.StatusNotModified {
		t.Fatalf("status = %d, want 304", res2.StatusCode)
	}

	body, err := io.ReadAll(res2.Body)
	if err != nil {
		t.Fatalf("read 304 body: %v", err)
	}

	if len(body) != 0 {
		t.Errorf("304 response has body of %d bytes, want empty", len(body))
	}
	// A 304 must not claim a gzip Content-Encoding (there is no body).
	if enc := res2.Header.Get("Content-Encoding"); enc == gzipEncoding {
		t.Errorf("304 Content-Encoding = gzip, want none")
	}
}

// TestSPAIndexConditionalGet covers the no-cache revalidation case: index.html
// is served on every navigation, so a matching If-None-Match must short-circuit
// to a bodyless 304 rather than re-sending the document.
func TestSPAIndexConditionalGet(t *testing.T) {
	t.Parallel()

	handler := NewSPA(newTestFS())

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	res := rec.Result()
	res.Body.Close()

	etag := res.Header.Get("Etag")
	if etag == "" {
		t.Fatal("expected an ETag on index.html")
	}

	req2 := httptest.NewRequest(http.MethodGet, "/", nil)
	req2.Header.Set("If-None-Match", etag)

	rec2 := httptest.NewRecorder()
	handler.ServeHTTP(rec2, req2)

	res2 := rec2.Result()
	defer res2.Body.Close()

	if res2.StatusCode != http.StatusNotModified {
		t.Fatalf("status = %d, want 304", res2.StatusCode)
	}

	if got := res2.Header.Get("Cache-Control"); got != "no-cache" {
		t.Errorf("Cache-Control = %q, want no-cache on index revalidation", got)
	}
}

func TestSPAGzipSkipsRangeResponses(t *testing.T) {
	t.Parallel()

	handler := NewSPA(newTestFS())

	req := httptest.NewRequest(http.MethodGet, "/static/js/main.abc123.js", nil)
	req.Header.Set("Accept-Encoding", "gzip")
	req.Header.Set("Range", "bytes=0-15")

	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	res := rec.Result()
	defer res.Body.Close()

	if res.StatusCode != http.StatusPartialContent {
		t.Fatalf("status = %d, want 206", res.StatusCode)
	}

	if enc := res.Header.Get("Content-Encoding"); enc == gzipEncoding {
		t.Errorf("Content-Encoding = gzip, want identity for range response")
	}

	if got := res.Header.Get("Content-Range"); got == "" {
		t.Fatal("expected Content-Range on range response")
	}
}

// TestSPAGzipRefusedWithQZero ensures an explicit q=0 disables gzip even though
// the gzip token is present.
func TestSPAGzipRefusedWithQZero(t *testing.T) {
	t.Parallel()

	handler := NewSPA(newTestFS())

	req := httptest.NewRequest(http.MethodGet, "/static/js/main.abc123.js", nil)
	req.Header.Set("Accept-Encoding", "gzip;q=0")

	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	res := rec.Result()
	defer res.Body.Close()

	if enc := res.Header.Get("Content-Encoding"); enc == gzipEncoding {
		t.Errorf("Content-Encoding = gzip, want identity when gzip refused with q=0")
	}
}
