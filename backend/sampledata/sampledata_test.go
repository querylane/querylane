package sampledata_test

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/querylane/querylane/backend/sampledata"
	"github.com/querylane/querylane/backend/storage"
)

func TestIntegrationApplyIsIdempotent(t *testing.T) {
	t.Parallel()

	if testing.Short() {
		t.Skip("skipping integration test; run without -short")
	}

	ctx := context.Background()
	testDB := storage.NewTestDB(t)
	db := testDB.DB()

	require.NoError(t, sampledata.Apply(ctx, db))
	require.NoError(t, sampledata.Apply(ctx, db), "re-seeding an untouched database must succeed")

	var customers int

	require.NoError(t, db.QueryRowContext(ctx, "SELECT count(*) FROM public.customers").Scan(&customers))
	assert.Equal(t, 25, customers, "re-seed must not duplicate rows")
}

// TestIntegrationApplyIsIdempotentAfterEmailEdit re-seeds after a user edited
// a seeded customer's email. The upsert must key on the primary key: keying on
// email no longer matches the edited row and re-inserting id 1 explodes with a
// primary-key violation.
func TestIntegrationApplyIsIdempotentAfterEmailEdit(t *testing.T) {
	t.Parallel()

	if testing.Short() {
		t.Skip("skipping integration test; run without -short")
	}

	ctx := context.Background()
	testDB := storage.NewTestDB(t)
	db := testDB.DB()

	require.NoError(t, sampledata.Apply(ctx, db))

	_, err := db.ExecContext(ctx, "UPDATE public.customers SET email = 'alice.new@example.com' WHERE id = 1")
	require.NoError(t, err)

	require.NoError(t, sampledata.Apply(ctx, db), "re-seeding after an email edit must not hit a PK violation")

	var (
		customers int
		email     string
	)

	require.NoError(t, db.QueryRowContext(ctx, "SELECT count(*) FROM public.customers").Scan(&customers))
	assert.Equal(t, 25, customers, "re-seed must not duplicate rows")

	require.NoError(t, db.QueryRowContext(ctx, "SELECT email FROM public.customers WHERE id = 1").Scan(&email))
	assert.Equal(t, "alice.new@example.com", email, "re-seed must not clobber the user's edit")
}
