export interface UiRule {
  expression?: string | undefined;
  id?: string | undefined;
  message?: string | undefined;
}

export interface OptionGroup {
  label?: string | undefined;
  options: [value: string, label: string][];
}

/** Values a field label or description may hold in the schema layer. The React layer widens this with ReactNode. */
export type Renderable = string | number | boolean | null | undefined;

/** HTML input attributes forwarded to the rendered control. */
export interface InputProps {
  [attribute: string]: string | number | boolean | undefined;
}

/**
 * Provider-private data attached to a field. Only code from the provider
 * that produced the schema may interpret the remaining properties; the
 * rendering engine must not reach into this.
 */
export interface ProviderCustomData {
  /** Discriminator naming the provider that produced this field (for example "proto"). */
  source?: string | undefined;
  [key: string]: unknown;
}

/** The value bag a form works over: field names to arbitrary user input. */
export interface FormValues {
  [field: string]: unknown;
}

/** How protobuf conversion treats empty entries in a repeated string field. */
export type EmptyRepeatedStringPolicy = "discard" | "preserve";

/**
 * Render-driving metadata, independent of any schema system.
 * Everything here answers "how should this field look and behave",
 * never "how is this field validated" (validation flows through
 * Standard Schema).
 */
export interface FieldRenderHints {
  /** Explicit simple/advanced classification override. */
  advanced?: boolean | undefined;
  /** Restrict JSON/field-mask style inputs to these paths. */
  allowedPaths?: string[] | undefined;
  /** Control-type override; a key into the consumer's control registry. */
  control?: string | undefined;
  /** Named data source id for dropdown-style controls. */
  dataProvider?: string | undefined;
  /** The schema marks this field as deprecated. */
  deprecated?: boolean | undefined;
  /** Concise one-liner shown below the input. */
  description?: string | undefined;
  disabledWhen?: UiRule[] | undefined;
  docsUrl?: string | undefined;
  /** Enable file drag-and-drop into the field value. */
  dropzone?: boolean | undefined;
  /** Keep blank repeated-string rows instead of discarding them during conversion. */
  emptyRepeatedStringPolicy?: EmptyRepeatedStringPolicy | undefined;
  example?: string | undefined;
  /** Detailed help text (tooltip). */
  help?: string | undefined;
  /** HTML input `type` hint (for example `email`, `url`, `number`). */
  inputType?: string | undefined;
  /** JSON-ish payload rendering mode for structured values. */
  jsonKind?: "struct" | "value" | "listValue" | "any" | undefined;
  maxItems?: number | undefined;
  maxPairs?: number | undefined;
  minItems?: number | undefined;
  minPairs?: number | undefined;
  optionGroups?: OptionGroup[] | undefined;
  optionLabels?: Record<string, string> | undefined;
  placeholder?: string | undefined;
  secretScope?: string | undefined;
  sensitive?: boolean | undefined;
  /** Stepper step id this field belongs to. */
  step?: string | undefined;
  /** Label used in review/summary contexts instead of the field label. */
  summaryLabel?: string | undefined;
  /** Tri-state controls: the unset state is meaningful and selectable. */
  supportsUnset?: boolean | undefined;
  visibleWhen?: UiRule[] | undefined;
}

export interface FieldConfig<
  FieldTypes = string,
  CustomData extends ProviderCustomData = ProviderCustomData,
> {
  customData?: CustomData | undefined;
  description?: Renderable;
  /** Keep blank repeated-string rows instead of discarding them during conversion. */
  emptyRepeatedStringPolicy?: EmptyRepeatedStringPolicy | undefined;
  fieldType?: FieldTypes | undefined;
  inputProps?: InputProps | undefined;
  label?: Renderable;
  order?: number | undefined;
}

export interface ParsedField<FieldTypes = string> {
  default?: unknown;
  description?: Renderable;
  fieldConfig?: FieldConfig<FieldTypes> | undefined;
  hints?: FieldRenderHints | undefined;
  key: string;
  options?: [value: string, label: string][] | undefined;
  required: boolean;
  schema?: ParsedField<FieldTypes>[] | undefined;
  type: string;
}

export interface ParsedSchema<FieldTypes = string> {
  fields: ParsedField<FieldTypes>[];
}

export interface SchemaValidationError {
  message: string;
  path: (string | number)[];
}

export type SchemaValidation =
  | { success: true; data: unknown }
  | { success: false; errors: SchemaValidationError[] };

export interface SchemaValidationContext {
  /** Aborted when a newer validation supersedes this run or its form unmounts. */
  signal: AbortSignal;
}

export interface SchemaProvider<Values extends FormValues = FormValues> {
  getDefaultValues: () => FormValues;
  parseSchema: () => ParsedSchema;
  validateSchema: (
    values: Values,
    context?: SchemaValidationContext
  ) => SchemaValidation | Promise<SchemaValidation>;
}

/** Read a field's render hints; single accessor so call sites never reach into provider customData. */
export function getFieldHints<FieldTypes>(
  field: ParsedField<FieldTypes>
): FieldRenderHints | undefined {
  return field.hints;
}
