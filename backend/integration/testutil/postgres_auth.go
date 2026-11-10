package testutil

import (
	"context"
	"strings"
	"testing"

	"github.com/testcontainers/testcontainers-go"
)

const hbaAll = "all"

// RequirePostgreSQLAuthenticationContainer starts a disposable PostgreSQL 19+
// authentication fixture. Its host-only MD5 rule accepts legacy MD5 passwords
// and negotiates SCRAM for SCRAM-stored passwords. No host rule permits trust.
// This configuration must never be used for application/production servers.
// The caller owns Cleanup, just like RequirePostgreSQLContainer.
func RequirePostgreSQLAuthenticationContainer(ctx context.Context, t *testing.T) *PostgreSQLContainer {
	t.Helper()
	requirePostgreSQLProvider(ctx, t)

	container, err := newPostgreSQLContainer(ctx, postgresImage(),
		testcontainers.WithFiles(testcontainers.ContainerFile{
			Reader: strings.NewReader(strings.Join([]string{
				strings.Join([]string{"local", hbaAll, hbaAll, "trust"}, " "),
				strings.Join([]string{"host", hbaAll, hbaAll, hbaAll, "md5"}, " "),
				"",
			}, "\n")),
			ContainerFilePath: "/tmp/querylane-auth-pg_hba.conf",
			FileMode:          0o644,
		}),
		testcontainers.WithCmd("postgres",
			"-c", "hba_file=/tmp/querylane-auth-pg_hba.conf",
			"-c", "md5_password_warnings=on",
			"-c", "password_expiration_warning_threshold=7d",
		),
	)
	if err != nil {
		t.Fatalf("failed to start PostgreSQL authentication fixture: %v", err)
	}

	return container
}
