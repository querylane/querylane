// Package console provides the ConsoleService implementation for
// application metadata endpoints (build info, version).
package console

import (
	"context"
	"database/sql"
	"log/slog"
	"runtime/debug"
	"strconv"
	"time"

	"connectrpc.com/connect"
	"google.golang.org/protobuf/types/known/timestamppb"

	v1alpha1 "github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1"
	v1connect "github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1/consolev1alpha1connect"
)

// Build-time variables injected via -ldflags.
var (
	// GitBranch is the git branch this binary was built from.
	// This is populated at build time via -ldflags.
	GitBranch = "unknown"
)

// Ensure Service implements the ConsoleServiceHandler interface at compile time.
var _ v1connect.ConsoleServiceHandler = (*Service)(nil)

// Service provides console metadata functionality. It implements the
// ConsoleServiceHandler interface and serves build and version information.
type Service struct {
	extractedBuildInfo     *v1alpha1.BuildInfo
	db                     *sql.DB // nil when running in degraded/bootstrap mode
	configFilePath         string
	instanceManagementMode v1alpha1.InstanceManagementMode
}

// NewService creates a new instance of the console service. Build information
// is extracted from the runtime once during initialization.
// The db parameter may be nil if the database is not yet available (degraded mode).
func NewService(ctx context.Context, db *sql.DB, configManagedInstances bool, configFilePath string) *Service {
	buildInfo, ok := debug.ReadBuildInfo()
	if !ok {
		slog.WarnContext(ctx, "could not read build info")
	}

	mode := v1alpha1.InstanceManagementMode_INSTANCE_MANAGEMENT_MODE_API
	if configManagedInstances {
		mode = v1alpha1.InstanceManagementMode_INSTANCE_MANAGEMENT_MODE_CONFIG
	}

	return &Service{
		extractedBuildInfo:     extractBuildInfo(ctx, buildInfo),
		db:                     db,
		configFilePath:         configFilePath,
		instanceManagementMode: mode,
	}
}

// GetConsoleConfig returns build info plus the current meta-DB health so the
// frontend can decide whether to render the setup wizard or the main app on
// load. See the ConsoleService proto for the field-level contract.
func (s *Service) GetConsoleConfig(ctx context.Context, _ *connect.Request[v1alpha1.GetConsoleConfigRequest]) (*connect.Response[v1alpha1.GetConsoleConfigResponse], error) {
	res := &v1alpha1.GetConsoleConfigResponse{
		BuildInfo:              s.extractedBuildInfo,
		ConfigFilePath:         s.configFilePath,
		DatabaseStatus:         s.getDatabaseStatus(ctx),
		InstanceManagementMode: s.instanceManagementMode,
	}

	return connect.NewResponse(res), nil
}

// getDatabaseStatus queries the goose_db_version table to determine the
// current migration version.
func (s *Service) getDatabaseStatus(ctx context.Context) *v1alpha1.AppDatabaseStatus {
	if s.db == nil {
		return &v1alpha1.AppDatabaseStatus{
			State: v1alpha1.AppDatabaseStatus_STATE_NOT_CONFIGURED,
		}
	}

	var version uint32

	err := s.db.QueryRowContext(ctx,
		"SELECT version_id FROM goose_db_version WHERE is_applied = true ORDER BY id DESC LIMIT 1",
	).Scan(&version)
	if err != nil {
		slog.WarnContext(ctx, "failed to query goose_db_version", slog.Any("error", err))

		return &v1alpha1.AppDatabaseStatus{
			State: v1alpha1.AppDatabaseStatus_STATE_ERROR,
			Error: "failed to read migration state",
		}
	}

	return &v1alpha1.AppDatabaseStatus{
		State:         v1alpha1.AppDatabaseStatus_STATE_READY,
		SchemaVersion: version,
	}
}

// extractBuildInfo extracts and formats build information from the runtime debug info.
// It attempts to parse version information, git commit SHA, and build timestamp
// from the embedded build information, and includes the git branch from build-time injection.
func extractBuildInfo(ctx context.Context, buildInfo *debug.BuildInfo) *v1alpha1.BuildInfo {
	result := &v1alpha1.BuildInfo{
		Version:   "unknown",
		GitCommit: "unknown",
		GitBranch: GitBranch,
		BuiltAt:   nil,
	}

	if buildInfo == nil {
		return result
	}

	// Extract version from Main module
	if buildInfo.Main.Version != "" && buildInfo.Main.Version != "(devel)" {
		result.Version = buildInfo.Main.Version
	}

	// Extract build settings for git commit and build time
	for _, setting := range buildInfo.Settings {
		switch setting.Key {
		case "vcs.revision":
			if len(setting.Value) >= 7 {
				// Use short commit SHA (first 7 characters)
				result.GitCommit = setting.Value[:7]
			} else {
				result.GitCommit = setting.Value
			}
		case "vcs.time":
			if buildTime, err := time.Parse(time.RFC3339, setting.Value); err == nil {
				result.BuiltAt = timestamppb.New(buildTime)
			} else {
				slog.WarnContext(ctx, "failed to parse build time", "value", setting.Value, "error", err)
			}
		}
	}

	// If we couldn't get git commit from vcs.revision, try to extract from version
	if result.GitCommit == "unknown" && result.Version != "unknown" {
		// Try to extract commit from version strings like "v1.0.0-20231201123456-abcdef123456"
		if len(result.Version) > 12 {
			parts := result.Version[len(result.Version)-12:]
			// Check if it looks like a commit hash (hexadecimal)
			if _, err := strconv.ParseInt(parts, 16, 64); err == nil {
				result.GitCommit = parts[:7]
			}
		}
	}

	return result
}
