# Proto-Compatible Types

This package provides custom types that seamlessly bridge the gap between protobuf types and PostgreSQL database types, eliminating the need for manual JSON marshaling/unmarshaling in mappers.

## Overview

The traditional approach required manual JSON handling in mapper functions:

```go
// OLD APPROACH - Manual JSON handling
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
// NEW APPROACH - Type-safe with explicit conversion
workspace := &api.Workspace{
    Labels: w.Labels.ToMap(),
    CreateTime: timestamppb.New(w.CreatedAt),
}

// For INSERT operations - explicit ToJSONB() required for type safety
stmt := table.Workspace.
    INSERT(table.Workspace.Labels).
    VALUES(labels.ToJSONB()) // ← Compile-time type safety
```

## Custom Types

### StringMap

**Purpose**: Maps `map[string]string` (protobuf) <-> `JSONB` (PostgreSQL)

**Usage**:
```go
// In generated model (automatically applied via go-jet template)
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

**Features**:
- Automatic JSON marshaling/unmarshaling
- Null-safe operations
- Error handling with detailed messages
- Empty value handling

## Integration with go-jet

### Automated Model Generation

The system uses go-jet with custom template generation:

1. **Schema Discovery**: Connects to PostgreSQL database and discovers tables/columns
2. **Template Customization**: Applies custom type mappings for JSONB fields during generation
3. **Code Generation**: Generates models with proper imports and type references

### Generation Process

```bash
task sql:generate
```

This runs:
`go run tools/jet_generator.go <dsn>` - Custom go-jet generation with template hooks

### Current Type Mappings

- **All JSONB columns named "labels"**  -> `types.StringMap` (generic string map storage)
- **Other types** → Default go-jet types

### Generated Code Example

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

1. **Type Safety**: Compile-time validation for all mappings
2. **Performance**: No runtime JSON marshaling overhead in mappers
3. **Maintainability**: Automated type application, no manual model editing
4. **Scalability**: Easy to add new proto types via post-processor
5. **Idiomatic**: Clean, readable Go code following conventions

## Extension Pattern

To add support for new proto types:

1. Create a new type in `backend/storage/types/`
2. Implement `sql.Scanner` and `driver.Valuer` interfaces
3. Add conversion methods (e.g., `ToMap()`, `FromMap()`)
4. Update `tools/post_process_models.go` to detect and apply the new type
5. Use in mappers with direct assignment

### Example: Adding ProtoStringSlice

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
