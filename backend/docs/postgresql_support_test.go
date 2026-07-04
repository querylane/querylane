package docs

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestPostgreSQLSupportDocsMentionPG17MaintainPrivilege(t *testing.T) {
	t.Parallel()

	note, err := os.ReadFile(filepath.Join(repositoryRoot(t), "docs", "server-side-filtering.md"))
	if err != nil {
		t.Fatalf("read server-side filtering docs: %v", err)
	}

	text := string(note)
	for _, snippet := range []string{
		"PostgreSQL 17 `MAINTAIN`",
		"direct role grants",
		"PUBLIC grants",
		"default privileges",
		"`privilege = \"MAINTAIN\"`",
	} {
		if !strings.Contains(text, snippet) {
			t.Fatalf("server-side filtering docs missing %q", snippet)
		}
	}
}
