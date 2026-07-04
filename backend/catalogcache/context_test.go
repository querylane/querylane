package catalogcache

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestForceRefreshContext(t *testing.T) {
	t.Parallel()

	t.Run("default is false", func(t *testing.T) {
		t.Parallel()
		assert.False(t, isForceRefresh(context.Background()))
	})

	t.Run("WithForceRefresh sets true", func(t *testing.T) {
		t.Parallel()

		ctx := WithForceRefresh(context.Background())
		assert.True(t, isForceRefresh(ctx))
	})

	t.Run("nested context preserves value", func(t *testing.T) {
		t.Parallel()

		ctx := WithForceRefresh(context.Background())

		type testCtxKey struct{}

		childCtx := context.WithValue(ctx, testCtxKey{}, "other")
		assert.True(t, isForceRefresh(childCtx))
	})
}
