package rpctest

import (
	"context"
	"strings"
	"time"

	"connectrpc.com/connect"
	"google.golang.org/protobuf/types/known/durationpb"

	consolev1alpha1 "github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1"
	"github.com/querylane/querylane/backend/resource"
)

func (s *RPCSuite) TestExecuteQuery_StreamsColumnMetadataFirst() {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	stream, err := s.sqlClient.ExecuteQuery(ctx, connect.NewRequest(&consolev1alpha1.ExecuteQueryRequest{
		Parent:    s.databaseName(),
		Statement: "SELECT id, first_name FROM public.customers LIMIT 3",
		BatchSize: 1,
	}))
	s.Require().NoError(err)

	s.Require().True(stream.Receive(), "expected first stream message")
	_, ok := stream.Msg().GetResult().(*consolev1alpha1.ExecuteQueryResponse_ColumnMetadata)
	s.True(ok, "first message should be column metadata")

	for stream.Receive() {
	}

	s.Require().NoError(stream.Err())
}

func (s *RPCSuite) TestExecuteQuery_SimpleSelect() {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	stream, err := s.sqlClient.ExecuteQuery(ctx, connect.NewRequest(&consolev1alpha1.ExecuteQueryRequest{
		Parent:    s.databaseName(),
		Statement: "SELECT id, first_name FROM public.customers LIMIT 5",
	}))
	s.Require().NoError(err)

	var (
		columns []*consolev1alpha1.TableResultColumn
		rows    []*consolev1alpha1.TableResultRow
		stats   *consolev1alpha1.QueryStats
	)

	for stream.Receive() {
		msg := stream.Msg()
		switch r := msg.GetResult().(type) {
		case *consolev1alpha1.ExecuteQueryResponse_ColumnMetadata:
			columns = r.ColumnMetadata.GetColumns()
		case *consolev1alpha1.ExecuteQueryResponse_RowBatch:
			rows = append(rows, r.RowBatch.GetRows()...)
		case *consolev1alpha1.ExecuteQueryResponse_Stats:
			stats = r.Stats
		}
	}

	s.Require().NoError(stream.Err())

	s.Len(columns, 2, "should have 2 columns")
	s.Len(rows, 5, "should have 5 rows")
	s.Require().NotNil(stats, "should receive stats")
	s.Equal(int64(5), stats.GetRowCount())
}

func (s *RPCSuite) TestExecuteQuery_ReturnsPostgresWarningsInStats() {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	s.createSQLWarningFunction(ctx)

	stream, err := s.sqlClient.ExecuteQuery(ctx, connect.NewRequest(&consolev1alpha1.ExecuteQueryRequest{
		Parent:    s.databaseName(),
		Statement: "SELECT public.ql_rpc_warning('execute')",
	}))
	s.Require().NoError(err)

	var stats *consolev1alpha1.QueryStats

	for stream.Receive() {
		if r, ok := stream.Msg().GetResult().(*consolev1alpha1.ExecuteQueryResponse_Stats); ok {
			stats = r.Stats
		}
	}

	s.Require().NoError(stream.Err())
	s.Require().NotNil(stats)
	s.Contains(strings.Join(stats.GetNotices(), "\n"), "WARNING 01000: querylane rpc warning: execute")
}

func (s *RPCSuite) TestExecuteQuery_DefaultSchema() {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	stream, err := s.sqlClient.ExecuteQuery(ctx, connect.NewRequest(&consolev1alpha1.ExecuteQueryRequest{
		Parent:        s.databaseName(),
		Statement:     "SELECT id FROM customers LIMIT 1",
		DefaultSchema: "public",
	}))
	s.Require().NoError(err)

	var rowCount int

	for stream.Receive() {
		msg := stream.Msg()
		if r, ok := msg.GetResult().(*consolev1alpha1.ExecuteQueryResponse_RowBatch); ok {
			rowCount += len(r.RowBatch.GetRows())
		}
	}

	s.Require().NoError(stream.Err())
	s.Equal(1, rowCount, "should return 1 row")
}

func (s *RPCSuite) TestExecuteQuery_RejectsWrite() {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	statements := []struct {
		name string
		sql  string
	}{
		{"DELETE", "DELETE FROM public.customers WHERE id = 1"},
		{"UPDATE", "UPDATE public.customers SET first_name = 'hacked' WHERE id = 1"},
		{"INSERT", "INSERT INTO public.customers (first_name, last_name, email) VALUES ('x', 'y', 'z@z.com')"},
		{"DROP", "DROP TABLE public.customers"},
	}

	for _, tc := range statements {
		stream, err := s.sqlClient.ExecuteQuery(ctx, connect.NewRequest(&consolev1alpha1.ExecuteQueryRequest{
			Parent:    s.databaseName(),
			Statement: tc.sql,
		}))
		// The error may come from opening the stream or from consuming it.
		if err != nil {
			var connectErr *connect.Error
			s.Require().ErrorAs(err, &connectErr, "%s should fail", tc.name)

			continue
		}

		// Drain the stream — the error should appear here.
		for stream.Receive() {
		}

		s.Error(stream.Err(), "%s should be rejected as read-only", tc.name)
	}
}

func (s *RPCSuite) TestExplainQuery_Text() {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	resp, err := s.sqlClient.ExplainQuery(ctx, connect.NewRequest(&consolev1alpha1.ExplainQueryRequest{
		Parent:    s.databaseName(),
		Statement: "SELECT id FROM public.customers LIMIT 10",
		Format:    consolev1alpha1.ExplainQueryRequest_FORMAT_TEXT,
	}))
	s.Require().NoError(err)
	s.NotEmpty(resp.Msg.GetPlan(), "plan should be non-empty")
}

func (s *RPCSuite) TestExplainQuery_ReturnsPostgresWarnings() {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	s.createSQLWarningFunction(ctx)

	resp, err := s.sqlClient.ExplainQuery(ctx, connect.NewRequest(&consolev1alpha1.ExplainQueryRequest{
		Parent:    s.databaseName(),
		Statement: "SELECT public.ql_rpc_warning('explain')",
		Analyze:   true,
		Format:    consolev1alpha1.ExplainQueryRequest_FORMAT_TEXT,
	}))

	s.Require().NoError(err)
	s.NotEmpty(resp.Msg.GetPlan(), "plan should be non-empty")
	s.Contains(strings.Join(resp.Msg.GetNotices(), "\n"), "WARNING 01000: querylane rpc warning: explain")
}

func (s *RPCSuite) TestExplainQuery_JSON() {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	resp, err := s.sqlClient.ExplainQuery(ctx, connect.NewRequest(&consolev1alpha1.ExplainQueryRequest{
		Parent:    s.databaseName(),
		Statement: "SELECT id FROM public.customers LIMIT 10",
		Format:    consolev1alpha1.ExplainQueryRequest_FORMAT_JSON,
	}))
	s.Require().NoError(err)

	plan := strings.TrimSpace(resp.Msg.GetPlan())
	s.True(strings.HasPrefix(plan, "["), "JSON plan should start with [, got: %s", plan[:min(50, len(plan))])
}

func (s *RPCSuite) TestExecuteQuery_DatabaseNotFound() {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	stream, err := s.sqlClient.ExecuteQuery(ctx, connect.NewRequest(&consolev1alpha1.ExecuteQueryRequest{
		Parent:    s.instanceName() + "/databases/nonexistent_db",
		Statement: "SELECT 1",
	}))
	if err != nil {
		s.requireNotFoundResource(err, resource.TypeDatabase, s.instanceName()+"/databases/nonexistent_db")

		return
	}

	// Drain the stream — the error may appear here for server-streaming RPCs.
	for stream.Receive() {
	}

	s.Require().Error(stream.Err())
	s.requireNotFoundResource(stream.Err(), resource.TypeDatabase, s.instanceName()+"/databases/nonexistent_db")
}

func (s *RPCSuite) TestExecuteQuery_SyntaxError() {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	stream, err := s.sqlClient.ExecuteQuery(ctx, connect.NewRequest(&consolev1alpha1.ExecuteQueryRequest{
		Parent:    s.databaseName(),
		Statement: "SELEC 1",
	}))
	if err != nil {
		var connectErr *connect.Error
		s.Require().ErrorAs(err, &connectErr)
		s.Equal(connect.CodeInvalidArgument.String(), connectErr.Code().String())
		s.requireErrorInfoMetadata(err, map[string]string{
			"operation":      "execute_query",
			"sqlstate":       "42601",
			"sqlstate_class": "42",
			"condition_name": "syntax_error",
		})

		return
	}

	for stream.Receive() {
	}

	s.Require().Error(stream.Err())

	var connectErr *connect.Error
	s.Require().ErrorAs(stream.Err(), &connectErr)
	s.Equal(connect.CodeInvalidArgument.String(), connectErr.Code().String())
	s.requireErrorInfoMetadata(stream.Err(), map[string]string{
		"operation":      "execute_query",
		"sqlstate":       "42601",
		"sqlstate_class": "42",
		"condition_name": "syntax_error",
	})
}

func (s *RPCSuite) TestExecuteQuery_Timeout() {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	stream, err := s.sqlClient.ExecuteQuery(ctx, connect.NewRequest(&consolev1alpha1.ExecuteQueryRequest{
		Parent:    s.databaseName(),
		Statement: "SELECT pg_sleep(0.2)",
		Timeout:   durationpb.New(25 * time.Millisecond),
	}))
	if err != nil {
		var connectErr *connect.Error
		s.Require().ErrorAs(err, &connectErr)
		s.Equal(connect.CodeDeadlineExceeded.String(), connectErr.Code().String())
		s.requireErrorInfoMetadata(err, map[string]string{
			"operation":      "execute_query",
			"sqlstate":       "57014",
			"sqlstate_class": "57",
			"condition_name": "query_canceled",
		})

		return
	}

	for stream.Receive() {
	}

	s.Require().Error(stream.Err())

	var connectErr *connect.Error
	s.Require().ErrorAs(stream.Err(), &connectErr)
	s.Equal(connect.CodeDeadlineExceeded.String(), connectErr.Code().String())
	s.requireErrorInfoMetadata(stream.Err(), map[string]string{
		"operation":      "execute_query",
		"sqlstate":       "57014",
		"sqlstate_class": "57",
		"condition_name": "query_canceled",
	})
}

func (s *RPCSuite) createSQLWarningFunction(ctx context.Context) {
	s.T().Helper()

	db, err := s.pgContainer.ConnectToDatabase(ctx, externalDBName)
	s.Require().NoError(err)

	defer db.Close()

	_, err = db.ExecContext(ctx, `
		CREATE OR REPLACE FUNCTION public.ql_rpc_warning(label text)
		RETURNS integer
		LANGUAGE plpgsql
		AS $$
		BEGIN
			RAISE WARNING 'querylane rpc warning: %', label;
			RETURN 7;
		END
		$$;
	`)
	s.Require().NoError(err)
}
