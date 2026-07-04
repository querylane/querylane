package engine

import (
	"context"
	"errors"
	"fmt"
	"os"

	api "github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1"
)

// SecretResolver resolves configured secret references to their secret values.
// Implementations can back this with environment variables, Vault, or cloud
// secret managers. Resolved values must never be persisted.
type SecretResolver interface {
	ResolveSecret(ctx context.Context, source *api.SecretSource) (string, error)
}

// LocalSecretResolver supports inline and env-backed secrets. External refs are
// intentionally unsupported until a provider is wired in.
type LocalSecretResolver struct{}

func (LocalSecretResolver) ResolveSecret(_ context.Context, source *api.SecretSource) (string, error) {
	if source == nil {
		return "", errors.New("secret source is required")
	}

	switch s := source.GetSource().(type) {
	case *api.SecretSource_Inline:
		if s.Inline == "" {
			return "", errors.New("inline secret is empty")
		}

		return s.Inline, nil
	case *api.SecretSource_Env:
		if s.Env == "" {
			return "", errors.New("secret environment variable name is empty")
		}

		value, ok := os.LookupEnv(s.Env)
		if !ok {
			return "", fmt.Errorf("secret environment variable %q is not set", s.Env)
		}

		if value == "" {
			return "", fmt.Errorf("secret environment variable %q is set but empty", s.Env)
		}

		return value, nil
	case *api.SecretSource_Ref:
		return "", fmt.Errorf("secret ref %q uses an unsupported provider", s.Ref)
	default:
		return "", errors.New("secret source is required")
	}
}
