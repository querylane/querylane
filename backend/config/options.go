package config

// Options contains options for the generic config loader.
type Options struct {
	configFile      string // Path to config file
	withFilewatcher bool
	envPrefix       string // Environment variable prefix (defaults to "QUERYLANE_")
}

// Option is a functional option for configuring the config manager.
type Option func(*Options)

// WithConfigFile sets the path to the config file.
func WithConfigFile(file string) Option {
	return func(opts *Options) {
		opts.configFile = file
	}
}

// WithFilewatcher enables hot reloading of config files.
func WithFilewatcher() Option {
	return func(opts *Options) {
		opts.withFilewatcher = true
	}
}

// WithEnvPrefix sets the environment variable prefix for configuration loading.
func WithEnvPrefix(prefix string) Option {
	return func(opts *Options) {
		opts.envPrefix = prefix
	}
}
