package catalogcache

import (
	"os"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

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
