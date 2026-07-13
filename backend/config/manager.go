package config

import (
	"bytes"
	"context"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"reflect"
	"sync"
	"sync/atomic"
	"time"

	"github.com/fsnotify/fsnotify"
)

// ChangeCallback is called when configuration changes occur.
// The callback receives the old and new configuration values.
type ChangeCallback[T any] func(oldConfig, newConfig T)

type configChange[T any] struct {
	oldConfig T
	newConfig T
}

type changeSubscriber[T any] struct {
	callback ChangeCallback[T]

	// pending is drained by at most one dispatcher, preserving change order for
	// this subscriber without blocking other subscribers.
	mu          sync.Mutex
	pending     []configChange[T]
	dispatching bool
}

// Manager handles dynamic configuration management.
// It orchestrates loading, persistence, file watching, and change notifications.
type Manager[T Node] struct {
	loader                 Loader[T]
	standardConfigFilepath string // A file under that path may or may not exist.

	// activeFilePath is the resolved config file path. It is set at
	// construction, but on a fresh install (no file yet) it is adopted by the
	// first successful write — concurrent readers must go through
	// activeConfigFilePath, guarded by pathMu.
	pathMu         sync.RWMutex
	activeFilePath string

	currentConfig atomic.Pointer[T]
	defaultConfig T // Default configuration to use as base
	options       *Options

	// reloadMu serializes the full load-store-notify transition so subscribers
	// observe configuration changes in the same order they are stored.
	reloadMu sync.Mutex

	// envKeyMatcher reports whether a flattened config key maps to a real field.
	// Computed once from the config type; used to filter environment variables.
	envKeyMatcher func(key string) bool

	// Configuration change subscription
	subscribersMu sync.RWMutex
	subscribers   map[uint32]*changeSubscriber[T]
	nextID        uint32

	// File write synchronization
	writeMu sync.Mutex

	// File watcher for hot reloading. watcherMu guards starting/stopping the
	// watcher: it may be started lazily (after the first write adopts a
	// config path) and must not start after Stop.
	watcherMu      sync.Mutex
	watcherStopped bool
	fileWatcher    *fsnotify.Watcher
	watchEvents    chan struct{}
	watcherDone    chan struct{}
	watcherWG      sync.WaitGroup
	stopOnce       sync.Once
}

const fileWatcherDebounce = 100 * time.Millisecond

// NewConfigManager creates a new configuration manager.
func NewConfigManager[T Node](ctx context.Context, defaultConfig T, options ...Option) (*Manager[T], error) {
	opts := &Options{}
	for _, apply := range options {
		apply(opts)
	}

	home, _ := os.UserHomeDir() // ignore error – empty for minimal containers
	stdPath := filepath.Join(home, ".querylane", "config.yaml")

	// pick an explicit file, otherwise existing std path, otherwise empty
	if opts.configFile == "" && fileExists(stdPath) {
		opts.configFile = stdPath
	}

	// Set default env prefix if not provided
	if opts.envPrefix == "" {
		opts.envPrefix = "QUERYLANE_"
	}

	// Ensure defaults are set on the provided config
	defaultConfig.SetDefaults()

	manager := &Manager[T]{
		loader:                 NewLoader[T](),
		standardConfigFilepath: stdPath,
		activeFilePath:         opts.configFile,
		defaultConfig:          defaultConfig,
		options:                opts,
		subscribers:            make(map[uint32]*changeSubscriber[T]),
		envKeyMatcher:          knownConfigKeys(reflect.TypeOf(defaultConfig)),
	}

	// Load configuration into memory initially
	if err := manager.reloadConfiguration(ctx); err != nil {
		return nil, fmt.Errorf("failed to load configuration: %w", err)
	}

	if opts.withFilewatcher && opts.configFile != "" {
		if err := manager.ensureWatcher(opts.configFile); err != nil { //nolint:contextcheck // watcher goroutines outlive the construction context and reload with a background context by design
			return nil, fmt.Errorf("failed to start watcher: %w", err)
		}
	}

	return manager, nil
}

// reloadConfiguration loads configuration using the Loader and configured sources.
func (cm *Manager[T]) reloadConfiguration(ctx context.Context) error {
	cm.reloadMu.Lock()
	defer cm.reloadMu.Unlock()

	// Get the old config before loading (for subscribers that want to diff changes)
	oldConfig := cm.CurrentConfig()

	// Build sources in priority order: defaults -> file -> env
	var sources []Source

	sources = append(sources, Struct{Value: cm.defaultConfig})

	if path := cm.activeConfigFilePath(); path != "" {
		sources = append(sources, File(path))
	}

	sources = append(sources, FilteredEnv{Prefix: cm.options.envPrefix, Known: cm.envKeyMatcher})

	newConfig, err := cm.loader.Load(ctx, sources...)
	if err != nil {
		return fmt.Errorf("failed to load config: %w", err)
	}

	cm.currentConfig.Store(&newConfig)
	cm.notifySubscribers(oldConfig, newConfig)

	return nil
}

// CurrentConfig returns the current configuration.
//
// **Important:** When T is a pointer type (common with Node implementations),
// this method returns the same pointer instance that Manager stores internally.
// The caller **MUST treat the returned value as immutable** to avoid data races.
//
// For struct types: Returns a shallow copy. Pointer fields, slices, maps within
// the struct still reference shared memory.
//
// For pointer types: Returns the same pointer - NO copying occurs.
//
// **Safe usage:**
//   - Read configuration values: ✅ Safe
//   - Mutate returned config: ❌ Race condition risk
//   - To modify config: Call UpdateConfig() with a new instance
//
// **Thread safety:** Multiple goroutines can safely call CurrentConfig()
// concurrently, but must not mutate the returned value.
func (cm *Manager[T]) CurrentConfig() T {
	if cfg := cm.currentConfig.Load(); cfg != nil {
		return *cfg
	}

	return cm.defaultConfig
}

// CanWriteConfig reports whether configuration can be written to the filesystem.
func (cm *Manager[T]) CanWriteConfig() bool {
	return cm.checkWriteCapability()
}

// checkWriteCapability returns true only when we can create the target
// directory. It never tries to write to "/" or an empty path.
func (cm *Manager[T]) checkWriteCapability() bool {
	targetPath := cm.activeConfigFilePath()
	if targetPath == "" {
		targetPath = cm.standardConfigFilepath
	}

	if targetPath == "" {
		return false
	}

	dir := filepath.Dir(targetPath)
	if dir == "" || dir == "/" || dir == "." {
		return false
	}

	return os.MkdirAll(dir, 0o755) == nil
}

// writeConfig validates, serialises and atomically stores cfg to disk.
func (cm *Manager[T]) writeConfig(cfg T) error {
	// Synchronize file write operations to prevent concurrent temp file conflicts
	cm.writeMu.Lock()
	defer cm.writeMu.Unlock()

	path := cm.resolvedWritePath()

	// Ensure config directory exists
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return fmt.Errorf("cannot create config directory: %w", err)
	}

	// Marshal config to YAML using centralized helper
	data, err := MarshalYAML(cfg)
	if err != nil {
		return fmt.Errorf("failed to marshal config: %w", err)
	}

	// Skip write if the file already contains identical content.
	existing, readErr := os.ReadFile(path)
	if readErr == nil && bytes.Equal(existing, data) {
		return nil
	}

	// Write to file atomically
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, data, 0o600); err != nil {
		return err
	}

	if err := os.Rename(tmp, path); err != nil {
		_ = os.Remove(tmp)
		return err
	}

	// If we wrote to the fallback path (no explicit config file was set),
	// adopt it as the active file path so that ConfigFilePath(),
	// ConfigPersisted(), and future reads/writes use this file.
	cm.adoptWritePath(path)

	return nil
}

// adoptWritePath records path as the active config file if none was set yet
// (the first write on a fresh install) and, when hot reloading is enabled,
// starts the file watcher that NewConfigManager could not start because no
// config file existed at construction time.
func (cm *Manager[T]) adoptWritePath(path string) {
	cm.pathMu.Lock()

	if cm.activeFilePath != "" {
		cm.pathMu.Unlock()

		return
	}

	cm.activeFilePath = path
	cm.pathMu.Unlock()

	if !cm.options.withFilewatcher {
		return
	}

	if err := cm.ensureWatcher(path); err != nil {
		slog.Error("failed to start config file watcher after first write",
			"file", path, "err", err)
	}
}

// activeConfigFilePath returns the resolved config file path, or empty when
// no config file exists yet. Safe for concurrent use.
func (cm *Manager[T]) activeConfigFilePath() string {
	cm.pathMu.RLock()
	defer cm.pathMu.RUnlock()

	return cm.activeFilePath
}

// UpdateConfig writes cfg to disk and reloads the merged configuration
// (defaults + file + env). Only explicitly-set values are persisted so that
// default changes in future releases take effect automatically.
func (cm *Manager[T]) UpdateConfig(cfg T) error {
	if err := cm.writeConfig(cfg); err != nil {
		return err
	}

	slog.Info("configuration written to disk", slog.String("path", cm.resolvedWritePath()))

	// Reload from disk to merge with defaults, validate, and update
	// the in-memory config. This mirrors the startup load path.
	if err := cm.reloadConfiguration(context.Background()); err != nil {
		return fmt.Errorf("config written but failed to reload: %w", err)
	}

	return nil
}

// ConfigFilePath returns the path to the config file that would be used.
// Returns empty if no explicit config file was provided and the standard
// path does not exist yet.
func (cm *Manager[T]) ConfigFilePath() string {
	return cm.activeConfigFilePath()
}

// resolvedWritePath returns the path that writeConfig will use. It mirrors
// the fallback logic in writeConfig: activeFilePath → standardConfigFilepath.
func (cm *Manager[T]) resolvedWritePath() string {
	if path := cm.activeConfigFilePath(); path != "" {
		return path
	}

	return cm.standardConfigFilepath
}

// StandardHomePath returns the querylane home directory (e.g. ~/.querylane).
func (cm *Manager[T]) StandardHomePath() string {
	return filepath.Dir(cm.standardConfigFilepath)
}

// ConfigPersisted reports whether the current configuration is persisted to disk. This
// will only return true if the file actually exists.
func (cm *Manager[T]) ConfigPersisted() bool {
	path := cm.activeConfigFilePath()
	if path == "" {
		return false
	}

	_, err := os.Stat(path)

	return err == nil
}

// Subscribe registers a callback to be called when configuration changes.
// Changes are delivered in order per subscriber; subscribers run independently.
// Returns a subscription ID that can be used to unsubscribe.
func (cm *Manager[T]) Subscribe(callback ChangeCallback[T]) uint32 {
	cm.subscribersMu.Lock()
	defer cm.subscribersMu.Unlock()

	cm.nextID++
	id := cm.nextID
	cm.subscribers[id] = &changeSubscriber[T]{callback: callback}

	return id
}

// Unsubscribe removes a configuration change subscription.
func (cm *Manager[T]) Unsubscribe(subscriptionID uint32) {
	cm.subscribersMu.Lock()
	defer cm.subscribersMu.Unlock()

	delete(cm.subscribers, subscriptionID)
}

// ensureWatcher starts the file watcher exactly once. Safe to call from both
// construction and the first config write; it no-ops when a watcher is
// already running or the manager has been stopped.
func (cm *Manager[T]) ensureWatcher(path string) error {
	cm.watcherMu.Lock()
	defer cm.watcherMu.Unlock()

	if cm.watcherStopped || cm.fileWatcher != nil {
		return nil
	}

	return cm.startWatcher(path)
}

// startWatcher must be called with watcherMu held (see ensureWatcher).
func (cm *Manager[T]) startWatcher(path string) error {
	watcher, err := fsnotify.NewWatcher()
	if err != nil {
		return err
	}

	watchDir := filepath.Dir(path)

	if err := watcher.Add(watchDir); err != nil {
		_ = watcher.Close()
		return err
	}

	cm.fileWatcher = watcher
	cm.watchEvents = make(chan struct{}, 1)
	cm.watcherDone = make(chan struct{})

	cm.watcherWG.Add(1)

	go cm.watchConfigFile(path)

	cm.watcherWG.Add(1)

	go cm.runDebouncedReloads(path)

	return nil
}

func (cm *Manager[T]) watchConfigFile(path string) {
	defer cm.watcherWG.Done()

	target := filepath.Clean(path)

	for {
		select {
		case <-cm.watcherDone:
			return
		case event, ok := <-cm.fileWatcher.Events:
			if !ok {
				return
			}

			if filepath.Clean(event.Name) != target {
				continue
			}

			if !event.Has(fsnotify.Create | fsnotify.Write | fsnotify.Rename | fsnotify.Remove) {
				continue
			}

			slog.Info("config manager detected config update, scheduling reload", "file", path)
			cm.signalWatchEvent()
		case err, ok := <-cm.fileWatcher.Errors:
			if !ok || cm.isWatcherStopped() {
				return
			}

			slog.Error("file-watch error", "file", path, "err", err)
		}
	}
}

func (cm *Manager[T]) signalWatchEvent() {
	select {
	case cm.watchEvents <- struct{}{}:
	default:
	}
}

func (cm *Manager[T]) runDebouncedReloads(path string) {
	defer cm.watcherWG.Done()

	var (
		timer  *time.Timer
		timerC <-chan time.Time
	)

	stopTimer := func() {
		if timer == nil {
			return
		}

		if !timer.Stop() {
			select {
			case <-timer.C:
			default:
			}
		}

		timerC = nil
	}

	for {
		select {
		case <-cm.watcherDone:
			stopTimer()
			return
		case <-cm.watchEvents:
			if timer == nil {
				timer = time.NewTimer(fileWatcherDebounce)
			} else {
				stopTimer()
				timer.Reset(fileWatcherDebounce)
			}

			timerC = timer.C
		case <-timerC:
			timerC = nil

			slog.Info("config manager reloading configuration after debounce", "file", path)

			if err := cm.reloadConfiguration(context.Background()); err != nil {
				slog.Error("reload failed", "file", path, "err", err)
			}
		}
	}
}

func (cm *Manager[T]) isWatcherStopped() bool {
	select {
	case <-cm.watcherDone:
		return true
	default:
		return false
	}
}

// notifySubscribers calls all registered callbacks with the old and new configuration.
// Only notifies if the configuration has actually changed (deep equality check).
func (cm *Manager[T]) notifySubscribers(oldCfg, newCfg T) {
	// Check if configurations are actually different using deep equality
	if reflect.DeepEqual(oldCfg, newCfg) {
		// No change detected, skip notification
		return
	}

	cm.subscribersMu.RLock()

	subscribers := make([]*changeSubscriber[T], 0, len(cm.subscribers))
	for _, subscriber := range cm.subscribers {
		subscribers = append(subscribers, subscriber)
	}

	cm.subscribersMu.RUnlock()

	for _, subscriber := range subscribers {
		subscriber.enqueue(oldCfg, newCfg)
	}
}

func (subscriber *changeSubscriber[T]) enqueue(oldConfig, newConfig T) {
	subscriber.mu.Lock()
	subscriber.pending = append(subscriber.pending, configChange[T]{
		oldConfig: oldConfig,
		newConfig: newConfig,
	})

	if subscriber.dispatching {
		subscriber.mu.Unlock()

		return
	}

	subscriber.dispatching = true
	subscriber.mu.Unlock()

	go subscriber.dispatch()
}

func (subscriber *changeSubscriber[T]) dispatch() {
	for {
		subscriber.mu.Lock()
		if len(subscriber.pending) == 0 {
			subscriber.pending = nil
			subscriber.dispatching = false
			subscriber.mu.Unlock()

			return
		}

		change := subscriber.pending[0]
		subscriber.pending[0] = configChange[T]{}
		subscriber.pending = subscriber.pending[1:]
		subscriber.mu.Unlock()

		func() {
			defer func() {
				if r := recover(); r != nil {
					slog.Error("config change subscriber panicked", "panic", r)
				}
			}()

			subscriber.callback(change.oldConfig, change.newConfig)
		}()
	}
}

// Stop cleans up the configuration manager and stops any file watchers.
// Safe to call multiple times.
func (cm *Manager[T]) Stop() {
	cm.stopOnce.Do(func() {
		cm.watcherMu.Lock()
		cm.watcherStopped = true
		watcherDone := cm.watcherDone
		fileWatcher := cm.fileWatcher
		cm.watcherMu.Unlock()

		if watcherDone != nil {
			close(watcherDone)
		}

		if fileWatcher != nil {
			_ = fileWatcher.Close()
		}

		cm.watcherWG.Wait()
	})
}

// fileExists checks if a file exists.
func fileExists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}
