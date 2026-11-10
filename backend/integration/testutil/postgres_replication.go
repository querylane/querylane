package testutil

import (
	"context"
	"fmt"
	"io"
	"net"
	"net/url"
	"testing"
	"time"

	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/network"
	"github.com/testcontainers/testcontainers-go/wait"
)

// PostgreSQLReplication is an isolated physical-streaming primary/standby pair.
// Both servers use the integration image override and are removed with the test.
// It is intentionally separate from meta-database fixtures.
type PostgreSQLReplication struct {
	Primary *PostgreSQLContainer
	standby testcontainers.Container
}

// RequirePostgreSQLReplication creates a real physical standby using
// pg_basebackup, not SET ROLE or mocked catalog results. The caller's timeout
// bounds setup; cleanup has its own timeout so cancellation cannot leak fixtures.
func RequirePostgreSQLReplication(ctx context.Context, t *testing.T) *PostgreSQLReplication {
	t.Helper()
	requirePostgreSQLProvider(ctx, t)

	nw, err := network.New(ctx)
	if err != nil {
		t.Fatalf("create replication network: %v", err)
	}
	t.Cleanup(func() {
		cleanupCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 30*time.Second)
		defer cancel()
		if err := nw.Remove(cleanupCtx); err != nil {
			t.Errorf("remove replication network: %v", err)
		}
	})

	primary, err := newPostgreSQLContainer(ctx, postgresImage(),
		network.WithNetwork([]string{"primary"}, nw),
		testcontainers.WithEnv(map[string]string{"PGDATA": "/var/lib/postgresql/replication-data"}),
	)
	if err != nil {
		t.Fatalf("start replication primary: %v", err)
	}
	t.Cleanup(func() {
		cleanupCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 30*time.Second)
		defer cancel()
		if err := primary.Cleanup(cleanupCtx); err != nil {
			t.Errorf("remove replication primary: %v", err)
		}
	})

	// These fixed credentials exist only inside the disposable fixture network.
	code, output, err := primary.container.Exec(ctx, []string{
		"sh", "-ec", `printf '\nhost replication replicator all scram-sha-256\n' >> "$PGDATA/pg_hba.conf"
psql -U testuser -d testdb -v ON_ERROR_STOP=1 -c "CREATE ROLE replicator LOGIN REPLICATION PASSWORD 'replication-test'; SELECT pg_reload_conf();"`,
	})
	if err != nil || code != 0 {
		var details []byte
		if output != nil {
			details, _ = io.ReadAll(output)
		}
		t.Fatalf("configure replication primary (exit %d): %v: %s", code, err, details)
	}

	standby, err := testcontainers.GenericContainer(ctx, testcontainers.GenericContainerRequest{
		Image:        postgresImage(),
		User:         "postgres",
		Env:          map[string]string{"PGDATA": "/var/lib/postgresql/replication-data"},
		ExposedPorts: []string{"5432/tcp"},
		Networks:     []string{nw.Name},
		Entrypoint:   []string{"sh", "-ec"},
		Cmd: []string{`mkdir -p "$PGDATA"; chmod 700 "$PGDATA"
pg_basebackup -d 'host=primary user=replicator password=replication-test application_name=querylane_fixture' -D "$PGDATA" -R -X stream --checkpoint=fast
exec docker-entrypoint.sh postgres -c shared_preload_libraries=pg_stat_statements`},
		WaitingFor: wait.ForLog("database system is ready to accept read-only connections").WithStartupTimeout(45 * time.Second),
		Started:    true,
	})
	// GenericContainer may return a created container along with a startup error.
	if standby != nil {
		t.Cleanup(func() {
			cleanupCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 30*time.Second)
			defer cancel()
			if err := standby.Terminate(cleanupCtx); err != nil {
				t.Errorf("remove replication standby: %v", err)
			}
		})
	}
	if err != nil {
		t.Fatalf("start replication standby: %v", err)
	}

	return &PostgreSQLReplication{Primary: primary, standby: standby}
}

// StandbyConnectionString returns a direct TCP login to the physical standby.
func (c *PostgreSQLReplication) StandbyConnectionString(ctx context.Context) (string, error) {
	host, err := c.standby.Host(ctx)
	if err != nil {
		return "", err
	}
	port, err := c.standby.MappedPort(ctx, "5432")
	if err != nil {
		return "", err
	}
	u := url.URL{
		Scheme: "postgresql", User: url.UserPassword(containerUsername, containerPassword),
		Host: net.JoinHostPort(host, port.Port()), Path: containerDatabase,
		RawQuery: "sslmode=disable",
	}
	return u.String(), nil
}

// StopPrimary disconnects the WAL sender so tests can distinguish an absent
// receiver from restricted statistics. Termination still runs during cleanup.
func (c *PostgreSQLReplication) StopPrimary(ctx context.Context) error {
	timeout := 5 * time.Second
	if err := c.Primary.container.Stop(ctx, &timeout); err != nil {
		return fmt.Errorf("stop replication primary: %w", err)
	}
	return nil
}
