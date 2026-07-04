package server

import (
	"errors"
	"math"
)

// HTTP represents the configuration for the web server.
type HTTP struct {
	Host string `koanf:"host"`
	Port int    `koanf:"port"`

	// AccessLog is a pointer so SetDefaults can distinguish "unset" (default
	// to enabled) from an explicit false — a plain bool would let defaulting
	// clobber an explicit access_log: false. Read it via AccessLogEnabled.
	AccessLog *bool `koanf:"access_log"`
	CORS      CORS  `koanf:"cors"`
}

// SetDefaults sets default values for the server configuration.
// This method is available for programmatic configuration setup.
func (s *HTTP) SetDefaults() {
	if s.Host == "" {
		s.Host = "0.0.0.0"
	}

	if s.Port == 0 {
		s.Port = 8080
	}

	if s.AccessLog == nil {
		enabled := true
		s.AccessLog = &enabled
	}

	s.CORS.SetDefaults()
}

// AccessLogEnabled reports whether access logging is enabled. An unset value
// behaves as enabled (the default).
func (s *HTTP) AccessLogEnabled() bool {
	return s.AccessLog == nil || *s.AccessLog
}

// Validate provided server config.
func (s *HTTP) Validate() error {
	if s.Host == "" {
		return errors.New("host is required")
	}

	if s.Port <= 0 || s.Port > math.MaxUint16 {
		return errors.New("port is out of range")
	}

	return s.CORS.Validate()
}
