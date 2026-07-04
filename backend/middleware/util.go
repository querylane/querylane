package middleware

import "net/http"

// Adapter defines the type for middleware.
type Adapter func(http.Handler) http.Handler

// Chain takes a final handler and a list of middlewares, returning a new http.Handler
// with all of them applied in order.
func Chain(h http.Handler, middlewares ...Adapter) http.Handler {
	for i := len(middlewares) - 1; i >= 0; i-- {
		h = middlewares[i](h)
	}

	return h
}
