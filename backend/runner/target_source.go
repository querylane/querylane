package runner

import (
	"context"
	"fmt"

	"github.com/querylane/querylane/backend/storage"
)

const listInstancesPageSize int32 = 1000

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
	var (
		targets   []string
		pageToken string
	)

	for {
		instances, nextPageToken, err := s.instances.ListInstances(ctx, listInstancesPageSize, pageToken, "", "")
		if err != nil {
			return nil, fmt.Errorf("list instances: %w", err)
		}

		for _, instance := range instances {
			targets = append(targets, instance.GetName())
		}

		if nextPageToken == "" {
			return targets, nil
		}

		pageToken = nextPageToken
	}
}
