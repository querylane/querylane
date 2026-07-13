package livequery

import (
	"context"
	"sync"

	"github.com/querylane/querylane/backend/engine"
	"github.com/querylane/querylane/backend/resource"
)

type instanceOpener interface {
	OpenInstance(ctx context.Context, name resource.InstanceName) (engine.InstanceSession, error)
}

// SessionOpener applies live-query admission to user-driven managed-PostgreSQL
// sessions. The slot remains held until the returned session closes.
type SessionOpener struct {
	next    instanceOpener
	limiter *Limiter
}

// NewSessionOpener wraps a session opener with non-queuing admission control.
func NewSessionOpener(next instanceOpener, limiter *Limiter) *SessionOpener {
	if next == nil {
		panic("livequery.NewSessionOpener: session opener is required") //nolint:forbidigo // programmer error during DI setup
	}

	if limiter == nil {
		panic("livequery.NewSessionOpener: limiter is required") //nolint:forbidigo // programmer error during DI setup
	}

	return &SessionOpener{next: next, limiter: limiter}
}

// OpenInstance acquires both live-query ceilings before the underlying opener
// can dial the managed instance.
func (o *SessionOpener) OpenInstance(ctx context.Context, name resource.InstanceName) (engine.InstanceSession, error) {
	release, err := o.limiter.Acquire(name)
	if err != nil {
		return nil, err
	}

	session, err := o.next.OpenInstance(ctx, name)
	if err != nil {
		release()

		return nil, err
	}

	return &admittedInstanceSession{
		InstanceSession: session,
		release:         release,
	}, nil
}

type admittedInstanceSession struct {
	engine.InstanceSession

	release Release
	once    sync.Once
	err     error
}

func (s *admittedInstanceSession) Close() error {
	s.once.Do(func() {
		s.err = s.InstanceSession.Close()
		s.release()
	})

	return s.err
}
