package resource

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestTypeString(t *testing.T) {
	t.Parallel()

	assert.Equal(t, "console.querylane.dev/Instance", TypeInstance.String())
	assert.Equal(t, "console.querylane.dev/View", TypeView.String())
}

func TestTypeKind(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name  string
		typ   Type
		want  string
		lower string
	}{
		{name: "instance", typ: TypeInstance, want: "Instance", lower: "instance"},
		{name: "role", typ: TypeRole, want: "Role", lower: "role"},
		{name: "database", typ: TypeDatabase, want: "Database", lower: "database"},
		{name: "schema", typ: TypeSchema, want: "Schema", lower: "schema"},
		{name: "table", typ: TypeTable, want: "Table", lower: "table"},
		{name: "view", typ: TypeView, want: "View", lower: "view"},
		{name: "no slash returns whole string", typ: Type("Custom"), want: "Custom", lower: "custom"},
		{name: "trailing slash returns whole string", typ: Type("domain/"), want: "domain/", lower: "domain/"},
		{name: "empty", typ: Type(""), want: "", lower: ""},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			assert.Equal(t, tt.want, tt.typ.Kind())
			assert.Equal(t, tt.lower, tt.typ.LowerKind())
		})
	}
}
