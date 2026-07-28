package table

import (
	"context"
	"errors"
	"testing"

	"connectrpc.com/connect"
	"github.com/stretchr/testify/require"

	"github.com/querylane/querylane/backend/aip"
	"github.com/querylane/querylane/backend/catalogcache"
	"github.com/querylane/querylane/backend/engine"
	"github.com/querylane/querylane/backend/livequery"
	v1alpha1 "github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1"
	"github.com/querylane/querylane/backend/resource"
)

func TestMaterializedViewMetadataHonorsLiveQueryLimit(t *testing.T) {
	t.Parallel()

	const parent = "instances/prod/databases/app/schemas/public/views/daily_revenue"

	tests := []struct {
		name string
		call func(context.Context, *Service) error
	}{
		{
			name: "columns",
			call: func(ctx context.Context, service *Service) error {
				_, err := service.ListTableColumns(ctx, connect.NewRequest(&v1alpha1.ListTableColumnsRequest{Parent: parent}))

				return err
			},
		},
		{
			name: "constraints",
			call: func(ctx context.Context, service *Service) error {
				_, err := service.ListTableConstraints(ctx, connect.NewRequest(&v1alpha1.ListTableConstraintsRequest{Parent: parent}))

				return err
			},
		},
		{
			name: "indexes",
			call: func(ctx context.Context, service *Service) error {
				_, err := service.ListTableIndexes(ctx, connect.NewRequest(&v1alpha1.ListTableIndexesRequest{Parent: parent}))

				return err
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			limiter, err := livequery.NewLimiter(1, 1)
			require.NoError(t, err)

			release, err := limiter.Acquire(resource.NewInstanceName("prod"))
			require.NoError(t, err)
			t.Cleanup(release)

			err = tt.call(t.Context(), NewService(partitionMetadataCatalogStub{}, limiter))
			require.Equal(t, connect.CodeResourceExhausted, connect.CodeOf(err))
		})
	}
}

func TestGetTablePartitionMetadataHandlesCatalogResponses(t *testing.T) {
	t.Parallel()

	if !testing.Short() {
		t.Skip("unit test: run with -short")
	}

	tests := []struct {
		name     string
		catalog  partitionMetadataCatalogStub
		wantCode connect.Code
	}{
		{
			name:     "nil metadata",
			catalog:  partitionMetadataCatalogStub{},
			wantCode: connect.CodeInternal,
		},
		{
			name: "catalog error",
			catalog: partitionMetadataCatalogStub{
				partitionErr: engine.ErrTableNotFound,
			},
			wantCode: connect.CodeNotFound,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			svc := NewService(tt.catalog, newTableTestLimiter(t))

			_, err := svc.GetTablePartitionMetadata(context.Background(), connect.NewRequest(&v1alpha1.GetTablePartitionMetadataRequest{
				Name: "instances/prod/databases/app/schemas/public/tables/events",
			}))
			require.Error(t, err)
			require.Equal(t, tt.wantCode, connect.CodeOf(err))
		})
	}
}

func TestGetTablePartitionMetadataMapsPartitionStats(t *testing.T) {
	t.Parallel()

	if !testing.Short() {
		t.Skip("unit test: run with -short")
	}

	svc := NewService(partitionMetadataCatalogStub{
		partitionMetadata: &engine.TablePartitionMetadata{
			ChildPartitions: []engine.TablePartition{
				{
					EstimatedRows:  1_020_000,
					PartitionBound: "FOR VALUES FROM ('2026-01-01') TO ('2026-04-01')",
					SchemaName:     "audit",
					TableName:      "change_log_2026_q1",
					TotalSizeBytes: 960_000_000,
				},
				{
					EstimatedRows:  1_940_000,
					PartitionBound: "DEFAULT",
					SchemaName:     "audit",
					TableName:      "change_log_archive",
					TotalSizeBytes: 1_800_000_000,
				},
			},
			PartitionCount: 2,
			PartitionKey:   "RANGE (recorded_at)",
		},
	}, newTableTestLimiter(t))

	resp, err := svc.GetTablePartitionMetadata(context.Background(), connect.NewRequest(&v1alpha1.GetTablePartitionMetadataRequest{
		Name: "instances/prod/databases/app/schemas/audit/tables/change_log",
	}))
	require.NoError(t, err)

	partitions := resp.Msg.GetPartitionMetadata().GetChildPartitions()
	require.Len(t, partitions, 2)
	require.Equal(t, int64(1_020_000), partitions[0].GetEstimatedRows())
	require.Equal(t, int64(960_000_000), partitions[0].GetSizeBytes())
	require.Equal(t, int64(1_940_000), partitions[1].GetEstimatedRows())
	require.Equal(t, int64(1_800_000_000), partitions[1].GetSizeBytes())
}

type partitionMetadataCatalogStub struct {
	partitionMetadata *engine.TablePartitionMetadata
	partitionErr      error
}

func newTableTestLimiter(t *testing.T) *livequery.Limiter {
	t.Helper()

	limiter, err := livequery.NewLimiter(10, 10)
	require.NoError(t, err)

	return limiter
}

func (partitionMetadataCatalogStub) ListTablesWithSyncMetadata(context.Context, resource.SchemaName, aip.Params) ([]engine.Table, string, catalogcache.CatalogSyncMetadata, error) {
	return nil, "", catalogcache.CatalogSyncMetadata{}, nil
}

func (partitionMetadataCatalogStub) GetTable(context.Context, resource.TableName) (*engine.Table, error) {
	return nil, errors.New("unexpected GetTable call")
}

func (s partitionMetadataCatalogStub) GetTablePartitionMetadata(context.Context, resource.TableName) (*engine.TablePartitionMetadata, error) {
	return s.partitionMetadata, s.partitionErr
}

func (partitionMetadataCatalogStub) ListTableColumns(context.Context, resource.TableName) ([]engine.Column, error) {
	return nil, nil
}

func (partitionMetadataCatalogStub) ListTableConstraints(context.Context, resource.TableName) ([]engine.TableConstraint, error) {
	return nil, nil
}

func (partitionMetadataCatalogStub) ListTableIndexes(context.Context, resource.TableName) ([]engine.TableIndex, error) {
	return nil, nil
}

func (partitionMetadataCatalogStub) ListViewColumns(context.Context, resource.ViewName) ([]engine.Column, error) {
	return nil, nil
}

func (partitionMetadataCatalogStub) ListViewConstraints(context.Context, resource.ViewName) ([]engine.TableConstraint, error) {
	return nil, nil
}

func (partitionMetadataCatalogStub) ListViewIndexes(context.Context, resource.ViewName) ([]engine.TableIndex, error) {
	return nil, nil
}

func (partitionMetadataCatalogStub) ListTablePolicies(context.Context, resource.TableName) ([]engine.TablePolicy, error) {
	return nil, nil
}

func (partitionMetadataCatalogStub) ListTableTriggers(context.Context, resource.TableName) ([]engine.TableTrigger, error) {
	return nil, nil
}
