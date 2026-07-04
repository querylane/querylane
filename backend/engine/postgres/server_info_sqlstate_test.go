package postgres

import (
	"context"
	"testing"

	"github.com/jackc/pgerrcode"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/querylane/querylane/backend/engine"
)

func TestGetServerInfoClassifiesPostgresSQLErrors(t *testing.T) {
	t.Parallel()

	db := openTableMetadataErrorDB(t, &pgconn.PgError{
		Code:     pgerrcode.InsufficientPrivilege,
		Severity: "ERROR",
	})
	defer db.Close()

	_, err := (&Postgres{}).GetServerInfo(context.Background(), db)

	require.ErrorIs(t, err, engine.ErrQueryPermissionDenied)

	var pgErr *engine.PostgresSQLError
	require.ErrorAs(t, err, &pgErr)
	assert.Equal(t, engine.PostgresSQLKindPermissionDenied, pgErr.Kind)
	assert.Equal(t, pgerrcode.InsufficientPrivilege, pgErr.SQLState)
	assert.Equal(t, "query server info", pgErr.Operation)
}
