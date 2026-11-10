package storage

import (
	"database/sql"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestIntegrationCachedMetadataMigrationPreservesUnknowns(t *testing.T) {
	t.Parallel()
	testDB := NewTestDB(t)
	ctx := t.Context()
	provider, err := NewGooseProvider(testDB.DB())
	require.NoError(t, err)
	_, err = provider.DownTo(ctx, 8)
	require.NoError(t, err)
	// Seed a pre-upgrade cache. Its old boolean generation flag cannot tell
	// STORED from VIRTUAL, and raw definitions are not structured state.
	_, err = testDB.DB().ExecContext(ctx, `INSERT INTO catalog_column
 (instance_id, database_name, schema_name, table_name, name, is_generated)
 VALUES ('i', 'd', 'public', 't', 'derived', true);
 INSERT INTO catalog_table_constraint
 (instance_id, database_name, schema_name, table_name, name, definition)
 VALUES ('i', 'd', 'public', 't', 'checked', 'CHECK (n > 0)')`)
	require.NoError(t, err)
	_, err = provider.Up(ctx)
	require.NoError(t, err)
	var generatedKind int
	require.NoError(t, testDB.DB().QueryRowContext(ctx, `SELECT generated_kind FROM catalog_column WHERE name = 'derived'`).Scan(&generatedKind))
	assert.Zero(t, generatedKind, "migration must not invent a generated storage kind")
	var enforced, validated sql.NullBool
	require.NoError(t, testDB.DB().QueryRowContext(ctx, `SELECT is_enforced, is_validated FROM catalog_table_constraint WHERE name = 'checked'`).Scan(&enforced, &validated))
	assert.False(t, enforced.Valid)
	assert.False(t, validated.Valid)
	_, err = provider.DownTo(ctx, 8)
	require.NoError(t, err)
	var preserved bool
	require.NoError(t, testDB.DB().QueryRowContext(ctx, `SELECT is_generated FROM catalog_column WHERE name = 'derived'`).Scan(&preserved))
	assert.True(t, preserved, "rollback preserves existing cached metadata")
	_, err = provider.Up(ctx)
	require.NoError(t, err)
}
