package storage

import (
	"context"
	"fmt"
	"maps"
	"slices"

	"google.golang.org/protobuf/types/known/timestamppb"

	api "github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1"
)

// OverlayInstanceReader composes instance definitions with shared runtime state.
type OverlayInstanceReader struct {
	definitions InstanceReader
	runtime     InstanceRuntimeStateReader
}

// NewOverlayInstanceReader creates a read path that overlays runtime state onto instance definitions.
func NewOverlayInstanceReader(definitions InstanceReader, runtime InstanceRuntimeStateReader) *OverlayInstanceReader {
	return &OverlayInstanceReader{
		definitions: definitions,
		runtime:     runtime,
	}
}

// GetInstance returns one instance with runtime state overlaid when present.
func (r *OverlayInstanceReader) GetInstance(ctx context.Context, name string) (*api.Instance, error) {
	instance, err := r.definitions.GetInstance(ctx, name)
	if err != nil {
		return nil, err
	}

	if err := r.applyRuntimeState(ctx, []*api.Instance{instance}); err != nil {
		return nil, err
	}

	return instance, nil
}

// ListInstances returns instances with runtime state overlaid when present.
func (r *OverlayInstanceReader) ListInstances(ctx context.Context, pageSize int32, pageToken string, filter string, orderBy string) ([]*api.Instance, string, error) {
	instances, nextPageToken, err := r.definitions.ListInstances(ctx, pageSize, pageToken, filter, orderBy)
	if err != nil {
		return nil, "", err
	}

	if err := r.applyRuntimeState(ctx, instances); err != nil {
		return nil, "", err
	}

	return instances, nextPageToken, nil
}

func (r *OverlayInstanceReader) applyRuntimeState(ctx context.Context, instances []*api.Instance) error {
	if r.runtime == nil || len(instances) == 0 {
		return nil
	}

	byID := make(map[string]*api.Instance, len(instances))

	for _, instance := range instances {
		id, err := extractInstanceIDFromName(instance.GetName())
		if err != nil {
			return fmt.Errorf("extract instance id: %w", err)
		}

		byID[id] = instance
	}

	ids := slices.Collect(maps.Keys(byID))

	runtimeStates, err := r.runtime.ListInstanceRuntimeStates(ctx, ids)
	if err != nil {
		return err
	}

	for id, state := range runtimeStates {
		if instance, ok := byID[id]; ok {
			overlayInstanceRuntimeState(instance, state)
		}
	}

	return nil
}

func overlayInstanceRuntimeState(instance *api.Instance, runtimeState InstanceRuntimeState) {
	if instance == nil {
		return
	}

	instance.ConnectionState = connectionStateFromStorage(runtimeState.ConnectionState)
	if runtimeState.ConnectionError != nil {
		instance.ConnectionError = *runtimeState.ConnectionError
	} else {
		instance.ConnectionError = ""
	}

	if runtimeState.ConnectionCheckedAt != nil {
		instance.LastConnectionCheckTime = timestamppb.New(*runtimeState.ConnectionCheckedAt)
	} else {
		instance.LastConnectionCheckTime = nil
	}
}

var _ InstanceReader = (*OverlayInstanceReader)(nil)
