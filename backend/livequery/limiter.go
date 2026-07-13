// Package livequery provides process-local admission control for user-driven
// RPCs that hold connections to managed PostgreSQL instances.
package livequery

import (
	"errors"
	"fmt"
	"sync"

	"github.com/querylane/querylane/backend/resource"
)

// Scope identifies which live-query concurrency ceiling rejected a request.
type Scope string

const (
	// ScopeGlobal is the process-wide live-query ceiling.
	ScopeGlobal Scope = "global"
	// ScopeInstance is the ceiling shared by every database in one instance.
	ScopeInstance Scope = "instance"
)

// LimitExceededError reports an immediate admission rejection. Callers should
// surface it as ResourceExhausted instead of waiting for capacity.
type LimitExceededError struct {
	Scope Scope
}

func (e *LimitExceededError) Error() string {
	return fmt.Sprintf("live query %s concurrency limit reached", e.Scope)
}

// Release gives one admitted slot back to a Limiter. It is safe to call more
// than once.
type Release func()

// Limiter atomically enforces a process-wide ceiling and a per-instance
// ceiling. Failed acquisitions never enqueue.
type Limiter struct {
	mu sync.Mutex

	globalLimit      int
	perInstanceLimit int
	active           int
	byInstance       map[resource.InstanceName]int
}

// NewLimiter constructs a Limiter with positive, internally consistent limits.
func NewLimiter(globalLimit, perInstanceLimit int) (*Limiter, error) {
	if globalLimit <= 0 {
		return nil, errors.New("global live query limit must be positive")
	}

	if perInstanceLimit <= 0 {
		return nil, errors.New("per-instance live query limit must be positive")
	}

	if perInstanceLimit > globalLimit {
		return nil, errors.New("per-instance live query limit must not exceed global limit")
	}

	return &Limiter{
		globalLimit:      globalLimit,
		perInstanceLimit: perInstanceLimit,
		byInstance:       make(map[resource.InstanceName]int),
	}, nil
}

// Acquire admits one live query for instance. It returns immediately with a
// LimitExceededError when either ceiling is saturated.
func (l *Limiter) Acquire(instance resource.InstanceName) (Release, error) {
	l.mu.Lock()
	defer l.mu.Unlock()

	if l.active >= l.globalLimit {
		return nil, &LimitExceededError{Scope: ScopeGlobal}
	}

	if l.byInstance[instance] >= l.perInstanceLimit {
		return nil, &LimitExceededError{Scope: ScopeInstance}
	}

	l.active++
	l.byInstance[instance]++
	released := false

	return func() {
		l.mu.Lock()
		defer l.mu.Unlock()

		if released {
			return
		}

		released = true
		l.active--

		remaining := l.byInstance[instance] - 1
		if remaining == 0 {
			delete(l.byInstance, instance)

			return
		}

		l.byInstance[instance] = remaining
	}, nil
}
