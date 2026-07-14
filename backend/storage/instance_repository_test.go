package storage

import (
	"encoding/json"
	"os"
	"strings"
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
				repo, err := NewInstanceRepository(t.Context(), testDB.DB())
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

func TestIntegrationInstanceRepository_MigratesLegacyPlaintextCredentialsAtStartup(t *testing.T) {
	t.Parallel()

	withInstanceSecretKey(t, "0123456789abcdef0123456789abcdef", func() {
		testDB := NewTestDB(t)
		_, err := testDB.DB().ExecContext(t.Context(), `
			INSERT INTO instance (id, display_name, engine, config)
			VALUES (
				'legacy',
				'Legacy',
				'DATABASE_ENGINE_POSTGRESQL',
				'{"host":"db.internal","port":5432,"database":"postgres","username":"querylane","password":"legacy-password","passwordSource":{"inline":"legacy-inline"}}'
			)
		`)
		require.NoError(t, err)

		repo, err := NewInstanceRepository(t.Context(), testDB.DB())
		require.NoError(t, err)

		var rawConfig string
		require.NoError(t, testDB.DB().QueryRowContext(
			t.Context(),
			`SELECT config FROM instance WHERE id = 'legacy'`,
		).Scan(&rawConfig))
		assert.NotContains(t, rawConfig, "legacy-password")
		assert.NotContains(t, rawConfig, "legacy-inline")
		assert.Equal(t, 2, strings.Count(rawConfig, encryptedSecretPrefix))

		loaded, err := repo.GetInstance(t.Context(), "instances/legacy")
		require.NoError(t, err)
		assert.Equal(t, "legacy-password", loaded.GetConfig().GetPassword())
		assert.Equal(t, "legacy-inline", loaded.GetConfig().GetPasswordSource().GetInline())
	})
}

func TestIntegrationInstanceRepository_RotatesCredentialsAtStartup(t *testing.T) {
	t.Parallel()

	const (
		oldKey         = "0123456789abcdef0123456789abcdef"
		newKey         = "abcdef0123456789abcdef0123456789"
		previousKeyEnv = "QUERYLANE_INSTANCE_SECRET_KEY_PREVIOUS"
	)

	withInstanceSecretKey(t, oldKey, func() {
		testDB := NewTestDB(t)
		originalRepo, err := NewInstanceRepository(t.Context(), testDB.DB())
		require.NoError(t, err)

		_, err = originalRepo.CreateInstance(t.Context(), &api.Instance{
			DisplayName: "Production",
			Config: &api.PostgresConfig{
				Host:     "db.internal",
				Port:     5432,
				Database: "postgres",
				Username: "querylane",
				Password: "rotate-password",
				PasswordSource: &api.SecretSource{
					Source: &api.SecretSource_Inline{Inline: "rotate-inline"},
				},
			},
		}, "prod")
		require.NoError(t, err)

		var originalConfig string
		require.NoError(t, testDB.DB().QueryRowContext(
			t.Context(),
			`SELECT config FROM instance WHERE id = 'prod'`,
		).Scan(&originalConfig))

		require.NoError(t, os.Setenv(instanceSecretKeyEnv, newKey)) //nolint:usetesting // Protected by instanceSecretKeyEnvMu.
		require.NoError(t, os.Setenv(previousKeyEnv, oldKey))       //nolint:usetesting // Protected by instanceSecretKeyEnvMu.

		defer func() {
			require.NoError(t, os.Unsetenv(previousKeyEnv))
		}()

		const replicas = 4

		rotatedRepos := make([]*PGInstanceRepository, replicas)
		rotationErrs := make([]error, replicas)

		var rotations sync.WaitGroup
		rotations.Add(replicas)

		for i := range replicas {
			go func() {
				defer rotations.Done()

				rotatedRepos[i], rotationErrs[i] = NewInstanceRepository(t.Context(), testDB.DB())
			}()
		}

		rotations.Wait()

		for _, rotationErr := range rotationErrs {
			require.NoError(t, rotationErr)
		}

		rotatedRepo := rotatedRepos[0]

		var rotatedConfig string
		require.NoError(t, testDB.DB().QueryRowContext(
			t.Context(),
			`SELECT config FROM instance WHERE id = 'prod'`,
		).Scan(&rotatedConfig))
		assert.NotEqual(t, originalConfig, rotatedConfig)
		assert.NotContains(t, rotatedConfig, "rotate-password")
		assert.NotContains(t, rotatedConfig, "rotate-inline")

		loaded, err := rotatedRepo.GetInstance(t.Context(), "instances/prod")
		require.NoError(t, err)
		assert.Equal(t, "rotate-password", loaded.GetConfig().GetPassword())
		assert.Equal(t, "rotate-inline", loaded.GetConfig().GetPasswordSource().GetInline())

		require.NoError(t, os.Unsetenv(previousKeyEnv))
		_, err = NewInstanceRepository(t.Context(), testDB.DB())
		require.NoError(t, err)
	})
}

func TestIntegrationInstanceRepository_FailedRotationLeavesCredentialsUnchanged(t *testing.T) {
	t.Parallel()

	const (
		oldKey = "0123456789abcdef0123456789abcdef"
		newKey = "abcdef0123456789abcdef0123456789"
	)

	withInstanceSecretKey(t, oldKey, func() {
		testDB := NewTestDB(t)
		repo, err := NewInstanceRepository(t.Context(), testDB.DB())
		require.NoError(t, err)

		_, err = repo.CreateInstance(t.Context(), &api.Instance{
			DisplayName: "Production",
			Config: &api.PostgresConfig{
				Host:     "db.internal",
				Port:     5432,
				Database: "postgres",
				Username: "querylane",
				Password: "old-password",
			},
		}, "prod")
		require.NoError(t, err)

		var originalConfig string
		require.NoError(t, testDB.DB().QueryRowContext(
			t.Context(),
			`SELECT config FROM instance WHERE id = 'prod'`,
		).Scan(&originalConfig))

		require.NoError(t, os.Setenv(instanceSecretKeyEnv, newKey)) //nolint:usetesting // Protected by instanceSecretKeyEnvMu.
		require.NoError(t, os.Unsetenv(previousInstanceSecretKeyEnv))

		_, err = NewInstanceRepository(t.Context(), testDB.DB())
		require.ErrorIs(t, err, ErrUnreadableInstanceCredentials)
		assert.Contains(t, err.Error(), previousInstanceSecretKeyEnv)

		var unchangedConfig string
		require.NoError(t, testDB.DB().QueryRowContext(
			t.Context(),
			`SELECT config FROM instance WHERE id = 'prod'`,
		).Scan(&unchangedConfig))
		assert.Equal(t, originalConfig, unchangedConfig)
	})
}

func TestIntegrationInstanceRepository_ListInstancesKeepsRowsWithUnreadableCredentials(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name   string
		config *api.PostgresConfig
	}{
		{
			name: "legacy password",
			config: &api.PostgresConfig{
				Host:     "broken.internal",
				Port:     5432,
				Database: "postgres",
				Username: "querylane",
				Password: "old-secret",
			},
		},
		{
			name: "inline password source",
			config: &api.PostgresConfig{
				Host:     "broken.internal",
				Port:     5432,
				Database: "postgres",
				Username: "querylane",
				PasswordSource: &api.SecretSource{
					Source: &api.SecretSource_Inline{Inline: "old-secret"},
				},
			},
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			withInstanceSecretKey(t, "0123456789abcdef0123456789abcdef", func() {
				testDB := NewTestDB(t)
				originalRepo, err := NewInstanceRepository(t.Context(), testDB.DB())
				require.NoError(t, err)

				_, err = originalRepo.CreateInstance(t.Context(), &api.Instance{
					DisplayName: "Healthy",
					Config: &api.PostgresConfig{
						Host:     "healthy.internal",
						Port:     5432,
						Database: "postgres",
						Username: "querylane",
						PasswordSource: &api.SecretSource{
							Source: &api.SecretSource_Env{Env: "HEALTHY_PASSWORD"},
						},
					},
				}, "healthy")
				require.NoError(t, err)

				_, err = originalRepo.CreateInstance(t.Context(), &api.Instance{
					DisplayName: "Broken",
					Config:      tc.config,
				}, "broken")
				require.NoError(t, err)

				otherCipher, err := newSecretCipher("abcdef0123456789abcdef0123456789")
				require.NoError(t, err)

				otherRepo := &PGInstanceRepository{
					db:     testDB.DB(),
					exec:   testDB.DB(),
					mapper: instanceMapper{secrets: otherCipher},
				}

				instances, nextPageToken, err := otherRepo.ListInstances(t.Context(), 10, "", "", "")
				require.NoError(t, err)
				assert.Empty(t, nextPageToken)
				require.Len(t, instances, 2)
				assert.Equal(t, []string{"instances/broken", "instances/healthy"}, []string{
					instances[0].GetName(),
					instances[1].GetName(),
				})

				broken := instances[0]
				assert.Equal(t, api.Instance_CREDENTIAL_STATE_UNREADABLE, broken.GetCredentialState())
				assert.Equal(t, "Stored credentials cannot be read. Re-enter the password to restore access.", broken.GetCredentialError())
				assert.Empty(t, broken.GetConfig().GetPassword())
				assert.Nil(t, broken.GetConfig().GetPasswordSource())

				healthy := instances[1]
				assert.Equal(t, api.Instance_CREDENTIAL_STATE_UNSPECIFIED, healthy.GetCredentialState())
				assert.Equal(t, "HEALTHY_PASSWORD", healthy.GetConfig().GetPasswordSource().GetEnv())

				loaded, err := otherRepo.GetInstance(t.Context(), "instances/broken")
				require.NoError(t, err)
				assert.Equal(t, api.Instance_CREDENTIAL_STATE_UNREADABLE, loaded.GetCredentialState())
				assert.Equal(t, "broken.internal", loaded.GetConfig().GetHost())

				_, err = otherRepo.UpdateInstance(t.Context(), &api.Instance{
					Name: "instances/broken",
					Config: &api.PostgresConfig{
						Host:     "broken.internal",
						Port:     5432,
						Database: "postgres",
						Username: "querylane",
					},
				}, &fieldmaskpb.FieldMask{Paths: []string{"config"}})
				require.Error(t, err)
				stillUnreadable, getErr := otherRepo.GetInstance(t.Context(), "instances/broken")
				require.NoError(t, getErr)
				assert.Equal(t, api.Instance_CREDENTIAL_STATE_UNREADABLE, stillUnreadable.GetCredentialState())

				updated, err := otherRepo.UpdateInstance(t.Context(), &api.Instance{
					Name: "instances/broken",
					Config: &api.PostgresConfig{
						Host:     "broken.internal",
						Port:     5432,
						Database: "postgres",
						Username: "querylane",
						Password: "replacement-secret",
					},
				}, &fieldmaskpb.FieldMask{Paths: []string{"config.password"}})
				require.NoError(t, err)
				assert.Equal(t, "replacement-secret", updated.GetConfig().GetPassword())
				assert.Nil(t, updated.GetConfig().GetPasswordSource())

				recovered, err := otherRepo.GetInstance(t.Context(), "instances/broken")
				require.NoError(t, err)
				assert.Equal(t, api.Instance_CREDENTIAL_STATE_UNSPECIFIED, recovered.GetCredentialState())
			})
		})
	}
}

func TestIntegrationInstanceRepository_MissingKeyFailsFast(t *testing.T) {
	t.Parallel()

	withInstanceSecretKey(t, "0123456789abcdef0123456789abcdef", func() {
		testDB := NewTestDB(t)
		originalRepo, err := NewInstanceRepository(t.Context(), testDB.DB())
		require.NoError(t, err)

		_, err = originalRepo.CreateInstance(t.Context(), &api.Instance{
			DisplayName: "Production",
			Config: &api.PostgresConfig{
				Host:     "db.internal",
				Port:     5432,
				Database: "postgres",
				Username: "querylane",
				Password: "old-secret",
			},
		}, "prod")
		require.NoError(t, err)
		require.NoError(t, os.Unsetenv(instanceSecretKeyEnv))

		_, err = NewInstanceRepository(t.Context(), testDB.DB())
		require.ErrorIs(t, err, ErrMissingInstanceSecretKey)
		assert.Contains(t, err.Error(), instanceSecretKeyEnv)
	})
}

func TestIntegrationInstanceRepository_UpdateInstanceReplacesConfig(t *testing.T) {
	t.Parallel()

	withInstanceSecretKey(t, "0123456789abcdef0123456789abcdef", func() {
		testDB := NewTestDB(t)
		repo, err := NewInstanceRepository(t.Context(), testDB.DB())
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
		repo, err := NewInstanceRepository(t.Context(), testDB.DB())
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
		_, err := NewInstanceRepository(t.Context(), nil)
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
