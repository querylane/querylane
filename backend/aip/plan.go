package aip

import (
	"errors"
	"fmt"
	"strings"
)

// Plan is the validated, backend-neutral result of processing a list request's
// AIP parameters. After BuildPlan succeeds, all inputs have been checked:
// ordering is valid, page token is authentic and unexpired, filter hasn't
// changed. Adapters (jet, SQL) consume the Plan to build their query.
type Plan struct {
	PageSize     int32
	Filter       string
	OrderBy      OrderBy
	CursorValues []any

	// parsedFilter is the validated filter consumed by the backend compilers
	// via ParsedFilter. It is nil when no fields opt into filtering or the
	// filter is empty. The exported Filter string is retained for page-token
	// hashing.
	parsedFilter FilterExpr
}

// ParsedFilter returns the validated filter expression tree for backend
// compilers (aip/jet, aip/rawsql) to translate into predicates. Nil means no
// filtering.
func (p *Plan) ParsedFilter() FilterExpr {
	return p.parsedFilter
}

// BuildPlan validates AIP parameters and converts them into a neutral query plan.
func BuildPlan[M any](schema *Schema[M], params Params) (*Plan, error) {
	pageSize := params.PageSize
	if pageSize <= 0 {
		pageSize = schema.defaultPageSize
	}

	if pageSize > schema.maxPageSize {
		pageSize = schema.maxPageSize
	}

	// Trim once and use the trimmed value for BOTH token hashing and parsing so
	// " " and "" are equivalent and never trigger a spurious ErrFilterMismatch.
	filter := strings.TrimSpace(params.Filter)

	effectiveOrderBy, err := schema.effectiveOrderBy(params.OrderBy)
	if err != nil {
		return nil, wrapAIPError(err, ErrInvalidOrderBy)
	}

	tok, err := decodeToken(params.PageToken)
	if err != nil {
		return nil, wrapAIPError(err, ErrInvalidPageToken)
	}

	if err := validateToken(tok, schema.resourceType, filter); err != nil {
		if errors.Is(err, ErrFilterMismatch) {
			return nil, err
		}

		return nil, wrapAIPError(err, ErrInvalidPageToken)
	}

	parsedFilter, err := buildFilter(schema, filter)
	if err != nil {
		return nil, wrapAIPError(err, ErrInvalidFilter)
	}

	cursorValues, err := schema.decodeCursorValues(tok, effectiveOrderBy)
	if err != nil {
		return nil, wrapAIPError(err, ErrInvalidPageToken)
	}

	return &Plan{
		PageSize:     pageSize,
		Filter:       filter,
		OrderBy:      effectiveOrderBy,
		CursorValues: cursorValues,
		parsedFilter: parsedFilter,
	}, nil
}

// buildFilter parses and validates the filter for a schema. A schema with zero
// Filterable fields rejects any non-empty filter (AIP-160: unsupported filters
// are INVALID_ARGUMENT, never silently ignored). This makes later per-endpoint
// filtering rollouts non-breaking: opting fields in only ever widens what a
// client may send.
func buildFilter[M any](schema *Schema[M], filter string) (FilterExpr, error) {
	if !schema.hasFilterableFields {
		if filter != "" {
			return nil, fmt.Errorf("%w: this resource does not support filtering", ErrInvalidFilter)
		}

		return nil, nil //nolint:nilnil // No filterable fields and an empty filter: nothing to compile.
	}

	raw, err := parseFilter(filter)
	if err != nil {
		return nil, err
	}

	return validateFilter(schema, raw)
}

func wrapAIPError(err, sentinel error) error {
	if errors.Is(err, sentinel) {
		return err
	}

	return fmt.Errorf("%w: %w", sentinel, err)
}
