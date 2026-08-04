package catalogcache

import (
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestCatalogSpoolBudgetReconcilesRemovedOrphan(t *testing.T) {
	t.Parallel()

	tempDir := t.TempDir()
	orphanPath := filepath.Join(tempDir, "querylane-catalog-pages-recent")
	require.NoError(t, os.WriteFile(orphanPath, []byte("123"), 0o600))

	budget := newCatalogSpoolByteBudget(5)
	initializeCatalogSpoolBudget(tempDir, time.Now(), budget)

	assert.False(t, budget.reserve(3), "recent orphan bytes must reduce the available budget")

	require.NoError(t, os.Remove(orphanPath))
	budget.cleanupRetained(time.Now())
	assert.True(t, budget.reserve(5), "removed orphan bytes must return to the budget")
}

func TestCatalogSpoolBudgetRemovesOrphanAfterRetentionWindow(t *testing.T) {
	t.Parallel()

	tempDir := t.TempDir()
	orphanPath := filepath.Join(tempDir, "querylane-catalog-pages-recent")
	require.NoError(t, os.WriteFile(orphanPath, []byte("123"), 0o600))

	now := time.Now()
	budget := newCatalogSpoolByteBudget(5)
	initializeCatalogSpoolBudget(tempDir, now, budget)

	budget.cleanupRetained(now.Add(staleCatalogSpoolAge + time.Second))
	assert.NoFileExists(t, orphanPath)
	assert.True(t, budget.reserve(5), "expired orphan bytes must return to the budget")
}

func TestCatalogPageSpoolRetriesFailedRemovalDuringCleanup(t *testing.T) {
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
	budget.cleanupRetained(time.Now())
	assert.True(t, budget.reserve(5), "cleanup must retry deletion and release its reservation")
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
