package postgres

import (
	"context"
	"testing"

	"github.com/jackc/pgerrcode"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/querylane/querylane/backend/aip"
	"github.com/querylane/querylane/backend/engine"
)

func TestAIPSQLListQueriesClassifyPostgresSQLErrors(t *testing.T) {
	t.Parallel()

	db := openTableMetadataErrorDB(t, &pgconn.PgError{
		Code:     pgerrcode.InsufficientPrivilege,
		Severity: "ERROR",
	})
	defer db.Close()

	_, _, err := (&Postgres{}).ListDatabases(context.Background(), db, aip.Params{})

	require.ErrorIs(t, err, engine.ErrQueryPermissionDenied)

	var pgErr *engine.PostgresSQLError
	require.ErrorAs(t, err, &pgErr)
	assert.Equal(t, engine.PostgresSQLKindPermissionDenied, pgErr.Kind)
	assert.Equal(t, pgerrcode.InsufficientPrivilege, pgErr.SQLState)
	assert.Equal(t, "list databases", pgErr.Operation)
}
