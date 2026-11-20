package postgres_test

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/url"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/querylane/querylane/backend/engine"
	api "github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1"
)

func (s *PostgresEngineIntegrationTestSuite) TestExplainAnalyzeReportsScanIOOnPostgres19() {
	ctx := s.T().Context()
	db := s.getTestDBConnection()
	defer db.Close()

	_, err := db.ExecContext(ctx, "CREATE TABLE io_probe AS SELECT generate_series(1, 2000) AS n")
	s.Require().NoError(err)
	plan, err := s.eng.ExplainQuery(ctx, db, engine.ExplainQueryParams{
		Statement: "SELECT sum(n) FROM io_probe",
		Analyze:   true,
		Format:    api.ExplainQueryRequest_FORMAT_JSON,
		Timeout:   5 * time.Second,
	})
	s.Require().NoError(err)
	s.Contains(plan.Plan, `"Actual Rows"`)
	if s.postgresMajor(ctx, db) >= 19 {
		s.Contains(plan.Plan, `"Prefetch Capacity"`)
	} else {
		s.NotContains(plan.Plan, `"Prefetch Capacity"`, "older servers must still accept EXPLAIN ANALYZE")
	}
}

func (s *PostgresEngineIntegrationTestSuite) TestPostgres19ExplainUsesLoadedPlanAdviceOnly() {
	ctx := s.T().Context()
	db := s.getTestDBConnection()
	defer db.Close()
	s.requirePostgresAtLeast(ctx, db, 19)
	// Pin this disposable pool to one session so the fixture's LOAD cannot
	// accidentally land on a different connection from the explain.
	db.SetMaxOpenConns(1)
	_, err := db.ExecContext(ctx, "CREATE TABLE advice_probe (id int)")
	s.Require().NoError(err)
	params := engine.ExplainQueryParams{
		Statement: "SELECT id FROM advice_probe WHERE id = 1",
		Format:    api.ExplainQueryRequest_FORMAT_JSON,
		Timeout:   5 * time.Second,
	}
	plain, err := s.eng.ExplainQuery(ctx, db, params)
	s.Require().NoError(err)
	s.NotContains(plain.Plan, "Generated Plan Advice")
	_, err = db.ExecContext(ctx, "LOAD 'pg_plan_advice'")
	s.Require().NoError(err)
	withAdvice, err := s.eng.ExplainQuery(ctx, db, params)
	s.Require().NoError(err)
	s.Contains(withAdvice.Plan, "Generated Plan Advice")
	s.NotContains(withAdvice.Plan, "Actual Rows", "requesting advice must not execute a plan-only query")
}

func (s *PostgresEngineIntegrationTestSuite) TestPostgres19ConcurrentRepackRetainsRowsAndExposesProgress() {
	ctx := s.T().Context()
	db := s.getTestDBConnection()
	defer db.Close()
	s.requirePostgresAtLeast(ctx, db, 19)

	_, err := db.ExecContext(ctx, `
CREATE TABLE repack_probe (id int PRIMARY KEY, payload text);
INSERT INTO repack_probe SELECT n, repeat('x', 64) FROM generate_series(1,1000) AS n;
DELETE FROM repack_probe WHERE id > 3;`)
	s.Require().NoError(err)
	var before, after string
	s.Require().NoError(db.QueryRowContext(ctx, "SELECT pg_relation_filenode('repack_probe')::text").Scan(&before))

	// Admin-side native operation against the disposable fixture only. REPACK
	// remains forbidden through the read-only workbench, even on PG19.
	repackCtx, cancel := context.WithTimeout(ctx, 20*time.Second)
	defer cancel()
	reader, err := db.BeginTx(repackCtx, nil)
	s.Require().NoError(err)
	defer func() { _ = reader.Rollback() }()
	// A reader can coexist with the rewrite but prevents the final file swap,
	// making the normally brief progress row observable without a fixed delay.
	_, err = reader.ExecContext(repackCtx, "LOCK TABLE repack_probe IN ACCESS SHARE MODE")
	s.Require().NoError(err)
	done := make(chan error, 1)
	go func() {
		_, repackErr := db.ExecContext(repackCtx, "REPACK (CONCURRENTLY) repack_probe")
		done <- repackErr
	}()
	const progress = "SELECT command, phase FROM pg_catalog.pg_stat_progress_repack WHERE datname = current_database()"
	s.Require().Eventually(func() bool {
		stream, progressErr := s.eng.ExecuteQuery(repackCtx, db, engine.ExecuteQueryParams{
			Statement: progress,
			Timeout:   time.Second,
		})
		if progressErr != nil {
			return false
		}
		defer stream.Close()
		return stream.Next() && stream.Row().GetValues()[0].GetValue().GetStringValue() == "REPACK"
	}, 10*time.Second, 50*time.Millisecond, "read-only workbench should see the running rewrite")
	s.Require().NoError(reader.Rollback())
	select {
	case err := <-done:
		s.Require().NoError(err)
	case <-repackCtx.Done():
		s.Require().NoError(repackCtx.Err())
	}
	s.Require().NoError(db.QueryRowContext(ctx, "SELECT pg_relation_filenode('repack_probe')::text").Scan(&after))
	s.NotEqual(before, after)
	page, err := s.eng.ReadRows(ctx, db, engine.ReadRowsParams{SchemaName: "public", TableName: "repack_probe", PageSize: 10})
	s.Require().NoError(err)
	s.Require().Len(page.Rows, 3)
	for i, row := range page.Rows {
		s.Equal(int64(i+1), row.GetValues()[0].GetValue().GetInt64Value())
		s.Len(row.GetValues()[1].GetValue().GetStringValue(), 64)
	}
	stream, err := s.eng.ExecuteQuery(ctx, db, engine.ExecuteQueryParams{
		Statement: progress,
		Timeout:   5 * time.Second,
	})
	s.Require().NoError(err)
	defer stream.Close()
	s.False(stream.Next(), "completed REPACK must not be displayed as in progress")
	s.Require().NoError(stream.Err())
}

func (s *PostgresEngineIntegrationTestSuite) TestPostgres19SequenceSynchronizationNeedsRefresh() {
	ctx, cancel := context.WithTimeout(s.T().Context(), time.Minute)
	defer cancel()
	publisher := s.getTestDBConnection()
	defer publisher.Close()
	s.requirePostgresAtLeast(ctx, publisher, 19)

	const subscriberName = "ga19_sequence_subscriber"
	_, err := s.container.CreateDatabase(ctx, subscriberName)
	s.Require().NoError(err)
	defer func() { s.NoError(s.container.DropDatabase(ctx, subscriberName)) }()
	subscriber, err := s.container.ConnectToDatabase(ctx, subscriberName)
	s.Require().NoError(err)
	defer subscriber.Close()

	_, err = publisher.ExecContext(ctx, `
CREATE SEQUENCE cutover_id;
SELECT setval('cutover_id', 100);
CREATE PUBLICATION ga19_sequences FOR ALL SEQUENCES;`)
	s.Require().NoError(err)
	_, err = subscriber.ExecContext(ctx, "CREATE SEQUENCE cutover_id")
	s.Require().NoError(err)
	// Same-cluster logical replication requires explicitly creating the slot
	// before CREATE SUBSCRIPTION. PG19 can do so at wal_level=replica.
	var configured, effective string
	s.Require().NoError(publisher.QueryRowContext(ctx, "SHOW wal_level").Scan(&configured))
	s.Equal("replica", configured, "fixture must not preconfigure logical WAL")
	_, err = publisher.ExecContext(ctx, "SELECT * FROM pg_create_logical_replication_slot('ga19_sequences', 'pgoutput')")
	s.Require().NoError(err)
	s.Require().NoError(publisher.QueryRowContext(ctx, "SHOW effective_wal_level").Scan(&effective))
	s.Equal("logical", effective, "creating the first logical slot activates logical WAL without a restart")
	statement := fmt.Sprintf(
		"CREATE SUBSCRIPTION ga19_sequences CONNECTION 'host=127.0.0.1 port=5432 user=testuser password=testpass dbname=%s' PUBLICATION ga19_sequences WITH (create_slot = false)",
		s.testDBName,
	)
	_, err = subscriber.ExecContext(ctx, statement)
	s.Require().NoError(err)
	defer func() {
		cleanup, cancel := context.WithTimeout(context.WithoutCancel(ctx), 10*time.Second)
		defer cancel()
		_, err := subscriber.ExecContext(cleanup, "DROP SUBSCRIPTION ga19_sequences")
		s.NoError(err)
	}()

	assertSync := func(want int64) {
		s.Require().Eventually(func() bool {
			var value int64
			return subscriber.QueryRowContext(ctx, "SELECT last_value FROM cutover_id").Scan(&value) == nil && value == want
		}, 15*time.Second, 50*time.Millisecond)
	}
	assertSync(100)
	_, err = publisher.ExecContext(ctx, "SELECT setval('cutover_id', 200)")
	s.Require().NoError(err)
	var value int64
	s.Require().NoError(subscriber.QueryRowContext(ctx, "SELECT last_value FROM cutover_id").Scan(&value))
	s.Equal(int64(100), value, "sequence increments are not continuously applied")
	_, err = subscriber.ExecContext(ctx, "ALTER SUBSCRIPTION ga19_sequences REFRESH SEQUENCES")
	s.Require().NoError(err)
	assertSync(200)
	s.Require().NoError(subscriber.QueryRowContext(ctx, "SELECT nextval('cutover_id')").Scan(&value))
	s.Equal(int64(201), value, "the subscriber advances past the copied value")
}

func (s *PostgresEngineIntegrationTestSuite) TestPostgres19GetOrCreateAndIgnoreNulls() {
	ctx := s.T().Context()
	db := s.getTestDBConnection()
	defer db.Close()
	s.requirePostgresAtLeast(ctx, db, 19)

	_, err := db.ExecContext(ctx, "CREATE TABLE get_or_create (id int PRIMARY KEY, payload text)")
	s.Require().NoError(err)
	const getOrCreate = `INSERT INTO get_or_create VALUES (1, $1)
ON CONFLICT (id) DO SELECT RETURNING payload`
	for _, input := range []string{"first", "second"} {
		var value string
		s.Require().NoError(db.QueryRowContext(ctx, getOrCreate, input).Scan(&value))
		s.Equal("first", value, "a conflicting INSERT returns the existing row without updating it")
	}

	stream, err := s.eng.ExecuteQuery(ctx, db, engine.ExecuteQueryParams{
		Statement: `SELECT last_value(n) IGNORE NULLS OVER (ORDER BY pos)
FROM (VALUES (1, 100), (2, NULL), (3, 150), (4, NULL)) AS sales(pos, n)
ORDER BY pos`,
		Timeout: 5 * time.Second,
	})
	s.Require().NoError(err)
	defer stream.Close()
	var actual []int64
	for stream.Next() {
		actual = append(actual, stream.Row().GetValues()[0].GetValue().GetInt64Value())
	}
	s.Require().NoError(stream.Err())
	s.Equal([]int64{100, 100, 150, 150}, actual)
}

func (s *PostgresEngineIntegrationTestSuite) TestPostgres19NativeCopyJSONAndSetNull() {
	ctx := s.T().Context()
	db := s.getTestDBConnection()
	defer db.Close()
	s.requirePostgresAtLeast(ctx, db, 19)

	dsn, err := s.container.ConnectionString(ctx)
	s.Require().NoError(err)
	target, err := url.Parse(dsn)
	s.Require().NoError(err)
	target.Path = "/" + s.testDBName
	conn, err := pgx.Connect(ctx, target.String())
	s.Require().NoError(err)
	defer conn.Close(ctx)

	_, err = conn.Exec(ctx, "CREATE TABLE copy_probe (id int PRIMARY KEY, val int)")
	s.Require().NoError(err)
	tag, err := conn.PgConn().CopyFrom(ctx, strings.NewReader("id,val\n1,42\n2,bad\n"),
		"COPY copy_probe FROM STDIN WITH (FORMAT CSV, HEADER, ON_ERROR SET_NULL)")
	s.Require().NoError(err)
	s.Equal(int64(2), tag.RowsAffected())

	var output bytes.Buffer
	_, err = conn.PgConn().CopyTo(ctx, &output, "COPY (SELECT * FROM copy_probe ORDER BY id) TO STDOUT WITH (FORMAT JSON, FORCE_ARRAY)")
	s.Require().NoError(err)
	var rows []map[string]*int
	s.Require().NoError(json.Unmarshal(output.Bytes(), &rows))
	s.Equal([]map[string]*int{{"id": new(1), "val": new(42)}, {"id": new(2), "val": nil}}, rows)
}
