package postgres_test

import (
	"fmt"
	"net/url"
	"time"

	"github.com/querylane/querylane/backend/engine"
)

func (s *PostgresEngineIntegrationTestSuite) TestLockStatisticsAvailability() {
	ctx := s.T().Context()
	db := s.getTestDBConnection()
	defer db.Close()
	version, err := s.eng.GetServerVersionNum(ctx, db)
	s.Require().NoError(err)
	for _, check := range []struct {
		name string
		run  func() (*engine.InstanceHealth, error)
	}{
		{"health", func() (*engine.InstanceHealth, error) { return s.eng.CheckInstanceHealth(ctx, db) }},
		{"activity", func() (*engine.InstanceHealth, error) { return s.eng.CheckInstanceActivity(ctx, db) }},
	} {
		health, checkErr := check.run()
		s.Require().NoError(checkErr, check.name)
		s.Require().NotNil(health.LockStatistics, check.name)
		if version < 190000 {
			s.Equal(engine.LockStatisticsUnsupported, health.LockStatistics.Availability)
			s.Empty(health.LockStatistics.ByType)
			continue
		}
		s.Equal(engine.LockStatisticsAvailable, health.LockStatistics.Availability)
		s.Equal(engine.HealthStatusOK, health.LockStatistics.Status)
		s.NotEmpty(health.LockStatistics.ByType)
		s.LessOrEqual(len(health.LockStatistics.ByType), 64)
		for _, row := range health.LockStatistics.ByType {
			s.NotEmpty(row.LockType)
			s.GreaterOrEqual(row.Waits, int64(0))
			s.GreaterOrEqual(row.WaitTimeMs, float64(0))
			s.GreaterOrEqual(row.FastpathExceeded, int64(0))
			s.NotNil(row.StatsResetAt)
		}
	}
}

func (s *PostgresEngineIntegrationTestSuite) TestLockStatisticsLoginPrivileges() {
	ctx := s.T().Context()
	version, err := s.eng.GetServerVersionNum(ctx, s.db)
	s.Require().NoError(err)
	if version < 190000 {
		s.T().Skip("lock statistics require PostgreSQL 19")
	}
	reader := fmt.Sprintf("ql_lock_reader_%d", time.Now().UnixNano())
	monitor := fmt.Sprintf("ql_lock_monitor_%d", time.Now().UnixNano())
	_, err = s.db.ExecContext(ctx, fmt.Sprintf(`CREATE ROLE %s LOGIN PASSWORD 'testpass'; CREATE ROLE %s LOGIN PASSWORD 'testpass'; GRANT pg_read_all_stats TO %s`, reader, monitor, monitor))
	s.Require().NoError(err)
	defer func() {
		_, cleanupErr := s.db.ExecContext(ctx, fmt.Sprintf(`GRANT SELECT ON pg_catalog.pg_stat_lock TO PUBLIC; REVOKE SELECT ON pg_catalog.pg_stat_lock FROM %s; DROP ROLE %s; DROP ROLE %s`, monitor, reader, monitor))
		s.NoError(cleanupErr)
	}()
	dsn, err := s.container.ConnectionString(ctx)
	s.Require().NoError(err)
	for _, role := range []string{reader, monitor} {
		parsed, parseErr := url.Parse(dsn)
		s.Require().NoError(parseErr)
		parsed.User = url.UserPassword(role, "testpass")
		login, openErr := engine.OpenPostgresDB(parsed.String())
		s.Require().NoError(openErr)
		defer login.Close()
		health, checkErr := s.eng.CheckInstanceActivity(ctx, login)
		s.Require().NoError(checkErr)
		s.Require().NotNil(health.LockStatistics)
		s.Equal(engine.LockStatisticsAvailable, health.LockStatistics.Availability, "stock PostgreSQL exposes cluster lock counters to ordinary roles too")
		if role == reader {
			_, err = s.db.ExecContext(ctx, `REVOKE SELECT ON pg_catalog.pg_stat_lock FROM PUBLIC; GRANT SELECT ON pg_catalog.pg_stat_lock TO `+monitor)
			s.Require().NoError(err)
			health, checkErr = s.eng.CheckInstanceActivity(ctx, login)
			s.Require().NoError(checkErr)
			s.Require().NotNil(health.LockStatistics)
			s.Equal(engine.LockStatisticsRestricted, health.LockStatistics.Availability)
			s.Empty(health.LockStatistics.ByType)
		}
	}
}
