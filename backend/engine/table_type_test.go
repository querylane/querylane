package engine

import (
	"testing"

	"github.com/stretchr/testify/require"

	api "github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1"
)

func TestParseTableType(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name  string
		input string
		want  api.Table_TableType
	}{
		{name: "canonical base table", input: "TABLE_TYPE_BASE_TABLE", want: api.Table_TABLE_TYPE_BASE_TABLE},
		{name: "canonical partitioned table", input: "TABLE_TYPE_PARTITIONED", want: api.Table_TABLE_TYPE_PARTITIONED},
		{name: "canonical external table", input: "TABLE_TYPE_EXTERNAL", want: api.Table_TABLE_TYPE_EXTERNAL},
		{name: "canonical temporary table", input: "TABLE_TYPE_TEMPORARY", want: api.Table_TABLE_TYPE_TEMPORARY},
		{name: "legacy information schema base table", input: "BASE TABLE", want: api.Table_TABLE_TYPE_BASE_TABLE},
		{name: "legacy base table fallback", input: "BASE_TABLE", want: api.Table_TABLE_TYPE_BASE_TABLE},
		{name: "legacy foreign table", input: "FOREIGN", want: api.Table_TABLE_TYPE_EXTERNAL},
		{name: "legacy temporary table", input: "LOCAL TEMPORARY", want: api.Table_TABLE_TYPE_TEMPORARY},
		{name: "unknown", input: "WEIRD", want: api.Table_TABLE_TYPE_UNSPECIFIED},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			require.Equal(t, tt.want, ParseTableType(tt.input))
		})
	}
}
