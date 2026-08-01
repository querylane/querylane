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
	// Port is the listen port recorded in postmaster.pid, or 0 when the file
	// does not record one. Only meaningful when LivePID is non-zero.
	Port int
}

// postmasterPidPortLine is the 1-based line number of the listen port in a
// postmaster.pid file (pid, data dir, start time, port, ...).
const postmasterPidPortLine = 4

// cleanStalePID checks for a stale postmaster.pid file in the data directory
// and removes it if the referenced process is no longer running. When the
// process is still alive, it returns a result with LivePID set and no error
// so the caller can decide what to do (adopt vs. remove).
func cleanStalePID(ctx context.Context, dataPath string) (stalePIDResult, error) {
	pidFile := filepath.Join(dataPath, "postmaster.pid")

	// Read the needed lines and close the file before any removal attempt.
	// On Windows, an open file handle prevents deletion.
	lines, err := readLines(pidFile, postmasterPidPortLine)
	if os.IsNotExist(err) {
		return stalePIDResult{}, nil
	}

	if err != nil {
		return stalePIDResult{}, fmt.Errorf("read postmaster.pid: %w", err)
	}

	line := ""
	if len(lines) > 0 {
		line = strings.TrimSpace(lines[0])
	}

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
		return stalePIDResult{LivePID: pid, Port: parsePidFilePort(lines)}, nil
	}

	slog.InfoContext(ctx, "removing stale postmaster.pid", slog.Int("pid", pid))

	return stalePIDResult{}, os.Remove(pidFile)
}

// parsePidFilePort extracts the listen port from postmaster.pid lines,
// returning 0 when the file does not record one.
func parsePidFilePort(lines []string) int {
	if len(lines) < postmasterPidPortLine {
		return 0
	}

	port, err := strconv.Atoi(strings.TrimSpace(lines[postmasterPidPortLine-1]))
	if err != nil || port <= 0 || port > 65535 {
		return 0
	}

	return port
}

// readLines opens a file, reads up to maxLines lines, and closes it.
func readLines(path string, maxLines int) ([]string, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()

	lines := make([]string, 0, maxLines)
	scanner := bufio.NewScanner(f)

	for len(lines) < maxLines && scanner.Scan() {
		lines = append(lines, scanner.Text())
	}

	return lines, scanner.Err()
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
