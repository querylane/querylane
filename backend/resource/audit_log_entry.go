package resource

import (
	"fmt"
	"strings"
)

var auditLogEntryTemplate = strings.Split(AuditLogEntryPattern, "/")

// AuditLogEntryName represents a parsed audit-log resource name.
// Format: auditLogEntries/{auditLogEntry}.
type AuditLogEntryName struct {
	AuditLogEntryID string
}

// NewAuditLogEntryName creates an AuditLogEntryName from its identifier.
func NewAuditLogEntryName(auditLogEntryID string) AuditLogEntryName {
	return AuditLogEntryName{AuditLogEntryID: auditLogEntryID}
}

// ParseAuditLogEntryName parses an audit-log resource name.
func ParseAuditLogEntryName(name string) (AuditLogEntryName, error) {
	vars, err := parse(name, auditLogEntryTemplate)
	if err != nil {
		return AuditLogEntryName{}, fmt.Errorf("invalid audit log entry name: %w", err)
	}

	return AuditLogEntryName{AuditLogEntryID: vars["auditLogEntryID"]}, nil
}

// String returns the canonical string representation.
func (n AuditLogEntryName) String() string {
	return "auditLogEntries/" + n.AuditLogEntryID
}

// ResourceType returns the canonical resource type.
func (n AuditLogEntryName) ResourceType() Type {
	return TypeAuditLogEntry
}
