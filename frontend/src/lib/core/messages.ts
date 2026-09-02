export type ProtoformMessageParams = Readonly<Record<string, number | string>>;

export type ProtoformMessageCode =
  | "auto_form.add_item"
  | "auto_form.back"
  | "auto_form.checking"
  | "auto_form.continue"
  | "auto_form.form_progress"
  | "auto_form.load_more"
  | "auto_form.multiselect.placeholder"
  | "auto_form.remove_item"
  | "auto_form.render_failed"
  | "auto_form.select.empty"
  | "auto_form.select.load_error"
  | "auto_form.select.loading"
  | "auto_form.select.not_set"
  | "auto_form.select.placeholder"
  | "auto_form.select.stale"
  | "auto_form.step_complete"
  | "auto_form.step_current"
  | "auto_form.step_progress"
  | "auto_form.step_upcoming"
  | "auto_form.submit"
  | "auto_form.submitting"
  | "auto_form.validation_failed"
  | "validation.greater_than"
  | "validation.greater_than_or_equal"
  | "validation.less_than"
  | "validation.less_than_or_equal"
  | "validation.max_items"
  | "validation.max_length"
  | "validation.min_items"
  | "validation.min_length"
  | "validation.oneof_required"
  | "validation.pattern"
  | "validation.required"
  | "validation.server_field";

export type ProtoformMessageFormatter = (
  code: ProtoformMessageCode,
  params: ProtoformMessageParams,
  fallback: string
) => string;

export function formatProtoformMessage(
  formatter: ProtoformMessageFormatter | undefined,
  code: ProtoformMessageCode,
  params: ProtoformMessageParams,
  fallback: string
): string {
  return formatter?.(code, params, fallback) ?? fallback;
}
