import {
  formatProtoformMessage,
  type ProtoformMessageFormatter,
} from "../core/messages.js";

const REGEX_ERROR_PATTERN = /regex pattern\s*`([^`]+)`/u;
const MIN_LEN_PATTERN = /^(?:value length )?must be at least (\d+)/u;
const MAX_LEN_PATTERN = /^value length must be at most (\d+)/u;
const MIN_ITEMS_PATTERN =
  /^(?:value )?must contain at least (\d+)(?: item(?:\(s\)|s)?)?/u;
const MAX_ITEMS_PATTERN =
  /^(?:value )?must contain at most (\d+)(?: item(?:\(s\)|s)?)?/u;
const GTE_PATTERN = /^value must be greater than or equal to ([\d.]+)/u;
const LTE_PATTERN = /^value must be less than or equal to ([\d.]+)/u;
const GT_PATTERN = /^value must be greater than ([\d.]+)/u;
const LT_PATTERN = /^value must be less than ([\d.]+)/u;

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
  // Match the URL pattern with or without a trailing `$` anchor. Both
  // appear in protovalidate output depending on how the rule was authored.
  "^https?://.+": {
    description: "Must be a valid URL starting with http:// or https://",
    example: "https://example.com",
  },
  "^https?://.+$": {
    description: "Must be a valid URL starting with http:// or https://",
    example: "https://example.com",
  },
};

/** Known generic protovalidate messages that should be replaced by custom CEL messages when available. */
const GENERIC_MESSAGES = new Set([
  "value is required",
  "exactly one field is required in oneof",
]);

/**
 * Returns true if the message is a generic protovalidate constraint message
 * (i.e., not a custom CEL message). Used by the resolver to prefer custom
 * messages over generic ones when a field has multiple validation errors.
 */
export function isGenericValidationMessage(message: string): boolean {
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
  if (minLenMatch?.[1]) {
    const limit = Number(minLenMatch[1]);
    return limit === 1
      ? formatProtoformMessage(
          formatter,
          "validation.required",
          {},
          "This field is required."
        )
      : formatProtoformMessage(
          formatter,
          "validation.min_length",
          { limit },
          `Must be at least ${limit} characters.`
        );
  }
  const maxLenMatch = MAX_LEN_PATTERN.exec(message);
  if (maxLenMatch?.[1]) {
    const limit = Number(maxLenMatch[1]);
    return formatProtoformMessage(
      formatter,
      "validation.max_length",
      { limit },
      `Must be at most ${limit} characters.`
    );
  }
  return undefined;
}

function humanizeItemConstraint(
  message: string,
  formatter?: ProtoformMessageFormatter
): string | undefined {
  const minItemsMatch = MIN_ITEMS_PATTERN.exec(message);
  if (minItemsMatch?.[1]) {
    const limit = Number(minItemsMatch[1]);
    return formatProtoformMessage(
      formatter,
      "validation.min_items",
      { limit },
      limit === 1 ? "Add at least one item." : `Add at least ${limit} items.`
    );
  }
  const maxItemsMatch = MAX_ITEMS_PATTERN.exec(message);
  if (maxItemsMatch?.[1]) {
    const limit = Number(maxItemsMatch[1]);
    return formatProtoformMessage(
      formatter,
      "validation.max_items",
      { limit },
      limit === 1
        ? "At most one item is allowed."
        : `At most ${limit} items are allowed.`
    );
  }
  return undefined;
}

function humanizeNumericBound(
  message: string,
  formatter?: ProtoformMessageFormatter
): string | undefined {
  const gteMatch = GTE_PATTERN.exec(message);
  if (gteMatch?.[1]) {
    return formatProtoformMessage(
      formatter,
      "validation.greater_than_or_equal",
      { limit: gteMatch[1] },
      `Must be ${gteMatch[1]} or greater.`
    );
  }
  const lteMatch = LTE_PATTERN.exec(message);
  if (lteMatch?.[1]) {
    return formatProtoformMessage(
      formatter,
      "validation.less_than_or_equal",
      { limit: lteMatch[1] },
      `Must be ${lteMatch[1]} or less.`
    );
  }
  const gtMatch = GT_PATTERN.exec(message);
  if (gtMatch?.[1]) {
    return formatProtoformMessage(
      formatter,
      "validation.greater_than",
      { limit: gtMatch[1] },
      `Must be greater than ${gtMatch[1]}.`
    );
  }
  const ltMatch = LT_PATTERN.exec(message);
  if (ltMatch?.[1]) {
    return formatProtoformMessage(
      formatter,
      "validation.less_than",
      { limit: ltMatch[1] },
      `Must be less than ${ltMatch[1]}.`
    );
  }
  return undefined;
}

function humanizeRegexError(
  message: string,
  formatter?: ProtoformMessageFormatter
): string | undefined {
  const regexMatch = REGEX_ERROR_PATTERN.exec(message);
  if (!regexMatch?.[1]) {
    return;
  }
  const known = KNOWN_PATTERNS[regexMatch[1]];
  const fallback = known
    ? `${known.description}. Example: ${known.example}`
    : message;
  return formatProtoformMessage(
    formatter,
    "validation.pattern",
    { example: known?.example ?? "", pattern: regexMatch[1] },
    fallback
  );
}

/**
 * Replace raw protovalidate error messages with human-readable descriptions.
 * Returns the original message if it's already a custom CEL message.
 */
export function humanizeValidationError(
  message: string,
  formatter?: ProtoformMessageFormatter
): string {
  if (message === "value is required") {
    return formatProtoformMessage(
      formatter,
      "validation.required",
      {},
      "Enter a value."
    );
  }
  if (message === "exactly one field is required in oneof") {
    return formatProtoformMessage(
      formatter,
      "validation.oneof_required",
      {},
      "Select an option."
    );
  }

  return (
    humanizeLengthConstraint(message, formatter) ??
    humanizeItemConstraint(message, formatter) ??
    humanizeNumericBound(message, formatter) ??
    humanizeRegexError(message, formatter) ??
    message
  );
}

export const SERVER_FIELD_ERROR_FALLBACK = "Review this value and try again.";

/** Humanize a server field violation and ensure blank descriptions stay actionable. */
export function humanizeServerFieldError(
  description: string,
  formatter?: ProtoformMessageFormatter
): string {
  const message = description.trim();
  return message
    ? humanizeValidationError(message, formatter)
    : formatProtoformMessage(
        formatter,
        "validation.server_field",
        {},
        SERVER_FIELD_ERROR_FALLBACK
      );
}
