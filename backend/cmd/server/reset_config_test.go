package server_test

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/querylane/querylane/backend/cmd/server"
	"github.com/querylane/querylane/backend/config"
)

func TestResetConfigCmd_RemovesOnlyInternalStorageConfiguration(t *testing.T) {
	t.Parallel()

	configPath := filepath.Join(t.TempDir(), "config.yaml")
	original := `http:
  host: 127.0.0.1
  port: 9090
database:
  host: broken.example.com
  database: querylane
  username: querylane
instances:
  - id: production
    host: production.example.com
    database: app
    username: reader
`
	require.NoError(t, os.WriteFile(configPath, []byte(original), 0o600))

	cmd := server.ResetConfigCmd{Config: configPath, Yes: true}
	require.NoError(t, cmd.Run(&config.Globals{}))

	updated, err := os.ReadFile(configPath)
	require.NoError(t, err)
	assert.NotContains(t, string(updated), "database:\n  host: broken.example.com")
	assert.Contains(t, string(updated), "host: 127.0.0.1")
	assert.Contains(t, string(updated), "id: production")

	backup, err := os.ReadFile(configPath + ".bak")
	require.NoError(t, err)
	assert.Equal(t, original, string(backup))
}

func TestResetConfigCmd_RequiresExplicitConfigPath(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	t.Setenv("USERPROFILE", home)

	configPath := filepath.Join(home, ".querylane", "config.yaml")
	require.NoError(t, os.MkdirAll(filepath.Dir(configPath), 0o755))
	require.NoError(t, os.WriteFile(configPath, []byte(`embedded:
  mode: persistent
`), 0o600))

	cmd := server.ResetConfigCmd{Yes: true}
	err := cmd.Run(&config.Globals{})

	require.ErrorContains(t, err, "--config")
	updated, err := os.ReadFile(configPath)
	require.NoError(t, err)
	assert.Contains(t, string(updated), "embedded:")
	assert.NoFileExists(t, configPath+".bak")
}

func TestResetConfigCmd_MissingConfigIsActionable(t *testing.T) {
	t.Parallel()

	configPath := filepath.Join(t.TempDir(), "missing.yaml")
	cmd := server.ResetConfigCmd{Config: configPath, Yes: true}

	err := cmd.Run(&config.Globals{})
	require.Error(t, err)
	require.ErrorContains(t, err, configPath)
	require.ErrorContains(t, err, "does not exist")
}

func TestResetConfigCmd_DoesNotOverwriteExistingBackup(t *testing.T) {
	t.Parallel()

	configPath := filepath.Join(t.TempDir(), "config.yaml")
	require.NoError(t, os.WriteFile(configPath, []byte("database:\n  dsn: first\n"), 0o600))
	require.NoError(t, os.WriteFile(configPath+".bak", []byte("older backup\n"), 0o600))

	cmd := server.ResetConfigCmd{Config: configPath, Yes: true}
	require.NoError(t, cmd.Run(&config.Globals{}))

	olderBackup, err := os.ReadFile(configPath + ".bak")
	require.NoError(t, err)
	assert.Equal(t, "older backup\n", string(olderBackup))

	newBackup, err := os.ReadFile(configPath + ".bak.1")
	require.NoError(t, err)
	assert.Equal(t, "database:\n  dsn: first\n", string(newBackup))
}

func TestResetConfigCmd_LeavesConfigWithoutInternalStorageUntouched(t *testing.T) {
	t.Parallel()

	configPath := filepath.Join(t.TempDir(), "config.yaml")
	original := "http:\n  host: 127.0.0.1\n  port: 8080\n"
	require.NoError(t, os.WriteFile(configPath, []byte(original), 0o600))

	cmd := server.ResetConfigCmd{Config: configPath, Yes: true}
	require.NoError(t, cmd.Run(&config.Globals{}))

	updated, err := os.ReadFile(configPath)
	require.NoError(t, err)
	assert.Equal(t, original, string(updated))
	assert.NoFileExists(t, configPath+".bak")
}

func TestResetConfigCmd_RequiresExplicitConfirmation(t *testing.T) {
	t.Parallel()

	configPath := filepath.Join(t.TempDir(), "config.yaml")
	original := "database:\n  host: broken.example.com\n"
	require.NoError(t, os.WriteFile(configPath, []byte(original), 0o600))

	cmd := server.ResetConfigCmd{Config: configPath}
	err := cmd.Run(&config.Globals{})

	require.ErrorContains(t, err, "--yes")

	updated, readErr := os.ReadFile(configPath)
	require.NoError(t, readErr)
	assert.Equal(t, original, string(updated))
	assert.NoFileExists(t, configPath+".bak")
}

func TestResetConfigCmd_DoesNotFollowPreexistingTemporaryFileSymlink(t *testing.T) {
	t.Parallel()

	directory := t.TempDir()
	configPath := filepath.Join(directory, "config.yaml")
	victimPath := filepath.Join(directory, "victim.txt")
	temporaryPath := filepath.Join(directory, ".config.yaml.reset.tmp")

	require.NoError(t, os.WriteFile(configPath, []byte("database:\n  host: broken.example.com\n"), 0o600))
	require.NoError(t, os.WriteFile(victimPath, []byte("do not replace\n"), 0o600))
	require.NoError(t, os.Symlink(victimPath, temporaryPath))

	cmd := server.ResetConfigCmd{Config: configPath, Yes: true}
	require.NoError(t, cmd.Run(&config.Globals{}))

	victim, err := os.ReadFile(victimPath)
	require.NoError(t, err)
	assert.Equal(t, "do not replace\n", string(victim))
}
