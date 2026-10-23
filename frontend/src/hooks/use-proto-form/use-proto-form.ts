import {
  create,
  type DescMessage,
  isMessage,
  type MessageInitShape,
  type MessageShape,
} from "@bufbuild/protobuf";
import type { FieldMask } from "@bufbuild/protobuf/wkt";
import { ConnectError } from "@connectrpc/connect";
import { useEffect, useRef, useState } from "react";
import {
  type DefaultValues,
  type FieldPath,
  get as getFormValue,
  type UseFormProps,
  type UseFormReturn,
  useForm,
} from "react-hook-form";
import { isNonEmptyString, isRecord } from "@/lib/value-guards";
import { createUpdateMask as createDirtyUpdateMask } from "../../lib/protobuf-provider/field-mask.js";
import type { ProtoFormShape } from "../../lib/protobuf-provider/form-values.js";
import {
  type ConnectErrorContext,
  extractConnectErrorContext,
  extractFieldViolations,
} from "../../lib/protobuf-provider/format-error.js";
import {
  formValuesToProto,
  type ProtoConversionOptions,
  type ProtoFormOptions,
  protoToFormValues,
} from "../../lib/protobuf-provider/hook-runtime.js";
import { humanizeServerFieldError } from "../../lib/protobuf-provider/humanize-validation-error.js";
import {
  type FormErrorMessage,
  formErrorTarget,
} from "../../lib/protobuf-provider/map-error-target.js";

import { protoPathToFormPath } from "./proto-error-path.js";
import { createProtoResolver } from "./proto-resolver.js";

interface ModifiedFieldTree {
  [segment: string]: ModifiedFieldTree | true;
}

type ProtoValidationScope = "all" | "modified-fields";

interface UseProtoFormOptions<Desc extends DescMessage>
  extends Omit<
    UseFormProps<ProtoFormShape<Desc>, unknown, MessageShape<Desc>>,
    "resolver" | "defaultValues"
  > {
  defaultValues?:
    | UseFormProps<
        ProtoFormShape<Desc>,
        unknown,
        MessageShape<Desc>
      >["defaultValues"]
    | MessageShape<Desc>
    | (() => Promise<MessageShape<Desc>>);
  emptyRepeatedStringPolicies?: ProtoConversionOptions["emptyRepeatedStringPolicies"];
  formatMessage?: ProtoFormOptions["formatMessage"];
  serverPathPrefix?: string;
  serverPathPrefixes?: readonly string[];
  validationScope?: ProtoValidationScope;
}

type UseProtoFormReturn<Desc extends DescMessage> = Omit<
  UseFormReturn<ProtoFormShape<Desc>, unknown, MessageShape<Desc>>,
  "reset"
> & {
  reset: (
    values?:
      | Parameters<
          UseFormReturn<
            ProtoFormShape<Desc>,
            unknown,
            MessageShape<Desc>
          >["reset"]
        >[0]
      | MessageShape<Desc>,
    options?: Parameters<
      UseFormReturn<ProtoFormShape<Desc>, unknown, MessageShape<Desc>>["reset"]
    >[1]
  ) => void;
  createMessage: (
    values?: ProtoFormShape<Desc> | MessageShape<Desc>
  ) => MessageShape<Desc>;
  createUpdateMask: () => FieldMask;
  setServerErrors: (error: unknown) => {
    context: ConnectErrorContext;
    handled: boolean;
    unmapped: {
      field: string;
      description: string;
    }[];
  };
  serverErrorContext: ConnectErrorContext | undefined;
  clearServerErrorContext: () => void;
};

function normalizeFormValues<Desc extends DescMessage>(
  schema: Desc,
  values:
    | ProtoFormShape<Desc>
    | MessageShape<Desc>
    | DefaultValues<ProtoFormShape<Desc>>
): ProtoFormShape<Desc>;
function normalizeFormValues(
  schema: DescMessage,
  values: unknown
): Record<string, unknown> {
  if (isMessage(values, schema)) {
    return protoToFormValues(schema, values);
  }
  if (isRecord(values)) {
    return values;
  }
  throw new TypeError("Expected protobuf message or form values");
}

function useProtoForm<Desc extends DescMessage>(
  schema: Desc,
  options?: UseProtoFormOptions<Desc>
): UseProtoFormReturn<Desc>;
function useProtoForm(
  schema: DescMessage,
  options?: UseProtoFormOptions<DescMessage>
): UseProtoFormReturn<DescMessage> {
  const {
    emptyRepeatedStringPolicies,
    formatMessage,
    serverPathPrefix,
    serverPathPrefixes = [],
    validationScope = "all",
    mode = "onChange",
    defaultValues: suppliedDefaults,
    ...rest
  } = options ?? {};
  const conversionOptions: ProtoFormOptions = {
    emptyRepeatedStringPolicies,
    formatMessage,
  };
  const pathPrefixes =
    serverPathPrefix !== undefined && serverPathPrefix !== ""
      ? [serverPathPrefix, ...serverPathPrefixes]
      : serverPathPrefixes;
  const sourceMessageRef = useRef(
    isMessage(suppliedDefaults, schema) ? suppliedDefaults : undefined
  );
  const defaultValues =
    typeof suppliedDefaults === "function"
      ? async () => {
          const values = await suppliedDefaults();
          if (isMessage(values, schema)) {
            sourceMessageRef.current = values;
          }
          return normalizeFormValues(schema, values);
        }
      : normalizeFormValues(schema, suppliedDefaults ?? {});
  const modifiedFieldsRef = useRef<ModifiedFieldTree>({});
  const suppressModifiedTrackingRef = useRef(false);
  const formRef = useRef<
    | UseFormReturn<
        ProtoFormShape<DescMessage>,
        unknown,
        MessageShape<DescMessage>
      >
    | undefined
  >(undefined);

  const form = useForm<
    ProtoFormShape<DescMessage>,
    unknown,
    MessageShape<DescMessage>
  >({
    ...rest,
    ...(suppliedDefaults === undefined ? {} : { defaultValues }),
    mode,
    resolver: (values, context, resolverOptions) => {
      const source = sourceMessageRef.current;
      const validationMask =
        validationScope === "modified-fields"
          ? createDirtyUpdateMask({
              schema,
              dirtyFields: modifiedFieldsRef.current,
              currentValues: values,
              initialValues:
                formRef.current?.formState.defaultValues ?? suppliedDefaults,
            })
          : undefined;
      return createProtoResolver({
        desc: schema,
        options: conversionOptions,
        source,
        validationMask,
      })(values, context, resolverOptions);
    },
  });
  useEffect(
    function syncFormRef() {
      formRef.current = form;
    },
    [form]
  );
  const { defaultValues: initialValues, dirtyFields } = form.formState;
  const trackModifiedField = (path: string) => {
    if (
      validationScope === "modified-fields" &&
      !suppressModifiedTrackingRef.current
    ) {
      setModifiedPath(modifiedFieldsRef.current, path);
    }
  };
  useEffect(
    function subscribeToModifiedFields() {
      if (validationScope !== "modified-fields") {
        return;
      }
      return form.subscribe({
        formState: { values: true },
        callback: ({ name }) => {
          if (isNonEmptyString(name) && !suppressModifiedTrackingRef.current) {
            setModifiedPath(modifiedFieldsRef.current, name);
          }
        },
      });
    },
    [form, validationScope]
  );

  const setValue: typeof form.setValue = (name, value, setValueOptions) => {
    trackModifiedField(name);
    form.setValue(name, value, setValueOptions);
  };
  const setValues: typeof form.setValues = (values, setValueOptions) => {
    const resolvedValues =
      typeof values === "function" ? values(form.getValues()) : values;
    for (const path of Object.keys(resolvedValues)) {
      trackModifiedField(path);
    }
    form.setValues(resolvedValues, setValueOptions);
  };
  const reset: UseProtoFormReturn<DescMessage>["reset"] = (
    values,
    keepStateOptions
  ) => {
    modifiedFieldsRef.current = {};
    suppressModifiedTrackingRef.current = true;
    try {
      const next =
        typeof values === "function" ? values(form.getValues()) : values;
      if (isMessage(next, schema)) {
        sourceMessageRef.current = next;
      }
      form.reset(
        next === undefined ? undefined : normalizeFormValues(schema, next),
        keepStateOptions
      );
    } finally {
      suppressModifiedTrackingRef.current = false;
    }
  };
  const resetField: typeof form.resetField = (name, resetFieldOptions) => {
    clearModifiedPath(modifiedFieldsRef.current, name);
    suppressModifiedTrackingRef.current = true;
    try {
      form.resetField(name, resetFieldOptions);
      restoreDefaultSection(form, name, resetFieldOptions);
    } finally {
      suppressModifiedTrackingRef.current = false;
    }
  };
  const createMessage = (
    values?: ProtoFormShape<DescMessage> | MessageShape<DescMessage>
  ): MessageShape<DescMessage> => {
    if (isMessage(values, schema)) {
      return values;
    }
    const raw = values ?? form.getValues();
    return formValuesToProto({
      desc: schema,
      values: normalizeFormValues(schema, raw),
      source: sourceMessageRef.current,
      options: conversionOptions,
    });
  };

  const createUpdateMask = (): FieldMask =>
    createDirtyUpdateMask({
      schema,
      dirtyFields:
        validationScope === "modified-fields"
          ? modifiedFieldsRef.current
          : dirtyFields,
      currentValues: form.getValues(),
      initialValues,
    });

  const [serverErrorContext, setServerErrorContext] = useState<
    ConnectErrorContext | undefined
  >(undefined);
  const clearServerErrorContext = () => {
    setServerErrorContext(undefined);
  };

  const setServerErrors = (error: unknown) => {
    const context = extractConnectErrorContext(error);
    setServerErrorContext(context);

    if (!(error instanceof ConnectError)) {
      return {
        context,
        handled: false,
        unmapped: [] as {
          field: string;
          description: string;
        }[],
      };
    }
    const { fieldMessages, unmapped } = collectServerFieldErrors(
      schema,
      error,
      pathPrefixes
    );
    let handled = false;
    for (const [path, messages] of fieldMessages) {
      form.setError(
        path,
        {
          message: messages[0]?.message ?? "",
          type: "server",
          types: Object.fromEntries(
            messages.map(({ message, criterion }, index) => [
              `${criterion ?? ""}${index}`,
              message,
            ])
          ),
        },
        handled ? undefined : { shouldFocus: true }
      );
      handled = true;
    }
    return { context, handled, unmapped };
  };

  return {
    ...form,
    clearServerErrorContext,
    createMessage,
    createUpdateMask,
    reset,
    resetField,
    serverErrorContext,
    setServerErrors,
    setValue,
    setValues,
  };
}

function collectServerFieldErrors(
  schema: DescMessage,
  error: ConnectError,
  pathPrefixes: readonly string[]
) {
  const unmapped: {
    field: string;
    description: string;
  }[] = [];
  const fieldMessages = new Map<string, FormErrorMessage[]>();
  for (const violation of extractFieldViolations(error)) {
    const bare = stripPrefix(violation.field, pathPrefixes);
    const formPath = protoPathToFormPath(schema, bare);
    if (!(formPath !== null && formPath !== "")) {
      unmapped.push(violation);
      continue;
    }
    const mapField = schema.fields.find(
      (field) =>
        field.fieldKind === "map" && formPath.startsWith(`${field.localName}.`)
    );
    const segments = mapField
      ? [mapField.localName, formPath.slice(mapField.localName.length + 1)]
      : [formPath];
    const { path, criterion } = formErrorTarget(schema, segments);
    fieldMessages.set(path, [
      ...(fieldMessages.get(path) ?? []),
      { message: humanizeServerFieldError(violation.description), criterion },
    ]);
  }
  return { fieldMessages, unmapped };
}

function useProtoFormDefaults<Desc extends DescMessage>(
  schema: Desc,
  init?: MessageInitShape<Desc>
): MessageShape<Desc> {
  return create(schema, init);
}

function restoreDefaultSection(
  form: UseFormReturn<
    ProtoFormShape<DescMessage>,
    unknown,
    MessageShape<DescMessage>
  >,
  name: FieldPath<ProtoFormShape<DescMessage>>,
  options: Parameters<
    UseFormReturn<
      ProtoFormShape<DescMessage>,
      unknown,
      MessageShape<DescMessage>
    >["resetField"]
  >[1]
): void {
  if (options?.defaultValue !== undefined) {
    return;
  }
  const defaultValue: unknown = getFormValue(
    form.formState.defaultValues,
    name
  );
  if (defaultValue === undefined) {
    form.resetField(name, options);
    return;
  }
  form.setValue(name, defaultValue, {
    shouldDirty: !(options?.keepDirty === true),
  });
  if (!(options?.keepError === true)) {
    form.clearErrors(name);
  }
}

function stripPrefix(field: string, prefixes: readonly string[]): string {
  for (const prefix of prefixes) {
    if (!prefix) {
      continue;
    }
    const withDot = `${prefix}.`;
    if (field.startsWith(withDot)) {
      return field.slice(withDot.length);
    }
  }
  return field;
}

function setModifiedPath(target: ModifiedFieldTree, path: string): void {
  const segments = path.match(/[^.[\]]+/gu) ?? [];
  let current = target;
  for (const [index, segment] of segments.entries()) {
    if (index === segments.length - 1) {
      current[segment] = true;
      return;
    }
    const existing = current[segment];
    if (existing === true) {
      return;
    }
    if (!isModifiedFieldTree(existing)) {
      current[segment] = {};
    }
    const next = current[segment];
    if (!isModifiedFieldTree(next)) {
      return;
    }
    current = next;
  }
}

function clearModifiedPath(target: ModifiedFieldTree, path: string): void {
  const segments = path.match(/[^.[\]]+/gu) ?? [];
  const [segment, ...rest] = segments;
  if (!isNonEmptyString(segment)) {
    return;
  }
  if (rest.length === 0) {
    Reflect.deleteProperty(target, segment);
    return;
  }
  const child = target[segment];
  if (!isModifiedFieldTree(child)) {
    return;
  }
  clearModifiedPath(child, rest.join("."));
  if (Object.keys(child).length === 0) {
    Reflect.deleteProperty(target, segment);
  }
}

function isModifiedFieldTree(
  value: ModifiedFieldTree | true | undefined
): value is ModifiedFieldTree {
  return typeof value === "object";
}

export type { ConnectErrorContext } from "../../lib/protobuf-provider/format-error.js";
export {
  type ProtoValidationScope,
  type UseProtoFormOptions,
  type UseProtoFormReturn,
  useProtoForm,
  useProtoFormDefaults,
};
