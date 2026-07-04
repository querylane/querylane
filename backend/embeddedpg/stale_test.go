package embeddedpg

import (
	"context"
	"os"
	"path/filepath"
	"strconv"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestCleanStalePID(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name        string
		setup       func(t *testing.T, dataPath string)
		wantErr     bool
		wantLivePID bool
		pidRemoved  bool
	}{
		{
			name:       "no pid file",
			setup:      func(_ *testing.T, _ string) {},
			pidRemoved: false,
		},
		{
			name: "empty pid file is removed",
			setup: func(t *testing.T, dataPath string) {
				t.Helper()
				require.NoError(t, os.WriteFile(filepath.Join(dataPath, "postmaster.pid"), []byte(""), 0o644))
			},
			pidRemoved: true,
		},
		{
			name: "malformed pid file is removed",
			setup: func(t *testing.T, dataPath string) {
				t.Helper()
				require.NoError(t, os.WriteFile(filepath.Join(dataPath, "postmaster.pid"), []byte("not-a-number\n"), 0o644))
			},
			pidRemoved: true,
		},
		{
			name: "stale pid (dead process) is removed",
			setup: func(t *testing.T, dataPath string) {
				t.Helper()
				// PID 2147483647 is extremely unlikely to be running.
				require.NoError(t, os.WriteFile(filepath.Join(dataPath, "postmaster.pid"), []byte("2147483647\n"), 0o644))
			},
			pidRemoved: true,
		},
		{
			name: "live pid returns LivePID without error",
			setup: func(t *testing.T, dataPath string) {
				t.Helper()
				// Use our own PID — guaranteed to be alive.
				pid := os.Getpid()
				require.NoError(t, os.WriteFile(filepath.Join(dataPath, "postmaster.pid"), []byte(strconv.Itoa(pid)+"\n"), 0o644))
			},
			wantLivePID: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			dataPath := t.TempDir()
			tt.setup(t, dataPath)

			result, err := cleanStalePID(context.Background(), dataPath)

			if tt.wantErr {
				require.Error(t, err)

				return
			}

			require.NoError(t, err)

			if tt.wantLivePID {
				assert.Equal(t, os.Getpid(), result.LivePID)

				return
			}

			assert.Zero(t, result.LivePID)

			if tt.pidRemoved {
				_, statErr := os.Stat(filepath.Join(dataPath, "postmaster.pid"))
				assert.True(t, os.IsNotExist(statErr), "pid file should have been removed")
			}
		})
	}
}

func TestProcessRunning(t *testing.T) {
	t.Parallel()

	t.Run("own process is running", func(t *testing.T) {
		t.Parallel()
		assert.True(t, processRunning(os.Getpid()))
	})

	t.Run("impossible PID is not running", func(t *testing.T) {
		t.Parallel()
		assert.False(t, processRunning(2147483647))
	})
}
