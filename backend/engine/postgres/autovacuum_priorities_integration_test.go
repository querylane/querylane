package postgres_test

import (
	"fmt"
	"net/url"
	"strings"
	"time"

	"github.com/querylane/querylane/backend/engine"
)

func (s *PostgresEngineIntegrationTestSuite) TestAutovacuumPrioritiesVisibilityAndLimit() {
	ctx := s.T().Context()
	db := s.getTestDBConnection()
	defer db.Close()
	version, err := s.eng.GetServerVersionNum(ctx, db)
	s.Require().NoError(err)
	empty, err := s.eng.GetDatabaseQueryInsights(ctx, db)
	s.Require().NoError(err)
	s.Require().NotNil(empty.AutovacuumPriorities)
	if version < 190000 {
		s.Equal(engine.AutovacuumPrioritiesUnsupported, empty.AutovacuumPriorities.Availability)
		s.Empty(empty.AutovacuumPriorities.Tables)
		return
	}
	s.Equal(engine.AutovacuumPrioritiesAvailable, empty.AutovacuumPriorities.Availability)
	s.Empty(empty.AutovacuumPriorities.Tables, "a genuinely empty database is not an unavailable observation")

	var statements []string
	for index := range 12 {
		statements = append(statements, fmt.Sprintf("CREATE TABLE public.priority_%02d (id int)", index))
	}
	_, err = db.ExecContext(ctx, strings.Join(statements, "; "))
	s.Require().NoError(err)
	insights, err := s.eng.GetDatabaseQueryInsights(ctx, db)
	s.Require().NoError(err)
	s.Require().NotNil(insights.AutovacuumPriorities)
	s.Equal(engine.AutovacuumPrioritiesAvailable, insights.AutovacuumPriorities.Availability)
	s.Require().Len(insights.AutovacuumPriorities.Tables, 10)
	for index, row := range insights.AutovacuumPriorities.Tables {
		s.Equal("public", row.SchemaName)
		s.Equal(fmt.Sprintf("priority_%02d", index), row.TableName, "equal current scores use deterministic schema/name ordering")
		s.GreaterOrEqual(row.Score, float64(0))
	}

	reader := fmt.Sprintf("ql_priority_reader_%d", time.Now().UnixNano())
	monitor := fmt.Sprintf("ql_priority_monitor_%d", time.Now().UnixNano())
	_, err = db.ExecContext(ctx, fmt.Sprintf(`CREATE ROLE %s LOGIN PASSWORD 'testpass'; CREATE ROLE %s LOGIN PASSWORD 'testpass'; GRANT pg_read_all_stats TO %s; GRANT SELECT ON public.priority_11 TO %s`, reader, monitor, monitor, reader))
	s.Require().NoError(err)
	defer func() {
		_, cleanupErr := db.ExecContext(ctx, fmt.Sprintf(`REVOKE SELECT ON public.priority_11 FROM %s; DROP ROLE %s; DROP ROLE %s`, reader, reader, monitor))
		s.NoError(cleanupErr)
	}()
	dsn, err := s.container.ConnectionString(ctx)
	s.Require().NoError(err)
	for _, role := range []string{reader, monitor} {
		parsed, parseErr := url.Parse(dsn)
		s.Require().NoError(parseErr)
		parsed.Path = "/" + s.testDBName
		parsed.User = url.UserPassword(role, "testpass")
		login, openErr := engine.OpenPostgresDB(parsed.String())
		s.Require().NoError(openErr)
		defer login.Close()
		observed, queryErr := s.eng.GetDatabaseQueryInsights(ctx, login)
		s.Require().NoError(queryErr)
		s.Require().NotNil(observed.AutovacuumPriorities)
		s.Equal(engine.AutovacuumPrioritiesAvailable, observed.AutovacuumPriorities.Availability)
		if role == reader {
			s.Require().Len(observed.AutovacuumPriorities.Tables, 1)
			s.Equal("priority_11", observed.AutovacuumPriorities.Tables[0].TableName)
			_, err = db.ExecContext(ctx, `REVOKE SELECT ON public.priority_11 FROM `+reader)
			s.Require().NoError(err)
			revoked, revokedErr := s.eng.GetDatabaseQueryInsights(ctx, login)
			s.Require().NoError(revokedErr)
			s.Require().NotNil(revoked.AutovacuumPriorities)
			s.Equal(engine.AutovacuumPrioritiesAvailable, revoked.AutovacuumPriorities.Availability)
			s.Empty(revoked.AutovacuumPriorities.Tables, "revoked objects disappear without exposing stale names")
		} else {
			s.Empty(observed.AutovacuumPriorities.Tables, "statistics monitoring privileges do not authorize table metadata visibility")
		}
	}
}

func (s *PostgresEngineIntegrationTestSuite) TestAutovacuumPrioritiesCatalogPrivileges() {
	ctx := s.T().Context()
	db := s.getTestDBConnection()
	defer db.Close()
	version, err := s.eng.GetServerVersionNum(ctx, db)
	s.Require().NoError(err)
	if version < 190000 {
		s.T().Skip("autovacuum priorities require PostgreSQL 19")
	}
	reader := fmt.Sprintf("ql_priority_acl_%d", time.Now().UnixNano())
	_, err = db.ExecContext(ctx, fmt.Sprintf(`CREATE ROLE %s LOGIN PASSWORD 'testpass'`, reader))
	s.Require().NoError(err)
	defer func() {
		_, cleanupErr := db.ExecContext(ctx, `GRANT SELECT ON pg_catalog.pg_stat_autovacuum_scores TO PUBLIC; DROP ROLE `+reader)
		s.NoError(cleanupErr)
	}()
	dsn, err := s.container.ConnectionString(ctx)
	s.Require().NoError(err)
	parsed, err := url.Parse(dsn)
	s.Require().NoError(err)
	parsed.Path = "/" + s.testDBName
	parsed.User = url.UserPassword(reader, "testpass")
	login, err := engine.OpenPostgresDB(parsed.String())
	s.Require().NoError(err)
	defer login.Close()
	login.SetMaxOpenConns(1)
	var before, after string
	s.Require().NoError(login.QueryRowContext(ctx, "SHOW statement_timeout").Scan(&before))
	_, err = db.ExecContext(ctx, `REVOKE SELECT ON pg_catalog.pg_stat_autovacuum_scores FROM PUBLIC`)
	s.Require().NoError(err)
	restricted, err := s.eng.GetDatabaseQueryInsights(ctx, login)
	s.Require().NoError(err)
	s.Require().NotNil(restricted.AutovacuumPriorities)
	s.Equal(engine.AutovacuumPrioritiesRestricted, restricted.AutovacuumPriorities.Availability)
	s.Empty(restricted.AutovacuumPriorities.Tables)
	_, err = db.ExecContext(ctx, `GRANT SELECT ON pg_catalog.pg_stat_autovacuum_scores TO PUBLIC`)
	s.Require().NoError(err)
	recovered, err := s.eng.GetDatabaseQueryInsights(ctx, login)
	s.Require().NoError(err)
	s.Require().NotNil(recovered.AutovacuumPriorities)
	s.Equal(engine.AutovacuumPrioritiesAvailable, recovered.AutovacuumPriorities.Availability)
	s.Require().NoError(login.QueryRowContext(ctx, "SHOW statement_timeout").Scan(&after))
	s.Equal(before, after, "probe timeouts must not leak into the pooled connection")
}
