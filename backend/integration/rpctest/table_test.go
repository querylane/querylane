package rpctest

import (
	"context"
	"time"

	"connectrpc.com/connect"

	consolev1alpha1 "github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1"
	"github.com/querylane/querylane/backend/resource"
)

func (s *RPCSuite) TestListTables_PublicSchema() {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	resp, err := s.tableClient.ListTables(ctx, connect.NewRequest(&consolev1alpha1.ListTablesRequest{
		Parent: s.schemaName("public"),
	}))
	s.Require().NoError(err)

	names := make(map[string]bool)
	for _, tbl := range resp.Msg.GetTables() {
		names[tbl.GetDisplayName()] = true
	}

	s.True(names["customers"], "should contain customers table")
	s.True(names["products"], "should contain products table")
}

func (s *RPCSuite) TestListTables_SalesSchema() {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	resp, err := s.tableClient.ListTables(ctx, connect.NewRequest(&consolev1alpha1.ListTablesRequest{
		Parent: s.schemaName("sales"),
	}))
	s.Require().NoError(err)

	names := make(map[string]bool)
	for _, tbl := range resp.Msg.GetTables() {
		names[tbl.GetDisplayName()] = true
	}

	s.True(names["orders"], "should contain orders table")
	s.True(names["order_items"], "should contain order_items table")
}

func (s *RPCSuite) TestGetTable_Success() {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	resp, err := s.tableClient.GetTable(ctx, connect.NewRequest(&consolev1alpha1.GetTableRequest{
		Name: s.tableName("public", "customers"),
	}))
	s.Require().NoError(err)
	s.Equal("customers", resp.Msg.GetTable().GetDisplayName())
}

func (s *RPCSuite) TestGetTablePartitionMetadata() {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	parent, err := s.tableClient.GetTablePartitionMetadata(ctx, connect.NewRequest(&consolev1alpha1.GetTablePartitionMetadataRequest{
		Name: s.tableName("analytics", "events"),
	}))
	s.Require().NoError(err)

	parentMetadata := parent.Msg.GetPartitionMetadata()
	s.Equal("RANGE (occurred_at)", parentMetadata.GetPartitionKey())
	s.Equal(int32(2), parentMetadata.GetPartitionCount())
	s.Require().Len(parentMetadata.GetChildPartitions(), 2)
	s.Equal(s.tableName("analytics", "events_2024"), parentMetadata.GetChildPartitions()[0].GetTable())
	s.Contains(parentMetadata.GetChildPartitions()[0].GetPartitionBound(), "FOR VALUES FROM ('2024-01-01')")

	child, err := s.tableClient.GetTablePartitionMetadata(ctx, connect.NewRequest(&consolev1alpha1.GetTablePartitionMetadataRequest{
		Name: s.tableName("analytics", "events_2024"),
	}))
	s.Require().NoError(err)

	childMetadata := child.Msg.GetPartitionMetadata()
	s.Equal(s.tableName("analytics", "events"), childMetadata.GetParentTable())
	s.Contains(childMetadata.GetPartitionBound(), "FOR VALUES FROM ('2024-01-01')")
	s.Empty(childMetadata.GetChildPartitions())

	ordinary, err := s.tableClient.GetTablePartitionMetadata(ctx, connect.NewRequest(&consolev1alpha1.GetTablePartitionMetadataRequest{
		Name: s.tableName("public", "customers"),
	}))
	s.Require().NoError(err)
	s.Empty(ordinary.Msg.GetPartitionMetadata().GetPartitionKey())
	s.Empty(ordinary.Msg.GetPartitionMetadata().GetParentTable())
	s.Empty(ordinary.Msg.GetPartitionMetadata().GetChildPartitions())
}

func (s *RPCSuite) TestGetTable_NotFound() {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	_, err := s.tableClient.GetTable(ctx, connect.NewRequest(&consolev1alpha1.GetTableRequest{
		Name: s.tableName("public", "nonexistent_table"),
	}))
	s.Require().Error(err)
	s.requireNotFoundResource(err, resource.TypeTable, s.tableName("public", "nonexistent_table"))
}

func (s *RPCSuite) TestListTableConstraints_Orders() {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	resp, err := s.tableClient.ListTableConstraints(ctx, connect.NewRequest(&consolev1alpha1.ListTableConstraintsRequest{
		Parent: s.tableName("sales", "orders"),
	}))
	s.Require().NoError(err)

	hasPK := false
	hasFK := false
	hasCheck := false

	for _, c := range resp.Msg.GetConstraints() {
		//exhaustive:ignore
		switch c.GetType() {
		case consolev1alpha1.ConstraintType_CONSTRAINT_TYPE_PRIMARY_KEY:
			hasPK = true
		case consolev1alpha1.ConstraintType_CONSTRAINT_TYPE_FOREIGN_KEY:
			hasFK = true

			s.Contains(c.GetReferencedTable(), "/tables/customers", "FK should reference customers table")
		case consolev1alpha1.ConstraintType_CONSTRAINT_TYPE_CHECK:
			hasCheck = true
		}
	}

	s.True(hasPK, "should have a PRIMARY KEY constraint")
	s.True(hasFK, "should have a FOREIGN KEY constraint")
	s.True(hasCheck, "should have a CHECK constraint")
}

func (s *RPCSuite) TestListTableIndexes_Orders() {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	resp, err := s.tableClient.ListTableIndexes(ctx, connect.NewRequest(&consolev1alpha1.ListTableIndexesRequest{
		Parent: s.tableName("sales", "orders"),
	}))
	s.Require().NoError(err)

	byName := make(map[string]*consolev1alpha1.TableIndex)
	for _, idx := range resp.Msg.GetIndexes() {
		byName[idx.GetIndexName()] = idx
	}

	idx, ok := byName["idx_orders_customer_id"]
	s.Require().True(ok, "should have idx_orders_customer_id index")
	s.Equal("btree", idx.GetMethod())
	s.Contains(idx.GetKeyColumns(), "customer_id")
	s.Contains(idx.GetKeyParts(), "customer_id")
	s.True(idx.GetIsValid())
	s.Contains(idx.GetDefinition(), "CREATE INDEX")
	s.True(idx.GetHasUsageStats())
}

func (s *RPCSuite) TestListTablePolicies_Orders() {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	resp, err := s.tableClient.ListTablePolicies(ctx, connect.NewRequest(&consolev1alpha1.ListTablePoliciesRequest{
		Parent: s.tableName("sales", "orders"),
	}))
	s.Require().NoError(err)

	byName := make(map[string]*consolev1alpha1.TablePolicy)
	for _, p := range resp.Msg.GetPolicies() {
		byName[p.GetPolicyName()] = p
	}

	pol, ok := byName["orders_select_policy"]
	s.Require().True(ok, "should have orders_select_policy")
	s.Equal(consolev1alpha1.PolicyMode_POLICY_MODE_PERMISSIVE, pol.GetMode())
	s.Equal(consolev1alpha1.PolicyCommand_POLICY_COMMAND_SELECT, pol.GetCommand())
}

func (s *RPCSuite) TestListTableTriggers_Orders() {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	resp, err := s.tableClient.ListTableTriggers(ctx, connect.NewRequest(&consolev1alpha1.ListTableTriggersRequest{
		Parent: s.tableName("sales", "orders"),
	}))
	s.Require().NoError(err)

	byName := make(map[string]*consolev1alpha1.TableTrigger)
	for _, tr := range resp.Msg.GetTriggers() {
		byName[tr.GetTriggerName()] = tr
	}

	trg, ok := byName["trg_orders_updated_at"]
	s.Require().True(ok, "should have trg_orders_updated_at trigger")
	s.Equal("BEFORE", trg.GetTiming())
	s.Contains(trg.GetEvents(), "UPDATE")
}

func (s *RPCSuite) TestSubCollectionRPCs_NotFoundForMissingTable() {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	missingTable := s.tableName("public", "nonexistent_table")

	rpcs := []struct {
		name string
		call func() error
	}{
		{"ListTableConstraints", func() error {
			_, err := s.tableClient.ListTableConstraints(ctx, connect.NewRequest(&consolev1alpha1.ListTableConstraintsRequest{Parent: missingTable}))
			return err
		}},
		{"ListTableIndexes", func() error {
			_, err := s.tableClient.ListTableIndexes(ctx, connect.NewRequest(&consolev1alpha1.ListTableIndexesRequest{Parent: missingTable}))
			return err
		}},
		{"ListTablePolicies", func() error {
			_, err := s.tableClient.ListTablePolicies(ctx, connect.NewRequest(&consolev1alpha1.ListTablePoliciesRequest{Parent: missingTable}))
			return err
		}},
		{"ListTableTriggers", func() error {
			_, err := s.tableClient.ListTableTriggers(ctx, connect.NewRequest(&consolev1alpha1.ListTableTriggersRequest{Parent: missingTable}))
			return err
		}},
	}

	for _, rpc := range rpcs {
		err := rpc.call()
		s.Require().Error(err, "%s should fail for nonexistent table", rpc.name)
		s.requireNotFoundResource(err, resource.TypeTable, missingTable)
	}
}

func (s *RPCSuite) TestListTableColumns_Customers() {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	resp, err := s.tableClient.ListTableColumns(ctx, connect.NewRequest(&consolev1alpha1.ListTableColumnsRequest{
		Parent: s.tableName("public", "customers"),
	}))
	s.Require().NoError(err)

	columns := resp.Msg.GetColumns()
	s.GreaterOrEqual(len(columns), 5, "customers table should have at least 5 columns")

	colNames := make(map[string]bool)
	for _, col := range columns {
		colNames[col.GetColumnName()] = true
	}

	s.True(colNames["id"], "should have id column")
	s.True(colNames["first_name"], "should have first_name column")
	s.True(colNames["last_name"], "should have last_name column")
	s.True(colNames["email"], "should have email column")
	s.True(colNames["is_active"], "should have is_active column")
	s.True(colNames["created_at"], "should have created_at column")
}

func (s *RPCSuite) TestListTableColumns_GeneratedAndIdentityMetadata() {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	resp, err := s.tableClient.ListTableColumns(ctx, connect.NewRequest(&consolev1alpha1.ListTableColumnsRequest{
		Parent: s.tableName("public", "generated_identity_examples"),
	}))
	s.Require().NoError(err)

	columns := make(map[string]*consolev1alpha1.Column, len(resp.Msg.GetColumns()))
	for _, col := range resp.Msg.GetColumns() {
		columns[col.GetColumnName()] = col
	}

	id := columns["id"]
	s.Require().NotNil(id)
	s.True(id.GetIsIdentity(), "id should expose identity metadata through the API")
	s.Equal(consolev1alpha1.IdentityGeneration_IDENTITY_GENERATION_BY_DEFAULT, id.GetIdentityGeneration())

	alwaysID := columns["always_id"]
	s.Require().NotNil(alwaysID)
	s.True(alwaysID.GetIsIdentity(), "always_id should expose identity metadata through the API")
	s.Equal(consolev1alpha1.IdentityGeneration_IDENTITY_GENERATION_ALWAYS, alwaysID.GetIdentityGeneration())

	emailLower := columns["email_lower"]
	s.Require().NotNil(emailLower)
	s.True(emailLower.GetIsGenerated(), "email_lower should expose generated metadata through the API")
	s.Contains(emailLower.GetGenerationExpression(), "lower(email)")
}
