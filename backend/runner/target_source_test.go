package runner

import (
	"context"
	"errors"
	"fmt"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	api "github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1"
)

// --- Mocks ---

type mockInstanceReader struct {
	pages   [][]*api.Instance
	listErr error
}

func (r *mockInstanceReader) ListInstances(_ context.Context, _ int32, pageToken string, _ string, _ string) ([]*api.Instance, string, error) {
	if r.listErr != nil {
		return nil, "", r.listErr
	}

	pageIdx := 0

	if pageToken != "" {
		for i := range r.pages {
			if pageToken == pageTokenFor(i) {
				pageIdx = i
				break
			}
		}
	}

	if pageIdx >= len(r.pages) {
		return nil, "", nil
	}

	nextToken := ""
	if pageIdx+1 < len(r.pages) {
		nextToken = pageTokenFor(pageIdx + 1)
	}

	return r.pages[pageIdx], nextToken, nil
}

func (r *mockInstanceReader) GetInstance(context.Context, string) (*api.Instance, error) {
	return nil, errors.New("unexpected GetInstance call")
}

func pageTokenFor(idx int) string {
	return fmt.Sprintf("page-%d", idx)
}

// --- Tests ---

func TestInstanceTargetSource_ListTargets(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name        string
		pages       [][]*api.Instance
		wantTargets int
	}{
		{
			name:        "empty",
			pages:       [][]*api.Instance{nil},
			wantTargets: 0,
		},
		{
			name: "single_page",
			pages: [][]*api.Instance{
				{
					{Name: "instances/a"},
					{Name: "instances/b"},
					{Name: "instances/c"},
				},
			},
			wantTargets: 3,
		},
		{
			name: "multi_page",
			pages: [][]*api.Instance{
				{
					{Name: "instances/a"},
					{Name: "instances/b"},
				},
				{
					{Name: "instances/c"},
				},
			},
			wantTargets: 3,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			reader := &mockInstanceReader{pages: tt.pages}
			src := NewInstanceTargetSource(reader)

			targets, err := src.ListTargets(context.Background())
			require.NoError(t, err)
			assert.Len(t, targets, tt.wantTargets)
		})
	}
}

func TestInstanceTargetSource_ListTargets_Error(t *testing.T) {
	t.Parallel()

	reader := &mockInstanceReader{listErr: errors.New("storage unavailable")}
	src := NewInstanceTargetSource(reader)

	_, err := src.ListTargets(context.Background())
	require.Error(t, err)
	assert.Contains(t, err.Error(), "list instances")
}
