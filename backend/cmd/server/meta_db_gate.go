package server

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	"connectrpc.com/connect"
	gocache "github.com/twmb/go-cache/cache"

	"github.com/querylane/querylane/backend/connectrpc/apierrors"
)

const (
	metaDBGateCacheKey = "meta-db"
	metaDBGateTTL      = 2 * time.Second
	metaDBPingTimeout  = 2 * time.Second
)

type metaDBAvailabilityChecker interface {
	EnsureAvailable(ctx context.Context) error
}

type metaDBGate struct {
	db      *sql.DB
	cache   *gocache.Cache[string, struct{}]
	timeout time.Duration
}

func newMetaDBGate(db *sql.DB) *metaDBGate {
	return &metaDBGate{
		db: db,
		cache: gocache.New[string, struct{}](
			gocache.MaxAge(metaDBGateTTL),
			gocache.MaxErrorAge(metaDBGateTTL),
		),
		timeout: metaDBPingTimeout,
	}
}

func (g *metaDBGate) EnsureAvailable(ctx context.Context) error {
	if g == nil || g.db == nil {
		return apierrors.NewDatabaseUnavailable(nil)
	}

	_, err, _ := g.cache.Get(metaDBGateCacheKey, func() (struct{}, error) {
		pingCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), g.timeout)
		defer cancel()

		if err := g.db.PingContext(pingCtx); err != nil {
			return struct{}{}, fmt.Errorf("ping application database: %w", err)
		}

		return struct{}{}, nil
	})
	if err != nil {
		return apierrors.NewDatabaseUnavailable(err)
	}

	return nil
}

type metaDBAvailabilityInterceptor struct {
	checker metaDBAvailabilityChecker
}

func (i *metaDBAvailabilityInterceptor) WrapUnary(next connect.UnaryFunc) connect.UnaryFunc {
	return func(ctx context.Context, req connect.AnyRequest) (connect.AnyResponse, error) {
		if err := i.checker.EnsureAvailable(ctx); err != nil {
			return nil, err
		}

		return next(ctx, req)
	}
}

func (i *metaDBAvailabilityInterceptor) WrapStreamingClient(next connect.StreamingClientFunc) connect.StreamingClientFunc {
	return next
}

func (i *metaDBAvailabilityInterceptor) WrapStreamingHandler(next connect.StreamingHandlerFunc) connect.StreamingHandlerFunc {
	return func(ctx context.Context, conn connect.StreamingHandlerConn) error {
		if err := i.checker.EnsureAvailable(ctx); err != nil {
			return err
		}

		return next(ctx, conn)
	}
}

func newMetaDBAvailabilityInterceptor(checker metaDBAvailabilityChecker) connect.Interceptor {
	return &metaDBAvailabilityInterceptor{checker: checker}
}
