// Package jet executes aip list plans with the go-jet query builder. It is
// the backend for meta-database queries (storage/): Bind attaches go-jet
// columns to a backend-neutral aip.Schema, and Execute/ExecuteWithCondition
// run the full paginated list query.
package jet

import (
	"fmt"

	"github.com/go-jet/jet/v2/postgres"

	"github.com/querylane/querylane/backend/aip"
)

// Columns maps schema field paths to the go-jet columns backing them
// (e.g. "display_name" → table.Instance.DisplayName).
type Columns map[string]postgres.Column

// Schema pairs a backend-neutral aip.Schema with its go-jet column bindings.
// Construct with Bind.
type Schema[Model any] struct {
	core *aip.Schema[Model]
	cols Columns
}

// Bind attaches go-jet columns to a schema's field paths. It panics if any
// orderable or filterable field is unbound, if a binding names an unknown
// path, or if a column's type cannot hold the values its codec produces —
// misconfiguration fails at process start, not on the first query
// (same pattern as regexp.MustCompile).
func Bind[Model any](core *aip.Schema[Model], cols Columns) *Schema[Model] {
	if err := validateBinding(core, cols); err != nil {
		panic(fmt.Sprintf("aip/jet: invalid binding for %s: %v", core.ResourceType(), err)) //nolint:forbidigo // init-time validation, same pattern as regexp.MustCompile
	}

	return &Schema[Model]{core: core, cols: cols}
}

func validateBinding[Model any](core *aip.Schema[Model], cols Columns) error {
	for path := range cols {
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

		col, ok := cols[path]
		if !ok || col == nil {
			return fmt.Errorf("field %q has no column binding", path)
		}

		codec, _ := core.CodecOf(path)
		if err := checkColumnType(codec, col); err != nil {
			return fmt.Errorf("field %q: %w", path, err)
		}
	}

	return nil
}

// checkColumnType verifies a bound column can hold the values its codec
// produces, restoring the construction-time type safety that per-comparison
// go-jet expression methods used to provide at query-build time.
func checkColumnType(codec aip.CursorCodec, col postgres.Column) error {
	switch codec.(type) {
	case aip.StringCodec:
		if _, ok := col.(postgres.StringExpression); !ok {
			return fmt.Errorf("StringCodec requires a string column, got %T", col)
		}
	case aip.BoolCodec:
		if _, ok := col.(postgres.BoolExpression); !ok {
			return fmt.Errorf("BoolCodec requires a bool column, got %T", col)
		}
	case aip.Int64Codec:
		if _, ok := col.(postgres.IntegerExpression); !ok {
			return fmt.Errorf("Int64Codec requires an integer column, got %T", col)
		}
	case aip.TimestampCodec:
		if _, okz := col.(postgres.TimestampzExpression); !okz {
			if _, ok := col.(postgres.TimestampExpression); !ok {
				return fmt.Errorf("TimestampCodec requires a timestamp(z) column, got %T", col)
			}
		}
	default:
		// Unknown codec implementations are the caller's responsibility.
	}

	return nil
}
