package testutil

import (
	"context"
	"database/sql"
	"strconv"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/querylane/querylane/backend/storage"
)

func TestIntegrationSanitizeDatabaseName(t *testing.T) {
	t.Parallel()

	if testing.Short() {
		t.Skip("skipping integration test in short mode")
	}

	testDB := storage.NewTestDB(t)

	var one int
	require.NoError(t, testDB.DB().QueryRowContext(t.Context(), "SELECT 1").Scan(&one))
	require.Equal(t, 1, one)

	tests := []struct {
		name     string
		input    string
		want     string
		compare  string
		wantDiff bool
	}{
		{
			name:  "normalizes invalid characters and leading digit",
			input: "123/Test Name With Spaces",
			want:  "test_123_test_name_with_spaces",
		},
		{
			name:     "keeps long names valid and distinct",
			input:    "test_" + strings.Repeat("a", 80),
			compare:  "test_" + strings.Repeat("b", 80),
			wantDiff: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			got := SanitizeDatabaseName(tt.input)
			if tt.want != "" {
				assert.Equal(t, tt.want, got)
			}

			require.LessOrEqual(t, len(got), 63)

			if tt.compare != "" {
				other := SanitizeDatabaseName(tt.compare)
				require.LessOrEqual(t, len(other), 63)

				if tt.wantDiff {
					assert.NotEqual(t, got, other)
				}
			}
		})
	}
}

func TestIntegrationPostgreSQLContainerRunsPostgres18(t *testing.T) {
	t.Parallel()

	if testing.Short() {
		t.Skip("skipping integration test in short mode")
	}

	ctx := t.Context()
	container := RequirePostgreSQLContainer(ctx, t)
	t.Cleanup(func() {
		_ = container.Cleanup(context.Background())
	})

	connectionString, err := container.ConnectionString(ctx)
	require.NoError(t, err)

	db, err := sql.Open("pgx", connectionString)
	require.NoError(t, err)
	t.Cleanup(func() {
		_ = db.Close()
	})

	var versionNum int
	require.NoError(t, db.QueryRowContext(ctx, "SELECT current_setting('server_version_num')::int").Scan(&versionNum))

	assert.GreaterOrEqual(t, versionNum, 180000)
	assert.Less(t, versionNum, 190000)
}

func TestPostgreSQLContainerImageUsesPostgres18(t *testing.T) {
	t.Parallel()

	tag, ok := strings.CutPrefix(postgresImage, "postgres:")
	require.True(t, ok, "postgres image should use the official postgres repository")

	majorText, _, _ := strings.Cut(tag, "-")
	major, err := strconv.Atoi(majorText)
	require.NoError(t, err)

	assert.GreaterOrEqual(t, major, 18)
	assert.Less(t, major, 19)
}
