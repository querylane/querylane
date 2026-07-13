package catalogcache

import (
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestInitializeCatalogSpoolBudgetCountsRecentOrphans(t *testing.T) {
	t.Parallel()

	tempDir := t.TempDir()
	orphanPath := filepath.Join(tempDir, "querylane-catalog-pages-recent")
	require.NoError(t, os.WriteFile(orphanPath, []byte("123"), 0o600))

	budget := newCatalogSpoolByteBudget(5)
	initializeCatalogSpoolBudget(tempDir, time.Now(), budget)

	assert.True(t, budget.reserve(2))
	assert.False(t, budget.reserve(1), "recent orphan bytes must reduce the available budget")
}

func TestCatalogPageSpoolRemoveRetainsBudgetUntilDeletionSucceeds(t *testing.T) {
	t.Parallel()

	spoolDir := t.TempDir()
	childPath := filepath.Join(spoolDir, "page")
	require.NoError(t, os.WriteFile(childPath, []byte("data"), 0o600))

	budget := newCatalogSpoolByteBudget(5)
	require.True(t, budget.reserve(5))

	spool := &catalogPageSpool[struct{}]{path: spoolDir, bytes: 5, budget: budget}
	spool.remove()
	assert.False(t, budget.reserve(1), "failed deletion must retain its reservation")

	require.NoError(t, os.Remove(childPath))
	spool.remove()
	assert.True(t, budget.reserve(5), "a later successful deletion must release its reservation")
}

func TestCatalogSpoolByteBudgetBoundsActiveBytes(t *testing.T) {
	t.Parallel()

	file, err := os.CreateTemp(t.TempDir(), "spool-budget-*")
	require.NoError(t, err)
	t.Cleanup(func() { require.NoError(t, file.Close()) })

	budget := newCatalogSpoolByteBudget(5)
	writer := &budgetedCatalogSpoolWriter{file: file, budget: budget}

	written, err := writer.Write([]byte("12345"))
	require.NoError(t, err)
	assert.Equal(t, 5, written)

	written, err = writer.Write([]byte("6"))
	require.ErrorIs(t, err, errCatalogSpoolBudgetExceeded)
	assert.Zero(t, written)

	budget.release(writer.reserved)
	assert.True(t, budget.reserve(5))
}
