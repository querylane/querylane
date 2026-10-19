import type { DescMessage, MessageShape, MessageValidType } from "@bufbuild/protobuf";
import type { FieldMask } from "@bufbuild/protobuf/wkt";
import { toNestErrors, validateFieldsNatively } from "@hookform/resolvers";
import type { Resolver } from "react-hook-form";
import type { FormValues } from "../../lib/core/index.js";
import {
  PROTO_FORM_ROOT_ERROR_KEY,
  type ProtoFormOptions,
  validateFormValuesAgainstProtoSchema,
} from "../../lib/protobuf-provider/hook-runtime.js";
import {
  humanizeValidationError,
  isGenericValidationMessage,
} from "../../lib/protobuf-provider/humanize-validation-error.js";
import { formErrorTarget, type FormErrorMessage } from "../../lib/protobuf-provider/map-error-target.js";
import { createDescriptorAwareStandardSchema } from "../../lib/protobuf-provider/validation-schema.js";

export interface ProtoResolverOptions<Desc extends DescMessage = DescMessage> {
  getSourceMessage?: () => MessageShape<Desc> | undefined;
  getValidationMask?: (values: FormValues) => FieldMask | undefined;
}

export function createProtoResolver<Desc extends DescMessage>(
  desc: Desc,
  options: ProtoFormOptions = {},
  source?: MessageShape<Desc>,
  protoResolverOptions: ProtoResolverOptions<Desc> = {}
): Resolver<FormValues, unknown, MessageValidType<Desc>> {
  const standardSchema = createDescriptorAwareStandardSchema(desc, options);

  return async (values, _context, resolverOptions) => {
    const validationResult = await validateFormValuesAgainstProtoSchema(
      desc,
      values,
      standardSchema,
      options,
      protoResolverOptions.getSourceMessage ? protoResolverOptions.getSourceMessage() : source,
      {
        validationMask: protoResolverOptions.getValidationMask?.(values),
      }
    );

    if (!validationResult.issues) {
      if (resolverOptions.shouldUseNativeValidation) {
        validateFieldsNatively({}, resolverOptions);
      }
      return {
        errors: {},
        values: validationResult.value,
      };
    }

    const rawErrors: Record<string, { message: string; isGeneric: boolean; messages: FormErrorMessage[] }> = {};
    for (const issue of validationResult.issues) {
      if (issue.path.length === 0) {
        continue;
      }
      const { path, criterion } = formErrorTarget(desc, issue.path);
      const generic = isGenericValidationMessage(issue.message);
      const existing = rawErrors[path];
      if (!existing) {
        rawErrors[path] = { isGeneric: generic, message: issue.message, messages: [{ message: issue.message, criterion }] };
      } else {
        existing.messages.push({ message: issue.message, criterion });
        if (existing.isGeneric && !generic) {
          existing.isGeneric = false;
          existing.message = issue.message;
        }
      }
    }

    const flatErrors: Record<string, { message: string; type: string; types: Record<string, string> }> = {};
    for (const [path, entry] of Object.entries(rawErrors)) {
      flatErrors[path] = {
        message: humanizeValidationError(entry.message, options.formatMessage),
        type: "validation",
        types: Object.fromEntries(entry.messages.map(({ message, criterion }, index) => [`${criterion ?? ""}${index}`, humanizeValidationError(message, options.formatMessage)])),
      };
    }

    const nestedErrors = toNestErrors(flatErrors, resolverOptions);
    const rootMessages: string[] = [];
    for (const issue of validationResult.issues) {
      if (issue.path.length === 0) {
        rootMessages.push(humanizeValidationError(issue.message, options.formatMessage));
      }
    }

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
