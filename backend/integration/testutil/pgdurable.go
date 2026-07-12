package testutil

import (
	"context"
	"fmt"
	"net/url"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/modules/postgres"
	"github.com/testcontainers/testcontainers-go/wait"
)

const (
	// pgDurableImageEnv opts a run into the pg_durable integration tests and
	// names the image to use, e.g. ghcr.io/microsoft/pg_durable:pg17. The
	// tests skip when it is unset for local runs. Required CI sets a pinned
	// digest and separately fails if the contract test skips.
	pgDurableImageEnv = "QUERYLANE_TEST_PGDURABLE_IMAGE"

	// The pg_durable background worker connects to the database named by the
	// pg_durable.database GUC (default "postgres"), so the container keeps
	// the stock superuser and maintenance database.
	pgDurableUsername = "postgres"
	pgDurableDatabase = "postgres"
	pgDurablePassword = "integration"
)

// RequirePgDurableContainer starts a PostgreSQL container from the
// microsoft/pg_durable image. It skips the calling test unless
// QUERYLANE_TEST_PGDURABLE_IMAGE is set and Docker is healthy. The upstream
// image is published for linux/amd64 only, so the request pins that platform
// (emulated on arm64 hosts).
func RequirePgDurableContainer(ctx context.Context, t *testing.T) *PostgreSQLContainer {
	t.Helper()

	image := strings.TrimSpace(os.Getenv(pgDurableImageEnv))
	if image == "" {
		t.Skipf("skipping: set %s (e.g. ghcr.io/microsoft/pg_durable:pg17) to run pg_durable integration tests", pgDurableImageEnv)
	}

	testcontainers.SkipIfProviderIsNotHealthy(t)

	container, err := postgres.Run(ctx,
		image,
		postgres.WithDatabase(pgDurableDatabase),
		postgres.WithUsername(pgDurableUsername),
		postgres.WithPassword(pgDurablePassword),
		testcontainers.WithImagePlatform("linux/amd64"),
		testcontainers.WithWaitStrategy(
			wait.ForLog("database system is ready to accept connections").
				WithOccurrence(2).
				// Generous: first use pulls the image and arm64 hosts emulate it.
				WithStartupTimeout(3*time.Minute),
		),
	)
	if err != nil {
		t.Fatalf("failed to start pg_durable testcontainer %s: %v", image, err)
	}

	return &PostgreSQLContainer{
		container: container,
		username:  pgDurableUsername,
		password:  pgDurablePassword,
		database:  pgDurableDatabase,
	}
}

// ExecSQL runs one SQL statement inside the container via psql as the
// container superuser against the maintenance database.
func (c *PostgreSQLContainer) ExecSQL(ctx context.Context, statement string) error {
	exitCode, _, err := c.container.Exec(ctx, []string{
		"psql", "-U", c.username, "-d", c.database, "-v", "ON_ERROR_STOP=1", "-c", statement,
	})
	if err != nil {
		return fmt.Errorf("psql exec failed: %w", err)
	}

	if exitCode != 0 {
		return fmt.Errorf("psql exited with code %d for statement: %s", exitCode, statement)
	}

	return nil
}

// DatabaseConnectionStringForUser returns a connection string to dbName
// authenticating as the given role instead of the container superuser.
func (c *PostgreSQLContainer) DatabaseConnectionStringForUser(ctx context.Context, dbName, username, password string) (string, error) {
	connString, err := c.databaseConnectionString(ctx, dbName, nil)
	if err != nil {
		return "", err
	}

	parsed, err := url.Parse(connString)
	if err != nil {
		return "", fmt.Errorf("failed to parse connection string: %w", err)
	}

	parsed.User = url.UserPassword(username, password)

	return parsed.String(), nil
}
