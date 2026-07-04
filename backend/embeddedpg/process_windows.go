//go:build windows

package embeddedpg

import (
	"fmt"

	"golang.org/x/sys/windows"
)

func processRunningOS(pid int) bool {
	handle, err := windows.OpenProcess(windows.PROCESS_QUERY_LIMITED_INFORMATION, false, uint32(pid)) //nolint:gosec // G115: PID is always non-negative
	if err != nil {
		return false
	}
	defer windows.CloseHandle(handle) //nolint:errcheck // best-effort cleanup

	var exitCode uint32
	if err := windows.GetExitCodeProcess(handle, &exitCode); err != nil {
		return false
	}

	// STILL_ACTIVE (259) means the process has not exited.
	return exitCode == 259
}

func killProcessOS(pid int) error {
	handle, err := windows.OpenProcess(windows.PROCESS_TERMINATE, false, uint32(pid)) //nolint:gosec // G115: PID is always non-negative
	if err != nil {
		return fmt.Errorf("open process %d for termination: %w", pid, err)
	}
	defer windows.CloseHandle(handle) //nolint:errcheck // best-effort cleanup

	if err := windows.TerminateProcess(handle, 1); err != nil {
		return fmt.Errorf("terminate process %d: %w", pid, err)
	}

	return nil
}
