package resource

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestParseWorkflowName(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name    string
		input   string
		want    WorkflowName
		wantErr bool
	}{
		{
			name:  "valid workflow",
			input: "instances/inst1/databases/db1/workflows/wf-01hq3",
			want:  WorkflowName{InstanceID: "inst1", DatabaseID: "db1", WorkflowID: "wf-01hq3"},
		},
		{
			name:    "too few segments",
			input:   "instances/inst1/databases/db1",
			wantErr: true,
		},
		{
			name:    "wrong collection",
			input:   "instances/inst1/databases/db1/schemas/wf-01hq3",
			wantErr: true,
		},
		{
			name:    "empty workflow ID",
			input:   "instances/inst1/databases/db1/workflows/",
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			got, err := ParseWorkflowName(tt.input)
			if tt.wantErr {
				require.Error(t, err)
				require.ErrorIs(t, err, ErrInvalidName)

				return
			}

			require.NoError(t, err)
			assert.Equal(t, tt.want, got)
			assert.Equal(t, tt.input, got.String(), "String() must round-trip")
		})
	}
}

func TestWorkflowNameHierarchy(t *testing.T) {
	t.Parallel()

	name := NewWorkflowName("inst1", "db1", "wf-01hq3")

	assert.Equal(t, TypeWorkflow, name.ResourceType())
	assert.Equal(t, DatabaseName{InstanceID: "inst1", DatabaseID: "db1"}, name.Parent())
	assert.Equal(t, DatabaseName{InstanceID: "inst1", DatabaseID: "db1"}, name.Database())
	assert.Equal(t, InstanceName{InstanceID: "inst1"}, name.Instance())
}

func TestWorkflowNameIsZero(t *testing.T) {
	t.Parallel()

	assert.True(t, WorkflowName{}.IsZero())
	assert.False(t, NewWorkflowName("inst1", "db1", "wf-01hq3").IsZero())
	assert.False(t, WorkflowName{WorkflowID: "wf-01hq3"}.IsZero())
}

func TestWorkflowNameTextRoundTrip(t *testing.T) {
	t.Parallel()

	name := NewWorkflowName("inst1", "db1", "wf-01hq3")

	data, err := name.MarshalText()
	require.NoError(t, err)
	assert.Equal(t, "instances/inst1/databases/db1/workflows/wf-01hq3", string(data))

	var parsed WorkflowName
	require.NoError(t, parsed.UnmarshalText(data))
	assert.Equal(t, name, parsed)

	require.Error(t, parsed.UnmarshalText([]byte("bogus")))
	assert.Equal(t, name, parsed, "failed unmarshal must not modify the receiver")
}
