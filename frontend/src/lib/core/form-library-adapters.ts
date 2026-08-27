import type { StandardSchemaV1 } from "@standard-schema/spec";

export type FormValidationErrorValue =
  | FormValidationErrors
  | FormValidationErrorValue[]
  | string
  | undefined;

/** Nested error shape consumed by Formik and Final Form. */
export interface FormValidationErrors {
  [key: string]: FormValidationErrorValue;
  [key: number]: FormValidationErrorValue;
  [key: symbol]: FormValidationErrorValue;
}

/** Configure Standard Schema validation and form-library error mapping. */
export interface FormValidatorOptions extends StandardSchemaV1.Options {
  /** Override the library-specific key used for issues without a field path. */
  rootErrorKey?: PropertyKey;
}

export type FormValidator<Input> = (
  values: Input
) => FormValidationErrors | Promise<FormValidationErrors>;

type ErrorContainer = FormValidationErrors | FormValidationErrorValue[];

function isPromiseLike<T>(value: unknown): value is PromiseLike<T> {
  return (
    (typeof value === "object" || typeof value === "function") &&
    value !== null &&
    typeof Reflect.get(value, "then") === "function"
  );
}

function isErrorContainer(value: unknown): value is ErrorContainer {
  return typeof value === "object" && value !== null;
}

function readOwn(container: ErrorContainer, key: PropertyKey): unknown {
  return Object.hasOwn(container, key)
    ? Reflect.get(container, key)
    : undefined;
}

function writeOwn(
  container: ErrorContainer,
  key: PropertyKey,
  value: FormValidationErrorValue
) {
  Object.defineProperty(container, key, {
    configurable: true,
    enumerable: true,
    value,
    writable: true,
  });
}

function appendMessage(
  container: ErrorContainer,
  key: PropertyKey,
  message: string
) {
  const current = readOwn(container, key);
  if (typeof current === "string") {
    const messages = current.split("\n");
    writeOwn(
      container,
      key,
      messages.includes(message) ? current : `${current}\n${message}`
    );
    return;
  }
  if (isErrorContainer(current)) {
    appendMessage(current, "_error", message);
    return;
  }
  writeOwn(container, key, message);
}

function getPathKey(
  segment: PropertyKey | StandardSchemaV1.PathSegment
): PropertyKey {
  return typeof segment === "object" ? segment.key : segment;
}

function createContainer(nextKey: PropertyKey): ErrorContainer {
  return typeof nextKey === "number" ? [] : {};
}

function addIssue(
  errors: FormValidationErrors,
  issue: StandardSchemaV1.Issue,
  rootErrorKey: PropertyKey
) {
  const path = issue.path?.map(getPathKey) ?? [];
  if (path.length === 0) {
    appendMessage(errors, rootErrorKey, issue.message);
    return;
  }

  let container: ErrorContainer = errors;
  for (let index = 0; index < path.length; index += 1) {
    const key = path[index];
    if (key === undefined) {
      return;
    }
    if (index === path.length - 1) {
      appendMessage(container, key, issue.message);
      return;
    }

    const nextKey = path[index + 1];
    if (nextKey === undefined) {
      return;
    }
    const current = readOwn(container, key);
    if (isErrorContainer(current)) {
      container = current;
      continue;
    }

    const next = createContainer(nextKey);
    if (typeof current === "string") {
      appendMessage(next, "_error", current);
    }
    writeOwn(container, key, next);
    container = next;
  }
}

/** Convert every Standard Schema issue into a nested, prototype-safe form error tree. */
export function standardSchemaIssuesToFormErrors(
  issues: readonly StandardSchemaV1.Issue[],
  options?: FormValidatorOptions
): FormValidationErrors {
  const errors: FormValidationErrors = {};
  const rootErrorKey = options?.rootErrorKey ?? "_error";
  for (const issue of issues) {
    addIssue(errors, issue, rootErrorKey);
  }
  return errors;
}

function resultToErrors<Output>(
  result: StandardSchemaV1.Result<Output>,
  options: FormValidatorOptions | undefined
): FormValidationErrors {
  return result.issues
    ? standardSchemaIssuesToFormErrors(result.issues, options)
    : {};
}

function getStandardSchemaOptions(
  options: FormValidatorOptions | undefined
): StandardSchemaV1.Options | undefined {
  return options?.libraryOptions === undefined
    ? undefined
    : { libraryOptions: options.libraryOptions };
}

function createValidator<Input, Output>(
  schema: StandardSchemaV1<Input, Output>,
  options: FormValidatorOptions | undefined
): FormValidator<Input> {
  return (values) => {
    const result = schema["~standard"].validate(
      values,
      getStandardSchemaOptions(options)
    );
    return isPromiseLike<StandardSchemaV1.Result<Output>>(result)
      ? Promise.resolve(result).then((resolved) =>
          resultToErrors(resolved, options)
        )
      : resultToErrors(result, options);
  };
}

/** Create Formik form-level validation with `_form` as the default root error key. */
export function createFormikValidator<Input, Output>(
  schema: StandardSchemaV1<Input, Output>,
  options?: FormValidatorOptions
): FormValidator<Input> {
  return createValidator(schema, {
    ...options,
    rootErrorKey: options?.rootErrorKey ?? "_form",
  });
}

/** Create Final Form whole-record validation. Pass Final Form's `FORM_ERROR` as `rootErrorKey`. */
export function createFinalFormValidator<Input, Output>(
  schema: StandardSchemaV1<Input, Output>,
  options?: FormValidatorOptions
): FormValidator<Input> {
  return createValidator(schema, options);
}
