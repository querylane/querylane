package engine

import (
	"context"
	"errors"
	"fmt"

	api "github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1"
	"github.com/querylane/querylane/backend/resource"
	"github.com/querylane/querylane/backend/storage"
)

// SessionResolver resolves instance metadata from the meta database before
// delegating pool lifecycle to Manager.
type SessionResolver struct {
	instanceRepo storage.InstanceRepository
	manager      *Manager
}

// NewSessionResolver creates an instance-name based session opener backed by a
// metadata repository and a pool manager.
func NewSessionResolver(instanceRepo storage.InstanceRepository, manager *Manager) *SessionResolver {
	return &SessionResolver{instanceRepo: instanceRepo, manager: manager}
}

// OpenInstance opens a session against a managed instance by first resolving
// the instance metadata from the meta database.
func (r *SessionResolver) OpenInstance(ctx context.Context, instanceName resource.InstanceName) (InstanceSession, error) {
	instance, err := r.instanceRepo.GetInstance(ctx, instanceName.String())
	if err != nil {
		if errors.Is(err, storage.ErrNotFound) {
			return nil, fmt.Errorf("%w: %s", ErrInstanceNotFound, instanceName)
		}

		return nil, fmt.Errorf("get instance: %w", err)
	}

	if instance.GetCredentialState() != api.Instance_CREDENTIAL_STATE_UNSPECIFIED {
		return nil, fmt.Errorf("%w: %s", storage.ErrUnreadableInstanceCredentials, instanceName)
	}

	return r.manager.OpenInstance(ctx, instanceName, instance)
}

// CheckInstanceConnection probes liveness for a single instance. If a pool is
// already cached, it is validated in place through the health seam, leaving
// in-flight sessions unaffected. The pool is evicted and rebuilt only when that
// validation fails — reserving the destructive path for bad connections.
func (r *SessionResolver) CheckInstanceConnection(ctx context.Context, instanceName resource.InstanceName) error {
	if r.instanceRepo == nil {
		return nil
	}

	cached, err := r.manager.pingCachedPool(ctx, instanceName)
	if cached && err == nil {
		return nil
	}

	if cached {
		r.manager.EvictInstance(instanceName)
	}

	session, err := r.OpenInstance(ctx, instanceName)
	if err != nil {
		return err
	}
	defer session.Close()

	return nil
}

// TestConnection delegates dry-run connection tests to Manager.
func (r *SessionResolver) TestConnection(ctx context.Context, instance *api.Instance) error {
	return r.manager.TestConnection(ctx, instance)
}

// EvictInstance delegates pool eviction to Manager.
func (r *SessionResolver) EvictInstance(instanceName resource.InstanceName) {
	r.manager.EvictInstance(instanceName)
}

// Close closes all pools managed by the underlying Manager.
func (r *SessionResolver) Close() error { return r.manager.Close() }
