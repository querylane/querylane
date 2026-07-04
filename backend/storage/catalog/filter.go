package catalog

import "strings"

// normalizeLegacyCatalogFilter rewrites the legacy Explorer filter spelling
// `name.contains('...')` into the aip filter grammar (`name:'...'`) so frontends
// built before the engine rollout keep working. Everything else is returned
// unchanged and parsed/validated by the aip filter engine against the catalog
// schemas.
//
// The legacy single-quoted literal uses the same escape rules as the engine's
// single-quoted strings (`\\` -> `\`, `\'` -> `'`), so the quoted content is
// carried over verbatim and any bad escape is rejected by the engine with
// aip.ErrInvalidFilter.
//
// TODO: remove once the frontend emits `name:"..."` directly and no pre-rollout
// SPA bundles remain in service.
func normalizeLegacyCatalogFilter(filter string) string {
	const (
		prefix = "name.contains('"
		suffix = "')"
	)

	trimmed := strings.TrimSpace(filter)
	if len(trimmed) < len(prefix)+len(suffix) ||
		!strings.HasPrefix(trimmed, prefix) ||
		!strings.HasSuffix(trimmed, suffix) {
		return filter
	}

	return "name:'" + trimmed[len(prefix):len(trimmed)-len(suffix)] + "'"
}
