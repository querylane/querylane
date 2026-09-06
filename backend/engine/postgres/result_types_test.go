package postgres

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/querylane/querylane/backend/engine"
	api "github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1"
)

func TestExecuteQueryResultTypeNames(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name         string
		driverName   string
		wantRawType  string
		wantDataType api.DataType
	}{
		{name: "pgx name is lower-cased", driverName: "INT8", wantRawType: "int8", wantDataType: api.DataType_DATA_TYPE_INTEGER},
		{name: "pgx array spelling becomes SQL spelling", driverName: "_TEXT", wantRawType: "text[]", wantDataType: api.DataType_DATA_TYPE_ARRAY},
		{name: "built-in OID missing from pgx is named", driverName: "24", wantRawType: "regproc", wantDataType: api.DataType_DATA_TYPE_UNKNOWN},
		{name: "built-in array OID is named", driverName: "2210", wantRawType: "regclass[]", wantDataType: api.DataType_DATA_TYPE_ARRAY},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			db, state := openExecuteQueryFakeDB(t, 1)
			defer db.Close()

			state.typeName = tt.driverName

			stream, err := (&Postgres{}).ExecuteQuery(context.Background(), db, engine.ExecuteQueryParams{Statement: "select n", Timeout: time.Second})
			require.NoError(t, err)
			defer stream.Close()

			columns := stream.Columns()
			require.Len(t, columns, 1)
			require.Equal(t, tt.wantRawType, columns[0].GetRawType())
			require.Equal(t, tt.wantDataType, columns[0].GetDataType())
		})
	}
}

func TestDisplayTypeName(t *testing.T) {
	t.Parallel()

	tests := []struct {
		in        string
		wantName  string
		wantArray bool
	}{
		{in: "int4", wantName: "int4", wantArray: false},
		{in: "_int4", wantName: "int4[]", wantArray: true},
		{in: "crm.customer_status[]", wantName: "crm.customer_status[]", wantArray: true},
		{in: "_", wantName: "_", wantArray: false},
	}

	for _, tt := range tests {
		t.Run(tt.in, func(t *testing.T) {
			t.Parallel()

			name, isArray := displayTypeName(tt.in)
			require.Equal(t, tt.wantName, name)
			require.Equal(t, tt.wantArray, isArray)
		})
	}
}
