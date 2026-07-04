//go:build embed_frontend

package frontend

import (
	"embed"
	"io/fs"
)

//go:embed all:dist
var distEmbed embed.FS

// DistFS contains the frontend build output.
// Populated at compile time when building with -tags embed_frontend.
// The dist/ directory must exist under backend/frontend/ at build time.
var DistFS fs.FS

func init() {
	sub, err := fs.Sub(distEmbed, "dist")
	if err != nil {
		panic("frontend: " + err.Error())
	}
	DistFS = sub
}
