//go:build !windows

package embeddedpg

import (
	"fmt"
	"os"
	"syscall"
)

func processRunningOS(pid int) bool {
	proc, err := os.FindProcess(pid)
	if err != nil {
		return false
	}

	// Signal 0 checks if the process exists without actually sending a signal.
	err = proc.Signal(syscall.Signal(0))

	return err == nil
}

func killProcessOS(pid int) error {
	proc, err := os.FindProcess(pid)
	if err != nil {
		return fmt.Errorf("find process %d: %w", pid, err)
	}

	if err := proc.Signal(syscall.SIGTERM); err != nil {
		return fmt.Errorf("send SIGTERM to process %d: %w", pid, err)
	}

	return nil
}
