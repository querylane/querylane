package server

import (
	"fmt"
	"net/netip"
)

// InstanceTargetPolicy controls which resolved IP addresses managed
// PostgreSQL connections may dial. An empty allowlist permits addresses other
// than built-in unsafe targets; a nonempty allowlist becomes strict.
type InstanceTargetPolicy struct {
	AllowedCIDRs []string `koanf:"allowed_cidrs"`
	DeniedCIDRs  []string `koanf:"denied_cidrs"`
}

// Validate rejects malformed CIDRs before the server begins opening pools.
func (p InstanceTargetPolicy) Validate() error {
	if err := validateTargetCIDRs("allowed_cidrs", p.AllowedCIDRs); err != nil {
		return err
	}

	return validateTargetCIDRs("denied_cidrs", p.DeniedCIDRs)
}

func validateTargetCIDRs(field string, cidrs []string) error {
	for i, raw := range cidrs {
		if _, err := netip.ParsePrefix(raw); err != nil {
			return fmt.Errorf("%s[%d]: %q is not a valid CIDR", field, i, raw)
		}
	}

	return nil
}
