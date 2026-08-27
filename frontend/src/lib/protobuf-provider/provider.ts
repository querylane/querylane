import { FieldBehavior } from "@buf/googleapis_googleapis.bufbuild_es/google/api/field_behavior_pb.js";
import {
  clone,
  create,
  type DescField,
  type DescMessage,
  type DescOneof,
  fromJson,
  fromJsonString,
  getExtension,
  isMessage,
  type JsonValue,
  type MessageInitShape,
  type MessageShape,
  type MessageValidType,
  ScalarType,
  toJson,
  toJsonString,
} from "@bufbuild/protobuf";
import { base64Decode, base64Encode } from "@bufbuild/protobuf/wire";
import {
  DurationSchema,
  FeatureSet_FieldPresence,
  type FieldMask,
  FieldOptionsSchema,
  isWrapperDesc,
  ListValueSchema,
  MessageOptionsSchema,
  OneofOptionsSchema,
  StructSchema,
  type TimestampSchema,
  timestampDate,
  timestampFromDate,
  ValueSchema,
} from "@bufbuild/protobuf/wkt";
import type { ValidatorOptions } from "@bufbuild/protovalidate";
import type {
  EmptyRepeatedStringPolicy,
  FieldRenderHints,
  FormValues,
  ParsedField,
  ParsedSchema,
  ProviderCustomData,
  SchemaProvider,
  SchemaValidation,
  StandardSchemaV1,
} from "../core/index.js";
import type { ProtoformMessageFormatter } from "../core/messages.js";
import {
  getProtoFieldBehaviors,
  getProtoResourceMetadata,
  getProtoResourceReference,
  type ProtoResourceMetadata,
  type ProtoResourceReference,
} from "./aip.js";
import type { ProtoAnnotations } from "./annotations.js";
import { getRegisteredProtoAnnotations } from "./annotations.js";
import type {
  FieldRules,
  MessageRules,
  OneofRules,
  StringRules,
} from "./gen/buf/validate/validate_pb.js";
import {
  field as fieldExtension,
  message as messageExtension,
  oneof as oneofExtension,
} from "./gen/buf/validate/validate_pb.js";
import { protoPathToFormPath } from "./proto-error-path.js";
import type { ProtoFieldUiConfig, ProtoMessageUiConfig } from "./ui-options.js";
import {
  getProtoFieldUi,
  getProtoMessageUi,
  getProtoOneofUi,
} from "./ui-options.js";
import { createDescriptorAwareStandardSchema } from "./validation-schema.js";

const GOOGLE_PROTOBUF_PREFIX = "google.protobuf.";
const TIMESTAMP_TYPE = `${GOOGLE_PROTOBUF_PREFIX}Timestamp`;
const DURATION_TYPE = `${GOOGLE_PROTOBUF_PREFIX}Duration`;
const FIELD_MASK_TYPE = `${GOOGLE_PROTOBUF_PREFIX}FieldMask`;
const STRUCT_TYPE = `${GOOGLE_PROTOBUF_PREFIX}Struct`;
const VALUE_TYPE = `${GOOGLE_PROTOBUF_PREFIX}Value`;
const LIST_VALUE_TYPE = `${GOOGLE_PROTOBUF_PREFIX}ListValue`;
const ANY_TYPE = `${GOOGLE_PROTOBUF_PREFIX}Any`;
const PROTO_JSON_FALLBACK_TYPES = [
  TIMESTAMP_TYPE,
  DURATION_TYPE,
  FIELD_MASK_TYPE,
  STRUCT_TYPE,
  VALUE_TYPE,
  LIST_VALUE_TYPE,
  ANY_TYPE,
];
export const PROTO_FORM_ROOT_ERROR_KEY = "__protoFormRoot__";
const IMPLICIT_FIELD_PRESENCE = FeatureSet_FieldPresence.IMPLICIT;

export type ProtoFieldType =
  | "string"
  | "number"
  | "boolean"
  | "select"
  | "object"
  | "array"
  | "oneof"
  | "map"
  | "bytes"
  | "int64"
  | "timestamp"
  | "duration"
  | "fieldMask"
  | "json";

export type ProtoFieldRenderType =
  | ProtoFieldType
  | "textarea"
  | "password"
  | "email"
  | "url"
  | "currency"
  | "checkbox"
  | "switch"
  | "toggle"
  | "radio"
  | "combobox"
  | "multiselect"
  | "choicebox"
  | "toggleGroup"
  | "keyValue"
  // Widget routing derived from field_ui annotations — `data_provider`
  // promotes a string/number field to `dataProviderSelect`, and a JSON
  // field with `dropzone: true` promotes to `dropzone-json`.
  | "dataProviderSelect"
  | "dropzone-json";

type ProtoJsonKind = "struct" | "value" | "listValue" | "any";

type ParsedProtoField = ParsedField<ProtoFieldRenderType>;
type ParsedProtoSchema = ParsedSchema<ProtoFieldRenderType>;

export interface ProtoFieldCustomData extends ProviderCustomData {
  allowedPaths?: string[] | undefined;
  deprecated?: boolean | undefined;
  desc?: DescField | undefined;
  fieldBehaviors?: readonly FieldBehavior[] | undefined;
  fieldRules?: FieldRules | undefined;
  hidden?: boolean | undefined;
  identifier?: boolean | undefined;
  immutable?: boolean | undefined;
  inputOnly?: boolean | undefined;
  inputType?: string | undefined;
  jsonKind?: ProtoJsonKind | undefined;
  keyField?: ParsedProtoField | undefined;
  maxItems?: number | undefined;
  maxPairs?: number | undefined;
  messageRules?: MessageRules | undefined;
  minItems?: number | undefined;
  minPairs?: number | undefined;
  oneof?: DescOneof | undefined;
  oneofRules?: OneofRules | undefined;
  recursive?: boolean | undefined;
  resource?: ProtoResourceMetadata | undefined;
  resourceReference?: ProtoResourceReference | undefined;
  ruleExample?: string | undefined;
  secretScope?: string | undefined;
  source: "proto";
  supportsUnset?: boolean | undefined;
  ui?: ProtoFieldUiConfig | undefined;
  valueField?: ParsedProtoField | undefined;
}

type ProtoFieldConfig = ParsedProtoField["fieldConfig"] & {
  customData?: ProtoFieldCustomData;
};

type SchemaIssue = StandardSchemaV1.Issue;

type AnyObject = Record<string, unknown>;
type ScalarField = Extract<DescField, { fieldKind: "scalar" }>;
type EnumField = Extract<DescField, { fieldKind: "enum" }>;
type MessageField = Extract<DescField, { fieldKind: "message" }>;
type ListField = Extract<DescField, { fieldKind: "list" }>;
type MapField = Extract<DescField, { fieldKind: "map" }>;

export interface ProtoAnyFormValue {
  typeUrl?: string;
  valueBase64?: string;
}

export interface ProtoMapFormEntry {
  key: unknown;
  value: unknown;
}

export interface ProtoConversionOptions {
  /**
   * Per-field policies keyed by descriptor path. Empty and whitespace-only
   * repeated strings are discarded unless the field is set to `preserve`.
   */
  emptyRepeatedStringPolicies?:
    | Readonly<Record<string, EmptyRepeatedStringPolicy>>
    | undefined;
}

export interface ProtoFormOptions
  extends ValidatorOptions,
    ProtoConversionOptions {
  formatMessage?: ProtoformMessageFormatter | undefined;
}

interface ProtoParserContext {
  ancestors: ReadonlySet<string>;
  annotations?: ProtoAnnotations | undefined;
  messageUi?: ProtoMessageUiConfig | undefined;
  operation?: "create" | "update" | undefined;
  secretScope?: string | undefined;
}

export function isProtoMessageDescriptor(value: unknown): value is DescMessage {
  return Boolean(
    value &&
      typeof value === "object" &&
      "kind" in value &&
      (value as { kind?: unknown }).kind === "message" &&
      "typeName" in value &&
      typeof (value as { typeName?: unknown }).typeName === "string" &&
      "members" in value &&
      Array.isArray((value as { members?: unknown }).members)
  );
}

export function getProtoFieldCustomData<FieldType extends string>(
  field: ParsedField<FieldType>
): ProtoFieldCustomData | undefined {
  return (field.fieldConfig as ProtoFieldConfig | undefined)?.customData;
}

function getFieldRules(field: DescField): FieldRules {
  return getExtension(
    field.proto.options ?? create(FieldOptionsSchema),
    fieldExtension
  );
}

function getMessageRules(desc: DescMessage): MessageRules {
  return getExtension(
    desc.proto.options ?? create(MessageOptionsSchema),
    messageExtension
  );
}

function getOneofRules(oneof: DescOneof): OneofRules {
  return getExtension(
    oneof.proto.options ?? create(OneofOptionsSchema),
    oneofExtension
  );
}

function tracksPresence(field: DescField): boolean {
  return field.presence !== IMPLICIT_FIELD_PRESENCE;
}

function is64BitScalar(scalar: ScalarType | undefined): boolean {
  return (
    scalar === ScalarType.INT64 ||
    scalar === ScalarType.UINT64 ||
    scalar === ScalarType.SINT64 ||
    scalar === ScalarType.FIXED64 ||
    scalar === ScalarType.SFIXED64
  );
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

const UNSPECIFIED_PATTERN = /(unspecified|unknown)$/iu;
const CAMEL_BOUNDARY_PATTERN = /([a-z0-9])([A-Z])/gu;
const WORD_SEPARATOR_PATTERN = /[_.-]+/gu;
const WHITESPACE_PATTERN = /\s+/gu;

function isUnspecifiedEnumValue(enumValue: {
  number: number;
  localName: string;
  name?: string;
}): boolean {
  if (enumValue.number !== 0) {
    return false;
  }
  // Check both localName (camelCase) and name (SCREAMING_SNAKE_CASE) for unspecified/unknown suffix
  return (
    UNSPECIFIED_PATTERN.test(enumValue.localName) ||
    (typeof enumValue.name === "string" &&
      UNSPECIFIED_PATTERN.test(enumValue.name))
  );
}

function humanize(input: string): string {
  return input
    .replace(CAMEL_BOUNDARY_PATTERN, "$1 $2")
    .replace(WORD_SEPARATOR_PATTERN, " ")
    .replace(WHITESPACE_PATTERN, " ")
    .trim()
    .split(" ")
    .map((word) => {
      const lower = word.toLowerCase();
      if (word === word.toUpperCase() && word.length > 1) {
        return word.charAt(0) + lower.slice(1);
      }
      return word.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ");
}

const NORMALIZE_SEPARATOR_PATTERN = /[\s_-]+/gu;

// Returns the raw localName for enum values.
// Consumers can override labels via optionLabels in fieldConfig.
// We intentionally do NOT humanize enum values because the transformed
// names are often confusing (e.g., "Api Key Location Header" vs "HEADER").
function formatEnumLabel(enumLocalName: string, enumTypeName: string): string {
  // Proto-gen-es v2 pre-strips the type prefix from localName in most cases.
  // If the localName still starts with the type name (camelCase), strip it.
  const typePrefixNormalized = enumTypeName
    .toLowerCase()
    .replace(NORMALIZE_SEPARATOR_PATTERN, "");
  const valueNormalized = enumLocalName
    .toLowerCase()
    .replace(NORMALIZE_SEPARATOR_PATTERN, "");
  if (
    valueNormalized.startsWith(typePrefixNormalized) &&
    valueNormalized.length > typePrefixNormalized.length
  ) {
    const stripped = enumLocalName.slice(typePrefixNormalized.length);
    if (stripped.length > 0) {
      return humanize(stripped);
    }
  }
  return humanize(enumLocalName);
}

function buildEnumOptions(
  values: readonly {
    number: number;
    localName: string;
    name?: string;
  }[],
  enumTypeName: string
): [string, string][] {
  const seenNumbers = new Set<number>();

  const options: [string, string][] = [];
  for (const value of values) {
    if (isUnspecifiedEnumValue(value) || seenNumbers.has(value.number)) {
      continue;
    }
    seenNumbers.add(value.number);
    options.push([
      String(value.number),
      formatEnumLabel(value.localName, enumTypeName),
    ]);
  }
  return options;
}

function bigIntToNumber(value: bigint | undefined): number | undefined {
  if (value === undefined) {
    return;
  }
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : undefined;
}

function cloneField(
  field: DescField,
  overrides: Partial<DescField>
): DescField {
  return {
    ...field,
    ...overrides,
  } as DescField;
}

function getStringInputType(
  rules: StringRules | undefined
): string | undefined {
  switch (rules?.wellKnown.case) {
    case "email":
      return "email";
    case "uri":
      return "url";
    case "uuid":
      return "text";
    default:
      return;
  }
}

function withFieldUi(
  customData: ProtoFieldCustomData,
  field: DescField
): ProtoFieldCustomData {
  return {
    ...customData,
    ui: getProtoFieldUi(field),
  };
}

function withOneofUi(
  customData: ProtoFieldCustomData,
  oneof: DescOneof
): ProtoFieldCustomData {
  return {
    ...customData,
    ui: getProtoOneofUi(oneof),
  };
}

type ProtoInputProps = Record<string, string | number | boolean | undefined>;

/**
 * Derive the schema-agnostic render hints for a field from its
 * proto-private customData. The rendering engine reads hints via
 * `getFieldHints`; customData stays provider-internal.
 */
function hintsFromCustomData(
  data: ProtoFieldCustomData | undefined
): FieldRenderHints | undefined {
  if (!data) {
    return undefined;
  }
  const { ui } = data;
  const hints: FieldRenderHints = {};
  const assign = <Key extends keyof FieldRenderHints>(
    key: Key,
    value: FieldRenderHints[Key] | undefined
  ) => {
    if (value !== undefined) {
      hints[key] = value;
    }
  };

  assign("control", ui?.control);
  assign("inputType", data.inputType);
  assign("placeholder", ui?.placeholder);
  assign("example", ui?.example ?? data.ruleExample);
  assign("help", ui?.help);
  assign("description", ui?.description);
  assign("summaryLabel", ui?.summaryLabel);
  assign("sensitive", ui?.sensitive);
  assign("step", ui?.step);
  assign("secretScope", data.secretScope);
  assign("docsUrl", ui?.docsUrl);
  assign("visibleWhen", ui?.visibleWhen);
  assign("disabledWhen", ui?.disabledWhen);
  assign("supportsUnset", data.supportsUnset);
  assign("jsonKind", data.jsonKind);
  assign("minItems", data.minItems);
  assign("maxItems", data.maxItems);
  assign("minPairs", data.minPairs);
  assign("maxPairs", data.maxPairs);
  assign("allowedPaths", data.allowedPaths);
  assign("dataProvider", ui?.dataProvider);
  assign("deprecated", data.deprecated);
  assign("dropzone", ui?.dropzone);

  return Object.keys(hints).length > 0 ? hints : undefined;
}

/** Attach derived render hints to a parsed field, in place. */
function attachRenderHints(field: ParsedProtoField): ParsedProtoField {
  const hints = hintsFromCustomData(
    (field.fieldConfig as ProtoFieldConfig | undefined)?.customData
  );
  if (hints) {
    field.hints = hints;
  }
  return field;
}

function buildFieldConfig(
  customData: ProtoFieldCustomData,
  inputProps: ProtoInputProps = {},
  description?: string
): ProtoFieldConfig {
  const fieldType = customData.ui?.control as ProtoFieldRenderType | undefined;

  return {
    customData,
    description,
    fieldType,
    inputProps: {
      ...(customData.ui?.placeholder
        ? { placeholder: customData.ui.placeholder }
        : {}),
      ...inputProps,
    },
  };
}

function getMessageDescription(
  desc: DescMessage,
  context: ProtoParserContext
): string | undefined {
  return context.annotations?.messages?.[desc.typeName];
}

function getFieldDescription(
  field: DescField,
  context: ProtoParserContext
): string | undefined {
  return context.annotations?.fields?.[
    `${field.parent.typeName}.${field.localName}`
  ];
}

function getOneofDescription(
  oneof: DescOneof,
  context: ProtoParserContext
): string | undefined {
  return context.annotations?.oneofs?.[
    `${oneof.parent.typeName}.${oneof.localName}`
  ];
}

function extractNumericBounds(rules: FieldRules | undefined): {
  min?: number | undefined;
  max?: number | undefined;
  step?: string | undefined;
} {
  const typeCase = rules?.type.case;
  if (!typeCase) {
    return {};
  }

  const numericRules = rules.type.value as {
    lessThan?: { case?: string; value?: number | bigint };
    greaterThan?: { case?: string; value?: number | bigint };
  };

  const step = ["float", "double"].includes(typeCase) ? "any" : "1";
  let min: number | undefined;
  let max: number | undefined;

  if (numericRules.greaterThan?.case === "gte") {
    min = Number(numericRules.greaterThan.value);
  } else if (numericRules.greaterThan?.case === "gt") {
    const greaterThan = Number(numericRules.greaterThan.value);
    min = Number.isFinite(greaterThan)
      ? greaterThan + (step === "1" ? 1 : 0)
      : undefined;
  }

  if (numericRules.lessThan?.case === "lte") {
    max = Number(numericRules.lessThan.value);
  } else if (numericRules.lessThan?.case === "lt") {
    const lessThan = Number(numericRules.lessThan.value);
    max = Number.isFinite(lessThan)
      ? lessThan - (step === "1" ? 1 : 0)
      : undefined;
  }

  if (min !== undefined && max !== undefined && min > max) {
    return { step };
  }

  return { max, min, step };
}

function buildStringField(
  field: DescField,
  rules: FieldRules,
  context: ProtoParserContext
): ParsedProtoField {
  const stringRules =
    rules.type.case === "string" ? rules.type.value : undefined;
  const inputType = getStringInputType(stringRules);

  return {
    fieldConfig: buildFieldConfig(
      withFieldUi(
        {
          desc: field,
          fieldRules: rules,
          inputType,
          ruleExample: stringRules?.example[0],
          source: "proto",
          supportsUnset: tracksPresence(field),
        },
        field
      ),
      {
        maxLength: bigIntToNumber(stringRules?.maxLen),
        minLength: bigIntToNumber(stringRules?.minLen),
        pattern: stringRules?.pattern || undefined,
        type: inputType,
      },
      getFieldDescription(field, context)
    ),
    key: field.localName,
    required: rules.required,
    type: "string",
  };
}

function buildNumberField(
  field: DescField,
  rules: FieldRules,
  context: ProtoParserContext
): ParsedProtoField {
  const { min, max, step } = extractNumericBounds(rules);
  const isInt64 = is64BitScalar(field.scalar);

  return {
    fieldConfig: buildFieldConfig(
      withFieldUi(
        {
          desc: field,
          fieldRules: rules,
          source: "proto",
          supportsUnset: tracksPresence(field),
        },
        field
      ),
      {
        ...(max === undefined ? {} : { max }),
        ...(min === undefined ? {} : { min }),
        step,
      },
      getFieldDescription(field, context)
    ),
    key: field.localName,
    required: rules.required,
    type: isInt64 ? "int64" : "number",
  };
}

function buildBooleanField(
  field: DescField,
  rules: FieldRules,
  context: ProtoParserContext
): ParsedProtoField {
  return {
    fieldConfig: buildFieldConfig(
      withFieldUi(
        {
          desc: field,
          fieldRules: rules,
          source: "proto",
          supportsUnset: tracksPresence(field),
        },
        field
      ),
      {},
      getFieldDescription(field, context)
    ),
    key: field.localName,
    required: rules.required,
    type: "boolean",
  };
}

function buildBytesField(
  field: DescField,
  rules: FieldRules,
  context: ProtoParserContext
): ParsedProtoField {
  return {
    fieldConfig: buildFieldConfig(
      withFieldUi(
        {
          desc: field,
          fieldRules: rules,
          source: "proto",
          supportsUnset: tracksPresence(field),
        },
        field
      ),
      {},
      getFieldDescription(field, context)
    ),
    key: field.localName,
    required: rules.required,
    type: "bytes",
  };
}

function buildEnumField(
  field: EnumField,
  rules: FieldRules,
  context: ProtoParserContext
): ParsedProtoField {
  return {
    fieldConfig: buildFieldConfig(
      withFieldUi(
        {
          desc: field,
          fieldRules: rules,
          source: "proto",
          supportsUnset: tracksPresence(field),
        },
        field
      ),
      {},
      getFieldDescription(field, context)
    ),
    key: field.localName,
    options: buildEnumOptions(field.enum.values, field.enum.name),
    required: rules.required,
    type: "select",
  };
}

function buildJsonField(
  field: DescField,
  rules: FieldRules,
  jsonKind: ProtoJsonKind,
  context: ProtoParserContext
): ParsedProtoField {
  return {
    fieldConfig: buildFieldConfig(
      withFieldUi(
        {
          desc: field,
          fieldRules: rules,
          jsonKind,
          source: "proto",
          supportsUnset: tracksPresence(field),
        },
        field
      ),
      {},
      getFieldDescription(field, context)
    ),
    key: field.localName,
    required: rules.required,
    type: "json",
  };
}

function buildRecursiveField(
  field: DescField,
  rules: FieldRules | undefined,
  context: ProtoParserContext,
  key = field.localName
): ParsedProtoField {
  return {
    fieldConfig: buildFieldConfig(
      {
        desc: field,
        fieldRules: rules,
        recursive: true,
        source: "proto",
        supportsUnset: tracksPresence(field),
      },
      {},
      getFieldDescription(field, context)
    ),
    key,
    required: Boolean(rules?.required),
    type: "json",
  };
}

function buildMessageField(
  field: MessageField,
  rules: FieldRules,
  context: ProtoParserContext
): ParsedProtoField {
  if (isWrapperDesc(field.message)) {
    const wrappedScalar = field.message.fields[0]?.scalar;
    if (wrappedScalar === ScalarType.BOOL) {
      return buildBooleanField(field as DescField, rules, context);
    }
    if (wrappedScalar === ScalarType.BYTES) {
      return buildBytesField(field, rules, context);
    }
    if (wrappedScalar === ScalarType.STRING) {
      return buildStringField(field, rules, context);
    }
    return buildNumberField(field as DescField, rules, context);
  }

  const description = getFieldDescription(field, context);

  if (context.ancestors.has(field.message.typeName)) {
    return buildRecursiveField(field, rules, context);
  }

  switch (field.message.typeName) {
    case TIMESTAMP_TYPE:
      return {
        fieldConfig: buildFieldConfig(
          withFieldUi(
            {
              desc: field,
              fieldRules: rules,
              source: "proto",
              supportsUnset: tracksPresence(field),
            },
            field
          ),
          {},
          description
        ),
        key: field.localName,
        required: rules.required,
        type: "timestamp",
      };
    case DURATION_TYPE:
      return {
        fieldConfig: buildFieldConfig(
          withFieldUi(
            {
              desc: field,
              fieldRules: rules,
              source: "proto",
              supportsUnset: tracksPresence(field),
            },
            field
          ),
          {},
          description
        ),
        key: field.localName,
        required: rules.required,
        type: "duration",
      };
    case FIELD_MASK_TYPE:
      return {
        fieldConfig: buildFieldConfig(
          withFieldUi(
            {
              allowedPaths:
                rules.type.case === "fieldMask"
                  ? rules.type.value.in
                  : undefined,
              desc: field,
              fieldRules: rules,
              source: "proto",
              supportsUnset: tracksPresence(field),
            },
            field
          ),
          {},
          description
        ),
        key: field.localName,
        required: rules.required,
        type: "fieldMask",
      };
    case STRUCT_TYPE:
      return buildJsonField(field, rules, "struct", context);
    case VALUE_TYPE:
      return buildJsonField(field, rules, "value", context);
    case LIST_VALUE_TYPE:
      return buildJsonField(field, rules, "listValue", context);
    case ANY_TYPE:
      return buildJsonField(field, rules, "any", context);
    default:
      return {
        fieldConfig: buildFieldConfig(
          withFieldUi(
            {
              desc: field,
              fieldRules: rules,
              messageRules: getMessageRules(field.message),
              source: "proto",
              supportsUnset: tracksPresence(field),
            },
            field
          ),
          {},
          description ?? getMessageDescription(field.message, context)
        ),
        key: field.localName,
        required: rules.required,
        schema: parseProtoSchemaInternal(
          field.message,
          context.annotations,
          context.secretScope,
          context.ancestors,
          context.operation
        ).fields,
        type: "object",
      };
  }
}

function buildListItemField(
  field: ListField,
  context: ProtoParserContext,
  itemRules?: FieldRules
): ParsedProtoField {
  const syntheticField = cloneField(field, {
    localName: "value",
  });

  if (field.listKind === "scalar") {
    if (field.scalar === ScalarType.STRING) {
      return buildStringField(
        syntheticField,
        itemRules ?? getFieldRules(field),
        context
      );
    }
    if (field.scalar === ScalarType.BOOL) {
      return buildBooleanField(
        syntheticField,
        itemRules ?? getFieldRules(field),
        context
      );
    }
    if (field.scalar === ScalarType.BYTES) {
      return buildBytesField(
        syntheticField,
        itemRules ?? getFieldRules(field),
        context
      );
    }
    return buildNumberField(
      syntheticField,
      itemRules ?? getFieldRules(field),
      context
    );
  }

  if (field.listKind === "enum") {
    return {
      fieldConfig: buildFieldConfig({
        desc: field,
        fieldRules: itemRules,
        source: "proto",
      }),
      key: "value",
      options: buildEnumOptions(field.enum.values, field.enum.name),
      required: false,
      type: "select",
    };
  }

  if (context.ancestors.has(field.message.typeName)) {
    return buildRecursiveField(field, itemRules, context, "value");
  }

  return {
    fieldConfig: buildFieldConfig(
      {
        desc: field,
        fieldRules: itemRules,
        source: "proto",
      },
      {},
      getMessageDescription(field.message, context)
    ),
    key: "value",
    required: false,
    schema: parseProtoSchemaInternal(
      field.message,
      context.annotations,
      context.secretScope,
      context.ancestors,
      context.operation
    ).fields,
    type: "object",
  };
}

function buildArrayField(
  field: ListField,
  rules: FieldRules,
  context: ProtoParserContext
): ParsedProtoField {
  const repeatedRules =
    rules.type.case === "repeated" ? rules.type.value : undefined;
  return {
    fieldConfig: buildFieldConfig(
      withFieldUi(
        {
          desc: field,
          fieldRules: rules,
          maxItems: bigIntToNumber(repeatedRules?.maxItems),
          minItems: bigIntToNumber(repeatedRules?.minItems),
          source: "proto",
        },
        field
      ),
      {},
      getFieldDescription(field, context)
    ),
    key: field.localName,
    required: Boolean(rules.required || repeatedRules?.minItems),
    schema: [buildListItemField(field, context, repeatedRules?.items)],
    type: "array",
  };
}

function buildMapKeyField(
  field: MapField,
  rules: FieldRules | undefined,
  context: ProtoParserContext
): ParsedProtoField {
  const syntheticField = cloneField(field, {
    fieldKind: "scalar",
    localName: "key",
    oneof: undefined,
    scalar: field.mapKey,
  });

  if (field.mapKey === ScalarType.BOOL) {
    return buildBooleanField(
      syntheticField,
      rules ?? getFieldRules(field),
      context
    );
  }
  if (field.mapKey === ScalarType.STRING) {
    return buildStringField(
      syntheticField,
      rules ?? getFieldRules(field),
      context
    );
  }
  return buildNumberField(
    syntheticField,
    rules ?? getFieldRules(field),
    context
  );
}

function buildMapValueField(
  field: MapField,
  rules: FieldRules | undefined,
  context: ProtoParserContext
): ParsedProtoField {
  const syntheticField = cloneField(field, {
    localName: "value",
  });

  if (field.mapKind === "scalar") {
    if (field.scalar === ScalarType.STRING) {
      return buildStringField(
        syntheticField,
        rules ?? getFieldRules(field),
        context
      );
    }
    if (field.scalar === ScalarType.BOOL) {
      return buildBooleanField(
        syntheticField,
        rules ?? getFieldRules(field),
        context
      );
    }
    if (field.scalar === ScalarType.BYTES) {
      return buildBytesField(
        syntheticField,
        rules ?? getFieldRules(field),
        context
      );
    }
    return buildNumberField(
      syntheticField,
      rules ?? getFieldRules(field),
      context
    );
  }

  if (field.mapKind === "enum") {
    return {
      fieldConfig: buildFieldConfig({
        desc: field,
        fieldRules: rules,
        source: "proto",
      }),
      key: "value",
      options: buildEnumOptions(field.enum.values, field.enum.name),
      required: false,
      type: "select",
    };
  }

  return buildMessageField(
    syntheticField as MessageField,
    rules ?? getFieldRules(field),
    context
  );
}

function buildMapField(
  field: MapField,
  rules: FieldRules,
  context: ProtoParserContext
): ParsedProtoField {
  const mapRules = rules.type.case === "map" ? rules.type.value : undefined;
  const keyField = buildMapKeyField(field, mapRules?.keys, context);
  const valueField = buildMapValueField(field, mapRules?.values, context);

  return {
    fieldConfig: buildFieldConfig(
      withFieldUi(
        {
          desc: field,
          fieldRules: rules,
          keyField,
          maxPairs: bigIntToNumber(mapRules?.maxPairs),
          minPairs: bigIntToNumber(mapRules?.minPairs),
          source: "proto",
          valueField,
        },
        field
      ),
      {},
      getFieldDescription(field, context)
    ),
    key: field.localName,
    required: Boolean(rules.required || mapRules?.minPairs),
    schema: [keyField, valueField],
    type: "map",
  };
}

function buildOneofField(
  oneof: DescOneof,
  context: ProtoParserContext
): ParsedProtoField {
  const oneofRules = getOneofRules(oneof);
  return attachRenderHints({
    fieldConfig: buildFieldConfig(
      withOneofUi(
        {
          oneof,
          oneofRules,
          source: "proto",
        },
        oneof
      ),
      {},
      getOneofDescription(oneof, context)
    ),
    key: oneof.localName,
    required: oneofRules.required,
    schema: oneof.fields.map((field) => buildProtoField(field, context)),
    type: "oneof",
  });
}

function buildProtoField(
  field: DescField,
  context: ProtoParserContext
): ParsedProtoField {
  const rules = getFieldRules(field);

  let result: ParsedProtoField;
  switch (field.fieldKind) {
    case "scalar": {
      if (field.scalar === ScalarType.STRING) {
        result = buildStringField(field, rules, context);
        break;
      }
      if (field.scalar === ScalarType.BOOL) {
        result = buildBooleanField(field, rules, context);
        break;
      }
      if (field.scalar === ScalarType.BYTES) {
        result = buildBytesField(field, rules, context);
        break;
      }
      result = buildNumberField(field, rules, context);
      break;
    }
    case "enum":
      result = buildEnumField(field, rules, context);
      break;
    case "message":
      result = buildMessageField(field, rules, context);
      break;
    case "list":
      result = buildArrayField(field, rules, context);
      break;
    case "map":
      result = buildMapField(field, rules, context);
      break;
    default:
      throw new Error(
        `Unsupported protobuf field kind: ${String((field as DescField).fieldKind)}`
      );
  }

  if (result.fieldConfig) {
    const { customData } = result.fieldConfig as ProtoFieldConfig;
    if (customData) {
      if (context.secretScope) {
        customData.secretScope = context.secretScope;
      }
      const fieldBehaviors = getProtoFieldBehaviors(field);
      const isIdentifier = fieldBehaviors.includes(FieldBehavior.IDENTIFIER);
      const isImmutable = fieldBehaviors.includes(FieldBehavior.IMMUTABLE);
      customData.fieldBehaviors = fieldBehaviors;
      if (field.proto.options?.deprecated === true) {
        customData.deprecated = true;
      }
      customData.hidden =
        fieldBehaviors.includes(FieldBehavior.OUTPUT_ONLY) ||
        (isIdentifier && context.operation === "create");
      customData.identifier = isIdentifier;
      customData.immutable =
        (isImmutable && context.operation !== "create") ||
        (isIdentifier && context.operation === "update");
      customData.inputOnly = fieldBehaviors.includes(FieldBehavior.INPUT_ONLY);
      customData.resourceReference = getProtoResourceReference(field);
      const messageDesc =
        field.fieldKind === "message" ||
        (field.fieldKind === "list" && field.listKind === "message") ||
        (field.fieldKind === "map" && field.mapKind === "message")
          ? field.message
          : undefined;
      customData.resource = messageDesc
        ? getProtoResourceMetadata(messageDesc)
        : undefined;
      result.required = Boolean(
        result.required ||
          fieldBehaviors.includes(FieldBehavior.REQUIRED) ||
          (isIdentifier && context.operation === "update")
      );
    }
  }

  return attachRenderHints(result);
}

export function getProtoMessageUiConfig(
  desc: DescMessage
): ProtoMessageUiConfig | undefined {
  return getProtoMessageUi(desc);
}

function parseProtoSchemaInternal(
  desc: DescMessage,
  annotations: ProtoAnnotations | undefined,
  parentSecretScope: string | undefined,
  ancestors: ReadonlySet<string>,
  operation?: "create" | "update"
): ParsedProtoSchema {
  const messageUi = getProtoMessageUi(desc);
  const context: ProtoParserContext = {
    ancestors: new Set([...ancestors, desc.typeName]),
    annotations,
    messageUi,
    operation: operation ?? inferProtoOperation(desc),
    secretScope: messageUi?.secretScope ?? parentSecretScope,
  };
  return {
    fields: desc.members.map((member) =>
      member.kind === "oneof"
        ? buildOneofField(member, context)
        : buildProtoField(member, context)
    ),
  };
}

export function parseProtoSchema(
  desc: DescMessage,
  annotations = getRegisteredProtoAnnotations(desc),
  parentSecretScope?: string
): ParsedProtoSchema {
  return parseProtoSchemaInternal(
    desc,
    annotations,
    parentSecretScope,
    new Set(),
    undefined
  );
}

const CREATE_REQUEST_PATTERN = /^Create.+Request$/u;
const UPDATE_REQUEST_PATTERN = /^Update.+Request$/u;

function inferProtoOperation(
  desc: DescMessage
): "create" | "update" | undefined {
  const messageName = desc.typeName.split(".").at(-1) ?? "";
  if (CREATE_REQUEST_PATTERN.test(messageName)) {
    return "create";
  }
  if (UPDATE_REQUEST_PATTERN.test(messageName)) {
    return "update";
  }
  return undefined;
}

function toDateTimeLocalValue(
  timestamp: MessageShape<typeof TimestampSchema> | undefined
): string | undefined {
  if (!timestamp) {
    return;
  }

  const date = timestampDate(timestamp);
  if (Number.isNaN(date.getTime())) {
    return;
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");

  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function objectHasValues(value: Record<string, unknown>): boolean {
  return Object.values(value).some((entry) => {
    if (entry === undefined || entry === null) {
      return false;
    }
    if (typeof entry === "string") {
      return entry.trim().length > 0;
    }
    if (Array.isArray(entry)) {
      return entry.length > 0;
    }
    if (typeof entry === "object") {
      return isPlainObject(entry) ? objectHasValues(entry) : true;
    }
    return true;
  });
}

function isJsonValue(value: unknown): value is JsonValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return true;
  }
  if (typeof value === "number") {
    return Number.isFinite(value);
  }
  if (Array.isArray(value)) {
    return value.every(isJsonValue);
  }
  return isPlainObject(value) && Object.values(value).every(isJsonValue);
}

function fieldToFormValue(field: DescField, value: unknown): unknown {
  switch (field.fieldKind) {
    case "scalar": {
      if (field.scalar === ScalarType.BYTES) {
        return value instanceof Uint8Array ? base64Encode(value) : undefined;
      }
      if (is64BitScalar(field.scalar)) {
        return typeof value === "bigint"
          ? value.toString()
          : (value ?? undefined);
      }
      return value;
    }
    case "enum":
      return value;
    case "message": {
      if (isWrapperDesc(field.message)) {
        const wrappedScalar = field.message.fields[0]?.scalar;
        if (wrappedScalar === ScalarType.BYTES) {
          return value instanceof Uint8Array ? base64Encode(value) : undefined;
        }
        if (is64BitScalar(wrappedScalar)) {
          return typeof value === "bigint"
            ? value.toString()
            : (value ?? undefined);
        }
        return value;
      }

      switch (field.message.typeName) {
        case TIMESTAMP_TYPE:
          return toDateTimeLocalValue(
            value as MessageShape<typeof TimestampSchema> | undefined
          );
        case DURATION_TYPE:
          return value
            ? toJsonString(
                DurationSchema,
                value as MessageShape<typeof DurationSchema>
              ).replace(/"/gu, "")
            : undefined;
        case FIELD_MASK_TYPE:
          return isPlainObject(value) &&
            Array.isArray((value as { paths?: unknown[] }).paths)
            ? (value as { paths: string[] }).paths
            : undefined;
        case STRUCT_TYPE:
          if (isMessage(value, StructSchema)) {
            return toJson(StructSchema, value);
          }
          return isPlainObject(value) && isJsonValue(value)
            ? structuredClone(value)
            : undefined;
        case VALUE_TYPE:
          if (isMessage(value, ValueSchema)) {
            return toJson(ValueSchema, value);
          }
          return isJsonValue(value) ? structuredClone(value) : undefined;
        case LIST_VALUE_TYPE:
          if (isMessage(value, ListValueSchema)) {
            return toJson(ListValueSchema, value);
          }
          return Array.isArray(value) && isJsonValue(value)
            ? structuredClone(value)
            : undefined;
        case ANY_TYPE:
          return value && isPlainObject(value)
            ? {
                typeUrl:
                  typeof (value as { typeUrl?: unknown }).typeUrl === "string"
                    ? (value as { typeUrl: string }).typeUrl
                    : "",
                valueBase64:
                  (value as { value?: unknown }).value instanceof Uint8Array
                    ? base64Encode((value as { value: Uint8Array }).value)
                    : "",
              }
            : undefined;
        default:
          return value
            ? messageToFormValues(field.message, value as AnyObject)
            : undefined;
      }
    }
    case "list":
      return Array.isArray(value)
        ? value.map((item) => listItemToFormValue(field, item))
        : [];
    case "map": {
      if (!isPlainObject(value)) {
        return [];
      }
      return Object.entries(value).map(
        ([key, entryValue]) =>
          ({
            key: mapKeyToFormValue(field, key),
            value: mapValueToFormValue(field, entryValue),
          }) satisfies ProtoMapFormEntry
      );
    }
    default:
      return value;
  }
}

function listItemToFormValue(field: ListField, value: unknown): unknown {
  if (field.listKind === "message" && value) {
    if (isWrapperDesc(field.message)) {
      return value;
    }
    return messageToFormValues(field.message, value as AnyObject);
  }

  if (field.listKind === "scalar" && field.scalar === ScalarType.BYTES) {
    return value instanceof Uint8Array ? base64Encode(value) : undefined;
  }

  if (field.listKind === "scalar" && is64BitScalar(field.scalar)) {
    return typeof value === "bigint" ? value.toString() : value;
  }

  return value;
}

function mapValueToFormValue(field: MapField, value: unknown): unknown {
  if (field.mapKind === "message" && value) {
    if (isWrapperDesc(field.message)) {
      return value;
    }
    return messageToFormValues(field.message, value as AnyObject);
  }

  if (field.mapKind === "scalar" && field.scalar === ScalarType.BYTES) {
    return value instanceof Uint8Array ? base64Encode(value) : undefined;
  }

  if (field.mapKind === "scalar" && is64BitScalar(field.scalar)) {
    return typeof value === "bigint" ? value.toString() : value;
  }

  return value;
}

function mapKeyToFormValue(
  field: MapField,
  key: string
): string | number | boolean {
  if (field.mapKey === ScalarType.BOOL) {
    return key === "true";
  }
  if (is64BitScalar(field.mapKey) || field.mapKey === ScalarType.STRING) {
    return key;
  }
  return Number(key);
}

function messageToFormValues(
  desc: DescMessage,
  value: AnyObject
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const member of desc.members) {
    if (member.kind === "oneof") {
      const oneofValue = value[member.localName] as
        | { case?: string; value?: unknown }
        | undefined;
      if (!oneofValue?.case) {
        result[member.localName] = { case: undefined, value: undefined };
        continue;
      }

      const activeField = member.fields.find(
        (field) => field.localName === oneofValue.case
      );
      result[member.localName] = {
        case: oneofValue.case,
        value: activeField
          ? fieldToFormValue(activeField, oneofValue.value)
          : oneofValue.value,
      };
      continue;
    }

    result[member.localName] = fieldToFormValue(
      member,
      value[member.localName]
    );
  }

  return result;
}

export function protoToFormValues<Desc extends DescMessage>(
  desc: Desc,
  value?: MessageShape<Desc>
): Record<string, unknown> {
  const baseValue = (value ?? create(desc)) as AnyObject;
  return messageToFormValues(desc, baseValue);
}

function normalizeBooleanValue(value: unknown): boolean | undefined {
  if (value === undefined || value === null || value === "") {
    return;
  }
  if (typeof value === "boolean") {
    return value;
  }
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }
  return Boolean(value);
}

function normalizeNumberValue(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") {
    return;
  }
  if (typeof value === "number") {
    return Number.isNaN(value) ? undefined : value;
  }
  const parsed = Number(value);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function normalizeFloatingPointValue(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") {
    return;
  }
  if (typeof value === "number") {
    return value;
  }
  if (value === "NaN") {
    return Number.NaN;
  }
  const parsed = Number(value);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function normalizeBigIntValue(value: unknown): bigint | undefined {
  if (value === undefined || value === null || value === "") {
    return;
  }
  if (typeof value === "bigint") {
    return value;
  }
  if (typeof value === "number" && Number.isSafeInteger(value)) {
    return BigInt(value);
  }
  if (typeof value === "string") {
    try {
      return BigInt(value);
    } catch {}
  }
  return undefined;
}

function normalizeScalarValue(field: DescField, value: unknown): unknown {
  if (field.scalar === ScalarType.STRING) {
    if (typeof value === "string") {
      return value;
    }

    if (value === undefined || value === null) {
      return;
    }

    return String(value);
  }
  if (field.scalar === ScalarType.BOOL) {
    return normalizeBooleanValue(value);
  }
  if (field.scalar === ScalarType.BYTES) {
    if (typeof value === "string") {
      return base64Decode(value);
    }

    return value instanceof Uint8Array ? value : undefined;
  }
  if (field.scalar === ScalarType.FLOAT || field.scalar === ScalarType.DOUBLE) {
    return normalizeFloatingPointValue(value);
  }
  if (is64BitScalar(field.scalar)) {
    return normalizeBigIntValue(value);
  }
  return normalizeNumberValue(value);
}

function normalizeMessageFieldValue(
  field: MessageField,
  value: unknown,
  options: ProtoConversionOptions,
  path: readonly string[]
): unknown {
  if (isWrapperDesc(field.message)) {
    const wrappedScalar = field.message.fields[0]?.scalar;
    const wrappedField = cloneField(field, {
      fieldKind: "scalar",
      scalar: wrappedScalar,
    });
    return normalizeScalarValue(wrappedField, value);
  }

  switch (field.message.typeName) {
    case TIMESTAMP_TYPE:
      return typeof value === "string" && value
        ? timestampFromDate(new Date(value))
        : undefined;
    case DURATION_TYPE:
      return typeof value === "string" && value
        ? fromJsonString(DurationSchema, JSON.stringify(value))
        : undefined;
    case FIELD_MASK_TYPE:
      return Array.isArray(value) && value.length > 0
        ? {
            paths: value.filter(
              (entry): entry is string => typeof entry === "string"
            ),
          }
        : undefined;
    case STRUCT_TYPE:
      return value === undefined
        ? undefined
        : fromJson(StructSchema, (value ?? {}) as JsonValue);
    case VALUE_TYPE:
      return value === undefined
        ? undefined
        : fromJson(ValueSchema, value as JsonValue);
    case LIST_VALUE_TYPE:
      return value === undefined
        ? undefined
        : fromJson(ListValueSchema, value as JsonValue);
    case ANY_TYPE: {
      const anyValue = isPlainObject(value)
        ? (value as ProtoAnyFormValue)
        : undefined;
      if (!(anyValue?.typeUrl || anyValue?.valueBase64)) {
        return;
      }
      return {
        typeUrl: anyValue?.typeUrl ?? "",
        value: base64Decode(anyValue?.valueBase64 ?? ""),
      };
    }
    default: {
      const nested = isPlainObject(value)
        ? messageToProtoInit(field.message, value, options, path)
        : undefined;
      if (!(nested && objectHasValues(nested))) {
        return tracksPresence(field) ? undefined : nested;
      }
      return nested;
    }
  }
}

function listItemToProtoValue(
  field: ListField,
  value: unknown,
  options: ProtoConversionOptions,
  path: readonly string[]
): unknown {
  if (field.listKind === "scalar") {
    return normalizeScalarValue(
      cloneField(field, {
        fieldKind: "scalar",
        oneof: undefined,
      }),
      value
    );
  }
  if (field.listKind === "enum") {
    return value === undefined || value === "" ? undefined : Number(value);
  }
  if (isWrapperDesc(field.message)) {
    return value;
  }
  return isPlainObject(value)
    ? messageToProtoInit(field.message, value, options, path)
    : undefined;
}

function mapValueToProtoValue(
  field: MapField,
  value: unknown,
  options: ProtoConversionOptions,
  path: readonly string[]
): unknown {
  if (field.mapKind === "scalar") {
    return normalizeScalarValue(
      cloneField(field, {
        fieldKind: "scalar",
        oneof: undefined,
      }),
      value
    );
  }
  if (field.mapKind === "enum") {
    return value === undefined || value === "" ? undefined : Number(value);
  }
  if (isWrapperDesc(field.message)) {
    return value;
  }
  return isPlainObject(value)
    ? messageToProtoInit(field.message, value, options, path)
    : undefined;
}

function repeatedListEntries(
  field: ListField,
  value: unknown,
  options: ProtoConversionOptions,
  path: readonly string[]
): unknown[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const policy = options.emptyRepeatedStringPolicies?.[path.join(".")];
  if (
    field.listKind !== "scalar" ||
    field.scalar !== ScalarType.STRING ||
    policy === "preserve"
  ) {
    return value;
  }
  return value.filter(
    (entry) => typeof entry !== "string" || entry.trim().length > 0
  );
}

function fieldToProtoValue(
  field: DescField,
  value: unknown,
  options: ProtoConversionOptions,
  path: readonly string[]
): unknown {
  switch (field.fieldKind) {
    case "scalar":
      return normalizeScalarValue(field, value);
    case "enum":
      return value === undefined || value === "" ? undefined : Number(value);
    case "message":
      return normalizeMessageFieldValue(field, value, options, path);
    case "list":
      return repeatedListEntries(field, value, options, path).map((entry) =>
        listItemToProtoValue(field, entry, options, path)
      );
    case "map": {
      const entries = isPlainObject(value)
        ? Object.entries(value).map(([key, mapValue]) => ({
            key,
            value: mapValue,
          }))
        : value;
      return Array.isArray(entries)
        ? Object.fromEntries(
            entries
              .map((entry) => {
                if (!isPlainObject(entry)) {
                  return null;
                }
                const mapKey = entry["key"];
                if (mapKey === undefined || mapKey === null || mapKey === "") {
                  return null;
                }
                return [
                  String(mapKey),
                  mapValueToProtoValue(field, entry["value"], options, path),
                ] as const;
              })
              .filter(
                (entry): entry is readonly [string, unknown] => entry !== null
              )
          )
        : {};
    }
    default:
      return value;
  }
}

function messageToProtoInit(
  desc: DescMessage,
  value: AnyObject,
  options: ProtoConversionOptions,
  path: readonly string[]
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const member of desc.members) {
    if (member.kind === "oneof") {
      const oneofValue = value[member.localName] as
        | { case?: string; value?: unknown }
        | undefined;
      if (!oneofValue?.case) {
        continue;
      }

      const activeField = member.fields.find(
        (field) => field.localName === oneofValue.case
      );
      if (!activeField) {
        continue;
      }

      result[member.localName] = {
        case: oneofValue.case,
        value: fieldToProtoValue(activeField, oneofValue.value, options, [
          ...path,
          member.localName,
          activeField.localName,
        ]),
      };
      continue;
    }

    const normalized = fieldToProtoValue(
      member,
      value[member.localName],
      options,
      [...path, member.localName]
    );
    if (normalized === undefined && tracksPresence(member)) {
      continue;
    }
    result[member.localName] = normalized;
  }

  return result;
}

export function formValuesToProtoInit<Desc extends DescMessage>(
  desc: Desc,
  values: Record<string, unknown>,
  options: ProtoConversionOptions = {}
): MessageInitShape<Desc> {
  return messageToProtoInit(
    desc,
    values,
    options,
    []
  ) as MessageInitShape<Desc>;
}

function knownMessageValuesEqual(
  desc: DescMessage,
  left: AnyObject,
  right: AnyObject
): boolean {
  return (
    toJsonString(desc, left as never) === toJsonString(desc, right as never)
  );
}

function preserveRepeatedMessageUnknownFields(
  desc: DescMessage,
  target: unknown[],
  source: unknown[]
): void {
  const matchedSourceIndexes = new Set<number>();
  const matchedTargetIndexes = new Set<number>();

  for (const [targetIndex, targetValue] of target.entries()) {
    if (!isPlainObject(targetValue)) {
      continue;
    }
    const candidates = source.flatMap(
      (candidateSourceValue, candidateSourceIndex) =>
        !matchedSourceIndexes.has(candidateSourceIndex) &&
        isPlainObject(candidateSourceValue) &&
        knownMessageValuesEqual(desc, targetValue, candidateSourceValue)
          ? [candidateSourceIndex]
          : []
    );
    if (candidates.length !== 1) {
      continue;
    }
    const [sourceIndex] = candidates;
    if (sourceIndex === undefined) {
      continue;
    }
    const sourceValue = source[sourceIndex];
    if (!isPlainObject(sourceValue)) {
      continue;
    }
    const competingTargetCount = target.filter(
      (candidate, candidateIndex) =>
        !matchedTargetIndexes.has(candidateIndex) &&
        isPlainObject(candidate) &&
        knownMessageValuesEqual(desc, candidate, sourceValue)
    ).length;
    if (competingTargetCount !== 1) {
      continue;
    }
    preserveMessageUnknownFields(desc, targetValue, sourceValue);
    matchedSourceIndexes.add(sourceIndex);
    matchedTargetIndexes.add(targetIndex);
  }

  if (target.length !== source.length) {
    return;
  }

  for (const [index, targetValue] of target.entries()) {
    const sourceValue = source[index];
    if (
      matchedTargetIndexes.has(index) ||
      matchedSourceIndexes.has(index) ||
      !isPlainObject(targetValue) ||
      !isPlainObject(sourceValue)
    ) {
      continue;
    }
    preserveMessageUnknownFields(desc, targetValue, sourceValue);
  }
}

function preserveFieldUnknownFields(
  field: DescField,
  target: unknown,
  source: unknown
): void {
  switch (field.fieldKind) {
    case "message":
      if (isPlainObject(target) && isPlainObject(source)) {
        preserveMessageUnknownFields(field.message, target, source);
      }
      return;
    case "list":
      if (
        field.listKind === "message" &&
        Array.isArray(target) &&
        Array.isArray(source)
      ) {
        preserveRepeatedMessageUnknownFields(field.message, target, source);
      }
      return;
    case "map":
      if (
        field.mapKind === "message" &&
        isPlainObject(target) &&
        isPlainObject(source)
      ) {
        for (const [key, targetValue] of Object.entries(target)) {
          const sourceValue = source[key];
          if (isPlainObject(targetValue) && isPlainObject(sourceValue)) {
            preserveMessageUnknownFields(
              field.message,
              targetValue,
              sourceValue
            );
          }
        }
      }
      return;
    case "enum":
    case "scalar":
      return;
    default:
      throw new TypeError(
        `Unsupported field: ${String(field satisfies never)}`
      );
  }
}

function preserveMessageUnknownFields(
  desc: DescMessage,
  target: AnyObject,
  source: AnyObject
): void {
  if (source["$unknown"]) {
    target["$unknown"] = structuredClone(source["$unknown"]);
  }

  for (const member of desc.members) {
    if (member.kind === "oneof") {
      const targetOneof = target[member.localName];
      const sourceOneof = source[member.localName];
      if (!(isPlainObject(targetOneof) && isPlainObject(sourceOneof))) {
        continue;
      }
      const targetCase = targetOneof["case"];
      if (
        typeof targetCase !== "string" ||
        targetCase !== sourceOneof["case"]
      ) {
        continue;
      }
      const activeField = member.fields.find(
        (field) => field.localName === targetCase
      );
      if (activeField) {
        preserveFieldUnknownFields(
          activeField,
          targetOneof["value"],
          sourceOneof["value"]
        );
      }
      continue;
    }

    preserveFieldUnknownFields(
      member,
      target[member.localName],
      source[member.localName]
    );
  }
}

/**
 * Returns a validated protobuf message with unknown wire fields restored from
 * the corresponding surviving nodes in its edit source. The target is cloned
 * when a source is present.
 */
export function preserveProtoMessageSource<Desc extends DescMessage>(
  desc: Desc,
  target: MessageShape<Desc>,
  source?: MessageShape<Desc>
): MessageShape<Desc> {
  if (!source) {
    return target;
  }
  const message = clone(desc, target);
  preserveMessageUnknownFields(desc, message, source);
  return message;
}

/**
 * Builds an edited message from form values while retaining unknown wire
 * fields from the parsed source message. Unknown fields are not part of the
 * form model, so reconstructing a message from values alone would drop them.
 */
export function formValuesToProto<Desc extends DescMessage>(
  desc: Desc,
  values: Record<string, unknown>,
  source?: MessageShape<Desc>,
  options: ProtoConversionOptions = {}
): MessageShape<Desc> {
  const message = create(desc, formValuesToProtoInit(desc, values, options));
  if (source) {
    preserveMessageUnknownFields(desc, message, source);
  }
  return message;
}

export function protoFormValuesToPayload<Desc extends DescMessage>(
  desc: Desc,
  values: Record<string, unknown>,
  options: ProtoConversionOptions = {}
): unknown {
  try {
    const init = formValuesToProtoInit(desc, values, options);
    const message = create(desc, init);
    // `alwaysEmitImplicit: true` forces every scalar / message field to
    // appear in the serialized JSON even when the form hasn't been
    // touched. Without it, an untouched form renders as `{}` in the
    // summary panel — so users have to start typing just to see the
    // request shape. Emitting defaults gives them the full schema
    // skeleton up front and reduces the interactions needed to
    // visualise what will actually be sent.
    return toJson(desc, message, { alwaysEmitImplicit: true }) as unknown;
  } catch {
    try {
      return formValuesToProtoInit(desc, values, options);
    } catch {
      return values;
    }
  }
}

export function protoPayloadToFormValues<Desc extends DescMessage>(
  desc: Desc,
  payload: unknown
): FormValues | undefined {
  try {
    const message = fromJson(desc, (payload ?? {}) as JsonValue);
    return protoToFormValues(desc, message);
  } catch {}
  return undefined;
}

function normalizeIssuePath(
  desc: DescMessage,
  issue: SchemaIssue,
  values: Record<string, unknown>
): (string | number)[] {
  if (!issue.path || issue.path.length === 0) {
    return [];
  }

  const normalizedPath: (string | number)[] = [];
  let currentDesc: DescMessage | undefined = desc;

  for (let index = 0; index < issue.path.length; index += 1) {
    const segment: StandardSchemaV1.PathSegment | PropertyKey | undefined =
      issue.path[index];
    const key =
      typeof segment === "object" && segment && "key" in segment
        ? segment.key
        : segment;

    if (typeof key === "number") {
      normalizedPath.push(key);
      continue;
    }

    if (!currentDesc || typeof key !== "string") {
      normalizedPath.push(String(key));
      continue;
    }

    const matchedField: DescField | undefined = currentDesc.field[key];
    const oneof = currentDesc.oneofs.find(
      (candidate) => candidate.localName === key
    );

    if (oneof) {
      normalizedPath.push(oneof.localName);
      currentDesc = undefined;
      continue;
    }

    if (!matchedField) {
      normalizedPath.push(key);
      currentDesc = undefined;
      continue;
    }

    normalizedPath.push(matchedField.localName);

    if (matchedField.fieldKind === "map") {
      const nextSegment = issue.path[index + 1];
      const mapKey =
        typeof nextSegment === "object" && nextSegment && "key" in nextSegment
          ? nextSegment.key
          : nextSegment;
      const mapEntries = Array.isArray(values[matchedField.localName])
        ? (values[matchedField.localName] as ProtoMapFormEntry[])
        : [];
      const mapIndex =
        typeof mapKey === "string"
          ? mapEntries.findIndex((entry) => entry.key === mapKey)
          : -1;

      if (
        mapIndex !== -1 &&
        issue.path.length > index + 2 &&
        matchedField.mapKind === "message"
      ) {
        normalizedPath.push(mapIndex, "value");
        currentDesc = matchedField.message;
        index += 1;
        continue;
      }

      // If the protovalidate key no longer matches a rendered map entry, keep the error on the
      // map field itself instead of targeting a stale array index in RHF state.
      return normalizedPath;
    }

    if (matchedField.fieldKind === "message") {
      if (
        isWrapperDesc(matchedField.message) ||
        PROTO_JSON_FALLBACK_TYPES.includes(matchedField.message.typeName)
      ) {
        return normalizedPath;
      }
      currentDesc = matchedField.message;
      continue;
    }

    if (
      matchedField.fieldKind === "list" &&
      matchedField.listKind === "message"
    ) {
      if (
        isWrapperDesc(matchedField.message) ||
        PROTO_JSON_FALLBACK_TYPES.includes(matchedField.message.typeName)
      ) {
        return normalizedPath;
      }
      // Guard against stale array indices: if the next segment is a numeric index,
      // verify the array still has that many entries. If not, anchor the error on
      // the list field itself (same fallback strategy as map fields).
      const nextSegment = issue.path[index + 1];
      const nextKey =
        typeof nextSegment === "object" && nextSegment && "key" in nextSegment
          ? nextSegment.key
          : nextSegment;
      if (typeof nextKey === "number") {
        const listEntries = values[matchedField.localName];
        if (!Array.isArray(listEntries) || nextKey >= listEntries.length) {
          return normalizedPath;
        }
      }
      currentDesc = matchedField.message;
      continue;
    }

    currentDesc = undefined;
  }

  return normalizedPath;
}

/** A Standard Schema issue whose path is already normalized to form paths. */
export interface NormalizedProtoIssue {
  message: string;
  path: (string | number)[];
}

export type NormalizedProtoValidationResult<Output> =
  | StandardSchemaV1.SuccessResult<Output>
  | { readonly issues: readonly NormalizedProtoIssue[] };

export interface ProtoValidationContext {
  /**
   * Restrict pathful issues to fields overlapping this mask. Message-level
   * issues remain visible because they cannot be attributed safely.
   */
  validationMask?: FieldMask | undefined;
}

const SIGNED_32_SCALARS = [
  ScalarType.INT32,
  ScalarType.SINT32,
  ScalarType.SFIXED32,
];
const UNSIGNED_32_SCALARS = [ScalarType.UINT32, ScalarType.FIXED32];
const SIGNED_64_SCALARS = [
  ScalarType.INT64,
  ScalarType.SINT64,
  ScalarType.SFIXED64,
];
const UNSIGNED_64_SCALARS = [ScalarType.UINT64, ScalarType.FIXED64];
const SIGNED_32_MIN = -2_147_483_648;
const SIGNED_32_MAX = 2_147_483_647;
const UNSIGNED_32_MAX = 4_294_967_295;
const SIGNED_64_MIN = -9_223_372_036_854_775_808n;
const SIGNED_64_MAX = 9_223_372_036_854_775_807n;
const UNSIGNED_64_MAX = 18_446_744_073_709_551_615n;

function getScalarConversionIssue(
  field: ScalarField,
  value: unknown
): string | undefined {
  if (value === undefined || value === null || value === "") {
    return;
  }
  if (SIGNED_32_SCALARS.includes(field.scalar)) {
    const numericValue = normalizeNumberValue(value);
    if (
      numericValue === undefined ||
      !Number.isInteger(numericValue) ||
      numericValue < SIGNED_32_MIN ||
      numericValue > SIGNED_32_MAX
    ) {
      return "Enter a signed 32-bit integer.";
    }
  }
  if (UNSIGNED_32_SCALARS.includes(field.scalar)) {
    const numericValue = normalizeNumberValue(value);
    if (
      numericValue === undefined ||
      !Number.isInteger(numericValue) ||
      numericValue < 0 ||
      numericValue > UNSIGNED_32_MAX
    ) {
      return "Enter an unsigned 32-bit integer.";
    }
  }
  if (SIGNED_64_SCALARS.includes(field.scalar)) {
    const bigintValue = normalizeBigIntValue(value);
    if (
      bigintValue === undefined ||
      bigintValue < SIGNED_64_MIN ||
      bigintValue > SIGNED_64_MAX
    ) {
      return "Enter a signed 64-bit integer.";
    }
  }
  if (UNSIGNED_64_SCALARS.includes(field.scalar)) {
    const bigintValue = normalizeBigIntValue(value);
    if (
      bigintValue === undefined ||
      bigintValue < 0n ||
      bigintValue > UNSIGNED_64_MAX
    ) {
      return "Enter an unsigned 64-bit integer.";
    }
  }
  return undefined;
}

function getMessageConversionIssue(
  field: MessageField,
  value: unknown
): string | undefined {
  if (value === undefined || value === null || value === "") {
    return;
  }
  if (field.message.typeName === TIMESTAMP_TYPE) {
    return typeof value === "string" && !Number.isNaN(new Date(value).getTime())
      ? undefined
      : "Enter a valid date and time.";
  }
  if (field.message.typeName === DURATION_TYPE) {
    if (typeof value !== "string") {
      return "Enter a valid duration.";
    }
    try {
      fromJsonString(DurationSchema, JSON.stringify(value));
      return;
    } catch {
      return "Enter a valid duration.";
    }
  }
  if (field.message.typeName !== ANY_TYPE || !isPlainObject(value)) {
    return;
  }
  const { valueBase64 } = value as ProtoAnyFormValue;
  if (valueBase64 === undefined || valueBase64 === "") {
    return;
  }
  try {
    base64Decode(valueBase64);
  } catch {
    return "Enter valid base64 data.";
  }
  return undefined;
}

function getMapConversionIssue(value: unknown): string | undefined {
  if (!Array.isArray(value)) {
    return;
  }
  const keys = value.flatMap((entry) => {
    if (!isPlainObject(entry)) {
      return [];
    }
    const key = entry["key"];
    return key === undefined || key === null || key === "" ? [] : [String(key)];
  });
  return new Set(keys).size === keys.length
    ? undefined
    : "Map keys must be unique.";
}

function getFormConversionIssues(
  desc: DescMessage,
  values: Record<string, unknown>
): NormalizedProtoIssue[] {
  return desc.members.flatMap((member) => {
    if (member.kind === "oneof") {
      return [];
    }
    let message: string | undefined;
    if (member.fieldKind === "scalar") {
      message = getScalarConversionIssue(member, values[member.localName]);
    } else if (member.fieldKind === "message") {
      message = getMessageConversionIssue(member, values[member.localName]);
    } else if (member.fieldKind === "map") {
      message = getMapConversionIssue(values[member.localName]);
    }
    return message ? [{ message, path: [member.localName] }] : [];
  });
}

function toFailureResult(error: unknown): {
  readonly issues: readonly NormalizedProtoIssue[];
} {
  return {
    issues: [
      {
        message:
          error instanceof Error
            ? error.message
            : "Failed to validate protobuf form values.",
        path: [],
      },
    ],
  };
}

function normalizeValidationResult<Desc extends DescMessage>(
  desc: Desc,
  values: Record<string, unknown>,
  validationResult: StandardSchemaV1.Result<MessageValidType<Desc>>,
  fallbackValue: MessageShape<Desc>,
  context: ProtoValidationContext
): NormalizedProtoValidationResult<MessageValidType<Desc>> {
  if (validationResult.issues) {
    const issues = filterValidationIssues(
      desc,
      validationResult.issues.map((issue) => ({
        message: issue.message,
        path: normalizeIssuePath(desc, issue, values),
      })),
      context.validationMask
    );
    if (issues.length === 0) {
      return { value: fallbackValue as MessageValidType<Desc> };
    }
    return {
      issues,
    };
  }

  return validationResult;
}

function filterValidationIssues(
  desc: DescMessage,
  issues: readonly NormalizedProtoIssue[],
  validationMask?: FieldMask
): readonly NormalizedProtoIssue[] {
  if (!validationMask || validationMask.paths.includes("*")) {
    return issues;
  }

  const formPaths = validationMask.paths.flatMap((path) => {
    const formPath = protoPathToFormPath(desc, path);
    return formPath ? [formPath] : [];
  });

  return issues.filter((issue) => {
    if (issue.path.length === 0) {
      return true;
    }
    const issuePath = issue.path.join(".");
    return formPaths.some(
      (formPath) =>
        issuePath === formPath ||
        issuePath.startsWith(`${formPath}.`) ||
        formPath.startsWith(`${issuePath}.`)
    );
  });
}

/**
 * Shared validation pipeline: form values → proto init → `create()` →
 * protovalidate Standard Schema → issues re-pathed to FORM paths
 * (camelCase keys, oneofs flattened, map keys resolved to entry indices).
 *
 * Both `createProtoFormSchema` and `ProtoProvider.validateSchema` (and the
 * registry's react-hook-form resolver) flow through this single function.
 */
export function validateFormValuesAgainstProtoSchema<Desc extends DescMessage>(
  desc: Desc,
  values: Record<string, unknown>,
  schema: StandardSchemaV1<MessageShape<Desc>, MessageValidType<Desc>>,
  options: ProtoConversionOptions = {},
  source?: MessageShape<Desc>,
  context: ProtoValidationContext = {}
):
  | NormalizedProtoValidationResult<MessageValidType<Desc>>
  | Promise<NormalizedProtoValidationResult<MessageValidType<Desc>>> {
  try {
    const conversionIssues = filterValidationIssues(
      desc,
      getFormConversionIssues(desc, values),
      context.validationMask
    );
    if (conversionIssues.length > 0) {
      return { issues: conversionIssues };
    }
    const message = formValuesToProto(desc, values, source, options);
    const validationResult = schema["~standard"].validate(message);

    if (validationResult instanceof Promise) {
      return validationResult
        .then((result) =>
          normalizeValidationResult(desc, values, result, message, context)
        )
        .catch((error: unknown) => toFailureResult(error));
    }

    return normalizeValidationResult(
      desc,
      values,
      validationResult,
      message,
      context
    );
  } catch (error) {
    return toFailureResult(error);
  }
}

function mapResultToSchemaValidation<Desc extends DescMessage>(
  result: NormalizedProtoValidationResult<MessageValidType<Desc>>
): SchemaValidation {
  if (result.issues) {
    return {
      errors: result.issues.map((issue) => ({
        message: issue.message,
        path: issue.path,
      })),
      success: false,
    };
  }

  return {
    data: result.value,
    success: true,
  };
}

function validateProtoValues<Desc extends DescMessage>(
  desc: Desc,
  values: Record<string, unknown>,
  schema: StandardSchemaV1<MessageShape<Desc>, MessageValidType<Desc>>,
  options: ProtoConversionOptions
): SchemaValidation | Promise<SchemaValidation> {
  const result = validateFormValuesAgainstProtoSchema(
    desc,
    values,
    schema,
    options
  );
  if (result instanceof Promise) {
    return result.then((resolved) =>
      mapResultToSchemaValidation<Desc>(resolved)
    );
  }
  return mapResultToSchemaValidation<Desc>(result);
}

export class ProtoProvider<Desc extends DescMessage = DescMessage>
  implements SchemaProvider<Record<string, unknown>>
{
  private readonly desc: Desc;
  private readonly options: ProtoFormOptions;
  private readonly parsedSchema: ParsedProtoSchema;
  private readonly standardSchema: StandardSchemaV1<
    MessageShape<Desc>,
    MessageValidType<Desc>
  >;

  constructor(desc: Desc, options: ProtoFormOptions = {}) {
    this.desc = desc;
    this.options = options;
    this.parsedSchema = parseProtoSchema(desc);
    this.standardSchema = createDescriptorAwareStandardSchema(desc, options);
  }

  parseSchema(): ParsedSchema {
    return this.parsedSchema;
  }

  validateSchema(values: Record<string, unknown>): SchemaValidation {
    const validationResult = validateProtoValues(
      this.desc,
      values,
      this.standardSchema,
      this.options
    );
    if (validationResult instanceof Promise) {
      return {
        errors: [
          {
            message:
              // Provider-based AutoForm consumers expect a synchronous result. Async protovalidate
              // flows should go through createProtoResolver(), which RHF can await.
              "ProtoProvider does not support async validation rules. Use createProtoResolver() for async protovalidate flows.",
            path: [],
          },
        ],
        success: false,
      };
    }
    return validationResult;
  }

  getDefaultValues(): Record<string, unknown> {
    return protoToFormValues(this.desc);
  }

  getMessageDescriptor(): Desc {
    return this.desc;
  }
}

export function isProtoProvider(value: unknown): value is ProtoProvider {
  return value instanceof ProtoProvider;
}
