package aip

import (
	"fmt"
	"slices"
	"strings"
	"unicode"
)

// SortDirection specifies ascending or descending sort order.
type SortDirection bool

const (
	// Asc sorts in ascending order (A→Z, 0→9, oldest→newest).
	Asc SortDirection = false
	// Desc sorts in descending order (Z→A, 9→0, newest→oldest).
	Desc SortDirection = true
)

// OrderField represents a single ordering field with its sort direction.
type OrderField struct {
	Path      string
	Direction SortDirection
}

// OrderBy represents a complete ordering directive with multiple fields.
type OrderBy struct {
	Fields []OrderField
}

// ParseOrderBy parses an AIP-132 order_by string into a structured OrderBy.
//
// Supported syntax:
//   - "" (empty, no ordering)
//   - "field_name" (default ascending)
//   - "field_name asc" (explicit ascending)
//   - "field_name desc" (descending)
//   - "field1 asc, field2 desc" (multiple fields)
//
// Dotted paths ("labels.environment") are rejected: schemas only define flat
// field names, and the filter grammar rejects dots too — keeping the two
// user-facing grammars aligned.
func ParseOrderBy(orderByStr string) (OrderBy, error) {
	orderByStr = strings.TrimSpace(orderByStr)
	if orderByStr == "" {
		return OrderBy{}, nil
	}

	// Validate characters: only letters, digits, underscore, space, comma.
	for _, r := range orderByStr {
		if !unicode.IsLetter(r) && !unicode.IsNumber(r) &&
			r != '_' && r != ' ' && r != ',' {
			return OrderBy{}, fmt.Errorf("%w: invalid character %q", ErrInvalidOrderBy, r)
		}
	}

	fieldSpecs := strings.Split(orderByStr, ",")
	fields := make([]OrderField, 0, len(fieldSpecs))
	seen := make(map[string]struct{}, len(fieldSpecs))

	for _, spec := range fieldSpecs {
		spec = strings.TrimSpace(spec)
		if spec == "" {
			return OrderBy{}, fmt.Errorf("%w: empty field specification", ErrInvalidOrderBy)
		}

		parts := strings.Fields(spec)
		if len(parts) == 0 {
			return OrderBy{}, fmt.Errorf("%w: %q", ErrInvalidOrderBy, spec)
		}

		fieldPath := parts[0]
		if _, exists := seen[fieldPath]; exists {
			return OrderBy{}, fmt.Errorf("%w: duplicate field %q", ErrInvalidOrderBy, fieldPath)
		}

		seen[fieldPath] = struct{}{}

		dir := Asc

		switch len(parts) {
		case 1:
			// Default ascending
		case 2:
			switch strings.ToLower(parts[1]) {
			case "asc":
				// explicit ascending
			case "desc":
				dir = Desc
			default:
				return OrderBy{}, fmt.Errorf("%w: invalid direction %q, must be 'asc' or 'desc'", ErrInvalidOrderBy, parts[1])
			}
		default:
			return OrderBy{}, fmt.Errorf("%w: invalid field specification %q", ErrInvalidOrderBy, spec)
		}

		fields = append(fields, OrderField{Path: fieldPath, Direction: dir})
	}

	return OrderBy{Fields: fields}, nil
}

// appendUniqueFields adds fields to dst, skipping any whose Path already exists.
func appendUniqueFields(dst []OrderField, add ...OrderField) []OrderField {
	for _, a := range add {
		if !slices.ContainsFunc(dst, func(d OrderField) bool { return d.Path == a.Path }) {
			dst = append(dst, a)
		}
	}

	return dst
}

// newFieldError creates a formatted error for an unknown field path.
func newFieldError(context, path string, allowed []string) error {
	return fmt.Errorf("%w: field %q not allowed for %s (allowed: %s)",
		ErrInvalidOrderBy, path, context, strings.Join(allowed, ", "))
}

// IsUniformDirection reports whether all fields sort in the same direction.
// Backend compilers use it to pick the ROW() tuple comparison fast path for
// keyset predicates (only valid when every field shares one direction).
func (o OrderBy) IsUniformDirection() bool {
	if len(o.Fields) <= 1 {
		return true
	}

	dir := o.Fields[0].Direction
	for _, f := range o.Fields[1:] {
		if f.Direction != dir {
			return false
		}
	}

	return true
}
