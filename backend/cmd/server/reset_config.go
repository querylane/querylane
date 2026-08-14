package server

import (
	"errors"
	"fmt"
	"os"

	"github.com/querylane/querylane/backend/config"
)

// ResetConfigCmd removes the persisted internal-storage selection so the
// onboarding wizard runs again after the server restarts.
type ResetConfigCmd struct {
	Config string `help:"Path to config file"                                     placeholder:"/path/to/config.yaml" required:"" type:"path"`
	Yes    bool   `help:"Confirm removal of the saved internal storage selection"`
}

// Run resets only the meta-database configuration and preserves other server
// settings. The original file remains available as a private backup.
func (cmd *ResetConfigCmd) Run(_ *config.Globals) error {
	configPath := cmd.Config
	if configPath == "" {
		return errors.New("refusing to reset internal storage configuration without --config")
	}

	if !cmd.Yes {
		return fmt.Errorf("refusing to reset internal storage configuration in %q without --yes", configPath)
	}

	backupPath, changed, err := config.RemoveFileKeys(configPath, "database", "embedded")
	if err != nil {
		return err
	}

	if !changed {
		_, _ = fmt.Fprintf(os.Stdout, "No internal storage configuration found in %s.\n", configPath)

		return nil
	}

	_, _ = fmt.Fprintf(os.Stdout, "Internal storage configuration removed from %s.\n", configPath)
	_, _ = fmt.Fprintf(os.Stdout, "Backup written to %s.\n", backupPath)
	_, _ = fmt.Fprintln(os.Stdout, "Restart Querylane to open internal storage setup.")

	return nil
}
