package storage

import (
	"context"
	"database/sql"
	"fmt"

	"github.com/go-jet/jet/v2/postgres"

	api "github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1"
	"github.com/querylane/querylane/backend/storage/gen/querylane/public/model"
	"github.com/querylane/querylane/backend/storage/gen/querylane/public/table"
)

func migrateInstanceSecrets(ctx context.Context, db *sql.DB, keyring secretKeyring) error {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin instance credential migration: %w", err)
	}

	defer tx.Rollback() //nolint:errcheck // Rollback after commit is a no-op.

	stmt := postgres.SELECT(table.Instance.ID, table.Instance.Config).
		FROM(table.Instance).
		FOR(postgres.UPDATE())

	var instances []model.Instance
	if err := stmt.QueryContext(ctx, tx, &instances); err != nil {
		return fmt.Errorf("load instance credentials for migration: %w", err)
	}

	for _, instance := range instances {
		config := instance.Config.V
		if config == nil {
			continue
		}

		changed, err := migrateConfigSecrets(config, keyring)
		if err != nil {
			return fmt.Errorf("migrate credentials for instance %q: %w", instance.ID, err)
		}

		if !changed {
			continue
		}

		update := table.Instance.UPDATE(table.Instance.Config).
			MODEL(instance).
			WHERE(table.Instance.ID.EQ(postgres.String(instance.ID)))
		if _, err := update.ExecContext(ctx, tx); err != nil {
			return fmt.Errorf("store migrated credentials for instance %q: %w", instance.ID, err)
		}
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit instance credential migration: %w", err)
	}

	return nil
}

func migrateConfigSecrets(config *api.PostgresConfig, keyring secretKeyring) (bool, error) {
	changed := false

	password, migrate, err := keyring.plaintextForStorage(config.GetPassword())
	if err != nil {
		return false, fmt.Errorf("read password: %w", err)
	}

	if migrate {
		config.Password, err = keyring.current.encrypt(password)
		if err != nil {
			return false, fmt.Errorf("encrypt password: %w", err)
		}

		changed = true
	}

	inline, migrate, err := keyring.plaintextForStorage(config.GetPasswordSource().GetInline())
	if err != nil {
		return false, fmt.Errorf("read inline password source: %w", err)
	}

	if migrate {
		encrypted, encryptErr := keyring.current.encrypt(inline)
		if encryptErr != nil {
			return false, fmt.Errorf("encrypt inline password source: %w", encryptErr)
		}

		config.PasswordSource = &api.SecretSource{Source: &api.SecretSource_Inline{Inline: encrypted}}
		changed = true
	}

	return changed, nil
}
