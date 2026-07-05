package jobs

import (
	"context"
	"fmt"
	"log/slog"

	"github.com/querylane/querylane/backend/aip"
	"github.com/querylane/querylane/backend/engine"
	"github.com/querylane/querylane/backend/resource"
	"github.com/querylane/querylane/backend/storage"
)

const targetListPageSize int32 = 1000

// listAllPages drains a token-paginated list call.
func listAllPages[T any](ctx context.Context, list func(ctx context.Context, pageToken string) ([]T, string, error)) ([]T, error) {
	var all []T

	pageToken := ""

	for {
		items, nextPageToken, err := list(ctx, pageToken)
		if err != nil {
			return nil, err
		}

		all = append(all, items...)

		if nextPageToken == "" {
			return all, nil
		}

		pageToken = nextPageToken
	}
}

// InstanceTargetSource lists all configured instances as runner targets.
type InstanceTargetSource struct {
	instances storage.InstanceReader
}

// NewInstanceTargetSource creates an InstanceTargetSource that discovers targets
// by paginating through all known instances.
func NewInstanceTargetSource(instances storage.InstanceReader) *InstanceTargetSource {
	return &InstanceTargetSource{instances: instances}
}

// ListTargets returns the AIP resource names of all configured instances.
func (s *InstanceTargetSource) ListTargets(ctx context.Context) ([]string, error) {
	names, err := listAllPages(ctx, func(ctx context.Context, pageToken string) ([]string, string, error) {
		instances, nextPageToken, err := s.instances.ListInstances(ctx, targetListPageSize, pageToken, "", "")
		if err != nil {
			return nil, "", err
		}

		names := make([]string, len(instances))
		for i, instance := range instances {
			names[i] = instance.GetName()
		}

		return names, nextPageToken, nil
	})
	if err != nil {
		return nil, fmt.Errorf("list instances: %w", err)
	}

	return names, nil
}

// catalogDatabaseLister lists an instance's databases through the catalog
// read-through cache, syncing from the live instance when the cache is stale
// or empty — so database targets exist even on deployments where no user ever
// browses the catalog. Implemented by *catalogcache.Catalog.
type catalogDatabaseLister interface {
	ListDatabases(ctx context.Context, instance resource.InstanceName, params aip.Params) ([]engine.Database, string, error)
}

// DatabaseTargetSource lists every known user database as a runner target
// ("instances/x/databases/y"). Databases appear or disappear as targets when
// the catalog sync picks them up.
type DatabaseTargetSource struct {
	instances *InstanceTargetSource
	databases catalogDatabaseLister
}

// NewDatabaseTargetSource creates a DatabaseTargetSource fanning out from all
// known instances to their databases.
func NewDatabaseTargetSource(instances *InstanceTargetSource, databases catalogDatabaseLister) *DatabaseTargetSource {
	return &DatabaseTargetSource{instances: instances, databases: databases}
}

// ListTargets returns the AIP resource names of all known non-system
// databases across all instances. An instance whose databases cannot be
// listed (unreachable and never synced, catalog error) is skipped with a
// warning so one broken instance never starves sampling for the rest —
// unless the caller's context is dead, in which case the error propagates
// so shutdown aborts the cycle instead of yielding a partial target list.
func (s *DatabaseTargetSource) ListTargets(ctx context.Context) ([]string, error) {
	instanceTargets, err := s.instances.ListTargets(ctx)
	if err != nil {
		return nil, err
	}

	var targets []string

	for _, instanceTarget := range instanceTargets {
		instanceName, err := resource.ParseInstanceName(instanceTarget)
		if err != nil {
			return nil, fmt.Errorf("parse instance target: %w", err)
		}

		databaseTargets, err := s.listInstanceDatabaseTargets(ctx, instanceName)
		if err != nil {
			// Once our own context is dead every remaining instance fails the
			// same way; propagate so the manager's shutdown branch handles it
			// instead of receiving a partial list with nil error. Checking
			// ctx.Err() (not the error chain) keeps target-local deadline
			// errors — e.g. a catalog sync hitting its own detached
			// SyncTimeout against an unreachable instance — on the skip path.
			if ctx.Err() != nil {
				return nil, fmt.Errorf("list databases for %s: %w", instanceName.InstanceID, err)
			}

			slog.WarnContext(ctx, "database target listing failed for instance; skipping",
				slog.String("instance", instanceName.InstanceID),
				slog.String("error", err.Error()))

			continue
		}

		targets = append(targets, databaseTargets...)
	}

	return targets, nil
}

func (s *DatabaseTargetSource) listInstanceDatabaseTargets(ctx context.Context, instanceName resource.InstanceName) ([]string, error) {
	databases, err := listAllPages(ctx, func(ctx context.Context, pageToken string) ([]engine.Database, string, error) {
		return s.databases.ListDatabases(ctx, instanceName, aip.Params{PageSize: targetListPageSize, PageToken: pageToken})
	})
	if err != nil {
		return nil, fmt.Errorf("list databases: %w", err)
	}

	var targets []string

	for _, database := range databases {
		if database.IsSystemDatabase {
			continue
		}

		targets = append(targets, resource.NewDatabaseName(instanceName.InstanceID, database.Name).String())
	}

	return targets, nil
}
