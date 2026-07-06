package server

import (
	"errors"

	connectcors "connectrpc.com/cors"
)

// CORS config object.
type CORS struct {
	AllowedOrigins []string `koanf:"allowed_origins"`
	AllowedHeaders []string `koanf:"allowed_headers"`
	AllowedMethods []string `koanf:"allowed_methods"`
	ExposedHeaders []string `koanf:"exposed_headers"`
}

// SetDefaults for CORS configuration. Only unset fields receive defaults so
// re-running SetDefaults (e.g. before persisting a config built from the
// live configuration) never clobbers explicit customization.
// This method is called internally by the HTTP SetDefaults method.
func (c *CORS) SetDefaults() {
	if c.AllowedOrigins == nil {
		c.AllowedOrigins = []string{"*"}
	}

	if c.AllowedMethods == nil {
		c.AllowedMethods = connectcors.AllowedMethods()
	}

	if c.AllowedHeaders == nil {
		c.AllowedHeaders = append(
			connectcors.AllowedHeaders(),
			"authorization",
		)
	}

	if c.ExposedHeaders == nil {
		c.ExposedHeaders = connectcors.ExposedHeaders()
	}
}

// Validate the provided CORS configuration object.
func (c *CORS) Validate() error {
	if len(c.AllowedOrigins) == 0 {
		return errors.New("you must set allowed_origins for CORS")
	}

	return nil
}
