package server

import (
	"log/slog"
	"os"
	"testing"
)

func TestMain(m *testing.M) {
	originalLogger := slog.Default()

	slog.SetDefault(slog.New(slog.DiscardHandler))

	code := m.Run()

	slog.SetDefault(originalLogger)
	os.Exit(code)
}
