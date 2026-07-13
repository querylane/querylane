package storage_test

import (
	"encoding/base64"
	"strings"
	"sync"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/querylane/querylane/backend/engine"
	api "github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1"
	"github.com/querylane/querylane/backend/storage"
)

func TestIntegrationTokenSigningKey(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping integration test; run without -short")
	}

	testDB := storage.NewTestDB(t)
	reset := func(t *testing.T) {
		t.Helper()
		_, err := testDB.DB().ExecContext(t.Context(), "TRUNCATE token_signing_key")
		require.NoError(t, err)
	}

	t.Run("survives restart with plaintext fallback", func(t *testing.T) {
		reset(t)
		t.Setenv("QUERYLANE_INSTANCE_SECRET_KEY", "")

		firstKey, err := storage.LoadOrCreateTokenSigningKey(t.Context(), testDB.DB())
		require.NoError(t, err)

		var stored string
		require.NoError(t, testDB.DB().QueryRowContext(
			t.Context(),
			"SELECT material FROM token_signing_key WHERE id = 'v1'",
		).Scan(&stored))
		assert.Equal(t, base64.StdEncoding.EncodeToString(firstKey), stored)

		firstCodec := engine.NewTokenCodec(firstKey)
		token, err := firstCodec.Sign(engine.TokenKindReadRowsPage, &api.ReadRowsPageTokenPayload{Version: 1})
		require.NoError(t, err)

		secondKey, err := storage.LoadOrCreateTokenSigningKey(t.Context(), testDB.DB())
		require.NoError(t, err)

		secondCodec := engine.NewTokenCodec(secondKey)
		require.NoError(t, secondCodec.Verify(
			engine.TokenKindReadRowsPage,
			token,
			&api.ReadRowsPageTokenPayload{},
		))
	})

	t.Run("is atomic across replicas", func(t *testing.T) {
		reset(t)
		t.Setenv("QUERYLANE_INSTANCE_SECRET_KEY", "")

		const replicas = 16

		keys := make([][]byte, replicas)
		errs := make([]error, replicas)

		var (
			ready sync.WaitGroup
			start sync.WaitGroup
		)

		ready.Add(replicas)
		start.Add(1)

		var callers sync.WaitGroup
		callers.Add(replicas)

		for i := range replicas {
			go func() {
				defer callers.Done()

				ready.Done()
				start.Wait()

				keys[i], errs[i] = storage.LoadOrCreateTokenSigningKey(t.Context(), testDB.DB())
			}()
		}

		ready.Wait()
		start.Done()
		callers.Wait()

		for i := range replicas {
			require.NoError(t, errs[i])
			require.Equal(t, keys[0], keys[i])
		}
	})

	t.Run("encrypts with instance secret", func(t *testing.T) {
		reset(t)
		t.Setenv("QUERYLANE_INSTANCE_SECRET_KEY", "0123456789abcdef0123456789abcdef")

		key, err := storage.LoadOrCreateTokenSigningKey(t.Context(), testDB.DB())
		require.NoError(t, err)

		var stored string
		require.NoError(t, testDB.DB().QueryRowContext(
			t.Context(),
			"SELECT material FROM token_signing_key WHERE id = 'v1'",
		).Scan(&stored))

		assert.True(t, strings.HasPrefix(stored, "qlenc:v1:"))
		assert.NotContains(t, stored, base64.StdEncoding.EncodeToString(key))
	})

	t.Run("fails closed when encrypted key cannot be read", func(t *testing.T) {
		reset(t)

		const originalSecret = "0123456789abcdef0123456789abcdef"
		t.Setenv("QUERYLANE_INSTANCE_SECRET_KEY", originalSecret)

		originalKey, err := storage.LoadOrCreateTokenSigningKey(t.Context(), testDB.DB())
		require.NoError(t, err)

		var originalMaterial string
		require.NoError(t, testDB.DB().QueryRowContext(
			t.Context(),
			"SELECT material FROM token_signing_key WHERE id = 'v1'",
		).Scan(&originalMaterial))

		t.Setenv("QUERYLANE_INSTANCE_SECRET_KEY", "")
		_, err = storage.LoadOrCreateTokenSigningKey(t.Context(), testDB.DB())
		require.ErrorIs(t, err, storage.ErrMissingInstanceSecretKey)
		assert.Contains(t, err.Error(), "QUERYLANE_INSTANCE_SECRET_KEY")

		t.Setenv("QUERYLANE_INSTANCE_SECRET_KEY", "abcdef0123456789abcdef0123456789")
		_, err = storage.LoadOrCreateTokenSigningKey(t.Context(), testDB.DB())
		require.Error(t, err)
		assert.Contains(t, err.Error(), "decrypt token signing key")
		assert.Contains(t, err.Error(), "QUERYLANE_INSTANCE_SECRET_KEY")

		var currentMaterial string
		require.NoError(t, testDB.DB().QueryRowContext(
			t.Context(),
			"SELECT material FROM token_signing_key WHERE id = 'v1'",
		).Scan(&currentMaterial))
		assert.Equal(t, originalMaterial, currentMaterial)

		t.Setenv("QUERYLANE_INSTANCE_SECRET_KEY", originalSecret)
		recoveredKey, err := storage.LoadOrCreateTokenSigningKey(t.Context(), testDB.DB())
		require.NoError(t, err)
		assert.Equal(t, originalKey, recoveredKey)
	})

	t.Run("rejects corrupt material", func(t *testing.T) {
		reset(t)
		t.Setenv("QUERYLANE_INSTANCE_SECRET_KEY", "")

		for _, material := range []string{"not-base64", base64.StdEncoding.EncodeToString([]byte("too short"))} {
			_, err := testDB.DB().ExecContext(t.Context(), `
				INSERT INTO token_signing_key (id, material) VALUES ('v1', $1)
				ON CONFLICT (id) DO UPDATE SET material = excluded.material
			`, material)
			require.NoError(t, err)

			_, err = storage.LoadOrCreateTokenSigningKey(t.Context(), testDB.DB())
			require.Error(t, err)
			assert.Contains(t, err.Error(), "decode token signing key")
		}
	})
}
