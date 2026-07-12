// Package admin provides the AdminService implementation exposing
// operational introspection of querylane's own backend: live replicas, the
// background runner job queue including lease ownership, raw catalog sync
// state, and metrics sample storage. It is an operator-facing debugging
// surface; once authn/authz lands, access will be restricted to admins.
package admin

import (
	"context"
	"time"

	"connectrpc.com/connect"
	"google.golang.org/protobuf/types/known/durationpb"
	"google.golang.org/protobuf/types/known/timestamppb"

	"github.com/querylane/querylane/backend/aip"
	"github.com/querylane/querylane/backend/connectrpc/apierrors"
	v1alpha1 "github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1"
	v1connect "github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1/consolev1alpha1connect"
	"github.com/querylane/querylane/backend/resource"
	"github.com/querylane/querylane/backend/storage"
	"github.com/querylane/querylane/backend/storage/catalog"
	"github.com/querylane/querylane/backend/storage/gen/querylane/public/model"
)

var _ v1connect.AdminServiceHandler = (*Service)(nil)

// replicaStore reads the replica registry. Implemented by
// *storage.PGReplicaStore.
type replicaStore interface {
	ListReplicas(ctx context.Context, params aip.Params) ([]model.Replica, string, error)
	GetReplicasByIDs(ctx context.Context, ids []string) ([]model.Replica, error)
	DatabaseNow(ctx context.Context) (time.Time, error)
}

// runnerExecutionLister pages runner scheduling state from the meta DB.
// Implemented by *storage.PGRunnerExecutionStore.
type runnerExecutionLister interface {
	ListRunnerExecutions(ctx context.Context, params aip.Params) ([]model.RunnerExecutionState, string, error)
}

// syncStateLister pages raw catalog sync bookkeeping. Implemented by
// *catalog.PGSyncStore.
type syncStateLister interface {
	ListSyncStates(ctx context.Context, params aip.Params) ([]model.CatalogSyncState, string, error)
}

// sampleStatsLister reports metrics sample-table storage stats. Wired to
// storage.ListSampleTableStats over the meta DB.
type sampleStatsLister func(ctx context.Context) ([]storage.SampleTableStats, error)

// Service implements AdminService RPC handlers.
type Service struct {
	replicas        replicaStore
	executions      runnerExecutionLister
	syncStates      syncStateLister
	sampleStats     sampleStatsLister
	retentionPeriod time.Duration
}

// NewService creates a new AdminService.
func NewService(
	replicas replicaStore,
	executions runnerExecutionLister,
	syncStates syncStateLister,
	sampleStats sampleStatsLister,
	retentionPeriod time.Duration,
) *Service {
	return &Service{
		replicas:        replicas,
		executions:      executions,
		syncStates:      syncStates,
		sampleStats:     sampleStats,
		retentionPeriod: retentionPeriod,
	}
}

// ListReplicas returns a paginated list of backend replicas known from their
// heartbeats. Liveness is computed against the meta database clock — the
// clock that writes last_seen_at — so it is consistent across replicas.
func (s *Service) ListReplicas(ctx context.Context, req *connect.Request[v1alpha1.ListReplicasRequest]) (*connect.Response[v1alpha1.ListReplicasResponse], error) {
	params := aip.Params{
		PageSize:  req.Msg.GetPageSize(),
		PageToken: req.Msg.GetPageToken(),
		Filter:    req.Msg.GetFilter(),
		OrderBy:   req.Msg.GetOrderBy(),
	}

	rows, nextPageToken, err := s.replicas.ListReplicas(ctx, params)
	if err != nil {
		return nil, apierrors.MapRepoErr(ctx, err, apierrors.ResourceCtx{
			Type: resource.TypeReplica,
			Op:   "list_replicas",
		})
	}

	dbNow, err := s.replicas.DatabaseNow(ctx)
	if err != nil {
		return nil, apierrors.MapRepoErr(ctx, err, apierrors.ResourceCtx{
			Type: resource.TypeReplica,
			Op:   "list_replicas",
		})
	}

	liveAfter := dbNow.Add(-storage.ReplicaLivenessWindow)

	replicas := make([]*v1alpha1.Replica, len(rows))
	for i, row := range rows {
		replicas[i] = &v1alpha1.Replica{
			ReplicaId:  row.ID,
			Hostname:   row.Hostname,
			Pid:        row.Pid,
			StartedAt:  timestamppb.New(row.StartedAt),
			LastSeenAt: timestamppb.New(row.LastSeenAt),
			Active:     row.LastSeenAt.After(liveAfter),
		}
	}

	return connect.NewResponse(&v1alpha1.ListReplicasResponse{
		Replicas:      replicas,
		NextPageToken: nextPageToken,
	}), nil
}

// ListAdminRunnerExecutions returns runner scheduling state with lease
// ownership resolved to replica identities. The admin counterpart of
// RunnerService.ListRunnerExecutions, which exposes only a lease_held bool.
func (s *Service) ListAdminRunnerExecutions(ctx context.Context, req *connect.Request[v1alpha1.ListAdminRunnerExecutionsRequest]) (*connect.Response[v1alpha1.ListAdminRunnerExecutionsResponse], error) {
	params := aip.Params{
		PageSize:  req.Msg.GetPageSize(),
		PageToken: req.Msg.GetPageToken(),
		Filter:    req.Msg.GetFilter(),
		OrderBy:   req.Msg.GetOrderBy(),
	}

	rows, nextPageToken, err := s.executions.ListRunnerExecutions(ctx, params)
	if err != nil {
		return nil, apierrors.MapRepoErr(ctx, err, apierrors.ResourceCtx{
			Type: resource.TypeRunnerExecution,
			Op:   "list_admin_runner_executions",
		})
	}

	// Lease expiry is written DB-side (now()+interval), so liveness must be
	// judged against the meta database clock — the same reasoning as
	// ListReplicas. Using the serving replica's wall clock would misreport
	// held/expired leases under clock skew across the HA fleet.
	now, err := s.replicas.DatabaseNow(ctx)
	if err != nil {
		return nil, apierrors.MapRepoErr(ctx, err, apierrors.ResourceCtx{
			Type: resource.TypeReplica,
			Op:   "list_admin_runner_executions",
		})
	}

	hostnames, err := s.leaseOwnerHostnames(ctx, rows, now)
	if err != nil {
		return nil, apierrors.MapRepoErr(ctx, err, apierrors.ResourceCtx{
			Type: resource.TypeReplica,
			Op:   "list_admin_runner_executions",
		})
	}

	executions := make([]*v1alpha1.AdminRunnerExecution, len(rows))
	for i, row := range rows {
		executions[i] = toProtoAdminRunnerExecution(row, now, hostnames)
	}

	return connect.NewResponse(&v1alpha1.ListAdminRunnerExecutionsResponse{
		RunnerExecutions: executions,
		NextPageToken:    nextPageToken,
	}), nil
}

// leaseLive reports whether the row's lease is currently held. Same rule as
// RunnerService: an expired lease means a replica died mid-run and the
// target is up for reclaim.
func leaseLive(row model.RunnerExecutionState, now time.Time) bool {
	return row.LeaseOwner != nil && row.LeaseExpiresAt != nil && row.LeaseExpiresAt.After(now)
}

func toProtoAdminRunnerExecution(row model.RunnerExecutionState, now time.Time, hostnames map[string]string) *v1alpha1.AdminRunnerExecution {
	execution := &v1alpha1.AdminRunnerExecution{
		RunnerName: row.RunnerName,
		Target:     row.TargetName,
		LeaseHeld:  leaseLive(row, now),
	}

	if execution.GetLeaseHeld() {
		execution.LeaseOwner = &v1alpha1.ReplicaIdentity{
			ReplicaId: *row.LeaseOwner,
			Hostname:  hostnames[*row.LeaseOwner],
		}
		execution.LeaseExpiresAt = timestamppb.New(*row.LeaseExpiresAt)
	}

	if row.LastStartedAt != nil {
		execution.LastStartedAt = timestamppb.New(*row.LastStartedAt)
	}

	if row.LastFinishedAt != nil {
		execution.LastFinishedAt = timestamppb.New(*row.LastFinishedAt)
	}

	if row.LastSuccessAt != nil {
		execution.LastSuccessAt = timestamppb.New(*row.LastSuccessAt)
	}

	if row.LastError != nil {
		execution.LastError = *row.LastError
	}

	return execution
}

// ListCatalogSyncStates returns raw catalog sync bookkeeping per scope.
// Errors are deliberately NOT sanitized (unlike the user-facing
// CatalogSyncMetadata mapping): this is an operator debugging surface and
// the verbatim failure is the point.
func (s *Service) ListCatalogSyncStates(ctx context.Context, req *connect.Request[v1alpha1.ListCatalogSyncStatesRequest]) (*connect.Response[v1alpha1.ListCatalogSyncStatesResponse], error) {
	params := aip.Params{
		PageSize:  req.Msg.GetPageSize(),
		PageToken: req.Msg.GetPageToken(),
		Filter:    req.Msg.GetFilter(),
		OrderBy:   req.Msg.GetOrderBy(),
	}

	rows, nextPageToken, err := s.syncStates.ListSyncStates(ctx, params)
	if err != nil {
		return nil, apierrors.MapRepoErr(ctx, err, apierrors.ResourceCtx{
			Type: resource.TypeCatalogSync,
			Op:   "list_catalog_sync_states",
		})
	}

	states := make([]*v1alpha1.CatalogSyncState, len(rows))
	for i, row := range rows {
		states[i] = toProtoCatalogSyncState(row)
	}

	return connect.NewResponse(&v1alpha1.ListCatalogSyncStatesResponse{
		CatalogSyncStates: states,
		NextPageToken:     nextPageToken,
	}), nil
}

func toProtoCatalogSyncState(row model.CatalogSyncState) *v1alpha1.CatalogSyncState {
	state := &v1alpha1.CatalogSyncState{
		Scope:     row.Scope,
		Status:    syncStatusToProto(row.Status),
		UpdatedAt: timestamppb.New(row.UpdatedAt),
	}

	if row.LastSyncedAt != nil {
		state.LastSyncedAt = timestamppb.New(*row.LastSyncedAt)
	}

	if row.Error != nil {
		state.SyncError = *row.Error
	}

	return state
}

// syncStatusToProto maps the catalog_sync_state.status column to the API
// enum.
func syncStatusToProto(status string) v1alpha1.CatalogSyncStatus {
	switch status {
	case catalog.SyncStatusPending:
		return v1alpha1.CatalogSyncStatus_CATALOG_SYNC_STATUS_NEVER_SYNCED
	case catalog.SyncStatusSyncing:
		return v1alpha1.CatalogSyncStatus_CATALOG_SYNC_STATUS_SYNCING
	case catalog.SyncStatusSynced:
		return v1alpha1.CatalogSyncStatus_CATALOG_SYNC_STATUS_SYNCED
	case catalog.SyncStatusError:
		return v1alpha1.CatalogSyncStatus_CATALOG_SYNC_STATUS_ERROR
	default:
		return v1alpha1.CatalogSyncStatus_CATALOG_SYNC_STATUS_UNSPECIFIED
	}
}

// GetMetricsStorageStats reports size, row estimate, and retained sample
// range for every metrics sample table, plus the retention period the
// sample_retention runner enforces.
func (s *Service) GetMetricsStorageStats(ctx context.Context, _ *connect.Request[v1alpha1.GetMetricsStorageStatsRequest]) (*connect.Response[v1alpha1.GetMetricsStorageStatsResponse], error) {
	stats, err := s.sampleStats(ctx)
	if err != nil {
		return nil, apierrors.MapRepoErr(ctx, err, apierrors.ResourceCtx{
			Type: resource.TypeMetricSample,
			Op:   "get_metrics_storage_stats",
		})
	}

	tables := make([]*v1alpha1.SampleTableStats, len(stats))
	for i, stat := range stats {
		tables[i] = toProtoSampleTableStats(stat)
	}

	return connect.NewResponse(&v1alpha1.GetMetricsStorageStatsResponse{
		SampleTables:    tables,
		RetentionPeriod: durationpb.New(s.retentionPeriod),
	}), nil
}

// leaseOwnerHostnames resolves the distinct live lease owners on this page
// to their hostnames in one registry lookup. Owners whose replica row is
// gone (died and pruned) are simply absent.
func (s *Service) leaseOwnerHostnames(ctx context.Context, rows []model.RunnerExecutionState, now time.Time) (map[string]string, error) {
	ownerIDs := make([]string, 0, len(rows))

	seen := make(map[string]struct{}, len(rows))
	for _, row := range rows {
		if !leaseLive(row, now) {
			continue
		}

		if _, ok := seen[*row.LeaseOwner]; ok {
			continue
		}

		seen[*row.LeaseOwner] = struct{}{}
		ownerIDs = append(ownerIDs, *row.LeaseOwner)
	}

	replicas, err := s.replicas.GetReplicasByIDs(ctx, ownerIDs)
	if err != nil {
		return nil, err
	}

	hostnames := make(map[string]string, len(replicas))
	for _, replica := range replicas {
		hostnames[replica.ID] = replica.Hostname
	}

	return hostnames, nil
}

func toProtoSampleTableStats(stat storage.SampleTableStats) *v1alpha1.SampleTableStats {
	pb := &v1alpha1.SampleTableStats{
		TableName:         stat.TableName,
		EstimatedRowCount: stat.EstimatedRowCount,
		TotalBytes:        stat.TotalBytes,
	}

	if stat.OldestObservedAt != nil {
		pb.OldestSampleAt = timestamppb.New(*stat.OldestObservedAt)
	}

	if stat.NewestObservedAt != nil {
		pb.NewestSampleAt = timestamppb.New(*stat.NewestObservedAt)
	}

	return pb
}
