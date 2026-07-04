package resource

import (
	"encoding/base64"
	"fmt"
	"strings"
)

var roleTemplate = strings.Split(RolePattern, "/")

// RoleName represents a parsed role resource name.
// Format: instances/{instance}/roles/{role}.
type RoleName struct { //nolint:recvcheck // UnmarshalText requires pointer receiver
	InstanceID string
	RoleID     string
	// postgresRoleName is the decoded PostgreSQL role name, set by the
	// constructors (NewRoleName/ParseRoleName) which already hold the plaintext —
	// so PostgresRoleName() is a plain accessor that needs no second decode.
	postgresRoleName string
}

// NewRoleName creates a RoleName from the exact PostgreSQL role name.
func NewRoleName(instanceID, roleName string) RoleName {
	return RoleName{
		InstanceID:       instanceID,
		RoleID:           EncodeRoleID(roleName),
		postgresRoleName: roleName,
	}
}

// EncodeRoleID returns a URL-safe resource ID for an exact PostgreSQL role name.
func EncodeRoleID(roleName string) string {
	return base64.RawURLEncoding.EncodeToString([]byte(roleName))
}

// DecodeRoleID returns the exact PostgreSQL role name for a RoleID.
func DecodeRoleID(roleID string) (string, error) {
	decoded, err := base64.RawURLEncoding.DecodeString(roleID)
	if err != nil {
		return "", fmt.Errorf("invalid role id encoding: %w", err)
	}

	return string(decoded), nil
}

// ParseRoleName parses a role resource name.
func ParseRoleName(name string) (RoleName, error) {
	vars, err := parse(name, roleTemplate)
	if err != nil {
		return RoleName{}, fmt.Errorf("invalid role name: %w", err)
	}

	postgresRoleName, err := DecodeRoleID(vars["roleID"])
	if err != nil {
		return RoleName{}, fmt.Errorf("invalid role name: %w", err)
	}

	return RoleName{
		InstanceID:       vars["instanceID"],
		RoleID:           vars["roleID"],
		postgresRoleName: postgresRoleName,
	}, nil
}

// MustParseRoleName is like ParseRoleName but panics on error.
// Use only in tests or where the input is guaranteed to be valid.
func MustParseRoleName(name string) RoleName {
	result, err := ParseRoleName(name)
	if err != nil {
		panic(err) //nolint:forbidigo // MustParse* functions panic by design on invalid input
	}

	return result
}

// PostgresRoleName returns the exact PostgreSQL role name. The constructors
// decode and validate the role ID, so this is a plain accessor with no re-decode.
func (n RoleName) PostgresRoleName() string {
	return n.postgresRoleName
}

// String returns the canonical string representation of the role name.
func (n RoleName) String() string {
	return fmt.Sprintf("instances/%s/roles/%s", n.InstanceID, n.RoleID)
}

// ResourceType returns the canonical resource type.
func (n RoleName) ResourceType() Type {
	return TypeRole
}

// Parent returns the parent instance name.
func (n RoleName) Parent() InstanceName {
	return InstanceName{InstanceID: n.InstanceID}
}

// IsZero reports whether n is the zero value.
func (n RoleName) IsZero() bool {
	return n.InstanceID == "" && n.RoleID == ""
}

// MarshalText implements encoding.TextMarshaler.
func (n RoleName) MarshalText() ([]byte, error) {
	return []byte(n.String()), nil
}

// UnmarshalText implements encoding.TextUnmarshaler.
func (n *RoleName) UnmarshalText(data []byte) error {
	parsed, err := ParseRoleName(string(data))
	if err != nil {
		return err
	}

	*n = parsed

	return nil
}

// Instance returns the instance resource name.
func (n RoleName) Instance() InstanceName {
	return InstanceName{InstanceID: n.InstanceID}
}

// InstanceName returns the full instance resource name as a string.
func (n RoleName) InstanceName() string {
	return n.Instance().String()
}
