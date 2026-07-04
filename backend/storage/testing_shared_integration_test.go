package storage

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestIntegrationNewTestDBReusesServerWithIsolatedDatabases(t *testing.T) {
	t.Parallel()

	if testing.Short() {
		t.Skip("skipping storage integration test in short mode")
	}

	first := NewTestDB(t)
	second := NewTestDB(t)

	require.Equal(t, first.Port(), second.Port())

	_, err := first.DB().ExecContext(t.Context(), "CREATE TABLE only_in_first (id int PRIMARY KEY)")
	require.NoError(t, err)

	_, err = second.DB().ExecContext(t.Context(), "SELECT * FROM only_in_first")
	require.Error(t, err)
}
