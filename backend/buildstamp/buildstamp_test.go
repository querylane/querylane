package buildstamp

import (
	"runtime/debug"
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestResolveVersion(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name           string
		stampedVersion string
		buildInfo      *debug.BuildInfo
		want           string
	}{
		{
			name:           "release stamp overrides module version",
			stampedVersion: "1.2.3",
			buildInfo:      &debug.BuildInfo{Main: debug.Module{Version: "v9.8.7"}},
			want:           "1.2.3",
		},
		{
			name:           "development stamp preserves tagged module version",
			stampedVersion: "dev",
			buildInfo:      &debug.BuildInfo{Main: debug.Module{Version: "v9.8.7"}},
			want:           "v9.8.7",
		},
		{
			name:           "development stamp remains for local build",
			stampedVersion: "dev",
			buildInfo:      &debug.BuildInfo{Main: debug.Module{Version: "(devel)"}},
			want:           "dev",
		},
		{
			name:           "empty stamp uses module version",
			stampedVersion: "",
			buildInfo:      &debug.BuildInfo{Main: debug.Module{Version: "v9.8.7"}},
			want:           "v9.8.7",
		},
		{
			name:           "missing versions return unknown",
			stampedVersion: "",
			buildInfo:      nil,
			want:           "unknown",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			assert.Equal(t, tt.want, ResolveVersion(tt.stampedVersion, tt.buildInfo))
		})
	}
}
