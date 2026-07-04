package sqlsvc

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
)

func TestTimeoutWithPostgresGrace(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name    string
		timeout time.Duration
		want    time.Duration
	}{
		{name: "disabled", timeout: 0, want: 0},
		{name: "small timeout gets minimum grace", timeout: 25 * time.Millisecond, want: 75 * time.Millisecond},
		{name: "normal timeout gets ten percent grace", timeout: 2 * time.Second, want: 2200 * time.Millisecond},
		{name: "large timeout gets capped grace", timeout: 60 * time.Second, want: 60500 * time.Millisecond},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			assert.Equal(t, tt.want, timeoutWithPostgresGrace(tt.timeout))
		})
	}
}
