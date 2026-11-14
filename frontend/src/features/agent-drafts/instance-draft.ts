import {
  type ChangeDetails,
  createChange,
  definePrimitive,
  type PropSchema,
} from "@ui-sdk/core";
import type { InstanceLabelEntry } from "@/components/console-pages/instance-config-model";
import {
  getSslModeOption,
  getSslNegotiationOption,
  isDirectSslNegotiationMode,
} from "@/lib/ssl-modes";
import { isRecord, isUnknownArray } from "@/lib/value-guards";

interface InstanceDraftValue {
  displayName: string;
  labels: InstanceLabelEntry[];
  sslMode: string;
  sslNegotiation: string;
}

type InstanceDraftReason = "imperative" | "input-change" | "item-press";
interface InstanceDraftOptions extends InstanceDraftValue {
  disabled?: boolean;
  onDisplayNameChange?: (
    value: string,
    details: ChangeDetails<InstanceDraftReason>
  ) => void;
  onLabelsChange?: (
    value: InstanceLabelEntry[],
    details: ChangeDetails<InstanceDraftReason>
  ) => void;
  onSslModeChange?: (
    value: string,
    details: ChangeDetails<InstanceDraftReason>
  ) => void;
  onSslNegotiationChange?: (
    value: string,
    details: ChangeDetails<InstanceDraftReason>
  ) => void;
  pending?: boolean;
}
const DRAFT_KEYS = [
  "displayName",
  "labels",
  "sslMode",
  "sslNegotiation",
] as const;
type DraftKey = (typeof DRAFT_KEYS)[number];

function isDraftLabel(value: unknown): value is InstanceLabelEntry {
  return (
    isRecord(value) &&
    typeof value["id"] === "string" &&
    value["id"].length > 0 &&
    typeof value["key"] === "string" &&
    typeof value["value"] === "string"
  );
}

function isInstanceDraftValue(value: unknown): value is InstanceDraftValue {
  return (
    isRecord(value) &&
    typeof value["displayName"] === "string" &&
    typeof value["sslMode"] === "string" &&
    typeof value["sslNegotiation"] === "string" &&
    isUnknownArray(value["labels"]) &&
    value["labels"].every((label) => isDraftLabel(label)) &&
    new Set(value["labels"].map((label) => label.id)).size ===
      value["labels"].length
  );
}

const optionsSchema = {
  displayName: "string",
  labels: "value",
  sslMode: "string",
  sslNegotiation: "string",
  disabled: "boolean",
  pending: "boolean",
  onDisplayNameChange: "callback",
  onLabelsChange: "callback",
  onSslModeChange: "callback",
  onSslNegotiationChange: "callback",
} satisfies PropSchema<InstanceDraftOptions>;

// Keep beta.2’s concrete schema in its public metadata for exact optional-property typing.
const instanceDraft = Object.assign(
  definePrimitive({
    name: "instance-draft",
    controlled: [...DRAFT_KEYS],
    options: optionsSchema,
    state: (options: InstanceDraftOptions) => ({
      displayName: options.displayName,
      labels: options.labels,
      sslMode: options.sslMode,
      sslNegotiation: options.sslNegotiation,
      disabled: Boolean(options.disabled) || Boolean(options.pending),
    }),
    sync: (options) => ({
      displayName: options.displayName,
      labels: options.labels,
      sslMode: options.sslMode,
      sslNegotiation: options.sslNegotiation,
      disabled: Boolean(options.disabled) || Boolean(options.pending),
    }),
    api: (context) => {
      const change = createChange(context);
      function text(value: unknown) {
        if (typeof value !== "string") {
          throw new TypeError("Draft text values must be strings.");
        }
        return value;
      }
      return {
        setDisplayName(value: unknown) {
          if (context.options().disabled === true) {
            return false;
          }
          return change("displayName", text(value), { reason: "input-change" });
        },
        setLabels(value: unknown) {
          if (
            !(
              isUnknownArray(value) &&
              value.every((label) => isDraftLabel(label))
            ) ||
            new Set(value.map((label) => label.id)).size !== value.length
          ) {
            throw new Error(
              "Labels need unique ids and text key/value fields."
            );
          }
          if (context.options().disabled === true) {
            return false;
          }
          return change(
            "labels",
            value.map(({ id, key, value: labelValue }) => ({
              id,
              key,
              value: labelValue,
            })),
            { reason: "input-change" }
          );
        },
        setSslMode(value: unknown) {
          if (context.options().disabled === true) {
            return false;
          }
          return change("sslMode", text(value), { reason: "item-press" });
        },
        setSslNegotiation(value: unknown) {
          if (context.options().disabled === true) {
            return false;
          }
          return change("sslNegotiation", text(value), {
            reason: "item-press",
          });
        },
      };
    },
    slots: (slot) => ({
      root: slot({
        role: "group",
        attrs: (state) => ({
          "data-querylane-agent-draft": "",
          "aria-disabled": state.disabled ? "true" : undefined,
        }),
      }),
    }),
    agent: {
      actions: [
        "setDisplayName",
        "setLabels",
        "setSslMode",
        "setSslNegotiation",
      ],
    },
  }),
  { options: optionsSchema }
);

function agentDraftChangeError(
  current: InstanceDraftValue,
  key: DraftKey,
  next: unknown
): string | null {
  const proposed = { ...current, [key]: next };
  if (!isInstanceDraftValue(proposed)) {
    return "The proposed draft field has an invalid shape.";
  }
  if (key === "displayName" && !proposed.displayName.trim()) {
    return "The instance display name cannot be empty.";
  }
  if (key === "labels" && proposed.labels.some((label) => !label.key.trim())) {
    return "Agent label edits need non-empty label keys.";
  }
  if (key === "sslMode" || key === "sslNegotiation") {
    return invalidDraftTls(proposed);
  }
  return null;
}

function invalidDraftTls(proposed: InstanceDraftValue) {
  if (
    !(
      getSslModeOption(proposed.sslMode) &&
      getSslNegotiationOption(proposed.sslNegotiation)
    )
  ) {
    return "Choose a supported TLS setting.";
  }
  if (
    proposed.sslNegotiation === "direct" &&
    !isDirectSslNegotiationMode(proposed.sslMode)
  ) {
    return "Direct SSL negotiation requires SSL mode require or stronger.";
  }
  return null;
}

export type { DraftKey, InstanceDraftOptions, InstanceDraftValue };
export { agentDraftChangeError, DRAFT_KEYS, instanceDraft };
