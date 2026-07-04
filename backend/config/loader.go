package config

import (
	"context"
	"fmt"
	"strings"

	"github.com/go-viper/mapstructure/v2"
	"github.com/knadh/koanf/parsers/json"
	"github.com/knadh/koanf/parsers/toml/v2"
	"github.com/knadh/koanf/parsers/yaml"
	"github.com/knadh/koanf/providers/env"
	"github.com/knadh/koanf/providers/file"
	"github.com/knadh/koanf/providers/structs"
	"github.com/knadh/koanf/v2"
)

// Node interface defines what a proper configuration node should implement.
type Node interface {
	// SetDefaults sets up default values for the configuration.
	SetDefaults()

	// Validate validates the configuration and returns an error if invalid.
	Validate() error

	// OnLoadingComplete is called after configuration loading is complete.
	// This can be used for post-loading initialization or setup.
	OnLoadingComplete(context.Context)
}

// Loader knows nothing about files, env-vars or specific koanf setup.
// It only turns "sources" into a validated value of T.
type Loader[T any] interface {
	Load(context.Context, ...Source) (T, error)
}

// Source represents a configuration source that can be applied to koanf.
type Source interface {
	apply(*koanf.Koanf) error
}

// File source loads configuration from a file.
type File string

func (f File) apply(k *koanf.Koanf) error {
	parser, err := pickParser(string(f))
	if err != nil {
		return err
	}

	return k.Load(file.Provider(string(f)), parser)
}

// Env source loads configuration from environment variables.
type Env string

func (e Env) apply(k *koanf.Koanf) error {
	prefix := string(e)
	envProvider := env.Provider(prefix, ".", func(s string) string {
		return envConfigKey(strings.TrimPrefix(s, prefix), nil)
	})

	return k.Load(envProvider, nil)
}

// FilteredEnv loads configuration from environment variables under Prefix,
// skipping any variable whose mapped config key is not accepted by Known.
//
// Unlike Env, this keeps unrelated or reserved QUERYLANE_* environment
// variables (consumed elsewhere via os.Getenv, such as the instance secret key
// or the config-file path) from being treated as unknown config keys and
// aborting the strict unmarshal. A nil Known accepts every key, matching Env.
type FilteredEnv struct {
	Prefix string
	Known  func(key string) bool
}

func (e FilteredEnv) apply(k *koanf.Koanf) error {
	envProvider := env.Provider(e.Prefix, ".", func(s string) string {
		// Returning "" tells the koanf env provider to skip this variable.
		return envConfigKey(strings.TrimPrefix(s, e.Prefix), e.Known)
	})

	return k.Load(envProvider, nil)
}

// envConfigKey maps an environment variable name (prefix already stripped) to
// a flattened, dot-delimited config key. Two conventions are supported:
//
//   - Double underscores separate nesting levels and single underscores stay
//     part of the field name, so snake_case fields are reachable:
//     DATABASE__SSL_MODE → database.ssl_mode.
//   - Legacy: every underscore separates nesting levels:
//     DATABASE_DSN → database.dsn. This cannot address snake_case fields.
//
// When known is non-nil the convention producing a known key wins (the
// double-underscore form is preferred) and "" is returned when neither
// matches, so the variable is skipped. When known is nil the
// double-underscore convention applies only to names that contain "__".
func envConfigKey(name string, known func(key string) bool) string {
	lower := strings.ToLower(name)
	nested := strings.ReplaceAll(lower, "__", ".")
	legacy := strings.ReplaceAll(lower, "_", ".")

	if known == nil {
		if strings.Contains(lower, "__") {
			return nested
		}

		return legacy
	}

	if known(nested) {
		return nested
	}

	if known(legacy) {
		return legacy
	}

	return ""
}

// Struct source loads configuration from a Go struct (for defaults).
type Struct struct {
	Value any
}

func (s Struct) apply(k *koanf.Koanf) error {
	return k.Load(structs.Provider(s.Value, "koanf"), nil)
}

// DefaultLoader is the standard implementation of Loader.
type DefaultLoader[T Node] struct{}

// NewLoader creates a new DefaultLoader instance.
func NewLoader[T Node]() *DefaultLoader[T] {
	return &DefaultLoader[T]{}
}

// Load applies all sources in order and returns a validated configuration.
func (l *DefaultLoader[T]) Load(ctx context.Context, sources ...Source) (T, error) {
	var config T

	k := koanf.New(".")

	// Apply all sources in order
	for _, source := range sources {
		if err := source.apply(k); err != nil {
			return config, fmt.Errorf("failed to apply config source: %w", err)
		}
	}

	// Unmarshal into config struct
	unmarshalCfg := koanf.UnmarshalConf{
		Tag:       "koanf",
		FlatPaths: false,
		DecoderConfig: &mapstructure.DecoderConfig{
			DecodeHook: mapstructure.ComposeDecodeHookFunc(
				mapstructure.StringToTimeDurationHookFunc(),
				mapstructure.StringToSliceHookFunc(","),
				mapstructure.TextUnmarshallerHookFunc(),
			),
			Result:           &config,
			WeaklyTypedInput: true,
			ErrorUnused:      true,
			TagName:          "koanf",
		},
	}
	if err := k.UnmarshalWithConf("", &config, unmarshalCfg); err != nil {
		return config, fmt.Errorf("failed to unmarshal config: %w", err)
	}

	// Call hooks if config implements the interfaces
	if err := callHooks(ctx, config); err != nil {
		return config, err
	}

	return config, nil
}

// callHooks calls validation and post-load hooks on a config.
func callHooks[T any](ctx context.Context, cfg T) error {
	if v, ok := any(cfg).(interface{ Validate() error }); ok {
		if err := v.Validate(); err != nil {
			return fmt.Errorf("invalid configuration: %w", err)
		}
	}

	if h, ok := any(cfg).(interface{ OnLoadingComplete(context.Context) }); ok {
		h.OnLoadingComplete(ctx)
	}

	return nil
}

// pickParser returns the appropriate parser for the given file extension.
func pickParser(filename string) (koanf.Parser, error) {
	switch {
	case strings.HasSuffix(filename, ".json"):
		return json.Parser(), nil
	case strings.HasSuffix(filename, ".yaml") || strings.HasSuffix(filename, ".yml"):
		return yaml.Parser(), nil
	case strings.HasSuffix(filename, ".toml"):
		return toml.Parser(), nil
	default:
		return nil, fmt.Errorf("unsupported config file format: %q", filename)
	}
}
