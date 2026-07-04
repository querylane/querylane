package postgres

import (
	"context"
	"database/sql"
	"database/sql/driver"
	"errors"
	"fmt"
	"sync/atomic"
	"testing"

	"github.com/jackc/pgerrcode"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/querylane/querylane/backend/engine"
)

type tableMetadataErrorDriver struct{ err error }

type tableMetadataErrorConn struct{ err error }

var tableMetadataErrorDriverSeq atomic.Int64

func openTableMetadataErrorDB(t *testing.T, err error) *sql.DB {
	t.Helper()

	name := fmt.Sprintf("querylane_table_metadata_error_%d", tableMetadataErrorDriverSeq.Add(1))
	sql.Register(name, &tableMetadataErrorDriver{err: err})
	db, openErr := sql.Open(name, "")
	require.NoError(t, openErr)
	db.SetMaxOpenConns(1)

	return db
}

func (d *tableMetadataErrorDriver) Open(string) (driver.Conn, error) {
	return &tableMetadataErrorConn{err: d.err}, nil
}

func (c *tableMetadataErrorConn) Prepare(string) (driver.Stmt, error) {
	return nil, errors.New("prepare unsupported")
}

func (c *tableMetadataErrorConn) Close() error { return nil }
func (c *tableMetadataErrorConn) Begin() (driver.Tx, error) {
	return nil, errors.New("transactions unsupported")
}

func (c *tableMetadataErrorConn) QueryContext(context.Context, string, []driver.NamedValue) (driver.Rows, error) {
	return nil, c.err
}

func TestTableMetadataLiveQueriesClassifyPostgresSQLErrors(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name   string
		op     string
		invoke func(context.Context, *Postgres, *sql.DB) error
	}{
		{
			name: "partition metadata",
			op:   "query table partition metadata",
			invoke: func(ctx context.Context, pg *Postgres, db *sql.DB) error {
				_, err := pg.GetTablePartitionMetadata(ctx, db, "public", "secret")

				return err
			},
		},
		{
			name: "columns",
			op:   "query table columns",
			invoke: func(ctx context.Context, pg *Postgres, db *sql.DB) error {
				_, err := pg.ListTableColumns(ctx, db, "public", "secret")

				return err
			},
		},
		{
			name: "constraints",
			op:   "query table constraints",
			invoke: func(ctx context.Context, pg *Postgres, db *sql.DB) error {
				_, err := pg.ListTableConstraints(ctx, db, "public", "secret")

				return err
			},
		},
		{
			name: "indexes",
			op:   "query table indexes",
			invoke: func(ctx context.Context, pg *Postgres, db *sql.DB) error {
				_, err := pg.ListTableIndexes(ctx, db, "public", "secret")

				return err
			},
		},
		{
			name: "policies",
			op:   "query table policies",
			invoke: func(ctx context.Context, pg *Postgres, db *sql.DB) error {
				_, err := pg.ListTablePolicies(ctx, db, "public", "secret")

				return err
			},
		},
		{
			name: "triggers",
			op:   "query table triggers",
			invoke: func(ctx context.Context, pg *Postgres, db *sql.DB) error {
				_, err := pg.ListTableTriggers(ctx, db, "public", "secret")

				return err
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			db := openTableMetadataErrorDB(t, &pgconn.PgError{
				Code:       pgerrcode.InsufficientPrivilege,
				Severity:   "ERROR",
				SchemaName: "public",
				TableName:  "secret",
			})
			defer db.Close()

			err := tt.invoke(context.Background(), &Postgres{}, db)
			require.ErrorIs(t, err, engine.ErrQueryPermissionDenied)

			var pgErr *engine.PostgresSQLError
			require.ErrorAs(t, err, &pgErr)
			assert.Equal(t, engine.PostgresSQLKindPermissionDenied, pgErr.Kind)
			assert.Equal(t, pgerrcode.InsufficientPrivilege, pgErr.SQLState)
			assert.Equal(t, tt.op, pgErr.Operation)
			assert.Equal(t, "public", pgErr.SafeFields["schema_name"])
			assert.Equal(t, "secret", pgErr.SafeFields["table_name"])
		})
	}
}
