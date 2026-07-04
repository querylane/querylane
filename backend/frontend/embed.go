//go:build !embed_frontend

package frontend

import "io/fs"

// DistFS is nil when the frontend is not embedded.
// Build with -tags embed_frontend to embed the frontend dist directory.
var DistFS fs.FS
