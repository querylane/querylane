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
	v1alpha1 "github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1"
	"github.com/querylane/querylane/backend/resource"
)

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

			svc := NewService(tt.catalog)

			_, err := svc.GetTablePartitionMetadata(context.Background(), connect.NewRequest(&v1alpha1.GetTablePartitionMetadataRequest{
				Name: "instances/prod/databases/app/schemas/public/tables/events",
			}))
			require.Error(t, err)
			require.Equal(t, tt.wantCode, connect.CodeOf(err))
		})
	}
}

type partitionMetadataCatalogStub struct {
	partitionMetadata *engine.TablePartitionMetadata
	partitionErr      error
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

func (partitionMetadataCatalogStub) ListTablePolicies(context.Context, resource.TableName) ([]engine.TablePolicy, error) {
	return nil, nil
}

func (partitionMetadataCatalogStub) ListTableTriggers(context.Context, resource.TableName) ([]engine.TableTrigger, error) {
	return nil, nil
}
