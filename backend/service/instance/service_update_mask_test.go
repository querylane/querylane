package instance

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"google.golang.org/protobuf/types/known/fieldmaskpb"
)

func TestUpdateMaskTouchesConnectionConfig(t *testing.T) {
	t.Parallel()

	for _, test := range []struct {
		name string
		path string
		want bool
	}{
		{name: "whole config", path: "config", want: true},
		{name: "host", path: "config.host", want: true},
		{name: "password", path: "config.password", want: true},
		{name: "mutation policy", path: "config.allow_mutations", want: false},
		{name: "statement timeout", path: "config.statement_timeout", want: false},
		{name: "display name", path: "display_name", want: false},
	} {
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()

			assert.Equal(t, test.want, updateMaskTouchesConnectionConfig(&fieldmaskpb.FieldMask{Paths: []string{test.path}}))
		})
	}
}
