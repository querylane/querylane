package storage

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/querylane/querylane/backend/aip"
)

func TestIntegrationAuditLogPersistsAttemptBeforeOutcomeAndPagesNewestFirst(t *testing.T) {
	t.Parallel()

	if testing.Short() {
		t.Skip("skipping integration test; run without -short")
	}

	testDB := NewTestDB(t)
	store := NewAuditLogStore(testDB.DB())

	firstID, err := store.StartMutation(t.Context(), AuditMutation{
		Action:       AuditMutationRefreshMaterializedView,
		Actor:        "127.0.0.1:42000",
		DatabaseName: "instances/prod/databases/app",
		InstanceName: "instances/prod",
		Command:      `REFRESH MATERIALIZED VIEW "public"."daily_revenue"`,
		Target:       "instances/prod/databases/app/schemas/public/views/daily_revenue",
	})
	require.NoError(t, err)
	require.NoError(t, store.FinishMutation(t.Context(), firstID, AuditMutationFailed, "permission denied"))

	secondID, err := store.StartMutation(t.Context(), AuditMutation{
		Action:       AuditMutationRefreshMaterializedView,
		Actor:        "127.0.0.1:42001",
		DatabaseName: "instances/prod/databases/app",
		InstanceName: "instances/prod",
		Command:      `REFRESH MATERIALIZED VIEW CONCURRENTLY "public"."customer_rollup"`,
		Target:       "instances/prod/databases/app/schemas/public/views/customer_rollup",
	})
	require.NoError(t, err)
	require.NoError(t, store.FinishMutation(t.Context(), secondID, AuditMutationSucceeded, "refreshed"))

	firstPage, token, err := store.ListAuditLogEntries(t.Context(), aip.Params{PageSize: 1})
	require.NoError(t, err)
	require.Len(t, firstPage, 1)
	require.NotEmpty(t, token)
	assert.Equal(t, secondID, firstPage[0].ID)
	assert.Equal(t, AuditMutationSucceeded, firstPage[0].State)
	assert.NotNil(t, firstPage[0].FinishTime)

	secondPage, token, err := store.ListAuditLogEntries(t.Context(), aip.Params{PageSize: 1, PageToken: token})
	require.NoError(t, err)
	require.Len(t, secondPage, 1)
	assert.Empty(t, token)
	assert.Equal(t, firstID, secondPage[0].ID)
	assert.Equal(t, "permission denied", secondPage[0].ResultSummary)

	failed, token, err := store.ListAuditLogEntries(t.Context(), aip.Params{
		Filter:  `state = "FAILED"`,
		OrderBy: "start_time desc",
	})
	require.NoError(t, err)
	assert.Empty(t, token)
	require.Len(t, failed, 1)
	assert.Equal(t, firstID, failed[0].ID)
}

func TestIntegrationAuditLogRejectsInvalidPageTokenAndOutcome(t *testing.T) {
	t.Parallel()

	if testing.Short() {
		t.Skip("skipping integration test; run without -short")
	}

	store := NewAuditLogStore(NewTestDB(t).DB())
	_, _, err := store.ListAuditLogEntries(t.Context(), aip.Params{PageSize: 20, PageToken: "not-a-token"})
	require.ErrorIs(t, err, ErrInvalidPageToken)

	err = store.FinishMutation(t.Context(), 42, AuditMutationState("bogus"), "")
	require.ErrorIs(t, err, ErrInvalidInput)

	err = store.FinishMutation(t.Context(), 42, AuditMutationFailed, "")
	require.ErrorIs(t, err, ErrNotFound)
}

func TestIntegrationAuditLogGetsAndPrunesExpiredEntriesInBoundedBatches(t *testing.T) {
	t.Parallel()

	if testing.Short() {
		t.Skip("skipping integration test; run without -short")
	}

	testDB := NewTestDB(t)
	store := NewAuditLogStore(testDB.DB())

	expiredID, err := store.StartMutation(t.Context(), AuditMutation{
		Action:       AuditMutationRefreshMaterializedView,
		Actor:        "127.0.0.1:42000",
		Command:      `REFRESH MATERIALIZED VIEW "public"."expired"`,
		DatabaseName: "instances/prod/databases/app",
		InstanceName: "instances/prod",
		Target:       "instances/prod/databases/app/schemas/public/views/expired",
	})
	require.NoError(t, err)

	currentID, err := store.StartMutation(t.Context(), AuditMutation{
		Action:       AuditMutationRefreshMaterializedView,
		Actor:        "127.0.0.1:42001",
		Command:      `REFRESH MATERIALIZED VIEW "public"."current"`,
		DatabaseName: "instances/prod/databases/app",
		InstanceName: "instances/prod",
		Target:       "instances/prod/databases/app/schemas/public/views/current",
	})
	require.NoError(t, err)

	_, err = testDB.DB().ExecContext(t.Context(), `UPDATE mutation_audit_log SET start_time = now() - interval '91 days' WHERE id = $1`, expiredID)
	require.NoError(t, err)

	entry, err := store.GetAuditLogEntry(t.Context(), currentID)
	require.NoError(t, err)
	assert.Equal(t, currentID, entry.ID)

	pruned, err := PruneAuditLogEntriesOlderThan(t.Context(), testDB.DB(), 90*24*time.Hour, 1)
	require.NoError(t, err)
	assert.Equal(t, int64(1), pruned)

	_, err = store.GetAuditLogEntry(t.Context(), expiredID)
	require.ErrorIs(t, err, ErrNotFound)

	_, err = store.GetAuditLogEntry(t.Context(), currentID)
	require.NoError(t, err)
}
