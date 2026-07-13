//nolint:paralleltest // some tests modify shared state
package config_test

import (
	"context"
	"os"
	"path/filepath"
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/querylane/querylane/backend/config"
)

func TestManager_BasicConfigLoading(t *testing.T) {
	t.Parallel()

	configFile, cleanup := config.CreateTempConfigFile(t, `
name: integration-app
port: 9000
`, "config.yaml")
	defer cleanup()

	manager, err := config.NewConfigManager(context.Background(),
		NewSimpleTestConfig(),
		config.WithConfigFile(configFile))
	require.NoError(t, err)

	defer manager.Stop()

	cfg := manager.CurrentConfig()
	assert.Equal(t, "integration-app", cfg.Name)
	assert.Equal(t, 9000, cfg.Port)
	assert.Equal(t, "1.0.0", cfg.Version) // default preserved
}

func TestManager_EnvironmentOverrides(t *testing.T) {
	// Cannot use t.Parallel() when using t.Setenv
	configFile, cleanup := config.CreateTempConfigFile(t, `
name: file-app
port: 8000
`, "config.yaml")
	defer cleanup()

	config.SetEnvVars(t, map[string]string{
		"QUERYLANE_NAME": "env-app",
		"QUERYLANE_PORT": "9000",
	})

	manager, err := config.NewConfigManager(context.Background(),
		NewSimpleTestConfig(),
		config.WithConfigFile(configFile))
	require.NoError(t, err)

	defer manager.Stop()

	cfg := manager.CurrentConfig()
	assert.Equal(t, "env-app", cfg.Name) // env wins
	assert.Equal(t, 9000, cfg.Port)      // env wins
}

func TestManager_UnknownKeyRejection(t *testing.T) {
	t.Parallel()

	configFile, cleanup := config.CreateTempConfigFile(t, `
name: test-app
unknown_top_level: should-fail
`, "config.yaml")
	defer cleanup()

	_, err := config.NewConfigManager(context.Background(),
		NewSimpleTestConfig(),
		config.WithConfigFile(configFile))
	require.Error(t, err)
	assert.Contains(t, err.Error(), "unmarshal") // mentions the offending key
}

func TestManager_UpdateConfigPersistsAndReloads(t *testing.T) {
	t.Parallel()

	configFile, cleanup := config.CreateTempConfigFile(t, "", "config.yaml")
	defer cleanup()

	manager, err := config.NewConfigManager(context.Background(),
		NewSimpleTestConfig(),
		config.WithConfigFile(configFile))
	require.NoError(t, err)

	defer manager.Stop()

	// Update config
	newCfg := NewSimpleTestConfig()
	newCfg.Name = "updated-app"
	newCfg.Port = 9999

	err = manager.UpdateConfig(newCfg)
	require.NoError(t, err)

	// Verify persistence by creating new manager from same file
	manager2, err := config.NewConfigManager(context.Background(),
		NewSimpleTestConfig(),
		config.WithConfigFile(configFile))
	require.NoError(t, err)

	defer manager2.Stop()

	retrieved := manager2.CurrentConfig()
	assert.Equal(t, "updated-app", retrieved.Name)
	assert.Equal(t, 9999, retrieved.Port)
}

func TestManager_HotReloadPicksUpChanges(t *testing.T) {
	configFile, cleanup := config.CreateTempConfigFile(t, `
name: original-app
`, "config.yaml")
	defer cleanup()

	manager, err := config.NewConfigManager(context.Background(),
		NewSimpleTestConfig(),
		config.WithConfigFile(configFile),
		config.WithFilewatcher())
	require.NoError(t, err)

	defer manager.Stop()

	// Verify initial state
	cfg := manager.CurrentConfig()
	assert.Equal(t, "original-app", cfg.Name)

	// Update file on disk
	writeConfigFileAtomically(t, configFile, `name: hot-reloaded-app`)

	// Wait for file watcher to detect change
	assert.Eventually(t, func() bool {
		cfg := manager.CurrentConfig()
		return cfg.Name == "hot-reloaded-app"
	}, 5*time.Second, 50*time.Millisecond)
}

// TestManager_WatcherStartsAfterFirstWrite is the regression guard for the
// "hot reload never starts on first run" bug: when no config file exists at
// construction (fresh install, pre-onboarding) the watcher could not be
// started. After the first write adopts a config path, the watcher must start
// so manual YAML edits are picked up without a restart.
func TestManager_WatcherStartsAfterFirstWrite(t *testing.T) { //nolint:paralleltest // uses t.Setenv
	tempHome := t.TempDir()
	t.Setenv("HOME", tempHome)
	t.Setenv("USERPROFILE", tempHome) // Windows: os.UserHomeDir() checks USERPROFILE

	manager, err := config.NewConfigManager(context.Background(),
		NewSimpleTestConfig(),
		config.WithFilewatcher())
	require.NoError(t, err)

	defer manager.Stop()

	require.Empty(t, manager.ConfigFilePath(), "no config file should exist before the first write")

	newCfg := NewSimpleTestConfig()
	newCfg.Name = "written-app"
	require.NoError(t, manager.UpdateConfig(newCfg))

	configFile := manager.ConfigFilePath()
	require.NotEmpty(t, configFile, "first write should adopt the standard config path")

	// An external edit must now be picked up by the watcher.
	writeConfigFileAtomically(t, configFile, `name: externally-edited-app`)

	assert.Eventually(t, func() bool {
		return manager.CurrentConfig().Name == "externally-edited-app"
	}, 5*time.Second, 50*time.Millisecond, "watcher must start after the write path is adopted")
}

// TestManager_ConcurrentPathAccessDuringFirstWrite guards the data race on
// activeFilePath: the first write mutates it while readers (ConfigFilePath,
// ConfigPersisted, CanWriteConfig) may run concurrently. Fails under -race
// without synchronization.
func TestManager_ConcurrentPathAccessDuringFirstWrite(t *testing.T) { //nolint:paralleltest // uses t.Setenv
	tempHome := t.TempDir()
	t.Setenv("HOME", tempHome)
	t.Setenv("USERPROFILE", tempHome)

	manager, err := config.NewConfigManager(context.Background(), NewSimpleTestConfig())
	require.NoError(t, err)

	defer manager.Stop()

	var wg sync.WaitGroup

	start := make(chan struct{})

	for range 4 {
		wg.Go(func() {
			<-start

			for range 100 {
				_ = manager.ConfigFilePath()
				_ = manager.ConfigPersisted()
				_ = manager.CanWriteConfig()
			}
		})
	}

	wg.Go(func() {
		<-start

		cfg := NewSimpleTestConfig()
		cfg.Name = "race-app"
		_ = manager.UpdateConfig(cfg)
	})

	close(start)
	wg.Wait()

	assert.Equal(t, "race-app", manager.CurrentConfig().Name)
}

func TestManager_HotReloadDebouncesRapidSuccessiveWrites(t *testing.T) {
	configFile, cleanup := config.CreateTempConfigFile(t, `
name: original-app
`, "config.yaml")
	defer cleanup()

	manager, err := config.NewConfigManager(context.Background(),
		NewSimpleTestConfig(),
		config.WithConfigFile(configFile),
		config.WithFilewatcher())
	require.NoError(t, err)

	defer manager.Stop()

	var (
		mu            sync.Mutex
		notifications []string
	)

	manager.Subscribe(func(_, newCfg *SimpleTestConfig) {
		mu.Lock()
		defer mu.Unlock()

		notifications = append(notifications, newCfg.Name)
	})

	writeConfigFileAtomically(t, configFile, `name: intermediate-app`)
	writeConfigFileAtomically(t, configFile, `name: almost-final-app`)
	writeConfigFileAtomically(t, configFile, `name: final-app`)

	assert.Eventually(t, func() bool {
		return manager.CurrentConfig().Name == "final-app"
	}, 5*time.Second, 50*time.Millisecond)

	assert.Eventually(t, func() bool {
		mu.Lock()
		defer mu.Unlock()

		return len(notifications) > 0 && notifications[len(notifications)-1] == "final-app"
	}, 5*time.Second, 50*time.Millisecond)
}

func TestManager_ChangeNotificationOnlyWhenActuallyChanged(t *testing.T) {
	t.Parallel()

	configFile, cleanup := config.CreateTempConfigFile(t, "", "config.yaml")
	defer cleanup()

	manager, err := config.NewConfigManager(context.Background(),
		NewSimpleTestConfig(),
		config.WithConfigFile(configFile))
	require.NoError(t, err)

	defer manager.Stop()

	var (
		notifications int
		mu            sync.Mutex
	)

	manager.Subscribe(func(_, _ *SimpleTestConfig) {
		mu.Lock()

		notifications++

		mu.Unlock()
	})

	// Update with same values - should not notify
	sameCfg := manager.CurrentConfig()
	err = manager.UpdateConfig(sameCfg)
	require.NoError(t, err)

	// Update with different values - should notify exactly once
	newCfg := NewSimpleTestConfig()
	newCfg.Name = "changed-app"
	err = manager.UpdateConfig(newCfg)
	require.NoError(t, err)

	require.Eventually(t, func() bool {
		mu.Lock()
		defer mu.Unlock()

		return notifications == 1
	}, time.Second, 10*time.Millisecond)
}

func TestManager_ChangeNotificationsAreDeliveredSequentially(t *testing.T) {
	t.Parallel()

	configFile, cleanup := config.CreateTempConfigFile(t, "", "config.yaml")
	defer cleanup()

	manager, err := config.NewConfigManager(context.Background(),
		NewSimpleTestConfig(),
		config.WithConfigFile(configFile))
	require.NoError(t, err)

	defer manager.Stop()

	firstStarted := make(chan struct{})
	releaseFirst := make(chan struct{})
	firstFinished := make(chan struct{})
	secondStarted := make(chan struct{})

	var (
		mu            sync.Mutex
		notifications []string
	)

	manager.Subscribe(func(_, newCfg *SimpleTestConfig) {
		if newCfg.Name == "first-change" {
			close(firstStarted)
			<-releaseFirst
		}

		mu.Lock()

		notifications = append(notifications, newCfg.Name)
		mu.Unlock()

		if newCfg.Name == "first-change" {
			close(firstFinished)
		}

		if newCfg.Name == "second-change" {
			close(secondStarted)
		}
	})

	update := func(name string) <-chan error {
		errCh := make(chan error, 1)

		go func() {
			cfg := NewSimpleTestConfig()

			cfg.Name = name
			errCh <- manager.UpdateConfig(cfg)
		}()

		return errCh
	}

	waitForSignal := func(signal <-chan struct{}, message string) {
		t.Helper()

		select {
		case <-signal:
		case <-time.After(time.Second):
			t.Fatal(message)
		}
	}

	waitForUpdate := func(errCh <-chan error) {
		t.Helper()

		select {
		case updateErr := <-errCh:
			require.NoError(t, updateErr)
		case <-time.After(time.Second):
			t.Fatal("timed out waiting for config update")
		}
	}

	firstErr := update("first-change")

	waitForSignal(firstStarted, "timed out waiting for first notification")
	waitForUpdate(firstErr)

	secondErr := update("second-change")
	waitForUpdate(secondErr)

	close(releaseFirst)
	waitForSignal(firstFinished, "timed out waiting for first notification to finish")
	waitForSignal(secondStarted, "timed out waiting for second notification")

	assert.Equal(t, []string{"first-change", "second-change"}, notifications)
}

func TestManager_ReadOnlyFileSystemDegradation(t *testing.T) {
	t.Parallel()

	// Use an empty config file to ensure consistent behavior
	configFile, cleanup := config.CreateTempConfigFile(t, "", "config.yaml")
	defer cleanup()

	manager, err := config.NewConfigManager(context.Background(),
		NewSimpleTestConfig(),
		config.WithConfigFile(configFile))
	require.NoError(t, err)

	defer manager.Stop()

	// Should still work for reading
	cfg := manager.CurrentConfig()
	assert.Equal(t, "simple-app", cfg.Name)

	// CanWriteConfig should be true since we can write to temp directory
	canWrite := manager.CanWriteConfig()
	assert.True(t, canWrite, "Should be able to write to temp directory")

	// Test that updates work
	newCfg := NewSimpleTestConfig()
	newCfg.Name = "updated"
	err = manager.UpdateConfig(newCfg)
	require.NoError(t, err)

	// Verify update worked
	updated := manager.CurrentConfig()
	assert.Equal(t, "updated", updated.Name)
}

// =============================================================================
// MARSHAL HELPER TESTS
// =============================================================================

func TestManager_NoChangeUpdateAvoidsWrite(t *testing.T) {
	t.Parallel()

	configFile, cleanup := config.CreateTempConfigFile(t, "", "config.yaml")
	defer cleanup()

	manager, err := config.NewConfigManager(context.Background(),
		NewSimpleTestConfig(),
		config.WithConfigFile(configFile))
	require.NoError(t, err)

	defer manager.Stop()

	// Write the current config once so the file matches the in-memory state.
	sameCfg := manager.CurrentConfig()
	err = manager.UpdateConfig(sameCfg)
	require.NoError(t, err)

	// Get file stat after the initial write.
	stat1, err := os.Stat(configFile)
	require.NoError(t, err)

	// Second update with the same values — should skip the write because
	// the serialised YAML is identical to what is already on disk.
	err = manager.UpdateConfig(sameCfg)
	require.NoError(t, err)

	// File should not have been modified.
	stat2, err := os.Stat(configFile)
	require.NoError(t, err)
	assert.Equal(t, stat1.ModTime(), stat2.ModTime(), "File should not have been rewritten for unchanged config")
}

func TestManager_CustomEnvPrefix(t *testing.T) {
	// Cannot use t.Parallel() when using t.Setenv
	configFile, cleanup := config.CreateTempConfigFile(t, `
name: file-app
`, "config.yaml")
	defer cleanup()

	config.SetEnvVars(t, map[string]string{
		"CUSTOM_PREFIX_NAME": "custom-env-app",
		"CUSTOM_PREFIX_PORT": "8888",
	})

	manager, err := config.NewConfigManager(context.Background(),
		NewSimpleTestConfig(),
		config.WithConfigFile(configFile),
		config.WithEnvPrefix("CUSTOM_PREFIX_"))
	require.NoError(t, err)

	defer manager.Stop()

	cfg := manager.CurrentConfig()
	assert.Equal(t, "custom-env-app", cfg.Name) // custom env prefix works
	assert.Equal(t, 8888, cfg.Port)
}

func TestMarshalYAML(t *testing.T) {
	t.Parallel()

	cfg := NewSimpleTestConfig()
	cfg.Name = "marshal-test"
	cfg.Port = 7777

	data, err := config.MarshalYAML(cfg)
	require.NoError(t, err)

	// Should contain expected fields
	yamlStr := string(data)
	assert.Contains(t, yamlStr, "name: marshal-test")
	assert.Contains(t, yamlStr, "port: 7777")
	assert.Contains(t, yamlStr, "debug: true")
}

func writeConfigFileAtomically(t *testing.T, path, content string) {
	t.Helper()

	tmpFile, err := os.CreateTemp(filepath.Dir(path), filepath.Base(path)+".tmp-*")
	require.NoError(t, err)

	tmpPath := tmpFile.Name()
	closed := false

	defer func() {
		if !closed {
			_ = tmpFile.Close()
		}

		_ = os.Remove(tmpPath)
	}()

	_, err = tmpFile.WriteString(content)
	require.NoError(t, err)
	require.NoError(t, tmpFile.Close())

	closed = true

	require.NoError(t, os.Rename(tmpPath, path))
}
