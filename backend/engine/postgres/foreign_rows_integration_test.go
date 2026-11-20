package postgres_test

import (
	"fmt"
	"time"

	"github.com/querylane/querylane/backend/engine"
	"github.com/querylane/querylane/backend/postgreserrors"
	api "github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1"
)

func (s *PostgresEngineIntegrationTestSuite) TestForeignRowsDoNotAdvertisePhysicalCellIdentity() {
	ctx := s.T().Context()
	db := s.getTestDBConnection()
	defer db.Close()
	_, err := db.ExecContext(ctx, fmt.Sprintf(`CREATE EXTENSION postgres_fdw;
 CREATE TABLE remote_source (id int, payload text);
 INSERT INTO remote_source VALUES (2, repeat('b',100)), (1, repeat('a',100));
 CREATE SERVER loopback FOREIGN DATA WRAPPER postgres_fdw OPTIONS (host '127.0.0.1', port '5432', dbname '%s');
 CREATE USER MAPPING FOR CURRENT_USER SERVER loopback OPTIONS (user 'testuser', password 'testpass');
 CREATE FOREIGN TABLE foreign_rows (id int, payload text) SERVER loopback OPTIONS (schema_name 'public', table_name 'remote_source');`, s.testDBName))
	s.Require().NoError(err)
	params := engine.ReadRowsParams{SchemaName: "public", TableName: "foreign_rows", PageSize: 1, MaxCellBytes: 5}
	first, err := s.eng.ReadRows(ctx, db, params)
	s.Require().NoError(err)
	s.Require().Len(first.Rows, 1)
	s.Equal(api.RowIdentity_SOURCE_UNSPECIFIED, first.RowIdentity.GetSource(), "a foreign relation has no local storage generation")
	s.Equal(int64(1), first.Rows[0].GetValues()[0].GetValue().GetInt64Value(), "fallback order must not depend on remote physical layout")
	cell := first.Rows[0].GetValues()[1]
	s.True(cell.GetTruncated())
	s.Empty(cell.GetFullValueToken(), "do not mint an unusable or stale-unsafe remote ctid token")
	s.Require().NotEmpty(first.NextPageToken)
	params.PageToken = first.NextPageToken
	next, err := s.eng.ReadRows(ctx, db, params)
	s.Require().NoError(err)
	s.Require().Len(next.Rows, 1)
	s.Equal(int64(2), next.Rows[0].GetValues()[0].GetValue().GetInt64Value())
	s.Empty(next.Rows[0].GetValues()[1].GetFullValueToken())
	s.Empty(next.NextPageToken)

	// A PostgreSQL19 remote view can invoke a write-capable function while
	// appearing to be a SELECT locally. The local read-only mode must reach
	// postgres_fdw's remote transaction, not only its SQL preflight.
	_, err = db.ExecContext(ctx, `CREATE TABLE remote_audit (n int);
 CREATE FUNCTION remote_side_effect() RETURNS int LANGUAGE plpgsql VOLATILE AS $$ BEGIN INSERT INTO public.remote_audit VALUES (1); RETURN 1; END $$;
 CREATE VIEW remote_view AS SELECT remote_side_effect() AS n;
 CREATE FOREIGN TABLE foreign_view (n int) SERVER loopback OPTIONS (schema_name 'public', table_name 'remote_view');`)
	s.Require().NoError(err)
	stream, queryErr := s.eng.ExecuteQuery(ctx, db, engine.ExecuteQueryParams{Statement: "SELECT * FROM foreign_view", Timeout: time.Second})
	if stream != nil {
		for stream.Next() {
		}
		queryErr = stream.Err()
		_ = stream.Close()
	}
	version, versionErr := s.eng.GetServerVersionNum(ctx, db)
	s.Require().NoError(versionErr)
	if version >= 190000 {
		s.Require().Error(queryErr)
		s.True(postgreserrors.IsCondition(queryErr, "read_only_sql_transaction"), "PostgreSQL 19 propagates local read-only mode to the remote transaction")
	} else {
		// Older postgres_fdw versions do not propagate READ ONLY. The engine
		// must still roll back its remote transaction when closing the stream.
		s.Require().NoError(queryErr)
	}
	var writes int
	s.Require().NoError(db.QueryRowContext(ctx, `SELECT count(*) FROM remote_audit`).Scan(&writes))
	s.Zero(writes)
	s.Require().NoError(db.PingContext(ctx))
}

func (s *PostgresEngineIntegrationTestSuite) TestHealthCheckDoesNotWarnAboutItsOwnProbeTransactions() {
	ctx := s.T().Context()
	db := s.getTestDBConnection()
	defer db.Close()
	for range 10 {
		health, err := s.eng.CheckInstanceHealth(ctx, db)
		s.Require().NoError(err)
		s.Require().NotNil(health.ConnectionActivity)
		s.Equal(engine.HealthStatusOK, health.ConnectionActivity.Status, health.ConnectionActivity.Summary)
	}
}

func (s *PostgresEngineIntegrationTestSuite) TestForeignRowPreviewAndFullPagesUseSameOrder() {
	ctx := s.T().Context()
	db := s.getTestDBConnection()
	defer db.Close()
	_, err := db.ExecContext(ctx, fmt.Sprintf(`CREATE EXTENSION postgres_fdw;
 CREATE TABLE source_rows (payload text, id int);
 INSERT INTO source_rows VALUES ('same_z', 1), ('same_a', 2), ('same_b', 3);
 CREATE SERVER loopback FOREIGN DATA WRAPPER postgres_fdw OPTIONS (host '127.0.0.1', port '5432', dbname '%s');
 CREATE USER MAPPING FOR CURRENT_USER SERVER loopback OPTIONS (user 'testuser', password 'testpass');
 CREATE FOREIGN TABLE foreign_rows (payload text, id int) SERVER loopback OPTIONS (schema_name 'public', table_name 'source_rows');`, s.testDBName))
	s.Require().NoError(err)

	for _, order := range []struct {
		name string
		by   []*api.RowOrder
	}{
		{"automatic tiebreakers", nil},
		{"explicit payload order", []*api.RowOrder{{Column: "payload"}}},
	} {
		s.Run(order.name, func() {
			for _, mode := range []api.CellValueMode{
				api.CellValueMode_CELL_VALUE_MODE_PREVIEW,
				api.CellValueMode_CELL_VALUE_MODE_FULL,
			} {
				params := engine.ReadRowsParams{
					SchemaName: "public", TableName: "foreign_rows", PageSize: 1,
					MaxCellBytes: 2, CellValueMode: mode, OrderBy: order.by,
				}
				ids := make([]int64, 0, 3)
				for range 3 {
					page, readErr := s.eng.ReadRows(ctx, db, params)
					s.Require().NoError(readErr)
					s.Require().Len(page.Rows, 1)
					s.Empty(page.RowIdentity.GetColumnNames())
					ids = append(ids, page.Rows[0].GetValues()[1].GetValue().GetInt64Value())
					params.PageToken = page.NextPageToken
					if len(ids) < 3 {
						s.Require().NotEmpty(params.PageToken)
					}
				}
				s.Empty(params.PageToken)
				s.Equal([]int64{2, 3, 1}, ids, "order must use the full payload, independent of preview truncation: %s", mode)
			}
		})
	}
}
