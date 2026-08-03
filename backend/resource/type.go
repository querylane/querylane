package resource

import (
	"strings"
	"unicode"
)

// Type is the canonical AIP resource type string used in resource annotations
// and rich error details.
type Type string

const (
	TypeInstance        Type = "console.querylane.dev/Instance"
	TypeRole            Type = "console.querylane.dev/Role"
	TypeDatabase        Type = "console.querylane.dev/Database"
	TypeSchema          Type = "console.querylane.dev/Schema"
	TypeTable           Type = "console.querylane.dev/Table"
	TypeView            Type = "console.querylane.dev/View"
	TypeViewDependency  Type = "console.querylane.dev/ViewDependency"
	TypeRunnerExecution Type = "console.querylane.dev/RunnerExecution"
	TypeReplica         Type = "console.querylane.dev/Replica"
	TypeCatalogSync     Type = "console.querylane.dev/CatalogSyncState"
	TypeMetricSample    Type = "console.querylane.dev/MetricSample"
)

// String returns the canonical resource type string.
func (t Type) String() string {
	return string(t)
}

// Kind returns the singular resource kind suffix, e.g. "Database".
func (t Type) Kind() string {
	kind := string(t)
	if idx := strings.LastIndex(kind, "/"); idx >= 0 && idx < len(kind)-1 {
		return kind[idx+1:]
	}

	return kind
}

// LowerKind returns the lowercase, human-readable singular kind, e.g. "view dependency".
func (t Type) LowerKind() string {
	kind := []rune(t.Kind())

	var display strings.Builder

	for index, char := range kind {
		if index > 0 && unicode.IsUpper(char) && (unicode.IsLower(kind[index-1]) || index+1 < len(kind) && unicode.IsLower(kind[index+1])) {
			display.WriteByte(' ')
		}

		display.WriteRune(unicode.ToLower(char))
	}

	return display.String()
}
