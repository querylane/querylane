package role

import (
	"slices"
	"strings"
	"testing"

	"github.com/querylane/querylane/backend/engine"
	v1alpha1 "github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1"
)

// These tests pin the shared engine token slices (which back the object_type
// FilterValues set) to the service-layer enum mapping: every token the filter
// engine accepts must map to a concrete proto enum, and vice versa. The
// reverse direction catches the drift where a new proto enum (plus SQL CASE
// arm) is added but the token slice is forgotten — rows with the new type
// would be returned while FilterValues rejects filtering on it.

func TestGrantObjectTypeTokensFullyMapped(t *testing.T) {
	t.Parallel()

	for _, token := range engine.GrantObjectTypeTokens {
		if got := grantObjectType(token); got == v1alpha1.GrantObjectType_GRANT_OBJECT_TYPE_UNSPECIFIED {
			t.Errorf("grantObjectType(%q) = UNSPECIFIED, token not mapped", token)
		}
	}

	for value, name := range v1alpha1.GrantObjectType_name {
		if value == int32(v1alpha1.GrantObjectType_GRANT_OBJECT_TYPE_UNSPECIFIED) {
			continue
		}

		token := strings.TrimPrefix(name, "GRANT_OBJECT_TYPE_")
		if !slices.Contains(engine.GrantObjectTypeTokens, token) {
			t.Errorf("proto enum %s has no token in engine.GrantObjectTypeTokens", name)
		}
	}
}

func TestDefaultPrivilegeObjectTypeTokensFullyMapped(t *testing.T) {
	t.Parallel()

	for _, token := range engine.DefaultPrivilegeObjectTypeTokens {
		if got := defaultPrivilegeObjectType(token); got == v1alpha1.DefaultPrivilegeObjectType_DEFAULT_PRIVILEGE_OBJECT_TYPE_UNSPECIFIED {
			t.Errorf("defaultPrivilegeObjectType(%q) = UNSPECIFIED, token not mapped", token)
		}
	}

	for value, name := range v1alpha1.DefaultPrivilegeObjectType_name {
		if value == int32(v1alpha1.DefaultPrivilegeObjectType_DEFAULT_PRIVILEGE_OBJECT_TYPE_UNSPECIFIED) {
			continue
		}

		token := strings.TrimPrefix(name, "DEFAULT_PRIVILEGE_OBJECT_TYPE_")
		if !slices.Contains(engine.DefaultPrivilegeObjectTypeTokens, token) {
			t.Errorf("proto enum %s has no token in engine.DefaultPrivilegeObjectTypeTokens", name)
		}
	}
}
