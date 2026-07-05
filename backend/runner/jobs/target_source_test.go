package jobs

import (
	"context"
	"errors"
	"fmt"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/querylane/querylane/backend/aip"
	"github.com/querylane/querylane/backend/engine"
	api "github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1"
	"github.com/querylane/querylane/backend/resource"
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

type mockCatalogDatabaseLister struct {
	// databasesByInstance maps instance ID to database pages.
	databasesByInstance map[string][][]engine.Database
	// errInstances lists instance IDs whose listing fails.
	errInstances map[string]bool
	// cancelInstances lists instance IDs whose listing cancels the caller's
	// context and fails with its error, simulating shutdown mid-listing.
	cancelInstances map[string]bool
	cancel          context.CancelFunc
}

func (l *mockCatalogDatabaseLister) ListDatabases(ctx context.Context, instance resource.InstanceName, params aip.Params) ([]engine.Database, string, error) {
	if l.cancelInstances[instance.InstanceID] {
		l.cancel()
		return nil, "", ctx.Err()
	}

	if l.errInstances[instance.InstanceID] {
		return nil, "", errors.New("catalog unavailable")
	}

	pages := l.databasesByInstance[instance.InstanceID]

	pageIdx := 0

	if params.PageToken != "" {
		for i := range pages {
			if params.PageToken == pageTokenFor(i) {
				pageIdx = i
				break
			}
		}
	}

	if pageIdx >= len(pages) {
		return nil, "", nil
	}

	nextToken := ""
	if pageIdx+1 < len(pages) {
		nextToken = pageTokenFor(pageIdx + 1)
	}

	return pages[pageIdx], nextToken, nil
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

func TestDatabaseTargetSource_ListTargets(t *testing.T) {
	t.Parallel()

	reader := &mockInstanceReader{pages: [][]*api.Instance{
		{{Name: "instances/a"}, {Name: "instances/b"}},
	}}
	lister := &mockCatalogDatabaseLister{databasesByInstance: map[string][][]engine.Database{
		"a": {
			{
				{Name: "appdb"},
				{Name: "postgres", IsSystemDatabase: true},
			},
			{
				{Name: "warehouse"},
			},
		},
		"b": {
			{
				{Name: "appdb"},
			},
		},
	}}

	src := NewDatabaseTargetSource(NewInstanceTargetSource(reader), lister)

	targets, err := src.ListTargets(context.Background())
	require.NoError(t, err)

	// System databases are skipped; pagination is followed across pages.
	assert.Equal(t, []string{
		"instances/a/databases/appdb",
		"instances/a/databases/warehouse",
		"instances/b/databases/appdb",
	}, targets)
}

func TestDatabaseTargetSource_ListTargets_SkipsFailingInstance(t *testing.T) {
	t.Parallel()

	reader := &mockInstanceReader{pages: [][]*api.Instance{
		{{Name: "instances/broken"}, {Name: "instances/healthy"}},
	}}
	lister := &mockCatalogDatabaseLister{
		databasesByInstance: map[string][][]engine.Database{
			"healthy": {{{Name: "appdb"}}},
		},
		errInstances: map[string]bool{"broken": true},
	}

	src := NewDatabaseTargetSource(NewInstanceTargetSource(reader), lister)

	// One broken instance must not starve sampling for the healthy ones.
	targets, err := src.ListTargets(context.Background())
	require.NoError(t, err)
	assert.Equal(t, []string{"instances/healthy/databases/appdb"}, targets)
}

func TestDatabaseTargetSource_ListTargets_PropagatesCancellation(t *testing.T) {
	t.Parallel()

	reader := &mockInstanceReader{pages: [][]*api.Instance{
		{{Name: "instances/dying"}, {Name: "instances/healthy"}},
	}}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	lister := &mockCatalogDatabaseLister{
		databasesByInstance: map[string][][]engine.Database{
			"healthy": {{{Name: "appdb"}}},
		},
		cancelInstances: map[string]bool{"dying": true},
		cancel:          cancel,
	}

	src := NewDatabaseTargetSource(NewInstanceTargetSource(reader), lister)

	// Shutdown mid-listing must surface the error so the manager aborts the
	// cycle, not skip the instance and return a partial list with nil error.
	targets, err := src.ListTargets(ctx)
	require.ErrorIs(t, err, context.Canceled)
	assert.Nil(t, targets)
}

func TestInstanceTargetSource_ListTargets_Error(t *testing.T) {
	t.Parallel()

	reader := &mockInstanceReader{listErr: errors.New("storage unavailable")}
	src := NewInstanceTargetSource(reader)

	_, err := src.ListTargets(context.Background())
	require.Error(t, err)
	assert.Contains(t, err.Error(), "list instances")
}
