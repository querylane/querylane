package postgres

import (
	"context"
	"testing"

	"github.com/jackc/pgerrcode"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/querylane/querylane/backend/aip"
	"github.com/querylane/querylane/backend/postgreserrors"
)

func TestAIPSQLListQueriesClassifyPostgresSQLErrors(t *testing.T) {
	t.Parallel()

	db := openTableMetadataErrorDB(t, &pgconn.PgError{
		Code:     pgerrcode.InsufficientPrivilege,
		Severity: "ERROR",
	})
	defer db.Close()

	_, _, err := (&Postgres{}).ListDatabases(context.Background(), db, aip.Params{})

	var pgErr *postgreserrors.Error
	require.ErrorAs(t, err, &pgErr)
	assert.Equal(t, postgreserrors.KindPermissionDenied, pgErr.Classification().Kind)
	assert.Equal(t, pgerrcode.InsufficientPrivilege, pgErr.Classification().SQLState)
	assert.Equal(t, "list databases", pgErr.Operation())
}
