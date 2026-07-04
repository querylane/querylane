import {
  create,
  type DescMessage,
  type MessageInitShape,
  type MessageShape,
} from "@bufbuild/protobuf";
import { useEffect } from "react";
import {
  type FieldErrors,
  type FieldValues,
  type Resolver,
  type UseFormProps,
  type UseFormReturn,
  useForm,
} from "react-hook-form";
import { createProtoStandardSchema } from "@/lib/proto-standard-schema";

type ProtoStandardSchema = ReturnType<typeof createProtoStandardSchema>;

const STANDARD_SCHEMA_CACHE = new WeakMap<DescMessage, ProtoStandardSchema>();

function getStandardSchema(schema: DescMessage): ProtoStandardSchema {
  let standardSchema = STANDARD_SCHEMA_CACHE.get(schema);
  if (!standardSchema) {
    standardSchema = createProtoStandardSchema(schema);
    STANDARD_SCHEMA_CACHE.set(schema, standardSchema);
  }
  return standardSchema;
}

/**
 * Validate plain form values against a protobuf schema using
 * protovalidate-es and return the standard-schema issues.
 *
 * The key bridge: react-hook-form works with plain objects, but protovalidate
 * expects a proper protobuf message instance, so a proto message is created
 * from the form values before validating.
 */
async function validateProtoValues<Desc extends DescMessage>(
  schema: Desc,
  values: FieldValues
) {
  const message = create(schema, values as MessageInitShape<Desc>);
  let result = getStandardSchema(schema)["~standard"].validate(message);
  if (result instanceof Promise) {
    result = await result;
  }

  return result.issues ?? [];
}

/**
 * Build a react-hook-form resolver that validates plain form values against a
 * protobuf schema using protovalidate-es.
 */
function createProtoResolver<Desc extends DescMessage>(
  schema: Desc
): Resolver<MessageShape<Desc> & FieldValues> {
  return async (values) => {
    const issues = await validateProtoValues(schema, values);
    if (issues.length === 0) {
      return { errors: {}, values };
    }

    const errors: Record<string, { message: string; type: string }> = {};
    for (const issue of issues) {
      const path = issue.path
        ?.map((segment) =>
          typeof segment === "object" && "key" in segment
            ? String(segment.key)
            : String(segment)
        )
        .join(".");

      if (path && !errors[path]) {
        errors[path] = { message: issue.message, type: "protovalidate" };
      }
    }

    return {
      errors: errors as FieldErrors<MessageShape<Desc> & FieldValues>,
      values: {},
    };
  };
}

/**
 * Creates a react-hook-form instance with proto-driven validation.
 *
 * Validation rules are derived from `buf.validate` annotations in the `.proto`
 * schema — no manual validation code needed. Field errors are mapped
 * automatically via protovalidate-es.
 */
export function useProtoForm<Desc extends DescMessage>(
  schema: Desc,
  options?: Omit<UseFormProps<MessageShape<Desc>>, "resolver">
): UseFormReturn<MessageShape<Desc>> {
  const resolver = createProtoResolver(schema);
  const form = useForm<MessageShape<Desc>>({
    ...options,
    resolver,
  });

  // react-hook-form leaves isValid stale until the first validation pass, so
  // valid defaults would keep gated actions disabled. Validate the defaults
  // outside the form and only run trigger() when they are already valid:
  // this flips isValid to true without ever writing field errors, so invalid
  // untouched fields never render in an error state before interaction.
  const { getValues, trigger } = form;
  // allow-useEffect: sync initial validity from external schema validation
  useEffect(
    function syncInitialValidity() {
      let cancelled = false;
      validateProtoValues(schema, getValues()).then((issues) => {
        if (!cancelled && issues.length === 0) {
          trigger();
        }
      });
      return () => {
        cancelled = true;
      };
    },
    [getValues, schema, trigger]
  );

  return form;
}
