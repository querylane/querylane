package console

import (
	"context"
	"runtime/debug"
	"testing"
	"time"

	"connectrpc.com/connect"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

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
		stamp       buildStamp
		wantVersion string
		wantCommit  string
		wantBranch  string
		wantBuiltAt time.Time
	}{
		{
			name: "stamped values override runtime build info",
			stamp: buildStamp{
				version:   "1.2.3",
				gitCommit: "abcdef1",
				gitBranch: "main",
				builtAt:   "2026-07-26T12:34:56Z",
			},
			wantVersion: "1.2.3",
			wantCommit:  "abcdef1",
			wantBranch:  "main",
			wantBuiltAt: time.Date(2026, time.July, 26, 12, 34, 56, 0, time.UTC),
		},
		{
			name:        "runtime values remain the fallback",
			stamp:       buildStamp{gitBranch: "unknown"},
			wantVersion: "v9.8.7",
			wantCommit:  "1234567",
			wantBranch:  "unknown",
			wantBuiltAt: time.Date(2025, time.January, 2, 3, 4, 5, 0, time.UTC),
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			buildInfo := &debug.BuildInfo{
				Main: debug.Module{Version: "v9.8.7"},
				Settings: []debug.BuildSetting{
					{Key: "vcs.revision", Value: "1234567890abcdef"},
					{Key: "vcs.time", Value: "2025-01-02T03:04:05Z"},
				},
			}

			got := extractBuildInfoFrom(context.Background(), buildInfo, tt.stamp)

			assert.Equal(t, tt.wantVersion, got.GetVersion())
			assert.Equal(t, tt.wantCommit, got.GetGitCommit())
			assert.Equal(t, tt.wantBranch, got.GetGitBranch())
			require.NotNil(t, got.GetBuiltAt())
			assert.Equal(t, tt.wantBuiltAt, got.GetBuiltAt().AsTime())
		})
	}
}
