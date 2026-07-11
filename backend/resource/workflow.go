package resource

import (
	"fmt"
	"strings"
)

var workflowTemplate = strings.Split(WorkflowPattern, "/")

// WorkflowName represents a parsed pg_durable workflow resource name.
// Format: instances/{instance}/databases/{database}/workflows/{workflow}.
type WorkflowName struct { //nolint:recvcheck // UnmarshalText requires pointer receiver
	InstanceID string
	DatabaseID string
	WorkflowID string
}

// NewWorkflowName creates a WorkflowName from components.
func NewWorkflowName(instanceID, databaseID, workflowID string) WorkflowName {
	return WorkflowName{InstanceID: instanceID, DatabaseID: databaseID, WorkflowID: workflowID}
}

// ParseWorkflowName parses a workflow resource name.
func ParseWorkflowName(name string) (WorkflowName, error) {
	vars, err := parse(name, workflowTemplate)
	if err != nil {
		return WorkflowName{}, fmt.Errorf("invalid workflow name: %w", err)
	}

	return WorkflowName{
		InstanceID: vars["instanceID"],
		DatabaseID: decodeIDSegment(vars["databaseID"]),
		WorkflowID: decodeIDSegment(vars["workflowID"]),
	}, nil
}

// String returns the canonical string representation of the workflow name.
func (n WorkflowName) String() string {
	return fmt.Sprintf("instances/%s/databases/%s/workflows/%s", n.InstanceID, encodeIDSegment(n.DatabaseID), encodeIDSegment(n.WorkflowID))
}

// ResourceType returns the canonical resource type.
func (n WorkflowName) ResourceType() Type {
	return TypeWorkflow
}

// Parent returns the parent database name.
func (n WorkflowName) Parent() DatabaseName {
	return DatabaseName{InstanceID: n.InstanceID, DatabaseID: n.DatabaseID}
}

// Database returns the database resource name.
func (n WorkflowName) Database() DatabaseName {
	return DatabaseName{InstanceID: n.InstanceID, DatabaseID: n.DatabaseID}
}

// Instance returns the instance resource name.
func (n WorkflowName) Instance() InstanceName {
	return InstanceName{InstanceID: n.InstanceID}
}

// IsZero reports whether n is the zero value.
func (n WorkflowName) IsZero() bool {
	return n.InstanceID == "" && n.DatabaseID == "" && n.WorkflowID == ""
}

// MarshalText implements encoding.TextMarshaler.
func (n WorkflowName) MarshalText() ([]byte, error) {
	return []byte(n.String()), nil
}

// UnmarshalText implements encoding.TextUnmarshaler.
func (n *WorkflowName) UnmarshalText(data []byte) error {
	parsed, err := ParseWorkflowName(string(data))
	if err != nil {
		return err
	}

	*n = parsed

	return nil
}
