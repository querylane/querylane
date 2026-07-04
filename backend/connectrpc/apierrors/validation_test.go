package apierrors_test

import (
	"testing"

	"buf.build/go/protovalidate"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/types/known/fieldmaskpb"

	v1alpha1 "github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1"
)

// TestUpdateMaskCELViolation verifies that the CEL rule on update_mask produces
// a violation with the correct field path and the custom message defined in the
// proto. This is important because CEL violations must be indistinguishable
// from regular constraint violations for clients to handle them uniformly.
func TestUpdateMaskCELViolation(t *testing.T) {
	t.Parallel()

	validator, err := protovalidate.New()
	require.NoError(t, err)

	tests := []struct {
		name    string
		message string
		msg     proto.Message
	}{
		{
			name:    "UpdateInstanceRequest",
			message: "update_mask must specify at least one field",
			msg: &v1alpha1.UpdateInstanceRequest{
				Instance: &v1alpha1.Instance{
					Name:        "instances/test",
					DisplayName: "Test",
				},
				UpdateMask: &fieldmaskpb.FieldMask{
					Paths: []string{}, // empty paths triggers CEL
				},
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			err := validator.Validate(tt.msg)
			require.Error(t, err, "expected validation error for empty update_mask paths")

			var valErr *protovalidate.ValidationError
			require.ErrorAs(t, err, &valErr, "expected protovalidate.ValidationError, got %T", err)

			// Find the update_mask violation among potentially multiple violations.
			var found *protovalidate.Violation

			for _, v := range valErr.Violations {
				fieldPath := protovalidate.FieldPathString(v.Proto.GetField())
				if fieldPath == "update_mask" {
					found = v
					break
				}
			}

			require.NotNil(t, found, "expected a violation for field 'update_mask', got violations: %v", violationSummary(valErr))

			assert.Equal(t, "update_mask", protovalidate.FieldPathString(found.Proto.GetField()),
				"CEL violation must report the correct field path")
			assert.Equal(t, tt.message, found.Proto.GetMessage(),
				"CEL violation must use the custom message from the proto definition")
			assert.Equal(t, "update_mask_non_empty", found.Proto.GetRuleId(),
				"CEL violation must report the rule ID defined in the proto")
		})
	}
}

// TestRequiredFieldViolation verifies that a regular `required = true`
// constraint produces the same violation shape (field path + message) as CEL
// rules, so clients can handle all validation errors uniformly.
func TestRequiredFieldViolation(t *testing.T) {
	t.Parallel()

	validator, err := protovalidate.New()
	require.NoError(t, err)

	tests := []struct {
		name          string
		msg           proto.Message
		expectedField string
	}{
		{
			name: "UpdateInstanceRequest/missing instance name",
			msg: &v1alpha1.UpdateInstanceRequest{
				// Instance is nil — triggers message-level CEL rule.
				// The CEL violation has no field path; we match on empty string.
				UpdateMask: &fieldmaskpb.FieldMask{Paths: []string{"display_name"}},
			},
			expectedField: "",
		},
		{
			name: "CreateInstanceRequest/missing body",
			msg:  &v1alpha1.CreateInstanceRequest{
				// Spec and Instance are nil — triggers message-level exactly-one CEL.
			},
			expectedField: "",
		},
		{
			name: "DeleteInstanceRequest/missing name",
			msg:  &v1alpha1.DeleteInstanceRequest{
				// Name is empty — triggers required = true
			},
			expectedField: "name",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			err := validator.Validate(tt.msg)
			require.Error(t, err, "expected validation error for missing required field")

			var valErr *protovalidate.ValidationError
			require.ErrorAs(t, err, &valErr, "expected protovalidate.ValidationError, got %T", err)

			var found *protovalidate.Violation

			for _, v := range valErr.Violations {
				fieldPath := protovalidate.FieldPathString(v.Proto.GetField())
				if fieldPath == tt.expectedField {
					found = v
					break
				}
			}

			require.NotNil(t, found, "expected a violation for field %q, got violations: %v",
				tt.expectedField, violationSummary(valErr))

			// Both regular and CEL violations must have:
			// 1. A non-empty field path
			assert.Equal(t, tt.expectedField, protovalidate.FieldPathString(found.Proto.GetField()),
				"required violation must report the correct field path")
			// 2. A non-empty human-readable message
			assert.NotEmpty(t, found.Proto.GetMessage(),
				"required violation must have a human-readable message")
			// 3. A rule ID
			assert.NotEmpty(t, found.Proto.GetRuleId(),
				"required violation must have a rule ID")
		})
	}
}

// TestCELAndRequiredViolationsHaveConsistentShape ensures that both CEL and
// regular constraint violations populate the same set of fields in the
// Violation proto, so the connect validate interceptor produces a uniform
// error detail for all validation failures.
func TestCELAndRequiredViolationsHaveConsistentShape(t *testing.T) {
	t.Parallel()

	validator, err := protovalidate.New()
	require.NoError(t, err)

	// Trigger a regular required violation.
	requiredMsg := &v1alpha1.DeleteInstanceRequest{
		// Name is empty — triggers required = true on the name field.
	}
	err = validator.Validate(requiredMsg)
	require.Error(t, err)

	var requiredValErr *protovalidate.ValidationError
	require.ErrorAs(t, err, &requiredValErr)
	require.NotEmpty(t, requiredValErr.Violations)

	var requiredViolation *protovalidate.Violation

	for _, v := range requiredValErr.Violations {
		fieldPath := protovalidate.FieldPathString(v.Proto.GetField())
		if fieldPath == "name" {
			requiredViolation = v
			break
		}
	}

	require.NotNil(t, requiredViolation, "expected a violation for field 'name'")

	// Trigger a CEL violation.
	celMsg := &v1alpha1.UpdateInstanceRequest{
		Instance: &v1alpha1.Instance{
			Name:        "instances/test",
			DisplayName: "Test",
		},
		UpdateMask: &fieldmaskpb.FieldMask{Paths: []string{}},
	}
	err = validator.Validate(celMsg)
	require.Error(t, err)

	var celValErr *protovalidate.ValidationError
	require.ErrorAs(t, err, &celValErr)

	var celViolation *protovalidate.Violation

	for _, v := range celValErr.Violations {
		if protovalidate.FieldPathString(v.Proto.GetField()) == "update_mask" {
			celViolation = v
			break
		}
	}

	require.NotNil(t, celViolation, "expected CEL violation for update_mask")

	// Both violation types must populate the same proto fields.
	assert.NotNil(t, requiredViolation.Proto.GetField(), "required: field path must be set")
	assert.NotNil(t, celViolation.Proto.GetField(), "CEL: field path must be set")

	assert.NotEmpty(t, requiredViolation.Proto.GetMessage(), "required: message must be set")
	assert.NotEmpty(t, celViolation.Proto.GetMessage(), "CEL: message must be set")

	assert.NotEmpty(t, requiredViolation.Proto.GetRuleId(), "required: rule_id must be set")
	assert.NotEmpty(t, celViolation.Proto.GetRuleId(), "CEL: rule_id must be set")

	// Verify the CEL message is exactly what we defined in the proto.
	assert.Equal(t, "update_mask must specify at least one field", celViolation.Proto.GetMessage())
	assert.Equal(t, "update_mask_non_empty", celViolation.Proto.GetRuleId())
}

func TestCreateInstanceCanonicalBodyValidation(t *testing.T) {
	t.Parallel()

	validator, err := protovalidate.New()
	require.NoError(t, err)

	tests := []struct {
		name          string
		msg           *v1alpha1.CreateInstanceRequest
		expectedField string
	}{
		{
			name: "missing config",
			msg: &v1alpha1.CreateInstanceRequest{
				Instance: &v1alpha1.Instance{DisplayName: "Canonical Instance"},
			},
			expectedField: "instance.config",
		},
		{
			name: "invalid label key",
			msg: &v1alpha1.CreateInstanceRequest{
				Instance: &v1alpha1.Instance{
					DisplayName: "Canonical Instance",
					Labels:      map[string]string{"!!": "prod"},
					Config:      validPostgresConfig(),
				},
			},
			expectedField: `instance.labels["!!"]`,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			err := validator.Validate(tt.msg)
			require.Error(t, err)

			var valErr *protovalidate.ValidationError
			require.ErrorAs(t, err, &valErr)

			var found *protovalidate.Violation

			for _, v := range valErr.Violations {
				if protovalidate.FieldPathString(v.Proto.GetField()) == tt.expectedField {
					found = v
					break
				}
			}

			require.NotNil(t, found, "expected violation for %q, got violations: %v", tt.expectedField, violationSummary(valErr))
		})
	}
}

func validPostgresConfig() *v1alpha1.PostgresConfig {
	return &v1alpha1.PostgresConfig{
		Host:     "localhost",
		Port:     5432,
		Database: "postgres",
		Username: "postgres",
		Password: "secret",
		SslMode:  v1alpha1.PostgresConfig_SSL_MODE_DISABLED,
	}
}

// violationSummary returns a concise summary of violations for test failure messages.
func violationSummary(valErr *protovalidate.ValidationError) []string {
	result := make([]string, len(valErr.Violations))
	for i, v := range valErr.Violations {
		result[i] = v.String()
	}

	return result
}
