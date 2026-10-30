package server_test

import (
	"net"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/querylane/querylane/backend/cmd/server"
	"github.com/querylane/querylane/backend/config"
)

func TestStartCmdReturnsListenFailure(t *testing.T) {
	if !testing.Short() {
		t.Skip("unit test: run with -short")
	}

	t.Setenv("HOME", t.TempDir())
	t.Setenv("USERPROFILE", t.TempDir())
	var lc net.ListenConfig
	listener, err := lc.Listen(t.Context(), "tcp", "127.0.0.1:0")
	require.NoError(t, err)
	t.Cleanup(func() { require.NoError(t, listener.Close()) })
	address, ok := listener.Addr().(*net.TCPAddr)
	require.True(t, ok)

	cmd := &server.StartCmd{Host: "127.0.0.1", Port: address.Port}
	require.Error(t, cmd.Run(&config.Globals{LogLevel: "error"}))
}
