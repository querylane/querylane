package sampledata_test

import (
	"context"
	"database/sql"
	"os"
	"path/filepath"
	"runtime"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/querylane/querylane/backend/storage"
)

func TestIntegrationStressSeedSQLCoversDatabaseFeatures(t *testing.T) {
	t.Parallel()

	ctx := context.Background()
	testDB := storage.NewTestDB(t)
	db := testDB.DB()

	stressSQL := readStressSeedSQL(t)
	applyStressSeedSQL(ctx, t, db, stressSQL, "3000")
	applyStressSeedSQL(ctx, t, db, stressSQL, "3000")

	assertQueryCount(ctx, t, db, "SELECT count(*) FROM stress_core.feature_matrix", 3000)
	assertQueryCount(ctx, t, db, "SELECT count(*) FROM stress_partitions.event_log", 12000)

	var matrixColumns int
	require.NoError(t, db.QueryRowContext(ctx, `
		SELECT count(*)
		FROM information_schema.columns
		WHERE table_schema = 'stress_core'
		  AND table_name = 'feature_matrix'
	`).Scan(&matrixColumns))
	assert.GreaterOrEqual(t, matrixColumns, 45)

	var coveredTypeCount int
	require.NoError(t, db.QueryRowContext(ctx, `
		SELECT count(DISTINCT udt_name)
		FROM information_schema.columns
		WHERE table_schema = 'stress_core'
		  AND table_name = 'feature_matrix'
		  AND udt_name = ANY($1)
	`, []string{
		"int2", "int4", "int8", "numeric", "float4", "float8", "money",
		"bool", "uuid", "bytea", "json", "jsonb", "xml", "_text", "_int4",
		"date", "time", "timetz", "timestamp", "timestamptz", "interval",
		"inet", "cidr", "macaddr", "macaddr8", "point", "line", "lseg", "box",
		"path", "polygon", "circle", "tsvector", "tsquery", "bit", "varbit",
		"int4range", "int8range", "numrange", "tsrange", "tstzrange", "daterange",
	}).Scan(&coveredTypeCount))
	assert.GreaterOrEqual(t, coveredTypeCount, 35)

	var indexCount int
	require.NoError(t, db.QueryRowContext(ctx, `
		SELECT count(*)
		FROM pg_indexes
		WHERE schemaname IN ('stress_core', 'stress_partitions')
	`).Scan(&indexCount))
	assert.GreaterOrEqual(t, indexCount, 12)

	var constraintCount int
	require.NoError(t, db.QueryRowContext(ctx, `
		SELECT count(*)
		FROM pg_constraint c
		JOIN pg_namespace n ON n.oid = c.connamespace
		WHERE n.nspname IN ('stress_core', 'stress_partitions')
	`).Scan(&constraintCount))
	assert.GreaterOrEqual(t, constraintCount, 14)

	var policyCount int
	require.NoError(t, db.QueryRowContext(ctx, `
		SELECT count(*)
		FROM pg_policies
		WHERE schemaname IN ('stress_core', 'stress_security')
	`).Scan(&policyCount))
	assert.GreaterOrEqual(t, policyCount, 4)

	var triggerCount int
	require.NoError(t, db.QueryRowContext(ctx, `
		SELECT count(*)
		FROM information_schema.triggers
		WHERE trigger_schema IN ('stress_core', 'stress_audit')
	`).Scan(&triggerCount))
	assert.GreaterOrEqual(t, triggerCount, 3)

	var roleCoverage int
	require.NoError(t, db.QueryRowContext(ctx, `
		SELECT count(*)
		FROM pg_roles r
		WHERE (r.rolname = 'ql_stress_superuser' AND r.rolsuper)
		   OR (r.rolname = 'ql_stress_replicator' AND r.rolreplication)
		   OR (r.rolname = 'ql_stress_readonly' AND NOT r.rolcanlogin)
		   OR (r.rolname = 'ql_stress_app_user' AND r.rolcanlogin)
	`).Scan(&roleCoverage))
	assert.Equal(t, 4, roleCoverage)

	var builtinRoleGrants int
	require.NoError(t, db.QueryRowContext(ctx, `
		SELECT count(*)
		FROM pg_auth_members m
		JOIN pg_roles role_granted ON role_granted.oid = m.roleid
		JOIN pg_roles member_role ON member_role.oid = m.member
		WHERE role_granted.rolname IN ('pg_monitor', 'pg_read_all_data', 'pg_write_all_data')
		  AND member_role.rolname LIKE 'ql_stress_%'
	`).Scan(&builtinRoleGrants))
	assert.GreaterOrEqual(t, builtinRoleGrants, 3)

	var publicationExists bool
	require.NoError(t, db.QueryRowContext(ctx, `
		SELECT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'ql_stress_publication')
	`).Scan(&publicationExists))
	assert.True(t, publicationExists)

	var specialIdentifierTableExists bool
	require.NoError(t, db.QueryRowContext(ctx, `
		SELECT EXISTS (
			SELECT 1
			FROM information_schema.tables
			WHERE table_schema = 'unicode schema 🚦'
			  AND table_name = 'table with spaces and emoji 🚀'
		)
	`).Scan(&specialIdentifierTableExists))
	assert.True(t, specialIdentifierTableExists)

	assertLegacyEncodingSamples(ctx, t, db)
	assertMaxCatalogCoverage(ctx, t, db)
}

func readStressSeedSQL(t *testing.T) string {
	t.Helper()

	_, filename, _, ok := runtime.Caller(0)
	require.True(t, ok)

	path := filepath.Join(filepath.Dir(filename), "..", "..", "seed", "instance-stress", "sql", "01_complex_stress.sql")
	contents, err := os.ReadFile(path)
	require.NoError(t, err)

	return string(contents)
}

func applyStressSeedSQL(ctx context.Context, t *testing.T, db *sql.DB, stressSQL string, rowCount string) {
	t.Helper()

	conn, err := db.Conn(ctx)
	require.NoError(t, err)

	defer conn.Close()

	_, err = conn.ExecContext(ctx, "SELECT set_config('querylane_stress.row_count', $1, false)", rowCount)
	require.NoError(t, err)

	_, err = conn.ExecContext(ctx, stressSQL)
	require.NoError(t, err)
}

func assertQueryCount(ctx context.Context, t *testing.T, db *sql.DB, query string, expected int) {
	t.Helper()

	var count int
	require.NoError(t, db.QueryRowContext(ctx, query).Scan(&count))
	assert.Equal(t, expected, count)
}

func assertLegacyEncodingSamples(ctx context.Context, t *testing.T, db *sql.DB) {
	t.Helper()

	rows, err := db.QueryContext(ctx, `
		SELECT encoding_name, sample_text, encode(legacy_bytes, 'hex')
		FROM stress_core.legacy_encoding_samples
		ORDER BY encoding_name
	`)
	require.NoError(t, err)

	defer rows.Close()

	got := map[string]struct {
		text string
		hex  string
	}{}

	for rows.Next() {
		var (
			encodingName string
			sampleText   string
			legacyHex    string
		)

		require.NoError(t, rows.Scan(&encodingName, &sampleText, &legacyHex))
		got[encodingName] = struct {
			text string
			hex  string
		}{
			text: sampleText,
			hex:  legacyHex,
		}
	}

	require.NoError(t, rows.Err())

	assert.Equal(t, map[string]struct {
		text string
		hex  string
	}{
		"BIG5": {
			text: "\u7e41\u9ad4\u4e2d\u6587\u8cc7\u6599",
			hex:  "c163c5e9a4a4a4e5b8eaaec6",
		},
		"EUC-JP": {
			text: "\u65e5\u672c\u8a9e\u306e\u8cc7\u6599",
			hex:  "c6fccbdcb8eca4cebbf1cec1",
		},
		"EUC-KR": {
			text: "한국어 자료",
			hex:  "c7d1b1b9beee20c0dab7e1",
		},
		"Shift_JIS": {
			text: "\u65e5\u672c\u8a9e\u306e\u8cc7\u6599",
			hex:  "93fa967b8cea82cc8e9197bf",
		},
		"windows-1251": {
			text: "Привет мир",
			hex:  "cff0e8e2e5f220ece8f0",
		},
	}, got)
}

func assertMaxCatalogCoverage(ctx context.Context, t *testing.T, db *sql.DB) {
	t.Helper()

	runCatalogCheck := func(name string, check func(t *testing.T)) {
		t.Helper()
		t.Run(name, func(t *testing.T) {
			t.Helper()
			t.Parallel()
			check(t)
		})
	}

	runCatalogCheck("partition strategies", func(t *testing.T) {
		t.Helper()

		var partitionStrategyCoverage int
		require.NoError(t, db.QueryRowContext(ctx, `
			SELECT count(DISTINCT pt.partstrat)
			FROM pg_partitioned_table pt
			JOIN pg_class c ON c.oid = pt.partrelid
			JOIN pg_namespace n ON n.oid = c.relnamespace
			WHERE n.nspname = 'stress_partitions'
			  AND c.relname IN (
			    'event_log',
			    'tenant_event_list',
			    'hash_bucket_items'
			  )
		`).Scan(&partitionStrategyCoverage))
		assert.Equal(t, 3, partitionStrategyCoverage)
	})

	runCatalogCheck("legacy inheritance", func(t *testing.T) {
		t.Helper()

		var inheritedTables int
		require.NoError(t, db.QueryRowContext(ctx, `
			SELECT count(*)
			FROM pg_inherits i
			JOIN pg_class child ON child.oid = i.inhrelid
			JOIN pg_namespace n ON n.oid = child.relnamespace
			WHERE n.nspname = 'stress_legacy'
		`).Scan(&inheritedTables))
		assert.GreaterOrEqual(t, inheritedTables, 2)
	})

	runCatalogCheck("foreign tables", func(t *testing.T) {
		t.Helper()

		var foreignTables int
		require.NoError(t, db.QueryRowContext(ctx, `
			SELECT count(*)
			FROM information_schema.foreign_tables
			WHERE foreign_table_schema = 'stress_external'
		`).Scan(&foreignTables))
		assert.GreaterOrEqual(t, foreignTables, 1)
	})

	runCatalogCheck("relation kinds", func(t *testing.T) {
		t.Helper()

		var relationKindCoverage int
		require.NoError(t, db.QueryRowContext(ctx, `
			SELECT
				CASE WHEN EXISTS (
					SELECT 1
					FROM pg_class c
					JOIN pg_namespace n ON n.oid = c.relnamespace
					WHERE n.nspname = 'stress_core'
					  AND c.relname = 'unlogged_import_buffer'
					  AND c.relpersistence = 'u'
				) THEN 1 ELSE 0 END
				+ CASE WHEN EXISTS (
					SELECT 1
					FROM pg_class c
					JOIN pg_namespace n ON n.oid = c.relnamespace
					WHERE n.nspname = 'stress_core'
					  AND c.relname = 'typed_metrics'
					  AND c.reloftype <> 0
				) THEN 1 ELSE 0 END
				+ CASE WHEN EXISTS (
					SELECT 1
					FROM pg_class c
					JOIN pg_namespace n ON n.oid = c.relnamespace
					WHERE n.nspname = 'stress_core'
					  AND c.relname = 'feature_matrix_summary'
					  AND c.relkind = 'm'
				) THEN 1 ELSE 0 END
				+ CASE WHEN EXISTS (
					SELECT 1
					FROM pg_class c
					JOIN pg_namespace n ON n.oid = c.relnamespace
					WHERE n.nspname = 'stress_partitions'
					  AND c.relname = 'event_log'
					  AND c.relkind = 'p'
				) THEN 1 ELSE 0 END
				+ CASE WHEN EXISTS (
					SELECT 1
					FROM pg_class c
					JOIN pg_namespace n ON n.oid = c.relnamespace
					WHERE n.nspname = 'stress_external'
					  AND c.relname = 'empty_csv_feed'
					  AND c.relkind = 'f'
				) THEN 1 ELSE 0 END
		`).Scan(&relationKindCoverage))
		assert.Equal(t, 5, relationKindCoverage)
	})

	runCatalogCheck("extension backed types", func(t *testing.T) {
		t.Helper()

		var extensionBackedTypes int
		require.NoError(t, db.QueryRowContext(ctx, `
			SELECT count(DISTINCT udt_name)
			FROM information_schema.columns
			WHERE table_schema = 'stress_core'
			  AND table_name = 'catalog_edge_objects'
			  AND udt_name IN ('citext', 'hstore', 'money_range')
		`).Scan(&extensionBackedTypes))
		assert.Equal(t, 3, extensionBackedTypes)
	})

	runCatalogCheck("index methods", func(t *testing.T) {
		t.Helper()

		var indexMethodCoverage int
		require.NoError(t, db.QueryRowContext(ctx, `
			SELECT count(DISTINCT am.amname)
			FROM pg_index i
			JOIN pg_class idx ON idx.oid = i.indexrelid
			JOIN pg_am am ON am.oid = idx.relam
			JOIN pg_namespace n ON n.oid = idx.relnamespace
			WHERE n.nspname IN ('stress_core', 'stress_partitions')
			  AND am.amname IN ('btree', 'hash', 'gin', 'gist', 'brin', 'spgist')
		`).Scan(&indexMethodCoverage))
		assert.Equal(t, 6, indexMethodCoverage)
	})

	runCatalogCheck("not valid constraints", func(t *testing.T) {
		t.Helper()

		var notValidConstraints int
		require.NoError(t, db.QueryRowContext(ctx, `
			SELECT count(*)
			FROM pg_constraint c
			JOIN pg_namespace n ON n.oid = c.connamespace
			WHERE n.nspname = 'stress_core'
			  AND c.conname = 'unlogged_import_buffer_received_recent'
			  AND NOT c.convalidated
		`).Scan(&notValidConstraints))
		assert.Equal(t, 1, notValidConstraints)
	})

	runCatalogCheck("view rewrite rules", func(t *testing.T) {
		t.Helper()

		var ruleCount int
		require.NoError(t, db.QueryRowContext(ctx, `
			SELECT count(*)
			FROM pg_rules
			WHERE schemaname = 'stress_core'
			  AND tablename = 'feature_matrix_flat'
		`).Scan(&ruleCount))
		assert.GreaterOrEqual(t, ruleCount, 1)
	})

	runCatalogCheck("comments", func(t *testing.T) {
		t.Helper()

		var commentCount int
		require.NoError(t, db.QueryRowContext(ctx, `
			SELECT count(*)
			FROM pg_description d
			JOIN pg_class c ON c.oid = d.objoid
			JOIN pg_namespace n ON n.oid = c.relnamespace
			WHERE n.nspname LIKE 'stress_%'
		`).Scan(&commentCount))
		assert.GreaterOrEqual(t, commentCount, 8)
	})

	runCatalogCheck("default privileges", func(t *testing.T) {
		t.Helper()

		var defaultPrivilegeCount int
		require.NoError(t, db.QueryRowContext(ctx, `
			SELECT count(*)
			FROM pg_default_acl da
			JOIN pg_namespace n ON n.oid = da.defaclnamespace
			WHERE n.nspname IN ('stress_core', 'stress_partitions', 'stress_external')
		`).Scan(&defaultPrivilegeCount))
		assert.GreaterOrEqual(t, defaultPrivilegeCount, 2)
	})

	runCatalogCheck("role attributes", func(t *testing.T) {
		t.Helper()

		var roleAttributeCoverage int
		require.NoError(t, db.QueryRowContext(ctx, `
			SELECT count(*)
			FROM pg_roles
			WHERE (rolname = 'ql_stress_bypass_rls' AND rolbypassrls)
			   OR (rolname = 'ql_stress_noinherit' AND NOT rolinherit)
			   OR (rolname = 'ql_stress_connlimited' AND rolconnlimit = 3 AND rolvaliduntil IS NOT NULL)
		`).Scan(&roleAttributeCoverage))
		assert.Equal(t, 3, roleAttributeCoverage)
	})

	runCatalogCheck("function kinds", func(t *testing.T) {
		t.Helper()

		var functionKinds int
		require.NoError(t, db.QueryRowContext(ctx, `
			SELECT count(DISTINCT p.prokind)
			FROM pg_proc p
			JOIN pg_namespace n ON n.oid = p.pronamespace
			WHERE n.nspname = 'stress_core'
			  AND p.proname IN (
			    'touch_updated_at',
			    'rotate_feature_states',
			    'weighted_feature_score',
			    'feature_state_rollup'
			  )
		`).Scan(&functionKinds))
		assert.GreaterOrEqual(t, functionKinds, 3)
	})

	runCatalogCheck("trigger states", func(t *testing.T) {
		t.Helper()

		var triggerStates int
		require.NoError(t, db.QueryRowContext(ctx, `
			SELECT count(DISTINCT t.tgenabled)
			FROM pg_trigger t
			JOIN pg_class c ON c.oid = t.tgrelid
			JOIN pg_namespace n ON n.oid = c.relnamespace
			WHERE n.nspname = 'stress_core'
			  AND NOT t.tgisinternal
			  AND t.tgname IN ('feature_matrix_touch_updated_at', 'feature_children_disabled_statement')
		`).Scan(&triggerStates))
		assert.Equal(t, 2, triggerStates)
	})

	runCatalogCheck("disabled event triggers", func(t *testing.T) {
		t.Helper()

		var disabledEventTriggerExists bool
		require.NoError(t, db.QueryRowContext(ctx, `
			SELECT EXISTS (
				SELECT 1
				FROM pg_event_trigger
				WHERE evtname = 'ql_stress_ddl_audit'
				  AND evtenabled = 'D'
			)
		`).Scan(&disabledEventTriggerExists))
		assert.True(t, disabledEventTriggerExists)
	})

	runCatalogCheck("replica identity", func(t *testing.T) {
		t.Helper()

		var replicaIdentityIndexExists bool
		require.NoError(t, db.QueryRowContext(ctx, `
			SELECT EXISTS (
				SELECT 1
				FROM pg_class c
				JOIN pg_namespace n ON n.oid = c.relnamespace
				WHERE n.nspname = 'stress_core'
				  AND c.relname = 'feature_matrix'
				  AND c.relreplident = 'i'
			)
		`).Scan(&replicaIdentityIndexExists))
		assert.True(t, replicaIdentityIndexExists)
	})

	runCatalogCheck("view options", func(t *testing.T) {
		t.Helper()

		var viewOptionCoverage int
		require.NoError(t, db.QueryRowContext(ctx, `
			SELECT count(*)
			FROM information_schema.views
			WHERE (table_schema = 'stress_core' AND table_name = 'active_feature_matrix' AND check_option = 'LOCAL')
			   OR (table_schema = 'stress_security' AND table_name = 'sensitive_accounts_masked')
		`).Scan(&viewOptionCoverage))
		assert.Equal(t, 2, viewOptionCoverage)
	})

	runCatalogCheck("large objects", func(t *testing.T) {
		t.Helper()

		var largeObjectExists bool
		require.NoError(t, db.QueryRowContext(ctx, `
			SELECT EXISTS (
				SELECT 1
				FROM pg_largeobject_metadata
				WHERE oid = 910000
			)
		`).Scan(&largeObjectExists))
		assert.True(t, largeObjectExists)
	})

	runCatalogCheck("xid8 diversity", func(t *testing.T) {
		t.Helper()

		var xidValueCount int
		require.NoError(t, db.QueryRowContext(ctx, `
			SELECT count(DISTINCT xid8_val)
			FROM stress_core.feature_matrix
			WHERE row_id <= 10
		`).Scan(&xidValueCount))
		assert.Greater(t, xidValueCount, 1)
	})
}
