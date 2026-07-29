package server

import (
	"context"
	"fmt"

	"connectrpc.com/connect"

	serverconfig "github.com/querylane/querylane/backend/config/server"
	"github.com/querylane/querylane/backend/connectrpc/apierrors"
	"github.com/querylane/querylane/backend/engine"
	"github.com/querylane/querylane/backend/engine/postgres"
	consolev1alpha1connect "github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1/consolev1alpha1connect"
	instancesvc "github.com/querylane/querylane/backend/service/instance"
)

func newBootstrapInstanceService(cfg *serverconfig.Config) (*instancesvc.Service, error) {
	limits := cfg.Limits
	limits.SetDefaults()

	targetPolicy, err := engine.NewTargetPolicy(
		cfg.InstanceTargets.AllowedCIDRs,
		cfg.InstanceTargets.DeniedCIDRs,
	)
	if err != nil {
		return nil, fmt.Errorf("configure bootstrap connection target policy: %w", err)
	}

	connectionTestGuard, err := instancesvc.NewConnectionTestGuard(
		limits.ConnectionTests.PerCallerPerMinute,
		limits.ConnectionTests.Burst,
		targetPolicy.HasExplicitAllowlist(),
	)
	if err != nil {
		return nil, fmt.Errorf("configure bootstrap connection test guard: %w", err)
	}

	tokenCodec, err := engine.NewRandomTokenCodec()
	if err != nil {
		return nil, fmt.Errorf("configure bootstrap PostgreSQL driver: %w", err)
	}

	connectionManager := engine.NewManager(
		poolConfigFromLimits(limits.PostgresPool),
		postgres.New(tokenCodec),
		targetPolicy,
	)

	return instancesvc.NewService(
		nil,
		nil,
		nil,
		connectionManager,
		nil,
		nil,
		false,
		connectionTestGuard,
	), nil
}

type bootstrapInstanceInterceptor struct{}

func (bootstrapInstanceInterceptor) WrapUnary(next connect.UnaryFunc) connect.UnaryFunc {
	return func(ctx context.Context, req connect.AnyRequest) (connect.AnyResponse, error) {
		if req.Spec().Procedure != consolev1alpha1connect.InstanceServiceTestInstanceConnectionProcedure {
			return nil, apierrors.NewDatabaseRequired()
		}

		return next(ctx, req)
	}
}

func (bootstrapInstanceInterceptor) WrapStreamingClient(next connect.StreamingClientFunc) connect.StreamingClientFunc {
	return next
}

func (bootstrapInstanceInterceptor) WrapStreamingHandler(_ connect.StreamingHandlerFunc) connect.StreamingHandlerFunc {
	return func(_ context.Context, _ connect.StreamingHandlerConn) error {
		return apierrors.NewDatabaseRequired()
	}
}
