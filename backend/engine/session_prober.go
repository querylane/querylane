package engine

import "context"

// The probe surface of the sessions. It lives on the same structs — a prober
// is just a view over the session's pooled connection state, so a separate
// type would duplicate the fields and lifecycle — but in its own file and
// behind its own interfaces (InstanceProber/DatabaseProber) so the UI-facing
// session surface never grows when probes are added. New probe methods go
// here.

// Prober returns the session itself: the probe methods live on the same
// struct, and this indirection keeps them out of the InstanceSession
// interface so UI-facing consumers never depend on the probe surface.
func (s *instanceSession) Prober() InstanceProber { return s }

func (s *instanceSession) GetServerVersionNum(ctx context.Context) (int32, error) {
	return s.probeDriver.GetServerVersionNum(ctx, s.db)
}

func (s *instanceSession) GetConnectionMetrics(ctx context.Context) (*ConnectionMetrics, error) {
	return s.probeDriver.GetConnectionMetrics(ctx, s.db)
}

func (s *instanceSession) GetCacheCounters(ctx context.Context) (*CacheCounters, error) {
	return s.probeDriver.GetCacheCounters(ctx, s.db)
}

func (s *instanceSession) ListDatabaseSizes(ctx context.Context) ([]DatabaseSize, error) {
	return s.probeDriver.ListDatabaseSizes(ctx, s.db)
}

func (s *instanceSession) GetIOCounters(ctx context.Context) (*IOCounters, error) {
	return s.probeDriver.GetIOCounters(ctx, s.db)
}

func (s *instanceSession) OpenEphemeralDatabase(ctx context.Context, databaseName string) (DatabaseSession, error) {
	db, closeDB, err := s.pool.openEphemeralDatabasePool(ctx, s.cfg, databaseName)
	if err != nil {
		return nil, err
	}

	return s.newDatabaseSession(db, closeDB), nil
}

// Prober returns the session itself; see instanceSession.Prober.
func (s *databaseSession) Prober() DatabaseProber { return s }

func (s *databaseSession) GetVacuumCounters(ctx context.Context) (*VacuumCounters, error) {
	return s.probeDriver.GetVacuumCounters(ctx, s.db)
}
