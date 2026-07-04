package aip

import (
	"fmt"
	"maps"
	"slices"
	"strings"

	commonv1 "github.com/querylane/querylane/backend/protogen/querylane/common/v1"
)

// Field defines a single sortable/pageable field for a resource model.
//
// Each field you declare represents one API-level field name (e.g.
// "display_name") that clients can use in order_by and that participates
// in cursor-based pagination.
//
// Fields carry no database binding: the column (go-jet) or SQL expression
// (raw SQL) backing each path is attached by the backend subpackage's Bind
// (aip/jet, aip/rawsql), which validates at construction time that every
// orderable and filterable field is bound.
//
// Orderable fields must be non-nullable at the database layer, or the caller's
// bound expression must normalize NULLs (e.g. COALESCE). Tuple comparison is
// undefined when any element is NULL.
type Field[Model any] struct {
	// Codec converts this field's values to/from the opaque page token. When a
	// client paginates through results, the last row's field values are serialized
	// into the token (via ToProto) and deserialized back (via FromProto) on the
	// next request to build the keyset WHERE clause. The codec must be lossless
	// because cursor values are used for relational comparisons (>, <, =) in SQL.
	// See CursorCodec for available implementations (StringCodec, Int64Codec, etc.).
	Codec CursorCodec

	// DisableOrdering marks fields that can appear in the schema (e.g. for
	// future filtering) but must not be used in the order_by parameter.
	DisableOrdering bool

	// GetValue extracts this field's current value from a scanned database row.
	// Called on the last row of each page to capture the cursor position for the
	// next page token. For example, if the client orders by "name", GetValue
	// returns m.Name so it can be encoded into the continuation token.
	GetValue func(m *Model) any

	// Filterable opts this field into server-side filtering (the `filter`
	// parameter). The zero value means the field is ignored by the filter
	// engine. The allowed operators are derived from the Codec (and from
	// FilterValues, see below): strings get =/!=/:, bools =/!=, and
	// int64/timestamp fields the comparison operators (=, !=, <, <=, >, >=).
	// A Filterable field needs a Codec but does NOT need GetValue — that is
	// only used for cursor extraction of order fields.
	//
	// The bound column/expression MUST be non-NULL — declared NOT NULL or
	// wrapped in COALESCE to a sentinel (e.g. ''). The `!=` and `:` operators
	// compile to `<>` / `ILIKE`, which evaluate to NULL (not TRUE) for a NULL
	// column under SQL three-valued logic, so a nullable filterable column would
	// silently drop its NULL-valued rows from `!=`/`:` results. Schema
	// construction cannot check this (nullability is a database property), so it
	// is the caller's invariant — see the load-bearing COALESCE in the grant
	// queries (engine/postgres).
	Filterable bool

	// FilterValues is an optional bounded value set for enum-like string fields
	// (e.g. object_type). When non-empty, a filter value outside the set is
	// rejected with InvalidArgument, and the field becomes equality-only
	// (operators "=", "!="; no ":" substring). Leave nil for unbounded fields.
	FilterValues []string
}

// Fields maps API field paths to their Field definitions. The keys are the
// field names that clients use in the order_by query parameter (e.g.
// "display_name", "create_time"), not the database column names.
//
// Example:
//
//	aip.Fields[model.Instance]{
//	    "display_name": {Codec: aip.StringCodec{}, GetValue: func(m *model.Instance) any { return m.DisplayName }},
//	    "create_time":  {Codec: aip.TimestampCodec{}, GetValue: func(m *model.Instance) any { return m.CreatedAt }},
//	}
type Fields[Model any] map[string]Field[Model]

// Schema defines the ordering and pagination behaviour for a resource type.
// It is backend-neutral: pair it with a backend binding (aip/jet.Bind or
// aip/rawsql.Bind) to execute queries, or use BuildPlan directly for
// in-memory listings.
type Schema[Model any] struct {
	resourceType     string
	fields           Fields[Model]
	defaultPageSize  int32
	maxPageSize      int32
	defaultOrder     []OrderField
	tieBreakerFields []OrderField

	// hasFilterableFields is precomputed at construction so the per-request
	// no-op check in buildFilter doesn't iterate the field map on every call.
	hasFilterableFields bool
}

// Option configures a Schema via NewSchema.
type Option func(*schemaBuilder)

type schemaBuilder struct {
	defaultPageSize  int32
	maxPageSize      int32
	defaultOrder     []OrderField
	tieBreakerFields []OrderField
}

// WithDefaultPageSize sets the page size used when the caller sends 0 or negative.
func WithDefaultPageSize(n int32) Option {
	return func(b *schemaBuilder) { b.defaultPageSize = n }
}

// WithMaxPageSize sets the upper bound for page size. Requests exceeding
// this value are silently clamped (AIP-158).
func WithMaxPageSize(n int32) Option {
	return func(b *schemaBuilder) { b.maxPageSize = n }
}

// WithDefaultOrder sets a default ordering field used when the request has no order_by.
func WithDefaultOrder(fieldPath string, dir SortDirection) Option {
	return func(b *schemaBuilder) {
		b.defaultOrder = append(b.defaultOrder, OrderField{Path: fieldPath, Direction: dir})
	}
}

// WithTieBreaker appends a tie-breaker field that is always added to the end
// of every ORDER BY clause. This ensures deterministic pagination: without a
// unique tie-breaker, rows with identical sort values can appear on multiple
// pages or be skipped entirely. Typically the primary key (e.g. "id" or "name").
//
// Tie-breakers are caller-declared and must produce a total order — schema
// validation checks existence and orderability but cannot prove uniqueness,
// which is a database-level property.
func WithTieBreaker(fieldPath string, dir SortDirection) Option {
	return func(b *schemaBuilder) {
		b.tieBreakerFields = append(b.tieBreakerFields, OrderField{Path: fieldPath, Direction: dir})
	}
}

// WithNameOrdering applies the standard "name ASC" default order and
// tie-breaker. Use this for resource types whose "name" field is unique
// per-parent (databases, schemas, tables, views, etc.) — this is the
// convention every name-keyed Querylane resource follows, so prefer this
// over hand-rolling WithDefaultOrder + WithTieBreaker.
func WithNameOrdering() Option {
	return func(b *schemaBuilder) {
		b.defaultOrder = append(b.defaultOrder, OrderField{Path: "name", Direction: Asc})
		b.tieBreakerFields = append(b.tieBreakerFields, OrderField{Path: "name", Direction: Asc})
	}
}

// NewSchema creates a new Schema for the given resource type and fields.
// Panics if the configuration is invalid (same pattern as regexp.MustCompile).
func NewSchema[Model any](resourceType string, fields Fields[Model], opts ...Option) *Schema[Model] {
	b := &schemaBuilder{
		defaultPageSize: 50,
		maxPageSize:     1000,
	}
	for _, o := range opts {
		o(b)
	}

	s := &Schema[Model]{
		resourceType:     resourceType,
		fields:           fields,
		defaultPageSize:  b.defaultPageSize,
		maxPageSize:      b.maxPageSize,
		defaultOrder:     b.defaultOrder,
		tieBreakerFields: b.tieBreakerFields,
	}

	for _, f := range fields {
		if f.Filterable {
			s.hasFilterableFields = true

			break
		}
	}

	if err := s.validate(); err != nil {
		panic(fmt.Sprintf("aip: invalid schema for %s: %v", resourceType, err)) //nolint:forbidigo // init-time validation, same pattern as regexp.MustCompile
	}

	return s
}

// validate checks schema configuration at construction time.
func (s *Schema[M]) validate() error {
	if s.defaultPageSize < 1 {
		return fmt.Errorf("defaultPageSize must be >= 1, got %d", s.defaultPageSize)
	}

	if s.maxPageSize < 1 {
		return fmt.Errorf("maxPageSize must be >= 1, got %d", s.maxPageSize)
	}

	allowed := s.allowedFields()

	// Default order fields must exist and be orderable.
	for _, f := range s.defaultOrder {
		field, ok := s.fields[f.Path]
		if !ok {
			return fmt.Errorf("default order field %q not in schema (allowed: %s)", f.Path, strings.Join(allowed, ", "))
		}

		if field.DisableOrdering {
			return fmt.Errorf("default order field %q has ordering disabled", f.Path)
		}
	}

	// Tie-breaker fields must exist and be orderable.
	for _, f := range s.tieBreakerFields {
		field, ok := s.fields[f.Path]
		if !ok {
			return fmt.Errorf("tie-breaker field %q not in schema (allowed: %s)", f.Path, strings.Join(allowed, ", "))
		}

		if field.DisableOrdering {
			return fmt.Errorf("tie-breaker field %q has ordering disabled", f.Path)
		}
	}

	for path, field := range s.fields {
		// Filterable fields are validated independently of ordering: a field may
		// be Filterable while DisableOrdering is true (e.g. is_system_*), so this
		// runs before the orderable-only early-continue below.
		if field.Filterable {
			if err := validateFilterableField(path, field); err != nil {
				return err
			}
		}

		// Every orderable field must have a Codec and GetValue. Database
		// bindings are validated by the backend subpackage's Bind.
		if field.DisableOrdering {
			continue
		}

		if field.Codec == nil {
			return fmt.Errorf("orderable field %q is missing a Codec", path)
		}

		if field.GetValue == nil {
			return fmt.Errorf("orderable field %q is missing a GetValue function", path)
		}
	}

	return nil
}

// validateFilterableField enforces the construction-time requirements for a
// field opted into server-side filtering. GetValue is intentionally NOT
// required (it is only used for cursor extraction of order fields).
func validateFilterableField[M any](path string, field Field[M]) error {
	if field.Codec == nil {
		return fmt.Errorf("filterable field %q is missing a Codec", path)
	}

	// FilterValues bounds are only checked for string values (coerceFilterValue);
	// on any other codec the set would be silently ignored, so reject it here.
	if _, isString := field.Codec.(StringCodec); len(field.FilterValues) > 0 && !isString {
		return fmt.Errorf("filterable field %q sets FilterValues but uses codec %T; bounded value sets are only supported for StringCodec fields", path, field.Codec)
	}

	switch field.Codec.(type) {
	case StringCodec, BoolCodec, Int64Codec, TimestampCodec:
		return nil
	default:
		return fmt.Errorf("filterable field %q uses an unsupported codec %T for filtering", path, field.Codec)
	}
}

// ResourceType returns the schema's resource type identifier
// (e.g. "console.querylane.dev/Instance"), used in error messages.
func (s *Schema[M]) ResourceType() string {
	return s.resourceType
}

// Paths returns all field paths declared in the schema, sorted.
func (s *Schema[M]) Paths() []string {
	return s.allowedFields()
}

// OrderablePaths returns the sorted field paths usable in order_by. Backend
// bindings (aip/jet, aip/rawsql) must bind every one of them.
func (s *Schema[M]) OrderablePaths() []string {
	return s.orderableFields()
}

// FilterablePaths returns the sorted field paths opted into server-side
// filtering. Backend bindings (aip/jet, aip/rawsql) must bind every one of them.
func (s *Schema[M]) FilterablePaths() []string {
	return s.filterableFields()
}

// CodecOf returns the codec for a field path, or false if the path is not in
// the schema. Backend bindings use it to type-check bound columns against the
// values the codecs will produce.
func (s *Schema[M]) CodecOf(path string) (CursorCodec, bool) {
	f, ok := s.fields[path]
	if !ok {
		return nil, false
	}

	return f.Codec, true
}

// codecs returns a map of field path → CursorCodec for token encoding.
func (s *Schema[M]) codecs() map[string]CursorCodec {
	codecs := make(map[string]CursorCodec, len(s.fields))
	for path, field := range s.fields {
		if field.Codec != nil {
			codecs[path] = field.Codec
		}
	}

	return codecs
}

// allowedFields returns sorted field paths for validation and error messages.
func (s *Schema[M]) allowedFields() []string {
	return slices.Sorted(maps.Keys(s.fields))
}

// filterableFields returns sorted paths of fields opted into server-side
// filtering, used for validation and error messages.
func (s *Schema[M]) filterableFields() []string {
	keys := make([]string, 0, len(s.fields))
	for path, f := range s.fields {
		if f.Filterable {
			keys = append(keys, path)
		}
	}

	return slices.Sorted(slices.Values(keys))
}

// orderableFields returns sorted field paths usable in order_by. Fields with
// DisableOrdering set are excluded so error messages never advertise fields
// that would be rejected.
func (s *Schema[M]) orderableFields() []string {
	paths := make([]string, 0, len(s.fields))

	for path, field := range s.fields {
		if !field.DisableOrdering {
			paths = append(paths, path)
		}
	}

	slices.Sort(paths)

	return paths
}

// effectiveOrderBy resolves the complete ordering that will be used in the
// database query. If the client provided an order_by, it is used; otherwise
// the schema's defaults apply. Tie-breaker fields are always appended (unless
// already present) to guarantee deterministic pagination order.
func (s *Schema[M]) effectiveOrderBy(orderByStr string) (OrderBy, error) {
	ob, err := ParseOrderBy(orderByStr)
	if err != nil {
		return OrderBy{}, err
	}

	var effective []OrderField

	if len(ob.Fields) == 0 {
		effective = append(effective, s.defaultOrder...)
	} else {
		effective = append(effective, ob.Fields...)
	}

	// Validate only the client-supplied fields — defaults and tie-breakers
	// were already proven valid at schema construction time.
	for _, f := range ob.Fields {
		field, ok := s.fields[f.Path]
		if !ok {
			return OrderBy{}, newFieldError("order_by", f.Path, s.orderableFields())
		}

		if field.DisableOrdering {
			return OrderBy{}, newFieldError("order_by", f.Path, s.orderableFields())
		}
	}

	effective = appendUniqueFields(effective, s.tieBreakerFields...)

	return OrderBy{Fields: effective}, nil
}

// decodeCursorValues validates that the page token's ordering matches the
// current request's ordering (rejecting mid-pagination order_by changes),
// then decodes the cursor values from the token back into Go types. These
// values are used to build the keyset WHERE clause (e.g. WHERE name > 'last_seen').
func (s *Schema[M]) decodeCursorValues(
	token *commonv1.PageToken,
	orderBy OrderBy,
) ([]any, error) {
	if token == nil || len(token.OrderFields) == 0 {
		return nil, nil
	}

	if len(token.CursorValues) != len(token.OrderFields) {
		return nil, fmt.Errorf("cursor values count (%d) does not match order fields count (%d)",
			len(token.CursorValues), len(token.OrderFields))
	}

	if len(orderBy.Fields) != len(token.OrderFields) {
		return nil, errTokenOrderChanged
	}

	for i, tf := range token.OrderFields {
		ef := orderBy.Fields[i]

		tokenDir := SortDirection(tf.Direction == commonv1.OrderDirection_ORDER_DIRECTION_DESC)
		if tf.FieldName != ef.Path || tokenDir != ef.Direction {
			return nil, errTokenOrderChanged
		}
	}

	values := make([]any, len(token.CursorValues))
	for i, v := range token.CursorValues {
		name := token.OrderFields[i].FieldName

		f, ok := s.fields[name]
		if !ok {
			return nil, fmt.Errorf("cursor decode for %q: field not in schema", name)
		}

		goVal, err := f.Codec.FromProto(v)
		if err != nil {
			return nil, fmt.Errorf("cursor decode for %q: %w", name, err)
		}

		values[i] = goVal
	}

	return values, nil
}

// extractCursorValues reads the ordered field values from the last row of
// the current page. These values become the cursor in the next page token,
// telling the next request where to resume.
func (s *Schema[M]) extractCursorValues(row *M, orderBy OrderBy) ([]any, error) {
	values := make([]any, len(orderBy.Fields))
	for i, field := range orderBy.Fields {
		f, ok := s.fields[field.Path]
		if !ok {
			// Internal invariant violation: the ordering was validated against the
			// schema in BuildPlan, so a miss here is a bug — no client-facing sentinel.
			return nil, fmt.Errorf("extract cursor: field %q not in schema", field.Path)
		}

		values[i] = f.GetValue(row)
	}

	return values, nil
}
