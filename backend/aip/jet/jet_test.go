package jet_test

import (
	"testing"

	"github.com/go-jet/jet/v2/postgres"

	"github.com/querylane/querylane/backend/aip"
	aipjet "github.com/querylane/querylane/backend/aip/jet"
)

type bindTestModel struct {
	Name string
}

func bindTestSchema() *aip.Schema[bindTestModel] {
	return aip.NewSchema(
		"console.querylane.dev/BindTest",
		aip.Fields[bindTestModel]{
			"name": {
				Codec:    aip.StringCodec{},
				GetValue: func(model *bindTestModel) any { return model.Name },
			},
		},
		aip.WithNameOrdering(),
	)
}

func TestBindPanicsOnInvalidBindings(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name    string
		columns aipjet.Columns
	}{
		{name: "missing field", columns: aipjet.Columns{}},
		{name: "wrong column type", columns: aipjet.Columns{"name": postgres.BoolColumn("name")}},
		{
			name: "unknown field",
			columns: aipjet.Columns{
				"name":    postgres.StringColumn("name"),
				"unknown": postgres.StringColumn("unknown"),
			},
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()

			defer func() {
				if recovered := recover(); recovered == nil {
					t.Fatal("Bind() did not panic")
				}
			}()

			aipjet.Bind(bindTestSchema(), test.columns)
		})
	}
}
