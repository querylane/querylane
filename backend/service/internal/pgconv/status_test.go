package pgconv

import (
	"testing"

	"github.com/stretchr/testify/assert"

	v1alpha1 "github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1"
)

func TestDatabaseStatusFromInitializer(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name          string
		isInitialized bool
		initError     string
		wantState     v1alpha1.AppDatabaseStatus_State
		wantError     string
	}{
		{
			name:          "initialized is ready",
			isInitialized: true,
			wantState:     v1alpha1.AppDatabaseStatus_STATE_READY,
		},
		{
			name:          "initialized wins over stale error",
			isInitialized: true,
			initError:     "old failure",
			wantState:     v1alpha1.AppDatabaseStatus_STATE_READY,
		},
		{
			name:      "init error surfaces error state",
			initError: "connection refused",
			wantState: v1alpha1.AppDatabaseStatus_STATE_ERROR,
			wantError: "connection refused",
		},
		{
			name:      "neither initialized nor error means not configured",
			wantState: v1alpha1.AppDatabaseStatus_STATE_NOT_CONFIGURED,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			got := DatabaseStatusFromInitializer(tt.isInitialized, tt.initError)

			assert.Equal(t, tt.wantState, got.GetState())
			assert.Equal(t, tt.wantError, got.GetError())
		})
	}
}
