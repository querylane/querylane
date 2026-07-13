package livequery

import (
	"context"
	"errors"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/querylane/querylane/backend/engine"
	"github.com/querylane/querylane/backend/resource"
)

type stubInstanceSession struct {
	engine.InstanceSession

	closeCalls int
}

func (s *stubInstanceSession) Close() error {
	s.closeCalls++

	return nil
}

type stubSessionOpener struct {
	session engine.InstanceSession
	err     error
}

func (s *stubSessionOpener) OpenInstance(context.Context, resource.InstanceName) (engine.InstanceSession, error) {
	return s.session, s.err
}

func TestSessionOpenerHoldsAdmissionUntilSessionCloses(t *testing.T) {
	t.Parallel()

	limiter, err := NewLimiter(1, 1)
	require.NoError(t, err)

	underlying := &stubInstanceSession{}
	opener := NewSessionOpener(&stubSessionOpener{session: underlying}, limiter)
	instance := resource.NewInstanceName("prod")

	session, err := opener.OpenInstance(t.Context(), instance)
	require.NoError(t, err)

	_, err = opener.OpenInstance(t.Context(), instance)

	var limitErr *LimitExceededError
	require.ErrorAs(t, err, &limitErr)
	assert.Equal(t, ScopeGlobal, limitErr.Scope)

	require.NoError(t, session.Close())
	require.NoError(t, session.Close())
	assert.Equal(t, 1, underlying.closeCalls)

	second, err := opener.OpenInstance(t.Context(), instance)
	require.NoError(t, err)
	require.NoError(t, second.Close())
}

func TestSessionOpenerReleasesAdmissionWhenOpenFails(t *testing.T) {
	t.Parallel()

	limiter, err := NewLimiter(1, 1)
	require.NoError(t, err)

	wantErr := errors.New("open failed")
	opener := NewSessionOpener(&stubSessionOpener{err: wantErr}, limiter)
	instance := resource.NewInstanceName("prod")

	_, err = opener.OpenInstance(t.Context(), instance)
	require.ErrorIs(t, err, wantErr)

	release, err := limiter.Acquire(instance)
	require.NoError(t, err)
	release()
}
