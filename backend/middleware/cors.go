package middleware

import (
	"net/http"

	"github.com/rs/cors"

	serverconfig "github.com/querylane/querylane/backend/config/server"
)

// NewCORS returns a middleware that applies the given CORS settings.
func NewCORS(cfg serverconfig.Config) func(http.Handler) http.Handler {
	corsHandler := cors.New(cors.Options{
		AllowedOrigins: cfg.HTTP.CORS.AllowedOrigins,
		AllowedMethods: cfg.HTTP.CORS.AllowedMethods,
		AllowedHeaders: cfg.HTTP.CORS.AllowedHeaders,
		ExposedHeaders: cfg.HTTP.CORS.ExposedHeaders,
	})

	return func(next http.Handler) http.Handler {
		return corsHandler.Handler(next)
	}
}
