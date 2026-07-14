package instance

import (
	"context"
	"errors"
	"fmt"
	"net"
	"testing"

	"connectrpc.com/connect"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"google.golang.org/genproto/googleapis/rpc/errdetails"

	"github.com/querylane/querylane/backend/engine"
	v1alpha1 "github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1"
)

func TestConnectionTestErrorPreservesContextSemantics(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name string
		err  error
		code connect.Code
	}{
		{
			name: "canceled",
			err:  context.Canceled,
			code: connect.CodeCanceled,
		},
		{
			name: "deadline-exceeded",
			err:  context.DeadlineExceeded,
			code: connect.CodeDeadlineExceeded,
		},
		{
			name: "connection-failure",
			err:  errors.New("dial tcp: connection refused"),
			code: connect.CodeUnavailable,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			err := connectionTestErrorWithDetails(context.Background(), "config", "", tt.err, true)
			assert.Equal(t, tt.code, err.Code())
		})
	}
}

func TestConnectionTestLogErrorRedactsPostgresMessage(t *testing.T) {
	t.Parallel()

	value := connectionTestLogError(&pgconn.PgError{
		Code:    "28P01",
		Message: "password authentication failed api_key=secret",
	})

	assert.Contains(t, value, "28P01")
	assert.NotContains(t, value, "api_key=secret")
}

func TestConnectionTestErrorClassifiesPostgresSQLStates(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name               string
		field              string
		sqlstate           string
		wantCode           connect.Code
		wantReason         v1alpha1.ErrorReason
		wantMessage        string
		wantViolationPaths []string
	}{
		{
			name:        "invalid password points at password",
			field:       "spec.config",
			sqlstate:    "28P01",
			wantCode:    connect.CodeUnauthenticated,
			wantReason:  v1alpha1.ErrorReason_UNAUTHENTICATED,
			wantMessage: "PostgreSQL 28P01: server message for 28P01",
			wantViolationPaths: []string{
				"spec.config.password",
			},
		},
		{
			name:        "database not found points at database",
			field:       "config",
			sqlstate:    "3D000",
			wantCode:    connect.CodeNotFound,
			wantReason:  v1alpha1.ErrorReason_RESOURCE_NOT_FOUND,
			wantMessage: "PostgreSQL 3D000: server message for 3D000",
			wantViolationPaths: []string{
				"config.database",
			},
		},
		{
			name:        "connection exception points at reachability fields",
			field:       "instance.config",
			sqlstate:    "08006",
			wantCode:    connect.CodeUnavailable,
			wantReason:  v1alpha1.ErrorReason_FAILED_PRECONDITION,
			wantMessage: "PostgreSQL 08006: server message for 08006",
			wantViolationPaths: []string{
				"instance.config.host",
				"instance.config.port",
			},
		},
		{
			name:               "too many connections is server state",
			field:              "spec.config",
			sqlstate:           "53300",
			wantCode:           connect.CodeResourceExhausted,
			wantReason:         v1alpha1.ErrorReason_FAILED_PRECONDITION,
			wantMessage:        "PostgreSQL 53300: server message for 53300",
			wantViolationPaths: nil,
		},
		{
			name:               "server starting is retryable state",
			field:              "spec.config",
			sqlstate:           "57P03",
			wantCode:           connect.CodeUnavailable,
			wantReason:         v1alpha1.ErrorReason_FAILED_PRECONDITION,
			wantMessage:        "PostgreSQL 57P03: server message for 57P03",
			wantViolationPaths: nil,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			rawErr := &pgconn.PgError{
				Code:    tt.sqlstate,
				Message: "server message for " + tt.sqlstate,
			}

			connectErr := connectionTestErrorWithDetails(context.Background(), tt.field, "", fmt.Errorf("probe failed: %w", rawErr), true)

			require.NotNil(t, connectErr)
			assert.Equal(t, tt.wantCode, connectErr.Code())
			assert.Contains(t, connectErr.Message(), tt.wantMessage)
			assert.ElementsMatch(t, tt.wantViolationPaths, badRequestViolationFields(t, connectErr))

			info := requireConnectionErrorInfo(t, connectErr)
			assert.Equal(t, tt.wantReason.String(), info.Reason)
			assert.Equal(t, tt.sqlstate, info.Metadata["sqlstate"])
		})
	}
}

func TestConnectionTestErrorCoarsensUntrustedFailures(t *testing.T) {
	t.Parallel()

	errorsToCompare := []error{
		&pgconn.PgError{Code: "28P01", Message: "password rejected"},
		&pgconn.PgError{Code: "3D000", Message: "database missing"},
		&net.OpError{Op: "dial", Net: "tcp", Err: errors.New("connection refused")},
	}

	for _, rawErr := range errorsToCompare {
		connectErr := connectionTestErrorWithDetails(context.Background(), "config", "", rawErr, false)

		assert.Equal(t, connect.CodeUnavailable, connectErr.Code())
		assert.Equal(t, "Could not connect to PostgreSQL with these settings.", connectErr.Message())
		assert.Empty(t, badRequestViolationFields(t, connectErr))
		assert.NotContains(t, connectErr.Message(), rawErr.Error())
	}
}

func TestConnectionTestErrorNeverExposesBlockedTarget(t *testing.T) {
	t.Parallel()

	rawErr := fmt.Errorf("dial 169.254.169.254: %w", engine.ErrTargetNotAllowed)
	connectErr := connectionTestErrorWithDetails(context.Background(), "config", "", rawErr, true)

	assert.Equal(t, connect.CodeUnavailable, connectErr.Code())
	assert.Equal(t, "Could not connect to PostgreSQL with these settings.", connectErr.Message())
	assert.NotContains(t, connectErr.Message(), "169.254.169.254")
}

func TestConnectionTestErrorMapsReachabilityFailureToHostAndPort(t *testing.T) {
	t.Parallel()

	connectErr := connectionTestErrorWithDetails(
		context.Background(),
		"spec.config",
		"",
		&net.OpError{
			Op:  "dial",
			Net: "tcp",
			Err: errors.New("connect: connection refused"),
		},
		true,
	)

	require.NotNil(t, connectErr)
	assert.Equal(t, connect.CodeUnavailable, connectErr.Code())
	assert.Contains(t, connectErr.Message(), "PostgreSQL is unreachable")
	assert.NotContains(t, connectErr.Message(), "127.0.0.1")
	assert.ElementsMatch(t, []string{
		"spec.config.host",
		"spec.config.port",
	}, badRequestViolationFields(t, connectErr))
}

func badRequestViolationFields(t *testing.T, connectErr *connect.Error) []string {
	t.Helper()

	fields := []string{}

	for _, detail := range connectErr.Details() {
		value, err := detail.Value()
		require.NoError(t, err)

		badRequest, ok := value.(*errdetails.BadRequest)
		if !ok {
			continue
		}

		for _, violation := range badRequest.FieldViolations {
			fields = append(fields, violation.Field)
		}
	}

	return fields
}

func requireConnectionErrorInfo(t *testing.T, connectErr *connect.Error) *errdetails.ErrorInfo {
	t.Helper()

	for _, detail := range connectErr.Details() {
		value, err := detail.Value()
		require.NoError(t, err)

		if info, ok := value.(*errdetails.ErrorInfo); ok {
			return info
		}
	}

	t.Fatal("expected ErrorInfo detail")

	return nil
}
