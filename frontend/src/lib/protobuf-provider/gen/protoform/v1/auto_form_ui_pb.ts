import type { Message } from "@bufbuild/protobuf";
import type {
  GenEnum,
  GenExtension,
  GenFile,
  GenMessage,
} from "@bufbuild/protobuf/codegenv2";
import {
  enumDesc,
  extDesc,
  fileDesc,
  messageDesc,
} from "@bufbuild/protobuf/codegenv2";
import type {
  FieldOptions,
  MessageOptions,
  OneofOptions,
} from "@bufbuild/protobuf/wkt";
import { file_google_protobuf_descriptor } from "@bufbuild/protobuf/wkt";

/**
 * Describes the file protoform/v1/auto_form_ui.proto.
 */
export const file_protoform_v1_auto_form_ui: GenFile =
  /*@__PURE__*/
  fileDesc(
    "Ch9wcm90b2Zvcm0vdjEvYXV0b19mb3JtX3VpLnByb3RvEgxwcm90b2Zvcm0udjEiOQoGVWlSdWxlEgoKAmlkGAEgASgJEhIKCmV4cHJlc3Npb24YAiABKAkSDwoHbWVzc2FnZRgDIAEoCSJMChBNZXNzYWdlVWlPcHRpb25zEhQKDHNlY3JldF9zY29wZRgCIAEoCRINCgV0aXRsZRgDIAEoCRITCgtkZXNjcmlwdGlvbhgEIAEoCSKnAwoORmllbGRVaU9wdGlvbnMSRAoHY29udHJvbBgBIAEoDjIZLnByb3RvZm9ybS52MS5Db250cm9sVHlwZToYQ09OVFJPTF9UWVBFX1VOU1BFQ0lGSUVEEhMKC3BsYWNlaG9sZGVyGAIgASgJEg8KB2V4YW1wbGUYAyABKAkSDAoEaGVscBgEIAEoCRIqCgx2aXNpYmxlX3doZW4YBSADKAsyFC5wcm90b2Zvcm0udjEuVWlSdWxlEisKDWRpc2FibGVkX3doZW4YBiADKAsyFC5wcm90b2Zvcm0udjEuVWlSdWxlEgwKBHN0ZXAYByABKAkSFQoNc3VtbWFyeV9sYWJlbBgIIAEoCRIRCglzZW5zaXRpdmUYCSABKAgSEwoLZGVzY3JpcHRpb24YCiABKAkSUQoNZGF0YV9wcm92aWRlchgLIAEoDjIcLnByb3RvZm9ybS52MS5EYXRhUHJvdmlkZXJJZDocREFUQV9QUk9WSURFUl9JRF9VTlNQRUNJRklFRBIQCghkcm9wem9uZRgMIAEoCBIQCghkb2NzX3VybBgNIAEoCSKxAQoOT25lb2ZVaU9wdGlvbnMSDAoEaGVscBgBIAEoCRIqCgx2aXNpYmxlX3doZW4YAiADKAsyFC5wcm90b2Zvcm0udjEuVWlSdWxlEisKDWRpc2FibGVkX3doZW4YAyADKAsyFC5wcm90b2Zvcm0udjEuVWlSdWxlEgwKBHN0ZXAYBCABKAkSFQoNc3VtbWFyeV9sYWJlbBgFIAEoCRITCgtkZXNjcmlwdGlvbhgGIAEoCSr+AwoLQ29udHJvbFR5cGUSHAoYQ09OVFJPTF9UWVBFX1VOU1BFQ0lGSUVEEAASFQoRQ09OVFJPTF9UWVBFX1RFWFQQARIZChVDT05UUk9MX1RZUEVfVEVYVEFSRUEQAhIZChVDT05UUk9MX1RZUEVfUEFTU1dPUkQQAxIWChJDT05UUk9MX1RZUEVfRU1BSUwQBBIUChBDT05UUk9MX1RZUEVfVVJMEAUSGQoVQ09OVFJPTF9UWVBFX0NVUlJFTkNZEAYSGQoVQ09OVFJPTF9UWVBFX0NIRUNLQk9YEAcSFwoTQ09OVFJPTF9UWVBFX1NXSVRDSBAIEhcKE0NPTlRST0xfVFlQRV9UT0dHTEUQCRIcChhDT05UUk9MX1RZUEVfUkFESU9fR1JPVVAQChIXChNDT05UUk9MX1RZUEVfU0VMRUNUEAsSGQoVQ09OVFJPTF9UWVBFX0NPTUJPQk9YEAwSHQoZQ09OVFJPTF9UWVBFX01VTFRJX1NFTEVDVBANEhoKFkNPTlRST0xfVFlQRV9LRVlfVkFMVUUQDhIVChFDT05UUk9MX1RZUEVfSlNPThAPEhUKEUNPTlRST0xfVFlQRV9EQVRFEBASGgoWQ09OVFJPTF9UWVBFX1RJTUVTVEFNUBAREhcKE0NPTlRST0xfVFlQRV9TTElERVIQEyqoBQoORGF0YVByb3ZpZGVySWQSIAocREFUQV9QUk9WSURFUl9JRF9VTlNQRUNJRklFRBAAEiAKHERBVEFfUFJPVklERVJfSURfQVdTX1JFR0lPTlMQARIgChxEQVRBX1BST1ZJREVSX0lEX0dDUF9SRUdJT05TEAISIgoeREFUQV9QUk9WSURFUl9JRF9BWlVSRV9SRUdJT05TEAMSLAooREFUQV9QUk9WSURFUl9JRF9DT0hFUkVfRU1CRURESU5HX01PREVMUxAEEiwKKERBVEFfUFJPVklERVJfSURfT1BFTkFJX0VNQkVERElOR19NT0RFTFMQBRImCiJEQVRBX1BST1ZJREVSX0lEX09QRU5BSV9UVFNfTU9ERUxTEAYSIQodREFUQV9QUk9WSURFUl9JRF9IVFRQX01FVEhPRFMQBxIkCiBEQVRBX1BST1ZJREVSX0lEX1NBU0xfTUVDSEFOSVNNUxAIEikKJURBVEFfUFJPVklERVJfSURfQ09IRVJFX1JFUkFOS19NT0RFTFMQCRIoCiREQVRBX1BST1ZJREVSX0lEX09QRU5BSV9JTUFHRV9NT0RFTFMQChIpCiVEQVRBX1BST1ZJREVSX0lEX09QRU5BSV9TUEVFQ0hfTU9ERUxTEAsSLQopREFUQV9QUk9WSURFUl9JRF9CRURST0NLX0VNQkVERElOR19NT0RFTFMQDBItCilEQVRBX1BST1ZJREVSX0lEX0tBRktBX0NPTVBSRVNTSU9OX0NPREVDUxANEi0KKURBVEFfUFJPVklERVJfSURfT1BFTkFJX1RUU19BVURJT19GT1JNQVRTEA4SIAocREFUQV9QUk9WSURFUl9JRF9TUUxfRFJJVkVSUxASIgQIDxAPIgQIEBAQIgQIERAROmAKCm1lc3NhZ2VfdWkSHy5nb29nbGUucHJvdG9idWYuTWVzc2FnZU9wdGlvbnMYuI4DIAEoCzIeLnByb3RvZm9ybS52MS5NZXNzYWdlVWlPcHRpb25zUgltZXNzYWdlVWk6WAoIZmllbGRfdWkSHS5nb29nbGUucHJvdG9idWYuRmllbGRPcHRpb25zGLmOAyABKAsyHC5wcm90b2Zvcm0udjEuRmllbGRVaU9wdGlvbnNSB2ZpZWxkVWk6WAoIb25lb2ZfdWkSHS5nb29nbGUucHJvdG9idWYuT25lb2ZPcHRpb25zGLqOAyABKAsyHC5wcm90b2Zvcm0udjEuT25lb2ZVaU9wdGlvbnNSB29uZW9mVWlCTVpLZ2l0aHViLmNvbS9tYWxpbnNraWJlbmlhbWluL3Byb3RvZm9ybS9wcm90by9nZW4vZ28vcHJvdG9mb3JtL3YxO3Byb3RvZm9ybXYx",
    [file_google_protobuf_descriptor]
  );

/**
 * @generated from message protoform.v1.UiRule
 */
export type UiRule = Message<"protoform.v1.UiRule"> & {
  /**
   * @generated from field: optional string id = 1;
   */
  id: string;

  /**
   * @generated from field: optional string expression = 2;
   */
  expression: string;

  /**
   * @generated from field: optional string message = 3;
   */
  message: string;
};

/**
 * Describes the message protoform.v1.UiRule.
 * Use `create(UiRuleSchema)` to create a new message.
 */
export const UiRuleSchema: GenMessage<UiRule> =
  /*@__PURE__*/
  messageDesc(file_protoform_v1_auto_form_ui, 0);

/**
 * @generated from message protoform.v1.MessageUiOptions
 */
export type MessageUiOptions = Message<"protoform.v1.MessageUiOptions"> & {
  /**
   * @generated from field: optional string secret_scope = 2;
   */
  secretScope: string;

  /**
   * Root-level title shown above the AutoForm body.
   *
   * @generated from field: optional string title = 3;
   */
  title: string;

  /**
   * One-line subtitle shown under `title`.
   *
   * @generated from field: optional string description = 4;
   */
  description: string;
};

/**
 * Describes the message protoform.v1.MessageUiOptions.
 * Use `create(MessageUiOptionsSchema)` to create a new message.
 */
export const MessageUiOptionsSchema: GenMessage<MessageUiOptions> =
  /*@__PURE__*/
  messageDesc(file_protoform_v1_auto_form_ui, 1);

/**
 * @generated from message protoform.v1.FieldUiOptions
 */
export type FieldUiOptions = Message<"protoform.v1.FieldUiOptions"> & {
  /**
   * @generated from field: optional protoform.v1.ControlType control = 1 [default = CONTROL_TYPE_UNSPECIFIED];
   */
  control: ControlType;

  /**
   * @generated from field: optional string placeholder = 2;
   */
  placeholder: string;

  /**
   * @generated from field: optional string example = 3;
   */
  example: string;

  /**
   * Detailed help text shown in the tooltip (hover the info icon).
   * Use for examples, edge cases, and extended explanations.
   *
   * @generated from field: optional string help = 4;
   */
  help: string;

  /**
   * @generated from field: repeated protoform.v1.UiRule visible_when = 5;
   */
  visibleWhen: UiRule[];

  /**
   * @generated from field: repeated protoform.v1.UiRule disabled_when = 6;
   */
  disabledWhen: UiRule[];

  /**
   * @generated from field: optional string step = 7;
   */
  step: string;

  /**
   * @generated from field: optional string summary_label = 8;
   */
  summaryLabel: string;

  /**
   * @generated from field: optional bool sensitive = 9;
   */
  sensitive: boolean;

  /**
   * Concise one-liner shown directly below the input field.
   * Keep it short — most users will read this first.
   * When omitted, the UI falls back to `help`.
   *
   * @generated from field: optional string description = 10;
   */
  description: string;

  /**
   * Named data source for dropdown-style controls.
   *
   * @generated from field: optional protoform.v1.DataProviderId data_provider = 11 [default = DATA_PROVIDER_ID_UNSPECIFIED];
   */
  dataProvider: DataProviderId;

  /**
   * When CONTROL_TYPE_JSON: enables a drag-and-drop zone that reads
   * a .json file into the field value alongside the editor.
   *
   * @generated from field: optional bool dropzone = 12;
   */
  dropzone: boolean;

  /**
   * Link to the upstream source of truth for the values this field
   * accepts. Rendered as a "Learn more" anchor next to the help text.
   *
   * @generated from field: optional string docs_url = 13;
   */
  docsUrl: string;
};

/**
 * Describes the message protoform.v1.FieldUiOptions.
 * Use `create(FieldUiOptionsSchema)` to create a new message.
 */
export const FieldUiOptionsSchema: GenMessage<FieldUiOptions> =
  /*@__PURE__*/
  messageDesc(file_protoform_v1_auto_form_ui, 2);

/**
 * @generated from message protoform.v1.OneofUiOptions
 */
export type OneofUiOptions = Message<"protoform.v1.OneofUiOptions"> & {
  /**
   * Detailed help text shown in the tooltip.
   *
   * @generated from field: optional string help = 1;
   */
  help: string;

  /**
   * @generated from field: repeated protoform.v1.UiRule visible_when = 2;
   */
  visibleWhen: UiRule[];

  /**
   * @generated from field: repeated protoform.v1.UiRule disabled_when = 3;
   */
  disabledWhen: UiRule[];

  /**
   * @generated from field: optional string step = 4;
   */
  step: string;

  /**
   * @generated from field: optional string summary_label = 5;
   */
  summaryLabel: string;

  /**
   * Concise one-liner shown below the selector.
   *
   * @generated from field: optional string description = 6;
   */
  description: string;
};

/**
 * Describes the message protoform.v1.OneofUiOptions.
 * Use `create(OneofUiOptionsSchema)` to create a new message.
 */
export const OneofUiOptionsSchema: GenMessage<OneofUiOptions> =
  /*@__PURE__*/
  messageDesc(file_protoform_v1_auto_form_ui, 3);

/**
 * @generated from enum protoform.v1.ControlType
 */
export enum ControlType {
  /**
   * @generated from enum value: CONTROL_TYPE_UNSPECIFIED = 0;
   */
  UNSPECIFIED = 0,

  /**
   * @generated from enum value: CONTROL_TYPE_TEXT = 1;
   */
  TEXT = 1,

  /**
   * @generated from enum value: CONTROL_TYPE_TEXTAREA = 2;
   */
  TEXTAREA = 2,

  /**
   * @generated from enum value: CONTROL_TYPE_PASSWORD = 3;
   */
  PASSWORD = 3,

  /**
   * @generated from enum value: CONTROL_TYPE_EMAIL = 4;
   */
  EMAIL = 4,

  /**
   * @generated from enum value: CONTROL_TYPE_URL = 5;
   */
  URL = 5,

  /**
   * @generated from enum value: CONTROL_TYPE_CURRENCY = 6;
   */
  CURRENCY = 6,

  /**
   * @generated from enum value: CONTROL_TYPE_CHECKBOX = 7;
   */
  CHECKBOX = 7,

  /**
   * @generated from enum value: CONTROL_TYPE_SWITCH = 8;
   */
  SWITCH = 8,

  /**
   * @generated from enum value: CONTROL_TYPE_TOGGLE = 9;
   */
  TOGGLE = 9,

  /**
   * @generated from enum value: CONTROL_TYPE_RADIO_GROUP = 10;
   */
  RADIO_GROUP = 10,

  /**
   * @generated from enum value: CONTROL_TYPE_SELECT = 11;
   */
  SELECT = 11,

  /**
   * @generated from enum value: CONTROL_TYPE_COMBOBOX = 12;
   */
  COMBOBOX = 12,

  /**
   * @generated from enum value: CONTROL_TYPE_MULTI_SELECT = 13;
   */
  MULTI_SELECT = 13,

  /**
   * @generated from enum value: CONTROL_TYPE_KEY_VALUE = 14;
   */
  KEY_VALUE = 14,

  /**
   * @generated from enum value: CONTROL_TYPE_JSON = 15;
   */
  JSON = 15,

  /**
   * @generated from enum value: CONTROL_TYPE_DATE = 16;
   */
  DATE = 16,

  /**
   * @generated from enum value: CONTROL_TYPE_TIMESTAMP = 17;
   */
  TIMESTAMP = 17,

  /**
   * @generated from enum value: CONTROL_TYPE_SLIDER = 19;
   */
  SLIDER = 19,
}

/**
 * Describes the enum protoform.v1.ControlType.
 */
export const ControlTypeSchema: GenEnum<ControlType> =
  /*@__PURE__*/
  enumDesc(file_protoform_v1_auto_form_ui, 0);

/**
 * @generated from enum protoform.v1.DataProviderId
 */
export enum DataProviderId {
  /**
   * @generated from enum value: DATA_PROVIDER_ID_UNSPECIFIED = 0;
   */
  UNSPECIFIED = 0,

  /**
   * @generated from enum value: DATA_PROVIDER_ID_AWS_REGIONS = 1;
   */
  AWS_REGIONS = 1,

  /**
   * @generated from enum value: DATA_PROVIDER_ID_GCP_REGIONS = 2;
   */
  GCP_REGIONS = 2,

  /**
   * @generated from enum value: DATA_PROVIDER_ID_AZURE_REGIONS = 3;
   */
  AZURE_REGIONS = 3,

  /**
   * @generated from enum value: DATA_PROVIDER_ID_COHERE_EMBEDDING_MODELS = 4;
   */
  COHERE_EMBEDDING_MODELS = 4,

  /**
   * @generated from enum value: DATA_PROVIDER_ID_OPENAI_EMBEDDING_MODELS = 5;
   */
  OPENAI_EMBEDDING_MODELS = 5,

  /**
   * @generated from enum value: DATA_PROVIDER_ID_OPENAI_TTS_MODELS = 6;
   */
  OPENAI_TTS_MODELS = 6,

  /**
   * @generated from enum value: DATA_PROVIDER_ID_HTTP_METHODS = 7;
   */
  HTTP_METHODS = 7,

  /**
   * @generated from enum value: DATA_PROVIDER_ID_SASL_MECHANISMS = 8;
   */
  SASL_MECHANISMS = 8,

  /**
   * @generated from enum value: DATA_PROVIDER_ID_COHERE_RERANK_MODELS = 9;
   */
  COHERE_RERANK_MODELS = 9,

  /**
   * @generated from enum value: DATA_PROVIDER_ID_OPENAI_IMAGE_MODELS = 10;
   */
  OPENAI_IMAGE_MODELS = 10,

  /**
   * @generated from enum value: DATA_PROVIDER_ID_OPENAI_SPEECH_MODELS = 11;
   */
  OPENAI_SPEECH_MODELS = 11,

  /**
   * @generated from enum value: DATA_PROVIDER_ID_BEDROCK_EMBEDDING_MODELS = 12;
   */
  BEDROCK_EMBEDDING_MODELS = 12,

  /**
   * @generated from enum value: DATA_PROVIDER_ID_KAFKA_COMPRESSION_CODECS = 13;
   */
  KAFKA_COMPRESSION_CODECS = 13,

  /**
   * @generated from enum value: DATA_PROVIDER_ID_OPENAI_TTS_AUDIO_FORMATS = 14;
   */
  OPENAI_TTS_AUDIO_FORMATS = 14,

  /**
   * @generated from enum value: DATA_PROVIDER_ID_SQL_DRIVERS = 18;
   */
  SQL_DRIVERS = 18,
}

/**
 * Describes the enum protoform.v1.DataProviderId.
 */
export const DataProviderIdSchema: GenEnum<DataProviderId> =
  /*@__PURE__*/
  enumDesc(file_protoform_v1_auto_form_ui, 1);

/**
 * @generated from extension: optional protoform.v1.MessageUiOptions message_ui = 51000;
 */
export const message_ui: GenExtension<MessageOptions, MessageUiOptions> =
  /*@__PURE__*/
  extDesc(file_protoform_v1_auto_form_ui, 0);

/**
 * @generated from extension: optional protoform.v1.FieldUiOptions field_ui = 51001;
 */
export const field_ui: GenExtension<FieldOptions, FieldUiOptions> =
  /*@__PURE__*/
  extDesc(file_protoform_v1_auto_form_ui, 1);

/**
 * @generated from extension: optional protoform.v1.OneofUiOptions oneof_ui = 51002;
 */
export const oneof_ui: GenExtension<OneofOptions, OneofUiOptions> =
  /*@__PURE__*/
  extDesc(file_protoform_v1_auto_form_ui, 2);
