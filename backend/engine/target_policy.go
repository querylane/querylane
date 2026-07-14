package engine

import (
	"context"
	"errors"
	"fmt"
	"net"
	"net/netip"

	"github.com/jackc/pgx/v5"
)

// ErrTargetNotAllowed marks a managed PostgreSQL dial rejected by the
// configured outbound target policy. Public RPC errors must not include the
// wrapped address because it would recreate the network-mapping oracle.
var ErrTargetNotAllowed = errors.New("managed PostgreSQL target is not allowed")

var defaultBlockedTargetPrefixes = []netip.Prefix{
	netip.MustParsePrefix("0.0.0.0/32"),
	netip.MustParsePrefix("127.0.0.0/8"),
	netip.MustParsePrefix("169.254.0.0/16"),
	netip.MustParsePrefix("fd00:ec2::254/128"),
	netip.MustParsePrefix("::/128"),
	netip.MustParsePrefix("::1/128"),
	netip.MustParsePrefix("fe80::/10"),
}

// TargetPolicy is an immutable allow/deny policy evaluated against resolved
// IP addresses immediately before each managed PostgreSQL socket dial.
type TargetPolicy struct {
	allowed []netip.Prefix
	denied  []netip.Prefix
}

// NewTargetPolicy parses an outbound target policy. A nonempty allowlist is
// strict and explicitly overrides the built-in host-local blocks. Operator
// deny entries always take precedence over allow entries.
func NewTargetPolicy(allowedCIDRs, deniedCIDRs []string) (*TargetPolicy, error) {
	allowed, err := parseTargetPrefixes("allowed_cidrs", allowedCIDRs)
	if err != nil {
		return nil, err
	}

	denied, err := parseTargetPrefixes("denied_cidrs", deniedCIDRs)
	if err != nil {
		return nil, err
	}

	return &TargetPolicy{allowed: allowed, denied: denied}, nil
}

// HasExplicitAllowlist reports whether every permitted target must match an
// operator-trusted CIDR. Only then may the API expose detailed probe errors.
func (p *TargetPolicy) HasExplicitAllowlist() bool {
	return p != nil && len(p.allowed) > 0
}

// Check returns ErrTargetNotAllowed when addr may not be dialed.
func (p *TargetPolicy) Check(addr netip.Addr) error {
	if p == nil {
		return nil
	}

	addr = addr.Unmap().WithZone("")
	if !addr.IsValid() {
		return fmt.Errorf("%w: invalid resolved address", ErrTargetNotAllowed)
	}

	if prefixContains(p.denied, addr) {
		return fmt.Errorf("%w: %s matches an operator deny rule", ErrTargetNotAllowed, addr)
	}

	if len(p.allowed) > 0 {
		if prefixContains(p.allowed, addr) {
			return nil
		}

		return fmt.Errorf("%w: %s is outside the operator allowlist", ErrTargetNotAllowed, addr)
	}

	if prefixContains(defaultBlockedTargetPrefixes, addr) {
		return fmt.Errorf("%w: %s is host-local", ErrTargetNotAllowed, addr)
	}

	return nil
}

func parseTargetPrefixes(field string, rawPrefixes []string) ([]netip.Prefix, error) {
	prefixes := make([]netip.Prefix, 0, len(rawPrefixes))
	for i, raw := range rawPrefixes {
		prefix, err := netip.ParsePrefix(raw)
		if err != nil {
			return nil, fmt.Errorf("%s[%d]: %q is not a valid CIDR", field, i, raw)
		}

		prefixes = append(prefixes, normalizeTargetPrefix(prefix))
	}

	return prefixes, nil
}

func normalizeTargetPrefix(prefix netip.Prefix) netip.Prefix {
	addr := prefix.Addr()
	if addr.Is4In6() {
		return netip.PrefixFrom(addr.Unmap(), max(prefix.Bits()-96, 0)).Masked()
	}

	return prefix.Masked()
}

func prefixContains(prefixes []netip.Prefix, addr netip.Addr) bool {
	for _, prefix := range prefixes {
		if prefix.Contains(addr) {
			return true
		}
	}

	return false
}

func applyTargetPolicy(cfg *pgx.ConnConfig, policy *TargetPolicy) {
	if policy == nil {
		return
	}

	dial := cfg.DialFunc
	cfg.DialFunc = func(ctx context.Context, network, address string) (net.Conn, error) {
		if network != "tcp" && network != "tcp4" && network != "tcp6" {
			return nil, fmt.Errorf("%w: network %q is unsupported", ErrTargetNotAllowed, network)
		}

		host, _, err := net.SplitHostPort(address)
		if err != nil {
			return nil, fmt.Errorf("%w: invalid resolved socket address", ErrTargetNotAllowed)
		}

		addr, err := netip.ParseAddr(host)
		if err != nil {
			return nil, fmt.Errorf("%w: resolved host is not an IP address", ErrTargetNotAllowed)
		}

		if err := policy.Check(addr); err != nil {
			return nil, err
		}

		return dial(ctx, network, address)
	}
}
