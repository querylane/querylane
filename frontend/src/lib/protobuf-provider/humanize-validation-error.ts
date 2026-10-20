import { isNonEmptyString } from "@/lib/value-guards";
import {
  formatProtoformMessage,
  type ProtoformMessageFormatter,
} from "../core/messages.js";

const REGEX_ERROR_PATTERN = /regex pattern\s*`(?<capture1>[^`]+)`/u;
const MIN_LEN_PATTERN = /^(?:value length )?must be at least (?<capture1>\d+)/u;
const MAX_LEN_PATTERN = /^value length must be at most (?<capture1>\d+)/u;
const MIN_ITEMS_PATTERN =
  /^(?:value )?must contain at least (?<capture1>\d+)(?: item(?:\(s\)|s)?)?/u;
const MAX_ITEMS_PATTERN =
  /^(?:value )?must contain at most (?<capture1>\d+)(?: item(?:\(s\)|s)?)?/u;
const GTE_PATTERN =
  /^value must be greater than or equal to (?<capture1>[\d.]+)/u;
const LTE_PATTERN = /^value must be less than or equal to (?<capture1>[\d.]+)/u;
const GT_PATTERN = /^value must be greater than (?<capture1>[\d.]+)/u;
const LT_PATTERN = /^value must be less than (?<capture1>[\d.]+)/u;

interface PatternDescription {
  description: string;
  example: string;
}

const KNOWN_PATTERNS: Record<string, PatternDescription> = {
  "^[A-Z][A-Z0-9_]*$": {
    description:
      "Must be UPPER_SNAKE_CASE (start with a letter, then uppercase letters, digits, and underscores)",
    example: "AWS_ACCESS_KEY_ID",
  },
  "^[a-z][a-z0-9-]*$": {
    description:
      "Must be lowercase letters, digits, and hyphens (start with a letter)",
    example: "my-resource-name",
  },
  "^[a-z0-9][a-z0-9-]*$": {
    description:
      "Must be lowercase letters, digits, and hyphens (start with a letter or digit)",
    example: "my-resource-1",
  },
  "^$|^[A-Z][A-Z0-9_]*$": {
    description:
      "Must be empty or UPPER_SNAKE_CASE (uppercase letters, digits, and underscores)",
    example: "MY_API_KEY",
  },
  "^https?://.+": {
    description: "Must be a valid URL starting with http:// or https://",
    example: "https://example.com",
  },
  "^https?://.+$": {
    description: "Must be a valid URL starting with http:// or https://",
    example: "https://example.com",
  },
};

const GENERIC_MESSAGES = new Set([
  "value is required",
  "exactly one field is required in oneof",
]);

function isGenericValidationMessage(message: string): boolean {
  if (GENERIC_MESSAGES.has(message)) {
    return true;
  }
  if (MIN_LEN_PATTERN.test(message) || MAX_LEN_PATTERN.test(message)) {
    return true;
  }
  if (REGEX_ERROR_PATTERN.test(message)) {
    return true;
  }
  if (
    MIN_ITEMS_PATTERN.test(message) ||
    MAX_ITEMS_PATTERN.test(message) ||
    GTE_PATTERN.test(message) ||
    LTE_PATTERN.test(message) ||
    GT_PATTERN.test(message) ||
    LT_PATTERN.test(message)
  ) {
    return true;
  }
  return false;
}

function humanizeLengthConstraint(
  message: string,
  formatter?: ProtoformMessageFormatter
): string | undefined {
  const minLenMatch = MIN_LEN_PATTERN.exec(message);
  if (isNonEmptyString(minLenMatch?.[1])) {
    const limit = Number(minLenMatch[1]);
    return limit === 1
      ? formatProtoformMessage({
          formatter,
          code: "validation.required",
          params: {},
          fallback: "This field is required.",
        })
      : formatProtoformMessage({
          formatter,
          code: "validation.min_length",
          params: { limit },
          fallback: `Must be at least ${limit} characters.`,
        });
  }
  const maxLenMatch = MAX_LEN_PATTERN.exec(message);
  if (isNonEmptyString(maxLenMatch?.[1])) {
    const limit = Number(maxLenMatch[1]);
    return formatProtoformMessage({
      formatter,
      code: "validation.max_length",
      params: { limit },
      fallback: `Must be at most ${limit} characters.`,
    });
  }
  return undefined;
}

function humanizeItemConstraint(
  message: string,
  formatter?: ProtoformMessageFormatter
): string | undefined {
  const minItemsMatch = MIN_ITEMS_PATTERN.exec(message);
  if (isNonEmptyString(minItemsMatch?.[1])) {
    const limit = Number(minItemsMatch[1]);
    return formatProtoformMessage({
      formatter,
      code: "validation.min_items",
      params: { limit },
      fallback:
        limit === 1 ? "Add at least one item." : `Add at least ${limit} items.`,
    });
  }
  const maxItemsMatch = MAX_ITEMS_PATTERN.exec(message);
  if (isNonEmptyString(maxItemsMatch?.[1])) {
    const limit = Number(maxItemsMatch[1]);
    return formatProtoformMessage({
      formatter,
      code: "validation.max_items",
      params: { limit },
      fallback:
        limit === 1
          ? "At most one item is allowed."
          : `At most ${limit} items are allowed.`,
    });
  }
  return undefined;
}

function humanizeNumericBound(
  message: string,
  formatter?: ProtoformMessageFormatter
): string | undefined {
  const gteMatch = GTE_PATTERN.exec(message);
  if (isNonEmptyString(gteMatch?.[1])) {
    return formatProtoformMessage({
      formatter,
      code: "validation.greater_than_or_equal",
      params: { limit: gteMatch[1] },
      fallback: `Must be ${gteMatch[1]} or greater.`,
    });
  }
  const lteMatch = LTE_PATTERN.exec(message);
  if (isNonEmptyString(lteMatch?.[1])) {
    return formatProtoformMessage({
      formatter,
      code: "validation.less_than_or_equal",
      params: { limit: lteMatch[1] },
      fallback: `Must be ${lteMatch[1]} or less.`,
    });
  }
  const gtMatch = GT_PATTERN.exec(message);
  if (isNonEmptyString(gtMatch?.[1])) {
    return formatProtoformMessage({
      formatter,
      code: "validation.greater_than",
      params: { limit: gtMatch[1] },
      fallback: `Must be greater than ${gtMatch[1]}.`,
    });
  }
  const ltMatch = LT_PATTERN.exec(message);
  if (isNonEmptyString(ltMatch?.[1])) {
    return formatProtoformMessage({
      formatter,
      code: "validation.less_than",
      params: { limit: ltMatch[1] },
      fallback: `Must be less than ${ltMatch[1]}.`,
    });
  }
  return undefined;
}

function humanizeRegexError(
  message: string,
  formatter?: ProtoformMessageFormatter
): string | undefined {
  const regexMatch = REGEX_ERROR_PATTERN.exec(message);
  if (!isNonEmptyString(regexMatch?.[1])) {
    return;
  }
  const known = KNOWN_PATTERNS[regexMatch[1]];
  const fallback = known
    ? `${known.description}. Example: ${known.example}`
    : message;
  return formatProtoformMessage({
    formatter,
    code: "validation.pattern",
    params: { example: known?.example ?? "", pattern: regexMatch[1] },
    fallback,
  });
}

function humanizeValidationError(
  message: string,
  formatter?: ProtoformMessageFormatter
): string {
  if (message === "value is required") {
    return formatProtoformMessage({
      formatter,
      code: "validation.required",
      params: {},
      fallback: "Enter a value.",
    });
  }
  if (message === "exactly one field is required in oneof") {
    return formatProtoformMessage({
      formatter,
      code: "validation.oneof_required",
      params: {},
      fallback: "Select an option.",
    });
  }

  return (
    humanizeLengthConstraint(message, formatter) ??
    humanizeItemConstraint(message, formatter) ??
    humanizeNumericBound(message, formatter) ??
    humanizeRegexError(message, formatter) ??
    message
  );
}

const SERVER_FIELD_ERROR_FALLBACK = "Review this value and try again.";

function humanizeServerFieldError(
  description: string,
  formatter?: ProtoformMessageFormatter
): string {
  const message = description.trim();
  return message
    ? humanizeValidationError(message, formatter)
    : formatProtoformMessage({
        formatter,
        code: "validation.server_field",
        params: {},
        fallback: SERVER_FIELD_ERROR_FALLBACK,
      });
}

export {
  humanizeServerFieldError,
  humanizeValidationError,
  isGenericValidationMessage,
  SERVER_FIELD_ERROR_FALLBACK,
};
