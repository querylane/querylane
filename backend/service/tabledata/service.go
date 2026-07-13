// Package tabledata provides the TableDataService implementation for live
// row reads against user-managed PostgreSQL tables.
package tabledata

import (
	"context"
	"errors"
	"time"

	"connectrpc.com/connect"
	"google.golang.org/protobuf/encoding/protowire"
	"google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/types/known/durationpb"
	"google.golang.org/protobuf/types/known/timestamppb"

	"github.com/querylane/querylane/backend/connectrpc/apierrors"
	"github.com/querylane/querylane/backend/engine"
	"github.com/querylane/querylane/backend/livequery"
	v1alpha1 "github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1"
	v1connect "github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1/consolev1alpha1connect"
	"github.com/querylane/querylane/backend/resource"
)

var _ v1connect.TableDataServiceHandler = (*Service)(nil)

const (
	defaultPageSize         = 50
	defaultStreamBatchSize  = 1000
	defaultStreamMaxRows    = 1_000_000
	streamBatchFlushSoftCap = 1000
	// The PostgreSQL ReadRows engine caps one page at 500 rows in
	// backend/engine/postgres/cell_truncation.go. StreamRows keeps that
	// engine ceiling for per-page memory/truncation behavior, then flushes
	// independently with streamBatchFlushSoftCap instead of tying the engine
	// page size to the public batch_size default.
	readRowsInternalPageSize = 500

	streamRowsBatchEventFieldNumber protowire.Number = 2
	streamRowsBatchRowsFieldNumber  protowire.Number = 1
)

type tableResolver interface {
	EnsureTableExists(ctx context.Context, table resource.TableName) error
}

type instanceOpener interface {
	OpenInstance(ctx context.Context, name resource.InstanceName) (engine.InstanceSession, error)
}

// Service implements the TableDataService RPC handlers.
type Service struct {
	resolver    tableResolver
	connManager instanceOpener
	tokens      *engine.TokenCodec
	liveQueries *livequery.Limiter
}

// NewService creates a new TableDataService. The token codec is used by
// ReadCellValue to verify full_value_token and is shared with the engine
// (which mints those tokens during ReadRows scans).
func NewService(resolver tableResolver, connManager instanceOpener, tokens *engine.TokenCodec, liveQueries *livequery.Limiter) *Service {
	if tokens == nil {
		panic("tabledata.NewService: token codec is required") //nolint:forbidigo // programmer error during DI setup
	}

	if liveQueries == nil {
		panic("tabledata.NewService: live query limiter is required") //nolint:forbidigo // programmer error during DI setup
	}

	return &Service{resolver: resolver, connManager: connManager, tokens: tokens, liveQueries: liveQueries}
}

// ReadRows reads a single page of rows from a table.
func (s *Service) ReadRows(ctx context.Context, req *connect.Request[v1alpha1.ReadRowsRequest]) (*connect.Response[v1alpha1.ReadRowsResponse], error) {
	tableRes, connErr := apierrors.ParseResourceWithError(req.Msg.GetName(), "name", resource.ParseTableName)
	if connErr != nil {
		return nil, connErr
	}

	release, err := s.liveQueries.Acquire(tableRes.Instance())
	if err != nil {
		return nil, apierrors.MapLiveQueryLimit(err)
	}
	defer release()

	if err := s.resolver.EnsureTableExists(ctx, tableRes); err != nil {
		return nil, apierrors.MapEngineErr(ctx, err, apierrors.ResourceCtx{
			Type: tableRes.ResourceType(), Name: tableRes.String(), Op: "read_rows",
		})
	}

	instSession, err := s.connManager.OpenInstance(ctx, tableRes.Instance())
	if err != nil {
		return nil, apierrors.MapEngineErr(ctx, err, apierrors.ResourceCtx{
			Type: tableRes.ResourceType(), Name: tableRes.String(), Op: "read_rows",
		})
	}
	defer instSession.Close()

	dbSession, err := instSession.OpenDatabase(ctx, tableRes.DatabaseID)
	if err != nil {
		return nil, apierrors.MapEngineErr(ctx, err, apierrors.ResourceCtx{
			Type: tableRes.ResourceType(), Name: tableRes.String(), Op: "read_rows",
		})
	}
	defer dbSession.Close()

	pageSize := int(req.Msg.GetPageSize())
	if pageSize == 0 {
		pageSize = defaultPageSize
	}

	result, err := dbSession.ReadRows(ctx, engine.ReadRowsParams{
		ResourceName:     tableRes.String(),
		SchemaName:       tableRes.SchemaID,
		TableName:        tableRes.TableID,
		PageSize:         pageSize,
		PageToken:        req.Msg.GetPageToken(),
		SelectedColumns:  req.Msg.GetSelectedColumns(),
		OrderBy:          req.Msg.GetOrderBy(),
		Filter:           req.Msg.GetFilter(),
		RowCountMode:     req.Msg.GetRowCountMode(),
		CellValueMode:    req.Msg.GetCellValueMode(),
		MaxCellBytes:     int(req.Msg.GetMaxCellBytes()),
		MaxResponseBytes: req.Msg.GetMaxResponseBytes(),
	})
	if err != nil {
		return nil, apierrors.MapEngineErr(ctx, err, apierrors.ResourceCtx{
			Type: tableRes.ResourceType(), Name: tableRes.String(), Op: "read_rows",
		})
	}

	return connect.NewResponse(&v1alpha1.ReadRowsResponse{
		ResultSet: &v1alpha1.TableResultSet{
			Columns:            result.Columns,
			Rows:               result.Rows,
			RowCount:           result.RowCount,
			RowIdentity:        result.RowIdentity,
			PaginationStrategy: result.PaginationStrategy,
			ObservedAt:         timestamppb.New(result.ObservedAt),
		},
		NextPageToken: result.NextPageToken,
		Limits:        result.Limits,
	}), nil
}

// StreamRows streams rows for export. It reuses the same engine read path as
// ReadRows so selected columns, filtering, ordering, cell preview/full mode,
// and validation stay identical to the interactive grid.
func (s *Service) StreamRows(ctx context.Context, req *connect.Request[v1alpha1.StreamRowsRequest], stream *connect.ServerStream[v1alpha1.StreamRowsResponse]) error {
	startedAt := time.Now()

	tableRes, connErr := apierrors.ParseResourceWithError(req.Msg.GetName(), "name", resource.ParseTableName)
	if connErr != nil {
		return connErr
	}

	release, err := s.liveQueries.Acquire(tableRes.Instance())
	if err != nil {
		return apierrors.MapLiveQueryLimit(err)
	}
	defer release()

	mapErr := func(err error) error {
		return apierrors.MapEngineErr(ctx, err, apierrors.ResourceCtx{
			Type: tableRes.ResourceType(), Name: tableRes.String(), Op: "stream_rows",
		})
	}

	if err := s.resolver.EnsureTableExists(ctx, tableRes); err != nil {
		return mapErr(err)
	}

	instSession, err := s.connManager.OpenInstance(ctx, tableRes.Instance())
	if err != nil {
		return mapErr(err)
	}
	defer instSession.Close()

	dbSession, err := instSession.OpenDatabase(ctx, tableRes.DatabaseID)
	if err != nil {
		return mapErr(err)
	}
	defer dbSession.Close()

	batchSize := resolveStreamBatchSize(req.Msg.GetBatchSize())
	maxRows := resolveStreamMaxRows(req.Msg.GetMaxRows())
	maxTotalBytes := req.Msg.GetMaxTotalBytes()
	streamer := streamRowsSender{
		batchFlushRows: min(batchSize, streamBatchFlushSoftCap),
		maxRows:        maxRows,
		maxTotalBytes:  maxTotalBytes,
		stream:         stream,
	}

	pageToken := ""
	metadataSent := false

	for streamer.canReadMore() {
		pageSize := min(readRowsInternalPageSize, int(streamer.remainingRows()))
		if pageSize <= 0 {
			break
		}

		result, err := dbSession.ReadRows(ctx, engine.ReadRowsParams{
			ResourceName:    tableRes.String(),
			SchemaName:      tableRes.SchemaID,
			TableName:       tableRes.TableID,
			PageSize:        pageSize,
			PageToken:       pageToken,
			SelectedColumns: req.Msg.GetSelectedColumns(),
			OrderBy:         req.Msg.GetOrderBy(),
			Filter:          req.Msg.GetFilter(),
			RowCountMode:    v1alpha1.RowCountMode_ROW_COUNT_MODE_NONE,
			CellValueMode:   req.Msg.GetCellValueMode(),
			MaxCellBytes:    int(req.Msg.GetMaxCellBytes()),
		})
		if err != nil {
			return mapErr(err)
		}

		if !metadataSent {
			metadataSent = true

			if err := stream.Send(&v1alpha1.StreamRowsResponse{
				Event: &v1alpha1.StreamRowsResponse_Metadata{
					Metadata: &v1alpha1.StreamRowsMetadata{
						Columns:     result.Columns,
						RowIdentity: result.RowIdentity,
						ObservedAt:  timestamppb.New(result.ObservedAt),
						// First-page engine limits describe ReadRows page
						// budgeting only; stream-level row/byte caps are
						// surfaced in the final stats event.
						Limits: result.Limits,
					},
				},
			}); err != nil {
				return err
			}
		}

		if err := streamer.addRows(result.Rows); err != nil {
			return err
		}

		if streamer.truncated {
			break
		}

		pageToken = result.NextPageToken
		if pageToken == "" {
			break
		}
	}

	if !metadataSent {
		return connect.NewError(
			connect.CodeInternal,
			errors.New("stream_rows engine returned no metadata"),
		)
	}

	if pageToken != "" && !streamer.canReadMore() {
		// max_rows hit exactly on a page boundary while the engine reported
		// another page, so rows remain available beyond this stream.
		streamer.truncated = true
	}

	if err := streamer.flush(); err != nil {
		return err
	}

	return stream.Send(&v1alpha1.StreamRowsResponse{
		Event: &v1alpha1.StreamRowsResponse_Stats{
			Stats: &v1alpha1.StreamRowsStats{
				RowCount:  streamer.rowCount,
				Latency:   durationpb.New(time.Since(startedAt)),
				Truncated: streamer.truncated,
			},
		},
	})
}

func resolveStreamBatchSize(requested int32) int {
	if requested <= 0 {
		return defaultStreamBatchSize
	}

	return int(requested)
}

func resolveStreamMaxRows(requested int64) int64 {
	if requested <= 0 {
		return defaultStreamMaxRows
	}

	return requested
}

type streamRowsSender struct {
	batchFlushRows int
	maxRows        int64
	maxTotalBytes  int64
	stream         *connect.ServerStream[v1alpha1.StreamRowsResponse]

	batch             []*v1alpha1.TableResultRow
	batchPayloadBytes int64
	payloadBytes      int64
	rowCount          int64
	truncated         bool
}

func (s *streamRowsSender) canReadMore() bool {
	return !s.truncated && s.rowCount < s.maxRows
}

func (s *streamRowsSender) remainingRows() int64 {
	return s.maxRows - s.rowCount
}

func (s *streamRowsSender) addRows(rows []*v1alpha1.TableResultRow) error {
	for _, row := range rows {
		if !s.canReadMore() {
			s.truncated = true
			break
		}

		if s.maxTotalBytes > 0 {
			rowPayloadBytes := streamRowsBatchRowPayloadSize(row)
			candidateBatchPayloadBytes := s.batchPayloadBytes + rowPayloadBytes

			candidatePayloadBytes := s.payloadBytes +
				streamRowsBatchResponsePayloadSize(candidateBatchPayloadBytes)
			if candidatePayloadBytes > s.maxTotalBytes {
				s.truncated = true
				break
			}

			s.batchPayloadBytes = candidateBatchPayloadBytes
		}

		s.batch = append(s.batch, row)
		s.rowCount++

		if len(s.batch) >= s.batchFlushRows {
			if err := s.flush(); err != nil {
				return err
			}
		}
	}

	return nil
}

func (s *streamRowsSender) flush() error {
	if len(s.batch) == 0 {
		return nil
	}

	batch := s.batch
	s.batch = nil
	s.batchPayloadBytes = 0
	response := &v1alpha1.StreamRowsResponse{
		Event: &v1alpha1.StreamRowsResponse_Batch{
			Batch: &v1alpha1.StreamRowsBatch{Rows: batch},
		},
	}
	s.payloadBytes += int64(proto.Size(response))

	return s.stream.Send(response)
}

func streamRowsBatchRowPayloadSize(row *v1alpha1.TableResultRow) int64 {
	rowBytes := proto.Size(row)
	return int64(protowire.SizeTag(streamRowsBatchRowsFieldNumber) + protowire.SizeBytes(rowBytes))
}

func streamRowsBatchResponsePayloadSize(batchPayloadBytes int64) int64 {
	return int64(protowire.SizeTag(streamRowsBatchEventFieldNumber)) +
		int64(protowire.SizeBytes(int(batchPayloadBytes)))
}

// ReadCellValue fetches the full (un-truncated) value of a single cell
// previously surfaced as TableCell.full_value_token in a ReadRows page.
//
// The opaque token decodes to a TableCellFullValueTokenPayload bound to a
// specific table + column + row identity. The service rejects a token
// whose payload table_name does not match req.Name (defense in depth
// against cross-table replay).
func (s *Service) ReadCellValue(ctx context.Context, req *connect.Request[v1alpha1.ReadCellValueRequest]) (*connect.Response[v1alpha1.ReadCellValueResponse], error) {
	tableRes, connErr := apierrors.ParseResourceWithError(req.Msg.GetName(), "name", resource.ParseTableName)
	if connErr != nil {
		return nil, connErr
	}

	var payload v1alpha1.TableCellFullValueTokenPayload
	if err := s.tokens.Verify(engine.TokenKindFullValueCell, req.Msg.GetFullValueToken(), &payload); err != nil {
		return nil, apierrors.NewInvalidArgumentError(
			apierrors.NewFieldViolation("full_value_token", err.Error()),
		)
	}

	if payload.GetTableName() != tableRes.String() {
		return nil, apierrors.NewInvalidArgumentError(
			apierrors.NewFieldViolation("full_value_token", "token bound to a different table"),
		)
	}

	// Enforce TTL.
	if issued := payload.GetIssuedAt().AsTime(); issued.IsZero() || time.Since(issued) > 5*time.Minute {
		return nil, apierrors.NewInvalidArgumentError(
			apierrors.NewFieldViolation("full_value_token", "token expired"),
		)
	}

	release, err := s.liveQueries.Acquire(tableRes.Instance())
	if err != nil {
		return nil, apierrors.MapLiveQueryLimit(err)
	}
	defer release()

	mapErr := func(err error) error {
		return apierrors.MapEngineErr(ctx, err, apierrors.ResourceCtx{
			Type: tableRes.ResourceType(), Name: tableRes.String(), Op: "read_cell_value",
		})
	}

	if err := s.resolver.EnsureTableExists(ctx, tableRes); err != nil {
		return nil, mapErr(err)
	}

	instSession, err := s.connManager.OpenInstance(ctx, tableRes.Instance())
	if err != nil {
		return nil, mapErr(err)
	}
	defer instSession.Close()

	dbSession, err := instSession.OpenDatabase(ctx, tableRes.DatabaseID)
	if err != nil {
		return nil, mapErr(err)
	}
	defer dbSession.Close()

	result, err := dbSession.ReadCellValue(ctx, engine.ReadCellValueParams{
		SchemaName:     tableRes.SchemaID,
		TableName:      tableRes.TableID,
		Column:         payload.GetColumn(),
		RowIdentity:    payload.GetRowIdentity(),
		IdentityValues: payload.GetIdentityValues(),
		MaxBytes:       req.Msg.GetMaxBytes(),
	})
	if err != nil {
		return nil, mapErr(err)
	}

	return connect.NewResponse(&v1alpha1.ReadCellValueResponse{
		Value: result.Cell,
	}), nil
}
