// Package sqlsvc provides the SQLService implementation for ad-hoc read-only
// query execution against user-managed PostgreSQL databases.
package sqlsvc

import (
	"context"
	"time"

	"connectrpc.com/connect"
	"google.golang.org/protobuf/types/known/durationpb"

	"github.com/querylane/querylane/backend/connectrpc/apierrors"
	"github.com/querylane/querylane/backend/engine"
	v1alpha1 "github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1"
	v1connect "github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1/consolev1alpha1connect"
	"github.com/querylane/querylane/backend/resource"
)

var _ v1connect.SQLServiceHandler = (*Service)(nil)

const (
	defaultRowLimit  = 1000
	defaultBatchSize = 250
	maxTimeout       = 60 * time.Second
	minTimeoutGrace  = 50 * time.Millisecond
	maxTimeoutGrace  = 500 * time.Millisecond
)

type instanceOpener interface {
	OpenInstance(ctx context.Context, name resource.InstanceName) (engine.InstanceSession, error)
}

// Service implements the SQLService RPC handlers.
type Service struct {
	connManager instanceOpener
}

// NewService creates a new SQLService.
func NewService(connManager instanceOpener) *Service {
	return &Service{connManager: connManager}
}

// ExecuteQuery executes a read-only SQL query and streams results.
func (s *Service) ExecuteQuery(ctx context.Context, req *connect.Request[v1alpha1.ExecuteQueryRequest], stream *connect.ServerStream[v1alpha1.ExecuteQueryResponse]) error {
	dbRes, connErr := apierrors.ParseResourceWithError(req.Msg.GetParent(), "parent", resource.ParseDatabaseName)
	if connErr != nil {
		return connErr
	}

	if err := validateReadOnlyStatement(req.Msg.GetStatement()); err != nil {
		return apierrors.MapEngineErr(ctx, err, apierrors.ResourceCtx{
			Type: dbRes.ResourceType(), Name: dbRes.String(), Op: "execute_query",
		})
	}

	instSession, err := s.connManager.OpenInstance(ctx, dbRes.Instance())
	if err != nil {
		return apierrors.MapEngineErr(ctx, err, apierrors.ResourceCtx{
			Type: dbRes.ResourceType(), Name: dbRes.String(), Op: "execute_query",
		})
	}
	defer instSession.Close()

	dbSession, err := instSession.OpenDatabase(ctx, dbRes.DatabaseID)
	if err != nil {
		return apierrors.MapEngineErr(ctx, err, apierrors.ResourceCtx{
			Type: dbRes.ResourceType(), Name: dbRes.String(), Op: "execute_query",
		})
	}
	defer dbSession.Close()

	rowLimit := int(req.Msg.GetRowLimit())
	if rowLimit == 0 {
		rowLimit = defaultRowLimit
	}

	batchSize := int(req.Msg.GetBatchSize())
	if batchSize == 0 {
		batchSize = defaultBatchSize
	}

	timeout := maxTimeout
	if reqTimeout := req.Msg.GetTimeout(); reqTimeout != nil && reqTimeout.AsDuration() > 0 {
		timeout = min(reqTimeout.AsDuration(), maxTimeout)
	}

	queryCtx, cancel := context.WithTimeout(ctx, timeoutWithPostgresGrace(timeout))
	defer cancel()

	result, err := dbSession.ExecuteQuery(queryCtx, engine.ExecuteQueryParams{
		Statement:     req.Msg.GetStatement(),
		RowLimit:      rowLimit,
		DefaultSchema: req.Msg.GetDefaultSchema(),
		Timeout:       timeout,
	})
	if err != nil {
		return apierrors.MapEngineErr(ctx, err, apierrors.ResourceCtx{
			Type: dbRes.ResourceType(), Name: dbRes.String(), Op: "execute_query",
		})
	}
	defer result.Close()

	if err := stream.Send(&v1alpha1.ExecuteQueryResponse{
		Result: &v1alpha1.ExecuteQueryResponse_ColumnMetadata{
			ColumnMetadata: &v1alpha1.QueryColumnMetadata{Columns: result.Columns()},
		},
	}); err != nil {
		return err
	}

	batch := make([]*v1alpha1.TableResultRow, 0, batchSize)

	flushBatch := func() error {
		if len(batch) == 0 {
			return nil
		}

		if err := stream.Send(&v1alpha1.ExecuteQueryResponse{
			Result: &v1alpha1.ExecuteQueryResponse_RowBatch{
				RowBatch: &v1alpha1.QueryRowBatch{Rows: batch},
			},
		}); err != nil {
			return err
		}

		batch = batch[:0]

		return nil
	}

	for result.Next() {
		batch = append(batch, result.Row())
		if len(batch) < batchSize {
			continue
		}

		if err := flushBatch(); err != nil {
			return err
		}
	}

	if err := result.Err(); err != nil {
		return apierrors.MapEngineErr(ctx, err, apierrors.ResourceCtx{
			Type: dbRes.ResourceType(), Name: dbRes.String(), Op: "execute_query",
		})
	}

	if err := flushBatch(); err != nil {
		return err
	}

	stats := result.Stats()

	return stream.Send(&v1alpha1.ExecuteQueryResponse{
		Result: &v1alpha1.ExecuteQueryResponse_Stats{
			Stats: &v1alpha1.QueryStats{
				RowCount:  stats.RowCount,
				Latency:   durationpb.New(stats.Latency),
				Notices:   stats.Notices,
				Truncated: stats.Truncated,
			},
		},
	})
}

// ExplainQuery produces an EXPLAIN plan for a query.
func (s *Service) ExplainQuery(ctx context.Context, req *connect.Request[v1alpha1.ExplainQueryRequest]) (*connect.Response[v1alpha1.ExplainQueryResponse], error) {
	dbRes, connErr := apierrors.ParseResourceWithError(req.Msg.GetParent(), "parent", resource.ParseDatabaseName)
	if connErr != nil {
		return nil, connErr
	}

	if err := validateReadOnlyStatement(req.Msg.GetStatement()); err != nil {
		return nil, apierrors.MapEngineErr(ctx, err, apierrors.ResourceCtx{
			Type: dbRes.ResourceType(), Name: dbRes.String(), Op: "explain_query",
		})
	}

	instSession, err := s.connManager.OpenInstance(ctx, dbRes.Instance())
	if err != nil {
		return nil, apierrors.MapEngineErr(ctx, err, apierrors.ResourceCtx{
			Type: dbRes.ResourceType(), Name: dbRes.String(), Op: "explain_query",
		})
	}
	defer instSession.Close()

	dbSession, err := instSession.OpenDatabase(ctx, dbRes.DatabaseID)
	if err != nil {
		return nil, apierrors.MapEngineErr(ctx, err, apierrors.ResourceCtx{
			Type: dbRes.ResourceType(), Name: dbRes.String(), Op: "explain_query",
		})
	}
	defer dbSession.Close()

	timeout := maxTimeout
	if reqTimeout := req.Msg.GetTimeout(); reqTimeout != nil && reqTimeout.AsDuration() > 0 {
		timeout = min(reqTimeout.AsDuration(), maxTimeout)
	}

	queryCtx, cancel := context.WithTimeout(ctx, timeoutWithPostgresGrace(timeout))
	defer cancel()

	result, err := dbSession.ExplainQuery(queryCtx, engine.ExplainQueryParams{
		Statement:     req.Msg.GetStatement(),
		Format:        req.Msg.GetFormat(),
		Analyze:       req.Msg.GetAnalyze(),
		Buffers:       req.Msg.GetBuffers(),
		DefaultSchema: req.Msg.GetDefaultSchema(),
		Timeout:       timeout,
	})
	if err != nil {
		return nil, apierrors.MapEngineErr(ctx, err, apierrors.ResourceCtx{
			Type: dbRes.ResourceType(), Name: dbRes.String(), Op: "explain_query",
		})
	}

	return connect.NewResponse(&v1alpha1.ExplainQueryResponse{
		Plan:    result.Plan,
		Notices: result.Notices,
		Latency: durationpb.New(result.Latency),
	}), nil
}

func timeoutWithPostgresGrace(timeout time.Duration) time.Duration {
	if timeout <= 0 {
		return timeout
	}

	grace := min(max(timeout/10, minTimeoutGrace), maxTimeoutGrace)

	return timeout + grace
}
