package engine

import (
	"context"
	"database/sql/driver"
	"fmt"
	"net/netip"
	"strings"
	"sync"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/stdlib"
)

// connectionBudget bounds physical PostgreSQL connections shared by every
// sql.DB pool targeting one PostgreSQL endpoint.
type connectionBudget struct {
	slots             chan struct{}
	idleSlots         chan struct{}
	onPhysicalRelease func()
}

// postgresEndpoint is a stable, non-secret identity for one PostgreSQL server.
// Database names and credentials deliberately do not participate in the key.
type postgresEndpoint struct {
	host string
	port uint16
}

func postgresEndpointFromDSN(dsn string) (postgresEndpoint, error) {
	cfg, err := pgx.ParseConfig(dsn)
	if err != nil {
		return postgresEndpoint{}, fmt.Errorf("parse postgres endpoint: %w", err)
	}

	return postgresEndpoint{host: canonicalPostgresHost(cfg.Host), port: cfg.Port}, nil
}

func canonicalPostgresHost(host string) string {
	if strings.HasPrefix(host, "/") {
		return host
	}

	trimmedHost := strings.TrimSuffix(strings.TrimPrefix(host, "["), "]")
	if addr, err := netip.ParseAddr(trimmedHost); err == nil {
		return addr.Unmap().String()
	}

	return strings.ToLower(strings.TrimRight(host, "."))
}

func newConnectionBudget(maxOpen, maxIdle int) *connectionBudget {
	if maxOpen <= 0 {
		panic("connection budget limit must be positive") //nolint:forbidigo // invalid internal pool configuration
	}

	// Always preserve one slot for new active work when aliases have idle pools.
	idleLimit := min(max(maxIdle, 0), maxOpen-1)

	return &connectionBudget{
		slots:     make(chan struct{}, maxOpen),
		idleSlots: make(chan struct{}, idleLimit),
	}
}

// acquire waits for capacity and returns an idempotent release function.
func (b *connectionBudget) acquire(ctx context.Context) (func(), error) {
	select {
	case b.slots <- struct{}{}:
	case <-ctx.Done():
		return nil, ctx.Err()
	}

	var once sync.Once

	return func() {
		once.Do(func() {
			<-b.slots

			if b.onPhysicalRelease != nil {
				b.onPhysicalRelease()
			}
		})
	}, nil
}

func (b *connectionBudget) tryRetainIdle() bool {
	select {
	case b.idleSlots <- struct{}{}:
		return true
	default:
		return false
	}
}

func (b *connectionBudget) releaseIdle() {
	<-b.idleSlots
}

func (b *connectionBudget) physicalConnections() int {
	return len(b.slots)
}

// budgetedConnector applies one shared budget around physical connections
// created by otherwise-independent database/sql pools.
type budgetedConnector struct {
	driver.Connector

	budget *connectionBudget
}

func (c *budgetedConnector) Connect(ctx context.Context) (driver.Conn, error) {
	release, err := c.budget.acquire(ctx)
	if err != nil {
		return nil, err
	}

	conn, err := c.Connector.Connect(ctx)
	if err != nil {
		release()
		return nil, err
	}

	stdlibConn, ok := conn.(*stdlib.Conn)
	if !ok {
		_ = conn.Close()

		release()

		return nil, fmt.Errorf("unexpected postgres driver connection %T", conn)
	}

	return &budgetedPostgresConn{
		Conn:    stdlibConn,
		budget:  c.budget,
		release: release,
	}, nil
}

// budgetedPostgresConn embeds pgx's concrete database/sql connection so all
// optional driver fast paths remain available to database/sql.
type budgetedPostgresConn struct {
	*stdlib.Conn

	budget    *connectionBudget
	release   func()
	closeOnce sync.Once
	closeErr  error
	stateMu   sync.Mutex
	idle      bool
	closed    bool
}

func (c *budgetedPostgresConn) Close() error {
	c.closeOnce.Do(func() {
		c.closeErr = c.Conn.Close()

		c.stateMu.Lock()

		c.closed = true
		if c.idle {
			c.idle = false
			c.budget.releaseIdle()
		}
		c.stateMu.Unlock()

		c.release()
	})

	return c.closeErr
}

// IsValid runs when database/sql considers returning the physical connection
// to a pool. Reserving the endpoint-wide idle allowance here prevents aliases
// from multiplying their local idle limits.
func (c *budgetedPostgresConn) IsValid() bool {
	if validator, ok := any(c.Conn).(driver.Validator); ok && !validator.IsValid() {
		return false
	}

	c.stateMu.Lock()
	defer c.stateMu.Unlock()

	if c.closed {
		return false
	}

	if c.idle {
		return true
	}

	if !c.budget.tryRetainIdle() {
		return false
	}

	c.idle = true

	return true
}

// ResetSession runs before an idle connection is reused. It returns the idle
// reservation before delegating to pgx's normal session reset behavior.
func (c *budgetedPostgresConn) ResetSession(ctx context.Context) error {
	c.stateMu.Lock()
	if c.idle {
		c.idle = false
		c.budget.releaseIdle()
	}
	c.stateMu.Unlock()

	return c.Conn.ResetSession(ctx)
}

func (c *budgetedPostgresConn) postgresConn() *pgx.Conn {
	return c.Conn.Conn()
}

var (
	_ driver.Conn               = (*budgetedPostgresConn)(nil)
	_ driver.Pinger             = (*budgetedPostgresConn)(nil)
	_ driver.ExecerContext      = (*budgetedPostgresConn)(nil)
	_ driver.QueryerContext     = (*budgetedPostgresConn)(nil)
	_ driver.ConnPrepareContext = (*budgetedPostgresConn)(nil)
	_ driver.ConnBeginTx        = (*budgetedPostgresConn)(nil)
	_ driver.NamedValueChecker  = (*budgetedPostgresConn)(nil)
	_ driver.SessionResetter    = (*budgetedPostgresConn)(nil)
	_ driver.Validator          = (*budgetedPostgresConn)(nil)
)
