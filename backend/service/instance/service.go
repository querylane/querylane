// Package instance provides the InstanceService implementation for managing
// instance resources and database connection records.
package instance

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net"
	"strings"
	"time"

	"connectrpc.com/connect"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/rs/xid"
	"google.golang.org/genproto/googleapis/rpc/errdetails"
	rpcstatus "google.golang.org/genproto/googleapis/rpc/status"
	"google.golang.org/protobuf/types/known/anypb"
	"google.golang.org/protobuf/types/known/fieldmaskpb"
	"google.golang.org/protobuf/types/known/timestamppb"

	"github.com/querylane/querylane/backend/connectrpc/apierrors"
	"github.com/querylane/querylane/backend/engine"
	"github.com/querylane/querylane/backend/postgreserrors"
	v1alpha1 "github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1"
	v1connect "github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1/consolev1alpha1connect"
	"github.com/querylane/querylane/backend/resource"
	"github.com/querylane/querylane/backend/storage"
)

// Ensure Service implements the InstanceServiceHandler interface at compile time.
var _ v1connect.InstanceServiceHandler = (*Service)(nil)

// ConnectionManager defines the interface for connection lifecycle operations.
// It supports testing connections during instance creation and evicting
// cached pools when instances are modified or deleted.
type ConnectionManager interface {
	TestConnection(ctx context.Context, instance *v1alpha1.Instance) error
	EvictInstance(instanceName resource.InstanceName)
}

// CatalogProvider provides catalog operations needed by the instance service:
// invalidation when instances change, and server info retrieval for GetInstance.
type CatalogProvider interface {
	InvalidateInstance(ctx context.Context, instance resource.InstanceName) error
	GetServerInfo(ctx context.Context, instance resource.InstanceName) (*engine.ServerInfo, error)
}

// OverviewFetcher provides live health signals for a PostgreSQL instance.
type OverviewFetcher interface {
	GetInstanceOverview(ctx context.Context, instance resource.InstanceName) (*engine.InstanceOverview, error)
}

// HealthFetcher provides live actionable health checks for a PostgreSQL instance.
type HealthFetcher interface {
	CheckInstanceHealth(ctx context.Context, instance resource.InstanceName) (*engine.InstanceHealth, error)
}

// ActivityFetcher provides the narrow connection-activity polling path.
type ActivityFetcher interface {
	CheckInstanceActivity(ctx context.Context, instance resource.InstanceName) (*engine.InstanceHealth, error)
}

// Reader provides read-only instance views with runtime state applied.
type Reader interface {
	ListInstances(ctx context.Context, pageSize int32, pageToken string, filter string, orderBy string) ([]*v1alpha1.Instance, string, error)
	GetInstance(ctx context.Context, name string) (*v1alpha1.Instance, error)
}

// ConnectionStateRecorder records observations of an instance's live
// connection state. CreateInstance uses it to seed an ACTIVE row immediately
// after a successful test-connect so the UI doesn't have to wait for the next
// background runner cycle.
type ConnectionStateRecorder interface {
	RecordActive(ctx context.Context, instanceID string, checkedAt time.Time) error
}

// Service provides instance CRUD functionality.
// It implements the InstanceServiceHandler interface and serves instance
// management operations including create, get, list, update, and delete.
type Service struct {
	instanceReader     Reader
	instanceRepo       storage.InstanceRepository
	connectionRecorder ConnectionStateRecorder
	connManager        ConnectionManager
	catalog            CatalogProvider
	overview           OverviewFetcher
	health             HealthFetcher
	activity           ActivityFetcher
	readOnly           bool
	connectionTests    *ConnectionTestGuard
}

// NewService creates a new instance of the instance service.
// When readOnly is true (config-managed instances), mutation RPCs
// return FailedPrecondition immediately without doing any work.
func NewService(
	instanceReader Reader,
	instanceRepo storage.InstanceRepository,
	connectionRecorder ConnectionStateRecorder,
	connManager ConnectionManager,
	catalog CatalogProvider,
	overview OverviewFetcher,
	readOnly bool,
	connectionTests *ConnectionTestGuard,
) *Service {
	if connectionTests == nil {
		panic("instance.NewService: connection test guard is required") //nolint:forbidigo // programmer error in dependency wiring
	}

	health, _ := overview.(HealthFetcher)
	activity, _ := overview.(ActivityFetcher)

	return &Service{
		instanceReader:     instanceReader,
		instanceRepo:       instanceRepo,
		connectionRecorder: connectionRecorder,
		connManager:        connManager,
		catalog:            catalog,
		overview:           overview,
		health:             health,
		activity:           activity,
		readOnly:           readOnly,
		connectionTests:    connectionTests,
	}
}

// CreateInstance creates a new instance with the provided configuration.
func (s *Service) CreateInstance(ctx context.Context, req *connect.Request[v1alpha1.CreateInstanceRequest]) (*connect.Response[v1alpha1.CreateInstanceResponse], error) {
	if s.readOnly {
		return nil, configManagedError()
	}

	createBody, err := s.createInstanceRequestToBody(req.Msg)
	if err != nil {
		return nil, err
	}

	if err := s.connectionTests.admit(req.Peer().Addr); err != nil {
		return nil, err
	}

	instanceID := req.Msg.GetInstanceId()

	responseInstanceID := instanceID
	if responseInstanceID == "" {
		responseInstanceID = xid.New().String()
	}

	// Both validate_only and real creation require a successful connection test
	// before proceeding.
	if err := s.connManager.TestConnection(ctx, createBody.instance); err != nil {
		return nil, s.connectionTestError(ctx, createBody.configField, "", err)
	}

	if req.Msg.GetValidateOnly() {
		testInstance := &v1alpha1.Instance{
			Name:                    "instances/" + responseInstanceID,
			DisplayName:             createBody.instance.GetDisplayName(),
			Labels:                  createBody.instance.GetLabels(),
			Config:                  createBody.instance.GetConfig(),
			ConnectionState:         v1alpha1.Instance_CONNECTION_STATE_ACTIVE,
			LastConnectionCheckTime: timestamppb.Now(),
		}
		storage.RedactInstanceForAPI(testInstance)

		return connect.NewResponse(&v1alpha1.CreateInstanceResponse{
			Instance: testInstance,
		}), nil
	}

	createdInstance, err := s.instanceRepo.CreateInstance(ctx, createBody.instance, responseInstanceID)
	if err != nil {
		instanceName := "instances/" + responseInstanceID

		return nil, apierrors.MapRepoErr(ctx, err, apierrors.ResourceCtx{
			Type: resource.TypeInstance,
			Name: instanceName,
			Op:   "create_instance",
		})
	}

	checkedAt := time.Now()
	if createdResource, parseErr := resource.ParseInstanceName(createdInstance.GetName()); parseErr == nil {
		if err := s.connectionRecorder.RecordActive(ctx, createdResource.InstanceID, checkedAt); err != nil {
			slog.WarnContext(ctx, "failed to persist instance runtime state after create",
				slog.String("instance", createdInstance.GetName()),
				slog.String("error", err.Error()))
		}
	}

	// Reflect the just-recorded state on the response so the client sees the
	// outcome of the synchronous probe without waiting for a re-read.
	createdInstance.ConnectionState = v1alpha1.Instance_CONNECTION_STATE_ACTIVE
	createdInstance.LastConnectionCheckTime = timestamppb.New(checkedAt)

	storage.RedactInstanceForAPI(createdInstance)

	res := &v1alpha1.CreateInstanceResponse{
		Instance: createdInstance,
	}

	return connect.NewResponse(res), nil
}

// TestInstanceConnection validates PostgreSQL connection details without
// creating or updating an instance resource.
func (s *Service) TestInstanceConnection(ctx context.Context, req *connect.Request[v1alpha1.TestInstanceConnectionRequest]) (*connect.Response[v1alpha1.TestInstanceConnectionResponse], error) {
	if err := s.connectionTests.admit(req.Peer().Addr); err != nil {
		return nil, err
	}

	if err := s.connManager.TestConnection(ctx, &v1alpha1.Instance{Config: req.Msg.GetConfig()}); err != nil {
		return nil, s.connectionTestError(ctx, "config", "", err)
	}

	return connect.NewResponse(&v1alpha1.TestInstanceConnectionResponse{}), nil
}

func validatePostgresConfigSSLNegotiation(config *v1alpha1.PostgresConfig, fieldPath string) *connect.Error {
	if config == nil {
		return nil
	}

	switch config.GetSslNegotiation() {
	case v1alpha1.PostgresConfig_SSL_NEGOTIATION_UNSPECIFIED,
		v1alpha1.PostgresConfig_SSL_NEGOTIATION_POSTGRES:
		return nil
	case v1alpha1.PostgresConfig_SSL_NEGOTIATION_DIRECT:
		if isDirectSSLNegotiationMode(config.GetSslMode()) {
			return nil
		}

		return apierrors.NewInvalidArgumentError(
			apierrors.NewFieldViolation(
				fieldPath+".ssl_negotiation",
				"ssl_negotiation direct requires ssl_mode require, verify-ca, or verify-full",
			),
		)
	default:
		return apierrors.NewInvalidArgumentError(
			apierrors.NewFieldViolation(fieldPath+".ssl_negotiation", "must be postgres or direct"),
		)
	}
}

func isDirectSSLNegotiationMode(sslMode v1alpha1.PostgresConfig_SslMode) bool {
	return sslMode == v1alpha1.PostgresConfig_SSL_MODE_REQUIRE ||
		sslMode == v1alpha1.PostgresConfig_SSL_MODE_VERIFY_CA ||
		sslMode == v1alpha1.PostgresConfig_SSL_MODE_VERIFY_FULL
}

// ListInstances returns a paginated list of instances.
func (s *Service) ListInstances(ctx context.Context, req *connect.Request[v1alpha1.ListInstancesRequest]) (*connect.Response[v1alpha1.ListInstancesResponse], error) {
	instances, nextPageToken, err := s.instanceReader.ListInstances(
		ctx,
		req.Msg.GetPageSize(),
		req.Msg.GetPageToken(),
		req.Msg.GetFilter(),
		req.Msg.GetOrderBy(),
	)
	if err != nil {
		return nil, apierrors.MapRepoErr(ctx, err, apierrors.ResourceCtx{
			Type: resource.TypeInstance,
			Op:   "list_instances",
		})
	}

	for _, inst := range instances {
		storage.RedactInstanceForAPI(inst)
	}

	res := &v1alpha1.ListInstancesResponse{
		Instances:     instances,
		NextPageToken: nextPageToken,
	}

	return connect.NewResponse(res), nil
}

// GetInstance returns a single instance and, when reachable, its live server
// info; passwords and other secrets are redacted before the response leaves
// the server.
func (s *Service) GetInstance(ctx context.Context, req *connect.Request[v1alpha1.GetInstanceRequest]) (*connect.Response[v1alpha1.GetInstanceResponse], error) {
	instanceResource, connectErr := apierrors.ParseResourceWithError(req.Msg.GetName(), "name", resource.ParseInstanceName)
	if connectErr != nil {
		return nil, connectErr
	}

	instanceName := instanceResource.String()

	instance, err := s.instanceReader.GetInstance(ctx, instanceName)
	if err != nil {
		return nil, apierrors.MapRepoErr(ctx, err, apierrors.ResourceCtx{
			Type: instanceResource.ResourceType(),
			Name: instanceName,
			Op:   "get_instance",
		})
	}

	storage.RedactInstanceForAPI(instance)

	resp := &v1alpha1.GetInstanceResponse{Instance: instance}

	if instance.GetConnectionState() == v1alpha1.Instance_CONNECTION_STATE_ACTIVE {
		serverInfo, err := s.buildServerInfo(ctx, instanceResource)
		if err != nil {
			resp.PartialErrors = append(resp.PartialErrors, metricPartialError("server_info", "failed to query server info", err))

			// The sync may have marked the instance as ERROR in the DB.
			// Re-read so this response reflects the current state.
			if fresh, rerr := s.instanceReader.GetInstance(ctx, instanceName); rerr == nil {
				storage.RedactInstanceForAPI(fresh)
				resp.Instance = fresh
			}
		} else {
			resp.ServerInfo = serverInfo
		}
	}

	return connect.NewResponse(resp), nil
}

// UpdateInstance applies a partial update to an existing instance, evicts the
// cached connection pool, and invalidates cached catalog data so subsequent
// reads re-discover the new server.
func (s *Service) UpdateInstance(ctx context.Context, req *connect.Request[v1alpha1.UpdateInstanceRequest]) (*connect.Response[v1alpha1.UpdateInstanceResponse], error) {
	if s.readOnly {
		return nil, configManagedError()
	}

	mask := req.Msg.GetUpdateMask()
	instance := req.Msg.GetInstance()

	if instance == nil {
		return nil, apierrors.NewInvalidArgumentError(
			apierrors.NewFieldViolation("instance", "is required"),
		)
	}

	if mask == nil || !mask.IsValid(instance) {
		return nil, apierrors.NewInvalidArgumentError(
			apierrors.NewFieldViolation("update_mask", "contains field paths that do not exist in the schema"),
		)
	}

	resourceID, connectErr := apierrors.ParseResourceWithError(instance.GetName(), "instance.name", resource.ParseInstanceName)
	if connectErr != nil {
		return nil, connectErr
	}

	var (
		updatedInstance *v1alpha1.Instance
		err             error
	)

	if updateMaskTouchesConfig(mask) {
		if err := s.connectionTests.admit(req.Peer().Addr); err != nil {
			return nil, err
		}

		updatedInstance, err = s.instanceRepo.UpdateInstanceWithValidation(
			ctx,
			instance,
			mask,
			func(ctx context.Context, mergedInstance *v1alpha1.Instance) error {
				if err := validatePostgresConfigSSLNegotiation(mergedInstance.GetConfig(), "instance.config"); err != nil {
					return err
				}

				if err := s.connManager.TestConnection(ctx, mergedInstance); err != nil {
					return s.connectionTestError(ctx, "instance.config", instance.GetName(), err)
				}

				return nil
			},
		)
	} else {
		updatedInstance, err = s.instanceRepo.UpdateInstance(ctx, instance, mask)
	}

	if err != nil {
		var connectErr *connect.Error
		if errors.As(err, &connectErr) {
			return nil, connectErr
		}

		return nil, apierrors.MapRepoErr(ctx, err, apierrors.ResourceCtx{
			Type: resourceID.ResourceType(),
			Name: instance.GetName(),
			Op:   "update_instance",
		})
	}

	// Evict the cached connection pool so it gets recreated with the new config.
	s.connManager.EvictInstance(resourceID)

	// Invalidate cached catalog data so it will be re-synced with the new config.
	if err := s.catalog.InvalidateInstance(ctx, resourceID); err != nil {
		slog.ErrorContext(ctx, "failed to invalidate catalog after instance update",
			slog.String("instance", resourceID.String()), slog.String("error", err.Error()))
	}

	storage.RedactInstanceForAPI(updatedInstance)

	return connect.NewResponse(&v1alpha1.UpdateInstanceResponse{
		Instance: updatedInstance,
	}), nil
}

// DeleteInstance soft-deletes the instance row, evicts its pool, and clears
// cached catalog data. Idempotent — re-deleting an already-removed instance
// is treated as success so retries don't surface spurious NotFound errors.
// Runtime/sample rows are intentionally retained for historical addressing
// and pruned later by the retention runner job.
func (s *Service) DeleteInstance(ctx context.Context, req *connect.Request[v1alpha1.DeleteInstanceRequest]) (*connect.Response[v1alpha1.DeleteInstanceResponse], error) {
	if s.readOnly {
		return nil, configManagedError()
	}

	instanceResource, connectErr := apierrors.ParseResourceWithError(req.Msg.GetName(), "name", resource.ParseInstanceName)
	if connectErr != nil {
		return nil, connectErr
	}

	instanceName := instanceResource.String()

	err := s.instanceRepo.DeleteInstance(ctx, instanceName)
	switch {
	case err == nil:
	case errors.Is(err, storage.ErrNotFound):
		// Idempotent: another replica may have raced us. Still evict any
		// pool/cache this replica holds for the now-gone instance.
		slog.InfoContext(ctx, "instance not found for deletion, treated as success", slog.String("instance_name", instanceName))
	default:
		return nil, apierrors.MapRepoErr(ctx, err, apierrors.ResourceCtx{
			Type: instanceResource.ResourceType(),
			Name: instanceName,
			Op:   "delete_instance",
		})
	}

	s.connManager.EvictInstance(instanceResource)

	if err := s.catalog.InvalidateInstance(ctx, instanceResource); err != nil {
		slog.ErrorContext(ctx, "failed to invalidate catalog after instance delete",
			slog.String("instance", instanceName), slog.String("error", err.Error()))
	}

	// instance_runtime_state and instance_*_sample rows are intentionally kept:
	// the instance row is soft-deleted, so history stays addressable. Sample
	// tables are pruned by the retention runner job.

	slog.InfoContext(ctx, "instance deleted successfully", slog.String("instance_name", instanceName))

	return connect.NewResponse(&v1alpha1.DeleteInstanceResponse{}), nil
}

// GetInstanceOverview returns live health metrics (connections / storage /
// cache) for a single instance. The provider caches results briefly so a
// dashboard auto-refresh doesn't hammer the upstream.
func (s *Service) GetInstanceOverview(ctx context.Context, req *connect.Request[v1alpha1.GetInstanceOverviewRequest]) (*connect.Response[v1alpha1.GetInstanceOverviewResponse], error) {
	instanceResource, connectErr := apierrors.ParseResourceWithError(req.Msg.GetName(), "name", resource.ParseInstanceName)
	if connectErr != nil {
		return nil, connectErr
	}

	overview, err := s.overview.GetInstanceOverview(ctx, instanceResource)
	if err != nil {
		return nil, apierrors.MapEngineErr(ctx, err, apierrors.ResourceCtx{
			Type: instanceResource.ResourceType(),
			Name: instanceResource.String(),
			Op:   "get_instance_overview",
		})
	}

	resp := &v1alpha1.GetInstanceOverviewResponse{
		InstanceOverview: &v1alpha1.InstanceOverview{
			ObservedAt: timestamppb.New(time.Now()),
		},
	}

	var partialErrors []*rpcstatus.Status

	metricErrors := overviewMetricErrorsByMetric(overview.PartialErrors)

	if overview.Connections != nil {
		resp.InstanceOverview.Connections = &v1alpha1.ConnectionMetrics{
			ActiveConnections: overview.Connections.Active,
			IdleConnections:   overview.Connections.Idle,
			TotalConnections:  overview.Connections.Total,
			MaxConnections:    overview.Connections.Max,
		}
	} else {
		partialErrors = append(partialErrors, metricPartialError("connections", "failed to query connection metrics", metricErrors["connections"]))
	}

	if overview.Storage != nil {
		resp.InstanceOverview.Storage = &v1alpha1.StorageMetrics{
			TotalSizeBytes: overview.Storage.TotalSizeBytes,
		}
	} else {
		partialErrors = append(partialErrors, metricPartialError("storage", "failed to query storage metrics", metricErrors["storage"]))
	}

	if overview.Cache != nil {
		resp.InstanceOverview.Cache = &v1alpha1.CacheMetrics{
			HitRatio:   overview.Cache.HitRatio,
			BlocksHit:  overview.Cache.BlocksHit,
			BlocksRead: overview.Cache.BlocksRead,
		}
	} else {
		partialErrors = append(partialErrors, metricPartialError("cache", "failed to query cache metrics", metricErrors["cache"]))
	}

	if overview.IO != nil {
		resp.InstanceOverview.IoMetrics = &v1alpha1.IOMetrics{
			Reads:       overview.IO.Reads,
			ReadBytes:   overview.IO.ReadBytes,
			Writes:      overview.IO.Writes,
			WriteBytes:  overview.IO.WriteBytes,
			Extends:     overview.IO.Extends,
			ExtendBytes: overview.IO.ExtendBytes,
			Fsyncs:      overview.IO.Fsyncs,
		}
	} else {
		partialErrors = append(partialErrors, metricPartialError("io", "failed to query I/O metrics", metricErrors["io"]))
	}

	resp.PartialErrors = partialErrors

	return connect.NewResponse(resp), nil
}

// CheckInstanceHealth returns live, actionable health checks for a single
// PostgreSQL instance. Each category is queried independently by the provider
// so permission gaps degrade into partial errors instead of failing the whole RPC.
func (s *Service) CheckInstanceHealth(ctx context.Context, req *connect.Request[v1alpha1.CheckInstanceHealthRequest]) (*connect.Response[v1alpha1.CheckInstanceHealthResponse], error) {
	instanceResource, connectErr := apierrors.ParseResourceWithError(req.Msg.GetName(), "name", resource.ParseInstanceName)
	if connectErr != nil {
		return nil, connectErr
	}

	if s.health == nil {
		return nil, connect.NewError(connect.CodeUnimplemented, errors.New("instance health checks are not configured"))
	}

	health, err := s.health.CheckInstanceHealth(ctx, instanceResource)
	if err != nil {
		return nil, apierrors.MapEngineErr(ctx, err, apierrors.ResourceCtx{
			Type: instanceResource.ResourceType(),
			Name: instanceResource.String(),
			Op:   "check_instance_health",
		})
	}

	resp := &v1alpha1.CheckInstanceHealthResponse{
		Health: &v1alpha1.InstanceHealth{
			ObservedAt: timestamppb.New(time.Now()),
		},
	}

	checkErrors := overviewMetricErrorsByMetric(health.PartialErrors)
	recordedPartialErrors := map[string]bool{}

	if health.ConnectionActivity != nil {
		resp.Health.ConnectionActivity = connectionActivityHealthToProto(health.ConnectionActivity)
	} else {
		recordedPartialErrors["connection_activity"] = true

		resp.PartialErrors = append(resp.PartialErrors, healthPartialError("connection_activity", healthPartialErrorMessage("connection_activity"), checkErrors["connection_activity"]))
	}

	if health.Replication != nil {
		resp.Health.Replication = replicationHealthToProto(health.Replication)
	} else {
		recordedPartialErrors["replication"] = true

		resp.PartialErrors = append(resp.PartialErrors, healthPartialError("replication", healthPartialErrorMessage("replication"), checkErrors["replication"]))
	}

	if health.StatsAccess != nil {
		resp.Health.StatsAccess = statsAccessHealthToProto(health.StatsAccess)
	} else {
		recordedPartialErrors["stats_access"] = true

		resp.PartialErrors = append(resp.PartialErrors, healthPartialError("stats_access", healthPartialErrorMessage("stats_access"), checkErrors["stats_access"]))
	}

	if health.PGStatStatements != nil {
		resp.Health.PgStatStatements = pgStatStatementsHealthToProto(health.PGStatStatements)
	} else {
		recordedPartialErrors["pg_stat_statements"] = true

		resp.PartialErrors = append(resp.PartialErrors, healthPartialError("pg_stat_statements", healthPartialErrorMessage("pg_stat_statements"), checkErrors["pg_stat_statements"]))
	}

	if health.Autovacuum != nil {
		resp.Health.Autovacuum = autovacuumHealthToProto(health.Autovacuum)
	} else {
		recordedPartialErrors["autovacuum"] = true

		resp.PartialErrors = append(resp.PartialErrors, healthPartialError("autovacuum", healthPartialErrorMessage("autovacuum"), checkErrors["autovacuum"]))
	}

	for _, partialError := range health.PartialErrors {
		if recordedPartialErrors[partialError.Metric] {
			continue
		}

		resp.PartialErrors = append(resp.PartialErrors, healthPartialError(partialError.Metric, healthPartialErrorMessage(partialError.Metric), partialError.Err))
	}

	return connect.NewResponse(resp), nil
}

// CheckInstanceActivity returns only connection activity for high-frequency
// polling without running unrelated health checks.
func (s *Service) CheckInstanceActivity(ctx context.Context, req *connect.Request[v1alpha1.CheckInstanceActivityRequest]) (*connect.Response[v1alpha1.CheckInstanceActivityResponse], error) {
	instanceResource, connectErr := apierrors.ParseResourceWithError(req.Msg.GetName(), "name", resource.ParseInstanceName)
	if connectErr != nil {
		return nil, connectErr
	}

	if s.activity == nil {
		return nil, connect.NewError(connect.CodeUnimplemented, errors.New("instance activity checks are not configured"))
	}

	health, err := s.activity.CheckInstanceActivity(ctx, instanceResource)
	if err != nil {
		return nil, apierrors.MapEngineErr(ctx, err, apierrors.ResourceCtx{
			Type: instanceResource.ResourceType(),
			Name: instanceResource.String(),
			Op:   "check_instance_activity",
		})
	}

	resp := &v1alpha1.CheckInstanceActivityResponse{}
	if health.ConnectionActivity != nil {
		resp.Activity = connectionActivityHealthToProto(health.ConnectionActivity)
		return connect.NewResponse(resp), nil
	}

	checkErrors := overviewMetricErrorsByMetric(health.PartialErrors)
	resp.PartialErrors = append(resp.PartialErrors, healthPartialError(
		"connection_activity",
		healthPartialErrorMessage("connection_activity"),
		checkErrors["connection_activity"],
	))

	return connect.NewResponse(resp), nil
}

func connectionActivityHealthToProto(activity *engine.ConnectionActivityHealth) *v1alpha1.ConnectionActivityHealth {
	return &v1alpha1.ConnectionActivityHealth{
		Status:                            healthStatusToProto(activity.Status),
		Summary:                           activity.Summary,
		ActiveConnections:                 activity.Active,
		IdleConnections:                   activity.Idle,
		IdleInTransactionConnections:      activity.IdleInTransaction,
		TotalConnections:                  activity.Total,
		MaxConnections:                    activity.Max,
		UtilizationRatio:                  activity.UtilizationRatio,
		WaitingForLockConnections:         activity.WaitingForLocks,
		LongRunningTransactionConnections: activity.LongRunningTxs,
		LongestTransactionSeconds:         activity.LongestTxSeconds,
		ByApplication:                     applicationConnectionsToProto(activity.ByApplication),
		Sessions:                          connectionActivitySessionsToProto(activity.Sessions),
	}
}

func applicationConnectionsToProto(apps []engine.ApplicationConnections) []*v1alpha1.ApplicationConnections {
	if len(apps) == 0 {
		return nil
	}

	proto := make([]*v1alpha1.ApplicationConnections, 0, len(apps))
	for _, app := range apps {
		proto = append(proto, &v1alpha1.ApplicationConnections{
			ApplicationName:              app.ApplicationName,
			ActiveConnections:            app.Active,
			IdleConnections:              app.Idle,
			IdleInTransactionConnections: app.IdleInTransaction,
			TotalConnections:             app.Total,
		})
	}

	return proto
}

func connectionActivitySessionsToProto(sessions []engine.ConnectionActivitySession) []*v1alpha1.ConnectionActivitySession {
	if len(sessions) == 0 {
		return nil
	}

	proto := make([]*v1alpha1.ConnectionActivitySession, 0, len(sessions))
	for _, session := range sessions {
		proto = append(proto, &v1alpha1.ConnectionActivitySession{
			Pid:             session.PID,
			Username:        session.Username,
			ApplicationName: session.ApplicationName,
			DatabaseName:    session.DatabaseName,
			State:           session.State,
			DurationSeconds: session.DurationSeconds,
			Query:           session.Query,
			WaitEventType:   session.WaitEventType,
			WaitEvent:       session.WaitEvent,
			BlockedByPid:    session.BlockedByPID,
		})
	}

	return proto
}

func replicationHealthToProto(replication *engine.ReplicationHealth) *v1alpha1.ReplicationHealth {
	return &v1alpha1.ReplicationHealth{
		Status:                 healthStatusToProto(replication.Status),
		Summary:                replication.Summary,
		Role:                   replicationRoleToProto(replication.Role),
		AttachedReplicas:       replication.AttachedReplicas,
		StreamingReplicas:      replication.StreamingReplicas,
		SynchronousReplicas:    replication.SynchronousReplicas,
		MaxReplicationLagBytes: replication.MaxReplicationLagBytes,
		WalReceiverActive:      replication.WALReceiverActive,
		ReplayLagSeconds:       replication.ReplayLagSeconds,
	}
}

func statsAccessHealthToProto(statsAccess *engine.StatsAccessHealth) *v1alpha1.StatsAccessHealth {
	return &v1alpha1.StatsAccessHealth{
		Status:                healthStatusToProto(statsAccess.Status),
		Summary:               statsAccess.Summary,
		CurrentUser:           statsAccess.CurrentUser,
		Superuser:             statsAccess.Superuser,
		PgMonitorMember:       statsAccess.PGMonitorMember,
		PgReadAllStatsMember:  statsAccess.PGReadAllStatsMember,
		CanReadPgStatActivity: statsAccess.CanReadPGStatActivity,
		CanReadPgStatDatabase: statsAccess.CanReadPGStatDatabase,
	}
}

func pgStatStatementsHealthToProto(pgStatStatements *engine.PGStatStatementsHealth) *v1alpha1.PgStatStatementsHealth {
	protoHealth := &v1alpha1.PgStatStatementsHealth{
		Status:                  healthStatusToProto(pgStatStatements.Status),
		Summary:                 pgStatStatements.Summary,
		ExtensionInstalled:      pgStatStatements.ExtensionInstalled,
		ExtensionSchema:         pgStatStatements.ExtensionSchema,
		ExtensionVersion:        pgStatStatements.ExtensionVersion,
		SharedPreloadConfigured: pgStatStatements.SharedPreloadConfigured,
		TrackMode:               pgStatStatements.TrackMode,
		ViewQueryable:           pgStatStatements.ViewQueryable,
		StatementCount:          pgStatStatements.StatementCount,
	}

	if pgStatStatements.StatsResetAt != nil {
		protoHealth.StatsResetAt = timestamppb.New(*pgStatStatements.StatsResetAt)
	}

	return protoHealth
}

func autovacuumHealthToProto(autovacuum *engine.AutovacuumHealth) *v1alpha1.AutovacuumHealth {
	protoHealth := &v1alpha1.AutovacuumHealth{
		Status:         healthStatusToProto(autovacuum.Status),
		Summary:        autovacuum.Summary,
		RunningWorkers: autovacuum.RunningWorkers,
		MaxWorkers:     autovacuum.MaxWorkers,
	}

	if autovacuum.LastAutovacuumAt != nil {
		protoHealth.LastAutovacuumAt = timestamppb.New(*autovacuum.LastAutovacuumAt)
	}

	return protoHealth
}

func healthStatusToProto(status engine.HealthStatus) v1alpha1.HealthCheckStatus {
	switch status {
	case engine.HealthStatusOK:
		return v1alpha1.HealthCheckStatus_HEALTH_CHECK_STATUS_OK
	case engine.HealthStatusWarning:
		return v1alpha1.HealthCheckStatus_HEALTH_CHECK_STATUS_WARNING
	case engine.HealthStatusError:
		return v1alpha1.HealthCheckStatus_HEALTH_CHECK_STATUS_ERROR
	case engine.HealthStatusUnknown:
		return v1alpha1.HealthCheckStatus_HEALTH_CHECK_STATUS_UNKNOWN
	case engine.HealthStatusNotApplicable:
		return v1alpha1.HealthCheckStatus_HEALTH_CHECK_STATUS_NOT_APPLICABLE
	default:
		return v1alpha1.HealthCheckStatus_HEALTH_CHECK_STATUS_UNSPECIFIED
	}
}

func replicationRoleToProto(role engine.ReplicationRole) v1alpha1.ServerInfo_ReplicationRole {
	switch role {
	case engine.ReplicationRolePrimary:
		return v1alpha1.ServerInfo_REPLICATION_ROLE_PRIMARY
	case engine.ReplicationRoleReplica:
		return v1alpha1.ServerInfo_REPLICATION_ROLE_REPLICA
	default:
		return v1alpha1.ServerInfo_REPLICATION_ROLE_UNSPECIFIED
	}
}

func overviewMetricErrorsByMetric(partialErrors []engine.OverviewMetricError) map[string]error {
	if len(partialErrors) == 0 {
		return nil
	}

	byMetric := make(map[string]error, len(partialErrors))
	for _, partialError := range partialErrors {
		byMetric[partialError.Metric] = partialError.Err
	}

	return byMetric
}

func healthPartialError(check, message string, err error) *rpcstatus.Status {
	status := metricPartialError(check, message, err)

	for index, detail := range status.GetDetails() {
		var info errdetails.ErrorInfo
		if !detail.MessageIs(&info) || detail.UnmarshalTo(&info) != nil {
			continue
		}

		info.Reason = "CHECK_UNAVAILABLE"
		delete(info.Metadata, "metric")
		info.Metadata["check"] = check

		if replacement, err := anypb.New(&info); err == nil {
			status.Details[index] = replacement
		}

		break
	}

	return status
}

func healthPartialErrorMessage(check string) string {
	switch check {
	case "connection_activity":
		return "failed to query connection activity"
	case "replication":
		return "failed to query replication health"
	case "stats_access":
		return "failed to query stats access"
	case "pg_stat_statements":
		return "failed to query pg_stat_statements health"
	case "autovacuum":
		return "failed to query autovacuum health"
	default:
		return "failed to query instance health"
	}
}

// metricPartialError builds a google.rpc.Status for a metric category that
// could not be fetched. The ErrorInfo detail identifies the category.
func metricPartialError(metric, message string, err error) *rpcstatus.Status {
	code := connect.CodeUnavailable
	metadata := map[string]string{"metric": metric}

	var postgresDetail *v1alpha1.PostgreSqlErrorDetail

	if response, ok := apierrors.PostgresErrorResponseFromError(err, ""); ok {
		code = response.ConnectCode

		message = response.Message
		for key, value := range response.Metadata {
			if value != "" {
				metadata[key] = value
			}
		}

		postgresDetail = response.Detail
	}

	info := &errdetails.ErrorInfo{
		Reason:   "METRIC_UNAVAILABLE",
		Domain:   string(apierrors.DomainConsole),
		Metadata: metadata,
	}

	s := &rpcstatus.Status{
		Code:    int32(code),
		Message: message,
	}

	if detail, err := anypb.New(info); err == nil {
		s.Details = append(s.Details, detail)
	}

	if postgresDetail != nil {
		if detail, err := anypb.New(postgresDetail); err == nil {
			s.Details = append(s.Details, detail)
		}
	}

	return s
}

func (s *Service) buildServerInfo(ctx context.Context, instanceName resource.InstanceName) (*v1alpha1.ServerInfo, error) {
	info, err := s.catalog.GetServerInfo(ctx, instanceName)
	if err != nil {
		slog.WarnContext(ctx, "failed to get server info",
			slog.String("instance", instanceName.String()), slog.String("error", err.Error()))

		return nil, err
	}

	si := &v1alpha1.ServerInfo{
		Version:         info.Version,
		VersionNum:      info.VersionNum,
		VersionShort:    formatVersionShort(info.VersionNum),
		ReplicationRole: replicationRoleFromRecovery(info.IsInRecovery),
		MaxConnections:  info.MaxConnections,
	}

	if !info.StartedAt.IsZero() {
		si.StartedAt = timestamppb.New(info.StartedAt)
	}

	return si, nil
}

// formatVersionShort converts a PostgreSQL numeric version to a human-readable
// string. PG 10+ encodes as major*10000+minor (e.g. 170008 → "17.8").
// PG 9.x and below encodes as major*10000+minor*100+patch (e.g. 90612 → "9.6.12").
func formatVersionShort(versionNum int32) string {
	major := versionNum / 10000
	remainder := versionNum % 10000

	if major >= 10 {
		return fmt.Sprintf("%d.%d", major, remainder)
	}

	return fmt.Sprintf("%d.%d.%d", major, remainder/100, remainder%100)
}

func replicationRoleFromRecovery(isInRecovery bool) v1alpha1.ServerInfo_ReplicationRole {
	if isInRecovery {
		return v1alpha1.ServerInfo_REPLICATION_ROLE_REPLICA
	}

	return v1alpha1.ServerInfo_REPLICATION_ROLE_PRIMARY
}

const instanceConnectionTestOperation = apierrors.PostgresOperationLabel("test_instance_connection")

const genericConnectionTestMessage = "Could not connect to PostgreSQL with these settings."

func (s *Service) connectionTestError(ctx context.Context, field string, instanceName string, err error) *connect.Error {
	return connectionTestErrorWithDetails(ctx, field, instanceName, err, s.connectionTests.exposeDetailedErrors)
}

func connectionTestErrorWithDetails(ctx context.Context, field string, instanceName string, err error, exposeDetails bool) *connect.Error {
	attrs := []any{slog.String("field", field), slog.String("error", connectionTestLogError(err))}
	if instanceName != "" {
		attrs = append(attrs, slog.String("instance", instanceName))
	}

	slog.WarnContext(ctx, "instance connection test failed", attrs...)

	if errors.Is(err, context.Canceled) {
		return connect.NewError(connect.CodeCanceled, err)
	}

	if errors.Is(err, context.DeadlineExceeded) {
		return connect.NewError(connect.CodeDeadlineExceeded, err)
	}

	if !exposeDetails || errors.Is(err, engine.ErrTargetNotAllowed) {
		return genericConnectionTestError()
	}

	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		return postgresConnectionTestError(field, pgErr)
	}

	if isConnectionReachabilityError(err) {
		return connectionReachabilityError(field)
	}

	message := "Could not connect to PostgreSQL with these settings. Check the host, port, database, username, password, and SSL mode. Details: " + err.Error()

	if field == "" {
		return apierrors.NewConnectError(
			connect.CodeInvalidArgument,
			errors.New(message),
			apierrors.NewErrorInfo(apierrors.DomainConsole, v1alpha1.ErrorReason_INVALID_ARGUMENT),
		)
	}

	return apierrors.NewInvalidArgumentError(
		apierrors.NewFieldViolation(field, message),
	)
}

func genericConnectionTestError() *connect.Error {
	return apierrors.NewConnectError(
		connect.CodeUnavailable,
		fmt.Errorf("%s", genericConnectionTestMessage),
		apierrors.NewErrorInfo(
			apierrors.DomainConsole,
			v1alpha1.ErrorReason_FAILED_PRECONDITION,
			apierrors.KeyVal{Key: "operation", Value: string(instanceConnectionTestOperation)},
		),
	)
}

func connectionTestLogError(err error) string {
	if err == nil {
		return ""
	}

	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		return postgreserrors.Wrap(
			pgErr,
			postgreserrors.ProfileDefault,
			string(instanceConnectionTestOperation),
		).Error()
	}

	return err.Error()
}

func postgresConnectionTestError(field string, pgErr *pgconn.PgError) *connect.Error {
	classification := apierrors.ClassifyPostgresError(
		pgErr,
		instanceConnectionTestOperation,
		postgreserrors.ProfileDefault,
	)
	violations := postgresConnectionFieldViolations(field, classification)

	if len(violations) == 0 {
		return apierrors.NewPostgresError(
			pgErr,
			instanceConnectionTestOperation,
			postgreserrors.ProfileDefault,
		)
	}

	return apierrors.NewPostgresError(
		pgErr,
		instanceConnectionTestOperation,
		postgreserrors.ProfileDefault,
		apierrors.NewBadRequest(violations...),
	)
}

func postgresConnectionFieldViolations(field string, classification apierrors.PostgresErrorClassification) []*errdetails.BadRequest_FieldViolation {
	switch {
	case classification.SQLState == "28P01":
		return []*errdetails.BadRequest_FieldViolation{
			apierrors.NewFieldViolation(connectionConfigFieldPath(field, "password"), "PostgreSQL rejected this password."),
		}
	case classification.SQLStateClass == "28":
		description := "PostgreSQL rejected these credentials. Check the username and password."

		return []*errdetails.BadRequest_FieldViolation{
			apierrors.NewFieldViolation(connectionConfigFieldPath(field, "username"), description),
			apierrors.NewFieldViolation(connectionConfigFieldPath(field, "password"), description),
		}
	case classification.SQLState == "3D000":
		return []*errdetails.BadRequest_FieldViolation{
			apierrors.NewFieldViolation(connectionConfigFieldPath(field, "database"), "PostgreSQL could not find this database."),
		}
	case classification.SQLStateClass == "08":
		return []*errdetails.BadRequest_FieldViolation{
			apierrors.NewFieldViolation(connectionConfigFieldPath(field, "host"), "PostgreSQL is unreachable at this host."),
			apierrors.NewFieldViolation(connectionConfigFieldPath(field, "port"), "PostgreSQL is unreachable on this port."),
		}
	default:
		return nil
	}
}

func connectionReachabilityError(field string) *connect.Error {
	message := "PostgreSQL is unreachable with these host and port settings. Check the host and port, then try again."

	return apierrors.NewConnectError(
		connect.CodeUnavailable,
		fmt.Errorf("%s", message),
		apierrors.NewErrorInfo(
			apierrors.DomainConsole,
			v1alpha1.ErrorReason_FAILED_PRECONDITION,
			apierrors.KeyVal{Key: "operation", Value: string(instanceConnectionTestOperation)},
		),
		apierrors.NewBadRequest(
			apierrors.NewFieldViolation(connectionConfigFieldPath(field, "host"), "PostgreSQL is unreachable at this host."),
			apierrors.NewFieldViolation(connectionConfigFieldPath(field, "port"), "PostgreSQL is unreachable on this port."),
		),
	)
}

func connectionConfigFieldPath(field string, suffix string) string {
	if field == "" {
		field = "config"
	}

	if suffix == "" {
		return field
	}

	return field + "." + suffix
}

func isConnectionReachabilityError(err error) bool {
	var pgConnectErr *pgconn.ConnectError
	if errors.As(err, &pgConnectErr) {
		return true
	}

	var dnsErr *net.DNSError
	if errors.As(err, &dnsErr) {
		return true
	}

	var opErr *net.OpError
	if errors.As(err, &opErr) && strings.EqualFold(opErr.Op, "dial") {
		return true
	}

	if errors.Is(err, net.ErrClosed) {
		return true
	}

	var netErr net.Error
	if errors.As(err, &netErr) && netErr.Timeout() {
		return true
	}

	return isTextOnlyConnectionReachabilityError(err)
}

func isTextOnlyConnectionReachabilityError(err error) bool {
	// Last-resort compatibility for driver/test errors that do not expose net
	// types. Type-based cases above are the primary classification path.
	message := strings.ToLower(err.Error())
	for _, marker := range []string{
		"connection refused",
		"no such host",
		"network is unreachable",
		"dial tcp",
		"connect: timeout",
	} {
		if strings.Contains(message, marker) {
			return true
		}
	}

	return false
}

func updateMaskTouchesConfig(mask *fieldmaskpb.FieldMask) bool {
	for _, path := range mask.GetPaths() {
		if path == "config" || strings.HasPrefix(path, "config.") {
			return true
		}
	}

	return false
}

// configManagedError returns a FailedPrecondition error indicating that
// instance mutations are not allowed because instances are config-managed.
func configManagedError() *connect.Error {
	return connect.NewError(connect.CodeFailedPrecondition, storage.ErrConfigManaged)
}

type createInstanceBody struct {
	instance    *v1alpha1.Instance
	configField string
}

func (s *Service) createInstanceRequestToBody(req *v1alpha1.CreateInstanceRequest) (*createInstanceBody, error) {
	// Defense in depth for direct in-process callers. RPC traffic should be
	// rejected by the protovalidate interceptor before reaching this handler,
	// but the XOR and required config checks below keep both entry points safe.
	hasSpec := req.GetSpec() != nil

	hasInstance := req.GetInstance() != nil
	if hasSpec == hasInstance {
		return nil, apierrors.NewInvalidArgumentError(
			apierrors.NewFieldViolation("spec", "exactly one of spec or instance must be set"),
			apierrors.NewFieldViolation("instance", "exactly one of spec or instance must be set"),
		)
	}

	if hasSpec {
		if req.GetSpec().GetConfig() == nil {
			return nil, apierrors.NewInvalidArgumentError(
				apierrors.NewFieldViolation("spec.config", "is required"),
			)
		}

		return &createInstanceBody{
			instance:    createInstanceBodyInstance(req.GetSpec().GetDisplayName(), req.GetSpec().GetLabels(), req.GetSpec().GetConfig()),
			configField: "spec.config",
		}, nil
	}

	if req.GetInstance().GetConfig() == nil {
		return nil, apierrors.NewInvalidArgumentError(
			apierrors.NewFieldViolation("instance.config", "is required"),
		)
	}

	return &createInstanceBody{
		// Per AIP-133, clients identify the resource with instance_id; server-owned
		// resource fields from the request body, including instance.name, are ignored.
		instance: createInstanceBodyInstance(
			req.GetInstance().GetDisplayName(),
			req.GetInstance().GetLabels(),
			req.GetInstance().GetConfig(),
		),
		configField: "instance.config",
	}, nil
}

func createInstanceBodyInstance(displayName string, labels map[string]string, config *v1alpha1.PostgresConfig) *v1alpha1.Instance {
	return &v1alpha1.Instance{
		DisplayName: displayName,
		Labels:      labels,
		Config:      config,
		// Server-managed fields will be set later:
		// Name, ConnectionState, ConnectionError, CreateTime, UpdateTime
	}
}
