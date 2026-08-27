import {
  createProtoFormSchema,
  parseProtoSchema,
  protoToFormValues,
  registerProtoAnnotations,
} from "@/lib/protobuf-provider";
import {
  FieldUiOptionsSchema,
  MessageUiOptionsSchema,
  OneofUiOptionsSchema,
  UiRuleSchema,
} from "./auto_form_ui_pb.js";

/**
 * Source documentation for protoform.v1.UiRule.
 */
export const UiRuleFormAnnotations = {} as const;
registerProtoAnnotations(UiRuleSchema, UiRuleFormAnnotations);

/**
 * Form binding for message protoform.v1.UiRule.
 */
export const UiRuleFormBinding = {
  annotations: UiRuleFormAnnotations,
  createFormSchema: (options?: Parameters<typeof createProtoFormSchema>[1]) =>
    createProtoFormSchema(UiRuleSchema, options),
  defaultValues: () => protoToFormValues(UiRuleSchema),
  descriptor: UiRuleSchema,
  parseSchema: () => parseProtoSchema(UiRuleSchema),
} as const;

/**
 * Source documentation for protoform.v1.MessageUiOptions.
 */
export const MessageUiOptionsFormAnnotations = {
  fields: {
    "protoform.v1.MessageUiOptions.title":
      "Root-level title shown above the AutoForm body.",
    "protoform.v1.MessageUiOptions.description":
      "One-line subtitle shown under `title`.",
  },
} as const;
registerProtoAnnotations(
  MessageUiOptionsSchema,
  MessageUiOptionsFormAnnotations
);

/**
 * Form binding for message protoform.v1.MessageUiOptions.
 */
export const MessageUiOptionsFormBinding = {
  annotations: MessageUiOptionsFormAnnotations,
  createFormSchema: (options?: Parameters<typeof createProtoFormSchema>[1]) =>
    createProtoFormSchema(MessageUiOptionsSchema, options),
  defaultValues: () => protoToFormValues(MessageUiOptionsSchema),
  descriptor: MessageUiOptionsSchema,
  parseSchema: () => parseProtoSchema(MessageUiOptionsSchema),
} as const;

/**
 * Source documentation for protoform.v1.FieldUiOptions.
 */
export const FieldUiOptionsFormAnnotations = {
  fields: {
    "protoform.v1.FieldUiOptions.help":
      "Detailed help text shown in the tooltip (hover the info icon).\n Use for examples, edge cases, and extended explanations.",
    "protoform.v1.FieldUiOptions.description":
      "Concise one-liner shown directly below the input field.\n Keep it short — most users will read this first.\n When omitted, the UI falls back to `help`.",
    "protoform.v1.FieldUiOptions.dataProvider":
      "Named data source for dropdown-style controls.",
    "protoform.v1.FieldUiOptions.dropzone":
      "When CONTROL_TYPE_JSON: enables a drag-and-drop zone that reads\n a .json file into the field value alongside the editor.",
    "protoform.v1.FieldUiOptions.docsUrl":
      'Link to the upstream source of truth for the values this field\n accepts. Rendered as a "Learn more" anchor next to the help text.',
  },
} as const;
registerProtoAnnotations(FieldUiOptionsSchema, FieldUiOptionsFormAnnotations);

/**
 * Form binding for message protoform.v1.FieldUiOptions.
 */
export const FieldUiOptionsFormBinding = {
  annotations: FieldUiOptionsFormAnnotations,
  createFormSchema: (options?: Parameters<typeof createProtoFormSchema>[1]) =>
    createProtoFormSchema(FieldUiOptionsSchema, options),
  defaultValues: () => protoToFormValues(FieldUiOptionsSchema),
  descriptor: FieldUiOptionsSchema,
  parseSchema: () => parseProtoSchema(FieldUiOptionsSchema),
} as const;

/**
 * Source documentation for protoform.v1.OneofUiOptions.
 */
export const OneofUiOptionsFormAnnotations = {
  fields: {
    "protoform.v1.OneofUiOptions.help":
      "Detailed help text shown in the tooltip.",
    "protoform.v1.OneofUiOptions.description":
      "Concise one-liner shown below the selector.",
  },
} as const;
registerProtoAnnotations(OneofUiOptionsSchema, OneofUiOptionsFormAnnotations);

/**
 * Form binding for message protoform.v1.OneofUiOptions.
 */
export const OneofUiOptionsFormBinding = {
  annotations: OneofUiOptionsFormAnnotations,
  createFormSchema: (options?: Parameters<typeof createProtoFormSchema>[1]) =>
    createProtoFormSchema(OneofUiOptionsSchema, options),
  defaultValues: () => protoToFormValues(OneofUiOptionsSchema),
  descriptor: OneofUiOptionsSchema,
  parseSchema: () => parseProtoSchema(OneofUiOptionsSchema),
} as const;
