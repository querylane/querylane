package storage

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestIntegrationAuditLogPersistsAttemptBeforeOutcomeAndPagesNewestFirst(t *testing.T) {
	t.Parallel()

	if testing.Short() {
		t.Skip("skipping integration test; run without -short")
	}

	testDB := NewTestDB(t)
	store := NewAuditLogStore(testDB.DB())

	firstID, err := store.StartMutation(t.Context(), AuditMutation{
		Action:       "refresh_materialized_view",
		Actor:        "127.0.0.1:42000",
		DatabaseName: "app",
		InstanceName: "instances/prod",
		Statement:    `REFRESH MATERIALIZED VIEW "public"."daily_revenue"`,
		Target:       "instances/prod/databases/app/schemas/public/views/daily_revenue",
	})
	require.NoError(t, err)
	require.NoError(t, store.FinishMutation(t.Context(), firstID, AuditMutationFailed, "permission denied"))

	secondID, err := store.StartMutation(t.Context(), AuditMutation{
		Action:       "refresh_materialized_view",
		Actor:        "127.0.0.1:42001",
		DatabaseName: "app",
		InstanceName: "instances/prod",
		Statement:    `REFRESH MATERIALIZED VIEW CONCURRENTLY "public"."customer_rollup"`,
		Target:       "instances/prod/databases/app/schemas/public/views/customer_rollup",
	})
	require.NoError(t, err)
	require.NoError(t, store.FinishMutation(t.Context(), secondID, AuditMutationSucceeded, "refreshed"))

	firstPage, token, err := store.ListAuditLogEntries(t.Context(), 1, "")
	require.NoError(t, err)
	require.Len(t, firstPage, 1)
	require.NotEmpty(t, token)
	assert.Equal(t, secondID, firstPage[0].ID)
	assert.Equal(t, AuditMutationSucceeded, firstPage[0].Status)
	assert.NotNil(t, firstPage[0].FinishedAt)

	secondPage, token, err := store.ListAuditLogEntries(t.Context(), 1, token)
	require.NoError(t, err)
	require.Len(t, secondPage, 1)
	assert.Empty(t, token)
	assert.Equal(t, firstID, secondPage[0].ID)
	assert.Equal(t, "permission denied", secondPage[0].ResultSummary)
}

func TestIntegrationAuditLogRejectsInvalidPageTokenAndOutcome(t *testing.T) {
	t.Parallel()

	if testing.Short() {
		t.Skip("skipping integration test; run without -short")
	}

	store := NewAuditLogStore(NewTestDB(t).DB())
	_, _, err := store.ListAuditLogEntries(t.Context(), 20, "not-a-token")
	require.ErrorIs(t, err, ErrInvalidPageToken)

	err = store.FinishMutation(t.Context(), 42, AuditMutationStatus("bogus"), "")
	require.ErrorIs(t, err, ErrInvalidInput)

	err = store.FinishMutation(t.Context(), 42, AuditMutationFailed, "")
	require.ErrorIs(t, err, ErrNotFound)
}
