package resource

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestAuditLogEntryNameRoundTrip(t *testing.T) {
	t.Parallel()

	name := NewAuditLogEntryName("42")
	assert.Equal(t, "auditLogEntries/42", name.String())
	assert.Equal(t, TypeAuditLogEntry, name.ResourceType())

	parsed, err := ParseAuditLogEntryName(name.String())
	require.NoError(t, err)
	assert.Equal(t, name, parsed)

	_, err = ParseAuditLogEntryName("auditLogEntries/")
	require.Error(t, err)
}
