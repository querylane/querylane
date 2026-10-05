import { create, type DescMessage, isMessage, type MessageInitShape, type MessageShape } from "@bufbuild/protobuf";
import type { FieldMask } from "@bufbuild/protobuf/wkt";
import { ConnectError } from "@connectrpc/connect";
import { useEffect, useRef, useState } from "react";
import {
  type FieldPath,
  type Path,
  type SetValueConfig,
  type UseFormProps,
  type UseFormReturn,
  useForm,
} from "react-hook-form";
import { createUpdateMask as createDirtyUpdateMask } from "../../lib/protobuf-provider/field-mask.js";
import {
  type ConnectErrorContext,
  extractConnectErrorContext,
  extractFieldViolations,
} from "../../lib/protobuf-provider/format-error.js";
import {
  formValuesToProto,
  type ProtoConversionOptions,
  type ProtoFormOptions,
} from "../../lib/protobuf-provider/hook-runtime.js";
import { humanizeServerFieldError } from "../../lib/protobuf-provider/humanize-validation-error.js";

import { protoPathToFormPath } from "./proto-error-path.js";
import type { FlattenProtoOneofs } from "./proto-paths.js";
import { createProtoResolver } from "./proto-resolver.js";

export type { ConnectErrorContext } from "../../lib/protobuf-provider/format-error.js";

type FormShape<Desc extends DescMessage> = FlattenProtoOneofs<MessageShape<Desc>>;

type NestedErrors<T> = {
  [K in keyof T]?: T[K] extends object ? NestedErrors<T[K]> & { message?: string } : { message?: string };
};

interface ModifiedFieldTree {
  [segment: string]: ModifiedFieldTree | true;
}

export type ProtoValidationScope = "all" | "modified-fields";

export interface UseProtoFormOptions<Desc extends DescMessage> extends Omit<UseFormProps<FormShape<Desc>>, "resolver"> {
  emptyRepeatedStringPolicies?: ProtoConversionOptions["emptyRepeatedStringPolicies"];
  formatMessage?: ProtoFormOptions["formatMessage"];
  serverPathPrefix?: string;
  serverPathPrefixes?: readonly string[];
  validationScope?: ProtoValidationScope;
}

export type UseProtoFormReturn<Desc extends DescMessage> = UseFormReturn<FormShape<Desc>> & {
  createMessage: (values?: FormShape<Desc>) => MessageShape<Desc>;
  createUpdateMask: () => FieldMask;
  setOneofValue: (path: string, oneofCase: string, value: unknown, options?: SetValueConfig) => void;
  getNestedErrors: <T = Record<string, { message?: string }>>(path: string) => NestedErrors<T> | undefined;
  setServerErrors: (error: unknown) => {
    context: ConnectErrorContext;
    handled: boolean;
    unmapped: { field: string; description: string }[];
  };
  serverErrorContext: ConnectErrorContext | undefined;
  clearServerErrorContext: () => void;
};

export function useProtoForm<Desc extends DescMessage>(
  schema: Desc,
  options?: UseProtoFormOptions<Desc>
): UseProtoFormReturn<Desc> {
  const {
    emptyRepeatedStringPolicies,
    formatMessage,
    serverPathPrefix,
    serverPathPrefixes = [],
    validationScope = "all",
    mode = "onChange",
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
  const sourceMessage = isMessage(rest.defaultValues, schema) ? rest.defaultValues : undefined;
  const modifiedFieldsRef = useRef<ModifiedFieldTree>({});
  const suppressModifiedTrackingRef = useRef(false);
  const formRef = useRef<UseFormReturn<FormShape<Desc>> | undefined>(undefined);

  const form = useForm({
    ...rest,
    mode,
    resolver: createProtoResolver(
      schema,
      conversionOptions,
      sourceMessage,
      validationScope === "modified-fields"
        ? {
            getValidationMask: (values) =>
              createDirtyUpdateMask(
                schema,
                modifiedFieldsRef.current,
                values,
                formRef.current?.formState.defaultValues ?? rest.defaultValues
              ),
          }
        : undefined
    ),
  } as unknown as UseFormProps<FormShape<Desc>>) as UseFormReturn<FormShape<Desc>>;
  useEffect(
    function syncFormRef() {
      formRef.current = form;
    },
    [form]
  );
  const { defaultValues: initialValues, dirtyFields, errors: formErrors } = form.formState;
  const trackModifiedField = (path: string) => {
    if (validationScope === "modified-fields" && !suppressModifiedTrackingRef.current) {
      setModifiedPath(modifiedFieldsRef.current, path);
    }
  };
  useEffect(
    function subscribeToModifiedFields() {
      if (validationScope !== "modified-fields") {
        return;
      }
      const subscription = form.watch((_values, { name }) => {
        if (name && !suppressModifiedTrackingRef.current) {
          setModifiedPath(modifiedFieldsRef.current, name);
        }
      });
      return () => subscription.unsubscribe();
    },
    [form.watch, validationScope]
  );

  const setValue: typeof form.setValue = (name, value, setValueOptions) => {
    trackModifiedField(name);
    form.setValue(name, value, setValueOptions);
  };
  const setValues: typeof form.setValues = (values, setValueOptions) => {
    const resolvedValues = typeof values === "function" ? values(form.getValues()) : values;
    for (const path of Object.keys(resolvedValues)) {
      trackModifiedField(path);
    }
    form.setValues(resolvedValues, setValueOptions);
  };
  const reset: typeof form.reset = (values, keepStateOptions) => {
    modifiedFieldsRef.current = {};
    suppressModifiedTrackingRef.current = true;
    try {
      form.reset(values, keepStateOptions);
    } finally {
      suppressModifiedTrackingRef.current = false;
    }
  };
  const resetField: typeof form.resetField = (name, resetFieldOptions) => {
    clearModifiedPath(modifiedFieldsRef.current, name);
    suppressModifiedTrackingRef.current = true;
    try {
      form.resetField(name, resetFieldOptions);
    } finally {
      suppressModifiedTrackingRef.current = false;
    }
  };
  const createMessage = (values?: FormShape<Desc>): MessageShape<Desc> => {
    const raw = values ?? form.getValues();
    return formValuesToProto(schema, raw as Record<string, unknown>, sourceMessage, conversionOptions);
  };

  const createUpdateMask = (): FieldMask =>
    createDirtyUpdateMask(
      schema,
      validationScope === "modified-fields" ? modifiedFieldsRef.current : dirtyFields,
      form.getValues(),
      initialValues
    );

  const setOneofValue = (path: string, oneofCase: string, value: unknown, setValueOptions?: SetValueConfig) => {
    const current = form.getValues(path as Path<FormShape<Desc>>);
    const isOneof = current === undefined || current === null || (typeof current === "object" && "case" in current);
    if (!isOneof) {
      throw new Error(
        `setOneofValue("${path}"): target is not a oneof field. ` +
          "Expected { case, value } shape. Use setValue() for regular fields."
      );
    }
    const prev = current as { case?: string; value?: unknown } | undefined;
    if (prev?.case !== undefined && prev?.case !== "" && prev.case !== oneofCase) {
      setValue(path as Path<FormShape<Desc>>, { case: "", value: {} } as never);
    }
    setValue(path as Path<FormShape<Desc>>, { case: oneofCase, value } as never, {
      shouldDirty: true,
      shouldValidate: true,
      ...setValueOptions,
    });
  };

  const getNestedErrors = <T = Record<string, { message?: string }>>(path: string): NestedErrors<T> | undefined => {
    const segments = path.split(".");
    let current: unknown = formErrors;
    for (const segment of segments) {
      if (current === undefined || current === null) {
        return;
      }
      current = (current as Record<string, unknown>)[segment];
    }
    return current as NestedErrors<T> | undefined;
  };

  const [serverErrorContext, setServerErrorContext] = useState<ConnectErrorContext | undefined>(undefined);
  const clearServerErrorContext = () => setServerErrorContext(undefined);

  const setServerErrors = (error: unknown) => {
    const context = extractConnectErrorContext(error);
    setServerErrorContext(context);

    if (!(error instanceof ConnectError)) {
      return {
        context,
        handled: false,
        unmapped: [] as { field: string; description: string }[],
      };
    }
    const unmapped: { field: string; description: string }[] = [];
    let handled = false;
    for (const violation of extractFieldViolations(error)) {
      const bare = stripPrefix(violation.field, pathPrefixes);
      const formPath = protoPathToFormPath(schema, bare);
      if (!(formPath !== null && formPath !== "")) {
        unmapped.push(violation);
        continue;
      }
      form.setError(
        formPath as FieldPath<FormShape<Desc>>,
        {
          message: humanizeServerFieldError(violation.description),
          type: "server",
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
    getNestedErrors,
    reset,
    resetField,
    serverErrorContext,
    setOneofValue,
    setServerErrors,
    setValue,
    setValues,
  };
}

export function useProtoFormDefaults<Desc extends DescMessage>(
  schema: Desc,
  init?: MessageInitShape<Desc>
): FormShape<Desc> {
  return create(schema, init ?? ({} as MessageInitShape<Desc>)) as unknown as FormShape<Desc>;
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
  if (!segment) {
    return;
  }
  if (rest.length === 0) {
    delete target[segment];
    return;
  }
  const child = target[segment];
  if (!isModifiedFieldTree(child)) {
    return;
  }
  clearModifiedPath(child, rest.join("."));
  if (Object.keys(child).length === 0) {
    delete target[segment];
  }
}

function isModifiedFieldTree(value: ModifiedFieldTree | true | undefined): value is ModifiedFieldTree {
  return typeof value === "object";
}
