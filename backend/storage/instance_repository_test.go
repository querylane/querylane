package storage

import (
	"encoding/json"
	"os"
	"sync"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"google.golang.org/protobuf/types/known/fieldmaskpb"

	api "github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1"
)

var instanceSecretKeyEnvMu sync.Mutex

func TestIntegrationInstanceRepository_CreateInstanceEncryptsPasswordAtRest(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name string
	}{
		{name: "legacy password field"},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			withInstanceSecretKey(t, "0123456789abcdef0123456789abcdef", func() {
				testDB := NewTestDB(t)
				repo, err := NewInstanceRepository(testDB.DB())
				require.NoError(t, err)

				created, err := repo.CreateInstance(t.Context(), &api.Instance{
					DisplayName: "Production",
					Config: &api.PostgresConfig{
						Host:     "localhost",
						Port:     5432,
						Database: "prod",
						Username: "querylane",
						Password: "super-secret-password",
					},
				}, "prod")
				require.NoError(t, err)
				assert.Equal(t, "super-secret-password", created.GetConfig().GetPassword())

				var rawConfig []byte

				err = testDB.DB().QueryRowContext(t.Context(), `SELECT config FROM instance WHERE id = $1`, "prod").Scan(&rawConfig)
				require.NoError(t, err)
				assert.NotContains(t, string(rawConfig), "super-secret-password")

				var stored struct {
					Password string `json:"password"`
				}
				require.NoError(t, json.Unmarshal(rawConfig, &stored))
				assert.Contains(t, stored.Password, encryptedSecretPrefix)

				loaded, err := repo.GetInstance(t.Context(), "instances/prod")
				require.NoError(t, err)
				assert.Equal(t, "super-secret-password", loaded.GetConfig().GetPassword())
			})
		})
	}
}

func TestIntegrationInstanceRepository_UpdateInstanceReplacesConfig(t *testing.T) {
	t.Parallel()

	withInstanceSecretKey(t, "0123456789abcdef0123456789abcdef", func() {
		testDB := NewTestDB(t)
		repo, err := NewInstanceRepository(testDB.DB())
		require.NoError(t, err)

		_, err = repo.CreateInstance(t.Context(), &api.Instance{
			DisplayName: "Replace test",
			Config: &api.PostgresConfig{
				Host:           "db.internal",
				Port:           5432,
				Database:       "prod",
				Username:       "querylane",
				Password:       "legacy-password",
				PasswordSource: &api.SecretSource{Source: &api.SecretSource_Inline{Inline: "stale-secret"}},
			},
		}, "replace-test")
		require.NoError(t, err)

		// A config-mask update carrying only the inline password must drop the
		// stale password_source so the new password actually takes effect.
		updated, err := repo.UpdateInstance(t.Context(), &api.Instance{
			Name: "instances/replace-test",
			Config: &api.PostgresConfig{
				Host:     "db.internal",
				Port:     5432,
				Database: "prod",
				Username: "querylane",
				Password: "new-password",
			},
		}, &fieldmaskpb.FieldMask{Paths: []string{"config"}})
		require.NoError(t, err)
		assert.Nil(t, updated.GetConfig().GetPasswordSource())
		assert.Equal(t, "new-password", updated.GetConfig().GetPassword())

		// Redaction round-trip: responses wipe config.password, and clients send
		// that empty value back. The stored password must survive a config replace.
		updated, err = repo.UpdateInstance(t.Context(), &api.Instance{
			Name: "instances/replace-test",
			Config: &api.PostgresConfig{
				Host:     "db2.internal",
				Port:     5432,
				Database: "prod",
				Username: "querylane",
			},
		}, &fieldmaskpb.FieldMask{Paths: []string{"config"}})
		require.NoError(t, err)
		assert.Equal(t, "db2.internal", updated.GetConfig().GetHost())
		assert.Equal(t, "new-password", updated.GetConfig().GetPassword())
	})
}

func TestIntegrationInstanceRepository_UpdateInstanceUsesWithTxExecutor(t *testing.T) {
	t.Parallel()

	withInstanceSecretKey(t, "0123456789abcdef0123456789abcdef", func() {
		testDB := NewTestDB(t)
		repo, err := NewInstanceRepository(testDB.DB())
		require.NoError(t, err)

		tx, err := testDB.DB().BeginTx(t.Context(), nil)
		require.NoError(t, err)

		defer tx.Rollback() //nolint:errcheck // Rollback after rollback is a no-op.

		txRepo := repo.WithTx(tx)

		_, err = txRepo.CreateInstance(t.Context(), &api.Instance{
			DisplayName: "Tx instance",
			Config: &api.PostgresConfig{
				Host:     "db.internal",
				Port:     5432,
				Database: "prod",
				Username: "querylane",
				Password: "tx-password",
			},
		}, "tx-instance")
		require.NoError(t, err)

		// The update must run on the caller's transaction: a separate transaction
		// cannot see the uncommitted insert and would fail with ErrNotFound.
		updated, err := txRepo.UpdateInstance(t.Context(), &api.Instance{
			Name:        "instances/tx-instance",
			DisplayName: "Tx instance updated",
		}, &fieldmaskpb.FieldMask{Paths: []string{"display_name"}})
		require.NoError(t, err)
		assert.Equal(t, "Tx instance updated", updated.GetDisplayName())

		// Rolling back the caller's transaction must discard the update too.
		require.NoError(t, tx.Rollback())

		_, err = repo.GetInstance(t.Context(), "instances/tx-instance")
		require.ErrorIs(t, err, ErrNotFound)
	})
}

func TestPGInstanceRepositoryListInstancesRejectsUnsupportedFilter(t *testing.T) {
	t.Parallel()

	repo := &PGInstanceRepository{}

	_, _, err := repo.ListInstances(t.Context(), 10, "", "display_name.contains('prod')", "")

	require.ErrorIs(t, err, ErrInvalidFilter)
	require.ErrorContains(t, err, "filter")
}

func TestNewInstanceRepositoryRejectsMalformedSecretKey(t *testing.T) {
	t.Parallel()

	withInstanceSecretKey(t, "not-a-valid-key", func() {
		_, err := NewInstanceRepository(nil)
		require.Error(t, err)
		assert.ErrorContains(t, err, instanceSecretKeyEnv)
	})
}

func withInstanceSecretKey(t *testing.T, value string, run func()) {
	t.Helper()

	instanceSecretKeyEnvMu.Lock()
	defer instanceSecretKeyEnvMu.Unlock()

	previous, hadPrevious := os.LookupEnv(instanceSecretKeyEnv)
	require.NoError(t, os.Setenv(instanceSecretKeyEnv, value)) //nolint:usetesting // t.Setenv cannot be used with parallel tests.

	defer func() {
		if hadPrevious {
			require.NoError(t, os.Setenv(instanceSecretKeyEnv, previous)) //nolint:usetesting // t.Setenv cannot be used with parallel tests.
			return
		}

		require.NoError(t, os.Unsetenv(instanceSecretKeyEnv))
	}()

	run()
}
