package console

import (
	"context"
	"testing"

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
