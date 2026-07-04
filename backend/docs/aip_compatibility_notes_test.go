package docs

import (
	"os"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"
	"testing"
)

func TestAIPCompatibilityNotesIssue170Acceptance(t *testing.T) {
	t.Parallel()

	note := readAIPCompatibilityNote(t)

	for _, check := range aipCompatibilityNoteChecks() {
		t.Run(check.name, func(t *testing.T) {
			t.Parallel()

			if !strings.Contains(note, check.snippet) {
				t.Fatalf("compatibility note missing %q", check.snippet)
			}
		})
	}
}

func TestAIPCompatibilityNotesReferenceExistingProtoSources(t *testing.T) {
	t.Parallel()

	protoPaths := aipCompatibilityProtoReferences(t, readAIPCompatibilityNote(t))
	if len(protoPaths) == 0 {
		t.Fatal("compatibility note should reference at least one proto source")
	}

	for _, protoPath := range protoPaths {
		t.Run(protoPath, func(t *testing.T) {
			t.Parallel()

			fullPath := filepath.Join(repositoryRoot(t), protoPath)
			if _, err := os.Stat(fullPath); err != nil {
				t.Fatalf("stat referenced proto source: %v", err)
			}
		})
	}
}

type compatibilityNoteCheck struct {
	name    string
	snippet string
}

func aipCompatibilityNoteChecks() []compatibilityNoteCheck {
	return []compatibilityNoteCheck{
		{name: "issue anchor", snippet: "<!-- aip-source:issue-170 -->"},
		{name: "proto scope anchor", snippet: "<!-- aip-scope:proto-querylane -->"},
		{name: "wrapper response anchor", snippet: "<!-- aip-exception:wrapper-responses -->"},
		{name: "identifier annotation anchor", snippet: "<!-- aip-exception:output-only-identifier-names -->"},
		{name: "migration debt anchor", snippet: "<!-- aip-classification:migration-debt -->"},
		{name: "create instance anchor", snippet: "<!-- aip-exception:create-instance-spec -->"},
		{name: "permanent exception anchor", snippet: "<!-- aip-classification:permanent-v1alpha1-exception -->"},
		{name: "table data anchor", snippet: "<!-- aip-exception:custom-table-data-rpcs -->"},
		{name: "table metadata anchor", snippet: "<!-- aip-exception:bounded-table-metadata-lists -->"},
		{name: "operational surfaces anchor", snippet: "<!-- aip-exception:operational-surfaces -->"},
		{name: "pagination boundary anchor", snippet: "<!-- aip-boundary:pagination-pr -->"},
		{name: "generated files guardrail", snippet: "<!-- aip-guardrail:generated-files -->"},
	}
}

func aipCompatibilityProtoReferences(t *testing.T, note string) []string {
	t.Helper()

	protoPathPattern := regexp.MustCompile("`(proto/querylane/[^`]+\\.proto)`")
	matches := protoPathPattern.FindAllStringSubmatch(note, -1)
	seen := make(map[string]struct{}, len(matches))
	paths := make([]string, 0, len(matches))

	for _, match := range matches {
		path := match[1]
		if _, ok := seen[path]; ok {
			continue
		}

		seen[path] = struct{}{}
		paths = append(paths, path)
	}

	return paths
}

func readAIPCompatibilityNote(t *testing.T) string {
	t.Helper()

	contents, err := os.ReadFile(filepath.Join(repositoryRoot(t), "docs", "aip-compatibility.md"))
	if err != nil {
		t.Fatalf("read compatibility note: %v", err)
	}

	return string(contents)
}

func repositoryRoot(t *testing.T) string {
	t.Helper()

	_, filename, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("resolve current test file")
	}

	return filepath.Clean(filepath.Join(filepath.Dir(filename), "..", ".."))
}
