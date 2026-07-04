package storage

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	serverconfig "github.com/querylane/querylane/backend/config/server"
	api "github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1"
)

func newTestConfigs() []*serverconfig.InstanceConfig {
	return []*serverconfig.InstanceConfig{
		{
			ID:             "prod",
			DisplayName:    "Production",
			Host:           "prod.example.com",
			Port:           5432,
			Database:       "myapp",
			Username:       "admin",
			Password:       "secret",
			SSLMode:        "require",
			SSLNegotiation: "direct",
			Labels:         map[string]string{"env": "production"},
		},
		{
			ID:          "dev",
			DisplayName: "Development",
			Host:        "dev.example.com",
			Port:        5434,
			Database:    "myapp",
			Username:    "admin",
			Password:    "dev-pw",
			SSLMode:     "disable",
		},
		{
			ID:          "staging",
			DisplayName: "Staging",
			Host:        "staging.example.com",
			Port:        5433,
			Database:    "myapp",
			Username:    "admin",
			Password:    "staging-pw",
			SSLMode:     "prefer",
		},
	}
}

func TestConfigInstanceRepository_GetInstance(t *testing.T) { //nolint:tparallel // Short-mode guard must run before t.Parallel().
	if testing.Short() {
		t.Skip("skipping config instance repository tests in short mode")
	}

	t.Parallel()

	ctx := context.Background()

	t.Run("returns existing instance", func(t *testing.T) {
		t.Parallel()

		repo := NewConfigInstanceRepository(newTestConfigs())

		inst, err := repo.GetInstance(ctx, "instances/prod")
		require.NoError(t, err)
		assert.Equal(t, "instances/prod", inst.GetName())
		assert.Equal(t, "Production", inst.GetDisplayName())
		assert.Equal(t, "prod.example.com", inst.GetConfig().GetHost())
		assert.Equal(t, int32(5432), inst.GetConfig().GetPort())
		assert.Equal(t, "myapp", inst.GetConfig().GetDatabase())
		assert.Equal(t, "admin", inst.GetConfig().GetUsername())
		assert.Equal(t, "secret", inst.GetConfig().GetPassword())
		assert.Equal(t, api.PostgresConfig_SSL_MODE_REQUIRE, inst.GetConfig().GetSslMode())
		assert.Equal(t, api.PostgresConfig_SSL_NEGOTIATION_DIRECT, inst.GetConfig().GetSslNegotiation())
		assert.Equal(t, map[string]string{"env": "production"}, inst.GetLabels())
		assert.NotNil(t, inst.GetCreateTime())
		assert.NotNil(t, inst.GetUpdateTime())
	})

	t.Run("returns ErrNotFound for missing instance", func(t *testing.T) {
		t.Parallel()

		repo := NewConfigInstanceRepository(newTestConfigs())

		_, err := repo.GetInstance(ctx, "instances/nonexistent")
		assert.ErrorIs(t, err, ErrNotFound)
	})

	t.Run("returns ErrInvalidInput for bad name format", func(t *testing.T) {
		t.Parallel()

		repo := NewConfigInstanceRepository(newTestConfigs())

		_, err := repo.GetInstance(ctx, "bad-format")
		assert.ErrorIs(t, err, ErrInvalidInput)
	})

	t.Run("returns deep clone that does not affect cached state", func(t *testing.T) {
		t.Parallel()

		repo := NewConfigInstanceRepository(newTestConfigs())

		inst1, err := repo.GetInstance(ctx, "instances/prod")
		require.NoError(t, err)

		// Mutate the returned instance (simulates RedactInstanceForAPI).
		inst1.Config.Password = ""

		// Second read should still have the password.
		inst2, err := repo.GetInstance(ctx, "instances/prod")
		require.NoError(t, err)
		assert.Equal(t, "secret", inst2.GetConfig().GetPassword())
	})
}

func TestConfigInstanceRepository_ListInstances(t *testing.T) { //nolint:tparallel // Short-mode guard must run before t.Parallel().
	if testing.Short() {
		t.Skip("skipping config instance repository tests in short mode")
	}

	t.Parallel()

	ctx := context.Background()

	t.Run("returns all instances sorted by display_name", func(t *testing.T) {
		t.Parallel()

		repo := NewConfigInstanceRepository(newTestConfigs())

		instances, nextToken, err := repo.ListInstances(ctx, 0, "", "", "")
		require.NoError(t, err)
		assert.Empty(t, nextToken)
		require.Len(t, instances, 3)
		assert.Equal(t, "Development", instances[0].GetDisplayName())
		assert.Equal(t, "Production", instances[1].GetDisplayName())
		assert.Equal(t, "Staging", instances[2].GetDisplayName())
	})

	t.Run("rejects unsupported filter", func(t *testing.T) {
		t.Parallel()

		repo := NewConfigInstanceRepository(newTestConfigs())

		_, _, err := repo.ListInstances(ctx, 10, "", "display_name.contains('Prod')", "")
		require.ErrorIs(t, err, ErrInvalidFilter)
	})

	t.Run("returns empty list for empty config", func(t *testing.T) {
		t.Parallel()

		repo := NewConfigInstanceRepository([]*serverconfig.InstanceConfig{})

		instances, nextToken, err := repo.ListInstances(ctx, 0, "", "", "")
		require.NoError(t, err)
		assert.Empty(t, nextToken)
		assert.Empty(t, instances)
	})

	t.Run("returns deep clones", func(t *testing.T) {
		t.Parallel()

		repo := NewConfigInstanceRepository(newTestConfigs())

		instances, _, err := repo.ListInstances(ctx, 0, "", "", "")
		require.NoError(t, err)

		// Mutate the returned instances.
		for _, inst := range instances {
			inst.Config.Password = ""
		}

		// Second list should still have passwords.
		instances2, _, err := repo.ListInstances(ctx, 0, "", "", "")
		require.NoError(t, err)

		for _, inst := range instances2 {
			assert.NotEmpty(t, inst.GetConfig().GetPassword())
		}
	})

	t.Run("applies page_size and page_token", func(t *testing.T) {
		t.Parallel()

		repo := NewConfigInstanceRepository(newTestConfigs())

		page1, nextToken, err := repo.ListInstances(ctx, 1, "", "", "")
		require.NoError(t, err)
		require.Len(t, page1, 1)
		assert.Equal(t, "Development", page1[0].GetDisplayName())
		require.NotEmpty(t, nextToken)

		page2, nextToken, err := repo.ListInstances(ctx, 1, nextToken, "", "")
		require.NoError(t, err)
		require.Len(t, page2, 1)
		assert.Equal(t, "Production", page2[0].GetDisplayName())
		require.NotEmpty(t, nextToken)

		page3, nextToken, err := repo.ListInstances(ctx, 1, nextToken, "", "")
		require.NoError(t, err)
		require.Len(t, page3, 1)
		assert.Equal(t, "Staging", page3[0].GetDisplayName())
		assert.Empty(t, nextToken)
	})

	t.Run("applies order_by", func(t *testing.T) {
		t.Parallel()

		repo := NewConfigInstanceRepository(newTestConfigs())

		instances, _, err := repo.ListInstances(ctx, 0, "", "", "display_name desc")
		require.NoError(t, err)
		require.Len(t, instances, 3)
		assert.Equal(t, "Staging", instances[0].GetDisplayName())
		assert.Equal(t, "Production", instances[1].GetDisplayName())
		assert.Equal(t, "Development", instances[2].GetDisplayName())
	})

	t.Run("rejects invalid order_by and page_token", func(t *testing.T) {
		t.Parallel()

		repo := NewConfigInstanceRepository(newTestConfigs())

		_, _, err := repo.ListInstances(ctx, 0, "", "", "unknown asc")
		require.ErrorIs(t, err, ErrInvalidOrderBy)

		_, _, err = repo.ListInstances(ctx, 0, "not-valid-base64", "", "")
		assert.ErrorIs(t, err, ErrInvalidPageToken)
	})

	t.Run("rejects mid-pagination filter change", func(t *testing.T) {
		t.Parallel()

		repo := NewConfigInstanceRepository(newTestConfigs())

		_, nextToken, err := repo.ListInstances(ctx, 1, "", "", "")
		require.NoError(t, err)
		require.NotEmpty(t, nextToken)

		// Token validation runs before filter validation, so a filter
		// introduced mid-pagination trips the token's filter-hash check.
		_, _, err = repo.ListInstances(ctx, 1, nextToken, "display_name='Staging'", "")
		assert.ErrorIs(t, err, ErrFilterMismatch)
	})
}

func TestConfigInstanceRepository_Mutations(t *testing.T) { //nolint:tparallel // Short-mode guard must run before t.Parallel().
	if testing.Short() {
		t.Skip("skipping config instance repository tests in short mode")
	}

	t.Parallel()

	ctx := context.Background()
	repo := NewConfigInstanceRepository(newTestConfigs())

	t.Run("CreateInstance returns ErrConfigManaged", func(t *testing.T) {
		t.Parallel()

		_, err := repo.CreateInstance(ctx, &api.Instance{}, "new-id")
		assert.ErrorIs(t, err, ErrConfigManaged)
	})

	t.Run("UpdateInstance returns ErrConfigManaged", func(t *testing.T) {
		t.Parallel()

		_, err := repo.UpdateInstance(ctx, &api.Instance{}, nil)
		assert.ErrorIs(t, err, ErrConfigManaged)
	})

	t.Run("DeleteInstance returns ErrConfigManaged", func(t *testing.T) {
		t.Parallel()

		err := repo.DeleteInstance(ctx, "instances/prod")
		assert.ErrorIs(t, err, ErrConfigManaged)
	})
}
