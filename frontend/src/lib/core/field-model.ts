export interface UiRule {
  expression?: string | undefined;
  id?: string | undefined;
  message?: string | undefined;
}

export interface OptionGroup {
  label?: string | undefined;
  options: [value: string, label: string][];
}

export type Renderable = string | number | boolean | null | undefined;

export interface InputProps {
  [attribute: string]: string | number | boolean | undefined;
}

export interface ProviderCustomData {
  source?: string | undefined;
  [key: string]: unknown;
}

export interface FormValues {
  [field: string]: unknown;
}

export type EmptyRepeatedStringPolicy = "discard" | "preserve";

export interface FieldRenderHints {
  advanced?: boolean | undefined;
  allowedPaths?: string[] | undefined;
  control?: string | undefined;
  dataProvider?: string | undefined;
  deprecated?: boolean | undefined;
  description?: string | undefined;
  disabledWhen?: UiRule[] | undefined;
  docsUrl?: string | undefined;
  dropzone?: boolean | undefined;
  emptyRepeatedStringPolicy?: EmptyRepeatedStringPolicy | undefined;
  example?: string | undefined;
  help?: string | undefined;
  inputType?: string | undefined;
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
  step?: string | undefined;
  summaryLabel?: string | undefined;
  supportsUnset?: boolean | undefined;
  visibleWhen?: UiRule[] | undefined;
}

export interface FieldConfig<FieldTypes = string, CustomData extends ProviderCustomData = ProviderCustomData> {
  customData?: CustomData | undefined;
  description?: Renderable;
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

export type SchemaValidation = { success: true; data: unknown } | { success: false; errors: SchemaValidationError[] };

export interface SchemaValidationContext {
  signal: AbortSignal;
}

export interface SchemaProvider<Values extends FormValues = FormValues> {
  getDefaultValues: () => FormValues;
  parseSchema: () => ParsedSchema;
  validateSchema: (values: Values, context?: SchemaValidationContext) => SchemaValidation | Promise<SchemaValidation>;
}

export function getFieldHints<FieldTypes>(field: ParsedField<FieldTypes>): FieldRenderHints | undefined {
  return field.hints;
}
