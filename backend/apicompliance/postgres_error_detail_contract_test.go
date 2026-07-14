package apicompliance

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"google.golang.org/protobuf/reflect/protoreflect"

	api "github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1"
)

func TestPostgreSqlErrorDetailKindContract(t *testing.T) {
	t.Parallel()

	kind := api.File_querylane_console_v1alpha1_errors_proto.Enums().ByName("PostgreSqlErrorKind")
	require.NotNil(t, kind)

	expectedValues := []struct {
		name   protoreflect.Name
		number protoreflect.EnumNumber
	}{
		{name: "POSTGRESQL_ERROR_KIND_UNSPECIFIED", number: 0},
		{name: "POSTGRESQL_ERROR_KIND_INVALID_ARGUMENT", number: 1},
		{name: "POSTGRESQL_ERROR_KIND_FAILED_PRECONDITION", number: 2},
		{name: "POSTGRESQL_ERROR_KIND_NOT_FOUND", number: 3},
		{name: "POSTGRESQL_ERROR_KIND_ALREADY_EXISTS", number: 4},
		{name: "POSTGRESQL_ERROR_KIND_PERMISSION_DENIED", number: 5},
		{name: "POSTGRESQL_ERROR_KIND_UNAUTHENTICATED", number: 6},
		{name: "POSTGRESQL_ERROR_KIND_ABORTED", number: 7},
		{name: "POSTGRESQL_ERROR_KIND_TIMEOUT", number: 8},
		{name: "POSTGRESQL_ERROR_KIND_UNAVAILABLE", number: 9},
		{name: "POSTGRESQL_ERROR_KIND_RESOURCE_EXHAUSTED", number: 10},
		{name: "POSTGRESQL_ERROR_KIND_UNIMPLEMENTED", number: 11},
		{name: "POSTGRESQL_ERROR_KIND_INTERNAL", number: 12},
	}

	for _, expected := range expectedValues {
		value := kind.Values().ByName(expected.name)
		require.NotNil(t, value)
		assert.Equal(t, expected.number, value.Number())
	}

	detail := api.File_querylane_console_v1alpha1_errors_proto.Messages().ByName("PostgreSqlErrorDetail")
	require.NotNil(t, detail)
	kindField := detail.Fields().ByName("kind")
	require.NotNil(t, kindField)
	assert.Equal(t, protoreflect.FieldNumber(6), kindField.Number())
	assert.Equal(t, kind.FullName(), kindField.Enum().FullName())
}

func TestPostgreSqlErrorDetailRetryGuidanceContract(t *testing.T) {
	t.Parallel()

	retryGuidance := api.File_querylane_console_v1alpha1_errors_proto.Enums().ByName("PostgreSqlErrorRetryGuidance")
	require.NotNil(t, retryGuidance)

	expectedValues := []struct {
		name   protoreflect.Name
		number protoreflect.EnumNumber
	}{
		{name: "POSTGRESQL_ERROR_RETRY_GUIDANCE_UNSPECIFIED", number: 0},
		{name: "POSTGRESQL_ERROR_RETRY_GUIDANCE_AFTER_CORRECTION", number: 1},
		{name: "POSTGRESQL_ERROR_RETRY_GUIDANCE_IMMEDIATELY", number: 2},
		{name: "POSTGRESQL_ERROR_RETRY_GUIDANCE_LATER", number: 3},
	}

	for _, expected := range expectedValues {
		value := retryGuidance.Values().ByName(expected.name)
		require.NotNil(t, value)
		assert.Equal(t, expected.number, value.Number())
	}

	detail := api.File_querylane_console_v1alpha1_errors_proto.Messages().ByName("PostgreSqlErrorDetail")
	require.NotNil(t, detail)
	retryGuidanceField := detail.Fields().ByName("retry_guidance")
	require.NotNil(t, retryGuidanceField)
	assert.Equal(t, protoreflect.FieldNumber(7), retryGuidanceField.Number())
	assert.Equal(t, retryGuidance.FullName(), retryGuidanceField.Enum().FullName())
}
