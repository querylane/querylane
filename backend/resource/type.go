package resource

import "strings"

// Type is the canonical AIP resource type string used in resource annotations
// and rich error details.
type Type string

const (
	TypeInstance Type = "console.querylane.dev/Instance"
	TypeRole     Type = "console.querylane.dev/Role"
	TypeDatabase Type = "console.querylane.dev/Database"
	TypeSchema   Type = "console.querylane.dev/Schema"
	TypeTable    Type = "console.querylane.dev/Table"
	TypeView     Type = "console.querylane.dev/View"
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

// LowerKind returns the lowercase singular kind, e.g. "database".
func (t Type) LowerKind() string {
	return strings.ToLower(t.Kind())
}
