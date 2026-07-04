package types

import (
	"database/sql/driver"
	"encoding/json"
	"fmt"
	"maps"
	"strings"

	"github.com/go-jet/jet/v2/postgres"
)

// StringMap represents a map[string]string that can be stored as JSONB in PostgreSQL
// and seamlessly converted to/from proto map fields.
type StringMap map[string]string //nolint:recvcheck

// Scan implements the sql.Scanner interface for reading from database.
func (s *StringMap) Scan(value any) error {
	if value == nil {
		*s = make(StringMap)
		return nil
	}

	switch v := value.(type) {
	case []byte:
		if len(v) == 0 {
			*s = make(StringMap)
			return nil
		}

		if err := json.Unmarshal(v, s); err != nil {
			return fmt.Errorf("invalid JSON in StringMap: %w", err)
		}
	case string:
		if v == "" {
			*s = make(StringMap)
			return nil
		}

		if err := json.Unmarshal([]byte(v), s); err != nil {
			return fmt.Errorf("invalid JSON string in StringMap: %w", err)
		}
	default:
		return fmt.Errorf("cannot scan %T into StringMap", value)
	}

	return nil
}

// Value implements the driver.Valuer interface for writing to database.
func (s StringMap) Value() (driver.Value, error) {
	if s == nil {
		return "{}", nil
	}

	return json.Marshal(s)
}

// ToMap converts StringMap to a regular map[string]string for proto assignment.
func (s StringMap) ToMap() map[string]string {
	if s == nil {
		return make(map[string]string)
	}

	result := make(map[string]string, len(s))
	maps.Copy(result, s)

	return result
}

// FromMap creates StringMap from a regular map[string]string.
func FromMap(m map[string]string) StringMap {
	if m == nil {
		return make(StringMap)
	}

	result := make(StringMap, len(m))
	maps.Copy(result, m)

	return result
}

// ToJSONB converts StringMap to a PostgreSQL JSONB expression for type-safe VALUES() usage.
func (s StringMap) ToJSONB() postgres.StringExpression {
	jsonBytes, err := json.Marshal(s)
	if err != nil {
		// Fallback to empty JSON object if marshaling fails
		return postgres.StringExp(postgres.Raw("'{}'::jsonb"))
	}
	// Escape single quotes in the JSON string and wrap in jsonb cast
	jsonStr := string(jsonBytes)
	escapedStr := fmt.Sprintf("'%s'::jsonb", escapePostgresString(jsonStr))

	return postgres.StringExp(postgres.Raw(escapedStr))
}

// escapePostgresString escapes single quotes for PostgreSQL string literals.
func escapePostgresString(s string) string {
	// In PostgreSQL, single quotes are escaped by doubling them
	return strings.ReplaceAll(s, "'", "''")
}

// EQ provides type-safe equality comparison for StringMap.
func (s StringMap) EQ(other StringMap) postgres.BoolExpression {
	return s.ToJSONB().EQ(other.ToJSONB())
}

// Contains checks if the StringMap contains a specific key.
func (s StringMap) Contains(key string) postgres.BoolExpression {
	return postgres.BoolExp(postgres.Raw(fmt.Sprintf("(%s ? %s)", s.ToJSONB(), postgres.String(key))))
}

// GetValue extracts a value for a specific key.
func (s StringMap) GetValue(key string) postgres.StringExpression {
	return postgres.StringExp(postgres.Raw(fmt.Sprintf("(%s ->> %s)", s.ToJSONB(), postgres.String(key))))
}

// StringMapEQ provides compile-time type safety for StringMap equality comparisons.
func StringMapEQ(column postgres.ColumnString, value StringMap) postgres.BoolExpression {
	return column.EQ(value.ToJSONB())
}

// StringMapContains provides type-safe JSONB key existence checks.
func StringMapContains(column postgres.ColumnString, key string) postgres.BoolExpression {
	return postgres.BoolExp(postgres.Func("jsonb_exists", column, postgres.String(key)))
}

// StringMapGetValue extracts a value for a specific key from a JSONB column.
func StringMapGetValue(column postgres.ColumnString, key string) postgres.StringExpression {
	return postgres.StringExp(postgres.Func("jsonb_extract_path_text", column, postgres.String(key)))
}

// StringMapSET provides type-safe assignment for UPDATE operations.
func StringMapSET(column postgres.ColumnString, value StringMap) postgres.ColumnAssigment {
	return column.SET(value.ToJSONB())
}

// InsertStringMap provides compile-time type safety for INSERT operations.
func InsertStringMap(insertStmt postgres.InsertStatement, _ postgres.ColumnString, value StringMap) postgres.InsertStatement {
	return insertStmt.VALUES(value.ToJSONB())
}

// MarshalJSON implements json.Marshaler for JSON serialization.
func (s StringMap) MarshalJSON() ([]byte, error) {
	return json.Marshal(map[string]string(s))
}

// UnmarshalJSON implements json.Unmarshaler for JSON deserialization.
func (s *StringMap) UnmarshalJSON(data []byte) error {
	var m map[string]string
	if err := json.Unmarshal(data, &m); err != nil {
		return err
	}

	*s = StringMap(m)

	return nil
}
