# Protobuf-compatible types

This package maps protobuf types to PostgreSQL database types. The custom types keep JSON marshaling and unmarshaling out of mappers.

## Overview

The traditional approach required manual JSON handling in mapper functions:

```go
// Previous approach: manual JSON handling
func (m mapper) serializeLabels(labels map[string]string) *string {
    data, _ := json.Marshal(labels)
    result := string(data)
    return &result
}

func (m mapper) parseLabels(labelsJSON *string) map[string]string {
    var labels map[string]string
    json.Unmarshal([]byte(*labelsJSON), &labels)
    return labels
}
```

With our custom types, this becomes:

```go
// Current approach: type-safe explicit conversion
workspace := &api.Workspace{
    Labels: w.Labels.ToMap(),
    CreateTime: timestamppb.New(w.CreatedAt),
}

// INSERT operations require explicit ToJSONB() conversion.
stmt := table.Workspace.
    INSERT(table.Workspace.Labels).
    VALUES(labels.ToJSONB()) // Compile-time type safety
```

## Custom types

### StringMap

**Purpose:** Maps protobuf `map[string]string` values to and from PostgreSQL `JSONB`.

**Usage:**
```go
// The go-jet template applies this type to the generated model.
type Workspace struct {
    Labels types.StringMap  // Applied automatically to all JSONB fields
}

// In mapper
workspace := &api.Workspace{
    Labels: w.Labels.ToMap(),
}

// For creation
workspace := model.Workspace{
    Labels: types.FromMap(proto.GetLabels()),
}
```

**Features:**

- automatic JSON marshaling and unmarshaling;
- null-safe operations;
- detailed error messages; and
- empty-value handling.

## Integration with go-jet

### Automated model generation

The system generates go-jet models with a custom template:

1. **Discover the schema:** connect to PostgreSQL and find its tables and columns.
2. **Customize the template:** apply custom type mappings to JSONB fields.
3. **Generate code:** create models with the required imports and type references.

### Generation process

```bash
task sql:generate
```

This runs the custom go-jet generator with template hooks:

```sh
go run tools/jet_generator.go <dsn>
```

### Current type mappings

- All JSONB columns named `labels` map to `types.StringMap`.
- Other columns use the default go-jet types.

### Generated code example

```go
// backend/storage/gen/querylane/public/model/workspace.go
type Workspace struct {
    ID          string `sql:"primary_key"`
    DisplayName string
    Labels      types.StringMap   // Automatically converted from *string
    CreatedAt   time.Time        // Standard time.Time
    UpdatedAt   time.Time        // Standard time.Time  
    DeletedAt   *time.Time      // Keep as-is for soft delete
}
```

## Benefits

1. **Type safety:** validate mappings at compile time.
2. **Performance:** keep runtime JSON marshaling out of mappers.
3. **Maintenance:** apply types automatically without manual model edits.
4. **Extension:** add protobuf types through the postprocessor.
5. **Go conventions:** keep mapper code direct and readable.

## Extension pattern

To add support for new proto types:

1. Create a new type in `backend/storage/types/`
2. Implement `sql.Scanner` and `driver.Valuer` interfaces
3. Add conversion methods, such as `ToMap()` and `FromMap()`.
4. Update `tools/post_process_models.go` to detect and apply the new type
5. Use in mappers with direct assignment

### Example: add `ProtoStringSlice`

```go
// 1. Create the type
type ProtoStringSlice []string

func (p *ProtoStringSlice) Scan(value interface{}) error {
    // Implementation
}

func (p ProtoStringSlice) Value() (driver.Value, error) {
    // Implementation
}

func (p ProtoStringSlice) ToSlice() []string {
    return []string(p)
}

func FromSlice(slice []string) ProtoStringSlice {
    return ProtoStringSlice(slice)
}

// 2. Update post-processor to detect string slice fields
func shouldCustomizeField(fieldName string, fieldType ast.Expr) bool {
    if fieldName == "Labels" {
        return true
    }
    if fieldName == "Tags" { // New field
        return true
    }
    return false
}
```
