package resource

import (
	"errors"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestInstanceName(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name    string
		input   string
		want    InstanceName
		wantErr bool
	}{
		{
			name:  "valid instance",
			input: "instances/inst1",
			want:  InstanceName{InstanceID: "inst1"},
		},
		{
			name:    "wrong collection",
			input:   "instance/inst1",
			wantErr: true,
		},
		{
			name:    "too many segments",
			input:   "instances/inst1/extra",
			wantErr: true,
		},
		{
			name:    "empty instance ID",
			input:   "instances/",
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			got, err := ParseInstanceName(tt.input)
			if (err != nil) != tt.wantErr {
				t.Errorf("ParseInstanceName() error = %v, wantErr %v", err, tt.wantErr)
				return
			}

			if !tt.wantErr && got != tt.want {
				t.Errorf("ParseInstanceName() = %v, want %v", got, tt.want)
			}

			// Test round-trip for valid cases
			if !tt.wantErr && got.String() != tt.input {
				t.Errorf("String() round-trip failed: got %q, want %q", got.String(), tt.input)
			}
		})
	}
}

func TestDatabaseName(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name    string
		input   string
		want    DatabaseName
		wantErr bool
	}{
		{
			name:  "valid database",
			input: "instances/inst1/databases/db1",
			want:  DatabaseName{InstanceID: "inst1", DatabaseID: "db1"},
		},
		{
			name:    "too few segments",
			input:   "instances/inst1",
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			got, err := ParseDatabaseName(tt.input)
			if (err != nil) != tt.wantErr {
				t.Errorf("ParseDatabaseName() error = %v, wantErr %v", err, tt.wantErr)
				return
			}

			if !tt.wantErr && got != tt.want {
				t.Errorf("ParseDatabaseName() = %v, want %v", got, tt.want)
			}

			// Test Parent() relationship
			if !tt.wantErr {
				parent := got.Parent()

				expectedParent := InstanceName{InstanceID: got.InstanceID}
				if parent != expectedParent {
					t.Errorf("Parent() = %v, want %v", parent, expectedParent)
				}
			}
		})
	}
}

func TestValidateResourceID(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name    string
		input   string
		wantErr bool
	}{
		{name: "alphanumeric", input: "my-workspace_01", wantErr: false},
		{name: "with dots", input: "public.users", wantErr: false},
		{name: "with spaces", input: "my table", wantErr: false},
		{name: "unicode", input: "données", wantErr: false},
		{name: "single char", input: "x", wantErr: false},
		{name: "max length", input: strings.Repeat("a", 256), wantErr: false},
		{name: "null byte", input: "bad\x00id", wantErr: true},
		{name: "control char", input: "bad\x01id", wantErr: true},
		{name: "newline", input: "bad\nid", wantErr: true},
		{name: "del char", input: "bad\x7fid", wantErr: true},
		{name: "exceeds max length", input: strings.Repeat("a", 257), wantErr: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			err := validateResourceID(tt.input)
			if (err != nil) != tt.wantErr {
				t.Errorf("validateResourceID(%q) error = %v, wantErr %v", tt.input, err, tt.wantErr)
			}
		})
	}
}

func TestValidateResourceIDViaParser(t *testing.T) {
	t.Parallel()

	// Ensure validation is integrated into parse() for variable segments.
	_, err := ParseInstanceName("instances/bad\x00id")
	if err == nil {
		t.Fatal("expected error for null byte in instance ID")
	}

	if !errors.Is(err, ErrInvalidName) {
		t.Errorf("error should wrap ErrInvalidName, got %v", err)
	}
}

func TestMatch(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name    string
		pattern string
		input   string
		want    bool
	}{
		// Matching cases
		{name: "instance match", pattern: InstancePattern, input: "instances/inst1", want: true},
		{name: "database match", pattern: DatabasePattern, input: "instances/inst1/databases/db1", want: true},
		{name: "schema match", pattern: SchemaPattern, input: "instances/inst1/databases/db1/schemas/public", want: true},
		{name: "table match", pattern: TablePattern, input: "instances/inst1/databases/db1/schemas/public/tables/users", want: true},

		// Non-matching cases
		{name: "wrong collection", pattern: InstancePattern, input: "projects/proj1", want: false},
		{name: "too few segments", pattern: DatabasePattern, input: "instances/inst1", want: false},
		{name: "too many segments", pattern: InstancePattern, input: "instances/inst1/databases/db1", want: false},
		{name: "empty variable segment", pattern: InstancePattern, input: "instances/", want: false},

		// Edge cases
		{name: "empty pattern and name", pattern: "", input: "", want: true},
		{name: "empty pattern non-empty name", pattern: "", input: "instances/inst1", want: false},
		{name: "non-empty pattern empty name", pattern: InstancePattern, input: "", want: false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			got := Match(tt.pattern, tt.input)
			if got != tt.want {
				t.Errorf("Match(%q, %q) = %v, want %v", tt.pattern, tt.input, got, tt.want)
			}
		})
	}
}

func TestParseError(t *testing.T) {
	t.Parallel()

	_, err := ParseInstanceName("invalid/name/format")
	if err == nil {
		t.Fatal("expected error for invalid name")
	}

	// Check that it wraps ErrInvalidName
	if !errors.Is(err, ErrInvalidName) {
		t.Errorf("error should wrap ErrInvalidName, got %v", err)
	}

	// Check if it's a ParseError
	var parseErr *ParseError
	if !errors.As(err, &parseErr) {
		t.Errorf("error should be a ParseError, got %T", err)
	} else if parseErr.Segment == 0 {
		t.Errorf("ParseError.Segment should not be zero, got %d", parseErr.Segment)
	}
}

func TestResourceNameSpecialCharacterRoundTrip(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name string
		id   string
		wire string
	}{
		{name: "plain", id: "db1", wire: "db1"},
		{name: "slash", id: "foo/bar", wire: "foo%2Fbar"},
		{name: "percent", id: "100%", wire: "100%25"},
		{name: "slash and percent", id: "a/b%c", wire: "a%2Fb%25c"},
		{name: "literal escape sequence", id: "a%2Fb", wire: "a%252Fb"},
	}

	for _, tt := range tests {
		t.Run("database "+tt.name, func(t *testing.T) {
			t.Parallel()

			n := NewDatabaseName("inst1", tt.id)
			require.Equal(t, "instances/inst1/databases/"+tt.wire, n.String())

			parsed, err := ParseDatabaseName(n.String())
			require.NoError(t, err)
			assert.Equal(t, n, parsed)
			assert.Equal(t, tt.id, parsed.DatabaseID)
		})

		t.Run("schema "+tt.name, func(t *testing.T) {
			t.Parallel()

			n := NewSchemaName("inst1", tt.id, tt.id)
			require.Equal(t, "instances/inst1/databases/"+tt.wire+"/schemas/"+tt.wire, n.String())

			parsed, err := ParseSchemaName(n.String())
			require.NoError(t, err)
			assert.Equal(t, n, parsed)
			assert.Equal(t, tt.id, parsed.DatabaseID)
			assert.Equal(t, tt.id, parsed.SchemaID)
		})

		t.Run("table "+tt.name, func(t *testing.T) {
			t.Parallel()

			n := NewTableName("inst1", tt.id, tt.id, tt.id)
			require.Equal(t, "instances/inst1/databases/"+tt.wire+"/schemas/"+tt.wire+"/tables/"+tt.wire, n.String())

			parsed, err := ParseTableName(n.String())
			require.NoError(t, err)
			assert.Equal(t, n, parsed)
			assert.Equal(t, tt.id, parsed.DatabaseID)
			assert.Equal(t, tt.id, parsed.SchemaID)
			assert.Equal(t, tt.id, parsed.TableID)
		})

		t.Run("view "+tt.name, func(t *testing.T) {
			t.Parallel()

			n := NewViewName("inst1", tt.id, tt.id, tt.id)
			require.Equal(t, "instances/inst1/databases/"+tt.wire+"/schemas/"+tt.wire+"/views/"+tt.wire, n.String())

			parsed, err := ParseViewName(n.String())
			require.NoError(t, err)
			assert.Equal(t, n, parsed)
			assert.Equal(t, tt.id, parsed.ViewID)
		})
	}
}

func TestDatabaseNameWithSlashRoundTripsListToGet(t *testing.T) {
	t.Parallel()

	// List formats the name of a database literally called "foo/bar".
	listName := NewDatabaseName("inst1", "foo/bar").String()

	// The wire name must still be a valid two-variable database name so the
	// Get/ListSchemas proto pattern ([^/]+ per segment) and parser accept it.
	assert.True(t, Match(DatabasePattern, listName))

	parsed, err := ParseDatabaseName(listName)
	require.NoError(t, err)
	assert.Equal(t, "foo/bar", parsed.DatabaseID, "Get must see the raw PostgreSQL identifier")
	assert.Equal(t, listName, parsed.String(), "re-formatting must be stable")
}

func TestRoleName(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name     string
		roleName string
	}{
		{name: "simple", roleName: "app_user"},
		{name: "slash", roleName: "app/user"},
		{name: "space", roleName: "app user"},
		{name: "unicode", roleName: "données"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			got := NewRoleName("inst1", tt.roleName)

			parsed, err := ParseRoleName(got.String())
			require.NoError(t, err)

			decoded := parsed.PostgresRoleName()

			assert.Equal(t, tt.roleName, decoded)
			assert.Equal(t, InstanceName{InstanceID: "inst1"}, parsed.Parent())
		})
	}
}

func TestParseRoleNameRejectsMalformedRoleID(t *testing.T) {
	t.Parallel()

	_, err := ParseRoleName("instances/inst1/roles/not@base64")
	require.Error(t, err, "expected error for malformed encoded role ID")
}

func TestParseRoleNameRejectsWrongSegmentCount(t *testing.T) {
	t.Parallel()

	_, err := ParseRoleName("instances/inst1")
	require.Error(t, err)
	require.ErrorIs(t, err, ErrInvalidName)
}

func TestNewInstanceName(t *testing.T) {
	t.Parallel()

	name := NewInstanceName("inst1")

	assert.Equal(t, InstanceName{InstanceID: "inst1"}, name)
	assert.Equal(t, TypeInstance, name.ResourceType())
}

func TestMustParseInstanceName(t *testing.T) {
	t.Parallel()

	assert.Equal(t, InstanceName{InstanceID: "inst1"}, MustParseInstanceName("instances/inst1"))
	require.Panics(t, func() { MustParseInstanceName("bogus") })
}

func TestInstanceNameIsZero(t *testing.T) {
	t.Parallel()

	assert.True(t, InstanceName{}.IsZero())
	assert.False(t, NewInstanceName("inst1").IsZero())
}

func TestInstanceNameTextRoundTrip(t *testing.T) {
	t.Parallel()

	data, err := NewInstanceName("inst1").MarshalText()
	require.NoError(t, err)
	assert.Equal(t, "instances/inst1", string(data))

	var parsed InstanceName
	require.NoError(t, parsed.UnmarshalText(data))
	assert.Equal(t, NewInstanceName("inst1"), parsed)

	require.Error(t, parsed.UnmarshalText([]byte("bogus")))
	assert.Equal(t, NewInstanceName("inst1"), parsed, "failed unmarshal must not modify the receiver")
}

func TestNewDatabaseName(t *testing.T) {
	t.Parallel()

	name := NewDatabaseName("inst1", "db1")

	assert.Equal(t, DatabaseName{InstanceID: "inst1", DatabaseID: "db1"}, name)
	assert.Equal(t, "instances/inst1/databases/db1", name.String())
	assert.Equal(t, TypeDatabase, name.ResourceType())
	assert.Equal(t, InstanceName{InstanceID: "inst1"}, name.Instance())
	assert.Equal(t, "instances/inst1", name.InstanceName())
}

func TestMustParseDatabaseName(t *testing.T) {
	t.Parallel()

	want := DatabaseName{InstanceID: "inst1", DatabaseID: "db1"}
	assert.Equal(t, want, MustParseDatabaseName("instances/inst1/databases/db1"))
	require.Panics(t, func() { MustParseDatabaseName("bogus") })
}

func TestDatabaseNameIsZero(t *testing.T) {
	t.Parallel()

	assert.True(t, DatabaseName{}.IsZero())
	assert.False(t, NewDatabaseName("inst1", "db1").IsZero())
	assert.False(t, DatabaseName{DatabaseID: "db1"}.IsZero())
}

func TestDatabaseNameTextRoundTrip(t *testing.T) {
	t.Parallel()

	name := NewDatabaseName("inst1", "db1")

	data, err := name.MarshalText()
	require.NoError(t, err)
	assert.Equal(t, "instances/inst1/databases/db1", string(data))

	var parsed DatabaseName
	require.NoError(t, parsed.UnmarshalText(data))
	assert.Equal(t, name, parsed)

	require.Error(t, parsed.UnmarshalText([]byte("bogus")))
	assert.Equal(t, name, parsed, "failed unmarshal must not modify the receiver")
}

func TestMustParseRoleName(t *testing.T) {
	t.Parallel()

	name := NewRoleName("inst1", "app_user")

	parsed := MustParseRoleName(name.String())
	assert.Equal(t, name, parsed)
	assert.Equal(t, "app_user", parsed.PostgresRoleName())

	require.Panics(t, func() { MustParseRoleName("bogus") })
}

func TestRoleNameMethods(t *testing.T) {
	t.Parallel()

	name := NewRoleName("inst1", "app_user")

	assert.Equal(t, TypeRole, name.ResourceType())
	assert.Equal(t, InstanceName{InstanceID: "inst1"}, name.Instance())
	assert.Equal(t, "instances/inst1", name.InstanceName())
	assert.Equal(t, "instances/inst1/roles/"+EncodeRoleID("app_user"), name.String())
}

func TestRoleNameIsZero(t *testing.T) {
	t.Parallel()

	assert.True(t, RoleName{}.IsZero())
	assert.False(t, NewRoleName("inst1", "app_user").IsZero())
}

func TestRoleNameTextRoundTrip(t *testing.T) {
	t.Parallel()

	name := NewRoleName("inst1", "app user/with slash")

	data, err := name.MarshalText()
	require.NoError(t, err)

	var parsed RoleName
	require.NoError(t, parsed.UnmarshalText(data))
	assert.Equal(t, name, parsed)
	assert.Equal(t, "app user/with slash", parsed.PostgresRoleName())

	require.Error(t, parsed.UnmarshalText([]byte("bogus")))
	assert.Equal(t, name, parsed, "failed unmarshal must not modify the receiver")
}
