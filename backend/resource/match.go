package resource

import "strings"

// Resource name patterns using {variable} placeholder syntax.
// These can be used with Match to check whether a resource name
// matches a particular resource type.
const (
	InstancePattern = "instances/{instanceID}"
	RolePattern     = "instances/{instanceID}/roles/{roleID}"
	DatabasePattern = "instances/{instanceID}/databases/{databaseID}"
	SchemaPattern   = "instances/{instanceID}/databases/{databaseID}/schemas/{schemaID}"
	TablePattern    = "instances/{instanceID}/databases/{databaseID}/schemas/{schemaID}/tables/{tableID}"
	ViewPattern     = "instances/{instanceID}/databases/{databaseID}/schemas/{schemaID}/views/{viewID}"
	WorkflowPattern = "instances/{instanceID}/databases/{databaseID}/workflows/{workflowID}"
)

// Match reports whether name matches pattern.
// Pattern uses the same {variable} placeholder syntax as internal templates.
// Variables match any non-empty segment; literals must match exactly.
//
// Example:
//
//	Match(InstancePattern, "instances/inst1") // true
func Match(pattern, name string) bool {
	patternParts := strings.Split(pattern, "/")
	nameParts := strings.Split(name, "/")

	if len(patternParts) != len(nameParts) {
		return false
	}

	for i, p := range patternParts {
		if isVariable(p) {
			if nameParts[i] == "" {
				return false
			}
		} else {
			if nameParts[i] != p {
				return false
			}
		}
	}

	return true
}
