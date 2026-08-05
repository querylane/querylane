package apicompliance

import (
	"fmt"
	"testing"

	"buf.build/go/protovalidate"
	"github.com/stretchr/testify/require"

	api "github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1"
)

func TestTableDataProjectionSupportsPostgresColumnLimit(t *testing.T) {
	t.Parallel()

	columns := make([]string, 1600)
	for i := range columns {
		columns[i] = fmt.Sprintf("column_%d", i)
	}

	readRows := &api.ReadRowsRequest{
		Name:            "instances/test/databases/app/schemas/public/tables/wide_table",
		SelectedColumns: columns,
	}
	streamRows := &api.StreamRowsRequest{
		Name:            readRows.GetName(),
		SelectedColumns: columns,
	}

	require.NoError(t, protovalidate.Validate(readRows))
	require.NoError(t, protovalidate.Validate(streamRows))

	tooManyColumns := make([]string, len(columns)+1)
	copy(tooManyColumns, columns)
	tooManyColumns[len(columns)] = "column_1600"
	require.Error(t, protovalidate.Validate(&api.ReadRowsRequest{
		Name:            readRows.GetName(),
		SelectedColumns: tooManyColumns,
	}))
	require.Error(t, protovalidate.Validate(&api.StreamRowsRequest{
		Name:            readRows.GetName(),
		SelectedColumns: tooManyColumns,
	}))
}
