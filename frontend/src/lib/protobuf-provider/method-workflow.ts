import { http } from "@buf/googleapis_googleapis.bufbuild_es/google/api/annotations_pb.js";
import type { HttpRule } from "@buf/googleapis_googleapis.bufbuild_es/google/api/http_pb.js";
import {
  OperationSchema,
  operation_info,
} from "@buf/googleapis_googleapis.bufbuild_es/google/longrunning/operations_pb.js";
import {
  create,
  type DescMethod,
  getExtension,
  hasExtension,
} from "@bufbuild/protobuf";
import { MethodOptionsSchema } from "@bufbuild/protobuf/wkt";

export type ProtoMethodCategory = "batch" | "custom" | "standard";
export type ProtoMethodExecution = "long-running" | "streaming" | "unary";

export interface ProtoHttpBinding {
  bodyFields: readonly string[];
  method: string;
  path: string;
  pathFields: readonly string[];
  queryFields: readonly string[];
}

export interface ProtoOperationInfo {
  metadataType: string;
  responseType: string;
}

export interface ProtoMethodWorkflow {
  category: ProtoMethodCategory;
  execution: ProtoMethodExecution;
  httpBindings: readonly ProtoHttpBinding[];
  method: DescMethod;
  operation?: ProtoOperationInfo | undefined;
}

const STANDARD_METHOD_PATTERN = /^(Create|Delete|Get|List|Update)[A-Z]/u;
const PATH_FIELD_PATTERN = /\{([^}=]+)(?:=[^}]*)?\}/gu;

function getMethodCategory(name: string): ProtoMethodCategory {
  if (name.startsWith("Batch")) {
    return "batch";
  }
  return STANDARD_METHOD_PATTERN.test(name) ? "standard" : "custom";
}

function getHttpPattern(rule: HttpRule): { method: string; path: string } {
  const { pattern } = rule;
  if (pattern.case === undefined) {
    return { method: "", path: "" };
  }
  if (pattern.case === "custom") {
    return {
      method: pattern.value.kind.toUpperCase(),
      path: pattern.value.path,
    };
  }
  return {
    method: pattern.case.toUpperCase(),
    path: pattern.value,
  };
}

function parseHttpBinding(
  method: DescMethod,
  rule: HttpRule
): ProtoHttpBinding {
  const pattern = getHttpPattern(rule);
  const pathFields = Array.from(
    pattern.path.matchAll(PATH_FIELD_PATTERN),
    (match) => match[1]
  ).filter((field): field is string => field !== undefined);
  const pathFieldSet = new Set(pathFields);
  const requestFields = method.input.fields.map((field) => field.name);
  let bodyFields: string[] = [];
  let queryFields: string[] = [];
  if (rule.body === "*") {
    bodyFields = requestFields.filter((field) => !pathFieldSet.has(field));
  } else if (rule.body) {
    bodyFields = [rule.body];
    queryFields = requestFields.filter(
      (field) => !pathFieldSet.has(field) && field !== rule.body
    );
  } else {
    queryFields = requestFields.filter((field) => !pathFieldSet.has(field));
  }

  return {
    bodyFields,
    method: pattern.method,
    path: pattern.path,
    pathFields,
    queryFields,
  };
}

export function getProtoMethodWorkflow(
  method: DescMethod
): ProtoMethodWorkflow {
  const options = method.proto.options ?? create(MethodOptionsSchema);
  const httpRule = hasExtension(options, http)
    ? getExtension(options, http)
    : undefined;
  const operationInfo = hasExtension(options, operation_info)
    ? getExtension(options, operation_info)
    : undefined;
  const streaming = method.methodKind !== "unary";
  const longRunning = method.output.typeName === OperationSchema.typeName;
  let execution: ProtoMethodExecution = "unary";
  if (streaming) {
    execution = "streaming";
  } else if (longRunning) {
    execution = "long-running";
  }
  const operation =
    operationInfo?.metadataType && operationInfo.responseType
      ? {
          metadataType: operationInfo.metadataType,
          responseType: operationInfo.responseType,
        }
      : undefined;

  return {
    category: getMethodCategory(method.name),
    execution,
    httpBindings: httpRule
      ? [httpRule, ...httpRule.additionalBindings].map((rule) =>
          parseHttpBinding(method, rule)
        )
      : [],
    method,
    operation,
  };
}
