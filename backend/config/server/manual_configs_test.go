package server

import (
	"context"
	"path/filepath"
	"runtime"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/querylane/querylane/backend/config"
)

func TestManualConfigFixturesLoad(t *testing.T) {
	t.Parallel()

	if testing.Short() {
		t.Skip("skipping manual config fixture load test in short mode")
	}

	fixtures := []struct {
		name      string
		file      string
		assertion func(*testing.T, *Config)
	}{
		{
			name: "manual onboarding boots without database config",
			file: "manual-onboarding.yaml",
			assertion: func(t *testing.T, cfg *Config) {
				t.Helper()
				assert.Nil(t, cfg.Database)
				assert.Nil(t, cfg.Embedded)
				assert.Equal(t, "0.0.0.0", cfg.HTTP.Host)
				assert.Equal(t, 8080, cfg.HTTP.Port)
			},
		},
		{
			name: "manual degraded uses current database config shape",
			file: "manual-degraded.yaml",
			assertion: func(t *testing.T, cfg *Config) {
				t.Helper()
				require.NotNil(t, cfg.Database)
				assert.Contains(t, cfg.Database.DSN, "querylane_dev")
				assert.Nil(t, cfg.Embedded)
			},
		},
	}

	for _, fixture := range fixtures {
		t.Run(fixture.name, func(t *testing.T) {
			t.Parallel()

			loaded := loadManualFixture(t, fixture.file)
			require.NotNil(t, loaded)
			fixture.assertion(t, loaded)
		})
	}
}

func loadManualFixture(t *testing.T, name string) *Config {
	t.Helper()

	_, currentFile, _, ok := runtime.Caller(0)
	require.True(t, ok)

	configPath := filepath.Join(filepath.Dir(currentFile), "..", "..", "configs", name)
	defaults := &Config{}
	defaults.SetDefaults()

	loader := config.NewLoader[*Config]()
	loaded, err := loader.Load(context.Background(), config.Struct{Value: defaults}, config.File(configPath))
	require.NoError(t, err)

	return loaded
}
