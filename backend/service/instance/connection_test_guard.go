package instance

import (
	"errors"
	"fmt"
	"net"
	"net/netip"
	"strings"
	"sync"
	"time"

	"connectrpc.com/connect"

	"github.com/querylane/querylane/backend/connectrpc/apierrors"
	v1alpha1 "github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1"
)

const (
	maxConnectionTestCallerBuckets = 4096
	connectionTestBucketIdleAge    = 10 * time.Minute
	connectionTestBucketSweepRate  = time.Minute
	connectionTestOverflowCaller   = "overflow"
	connectionTestRateLimitMessage = "Too many connection attempts. Try again later."
)

var errConnectionTestRateLimitExceeded = errors.New("connection test rate limit exceeded")

type connectionTestBucket struct {
	tokens   float64
	updated  time.Time
	lastSeen time.Time
}

type connectionTestLimiter struct {
	mu sync.Mutex

	perSecond float64
	burst     float64
	now       func() time.Time
	callers   map[string]connectionTestBucket
	lastSweep time.Time
}

func newConnectionTestLimiter(perCallerPerMinute, burst int, now func() time.Time) (*connectionTestLimiter, error) {
	if perCallerPerMinute <= 0 {
		return nil, errors.New("per-caller connection test rate must be positive")
	}

	if burst <= 0 {
		return nil, errors.New("connection test burst must be positive")
	}

	if burst > perCallerPerMinute {
		return nil, errors.New("connection test burst must not exceed per-caller rate")
	}

	return &connectionTestLimiter{
		perSecond: float64(perCallerPerMinute) / 60,
		burst:     float64(burst),
		now:       now,
		callers:   make(map[string]connectionTestBucket),
	}, nil
}

func (l *connectionTestLimiter) Allow(caller string) error {
	l.mu.Lock()
	defer l.mu.Unlock()

	now := l.now()
	caller = l.boundedCallerKey(caller, now)

	bucket, ok := l.callers[caller]
	if !ok {
		bucket = connectionTestBucket{tokens: l.burst, updated: now}
	}

	if elapsed := now.Sub(bucket.updated); elapsed > 0 {
		bucket.tokens = min(l.burst, bucket.tokens+elapsed.Seconds()*l.perSecond)
		bucket.updated = now
	}

	bucket.lastSeen = now

	if bucket.tokens < 1 {
		l.callers[caller] = bucket

		return errConnectionTestRateLimitExceeded
	}

	bucket.tokens--
	l.callers[caller] = bucket

	return nil
}

func (l *connectionTestLimiter) boundedCallerKey(caller string, now time.Time) string {
	if _, ok := l.callers[caller]; ok || len(l.callers) < maxConnectionTestCallerBuckets {
		return caller
	}

	if l.lastSweep.IsZero() || now.Sub(l.lastSweep) >= connectionTestBucketSweepRate {
		for key, bucket := range l.callers {
			if now.Sub(bucket.lastSeen) >= connectionTestBucketIdleAge {
				delete(l.callers, key)
			}
		}

		l.lastSweep = now
	}

	if len(l.callers) < maxConnectionTestCallerBuckets {
		return caller
	}

	return connectionTestOverflowCaller
}

// ConnectionTestGuard owns per-caller admission and whether explicitly
// trusted targets may receive detailed PostgreSQL setup errors.
type ConnectionTestGuard struct {
	limiter              *connectionTestLimiter
	exposeDetailedErrors bool
}

// NewConnectionTestGuard constructs a process-local token-bucket guard.
func NewConnectionTestGuard(perCallerPerMinute, burst int, exposeDetails bool) (*ConnectionTestGuard, error) {
	limiter, err := newConnectionTestLimiter(perCallerPerMinute, burst, time.Now)
	if err != nil {
		return nil, err
	}

	return &ConnectionTestGuard{limiter: limiter, exposeDetailedErrors: exposeDetails}, nil
}

func (g *ConnectionTestGuard) admit(peerAddress string) error {
	if err := g.limiter.Allow(connectionTestCaller(peerAddress)); err != nil {
		if errors.Is(err, errConnectionTestRateLimitExceeded) {
			return apierrors.NewConnectError(
				connect.CodeResourceExhausted,
				fmt.Errorf("%s", connectionTestRateLimitMessage),
				apierrors.NewErrorInfo(
					apierrors.DomainConsole,
					v1alpha1.ErrorReason_CONNECTION_TEST_RATE_LIMIT_EXCEEDED,
				),
			)
		}

		return connect.NewError(connect.CodeInternal, err)
	}

	return nil
}

func connectionTestCaller(peerAddress string) string {
	host, _, err := net.SplitHostPort(peerAddress)
	if err != nil {
		host = peerAddress
	}

	host = strings.Trim(host, "[]")
	if addr, err := netip.ParseAddr(host); err == nil {
		return addr.Unmap().WithZone("").String()
	}

	if host == "" {
		return "unknown"
	}

	return host
}
