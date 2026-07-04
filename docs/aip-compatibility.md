# Backend AIP compatibility notes

<!-- aip-source:issue-170 -->

This note records the Querylane backend API compatibility decisions from the AIP cleanup around issues #170-#175 and PRs #176-#181. The parallel pagination work[^pagination-pr] stays scoped to list pagination and page-token semantics; these notes cover broader proto-shape decisions.

## Scope

<!-- aip-scope:proto-querylane -->

Reviewed proto sources under `proto/querylane/**`, especially:

- `proto/querylane/console/v1alpha1/instance.proto`
- `proto/querylane/console/v1alpha1/database.proto`
- `proto/querylane/console/v1alpha1/schema.proto`
- `proto/querylane/console/v1alpha1/table.proto`
- `proto/querylane/console/v1alpha1/view.proto`
- `proto/querylane/console/v1alpha1/role.proto`
- `proto/querylane/console/v1alpha1/table_data.proto`
- `proto/querylane/console/v1alpha1/console.proto`
- `proto/querylane/console/v1alpha1/onboarding.proto`
- `proto/querylane/console/v1alpha1/sql.proto`

## Compatibility classification

| Area | Current consolidated shape | AIP check | Classification | Decision |
| --- | --- | --- | --- | --- |
| <!-- aip-exception:wrapper-responses --> Wrapper responses | Existing standard methods still return `Get*Response`, `Create*Response`, `Update*Response`, and `Delete*Response` wrappers. | AIP standard methods normally return the resource directly for Get/Create/Update and `google.protobuf.Empty` for Delete. | <!-- aip-classification:migration-debt --> Migration debt. | Keep for v1alpha1 compatibility. New APIs must not copy this shape unless the exception is documented and allowlisted. |
| <!-- aip-exception:output-only-identifier-names --> Resource `name` field annotations | `Instance`, `Database`, `Schema`, `Table`, `View`, and `Role` keep `OUTPUT_ONLY + IDENTIFIER` on `name = 1` for v1alpha1 descriptor compatibility. | AIP identity rule: canonical new resources should use `IDENTIFIER` only because `IDENTIFIER` already carries create/update-specific semantics. | <!-- aip-classification:migration-debt --> Migration debt. | Preserve current descriptors in v1alpha1. New stable APIs should use `IDENTIFIER` only unless a compatibility exception is documented. |
| <!-- aip-exception:create-instance-spec --> `CreateInstanceRequest.spec` | `CreateInstanceRequest` now supports canonical `Instance instance = 5` and keeps `CreateInstanceSpec spec = 2` for existing clients. Exactly one of `spec` or `instance` is accepted. | AIP Create normally uses `{resource} resource` body and `{resource}_id`; body `name` is ignored. | <!-- aip-classification:permanent-v1alpha1-exception --> Permanent v1alpha1 compatibility field. | New clients should send `instance`; existing clients may keep using `spec`. The server composes `Instance.name` from `instance_id` and ignores body `instance.name`. |
| <!-- aip-exception:custom-table-data-rpcs --> Custom table data RPCs | `TableDataService` exposes `ReadRows`, `StreamRows`, and `ReadCellValue` against a table `name`. Filtering and ordering use structured messages rather than AIP string `filter` and `order_by`. | AIP-136 custom methods are acceptable when the action is not standard CRUD/List. | Intentional compatibility exception. | Keep. These are live data access operations, not resource List methods. Requests bind to the `Table` resource through `name`. |
| <!-- aip-exception:bounded-table-metadata-lists --> Bounded table metadata lists | `ListTableColumns`, `ListTableConstraints`, `ListTableIndexes`, `ListTablePolicies`, and `ListTableTriggers` return bounded child metadata without pagination. Child messages are embedded values and expose raw PostgreSQL object names through explicit `*_name` fields. | AIP List methods should paginate resources; resource `name` means full resource path. | Intentional compatibility exception unless promoted later. | Keep unpaginated while these remain bounded table-detail metadata. If promoted to resources, add `google.api.resource`, full `name`, `parent`, and pagination. |
| <!-- aip-exception:operational-surfaces --> Console, onboarding, and SQL surfaces | Console config, onboarding/setup streams, and ad-hoc SQL query methods use custom request/response shapes. | These are operational/custom methods rather than resource CRUD. | Intentional compatibility exception. | Keep. Apply AIP resource patterns only if these surfaces introduce durable resources. |

## Approved standard-method wrapper inventory

| RPC | Method | Current response | Canonical response | Decision |
| --- | --- | --- | --- | --- |
| `DatabaseService.GetDatabase` | `GetDatabase` | `GetDatabaseResponse` | `Database` | Keep v1alpha1 compatibility exception. |
| `InstanceService.GetInstance` | `GetInstance` | `GetInstanceResponse` | `Instance` | Keep v1alpha1 compatibility exception. |
| `InstanceService.CreateInstance` | `CreateInstance` | `CreateInstanceResponse` | `Instance` | Keep v1alpha1 compatibility exception. |
| `InstanceService.UpdateInstance` | `UpdateInstance` | `UpdateInstanceResponse` | `Instance` | Keep v1alpha1 compatibility exception. |
| `InstanceService.DeleteInstance` | `DeleteInstance` | `DeleteInstanceResponse` | `google.protobuf.Empty` | Keep v1alpha1 compatibility exception. |
| `RoleService.GetRole` | `GetRole` | `GetRoleResponse` | `Role` | Keep v1alpha1 compatibility exception. |
| `SchemaService.GetSchema` | `GetSchema` | `GetSchemaResponse` | `Schema` | Keep v1alpha1 compatibility exception. |
| `TableService.GetTable` | `GetTable` | `GetTableResponse` | `Table` | Keep v1alpha1 compatibility exception. |
| `ViewService.GetView` | `GetView` | `GetViewResponse` | `View` | Keep v1alpha1 compatibility exception. |

Non-standard RPCs such as configuration, onboarding, live instance overview, SQL execution, and table data operations are not part of this wrapper exception list.

## v1alpha1 JSON migration note

External Connect/JSON clients reading embedded table metadata should migrate from
the old `name` JSON field to explicit fields: `columnName`, `constraintName`,
`indexName`, `policyName`, `triggerName`, and table data result `columnName`.
The old proto field name is reserved so embedded metadata cannot accidentally
reuse `name` unless it becomes a full AIP resource name.

## Guardrails for future backend API changes

- New resources should use `string name = 1 [(google.api.field_behavior) = IDENTIFIER];` with a full resource path; existing v1alpha1 resources preserve `OUTPUT_ONLY + IDENTIFIER` as a documented descriptor-compatibility exception.
- New Create methods should use `{resource}_id` on the request and a resource body, unless a documented compatibility exception is approved.
- New List methods should include `parent` for nested collections, `page_size`, `page_token`, and `next_page_token` unless the response is explicitly bounded metadata.
- Update methods should require `google.protobuf.FieldMask` and reject unsupported masks where implemented.
- Embedded metadata values should not use `name` unless they are real AIP resources with a full resource path.
- <!-- aip-guardrail:generated-files --> Do not edit generated files under `backend/protogen/` or `frontend/src/protogen/` directly; run `task proto:generate` for proto changes.

## Pagination work boundary

<!-- aip-boundary:pagination-pr -->

The parallel pagination work remains scoped to AIP list pagination/token semantics. The exceptions above are pre-existing API compatibility choices or migration candidates. Folding them into pagination work would mix pagination fixes with breaking or broad proto-shape changes, increasing review risk without improving pagination behavior.

[^pagination-pr]: This was surfaced while reviewing PR #150, which should stay focused on AIP-132 and AIP-158 pagination/token semantics.
