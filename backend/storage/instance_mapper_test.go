package storage

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	api "github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1"
	"github.com/querylane/querylane/backend/storage/gen/querylane/public/model"
	"github.com/querylane/querylane/backend/storage/types"
)

func TestInstanceMapper_StorageToProto_PreservesPasswords(t *testing.T) {
	t.Parallel()

	mapper := instanceMapper{}
	now := time.Now()

	t.Run("nil config - should not panic", func(t *testing.T) {
		t.Parallel()

		storageInstance := model.Instance{
			ID:          "test-instance",
			DisplayName: "Test Instance",
			Labels:      types.StringMap{},
			Engine:      model.DatabaseEngine_DatabaseEnginePostgresql,
			Config:      types.EngineConfigJSON{V: nil},
			CreatedAt:   now,
			UpdatedAt:   now,
		}

		protoInstance, err := mapper.storageToProto(storageInstance)
		require.NoError(t, err)
		assert.Nil(t, protoInstance.Config)
	})

	t.Run("PostgreSQL config - preserves password", func(t *testing.T) {
		t.Parallel()

		config := &api.PostgresConfig{
			Host:     "localhost",
			Port:     5432,
			Database: "testdb",
			Username: "testuser",
			Password: "super-secret-password",
			SslMode:  api.PostgresConfig_SSL_MODE_REQUIRE,
		}

		storageInstance := model.Instance{
			ID:          "test-instance",
			DisplayName: "Test Instance",
			Labels:      types.StringMap{},
			Engine:      model.DatabaseEngine_DatabaseEnginePostgresql,
			Config:      types.EngineConfigJSON{V: config},
			CreatedAt:   now,
			UpdatedAt:   now,
		}

		protoInstance, err := mapper.storageToProto(storageInstance)

		require.NoError(t, err)
		assert.NotNil(t, protoInstance.Config)
		assert.Equal(t, "super-secret-password", protoInstance.Config.Password, "Password must be preserved during mapping")
		assert.Equal(t, "localhost", protoInstance.Config.Host)
		assert.Equal(t, int32(5432), protoInstance.Config.Port)
		assert.Equal(t, "testuser", protoInstance.Config.Username)
	})
}

func TestInstanceMapper_SecretHandling(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name string
		run  func(t *testing.T)
	}{
		{
			name: "protoToStorage encrypts passwords",
			run: func(t *testing.T) {
				t.Helper()

				secrets, err := newSecretCipher("0123456789abcdef0123456789abcdef")
				require.NoError(t, err)

				mapper := instanceMapper{secrets: secrets}

				instance := &api.Instance{
					DisplayName: "Test Instance",
					Config: &api.PostgresConfig{
						Host:     "localhost",
						Port:     5432,
						Database: "testdb",
						Username: "testuser",
						Password: "super-secret-password",
					},
				}

				stored, err := mapper.protoToStorage(instance, "test-instance")
				require.NoError(t, err)
				assert.NotContains(t, stored.Config.V.GetPassword(), "super-secret-password")
				assert.Contains(t, stored.Config.V.GetPassword(), encryptedSecretPrefix)

				loaded, err := mapper.storageToProto(stored)
				require.NoError(t, err)
				assert.Equal(t, "super-secret-password", loaded.Config.Password)
			},
		},
		{
			name: "storageToProto preserves legacy plaintext password with ciphertext prefix",
			run: func(t *testing.T) {
				t.Helper()

				mapper := instanceMapper{}
				legacyPlaintext := encryptedSecretPrefix + "legacy-plaintext-password"

				loaded, err := mapper.storageToProto(model.Instance{
					ID:          "test-instance",
					DisplayName: "Test Instance",
					Config:      types.EngineConfigJSON{V: &api.PostgresConfig{Password: legacyPlaintext}},
				})
				require.NoError(t, err)
				assert.Equal(t, legacyPlaintext, loaded.Config.Password)
			},
		},
		{
			name: "protoToStorage encrypts password with ciphertext prefix",
			run: func(t *testing.T) {
				t.Helper()

				secrets, err := newSecretCipher("0123456789abcdef0123456789abcdef")
				require.NoError(t, err)

				mapper := instanceMapper{secrets: secrets}
				plaintext := encryptedSecretPrefix + "this-is-a-real-password"

				stored, err := mapper.protoToStorage(&api.Instance{Config: &api.PostgresConfig{Password: plaintext}}, "test-instance")
				require.NoError(t, err)
				assert.NotEqual(t, plaintext, stored.Config.V.GetPassword())
				assert.Contains(t, stored.Config.V.GetPassword(), encryptedSecretPrefix)

				loaded, err := mapper.storageToProto(stored)
				require.NoError(t, err)
				assert.Equal(t, plaintext, loaded.Config.Password)
			},
		},
		{
			name: "storageToProto errors for encrypted password without key",
			run: func(t *testing.T) {
				t.Helper()

				secrets, err := newSecretCipher("0123456789abcdef0123456789abcdef")
				require.NoError(t, err)
				encrypted, err := secrets.encrypt("super-secret-password")
				require.NoError(t, err)

				mapper := instanceMapper{}
				_, err = mapper.storageToProto(model.Instance{Config: types.EngineConfigJSON{V: &api.PostgresConfig{Password: encrypted}}})
				assert.ErrorIs(t, err, ErrMissingInstanceSecretKey)
			},
		},
		{
			name: "protoToStorage rejects plaintext password without key",
			run: func(t *testing.T) {
				t.Helper()

				mapper := instanceMapper{}
				_, err := mapper.protoToStorage(&api.Instance{Config: &api.PostgresConfig{Password: "super-secret-password"}}, "test-instance")
				assert.ErrorIs(t, err, ErrMissingInstanceSecretKey)
			},
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			tc.run(t)
		})
	}
}

func TestRedactInstanceForAPI(t *testing.T) {
	t.Parallel()

	t.Run("redacts PostgreSQL password", func(t *testing.T) {
		t.Parallel()

		instance := &api.Instance{
			Name:        "instances/inst1",
			DisplayName: "Test",
			Config: &api.PostgresConfig{
				Host:     "localhost",
				Port:     5432,
				Database: "testdb",
				Username: "testuser",
				Password: "should-be-redacted",
			},
		}

		RedactInstanceForAPI(instance)

		assert.Empty(t, instance.Config.Password, "Password must be redacted")
		assert.Equal(t, "localhost", instance.Config.Host, "Other fields preserved")
	})

	t.Run("handles nil instance gracefully", func(t *testing.T) {
		t.Parallel()

		assert.NotPanics(t, func() {
			RedactInstanceForAPI(nil)
		})
	})

	t.Run("handles nil config gracefully", func(t *testing.T) {
		t.Parallel()

		instance := &api.Instance{
			Name:        "instances/inst1",
			DisplayName: "Test",
			Config:      nil,
		}

		assert.NotPanics(t, func() {
			RedactInstanceForAPI(instance)
		})
	})
}

func TestInstanceMapper_ProtoToStorage_EncryptsPasswordSourceInline(t *testing.T) {
	t.Parallel()

	secrets, err := newSecretCipher("0123456789abcdef0123456789abcdef")
	require.NoError(t, err)

	mapper := instanceMapper{secrets: secrets}
	instance := &api.Instance{
		DisplayName: "Test Instance",
		Config: &api.PostgresConfig{
			Host:     "localhost",
			Port:     5432,
			Database: "testdb",
			Username: "testuser",
			PasswordSource: &api.SecretSource{
				Source: &api.SecretSource_Inline{Inline: "super-secret-password"},
			},
		},
	}

	stored, err := mapper.protoToStorage(instance, "test-instance")
	require.NoError(t, err)
	assert.Empty(t, stored.Config.V.GetPassword())
	assert.NotContains(t, stored.Config.V.GetPasswordSource().GetInline(), "super-secret-password")
	assert.Contains(t, stored.Config.V.GetPasswordSource().GetInline(), encryptedSecretPrefix)

	loaded, err := mapper.storageToProto(stored)
	require.NoError(t, err)
	assert.Equal(t, "super-secret-password", loaded.Config.GetPasswordSource().GetInline())
}

func TestInstanceMapper_ProtoToStorage_PreservesSecretReferencesWithoutKey(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name         string
		source       *api.SecretSource
		assertSource func(t *testing.T, source *api.SecretSource)
	}{
		{
			name:   "env source",
			source: &api.SecretSource{Source: &api.SecretSource_Env{Env: "DB_PASSWORD"}},
			assertSource: func(t *testing.T, source *api.SecretSource) {
				t.Helper()
				assert.Equal(t, "DB_PASSWORD", source.GetEnv())
			},
		},
		{
			name:   "external ref source",
			source: &api.SecretSource{Source: &api.SecretSource_Ref{Ref: "vault://database/prod/password"}},
			assertSource: func(t *testing.T, source *api.SecretSource) {
				t.Helper()
				assert.Equal(t, "vault://database/prod/password", source.GetRef())
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			mapper := instanceMapper{}
			instance := &api.Instance{
				DisplayName: "Test Instance",
				Config: &api.PostgresConfig{
					Host:           "localhost",
					Port:           5432,
					Database:       "testdb",
					Username:       "testuser",
					PasswordSource: tt.source,
				},
			}

			stored, err := mapper.protoToStorage(instance, "test-instance")
			require.NoError(t, err)
			assert.Empty(t, stored.Config.V.GetPassword())
			tt.assertSource(t, stored.Config.V.GetPasswordSource())

			loaded, err := mapper.storageToProto(stored)
			require.NoError(t, err)
			tt.assertSource(t, loaded.Config.GetPasswordSource())
		})
	}
}

func TestRedactInstanceForAPI_PreservesSecretReferences(t *testing.T) {
	t.Parallel()

	instance := &api.Instance{
		Name: "instances/inst1",
		Config: &api.PostgresConfig{
			PasswordSource: &api.SecretSource{Source: &api.SecretSource_Env{Env: "DB_PASSWORD"}},
		},
	}

	RedactInstanceForAPI(instance)

	assert.Equal(t, "DB_PASSWORD", instance.Config.GetPasswordSource().GetEnv())
}

func TestRedactInstanceForAPI_DropsInlineSecretSource(t *testing.T) {
	t.Parallel()

	instance := &api.Instance{
		Name: "instances/inst1",
		Config: &api.PostgresConfig{
			PasswordSource: &api.SecretSource{Source: &api.SecretSource_Inline{Inline: "should-be-redacted"}},
		},
	}

	RedactInstanceForAPI(instance)

	assert.Nil(t, instance.Config.GetPasswordSource())
}
