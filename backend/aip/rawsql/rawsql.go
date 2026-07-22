// Package rawsql compiles aip list plans into parameterized PostgreSQL clauses.
// The jet backend embeds those clauses in go-jet statements; handwritten SQL
// callers can execute them directly with Execute.
package rawsql

import (
	"fmt"

	"github.com/querylane/querylane/backend/aip"
)

// Exprs maps schema field paths to the raw PostgreSQL expressions backing
// them as they appear in the handwritten query (e.g. "name" → "d.datname").
// Expressions are trusted schema-owned strings, never user input.
type Exprs map[string]string

// Schema pairs a backend-neutral aip.Schema with its SQL expression bindings.
// Construct with Bind.
type Schema[Model any] struct {
	core  *aip.Schema[Model]
	exprs Exprs
}

// Bind attaches raw SQL expressions to a schema's field paths. It panics if
// any orderable or filterable field is unbound or if a binding names an
// unknown path — misconfiguration fails at process start, not on the first
// query (same pattern as regexp.MustCompile).
func Bind[Model any](core *aip.Schema[Model], exprs Exprs) *Schema[Model] {
	if err := validateBinding(core, exprs); err != nil {
		panic(fmt.Sprintf("aip/rawsql: invalid binding for %s: %v", core.ResourceType(), err)) //nolint:forbidigo // init-time validation, same pattern as regexp.MustCompile
	}

	return &Schema[Model]{core: core, exprs: exprs}
}

func validateBinding[Model any](core *aip.Schema[Model], exprs Exprs) error {
	for path := range exprs {
		if _, ok := core.CodecOf(path); !ok {
			return fmt.Errorf("binding for unknown field %q", path)
		}
	}

	seen := make(map[string]struct{})

	for _, path := range append(core.OrderablePaths(), core.FilterablePaths()...) {
		if _, done := seen[path]; done {
			continue
		}

		seen[path] = struct{}{}

		if exprs[path] == "" {
			return fmt.Errorf("field %q has no SQL expression binding", path)
		}
	}

	return nil
}
