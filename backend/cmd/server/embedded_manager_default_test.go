//go:build !no_embedded_postgres

package server

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestNewEmbeddedManagerIsAvailableByDefault(t *testing.T) {
	t.Parallel()

	manager, err := newEmbeddedManager()
	require.NoError(t, err)
	require.NotNil(t, manager)
}
