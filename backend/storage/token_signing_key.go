package storage

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/base64"
	"errors"
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
	secrets, err := newSecretCipherFromEnv()
	if errors.Is(err, ErrMissingInstanceSecretKey) {
		secrets = nil
	} else if err != nil {
		return nil, fmt.Errorf("initialize token signing key encryption: %w", err)
	}

	candidate := make([]byte, tokenSigningKeySize)
	if _, err := rand.Read(candidate); err != nil {
		return nil, fmt.Errorf("generate token signing key: %w", err)
	}

	storedCandidate := base64.StdEncoding.EncodeToString(candidate)
	if secrets != nil {
		storedCandidate, err = secrets.encrypt(storedCandidate)
		if err != nil {
			return nil, fmt.Errorf("encrypt token signing key: %w", err)
		}
	}

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
	if err := stmt.QueryContext(ctx, db, &persisted); err != nil {
		return nil, fmt.Errorf("load or create token signing key: %w", err)
	}

	stored := persisted.Material

	encoded := stored
	if looksLikeEncryptedSecret(stored) {
		if secrets == nil {
			return nil, fmt.Errorf(
				"decrypt token signing key: %w: set %s to the value used when the key was created",
				ErrMissingInstanceSecretKey,
				instanceSecretKeyEnv,
			)
		}

		encoded, err = secrets.decrypt(stored)
		if err != nil {
			return nil, fmt.Errorf("decrypt token signing key with %s: %w", instanceSecretKeyEnv, err)
		}
	}

	key, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil {
		return nil, fmt.Errorf("decode token signing key: %w", err)
	}

	if len(key) != tokenSigningKeySize {
		return nil, fmt.Errorf("decode token signing key: expected %d bytes, got %d", tokenSigningKeySize, len(key))
	}

	return key, nil
}
