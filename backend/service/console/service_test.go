package console

import (
	"context"
	"runtime/debug"
	"testing"
	"time"

	"connectrpc.com/connect"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/querylane/querylane/backend/buildstamp"
	v1alpha1 "github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1"
)

func TestGetConsoleConfigIncludesInstanceManagementDetails(t *testing.T) {
	t.Parallel()

	if !testing.Short() {
		t.Skip("unit test: run with -short")
	}

	tests := []struct {
		name                   string
		configManagedInstances bool
		configFilePath         string
		wantMode               v1alpha1.InstanceManagementMode
		wantConfigFilePath     string
	}{
		{
			name:                   "config managed instances include config path",
			configManagedInstances: true,
			configFilePath:         "/etc/querylane/config.yaml",
			wantMode:               v1alpha1.InstanceManagementMode_INSTANCE_MANAGEMENT_MODE_CONFIG,
			wantConfigFilePath:     "/etc/querylane/config.yaml",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			svc := NewService(context.Background(), nil, tt.configManagedInstances, tt.configFilePath)

			res, err := svc.GetConsoleConfig(
				context.Background(),
				connect.NewRequest(&v1alpha1.GetConsoleConfigRequest{}),
			)
			require.NoError(t, err)

			assert.Equal(t, tt.wantMode, res.Msg.GetInstanceManagementMode())
			assert.Equal(t, tt.wantConfigFilePath, res.Msg.GetConfigFilePath())
		})
	}
}

func TestExtractBuildInfoPrefersStampedMetadata(t *testing.T) {
	t.Parallel()

	if !testing.Short() {
		t.Skip("unit test: run with -short")
	}

	tests := []struct {
		name        string
		buildInfo   *debug.BuildInfo
		stamp       buildStamp
		wantVersion string
		wantCommit  string
		wantBranch  string
		wantBuiltAt *time.Time
	}{
		{
			name: "stamped values override runtime build info",
			buildInfo: &debug.BuildInfo{
				Main: debug.Module{Version: "v9.8.7"},
				Settings: []debug.BuildSetting{
					{Key: "vcs.revision", Value: "1234567890abcdef"},
					{Key: "vcs.time", Value: "2025-01-02T03:04:05Z"},
				},
			},
			stamp: buildStamp{
				version:   "1.2.3",
				gitCommit: "abcdef1",
				gitBranch: "main",
				builtAt:   "2026-07-26T12:34:56Z",
			},
			wantVersion: "1.2.3",
			wantCommit:  "abcdef1",
			wantBranch:  "main",
			wantBuiltAt: new(time.Date(2026, time.July, 26, 12, 34, 56, 0, time.UTC)),
		},
		{
			name: "runtime values remain the fallback",
			buildInfo: &debug.BuildInfo{
				Main: debug.Module{Version: "v9.8.7"},
				Settings: []debug.BuildSetting{
					{Key: "vcs.revision", Value: "1234567890abcdef"},
					{Key: "vcs.time", Value: "2025-01-02T03:04:05Z"},
				},
			},
			stamp:       buildStamp{gitBranch: "unknown"},
			wantVersion: "v9.8.7",
			wantCommit:  "1234567",
			wantBranch:  "unknown",
			wantBuiltAt: new(time.Date(2025, time.January, 2, 3, 4, 5, 0, time.UTC)),
		},
		{
			name: "development stamp preserves tagged module version",
			buildInfo: &debug.BuildInfo{
				Main: debug.Module{Version: "v9.8.7"},
			},
			stamp:       buildStamp{version: "dev"},
			wantVersion: "v9.8.7",
			wantCommit:  "unknown",
			wantBranch:  "unknown",
			wantBuiltAt: nil,
		},
		{
			name:        "nil runtime info and empty stamp retain unknown defaults",
			buildInfo:   nil,
			stamp:       buildStamp{},
			wantVersion: "unknown",
			wantCommit:  "unknown",
			wantBranch:  "unknown",
			wantBuiltAt: nil,
		},
		{
			name: "invalid stamped build time retains runtime build time",
			buildInfo: &debug.BuildInfo{
				Main: debug.Module{Version: "v9.8.7"},
				Settings: []debug.BuildSetting{
					{Key: "vcs.time", Value: "2025-01-02T03:04:05Z"},
				},
			},
			stamp: buildStamp{
				version: "1.2.3-abcdef123456",
				builtAt: "not-a-timestamp",
			},
			wantVersion: "1.2.3-abcdef123456",
			wantCommit:  "unknown",
			wantBranch:  "unknown",
			wantBuiltAt: new(time.Date(2025, time.January, 2, 3, 4, 5, 0, time.UTC)),
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			got := extractBuildInfoFrom(context.Background(), tt.buildInfo, tt.stamp)

			assert.Equal(t, tt.wantVersion, got.GetVersion())
			assert.Equal(t, tt.wantCommit, got.GetGitCommit())
			assert.Equal(t, tt.wantBranch, got.GetGitBranch())

			if tt.wantBuiltAt == nil {
				assert.Nil(t, got.GetBuiltAt())
			} else {
				require.NotNil(t, got.GetBuiltAt())
				assert.Equal(t, *tt.wantBuiltAt, got.GetBuiltAt().AsTime())
			}
		})
	}
}

func TestExtractBuildInfoUsesSharedBuildStamp(t *testing.T) { //nolint:paralleltest // mutates linker-stamped package variables
	if !testing.Short() {
		t.Skip("unit test: run with -short")
	}

	original := buildStamp{
		version:   buildstamp.Version,
		gitCommit: buildstamp.GitCommit,
		gitBranch: buildstamp.GitBranch,
		builtAt:   buildstamp.BuiltAt,
	}

	t.Cleanup(func() {
		buildstamp.Version = original.version
		buildstamp.GitCommit = original.gitCommit
		buildstamp.GitBranch = original.gitBranch
		buildstamp.BuiltAt = original.builtAt
	})

	buildstamp.Version = "1.2.3"
	buildstamp.GitCommit = "abcdef1"
	buildstamp.GitBranch = "main"
	buildstamp.BuiltAt = "2026-07-26T12:34:56Z"

	got := extractBuildInfo(context.Background(), nil)

	assert.Equal(t, "1.2.3", got.GetVersion())
	assert.Equal(t, "abcdef1", got.GetGitCommit())
	assert.Equal(t, "main", got.GetGitBranch())
	require.NotNil(t, got.GetBuiltAt())
	assert.Equal(t, time.Date(2026, time.July, 26, 12, 34, 56, 0, time.UTC), got.GetBuiltAt().AsTime())
}
