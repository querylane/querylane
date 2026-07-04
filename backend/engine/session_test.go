package engine

import (
	"context"
	"database/sql"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/querylane/querylane/backend/aip"
)

type stubInstanceCatalogDriver struct {
	listDatabasesDB *sql.DB
}

func (d *stubInstanceCatalogDriver) ListDatabases(_ context.Context, db *sql.DB, _ aip.Params) ([]Database, string, error) {
	d.listDatabasesDB = db
	return []Database{{Name: "appdb"}}, "next", nil
}

func (d *stubInstanceCatalogDriver) GetDatabase(_ context.Context, _ *sql.DB, databaseName string) (*Database, error) {
	return &Database{Name: databaseName}, nil
}

func (d *stubInstanceCatalogDriver) ListRoles(context.Context, *sql.DB, aip.Params) ([]Role, string, error) {
	return nil, "", assert.AnError
}

func (d *stubInstanceCatalogDriver) GetRole(context.Context, *sql.DB, string) (*Role, error) {
	return nil, assert.AnError
}

type stubQueryDriver struct {
	executeDB     *sql.DB
	executeParams ExecuteQueryParams
}

func (d *stubQueryDriver) ExecuteQuery(_ context.Context, db *sql.DB, params ExecuteQueryParams) (ExecuteQueryStream, error) {
	d.executeDB = db
	d.executeParams = params

	return nil, nil //nolint:nilnil // stream value irrelevant; test asserts seam routing
}

func (d *stubQueryDriver) ExplainQuery(context.Context, *sql.DB, ExplainQueryParams) (*ExplainQueryResult, error) {
	return nil, assert.AnError
}

func (d *stubQueryDriver) GetDatabaseQueryInsights(context.Context, *sql.DB) (*DatabaseQueryInsights, error) {
	return nil, assert.AnError
}

func TestInstanceSessionUsesInstanceCatalogDriverForDatabaseCatalog(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name string
	}{
		{name: "list databases delegates to instance catalog"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			db := &sql.DB{}
			catalog := &stubInstanceCatalogDriver{}
			session := &instanceSession{db: db, instanceCatalogDriver: catalog}

			databases, token, err := session.ListDatabases(context.Background(), aip.Params{})
			require.NoError(t, err)

			assert.Equal(t, []Database{{Name: "appdb"}}, databases)
			assert.Equal(t, "next", token)
			assert.Same(t, db, catalog.listDatabasesDB)
		})
	}
}

func TestDatabaseSessionUsesQueryDriverForExecuteQuery(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name   string
		params ExecuteQueryParams
	}{
		{name: "execute query delegates to query driver", params: ExecuteQueryParams{Statement: "SELECT 1"}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			db := &sql.DB{}
			query := &stubQueryDriver{}
			session := &databaseSession{db: db, queryDriver: query}

			stream, err := session.ExecuteQuery(context.Background(), tt.params)
			require.NoError(t, err)

			assert.Nil(t, stream)
			assert.Same(t, db, query.executeDB)
			assert.Equal(t, tt.params, query.executeParams)
		})
	}
}
