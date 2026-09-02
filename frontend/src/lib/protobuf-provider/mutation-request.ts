import {
  create,
  type DescField,
  type DescMethodUnary,
  type Message,
  type MessageInitShape,
  type MessageShape,
} from "@bufbuild/protobuf";
import type { FieldMask } from "@bufbuild/protobuf/wkt";

import { getProtoMethodWorkflow } from "./method-workflow.js";

interface SharedMutationControls {
  requestId?: string | undefined;
  validateOnly?: boolean | undefined;
}

interface RequestInitValues {
  [field: string]: unknown;
}

export interface ComposeCreateRequestOptions extends SharedMutationControls {
  parent?: string | undefined;
  resource: Message;
  resourceId?: string | undefined;
}

export interface ComposeUpdateRequestOptions extends SharedMutationControls {
  resource: Message;
  updateMask?: FieldMask | undefined;
}

export interface ComposeDeleteRequestOptions extends SharedMutationControls {
  etag?: string | undefined;
  name: string;
}

function requireStandardMethod(
  method: DescMethodUnary,
  expected: "Create" | "Delete" | "Update"
): void {
  const workflow = getProtoMethodWorkflow(method);
  if (workflow.category !== "standard" || !method.name.startsWith(expected)) {
    throw new TypeError(
      `Expected ${expected} standard method descriptor, received ${method.name}.`
    );
  }
}

function findField(
  method: DescMethodUnary,
  ...names: string[]
): DescField | undefined {
  return method.input.fields.find((field) =>
    names.some(
      (name) =>
        field.localName === name ||
        field.name === name ||
        field.jsonName === name
    )
  );
}

function requireField(
  method: DescMethodUnary,
  purpose: string,
  ...names: string[]
): DescField {
  const field = findField(method, ...names);
  if (!field) {
    throw new TypeError(
      `${method.name} does not expose an unambiguous ${purpose} field.`
    );
  }
  return field;
}

function resourceField(method: DescMethodUnary): DescField {
  const workflow = getProtoMethodWorkflow(method);
  const [bodyField] = workflow.httpBindings.flatMap(
    (binding) => binding.bodyFields
  );
  if (bodyField) {
    return requireField(method, "resource body", bodyField);
  }
  const candidates = method.input.fields.filter(
    (field) =>
      field.fieldKind === "message" &&
      field.message.typeName !== "google.protobuf.FieldMask"
  );
  if (candidates.length !== 1) {
    throw new TypeError(
      `${method.name} does not expose an unambiguous resource body field.`
    );
  }
  return candidates[0] as DescField;
}

function assignOptional(
  init: RequestInitValues,
  method: DescMethodUnary,
  value: boolean | FieldMask | string | undefined,
  purpose: string,
  ...names: string[]
): void {
  if (value === undefined) {
    return;
  }
  init[requireField(method, purpose, ...names).localName] = value;
}

function createRequest<Method extends DescMethodUnary>(
  method: Method,
  init: RequestInitValues
): MessageShape<Method["input"]> {
  return create<Method["input"]>(
    method.input,
    init as MessageInitShape<Method["input"]>
  );
}

export function composeCreateRequest<Method extends DescMethodUnary>(
  method: Method,
  options: ComposeCreateRequestOptions
): MessageShape<Method["input"]> {
  requireStandardMethod(method, "Create");
  const resource = resourceField(method);
  const init: RequestInitValues = { [resource.localName]: options.resource };
  assignOptional(init, method, options.parent, "parent", "parent");
  assignOptional(
    init,
    method,
    options.resourceId,
    "resource id",
    resource.localName.concat("Id"),
    "resourceId"
  );
  assignOptional(
    init,
    method,
    options.requestId,
    "request id",
    "requestId",
    "request_id"
  );
  assignOptional(
    init,
    method,
    options.validateOnly,
    "validate only",
    "validateOnly",
    "validate_only"
  );
  return createRequest(method, init);
}

export function composeUpdateRequest<Method extends DescMethodUnary>(
  method: Method,
  options: ComposeUpdateRequestOptions
): MessageShape<Method["input"]> {
  requireStandardMethod(method, "Update");
  const resource = resourceField(method);
  const init: RequestInitValues = { [resource.localName]: options.resource };
  assignOptional(
    init,
    method,
    options.updateMask,
    "update mask",
    "updateMask",
    "update_mask"
  );
  assignOptional(
    init,
    method,
    options.requestId,
    "request id",
    "requestId",
    "request_id"
  );
  assignOptional(
    init,
    method,
    options.validateOnly,
    "validate only",
    "validateOnly",
    "validate_only"
  );
  return createRequest(method, init);
}

export function composeDeleteRequest<Method extends DescMethodUnary>(
  method: Method,
  options: ComposeDeleteRequestOptions
): MessageShape<Method["input"]> {
  requireStandardMethod(method, "Delete");
  const init: RequestInitValues = {};
  assignOptional(init, method, options.name, "resource name", "name");
  assignOptional(init, method, options.etag, "etag", "etag");
  assignOptional(
    init,
    method,
    options.requestId,
    "request id",
    "requestId",
    "request_id"
  );
  assignOptional(
    init,
    method,
    options.validateOnly,
    "validate only",
    "validateOnly",
    "validate_only"
  );
  return createRequest(method, init);
}
