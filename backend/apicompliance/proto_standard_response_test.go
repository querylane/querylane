package apicompliance

import (
	"os"
	"path/filepath"
	"slices"
	"sort"
	"strings"
	"testing"
)

// approvedStandardMethodWrapperResponses mirrors docs/aip-compatibility.md.
var approvedStandardMethodWrapperResponses = map[string]struct{}{
	"querylane/console/v1alpha1/database.proto:GetDatabase->GetDatabaseResponse":       {},
	"querylane/console/v1alpha1/instance.proto:CreateInstance->CreateInstanceResponse": {},
	"querylane/console/v1alpha1/instance.proto:DeleteInstance->DeleteInstanceResponse": {},
	"querylane/console/v1alpha1/instance.proto:GetInstance->GetInstanceResponse":       {},
	"querylane/console/v1alpha1/instance.proto:UpdateInstance->UpdateInstanceResponse": {},
	"querylane/console/v1alpha1/role.proto:GetRole->GetRoleResponse":                   {},
	"querylane/console/v1alpha1/schema.proto:GetSchema->GetSchemaResponse":             {},
	"querylane/console/v1alpha1/table.proto:GetTable->GetTableResponse":                {},
	"querylane/console/v1alpha1/view.proto:GetView->GetViewResponse":                   {},
}

func TestStandardMethodWrapperResponsesStayInventoryOnly(t *testing.T) {
	t.Parallel()

	protoRoot := filepath.Join("..", "..", "proto")
	files := map[string]string{}

	if err := filepath.WalkDir(protoRoot, func(path string, entry os.DirEntry, err error) error {
		if err != nil {
			return err
		}

		if entry.IsDir() || !strings.HasSuffix(path, ".proto") {
			return nil
		}

		contentBytes, err := os.ReadFile(path)
		if err != nil {
			return err
		}

		content := string(contentBytes)

		relPath, err := filepath.Rel(protoRoot, path)
		if err != nil {
			return err
		}

		files[relPath] = content

		return nil
	}); err != nil {
		t.Fatal(err)
	}

	found := findStandardMethodResponseExceptions(files)

	var unexpected []string

	for _, key := range found {
		if _, ok := approvedStandardMethodWrapperResponses[key]; !ok {
			unexpected = append(unexpected, key)
		}
	}

	sort.Strings(unexpected)

	if len(unexpected) > 0 {
		t.Fatalf("standard methods must return canonical AIP responses unless approved in docs/aip-compatibility.md; unexpected wrappers:\n%s", strings.Join(unexpected, "\n"))
	}

	var missing []string

	for approved := range approvedStandardMethodWrapperResponses {
		if !slices.Contains(found, approved) {
			missing = append(missing, approved)
		}
	}

	sort.Strings(missing)

	if len(missing) > 0 {
		t.Fatalf("approved wrapper inventory is stale; remove resolved entries:\n%s", strings.Join(missing, "\n"))
	}

	docBytes, err := os.ReadFile(filepath.Join("..", "..", "docs", "aip-compatibility.md"))
	if err != nil {
		t.Fatal(err)
	}

	doc := string(docBytes)

	for approved := range approvedStandardMethodWrapperResponses {
		method, response := splitApprovedStandardMethodWrapperResponse(approved)
		if !approvedWrapperIsDocumented(doc, method, response) {
			t.Fatalf("docs/aip-compatibility.md does not mention approved wrapper %s", approved)
		}
	}
}

func TestFindStandardMethodResponseExceptionsIgnoresNonResourceAndStreamingRPCs(t *testing.T) {
	t.Parallel()

	content := `
syntax = "proto3";
package querylane.console.v1alpha1;

service MixedService {
  rpc GetBook(GetBookRequest) returns (Book) {}
  rpc CreateBook(CreateBookRequest) returns (CreateBookResponse) {}
  rpc DeleteBook(DeleteBookRequest) returns (google.protobuf.Empty) {}
  rpc GetConsoleConfig(GetConsoleConfigRequest) returns (GetConsoleConfigResponse) {}
  rpc StreamBooks(StreamBooksRequest) returns (stream StreamBooksResponse) {}
}

message Book {
  option (google.api.resource) = {
    type: "library.example.com/Book"
    pattern: "books/{book}"
  };
}
`

	exceptions := findStandardMethodResponseExceptions(map[string]string{"querylane/console/v1alpha1/book.proto": content})

	want := []string{"querylane/console/v1alpha1/book.proto:CreateBook->CreateBookResponse"}
	if !slices.Equal(want, exceptions) {
		t.Fatalf("unexpected response exceptions: got %v, want %v", exceptions, want)
	}
}

func TestFindStandardMethodResponseExceptionsRequiresExplicitDeleteEmptyResponse(t *testing.T) {
	t.Parallel()

	content := `
syntax = "proto3";
package querylane.console.v1alpha1;

service BookService {
  rpc DeleteBook(DeleteBookRequest) returns (DeleteBookResponse) {}
}

message Book {
  option (google.api.resource) = {
    type: "library.example.com/Book"
    pattern: "books/{book}"
  };
}
`

	exceptions := findStandardMethodResponseExceptions(map[string]string{"querylane/console/v1alpha1/book.proto": content})

	want := []string{"querylane/console/v1alpha1/book.proto:DeleteBook->DeleteBookResponse"}
	if !slices.Equal(want, exceptions) {
		t.Fatalf("unexpected response exceptions: got %v, want %v", exceptions, want)
	}
}

func TestFindStandardMethodResponseExceptionsFindsResourceOptionAfterNestedBody(t *testing.T) {
	t.Parallel()

	content := `
syntax = "proto3";
package querylane.console.v1alpha1;

service BookService {
  rpc GetBook(GetBookRequest) returns (GetBookResponse) {}
}

message Book {
  enum State {
    STATE_UNSPECIFIED = 0;
  }

  option (google.api.resource) = {
    type: "library.example.com/Book"
    pattern: "books/{book}"
  };
}
`

	exceptions := findStandardMethodResponseExceptions(map[string]string{"querylane/console/v1alpha1/book.proto": content})

	want := []string{"querylane/console/v1alpha1/book.proto:GetBook->GetBookResponse"}
	if !slices.Equal(want, exceptions) {
		t.Fatalf("unexpected response exceptions: got %v, want %v", exceptions, want)
	}
}

func TestFindStandardMethodResponseExceptionsHandlesReturnsWhitespaceAndStreamExplicitly(t *testing.T) {
	t.Parallel()

	content := `
syntax = "proto3";
package querylane.console.v1alpha1;

service BookService {
  rpc GetBook(GetBookRequest) returns ( GetBookResponse ) {}
  rpc UpdateBook(UpdateBookRequest) returns ( stream UpdateBookResponse ) {}
}

message Book {
  option (google.api.resource) = {
    type: "library.example.com/Book"
    pattern: "books/{book}"
  };
}
`

	exceptions := findStandardMethodResponseExceptions(map[string]string{"querylane/console/v1alpha1/book.proto": content})

	want := []string{"querylane/console/v1alpha1/book.proto:GetBook->GetBookResponse"}
	if !slices.Equal(want, exceptions) {
		t.Fatalf("unexpected response exceptions: got %v, want %v", exceptions, want)
	}
}

func TestFindStandardMethodResponseExceptionsIgnoresOuterMessageContainingNestedResource(t *testing.T) {
	t.Parallel()

	content := `
syntax = "proto3";
package querylane.console.v1alpha1;

service OuterService {
  rpc GetOuter(GetOuterRequest) returns (GetOuterResponse) {}
  rpc GetInner(GetInnerRequest) returns (GetInnerResponse) {}
}

message Outer {
  message Inner {
    option (google.api.resource) = {
      type: "library.example.com/Inner"
      pattern: "inners/{inner}"
    };
  }
}
`

	exceptions := findStandardMethodResponseExceptions(map[string]string{"querylane/console/v1alpha1/outer.proto": content})

	want := []string{"querylane/console/v1alpha1/outer.proto:GetInner->GetInnerResponse"}
	if !slices.Equal(want, exceptions) {
		t.Fatalf("unexpected response exceptions: got %v, want %v", exceptions, want)
	}
}

func TestApprovedWrapperDocRowsRequireMethodAndResponseTogether(t *testing.T) {
	t.Parallel()

	doc := "| `GetBook` | `Book` |\n\nElsewhere: `GetBookResponse`"

	if approvedWrapperIsDocumented(doc, "GetBook", "GetBookResponse") {
		t.Fatal("expected split method and response mentions to fail doc-row validation")
	}

	doc = "| `GetBook` | `GetBookResponse` | `Book` |"
	if !approvedWrapperIsDocumented(doc, "GetBook", "GetBookResponse") {
		t.Fatal("expected same row method and response mentions to pass doc-row validation")
	}
}
