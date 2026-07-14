package storage

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/base64"
	"fmt"

	"github.com/go-jet/jet/v2/postgres"

	"github.com/querylane/querylane/backend/storage/gen/querylane/public/model"
	"github.com/querylane/querylane/backend/storage/gen/querylane/public/table"
)

const (
	tokenSigningKeyID   = "v1"
	tokenSigningKeySize = 32
)

// LoadOrCreateTokenSigningKey returns the shared HMAC key used for opaque API
// tokens. Concurrent callers all receive the same persisted key.
func LoadOrCreateTokenSigningKey(ctx context.Context, db *sql.DB) ([]byte, error) {
	keyring, err := newSecretKeyringFromEnv(false)
	if err != nil {
		return nil, fmt.Errorf("initialize token signing key encryption: %w", err)
	}

	candidate := make([]byte, tokenSigningKeySize)
	if _, err := rand.Read(candidate); err != nil {
		return nil, fmt.Errorf("generate token signing key: %w", err)
	}

	storedCandidate := base64.StdEncoding.EncodeToString(candidate)
	if keyring.current != nil {
		storedCandidate, err = keyring.current.encrypt(storedCandidate)
		if err != nil {
			return nil, fmt.Errorf("encrypt token signing key: %w", err)
		}
	}

	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return nil, fmt.Errorf("begin token signing key initialization: %w", err)
	}

	defer tx.Rollback() //nolint:errcheck // Rollback after commit is a no-op.

	stmt := table.TokenSigningKey.
		INSERT(
			table.TokenSigningKey.ID,
			table.TokenSigningKey.Material,
		).
		VALUES(tokenSigningKeyID, storedCandidate).
		ON_CONFLICT(table.TokenSigningKey.ID).
		DO_UPDATE(postgres.SET(
			table.TokenSigningKey.Material.SET(table.TokenSigningKey.Material),
		)).
		RETURNING(table.TokenSigningKey.AllColumns)

	var persisted model.TokenSigningKey
	if err := stmt.QueryContext(ctx, tx, &persisted); err != nil {
		return nil, fmt.Errorf("load or create token signing key: %w", err)
	}

	encoded, migrate, err := keyring.plaintextForStorage(persisted.Material)
	if err != nil {
		return nil, fmt.Errorf("decrypt token signing key: %w", err)
	}

	// Preserve the existing keyless fallback. Rotation only rewrites material
	// that was already encrypted with the instance secret key.
	migrate = migrate && looksLikeEncryptedSecret(persisted.Material)

	key, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil {
		return nil, fmt.Errorf("decode token signing key: %w", err)
	}

	if len(key) != tokenSigningKeySize {
		return nil, fmt.Errorf("decode token signing key: expected %d bytes, got %d", tokenSigningKeySize, len(key))
	}

	if migrate {
		persisted.Material, err = keyring.current.encrypt(encoded)
		if err != nil {
			return nil, fmt.Errorf("encrypt rotated token signing key: %w", err)
		}

		update := table.TokenSigningKey.UPDATE(table.TokenSigningKey.Material).
			MODEL(persisted).
			WHERE(table.TokenSigningKey.ID.EQ(postgres.String(tokenSigningKeyID)))
		if _, err := update.ExecContext(ctx, tx); err != nil {
			return nil, fmt.Errorf("store rotated token signing key: %w", err)
		}
	}

	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("commit token signing key initialization: %w", err)
	}

	return key, nil
}
