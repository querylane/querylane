package instance

import (
	"context"
	"time"

	gocache "github.com/twmb/go-cache/cache"

	"github.com/querylane/querylane/backend/engine"
	"github.com/querylane/querylane/backend/resource"
)

// instanceSessionOpener opens a session to a user-managed instance.
type instanceSessionOpener interface {
	OpenInstance(ctx context.Context, instanceName resource.InstanceName) (engine.InstanceSession, error)
}

// OverviewProvider fetches live health signals for PostgreSQL instances,
// with a short TTL cache to coalesce concurrent requests.
type OverviewProvider struct {
	sessions    instanceSessionOpener
	cache       *gocache.Cache[string, engine.InstanceOverview]
	health      *gocache.Cache[string, engine.InstanceHealth]
	activity    *gocache.Cache[string, engine.InstanceHealth]
	fillTimeout time.Duration
}

// NewOverviewProvider creates an OverviewProvider with a 1-second TTL cache.
func NewOverviewProvider(sessions instanceSessionOpener) *OverviewProvider {
	return &OverviewProvider{
		sessions: sessions,
		cache: gocache.New[string, engine.InstanceOverview](
			gocache.MaxAge(time.Second),
			gocache.MaxErrorAge(time.Second),
		),
		health: gocache.New[string, engine.InstanceHealth](
			gocache.MaxAge(time.Second),
			gocache.MaxErrorAge(time.Second),
		),
		activity: gocache.New[string, engine.InstanceHealth](
			gocache.MaxAge(time.Second),
			gocache.MaxErrorAge(time.Second),
		),
		fillTimeout: 15 * time.Second,
	}
}

// GetInstanceOverview returns cached or live instance health signals.
// Concurrent callers for the same instance are coalesced into a single query.
func (p *OverviewProvider) GetInstanceOverview(ctx context.Context, instance resource.InstanceName) (*engine.InstanceOverview, error) {
	// The fill result serves every coalesced and near-future caller, so it
	// must not inherit the first caller's cancellation: a canceled request
	// would poison the shared cache entry for the error TTL. Detach the fill
	// from the caller's lifetime while keeping its values (trace/log context).
	overview, err, _ := p.cache.Get(instance.String(), func() (engine.InstanceOverview, error) {
		fillCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), p.fillTimeout)
		defer cancel()

		session, err := p.sessions.OpenInstance(fillCtx, instance)
		if err != nil {
			return engine.InstanceOverview{}, err
		}
		defer session.Close()

		result, err := session.GetInstanceOverview(fillCtx)
		if err != nil {
			return engine.InstanceOverview{}, err
		}

		return *result, nil
	})
	if err != nil {
		return nil, err
	}

	return &overview, nil
}

// CheckInstanceHealth returns cached or live actionable instance health checks.
// Concurrent callers for the same instance are coalesced into a single query.
func (p *OverviewProvider) CheckInstanceHealth(ctx context.Context, instance resource.InstanceName) (*engine.InstanceHealth, error) {
	health, err, _ := p.health.Get(instance.String(), func() (engine.InstanceHealth, error) {
		fillCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), p.fillTimeout)
		defer cancel()

		session, err := p.sessions.OpenInstance(fillCtx, instance)
		if err != nil {
			return engine.InstanceHealth{}, err
		}
		defer session.Close()

		result, err := session.CheckInstanceHealth(fillCtx)
		if err != nil {
			return engine.InstanceHealth{}, err
		}

		return *result, nil
	})
	if err != nil {
		return nil, err
	}

	return &health, nil
}

// CheckInstanceActivity returns cached or live connection activity only.
// Concurrent callers for the same instance are coalesced into a single query.
func (p *OverviewProvider) CheckInstanceActivity(ctx context.Context, instance resource.InstanceName) (*engine.InstanceHealth, error) {
	activity, err, _ := p.activity.Get(instance.String(), func() (engine.InstanceHealth, error) {
		fillCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), p.fillTimeout)
		defer cancel()

		session, err := p.sessions.OpenInstance(fillCtx, instance)
		if err != nil {
			return engine.InstanceHealth{}, err
		}
		defer session.Close()

		result, err := session.CheckInstanceActivity(fillCtx)
		if err != nil {
			return engine.InstanceHealth{}, err
		}

		return *result, nil
	})
	if err != nil {
		return nil, err
	}

	return &activity, nil
}
