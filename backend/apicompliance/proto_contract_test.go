package apicompliance

import (
	"slices"
	"strings"
	"testing"
	"unicode"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	annotations "google.golang.org/genproto/googleapis/api/annotations"
	"google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/reflect/protoreflect"
	"google.golang.org/protobuf/reflect/protoregistry"
	"google.golang.org/protobuf/types/descriptorpb"

	_ "github.com/querylane/querylane/backend/protogen/querylane/common/v1"
	api "github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1"
	"github.com/querylane/querylane/backend/resource"
)

type compatibilityException struct {
	category string
	reason   string
}

const (
	exceptionOutputOnlyResourceName = "output_only_resource_name"
	exceptionRawDatabaseObjectName  = "raw_database_object_name"
	exceptionCustomGetName          = "custom_get_name"
	exceptionResponseWrapper        = "response_wrapper"
	exceptionBoundedMetadataList    = "bounded_metadata_list"
)

type standardMethodKind string

const (
	standardMethodUnknown standardMethodKind = ""
	standardMethodGet     standardMethodKind = "get"
	standardMethodList    standardMethodKind = "list"
	standardMethodCreate  standardMethodKind = "create"
	standardMethodUpdate  standardMethodKind = "update"
	standardMethodDelete  standardMethodKind = "delete"
)

var aipCompatibilityExceptions = map[string]compatibilityException{
	"querylane.console.v1alpha1.Database.name": {
		category: exceptionOutputOnlyResourceName,
		reason:   "Existing v1alpha1 descriptors expose resource names as OUTPUT_ONLY plus IDENTIFIER; preserve descriptor compatibility.",
	},
	"querylane.console.v1alpha1.Instance.name": {
		category: exceptionOutputOnlyResourceName,
		reason:   "Existing v1alpha1 descriptors expose resource names as OUTPUT_ONLY plus IDENTIFIER; preserve descriptor compatibility.",
	},
	"querylane.console.v1alpha1.Role.name": {
		category: exceptionOutputOnlyResourceName,
		reason:   "Existing v1alpha1 descriptors expose resource names as OUTPUT_ONLY plus IDENTIFIER; preserve descriptor compatibility.",
	},
	"querylane.console.v1alpha1.Schema.name": {
		category: exceptionOutputOnlyResourceName,
		reason:   "Existing v1alpha1 descriptors expose resource names as OUTPUT_ONLY plus IDENTIFIER; preserve descriptor compatibility.",
	},
	"querylane.console.v1alpha1.Table.name": {
		category: exceptionOutputOnlyResourceName,
		reason:   "Existing v1alpha1 descriptors expose resource names as OUTPUT_ONLY plus IDENTIFIER; preserve descriptor compatibility.",
	},
	"querylane.console.v1alpha1.View.name": {
		category: exceptionOutputOnlyResourceName,
		reason:   "Existing v1alpha1 descriptors expose resource names as OUTPUT_ONLY plus IDENTIFIER; preserve descriptor compatibility.",
	},
	"querylane.console.v1alpha1.ConsoleService.GetConsoleConfig": {
		category: exceptionCustomGetName,
		reason:   "Singleton/custom console configuration method has no resource name request field.",
	},
	"querylane.console.v1alpha1.OnboardingService.GetOnboardingState": {
		category: exceptionCustomGetName,
		reason:   "Singleton/custom onboarding state method has no resource name request field.",
	},
	"querylane.console.v1alpha1.ConsoleService.GetConsoleConfig.response": {
		category: exceptionResponseWrapper,
		reason:   "Existing method returns a wrapper response for compatibility.",
	},
	"querylane.console.v1alpha1.DatabaseService.GetDatabase.response": {
		category: exceptionResponseWrapper,
		reason:   "Existing standard method returns a wrapper response for compatibility.",
	},
	"querylane.console.v1alpha1.DatabaseService.GetDatabaseQueryInsights.response": {
		category: exceptionResponseWrapper,
		reason:   "Custom database query insights method returns a wrapper response for partial errors.",
	},
	"querylane.console.v1alpha1.InstanceService.CreateInstance.response": {
		category: exceptionResponseWrapper,
		reason:   "Existing standard method returns a wrapper response for compatibility.",
	},
	"querylane.console.v1alpha1.InstanceService.GetInstance.response": {
		category: exceptionResponseWrapper,
		reason:   "Existing standard method returns a wrapper response for compatibility.",
	},
	"querylane.console.v1alpha1.InstanceService.GetInstanceOverview.response": {
		category: exceptionResponseWrapper,
		reason:   "Existing custom overview method returns a wrapper response for compatibility.",
	},
	"querylane.console.v1alpha1.InstanceService.UpdateInstance.response": {
		category: exceptionResponseWrapper,
		reason:   "Existing standard method returns a wrapper response for compatibility.",
	},
	"querylane.console.v1alpha1.OnboardingService.GetOnboardingState.response": {
		category: exceptionResponseWrapper,
		reason:   "Existing singleton/custom method returns a wrapper response for compatibility.",
	},
	"querylane.console.v1alpha1.RoleService.GetRole.response": {
		category: exceptionResponseWrapper,
		reason:   "Existing standard method returns a wrapper response for compatibility.",
	},
	"querylane.console.v1alpha1.SchemaService.GetSchema.response": {
		category: exceptionResponseWrapper,
		reason:   "Existing standard method returns a wrapper response for compatibility.",
	},
	"querylane.console.v1alpha1.TableService.GetTable.response": {
		category: exceptionResponseWrapper,
		reason:   "Existing standard method returns a wrapper response for compatibility.",
	},
	"querylane.console.v1alpha1.TableService.GetTablePartitionMetadata.response": {
		category: exceptionResponseWrapper,
		reason:   "Custom partition metadata read returns a wrapper response for consistency with table metadata RPCs.",
	},
	"querylane.console.v1alpha1.ViewService.GetView.response": {
		category: exceptionResponseWrapper,
		reason:   "Existing standard method returns a wrapper response for compatibility.",
	},
	"querylane.console.v1alpha1.TableService.ListTableColumns": {
		category: exceptionBoundedMetadataList,
		reason:   "Columns are bounded metadata embedded under a Table, not promoted resources requiring AIP pagination.",
	},
	"querylane.console.v1alpha1.TableService.ListTableConstraints": {
		category: exceptionBoundedMetadataList,
		reason:   "Constraints are bounded metadata embedded under a Table, not promoted resources requiring AIP pagination.",
	},
	"querylane.console.v1alpha1.TableService.ListTableIndexes": {
		category: exceptionBoundedMetadataList,
		reason:   "Indexes are bounded metadata embedded under a Table, not promoted resources requiring AIP pagination.",
	},
	"querylane.console.v1alpha1.TableService.ListTablePolicies": {
		category: exceptionBoundedMetadataList,
		reason:   "Policies are bounded metadata embedded under a Table, not promoted resources requiring AIP pagination.",
	},
	"querylane.console.v1alpha1.TableService.ListTableTriggers": {
		category: exceptionBoundedMetadataList,
		reason:   "Triggers are bounded metadata embedded under a Table, not promoted resources requiring AIP pagination.",
	},
}

func TestResourceMessagesHaveAIPResourceAnnotations(t *testing.T) {
	t.Parallel()

	contract := newProtoContract()

	for _, message := range contract.messages() {
		resource := resourceDescriptor(message)
		if resource == nil {
			continue
		}

		t.Run(string(message.FullName()), func(t *testing.T) {
			t.Parallel()
			assert.NotEmpty(t, resource.GetType())
			assert.NotEmpty(t, resource.GetPattern())
			assert.NotEmpty(t, resource.GetSingular())
			assert.NotEmpty(t, resource.GetPlural())

			name := message.Fields().ByName("name")
			require.NotNil(t, name, "resource messages must include name")
			assert.Equal(t, protoreflect.FieldNumber(1), name.Number(), "resource name must be field 1")
			assert.Equal(t, protoreflect.StringKind, name.Kind(), "resource name must be string")
			assertResourceNameFieldBehavior(t, name)
		})
	}
}

func TestNameFieldsAreAIPResourceNamesOrDocumentedCompatibilityExceptions(t *testing.T) {
	t.Parallel()

	contract := newProtoContract()

	for _, message := range contract.messages() {
		name := message.Fields().ByName("name")
		if name == nil {
			continue
		}

		t.Run(string(message.FullName()), func(t *testing.T) {
			t.Parallel()

			if resourceDescriptor(message) != nil {
				return
			}

			if fieldResourceReference(name) != nil {
				return
			}

			assertCompatibilityException(t, string(message.FullName()), exceptionRawDatabaseObjectName, "non-resource name fields must be resource references or documented raw database-object compatibility exceptions")
		})
	}
}

func TestListRPCsUseAIPPaginationExceptDocumentedBoundedLists(t *testing.T) {
	t.Parallel()

	contract := newProtoContract()

	for _, method := range contract.methods() {
		if classifyStandardMethod(method) != standardMethodList {
			continue
		}

		if hasCompatibilityException(string(method.FullName()), exceptionBoundedMetadataList) {
			continue
		}

		t.Run(string(method.FullName()), func(t *testing.T) {
			t.Parallel()
			assertField(t, method.Input(), "page_size", protoreflect.Int32Kind)
			assertField(t, method.Input(), "page_token", protoreflect.StringKind)
			assertField(t, method.Input(), "filter", protoreflect.StringKind)
			assertField(t, method.Input(), "order_by", protoreflect.StringKind)
			assertRepeatedMessageFieldNumberOne(t, method.Output())
			assertField(t, method.Output(), "next_page_token", protoreflect.StringKind)
		})
	}
}

func TestGetAndDeleteRPCsUseResourceNameReferences(t *testing.T) {
	t.Parallel()

	contract := newProtoContract()

	for _, method := range contract.methods() {
		methodKind := classifyStandardMethod(method)
		if methodKind != standardMethodGet && methodKind != standardMethodDelete {
			continue
		}

		if hasCompatibilityException(string(method.FullName()), exceptionCustomGetName) {
			continue
		}

		t.Run(string(method.FullName()), func(t *testing.T) {
			t.Parallel()

			name := method.Input().Fields().ByName("name")
			require.NotNil(t, name, "standard Get/Delete requests must use name")
			assert.Equal(t, protoreflect.StringKind, name.Kind())
			assert.Contains(t, fieldBehaviors(name), annotations.FieldBehavior_REQUIRED)
			assert.NotNil(t, fieldResourceReference(name), "name must declare target resource_reference")
		})
	}
}

func TestNestedListRequestsUseParentResourceReferences(t *testing.T) {
	t.Parallel()

	contract := newProtoContract()

	for _, method := range contract.methods() {
		if classifyStandardMethod(method) != standardMethodList {
			continue
		}

		parent := method.Input().Fields().ByName("parent")
		if parent == nil {
			continue
		}

		t.Run(string(method.FullName()), func(t *testing.T) {
			t.Parallel()

			parent := method.Input().Fields().ByName("parent")
			require.NotNil(t, parent)
			assert.Equal(t, protoreflect.StringKind, parent.Kind())
			assert.Contains(t, fieldBehaviors(parent), annotations.FieldBehavior_REQUIRED)
			assert.NotNil(t, fieldResourceReference(parent), "parent must declare parent resource_reference")
		})
	}
}

func TestCreateRPCsUseResourceIDFieldsOutsideBody(t *testing.T) {
	t.Parallel()

	contract := newProtoContract()

	for _, method := range contract.methods() {
		if classifyStandardMethod(method) != standardMethodCreate {
			continue
		}

		t.Run(string(method.FullName()), func(t *testing.T) {
			t.Parallel()

			request := method.Input()
			resourceID := request.Fields().ByName(resourceIDFieldName(method.Name()))
			require.NotNil(t, resourceID, "Create requests must expose {resource}_id outside the resource body")
			assert.Equal(t, protoreflect.StringKind, resourceID.Kind())
			assert.Contains(t, fieldBehaviors(resourceID), annotations.FieldBehavior_OPTIONAL)
		})
	}
}

func TestStandardMethodResponseWrappersAreDocumentedCompatibilityExceptions(t *testing.T) {
	t.Parallel()

	contract := newProtoContract()

	for _, method := range contract.methods() {
		methodKind := classifyStandardMethod(method)
		if methodKind != standardMethodGet && methodKind != standardMethodCreate && methodKind != standardMethodUpdate {
			continue
		}

		t.Run(string(method.FullName()), func(t *testing.T) {
			t.Parallel()

			if resourceDescriptor(method.Output()) != nil {
				return
			}

			assertCompatibilityException(t, string(method.FullName())+".response", exceptionResponseWrapper, "standard methods should return resources directly unless wrapper is documented for compatibility")
		})
	}
}

func TestUpdateRPCsRequireFieldMask(t *testing.T) {
	t.Parallel()

	contract := newProtoContract()

	for _, method := range contract.methods() {
		if classifyStandardMethod(method) != standardMethodUpdate {
			continue
		}

		t.Run(string(method.FullName()), func(t *testing.T) {
			t.Parallel()

			field := method.Input().Fields().ByName("update_mask")
			require.NotNil(t, field, "Update requests must include required update_mask")
			assert.Equal(t, protoreflect.MessageKind, field.Kind())
			assert.Equal(t, protoreflect.FullName("google.protobuf.FieldMask"), field.Message().FullName())
			// Querylane intentionally requires explicit update masks for partial updates.
			// This is stricter than AIP-134, where update_mask is optional and omission
			// means replacing all client-settable fields.
			assert.Contains(t, fieldBehaviors(field), annotations.FieldBehavior_REQUIRED)
		})
	}
}

func TestEnumZeroValuesAreUnspecified(t *testing.T) {
	t.Parallel()

	contract := newProtoContract()

	for _, enum := range contract.enums() {
		t.Run(string(enum.FullName()), func(t *testing.T) {
			t.Parallel()

			zero := enum.Values().Get(0)
			// Proto3 requires the first enum value to use number 0; keep this guard
			// to make the suffix assertion below explicit about the zero value.
			require.Equal(t, protoreflect.EnumNumber(0), zero.Number())
			assert.True(t, strings.HasSuffix(string(zero.Name()), "_UNSPECIFIED"), "zero enum value must be *_UNSPECIFIED")
		})
	}
}

func assertResourceNameFieldBehavior(t *testing.T, field protoreflect.FieldDescriptor) {
	t.Helper()

	behaviors := fieldBehaviors(field)
	if hasCompatibilityException(string(field.FullName()), exceptionOutputOnlyResourceName) {
		assert.ElementsMatch(
			t,
			[]annotations.FieldBehavior{annotations.FieldBehavior_OUTPUT_ONLY, annotations.FieldBehavior_IDENTIFIER},
			behaviors,
			"v1alpha1 resource name compatibility exception must keep OUTPUT_ONLY plus IDENTIFIER",
		)

		return
	}

	assert.Equal(t, []annotations.FieldBehavior{annotations.FieldBehavior_IDENTIFIER}, behaviors, "name must be IDENTIFIER only")
}

func assertCompatibilityException(t *testing.T, key string, category string, message string) {
	t.Helper()

	exception, ok := compatibilityExceptionDetails(key)
	require.True(t, ok, "%s: missing compatibility exception %q", message, key)
	assert.Equal(t, category, exception.category, "%s: compatibility exception %q has wrong category", message, key)
	assert.NotEmpty(t, exception.reason, "%s: compatibility exception %q must document a reason", message, key)
}

func fieldResourceReference(field protoreflect.FieldDescriptor) *annotations.ResourceReference {
	options, ok := field.Options().(*descriptorpb.FieldOptions)
	if !ok {
		return nil
	}

	if !proto.HasExtension(options, annotations.E_ResourceReference) {
		return nil
	}

	resourceReference, ok := proto.GetExtension(options, annotations.E_ResourceReference).(*annotations.ResourceReference)
	if !ok {
		return nil
	}

	return resourceReference
}

func resourceDescriptor(message protoreflect.MessageDescriptor) *annotations.ResourceDescriptor {
	options, ok := message.Options().(*descriptorpb.MessageOptions)
	if !ok {
		return nil
	}

	if !proto.HasExtension(options, annotations.E_Resource) {
		return nil
	}

	resource, ok := proto.GetExtension(options, annotations.E_Resource).(*annotations.ResourceDescriptor)
	if !ok {
		return nil
	}

	return resource
}

type protoContract struct {
	files []protoreflect.FileDescriptor
}

func newProtoContract() protoContract {
	return protoContract{files: aipContractFiles()}
}

func (c protoContract) messages() []protoreflect.MessageDescriptor {
	var messages []protoreflect.MessageDescriptor
	for _, file := range c.files {
		collectMessages(file.Messages(), &messages)
	}

	return messages
}

func collectMessages(list protoreflect.MessageDescriptors, messages *[]protoreflect.MessageDescriptor) {
	for i := range list.Len() {
		message := list.Get(i)
		*messages = append(*messages, message)
		collectMessages(message.Messages(), messages)
	}
}

func (c protoContract) enums() []protoreflect.EnumDescriptor {
	var enums []protoreflect.EnumDescriptor
	for _, file := range c.files {
		collectEnums(file.Enums(), &enums)

		var messages []protoreflect.MessageDescriptor
		collectMessages(file.Messages(), &messages)

		for _, message := range messages {
			collectEnums(message.Enums(), &enums)
		}
	}

	return enums
}

func collectEnums(list protoreflect.EnumDescriptors, enums *[]protoreflect.EnumDescriptor) {
	for i := range list.Len() {
		*enums = append(*enums, list.Get(i))
	}
}

func (c protoContract) methods() []protoreflect.MethodDescriptor {
	var methods []protoreflect.MethodDescriptor

	for _, file := range c.files {
		services := file.Services()
		for i := range services.Len() {
			serviceMethods := services.Get(i).Methods()
			for j := range serviceMethods.Len() {
				methods = append(methods, serviceMethods.Get(j))
			}
		}
	}

	return methods
}

func classifyStandardMethod(method protoreflect.MethodDescriptor) standardMethodKind {
	methodName := string(method.Name())
	switch {
	case strings.HasPrefix(methodName, "Get"):
		return standardMethodGet
	case strings.HasPrefix(methodName, "List"):
		return standardMethodList
	case strings.HasPrefix(methodName, "Create"):
		return standardMethodCreate
	case strings.HasPrefix(methodName, "Update"):
		return standardMethodUpdate
	case strings.HasPrefix(methodName, "Delete"):
		return standardMethodDelete
	default:
		return standardMethodUnknown
	}
}

func aipContractFiles() []protoreflect.FileDescriptor {
	var files []protoreflect.FileDescriptor

	protoregistry.GlobalFiles.RangeFiles(func(file protoreflect.FileDescriptor) bool {
		packageName := string(file.Package())
		if strings.HasPrefix(packageName, "querylane.console.") || strings.HasPrefix(packageName, "querylane.common.") {
			files = append(files, file)
		}

		return true
	})

	slices.SortFunc(files, func(a protoreflect.FileDescriptor, b protoreflect.FileDescriptor) int {
		return strings.Compare(a.Path(), b.Path())
	})

	return files
}

func hasCompatibilityException(key string, category string) bool {
	exception, ok := aipCompatibilityExceptions[key]
	return ok && exception.category == category && exception.reason != ""
}

func compatibilityExceptionDetails(key string) (compatibilityException, bool) {
	exception, ok := aipCompatibilityExceptions[key]
	return exception, ok
}

func resourceIDFieldName(methodName protoreflect.Name) protoreflect.Name {
	return protoreflect.Name(camelToSnake(strings.TrimPrefix(string(methodName), "Create")) + "_id")
}

func camelToSnake(value string) string {
	var builder strings.Builder

	for index, char := range value {
		if unicode.IsUpper(char) {
			if index > 0 {
				builder.WriteRune('_')
			}

			builder.WriteRune(unicode.ToLower(char))

			continue
		}

		builder.WriteRune(char)
	}

	return builder.String()
}

func fieldBehaviors(field protoreflect.FieldDescriptor) []annotations.FieldBehavior {
	options, ok := field.Options().(*descriptorpb.FieldOptions)
	if !ok {
		return nil
	}

	if !proto.HasExtension(options, annotations.E_FieldBehavior) {
		return nil
	}

	behaviors, ok := proto.GetExtension(options, annotations.E_FieldBehavior).([]annotations.FieldBehavior)
	if !ok {
		return nil
	}

	return behaviors
}

func assertField(t *testing.T, message protoreflect.MessageDescriptor, name protoreflect.Name, kind protoreflect.Kind) {
	t.Helper()

	field := message.Fields().ByName(name)
	require.NotNil(t, field, "%s must include %s", message.FullName(), name)
	assert.Equal(t, kind, field.Kind(), "%s.%s has wrong kind", message.FullName(), name)
}

func assertRepeatedMessageFieldNumberOne(t *testing.T, message protoreflect.MessageDescriptor) {
	t.Helper()

	field := message.Fields().ByNumber(1)
	require.NotNil(t, field, "%s must include repeated resource/result field at field 1", message.FullName())
	assert.True(t, field.IsList(), "%s.%s must be repeated", message.FullName(), field.Name())
	assert.Equal(t, protoreflect.MessageKind, field.Kind(), "%s.%s must be a message field", message.FullName(), field.Name())
}

type resourceContract struct {
	descriptor     protoreflect.MessageDescriptor
	backendPattern string
}

func resourceContracts() []resourceContract {
	return []resourceContract{
		{(&api.Instance{}).ProtoReflect().Descriptor(), resource.InstancePattern},
		{(&api.Database{}).ProtoReflect().Descriptor(), resource.DatabasePattern},
		{(&api.Schema{}).ProtoReflect().Descriptor(), resource.SchemaPattern},
		{(&api.Table{}).ProtoReflect().Descriptor(), resource.TablePattern},
		{(&api.View{}).ProtoReflect().Descriptor(), resource.ViewPattern},
		{(&api.Role{}).ProtoReflect().Descriptor(), resource.RolePattern},
	}
}

func TestResourceDescriptorsDeclareCanonicalAIPShape(t *testing.T) {
	t.Parallel()

	for _, contract := range resourceContracts() {
		t.Run(string(contract.descriptor.FullName()), func(t *testing.T) {
			t.Parallel()

			resource := resourceDescriptor(contract.descriptor)
			require.NotNil(t, resource)
			require.Len(t, resource.GetPattern(), 1)

			assert.Equal(t, aipResourceType(contract.descriptor), resource.GetType())
			assert.Equal(t, canonicalPatternVariables(contract.backendPattern), canonicalPatternVariables(resource.GetPattern()[0]))

			singular := strings.ToLower(string(contract.descriptor.Name()))
			assert.Equal(t, singular, resource.GetSingular())
			assert.Equal(t, singular+"s", resource.GetPlural())
		})
	}
}

func TestCreateInstanceRequestSupportsCanonicalBodyWithCompatibilitySpec(t *testing.T) {
	t.Parallel()

	message := api.File_querylane_console_v1alpha1_instance_proto.Messages().ByName("CreateInstanceRequest")
	fields := message.Fields()
	reserved := message.ReservedRanges()
	require.Equal(t, 1, reserved.Len())
	assert.Equal(t, [2]protoreflect.FieldNumber{1, 2}, reserved.Get(0))

	spec := fields.ByName("spec")
	require.NotNil(t, spec)
	assert.Equal(t, protoreflect.FieldNumber(2), spec.Number())
	assert.Equal(t, protoreflect.MessageKind, spec.Kind())
	assert.Equal(t, protoreflect.FullName("querylane.console.v1alpha1.CreateInstanceSpec"), spec.Message().FullName())
	assert.Equal(t, []annotations.FieldBehavior{annotations.FieldBehavior_OPTIONAL}, fieldBehaviors(spec))

	instanceID := fields.ByName("instance_id")
	require.NotNil(t, instanceID)
	assert.Equal(t, protoreflect.FieldNumber(3), instanceID.Number())

	validateOnly := fields.ByName("validate_only")
	require.NotNil(t, validateOnly)
	assert.Equal(t, protoreflect.FieldNumber(4), validateOnly.Number())

	instance := fields.ByName("instance")
	require.NotNil(t, instance)
	assert.Equal(t, protoreflect.FieldNumber(5), instance.Number())
	assert.Equal(t, protoreflect.MessageKind, instance.Kind())
	assert.Equal(t, protoreflect.FullName("querylane.console.v1alpha1.Instance"), instance.Message().FullName())
	assert.Equal(t, []annotations.FieldBehavior{annotations.FieldBehavior_OPTIONAL}, fieldBehaviors(instance))
}

func TestBoundedMetadataListRequestsStayUnpaginated(t *testing.T) {
	t.Parallel()

	requests := []protoreflect.MessageDescriptor{
		((&api.ListTableColumnsRequest{}).ProtoReflect().Descriptor()),
		((&api.ListTableConstraintsRequest{}).ProtoReflect().Descriptor()),
		((&api.ListTableIndexesRequest{}).ProtoReflect().Descriptor()),
		((&api.ListTablePoliciesRequest{}).ProtoReflect().Descriptor()),
		((&api.ListTableTriggersRequest{}).ProtoReflect().Descriptor()),
	}

	for _, req := range requests {
		t.Run(string(req.Name()), func(t *testing.T) {
			t.Parallel()

			for i := range req.Fields().Len() {
				name := string(req.Fields().Get(i).Name())
				assert.Falsef(t, strings.HasPrefix(name, "page_") || name == "filter" || name == "order_by", "%s has partial AIP list field %s", req.FullName(), name)
			}
		})
	}
}

func TestTableMetadataChildrenAreEmbeddedValuesNotResources(t *testing.T) {
	t.Parallel()

	messages := []struct {
		name             string
		desc             protoreflect.MessageDescriptor
		objectNameField  protoreflect.Name
		forbiddenNameMsg string
	}{
		{"Column", (&api.Column{}).ProtoReflect().Descriptor(), "column_name", "columns expose database object names via column_name"},
		{"TableConstraint", (&api.TableConstraint{}).ProtoReflect().Descriptor(), "constraint_name", "constraints expose database object names via constraint_name"},
		{"TableIndex", (&api.TableIndex{}).ProtoReflect().Descriptor(), "index_name", "indexes expose database object names via index_name"},
		{"TablePolicy", (&api.TablePolicy{}).ProtoReflect().Descriptor(), "policy_name", "policies expose database object names via policy_name"},
		{"TableTrigger", (&api.TableTrigger{}).ProtoReflect().Descriptor(), "trigger_name", "triggers expose database object names via trigger_name"},
		{"TableResultColumn", (&api.TableResultColumn{}).ProtoReflect().Descriptor(), "column_name", "result columns expose database object names via column_name"},
	}

	for _, tc := range messages {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			if proto.HasExtension(tc.desc.Options(), annotations.E_Resource) {
				t.Fatalf("%s must stay a plain embedded value, not a google.api.resource", tc.name)
			}

			if tc.desc.Fields().ByName("name") != nil {
				t.Fatalf("%s must not have field name; %s", tc.name, tc.forbiddenNameMsg)
			}

			field := tc.desc.Fields().ByName(tc.objectNameField)
			if field == nil {
				t.Fatalf("%s missing %s field", tc.name, tc.objectNameField)
			}

			if field.Number() != 1 {
				t.Fatalf("%s.%s field number = %d, want 1 for wire compatibility", tc.name, tc.objectNameField, field.Number())
			}
		})
	}
}

func TestCanonicalPatternVariablesPreservesVariableOrder(t *testing.T) {
	t.Parallel()

	assert.Equal(
		t,
		"instances/{instance}/databases/{database}",
		canonicalPatternVariables("instances/{instanceID}/databases/{databaseID}"),
	)
	assert.NotEqual(
		t,
		canonicalPatternVariables("instances/{instanceID}/databases/{databaseID}"),
		canonicalPatternVariables("instances/{databaseID}/databases/{instanceID}"),
	)
}

func aipResourceType(descriptor protoreflect.MessageDescriptor) string {
	return "console.querylane.dev/" + string(descriptor.Name())
}

func canonicalPatternVariables(pattern string) string {
	parts := strings.Split(pattern, "/")
	for i, part := range parts {
		if strings.HasPrefix(part, "{") && strings.HasSuffix(part, "}") {
			variable := strings.TrimSuffix(strings.TrimPrefix(part, "{"), "}")
			parts[i] = "{" + strings.TrimSuffix(variable, "ID") + "}"
		}
	}

	return strings.Join(parts, "/")
}
