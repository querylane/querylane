package server

import (
	serverconfig "github.com/querylane/querylane/backend/config/server"
)

// defaultConfig returns default values for the API server.
func defaultConfig() *serverconfig.Config {
	cfg := serverconfig.Config{}
	cfg.SetDefaults()

	return &cfg
}
