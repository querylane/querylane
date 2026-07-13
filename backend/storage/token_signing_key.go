package storage

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/base64"
	"errors"
	"fmt"
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

	var stored string

	err = db.QueryRowContext(ctx, `
		INSERT INTO token_signing_key (id, material)
		VALUES ($1, $2)
		ON CONFLICT (id) DO UPDATE
		SET material = token_signing_key.material
		RETURNING material
	`, tokenSigningKeyID, storedCandidate).Scan(&stored)
	if err != nil {
		return nil, fmt.Errorf("load or create token signing key: %w", err)
	}

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
