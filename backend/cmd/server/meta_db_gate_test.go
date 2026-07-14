package server

import (
	"context"
	"database/sql"
	"database/sql/driver"
	"testing"

	"connectrpc.com/connect"
	"github.com/jackc/pgerrcode"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type metaDBErrorConnector struct {
	err error
}

func (c metaDBErrorConnector) Connect(context.Context) (driver.Conn, error) {
	return nil, c.err
}

func (metaDBErrorConnector) Driver() driver.Driver { return stubDriver{} }

func TestMetaDBGateRedactsPostgresServerFields(t *testing.T) {
	t.Parallel()

	pgErr := &pgconn.PgError{
		Code:    pgerrcode.InvalidPassword,
		Message: "password for meta_user contains api_key=secret",
	}
	db := sql.OpenDB(metaDBErrorConnector{err: pgErr})

	t.Cleanup(func() { require.NoError(t, db.Close()) })

	err := newMetaDBGate(db).EnsureAvailable(t.Context())

	assert.Equal(t, connect.CodeUnavailable, connect.CodeOf(err))
	assert.Contains(t, err.Error(), pgerrcode.InvalidPassword)
	assert.NotContains(t, err.Error(), "meta_user")
	assert.NotContains(t, err.Error(), "api_key=secret")
}
