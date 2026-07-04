package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"

	serverconfig "github.com/querylane/querylane/backend/config/server"
)

const allowedOrigin = "https://allowed.example"

func newCORSConfig() serverconfig.Config {
	return serverconfig.Config{
		HTTP: serverconfig.HTTP{
			CORS: serverconfig.CORS{
				AllowedOrigins: []string{allowedOrigin},
				AllowedMethods: []string{http.MethodGet, http.MethodPost},
				AllowedHeaders: []string{"Content-Type"},
				ExposedHeaders: []string{"X-Request-Id"},
			},
		},
	}
}

func TestNewCORSAllowsConfiguredOrigin(t *testing.T) {
	t.Parallel()

	nextCalled := false
	next := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		nextCalled = true

		w.WriteHeader(http.StatusOK)
	})

	handler := NewCORS(newCORSConfig())(next)

	req := httptest.NewRequestWithContext(t.Context(), http.MethodGet, "/", nil)
	req.Header.Set("Origin", allowedOrigin)

	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	assert.True(t, nextCalled, "allowed request must reach the next handler")
	assert.Equal(t, allowedOrigin, rec.Header().Get("Access-Control-Allow-Origin"))
}

func TestNewCORSHandlesPreflight(t *testing.T) {
	t.Parallel()

	nextCalled := false
	next := http.HandlerFunc(func(_ http.ResponseWriter, _ *http.Request) {
		nextCalled = true
	})

	handler := NewCORS(newCORSConfig())(next)

	req := httptest.NewRequestWithContext(t.Context(), http.MethodOptions, "/", nil)
	req.Header.Set("Origin", allowedOrigin)
	req.Header.Set("Access-Control-Request-Method", http.MethodPost)

	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	assert.False(t, nextCalled, "preflight must be answered by the CORS middleware")
	assert.Equal(t, allowedOrigin, rec.Header().Get("Access-Control-Allow-Origin"))
	assert.Contains(t, rec.Header().Get("Access-Control-Allow-Methods"), http.MethodPost)
}

func TestNewCORSOmitsHeadersForOtherOrigin(t *testing.T) {
	t.Parallel()

	nextCalled := false
	next := http.HandlerFunc(func(_ http.ResponseWriter, _ *http.Request) {
		nextCalled = true
	})

	handler := NewCORS(newCORSConfig())(next)

	req := httptest.NewRequestWithContext(t.Context(), http.MethodGet, "/", nil)
	req.Header.Set("Origin", "https://other.example")

	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	assert.True(t, nextCalled, "non-CORS-approved requests still reach the next handler")
	assert.Empty(t, rec.Header().Get("Access-Control-Allow-Origin"))
}
