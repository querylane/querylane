package server

import (
	"testing"

	"github.com/stretchr/testify/assert"

	serverconfig "github.com/querylane/querylane/backend/config/server"
)

// TestControllerListenAddr is the regression guard for the ignored
// `server start --port/--host` flags: CLI overrides must take precedence
// over the configured HTTP host/port when computing the listen address.
func TestControllerListenAddr(t *testing.T) {
	t.Parallel()

	cfg := &serverconfig.Config{HTTP: serverconfig.HTTP{Host: "0.0.0.0", Port: 8080}}

	tests := []struct {
		name         string
		hostOverride string
		portOverride int
		want         string
	}{
		{name: "no overrides uses config", want: "0.0.0.0:8080"},
		{name: "port override", portOverride: 9999, want: "0.0.0.0:9999"},
		{name: "host override", hostOverride: "127.0.0.1", want: "127.0.0.1:8080"},
		{name: "both overrides", hostOverride: "127.0.0.1", portOverride: 9999, want: "127.0.0.1:9999"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			c := &Controller{
				listenHostOverride: tt.hostOverride,
				listenPortOverride: tt.portOverride,
			}

			assert.Equal(t, tt.want, c.listenAddr(cfg))
		})
	}
}
