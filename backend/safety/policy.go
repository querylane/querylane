// Package safety centralizes server-enforced policies for user-driven
// operations against managed PostgreSQL instances.
package safety

import (
	"context"
	"time"

	api "github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1"
	"github.com/querylane/querylane/backend/resource"
)

const (
	defaultStatementTimeout = 30 * time.Second
	maxStatementTimeout     = time.Minute
)

// Policy is the effective safety configuration for one instance.
type Policy struct {
	allowMutations   bool
	statementTimeout time.Duration
}

type instanceReader interface {
	GetInstance(context.Context, string) (*api.Instance, error)
}

// Gate loads server-owned instance policies at the point of use. Clients
// cannot bypass a read-only instance by changing request data.
type Gate struct {
	instances instanceReader
}

// NewGate constructs a policy gate over the canonical instance reader.
func NewGate(instances instanceReader) *Gate {
	if instances == nil {
		panic("safety.NewGate: instance reader is required") //nolint:forbidigo // programmer error in dependency wiring
	}

	return &Gate{instances: instances}
}

// Policy returns the current safety policy for an instance.
func (g *Gate) Policy(ctx context.Context, instance resource.InstanceName) (Policy, error) {
	stored, err := g.instances.GetInstance(ctx, instance.String())
	if err != nil {
		return Policy{}, err
	}

	return FromPostgresConfig(stored.GetConfig()), nil
}

// FromPostgresConfig derives a fail-closed policy from persisted instance
// configuration. Missing or invalid values use safe defaults.
func FromPostgresConfig(config *api.PostgresConfig) Policy {
	policy := Policy{statementTimeout: defaultStatementTimeout}
	if config == nil {
		return policy
	}

	policy.allowMutations = config.GetAllowMutations()
	if configured := config.GetStatementTimeout(); configured != nil {
		if timeout := configured.AsDuration(); timeout > 0 {
			policy.statementTimeout = min(timeout, maxStatementTimeout)
		}
	}

	return policy
}

// MutationsAllowed reports whether writes were explicitly enabled.
func (p Policy) MutationsAllowed() bool {
	return p.allowMutations
}

// StatementTimeout returns the request override or instance default, capped
// at Querylane's hard safety limit.
func (p Policy) StatementTimeout(requested time.Duration) time.Duration {
	if requested <= 0 {
		return p.statementTimeout
	}

	return min(requested, maxStatementTimeout)
}
