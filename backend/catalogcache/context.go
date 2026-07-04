package catalogcache

import "context"

type ctxKey struct{}

// WithForceRefresh returns a context that forces the catalog to bypass
// staleness checks and always sync from the live instance.
func WithForceRefresh(ctx context.Context) context.Context {
	return context.WithValue(ctx, ctxKey{}, true)
}

func isForceRefresh(ctx context.Context) bool {
	v, _ := ctx.Value(ctxKey{}).(bool)
	return v
}
