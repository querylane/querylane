package postgres_test

import (
	"fmt"
	"net/url"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"

	"github.com/querylane/querylane/backend/engine"
	"github.com/querylane/querylane/backend/engine/postgres"
	"github.com/querylane/querylane/backend/postgreserrors"
	api "github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1"
	"github.com/querylane/querylane/backend/storage"
)

func (s *PostgresEngineIntegrationTestSuite) TestIncludedColumnsAreNotKeys() {
	ctx := s.T().Context()
	db := s.getTestDBConnection()
	defer db.Close()
	_, err := db.ExecContext(ctx, `CREATE TABLE covering_keys (id int, payload text, email text);
 ALTER TABLE covering_keys ADD PRIMARY KEY (id) INCLUDE (payload);
 CREATE UNIQUE INDEX covering_email ON covering_keys (email) INCLUDE (payload);
 INSERT INTO covering_keys VALUES (1, NULL, 'one'), (2, 'two', 'two');`)
	s.Require().NoError(err)
	cols, err := s.eng.ListTableColumns(ctx, db, "public", "covering_keys")
	s.Require().NoError(err)
	s.Require().Len(cols, 3)
	s.True(cols[0].IsPrimaryKey)
	s.False(cols[1].IsPrimaryKey, "INCLUDE payload is not a primary key")
	s.False(cols[1].IsUnique, "INCLUDE payload is not unique")
	s.True(cols[2].IsUnique)
	page, err := s.eng.ReadRows(ctx, db, engine.ReadRowsParams{SchemaName: "public", TableName: "covering_keys", PageSize: 1})
	s.Require().NoError(err)
	s.Equal([]string{"id"}, page.RowIdentity.GetColumnNames())
	s.Equal(api.PaginationStrategy_PAGINATION_STRATEGY_KEYSET, page.PaginationStrategy)
	s.Require().NotEmpty(page.NextPageToken)
	next, err := s.eng.ReadRows(ctx, db, engine.ReadRowsParams{SchemaName: "public", TableName: "covering_keys", PageSize: 1, PageToken: page.NextPageToken})
	s.Require().NoError(err)
	s.Require().Len(next.Rows, 1)
	s.Equal(int64(2), next.Rows[0].GetValues()[0].GetValue().GetInt64Value())
}

func (s *PostgresEngineIntegrationTestSuite) TestPostgres19IdentifierTypesRoundTrip() {
	ctx := s.T().Context()
	db := s.getTestDBConnection()
	defer db.Close()
	version, err := s.eng.GetServerVersionNum(ctx, db)
	s.Require().NoError(err)
	if version < 190000 {
		s.T().Skip("oid8 and regdatabase require PostgreSQL 19")
	}
	_, err = db.ExecContext(ctx, `CREATE TABLE unsigned_keys (id oid8 PRIMARY KEY, ids oid8[], payload text);
 INSERT INTO unsigned_keys VALUES ('0', ARRAY['0'::oid8, '18446744073709551615'::oid8], repeat('a', 100)),
 ('9223372036854775808', NULL, repeat('b', 100)), ('18446744073709551615', NULL, repeat('c', 100));`)
	s.Require().NoError(err)
	_, err = db.ExecContext(ctx, `ALTER TABLE unsigned_keys ADD db regdatabase; UPDATE unsigned_keys SET db = current_database()::regdatabase;`)
	s.Require().NoError(err)
	var token string
	for _, want := range []string{"0", "9223372036854775808", "18446744073709551615"} {
		page, readErr := s.eng.ReadRows(ctx, db, engine.ReadRowsParams{SchemaName: "public", TableName: "unsigned_keys", PageSize: 1, PageToken: token, MaxCellBytes: 5})
		s.Require().NoError(readErr)
		s.Require().Len(page.Rows, 1)
		s.Equal(api.DataType_DATA_TYPE_INTEGER, page.Columns[0].GetDataType())
		s.Equal(want, page.Rows[0].GetValues()[0].GetValue().GetNumericValue())
		dbCell, dbErr := s.eng.ReadCellValue(ctx, db, engine.ReadCellValueParams{SchemaName: "public", TableName: "unsigned_keys", Column: "db", RowIdentity: page.RowIdentity, IdentityValues: []*api.TableValue{page.Rows[0].GetValues()[0].GetValue()}})
		s.Require().NoError(dbErr)
		s.Equal(s.testDBName, dbCell.Cell.GetValue().GetStringValue())
		full, cellErr := s.eng.ReadCellValue(ctx, db, engine.ReadCellValueParams{SchemaName: "public", TableName: "unsigned_keys", Column: "payload", RowIdentity: page.RowIdentity, IdentityValues: []*api.TableValue{page.Rows[0].GetValues()[0].GetValue()}})
		s.Require().NoError(cellErr)
		s.Len(full.Cell.GetValue().GetStringValue(), 100)
		token = page.NextPageToken
	}
	s.Empty(token)
	stream, err := s.eng.ExecuteQuery(ctx, db, engine.ExecuteQueryParams{Statement: `SELECT '18446744073709551615'::oid8, NULL::oid8, ARRAY['18446744073709551615'::oid8], current_database()::regdatabase`, Timeout: 5 * time.Second})
	s.Require().NoError(err)
	defer stream.Close()
	s.Require().True(stream.Next())
	s.Equal("oid8", stream.Columns()[0].GetRawType())
	values := stream.Row().GetValues()
	s.Equal("18446744073709551615", values[0].GetValue().GetNumericValue())
	s.IsType(&api.TableValue_NullValue{}, values[1].GetValue().GetKind())
	s.Equal("{18446744073709551615}", values[2].GetValue().GetStringValue())
	s.Equal(s.testDBName, values[3].GetValue().GetStringValue())
	s.False(stream.Next())
	s.NoError(stream.Err())
}

func (s *PostgresEngineIntegrationTestSuite) TestQueryInsightsFindsExtensionOutsideSearchPath() {
	ctx := s.T().Context()
	db := s.getTestDBConnection()
	defer db.Close()
	_, err := db.ExecContext(ctx, `CREATE SCHEMA "stats schema"; CREATE EXTENSION pg_stat_statements SCHEMA "stats schema";`)
	s.Require().NoError(err)
	// Also works when installed but not preloaded: table statistics survive,
	// while query statistics are explicitly unavailable rather than zero.
	insights, err := s.eng.GetDatabaseQueryInsights(ctx, db)
	s.Require().NoError(err)
	s.True(insights.TableStatsAvailable)
	var preloaded bool
	s.Require().NoError(db.QueryRowContext(ctx, `SELECT position('pg_stat_statements' IN current_setting('shared_preload_libraries')) > 0`).Scan(&preloaded))
	s.Equal(preloaded, insights.QueryStatsAvailable)
	if !preloaded {
		s.NotEmpty(insights.PartialErrors)
	}
}

func (s *PostgresEngineIntegrationTestSuite) TestPhysicalIdentitiesRejectRewritesAndUpdates() {
	ctx := s.T().Context()
	db := s.getTestDBConnection()
	defer db.Close()
	tokens, err := engine.NewRandomTokenCodec()
	s.Require().NoError(err)
	pg := postgres.New(tokens)
	_, err = db.ExecContext(ctx, `CREATE TABLE physical_rows (n int, payload text);
 INSERT INTO physical_rows VALUES (2, repeat('b',100)), (1, repeat('a',100));
 CREATE INDEX physical_order ON physical_rows (n);`)
	s.Require().NoError(err)
	params := engine.ReadRowsParams{SchemaName: "public", TableName: "physical_rows", PageSize: 1, MaxCellBytes: 5}
	page, err := pg.ReadRows(ctx, db, params)
	s.Require().NoError(err)
	s.Require().NotEmpty(page.NextPageToken)
	var payload api.TableCellFullValueTokenPayload
	s.Require().NoError(tokens.Verify(engine.TokenKindFullValueCell, page.Rows[0].GetValues()[1].GetFullValueToken(), &payload))
	cellParams := engine.ReadCellValueParams{SchemaName: "public", TableName: "physical_rows", Column: "payload", RowIdentity: payload.GetRowIdentity(), IdentityValues: payload.GetIdentityValues()}
	full, err := pg.ReadCellValue(ctx, db, cellParams)
	s.Require().NoError(err)
	s.Equal(strings.Repeat("b", 100), full.Cell.GetValue().GetStringValue())
	// Rewriting swaps the rows' ctids while preserving xmin (both were inserted
	// in the same transaction). A bare ctid or ctid+xmin would read the wrong row.
	rewrite := "CLUSTER physical_rows USING physical_order"
	version, versionErr := pg.GetServerVersionNum(ctx, db)
	s.Require().NoError(versionErr)
	if version >= 190000 {
		rewrite = "REPACK physical_rows USING INDEX physical_order"
		// Validate the new maintenance syntax through Parse/Describe without
		// executing it; the cell token must still resolve to the original row.
		validated, validateErr := pg.ValidateQuery(ctx, db, engine.ValidateQueryParams{Statement: rewrite, Timeout: time.Second})
		s.Require().NoError(validateErr)
		s.Nil(validated.Diagnostic)
		_, cellErr := pg.ReadCellValue(ctx, db, cellParams)
		s.Require().NoError(cellErr)
	}
	_, err = db.ExecContext(ctx, rewrite)
	s.Require().NoError(err)
	_, err = pg.ReadCellValue(ctx, db, cellParams)
	s.Require().ErrorIs(err, engine.ErrInvalidPageToken)
	params.PageToken = page.NextPageToken
	_, err = pg.ReadRows(ctx, db, params)
	s.Require().ErrorIs(err, engine.ErrInvalidPageToken)
	params.PageToken = ""
	page, err = pg.ReadRows(ctx, db, params)
	s.Require().NoError(err)
	s.Require().NoError(tokens.Verify(engine.TokenKindFullValueCell, page.Rows[0].GetValues()[1].GetFullValueToken(), &payload))
	cellParams.RowIdentity = payload.GetRowIdentity()
	cellParams.IdentityValues = payload.GetIdentityValues()
	_, err = db.ExecContext(ctx, `UPDATE physical_rows SET payload = repeat('c',100) WHERE n = 1`)
	s.Require().NoError(err)
	_, err = pg.ReadCellValue(ctx, db, cellParams)
	s.Require().ErrorIs(err, engine.ErrInvalidPageToken)
}

func (s *PostgresEngineIntegrationTestSuite) TestPostgres19StartupWarningsAndAuthentication() {
	ctx := s.T().Context()
	version, err := s.eng.GetServerVersionNum(ctx, s.db)
	s.Require().NoError(err)
	if version < 190000 {
		s.T().Skip("startup expiration warnings require PostgreSQL 19")
	}
	_, err = s.db.ExecContext(ctx, fmt.Sprintf(`CREATE ROLE compat_expiry LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD 'testpass' VALID UNTIL '%s'`, time.Now().Add(24*time.Hour).UTC().Format(time.RFC3339)))
	s.Require().NoError(err)
	defer func() { _, _ = s.db.ExecContext(ctx, `DROP ROLE compat_expiry`) }()
	dsn, err := s.container.ConnectionString(ctx)
	s.Require().NoError(err)
	parsed, err := url.Parse(dsn)
	s.Require().NoError(err)
	parsed.User = url.UserPassword("compat_expiry", "testpass")
	db, err := engine.OpenPostgresDB(parsed.String())
	s.Require().NoError(err)
	defer db.Close()
	db.SetMaxOpenConns(1)
	first := s.executeQueryStats(ctx, db, "SELECT 1")
	s.Contains(strings.Join(first.Notices, "\n"), "expire")
	second := s.executeQueryStats(ctx, db, "SELECT 1")
	s.Empty(second.Notices, "startup warnings must not leak into pooled requests")
	parsed.User = url.UserPassword("compat_expiry", "wrong-password")
	wrong, err := engine.OpenPostgresDB(parsed.String())
	s.Require().NoError(err)
	defer wrong.Close()
	err = wrong.PingContext(ctx)
	var pgErr *pgconn.PgError
	s.Require().ErrorAs(err, &pgErr)
	s.Equal("28P01", pgErr.Code)
}

func (s *PostgresEngineIntegrationTestSuite) TestRestrictedAndMonitoringLoginsRespectRLS() {
	ctx := s.T().Context()
	db := s.getTestDBConnection()
	defer db.Close()
	_, err := db.ExecContext(ctx, `CREATE ROLE compat_owner NOLOGIN;
 CREATE ROLE compat_reader LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD 'testpass';
 CREATE ROLE compat_monitor LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD 'testpass';
 GRANT pg_read_all_stats TO compat_monitor;
 CREATE TABLE visible_rows (id int PRIMARY KEY, payload text);
 INSERT INTO visible_rows VALUES (1, 'visible'), (2, 'hidden-by-rls');
 ALTER TABLE visible_rows OWNER TO compat_owner;
 ALTER TABLE visible_rows ENABLE ROW LEVEL SECURITY;
 CREATE POLICY visible_only ON visible_rows USING (id = 1);
 GRANT SELECT ON visible_rows TO compat_reader, compat_monitor;
 CREATE TABLE hidden_rows (secret text);
 REVOKE ALL ON hidden_rows FROM PUBLIC;`)
	s.Require().NoError(err)
	defer func() {
		_, cleanupErr := db.ExecContext(ctx, `DROP OWNED BY compat_owner, compat_reader, compat_monitor CASCADE; DROP ROLE compat_owner, compat_reader, compat_monitor`)
		s.Require().NoError(cleanupErr)
	}()
	dsn, err := s.container.ConnectionString(ctx)
	// The suite's database already exists; derive its DSN without creating
	// privileged sessions for either of the two logins under test.
	s.Require().NoError(err)
	parsed, err := url.Parse(dsn)
	s.Require().NoError(err)
	parsed.Path = "/" + s.testDBName
	for _, login := range []string{"compat_reader", "compat_monitor"} {
		parsed.User = url.UserPassword(login, "testpass")
		pool, openErr := engine.OpenPostgresDB(parsed.String())
		s.Require().NoError(openErr)
		func() {
			defer pool.Close()
			page, readErr := s.eng.ReadRows(ctx, pool, engine.ReadRowsParams{SchemaName: "public", TableName: "visible_rows", PageSize: 10})
			s.Require().NoError(readErr)
			s.Require().Len(page.Rows, 1)
			s.Equal(int64(1), page.Rows[0].GetValues()[0].GetValue().GetInt64Value())
			_, deniedErr := s.eng.ReadRows(ctx, pool, engine.ReadRowsParams{SchemaName: "public", TableName: "hidden_rows", PageSize: 10})
			s.Require().Error(deniedErr)
			health, healthErr := s.eng.CheckInstanceHealth(ctx, pool)
			s.Require().NoError(healthErr)
			s.Require().NotNil(health.StatsAccess)
			if login == "compat_monitor" {
				s.Equal(engine.HealthStatusOK, health.StatsAccess.Status)
			} else {
				s.Equal(engine.HealthStatusWarning, health.StatsAccess.Status)
			}
			insights, insightErr := s.eng.GetDatabaseQueryInsights(ctx, pool)
			s.Require().NoError(insightErr)
			s.True(insights.TableStatsAvailable)
			s.False(insights.QueryStatsAvailable, "extension is not installed in this database")
			s.NotEmpty(insights.PartialErrors)
			for _, table := range insights.TableCacheHits {
				s.NotEqual("hidden_rows", table.TableName)
			}
		}()
	}
}

func (s *PostgresEngineIntegrationTestSuite) TestSQLTimeoutAndEarlyCloseReleaseConnection() {
	ctx := s.T().Context()
	db := s.getTestDBConnection()
	defer db.Close()
	db.SetMaxOpenConns(1)
	_, err := s.eng.ExecuteQuery(ctx, db, engine.ExecuteQueryParams{Statement: "SELECT pg_sleep(10)", Timeout: 50 * time.Millisecond})
	s.True(postgreserrors.IsCondition(err, "query_canceled"), "server statement timeout preserves SQLSTATE 57014")
	stream, err := s.eng.ExecuteQuery(ctx, db, engine.ExecuteQueryParams{Statement: "SELECT generate_series(1, 10000)", Timeout: time.Second})
	s.Require().NoError(err)
	s.Require().True(stream.Next())
	s.Require().NoError(stream.Close())
	var readonly string
	s.Require().NoError(db.QueryRowContext(ctx, `SHOW transaction_read_only`).Scan(&readonly))
	s.Equal("off", readonly, "read-only transaction must not leak into the pooled connection")
	s.Require().NoError(db.PingContext(ctx))
	s.Equal(0, db.Stats().InUse)
}

func (s *PostgresEngineIntegrationTestSuite) TestMetaMigrationsWithSeparateApplicationLogin() {
	ctx := s.T().Context()
	db := s.getTestDBConnection()
	defer db.Close()
	_, err := db.ExecContext(ctx, `CREATE ROLE compat_migrator LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD 'testpass';
 CREATE ROLE compat_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD 'testpass';
 REVOKE CREATE ON SCHEMA public FROM PUBLIC;
 ALTER SCHEMA public OWNER TO compat_migrator;`)
	s.Require().NoError(err)
	_, err = db.ExecContext(ctx, `ALTER DATABASE `+pgx.Identifier{s.testDBName}.Sanitize()+` OWNER TO compat_migrator`)
	s.Require().NoError(err)
	defer func() {
		_, cleanupErr := db.ExecContext(ctx, `DROP OWNED BY compat_migrator, compat_app CASCADE`)
		s.Require().NoError(cleanupErr)
		_, cleanupErr = db.ExecContext(ctx, `ALTER DATABASE `+pgx.Identifier{s.testDBName}.Sanitize()+` OWNER TO testuser`)
		s.Require().NoError(cleanupErr)
		_, cleanupErr = db.ExecContext(ctx, `DROP ROLE compat_migrator, compat_app`)
		s.Require().NoError(cleanupErr)
	}()
	dsn, err := s.container.ConnectionString(ctx)
	s.Require().NoError(err)
	parsed, err := url.Parse(dsn)
	s.Require().NoError(err)
	parsed.Path = "/" + s.testDBName
	parsed.User = url.UserPassword("compat_migrator", "testpass")
	migrator, err := engine.OpenPostgresDB(parsed.String())
	s.Require().NoError(err)
	defer migrator.Close()
	provider, err := storage.NewGooseProvider(migrator)
	s.Require().NoError(err)
	up, err := provider.Up(ctx)
	s.Require().NoError(err)
	s.Require().NotEmpty(up)
	// Exercise the latest reversible migration, then return to the current
	// schema before application credentials touch data.
	_, err = provider.Down(ctx)
	s.Require().NoError(err)
	_, err = provider.Up(ctx)
	s.Require().NoError(err)
	_, err = migrator.ExecContext(ctx, `GRANT USAGE ON SCHEMA public TO compat_app;
 GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO compat_app;
 GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO compat_app;`)
	s.Require().NoError(err)
	parsed.User = url.UserPassword("compat_app", "testpass")
	app, err := engine.OpenPostgresDB(parsed.String())
	s.Require().NoError(err)
	key, err := storage.LoadOrCreateTokenSigningKey(ctx, app)
	s.Require().NoError(err)
	s.Require().NoError(app.Close())
	reopened, err := engine.OpenPostgresDB(parsed.String())
	s.Require().NoError(err)
	defer reopened.Close()
	persisted, err := storage.LoadOrCreateTokenSigningKey(ctx, reopened)
	s.Require().NoError(err)
	s.Equal(key, persisted, "meta database state survives a fresh application connection")
	_, err = reopened.ExecContext(ctx, `CREATE TABLE forbidden_ddl (id int)`)
	s.Error(err, "application login cannot perform migrations")
}

func (s *PostgresEngineIntegrationTestSuite) TestIOByteCounterShapes() {
	ctx := s.T().Context()
	db := s.getTestDBConnection()
	defer db.Close()
	db.SetMaxOpenConns(1)
	// Temporary relations shadow the real view only on this disposable
	// connection. Exercise the production SQL against each actual row shape,
	// with nonzero, hand-calculated expectations independent of block_size.
	for _, fixture := range []struct {
		ddl                 string
		read, write, extend int64
	}{
		{`CREATE TEMP TABLE pg_stat_io (reads bigint, writes bigint, extends bigint, fsyncs bigint, op_bytes bigint);
    INSERT INTO pg_stat_io VALUES (3,5,2,7,4096)`, 12288, 20480, 8192},
		{`CREATE TEMP TABLE pg_stat_io (reads bigint, writes bigint, extends bigint, fsyncs bigint, read_bytes bigint, write_bytes bigint, extend_bytes bigint);
    INSERT INTO pg_stat_io VALUES (3,5,2,7,123,456,789)`, 123, 456, 789},
	} {
		_, err := db.ExecContext(ctx, fixture.ddl)
		s.Require().NoError(err)
		counters, err := s.eng.GetIOCounters(ctx, db)
		s.Require().NoError(err)
		s.Equal(fixture.read, counters.ReadBytes)
		s.Equal(fixture.write, counters.WriteBytes)
		s.Equal(fixture.extend, counters.ExtendBytes)
		_, err = db.ExecContext(ctx, `DROP TABLE pg_temp.pg_stat_io`)
		s.Require().NoError(err)
	}
}

func (s *PostgresEngineIntegrationTestSuite) TestPhysicalCellIdentityDistinguishesPartitions() {
	ctx := s.T().Context()
	db := s.getTestDBConnection()
	defer db.Close()
	_, err := db.ExecContext(ctx, `CREATE TABLE physical_partitions (region int, payload text) PARTITION BY LIST (region);
 CREATE TABLE physical_partitions_a PARTITION OF physical_partitions FOR VALUES IN (1);
 CREATE TABLE physical_partitions_b PARTITION OF physical_partitions FOR VALUES IN (2);
 INSERT INTO physical_partitions VALUES (1, repeat('a',100)), (2, repeat('b',100));`)
	s.Require().NoError(err)
	codec, err := engine.NewRandomTokenCodec()
	s.Require().NoError(err)
	pg := postgres.New(codec)
	page, err := pg.ReadRows(ctx, db, engine.ReadRowsParams{SchemaName: "public", TableName: "physical_partitions", PageSize: 10, MaxCellBytes: 5})
	s.Require().NoError(err)
	s.Require().Len(page.Rows, 2)
	for _, row := range page.Rows {
		var payload api.TableCellFullValueTokenPayload
		s.Require().NoError(codec.Verify(engine.TokenKindFullValueCell, row.GetValues()[1].GetFullValueToken(), &payload))
		full, cellErr := pg.ReadCellValue(ctx, db, engine.ReadCellValueParams{SchemaName: "public", TableName: "physical_partitions", Column: "payload", RowIdentity: payload.GetRowIdentity(), IdentityValues: payload.GetIdentityValues()})
		s.Require().NoError(cellErr)
		want := "a"
		if row.GetValues()[0].GetValue().GetInt64Value() == 2 {
			want = "b"
		}
		s.Equal(strings.Repeat(want, 100), full.Cell.GetValue().GetStringValue())
	}
}
