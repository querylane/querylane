package server

import "net/http"

func (a *App) mountHealthRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /livez", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "text/plain; charset=utf-8")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok\n"))
	})

	mux.HandleFunc("GET /readyz", func(w http.ResponseWriter, r *http.Request) {
		state := a.state.Load()
		if state == nil || state.metaDBGate == nil {
			http.Error(w, "not ready", http.StatusServiceUnavailable)

			return
		}

		if err := state.metaDBGate.EnsureAvailable(r.Context()); err != nil {
			http.Error(w, "not ready", http.StatusServiceUnavailable)

			return
		}

		w.Header().Set("Content-Type", "text/plain; charset=utf-8")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok\n"))
	})
}
