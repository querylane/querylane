package rpctest

import (
	"strconv"

	"connectrpc.com/connect"

	api "github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1"
)

func (s *RPCSuite) TestPostgres19DiagnosticsReachRPC() {
	ctx := s.T().Context()
	db, err := s.pgContainer.ConnectToDatabase(ctx, externalDBName)
	s.Require().NoError(err)
	defer db.Close()
	var versionText string
	s.Require().NoError(db.QueryRowContext(ctx, `SHOW server_version_num`).Scan(&versionText))
	version, err := strconv.Atoi(versionText)
	s.Require().NoError(err)
	expected := api.ObservationAvailability_OBSERVATION_AVAILABILITY_UNSUPPORTED
	if version >= 190000 {
		expected = api.ObservationAvailability_OBSERVATION_AVAILABILITY_AVAILABLE
	}
	health, err := s.instanceClient.CheckInstanceHealth(ctx, connect.NewRequest(&api.CheckInstanceHealthRequest{Name: s.instanceName()}))
	s.Require().NoError(err)
	s.Require().NotNil(health.Msg.GetHealth().GetLockStatistics())
	s.Equal(expected, health.Msg.GetHealth().GetLockStatistics().GetAvailability())
	s.True(health.Msg.GetHealth().GetReplication().GetStatisticsVisible())
	activity, err := s.instanceClient.CheckInstanceActivity(ctx, connect.NewRequest(&api.CheckInstanceActivityRequest{Name: s.instanceName()}))
	s.Require().NoError(err)
	s.Require().NotNil(activity.Msg.GetLockStatistics())
	s.Equal(expected, activity.Msg.GetLockStatistics().GetAvailability())
	insights, err := s.databaseClient.GetDatabaseQueryInsights(ctx, connect.NewRequest(&api.GetDatabaseQueryInsightsRequest{Name: s.databaseName()}))
	s.Require().NoError(err)
	priorities := insights.Msg.GetQueryInsights().GetAutovacuumPriorities()
	s.Require().NotNil(priorities)
	s.Equal(expected, priorities.GetAvailability())
	s.LessOrEqual(len(priorities.GetTables()), 10)
	if version >= 190000 {
		s.NotEmpty(health.Msg.GetHealth().GetLockStatistics().GetByType())
		s.Equal(api.ObservationAvailability_OBSERVATION_AVAILABILITY_NOT_APPLICABLE, health.Msg.GetHealth().GetReplication().GetRecovery().GetAvailability())
		s.NotEmpty(priorities.GetTables())
	}
}
