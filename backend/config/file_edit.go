package config

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"

	"github.com/knadh/koanf/providers/rawbytes"
	"github.com/knadh/koanf/v2"
)

// RemoveFileKeys removes top-level configuration keys while preserving the
// file's format. Before replacing the file atomically, it writes a private,
// non-overwriting backup beside the original.
func RemoveFileKeys(path string, keys ...string) (string, bool, error) {
	original, err := os.ReadFile(path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return "", false, fmt.Errorf("configuration file %q does not exist", path)
		}

		return "", false, fmt.Errorf("read configuration file %q: %w", path, err)
	}

	parser, err := pickParser(path)
	if err != nil {
		return "", false, err
	}

	parsed := koanf.New(".")
	if err := parsed.Load(rawbytes.Provider(original), parser); err != nil {
		return "", false, fmt.Errorf("parse configuration file %q: %w", path, err)
	}

	changed := false

	for _, key := range keys {
		if parsed.Exists(key) {
			changed = true

			parsed.Delete(key)
		}
	}

	if !changed {
		return "", false, nil
	}

	updated, err := parsed.Marshal(parser)
	if err != nil {
		return "", false, fmt.Errorf("serialize configuration file %q: %w", path, err)
	}

	backupPath, err := writeConfigBackup(path, original)
	if err != nil {
		return "", false, err
	}

	if err := replaceConfigFile(path, updated); err != nil {
		return backupPath, false, err
	}

	return backupPath, true, nil
}

func writeConfigBackup(path string, data []byte) (string, error) {
	for index := 0; ; index++ {
		backupPath := path + ".bak"
		if index > 0 {
			backupPath = fmt.Sprintf("%s.bak.%d", path, index)
		}

		backup, err := os.OpenFile(backupPath, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o600)
		if errors.Is(err, os.ErrExist) {
			continue
		}

		if err != nil {
			return "", fmt.Errorf("create configuration backup %q: %w", backupPath, err)
		}

		if _, err := backup.Write(data); err != nil {
			_ = backup.Close()
			_ = os.Remove(backupPath)

			return "", fmt.Errorf("write configuration backup %q: %w", backupPath, err)
		}

		if err := backup.Close(); err != nil {
			_ = os.Remove(backupPath)

			return "", fmt.Errorf("close configuration backup %q: %w", backupPath, err)
		}

		return backupPath, nil
	}
}

func replaceConfigFile(path string, data []byte) error {
	temporaryPath := filepath.Join(filepath.Dir(path), "."+filepath.Base(path)+".reset.tmp")
	if err := os.WriteFile(temporaryPath, data, 0o600); err != nil {
		return fmt.Errorf("write reset configuration %q: %w", temporaryPath, err)
	}

	if err := os.Rename(temporaryPath, path); err != nil {
		_ = os.Remove(temporaryPath)

		return fmt.Errorf("replace configuration file %q: %w", path, err)
	}

	return nil
}
