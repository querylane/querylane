package rpctest

import (
	"context"
	"time"

	"connectrpc.com/connect"

	consolev1alpha1 "github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1"
	"github.com/querylane/querylane/backend/resource"
)

func (s *RPCSuite) TestHierarchyNotFound_ResourceSelection() {
	missingInstance := "instances/nonexistent"
	missingDatabase := s.instanceName() + "/databases/nonexistent_db"
	missingSchema := s.databaseName() + "/schemas/nonexistent_schema"

	tests := []struct {
		name     string
		call     func(ctx context.Context) error
		wantType resource.Type
		wantName string
	}{
		{
			name: "ListSchemas/InstanceNotFound",
			call: func(ctx context.Context) error {
				_, err := s.schemaClient.ListSchemas(ctx, connect.NewRequest(&consolev1alpha1.ListSchemasRequest{
					Parent: missingInstance + "/databases/" + externalDBName,
				}))

				return err
			},
			wantType: resource.TypeInstance,
			wantName: missingInstance,
		},
		{
			name: "ListSchemas/DatabaseNotFound",
			call: func(ctx context.Context) error {
				_, err := s.schemaClient.ListSchemas(ctx, connect.NewRequest(&consolev1alpha1.ListSchemasRequest{
					Parent: missingDatabase,
				}))

				return err
			},
			wantType: resource.TypeDatabase,
			wantName: missingDatabase,
		},
		{
			name: "GetSchema/DatabaseNotFound",
			call: func(ctx context.Context) error {
				_, err := s.schemaClient.GetSchema(ctx, connect.NewRequest(&consolev1alpha1.GetSchemaRequest{
					Name: missingDatabase + "/schemas/public",
				}))

				return err
			},
			wantType: resource.TypeDatabase,
			wantName: missingDatabase,
		},
		{
			name: "ListTables/DatabaseNotFound",
			call: func(ctx context.Context) error {
				_, err := s.tableClient.ListTables(ctx, connect.NewRequest(&consolev1alpha1.ListTablesRequest{
					Parent: missingDatabase + "/schemas/public",
				}))

				return err
			},
			wantType: resource.TypeDatabase,
			wantName: missingDatabase,
		},
		{
			name: "ListTables/SchemaNotFound",
			call: func(ctx context.Context) error {
				_, err := s.tableClient.ListTables(ctx, connect.NewRequest(&consolev1alpha1.ListTablesRequest{
					Parent: missingSchema,
				}))

				return err
			},
			wantType: resource.TypeSchema,
			wantName: missingSchema,
		},
		{
			name: "GetTable/SchemaNotFound",
			call: func(ctx context.Context) error {
				_, err := s.tableClient.GetTable(ctx, connect.NewRequest(&consolev1alpha1.GetTableRequest{
					Name: missingSchema + "/tables/customers",
				}))

				return err
			},
			wantType: resource.TypeSchema,
			wantName: missingSchema,
		},
		{
			name: "ListTableColumns/SchemaNotFound",
			call: func(ctx context.Context) error {
				_, err := s.tableClient.ListTableColumns(ctx, connect.NewRequest(&consolev1alpha1.ListTableColumnsRequest{
					Parent: missingSchema + "/tables/customers",
				}))

				return err
			},
			wantType: resource.TypeSchema,
			wantName: missingSchema,
		},
		{
			name: "ListTableConstraints/SchemaNotFound",
			call: func(ctx context.Context) error {
				_, err := s.tableClient.ListTableConstraints(ctx, connect.NewRequest(&consolev1alpha1.ListTableConstraintsRequest{
					Parent: missingSchema + "/tables/customers",
				}))

				return err
			},
			wantType: resource.TypeSchema,
			wantName: missingSchema,
		},
		{
			name: "ListViews/DatabaseNotFound",
			call: func(ctx context.Context) error {
				_, err := s.viewClient.ListViews(ctx, connect.NewRequest(&consolev1alpha1.ListViewsRequest{
					Parent: missingDatabase + "/schemas/sales",
				}))

				return err
			},
			wantType: resource.TypeDatabase,
			wantName: missingDatabase,
		},
		{
			name: "GetView/SchemaNotFound",
			call: func(ctx context.Context) error {
				_, err := s.viewClient.GetView(ctx, connect.NewRequest(&consolev1alpha1.GetViewRequest{
					Name: missingSchema + "/views/customer_orders",
				}))

				return err
			},
			wantType: resource.TypeSchema,
			wantName: missingSchema,
		},
		{
			name: "ReadRows/DatabaseNotFound",
			call: func(ctx context.Context) error {
				_, err := s.tableDataClient.ReadRows(ctx, connect.NewRequest(&consolev1alpha1.ReadRowsRequest{
					Name: missingDatabase + "/schemas/public/tables/customers",
				}))

				return err
			},
			wantType: resource.TypeDatabase,
			wantName: missingDatabase,
		},
		{
			name: "ReadRows/SchemaNotFound",
			call: func(ctx context.Context) error {
				_, err := s.tableDataClient.ReadRows(ctx, connect.NewRequest(&consolev1alpha1.ReadRowsRequest{
					Name: missingSchema + "/tables/customers",
				}))

				return err
			},
			wantType: resource.TypeSchema,
			wantName: missingSchema,
		},
		{
			name: "ExecuteQuery/InstanceNotFound",
			call: func(ctx context.Context) error {
				return s.executeQueryErr(ctx, missingInstance+"/databases/"+externalDBName, "SELECT 1")
			},
			wantType: resource.TypeInstance,
			wantName: missingInstance,
		},
		{
			name: "ExplainQuery/DatabaseNotFound",
			call: func(ctx context.Context) error {
				_, err := s.sqlClient.ExplainQuery(ctx, connect.NewRequest(&consolev1alpha1.ExplainQueryRequest{
					Parent:    missingDatabase,
					Statement: "SELECT 1",
				}))

				return err
			},
			wantType: resource.TypeDatabase,
			wantName: missingDatabase,
		},
	}

	for _, tt := range tests {
		s.Run(tt.name, func() {
			ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
			defer cancel()

			err := tt.call(ctx)
			s.Require().Error(err)
			s.requireNotFoundResource(err, tt.wantType, tt.wantName)
		})
	}
}

func (s *RPCSuite) executeQueryErr(ctx context.Context, parent, statement string) error {
	stream, err := s.sqlClient.ExecuteQuery(ctx, connect.NewRequest(&consolev1alpha1.ExecuteQueryRequest{
		Parent:    parent,
		Statement: statement,
	}))
	if err != nil {
		return err
	}

	for stream.Receive() {
	}

	return stream.Err()
}
