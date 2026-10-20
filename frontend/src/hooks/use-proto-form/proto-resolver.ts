import type { DescMessage, MessageShape } from "@bufbuild/protobuf";
import type { FieldMask } from "@bufbuild/protobuf/wkt";
import { toNestErrors, validateFieldsNatively } from "@hookform/resolvers";
import type { Resolver } from "react-hook-form";
import type { FormValues } from "@/lib/core/field-model";
import {
  type NormalizedProtoIssue,
  PROTO_FORM_ROOT_ERROR_KEY,
  type ProtoFormOptions,
  validateFormValuesAgainstProtoSchema,
} from "../../lib/protobuf-provider/hook-runtime.js";
import {
  humanizeValidationError,
  isGenericValidationMessage,
} from "../../lib/protobuf-provider/humanize-validation-error.js";
import {
  type FormErrorMessage,
  formErrorTarget,
} from "../../lib/protobuf-provider/map-error-target.js";
import { createDescriptorAwareStandardSchema } from "../../lib/protobuf-provider/validation-schema.js";

function formatFieldIssues(
  desc: DescMessage,
  issues: readonly NormalizedProtoIssue[],
  options: ProtoFormOptions
) {
  const rawErrors: Record<
    string,
    { message: string; isGeneric: boolean; messages: FormErrorMessage[] }
  > = {};
  for (const issue of issues) {
    if (issue.path.length === 0) {
      continue;
    }
    const { path, criterion } = formErrorTarget(desc, issue.path);
    const generic = isGenericValidationMessage(issue.message);
    const existing = rawErrors[path];
    if (existing) {
      existing.messages.push({ message: issue.message, criterion });
      if (existing.isGeneric && !generic) {
        existing.isGeneric = false;
        existing.message = issue.message;
      }
    } else {
      rawErrors[path] = {
        isGeneric: generic,
        message: issue.message,
        messages: [{ message: issue.message, criterion }],
      };
    }
  }

  return humanizeFieldIssues(rawErrors, options);
}

function humanizeFieldIssues(
  rawErrors: Record<
    string,
    { message: string; isGeneric: boolean; messages: FormErrorMessage[] }
  >,
  options: ProtoFormOptions
) {
  const flatErrors: Record<
    string,
    { message: string; type: string; types: Record<string, string> }
  > = {};
  for (const [path, entry] of Object.entries(rawErrors)) {
    flatErrors[path] = {
      message: humanizeValidationError(entry.message, options.formatMessage),
      type: "validation",
      types: Object.fromEntries(
        entry.messages.map(({ message, criterion }, index) => [
          `${criterion ?? ""}${index}`,
          humanizeValidationError(message, options.formatMessage),
        ])
      ),
    };
  }
  return flatErrors;
}

function rootIssueMessages(
  issues: readonly NormalizedProtoIssue[],
  options: ProtoFormOptions
): string[] {
  return issues.flatMap((issue) =>
    issue.path.length === 0
      ? [humanizeValidationError(issue.message, options.formatMessage)]
      : []
  );
}

export function createProtoResolver<
  Desc extends DescMessage,
  Values extends FormValues = FormValues,
>({
  desc,
  options = {},
  source,
  validationMask,
}: {
  desc: Desc;
  options?: ProtoFormOptions;
  source?: MessageShape<Desc> | undefined;
  validationMask?: FieldMask | undefined;
}): Resolver<Values, unknown, MessageShape<Desc>> {
  const standardSchema = createDescriptorAwareStandardSchema(desc, options);

  return async (values, _context, resolverOptions) => {
    const validationResult = await validateFormValuesAgainstProtoSchema({
      desc,
      values,
      schema: standardSchema,
      options,
      source,
      context: {
        validationMask,
      },
    });

    if (!validationResult.issues) {
      if (resolverOptions.shouldUseNativeValidation === true) {
        validateFieldsNatively({}, resolverOptions);
      }
      return {
        errors: {},
        values: validationResult.value,
      };
    }

    const flatErrors = formatFieldIssues(
      desc,
      validationResult.issues,
      options
    );

    const nestedErrors = toNestErrors(flatErrors, resolverOptions);
    const rootMessages = rootIssueMessages(validationResult.issues, options);

    const [rootMessage] = rootMessages;
    if (rootMessage !== undefined && rootMessage !== "") {
      const errors = Object.assign(nestedErrors, {
        root: {
          message: rootMessages.join("\n"),
          type: "validation",
        },
        [PROTO_FORM_ROOT_ERROR_KEY]: {
          message: rootMessage,
          type: "validation",
        },
      });
      return {
        errors,
        values: {},
      };
    }

    return {
      errors: nestedErrors,
      values: {},
    };
  };
}
