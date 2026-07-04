package catalog

import "testing"

func TestNormalizeLegacyCatalogFilter(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name   string
		filter string
		want   string
	}{
		{name: "empty filter passes through", filter: "", want: ""},
		{name: "legacy contains is rewritten", filter: "name.contains('inv')", want: "name:'inv'"},
		{name: "surrounding whitespace is tolerated", filter: "  name.contains('inv')  ", want: "name:'inv'"},
		{
			// The legacy escape grammar matches the engine's single-quoted
			// rules, so escaped content is carried over verbatim.
			name:   "escapes carried verbatim",
			filter: `name.contains('order\\\'s')`,
			want:   `name:'order\\\'s'`,
		},
		{name: "empty needle is rewritten", filter: "name.contains('')", want: "name:''"},
		// Everything below is handed to the aip filter engine unchanged.
		{name: "new grammar passes through", filter: `name:"inv"`, want: `name:"inv"`},
		{name: "equality passes through", filter: `owner = "postgres"`, want: `owner = "postgres"`},
		{name: "overlapping prefix and suffix passes through", filter: "name.contains(')", want: "name.contains(')"},
		{name: "trailing garbage passes through", filter: "name.contains('a') AND x", want: "name.contains('a') AND x"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			if got := normalizeLegacyCatalogFilter(tt.filter); got != tt.want {
				t.Errorf("normalizeLegacyCatalogFilter(%q) = %q, want %q", tt.filter, got, tt.want)
			}
		})
	}
}
