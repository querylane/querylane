package middleware

import (
	"net/http"
	"slices"
)

// Adapter defines the type for middleware.
type Adapter func(http.Handler) http.Handler

// Chain takes a final handler and a list of middlewares, returning a new http.Handler
// with all of them applied in order.
func Chain(h http.Handler, middlewares ...Adapter) http.Handler {
	for _, middleware := range slices.Backward(middlewares) {
		h = middleware(h)
	}

	return h
}
