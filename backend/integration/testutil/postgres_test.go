package testutil

import (
	"context"
	"database/sql"
	"fmt"
	"path"
	"regexp"
	"strconv"
	"strings"
	"testing"

	"github.com/distribution/reference"
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

func TestIntegrationPostgreSQLContainerRunsExpectedMajor(t *testing.T) {
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

	// The running server must match the major declared by the (possibly
	// overridden) image, and stay within the supported PostgreSQL 14+ floor.
	expectedMajor := imageMajor(t)
	assert.GreaterOrEqual(t, versionNum, expectedMajor*10000)
	assert.Less(t, versionNum, (expectedMajor+1)*10000)
	assert.GreaterOrEqual(t, versionNum, 140000, "Querylane supports PostgreSQL 14+")
}

func TestPostgreSQLContainerImageIsSupported(t *testing.T) {
	t.Parallel()

	// Default is the newest major; QUERYLANE_TEST_POSTGRES_IMAGE may pin an
	// older supported one for cross-version probe coverage.
	assert.GreaterOrEqual(t, imageMajor(t), 14)
}

// imageMajor extracts the declared major from an explicit PostgreSQL image tag;
// the integration test independently checks it against server_version_num.
func imageMajor(t *testing.T) int {
	t.Helper()

	major, err := parsePostgresImageMajor(postgresImage())
	require.NoError(t, err)

	return major
}

func parsePostgresImageMajor(image string) (int, error) {
	named, err := reference.ParseNormalizedNamed(image)
	if err != nil {
		return 0, fmt.Errorf("parse PostgreSQL test image: %w", err)
	}
	if path.Base(reference.Path(named)) != "postgres" {
		return 0, fmt.Errorf("test image repository must end in postgres: %q", reference.FamiliarName(named))
	}
	tagged, ok := named.(reference.Tagged)
	if !ok {
		return 0, fmt.Errorf("PostgreSQL test image needs an explicit version tag: %q", image)
	}
	version := regexp.MustCompile(`^([1-9][0-9]*)(?:\.[0-9]+)?(?:(?:beta|rc)[1-9][0-9]*)?(?:-[a-z0-9][a-z0-9.-]*)?$`).FindStringSubmatch(tagged.Tag())
	if version == nil {
		return 0, fmt.Errorf("invalid PostgreSQL version tag: %q", tagged.Tag())
	}
	return strconv.Atoi(version[1])
}

func TestParsePostgresImageMajor(t *testing.T) {
	t.Parallel()

	digest := "@sha256:" + strings.Repeat("a", 64)
	for _, tc := range []struct {
		image string
		major int
	}{
		{"postgres:18-alpine", 18},
		{"postgres:18.6-alpine", 18},
		{"postgres:18.6", 18},
		{"postgres:19rc1-alpine", 19},
		{"postgres:19beta3-alpine3.23", 19},
		{"postgres:19rc1-alpine" + digest, 19},
		{"docker.io/library/postgres:18.6-alpine" + digest, 18},
		{"registry.example:5000/cache/postgres:18.6-alpine" + digest, 18},
		{"registry.example:5000/cache/postgres:19rc1", 19},
		{"postgres:latest", 0},
		{"postgres:18garbage", 0},
		{"postgres:18.6garbage-alpine", 0},
		{"postgres:18..6-alpine", 0},
		{"postgres:18rc-alpine", 0},
		{"postgres:18rc0-alpine", 0},
		{"postgres:0-alpine", 0},
		{"postgres", 0},
		{"postgres" + digest, 0},
		{"postgres:18.6@sha256:invalid", 0},
		{"registry.example:5000/cache/not-postgres:18.6-alpine", 0},
		{"redis:18.6-alpine", 0},
		{"postgres:18.6-alpine trailing", 0},
	} {
		t.Run(tc.image, func(t *testing.T) {
			t.Parallel()
			major, err := parsePostgresImageMajor(tc.image)
			if tc.major == 0 {
				require.Error(t, err)
				return
			}
			require.NoError(t, err)
			assert.Equal(t, tc.major, major)
		})
	}
}
