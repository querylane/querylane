package storage

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	"github.com/go-jet/jet/v2/postgres"

	"github.com/querylane/querylane/backend/aip"
	aipjet "github.com/querylane/querylane/backend/aip/jet"
	"github.com/querylane/querylane/backend/storage/gen/querylane/public/model"
	"github.com/querylane/querylane/backend/storage/gen/querylane/public/table"
)

const (
	// ReplicaHeartbeatInterval is how often each replica upserts its row in
	// the replica registry.
	ReplicaHeartbeatInterval = 15 * time.Second

	// ReplicaLivenessWindow is how long after its last heartbeat a replica
	// is still considered alive. Three missed beats: one lost beat is normal
	// under load, three in a row means the process is gone.
	ReplicaLivenessWindow = 3 * ReplicaHeartbeatInterval

	// ReplicaPruneAge is how long a dead replica's row stays visible before
	// the heartbeat loop deletes it. Long enough that an operator inspecting
	// a recent incident still sees which replica disappeared.
	ReplicaPruneAge = 24 * time.Hour
)

// ReplicaHeartbeat identifies the replica registering itself.
type ReplicaHeartbeat struct {
	// ID is the per-process lease-owner token, so replica rows join against
	// runner_execution_state.lease_owner.
	ID       string
	Hostname string
	PID      int64
}

// PGReplicaStore persists the replica registry in the meta database.
type PGReplicaStore struct {
	db *sql.DB
}

// NewReplicaStore returns a store backed by db.
func NewReplicaStore(db *sql.DB) *PGReplicaStore {
	return &PGReplicaStore{db: db}
}

// UpsertHeartbeat registers the replica or refreshes its last_seen_at.
// Timestamps are written with the database clock so liveness comparisons are
// consistent across replicas with skewed clocks. started_at is preserved on
// conflict: it records when the process began heartbeating, not the last
// beat.
func (s *PGReplicaStore) UpsertHeartbeat(ctx context.Context, hb ReplicaHeartbeat) error {
	now := postgres.NOW()

	stmt := table.Replica.
		INSERT(
			table.Replica.ID,
			table.Replica.Hostname,
			table.Replica.Pid,
			table.Replica.StartedAt,
			table.Replica.LastSeenAt,
		).
		VALUES(
			hb.ID,
			hb.Hostname,
			hb.PID,
			now,
			now,
		).
		ON_CONFLICT(table.Replica.ID).
		DO_UPDATE(
			postgres.SET(
				table.Replica.Hostname.SET(table.Replica.EXCLUDED.Hostname),
				table.Replica.Pid.SET(table.Replica.EXCLUDED.Pid),
				table.Replica.LastSeenAt.SET(table.Replica.EXCLUDED.LastSeenAt),
			),
		)

	if _, err := stmt.ExecContext(ctx, s.db); err != nil {
		return fmt.Errorf("upsert replica heartbeat: %w", err)
	}

	return nil
}

// replicaSchema drives AIP-160 filtering and AIP-132 ordering for
// ListReplicas. replica_id is the primary key, so the default order is a
// unique total order for keyset pagination.
var replicaSchema = aipjet.Bind(
	aip.NewSchema[model.Replica](
		"console.querylane.dev/Replica",
		aip.Fields[model.Replica]{
			"replica_id": {
				Codec:      aip.StringCodec{},
				GetValue:   func(m *model.Replica) any { return m.ID },
				Filterable: true,
			},
			"hostname": {
				Codec:      aip.StringCodec{},
				GetValue:   func(m *model.Replica) any { return m.Hostname },
				Filterable: true,
			},
			"last_seen_at": {
				Codec:    aip.TimestampCodec{},
				GetValue: func(m *model.Replica) any { return m.LastSeenAt },
			},
		},
		aip.WithDefaultOrder("replica_id", aip.Asc),
		aip.WithTieBreaker("replica_id", aip.Asc),
	),
	aipjet.Columns{
		"replica_id":   table.Replica.ID,
		"hostname":     table.Replica.Hostname,
		"last_seen_at": table.Replica.LastSeenAt,
	},
)

// ListReplicas returns a page of registered replicas.
func (s *PGReplicaStore) ListReplicas(ctx context.Context, params aip.Params) ([]model.Replica, string, error) {
	baseQuery := postgres.SELECT(table.Replica.AllColumns).FROM(table.Replica)

	rows, nextPageToken, err := aipjet.Execute(ctx, replicaSchema, params, baseQuery, s.db)
	if err != nil {
		return nil, "", fmt.Errorf("list replicas: %w", err)
	}

	return rows, nextPageToken, nil
}

// GetReplicasByIDs returns the replica rows for the given ids. Missing ids
// are silently absent from the result (the replica died and was pruned).
func (s *PGReplicaStore) GetReplicasByIDs(ctx context.Context, ids []string) ([]model.Replica, error) {
	if len(ids) == 0 {
		return nil, nil
	}

	idExprs := make([]postgres.Expression, 0, len(ids))
	for _, id := range ids {
		idExprs = append(idExprs, postgres.String(id))
	}

	stmt := postgres.SELECT(table.Replica.AllColumns).
		FROM(table.Replica).
		WHERE(table.Replica.ID.IN(idExprs...))

	var rows []model.Replica
	if err := stmt.QueryContext(ctx, s.db, &rows); err != nil {
		return nil, fmt.Errorf("get replicas by ids: %w", err)
	}

	return rows, nil
}

// DatabaseNow returns the meta database's clock. Liveness must be computed
// against the same clock that writes last_seen_at (the DB clock, see
// UpsertHeartbeat); comparing against a client-side time.Now() would
// reintroduce the clock skew the heartbeat writes avoid.
func (s *PGReplicaStore) DatabaseNow(ctx context.Context) (time.Time, error) {
	var now time.Time
	if err := s.db.QueryRowContext(ctx, "SELECT now()").Scan(&now); err != nil {
		return time.Time{}, fmt.Errorf("select database now: %w", err)
	}

	return now, nil
}

// PruneStaleReplicas deletes replica rows whose last heartbeat is older than
// age. The cutoff is computed Postgres-side so all replicas agree on it.
func (s *PGReplicaStore) PruneStaleReplicas(ctx context.Context, age time.Duration) (int64, error) {
	cutoff := postgres.NOW().SUB(postgres.INTERVALd(age))

	stmt := table.Replica.DELETE().
		WHERE(table.Replica.LastSeenAt.LT(cutoff))

	res, err := stmt.ExecContext(ctx, s.db)
	if err != nil {
		return 0, fmt.Errorf("prune stale replicas: %w", err)
	}

	rows, err := res.RowsAffected()
	if err != nil {
		return 0, fmt.Errorf("prune stale replicas rows affected: %w", err)
	}

	return rows, nil
}
