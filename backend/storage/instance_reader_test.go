package storage

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	serverconfig "github.com/querylane/querylane/backend/config/server"
	api "github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1"
	"github.com/querylane/querylane/backend/storage/gen/querylane/public/model"
)

type stubInstanceRuntimeStateStore struct {
	states map[string]InstanceRuntimeState
}

func (s *stubInstanceRuntimeStateStore) ListInstanceRuntimeStates(_ context.Context, instanceIDs []string) (map[string]InstanceRuntimeState, error) {
	result := make(map[string]InstanceRuntimeState, len(instanceIDs))
	for _, instanceID := range instanceIDs {
		if state, ok := s.states[instanceID]; ok {
			result[instanceID] = state
		}
	}

	return result, nil
}

func TestOverlayInstanceReader_OverlaysRuntimeState(t *testing.T) {
	t.Parallel()

	definitions := NewConfigInstanceRepository([]*serverconfig.InstanceConfig{
		{
			ID:          "prod",
			DisplayName: "Production",
			Host:        "prod.example.com",
			Port:        5432,
			Database:    "postgres",
			Username:    "postgres",
			Password:    "secret",
			SSLMode:     "require",
		},
	})
	checkedAt := time.Now().UTC().Truncate(time.Second)
	connectionErr := "dial tcp: timeout"
	reader := NewOverlayInstanceReader(definitions, &stubInstanceRuntimeStateStore{
		states: map[string]InstanceRuntimeState{
			"prod": {
				InstanceID:          "prod",
				ConnectionState:     model.ConnectionState_ConnectionStateError,
				ConnectionError:     &connectionErr,
				ConnectionCheckedAt: &checkedAt,
			},
		},
	})

	instance, err := reader.GetInstance(context.Background(), "instances/prod")
	require.NoError(t, err)
	assert.Equal(t, api.Instance_CONNECTION_STATE_ERROR, instance.GetConnectionState())
	assert.Equal(t, connectionErr, instance.GetConnectionError())
	require.NotNil(t, instance.GetLastConnectionCheckTime())
	assert.WithinDuration(t, checkedAt, instance.GetLastConnectionCheckTime().AsTime(), time.Second)
}
