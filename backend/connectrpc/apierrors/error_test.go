package apierrors

import (
	"errors"
	"testing"

	"connectrpc.com/connect"
	"github.com/stretchr/testify/assert"

	consolev1alpha1 "github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1"
)

func TestNewDatabaseUnavailableReportsAppDatabaseUnavailable(t *testing.T) {
	t.Parallel()

	connectErr := NewDatabaseUnavailable(errors.New("dial tcp: connection refused"))

	assert.Equal(t, connect.CodeUnavailable, connectErr.Code())

	info := requireErrorInfo(t, connectErr)
	assert.Equal(t, consolev1alpha1.ErrorReason_APP_DATABASE_UNAVAILABLE.String(), info.Reason)
	assert.Equal(t, string(DomainConsole), info.Domain)
}

func TestNewLiveQueryLimitExceededReportsScope(t *testing.T) {
	t.Parallel()

	connectErr := NewLiveQueryLimitExceeded("instance")

	assert.Equal(t, connect.CodeResourceExhausted, connectErr.Code())

	info := requireErrorInfo(t, connectErr)
	assert.Equal(t, consolev1alpha1.ErrorReason_LIVE_QUERY_LIMIT_EXCEEDED.String(), info.Reason)
	assert.Equal(t, string(DomainConsole), info.Domain)
	assert.Equal(t, "instance", info.Metadata["scope"])
}
