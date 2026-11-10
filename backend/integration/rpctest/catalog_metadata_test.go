package rpctest

import (
	"context"
	"database/sql"
	"time"

	"connectrpc.com/connect"

	api "github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1"
)

func (s *RPCSuite) TestCatalogPersistsGenerationAndConstraintStates() {
	ctx, cancel := context.WithTimeout(s.T().Context(), 20*time.Second)
	defer cancel()
	db, err := s.pgContainer.ConnectToDatabase(ctx, externalDBName)
	s.Require().NoError(err)
	defer db.Close()
	var version int
	s.Require().NoError(db.QueryRowContext(ctx, `SELECT current_setting('server_version_num')::int`).Scan(&version))
	_, err = db.ExecContext(ctx, `CREATE TABLE public.rpc_metadata_states (
 source integer, stored_value integer GENERATED ALWAYS AS (source * 2) STORED,
 CONSTRAINT checked_positive CHECK (source > 0));
 ALTER TABLE public.rpc_metadata_states ADD CONSTRAINT unchecked_existing CHECK (source < 100) NOT VALID`)
	s.Require().NoError(err)
	if version >= 180000 {
		_, err = db.ExecContext(ctx, `ALTER TABLE public.rpc_metadata_states
 ADD COLUMN virtual_value integer GENERATED ALWAYS AS (source * 3) VIRTUAL`)
		s.Require().NoError(err)
	}
	if version >= 190000 {
		_, err = db.ExecContext(ctx, `ALTER TABLE public.rpc_metadata_states
 ADD CONSTRAINT unchecked_writes CHECK (source % 2 = 0) NOT ENFORCED`)
		s.Require().NoError(err)
	}
	name := s.tableName("public", "rpc_metadata_states")
	for range 2 { // First request synchronizes the catalog; the second reads it back.
		columns, listErr := s.tableClient.ListTableColumns(ctx, connect.NewRequest(&api.ListTableColumnsRequest{Parent: name}))
		s.Require().NoError(listErr)
		byName := make(map[string]*api.Column)
		for _, column := range columns.Msg.GetColumns() {
			byName[column.GetColumnName()] = column
		}
		s.Require().NotNil(byName["stored_value"])
		s.Equal(api.GeneratedColumnKind_GENERATED_COLUMN_KIND_STORED, byName["stored_value"].GetGeneratedKind())
		if version >= 180000 {
			s.Require().NotNil(byName["virtual_value"])
			s.Equal(api.GeneratedColumnKind_GENERATED_COLUMN_KIND_VIRTUAL, byName["virtual_value"].GetGeneratedKind())
		}
		constraints, constraintErr := s.tableClient.ListTableConstraints(ctx, connect.NewRequest(&api.ListTableConstraintsRequest{Parent: name}))
		s.Require().NoError(constraintErr)
		states := make(map[string]*api.TableConstraint)
		for _, constraint := range constraints.Msg.GetConstraints() {
			states[constraint.GetConstraintName()] = constraint
		}
		for _, constraint := range []string{"checked_positive", "unchecked_existing"} {
			s.Require().NotNil(states[constraint])
			s.Require().NotNil(states[constraint].IsEnforced)
			s.True(states[constraint].GetIsEnforced())
			s.Require().NotNil(states[constraint].IsValidated)
		}
		s.True(states["checked_positive"].GetIsValidated())
		s.False(states["unchecked_existing"].GetIsValidated())
		if version >= 190000 {
			s.Require().NotNil(states["unchecked_writes"])
			s.Require().NotNil(states["unchecked_writes"].IsEnforced)
			s.False(states["unchecked_writes"].GetIsEnforced())
			s.Require().NotNil(states["unchecked_writes"].IsValidated)
			s.False(states["unchecked_writes"].GetIsValidated())
		}
	}
	// Inspect the real meta database too: a direct/live implementation must
	// not accidentally make this test pass while persistence still drops state.
	meta, err := s.metaContainer.ConnectToDatabase(ctx, metaDBName)
	s.Require().NoError(err)
	defer meta.Close()
	var storedKind int32
	s.Require().NoError(meta.QueryRowContext(ctx, `SELECT generated_kind FROM catalog_column
 WHERE instance_id = $1 AND database_name = $2 AND schema_name = 'public'
 AND table_name = 'rpc_metadata_states' AND name = 'stored_value'`, s.instanceID, externalDBName).Scan(&storedKind))
	s.Equal(int32(api.GeneratedColumnKind_GENERATED_COLUMN_KIND_STORED), storedKind)
	var enforced, validated sql.NullBool
	s.Require().NoError(meta.QueryRowContext(ctx, `SELECT is_enforced, is_validated FROM catalog_table_constraint
 WHERE instance_id = $1 AND database_name = $2 AND schema_name = 'public'
 AND table_name = 'rpc_metadata_states' AND name = 'unchecked_existing'`, s.instanceID, externalDBName).Scan(&enforced, &validated))
	s.True(enforced.Valid)
	s.True(enforced.Bool)
	s.True(validated.Valid)
	s.False(validated.Bool)
}
