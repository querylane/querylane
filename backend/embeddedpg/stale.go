package embeddedpg

import (
	"bufio"
	"context"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

// stalePIDResult holds the outcome of a stale PID check.
type stalePIDResult struct {
	// LivePID is non-zero when the PID file references a still-running process.
	// The caller decides whether to adopt or kill it.
	LivePID int
}

// cleanStalePID checks for a stale postmaster.pid file in the data directory
// and removes it if the referenced process is no longer running. When the
// process is still alive, it returns a result with LivePID set and no error
// so the caller can decide what to do (adopt vs. remove).
func cleanStalePID(ctx context.Context, dataPath string) (stalePIDResult, error) {
	pidFile := filepath.Join(dataPath, "postmaster.pid")

	// Read the first line and close the file before any removal attempt.
	// On Windows, an open file handle prevents deletion.
	firstLine, err := readFirstLine(pidFile)
	if os.IsNotExist(err) {
		return stalePIDResult{}, nil
	}

	if err != nil {
		return stalePIDResult{}, fmt.Errorf("read postmaster.pid: %w", err)
	}

	line := strings.TrimSpace(firstLine)
	if line == "" {
		slog.InfoContext(ctx, "removing malformed postmaster.pid (empty)")

		return stalePIDResult{}, os.Remove(pidFile)
	}

	pid, err := strconv.Atoi(line)
	if err != nil {
		slog.InfoContext(ctx, "removing malformed postmaster.pid", slog.String("content", line))

		return stalePIDResult{}, os.Remove(pidFile)
	}

	if processRunning(pid) {
		return stalePIDResult{LivePID: pid}, nil
	}

	slog.InfoContext(ctx, "removing stale postmaster.pid", slog.Int("pid", pid))

	return stalePIDResult{}, os.Remove(pidFile)
}

// readFirstLine opens a file, reads the first line, and closes it.
func readFirstLine(path string) (string, error) {
	f, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer f.Close()

	scanner := bufio.NewScanner(f)
	if !scanner.Scan() {
		return "", nil
	}

	return scanner.Text(), nil
}

// processRunning checks whether a process with the given PID is alive.
// On Unix this sends signal 0; on Windows it uses OpenProcess.
func processRunning(pid int) bool {
	return processRunningOS(pid)
}

// killProcess terminates a process by PID. It delegates to the
// platform-specific killProcessOS implementation.
func killProcess(pid int) error {
	return killProcessOS(pid)
}
