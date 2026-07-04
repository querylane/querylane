package embeddedpg

import (
	"fmt"
	"os"
	"path/filepath"
)

// runtimeDir returns the path for PostgreSQL runtime files (Unix sockets, etc.)
// and creates it if it does not exist. The runtime dir is a sibling of the data
// directory to avoid interfering with data persistence.
func runtimeDir(dataPath string) (string, error) {
	dir := filepath.Join(filepath.Dir(dataPath), "pgruntime")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", fmt.Errorf("create runtime directory: %w", err)
	}

	return dir, nil
}
