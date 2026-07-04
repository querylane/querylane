package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestChainAppliesMiddlewaresInOrder(t *testing.T) {
	t.Parallel()

	var calls []string

	named := func(name string) Adapter {
		return func(next http.Handler) http.Handler {
			return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				calls = append(calls, name)

				next.ServeHTTP(w, r)
			})
		}
	}

	final := http.HandlerFunc(func(_ http.ResponseWriter, _ *http.Request) {
		calls = append(calls, "final")
	})

	handler := Chain(final, named("first"), named("second"))
	req := httptest.NewRequestWithContext(t.Context(), http.MethodGet, "/", nil)
	handler.ServeHTTP(httptest.NewRecorder(), req)

	assert.Equal(t, []string{"first", "second", "final"}, calls)
}

func TestChainWithoutMiddlewares(t *testing.T) {
	t.Parallel()

	called := false
	final := http.HandlerFunc(func(_ http.ResponseWriter, _ *http.Request) {
		called = true
	})

	handler := Chain(final)
	req := httptest.NewRequestWithContext(t.Context(), http.MethodGet, "/", nil)
	handler.ServeHTTP(httptest.NewRecorder(), req)

	assert.True(t, called, "Chain without middlewares must still invoke the final handler")
}
