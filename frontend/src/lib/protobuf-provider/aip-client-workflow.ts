import type { Operation } from "@buf/googleapis_googleapis.bufbuild_es/google/longrunning/operations_pb.js";
import { RetryInfoSchema } from "@buf/googleapis_googleapis.bufbuild_es/google/rpc/error_details_pb.js";
import type { Status } from "@buf/googleapis_googleapis.bufbuild_es/google/rpc/status_pb.js";
import type { DescMethod } from "@bufbuild/protobuf";
import { MethodOptions_IdempotencyLevel } from "@bufbuild/protobuf/wkt";
import { Code, ConnectError } from "@connectrpc/connect";

const ALPHA_VERSION_PATTERN = /(?:^|\.)v\d+alpha\d+(?:\.|$)/u;
const BETA_VERSION_PATTERN = /(?:^|\.)v\d+beta\d+(?:\.|$)/u;

export interface ProtoOperationRunner {
  cancel?: (name: string) => Promise<void>;
  onProgress?: (operation: Operation) => void;
  poll: (name: string, signal: AbortSignal) => Promise<Operation>;
  pollIntervalMs?: number;
  signal?: AbortSignal;
  sleep?: (delayMs: number, signal: AbortSignal) => Promise<void>;
  start: (signal: AbortSignal) => Promise<Operation>;
}

export class ProtoOperationError extends Error {
  readonly status: Status;

  constructor(status: Status) {
    super(status.message || `Operation failed with status ${status.code}.`);
    this.name = "ProtoOperationError";
    this.status = status;
  }
}

function abortError(): DOMException {
  return new DOMException("The operation was aborted.", "AbortError");
}

function defaultSleep(delayMs: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(abortError());
      return;
    }
    function handleAbort() {
      clearTimeout(timeout);
      reject(abortError());
    }
    const timeout = setTimeout(() => {
      signal.removeEventListener("abort", handleAbort);
      resolve();
    }, delayMs);
    signal.addEventListener("abort", handleAbort, { once: true });
  });
}

function requireActive(signal: AbortSignal): void {
  if (signal.aborted) {
    throw abortError();
  }
}

function finishOperation(operation: Operation): Operation {
  if (operation.result.case === "error") {
    throw new ProtoOperationError(operation.result.value);
  }
  if (operation.result.case !== "response") {
    throw new Error("A completed operation must contain a response or error.");
  }
  return operation;
}

async function pollUntilDone(
  operation: Operation,
  poll: ProtoOperationRunner["poll"],
  sleep: NonNullable<ProtoOperationRunner["sleep"]>,
  pollIntervalMs: number,
  signal: AbortSignal,
  onProgress?: ProtoOperationRunner["onProgress"]
): Promise<Operation> {
  let current = operation;
  while (!current.done) {
    if (!current.name) {
      throw new Error("An incomplete operation must have a name for polling.");
    }
    await sleep(pollIntervalMs, signal);
    requireActive(signal);
    current = await poll(current.name, signal);
    onProgress?.(current);
  }
  return current;
}

export async function runProtoOperation({
  cancel,
  onProgress,
  poll,
  pollIntervalMs = 1000,
  signal = new AbortController().signal,
  sleep = defaultSleep,
  start,
}: ProtoOperationRunner): Promise<Operation> {
  let operationName: string | undefined;
  try {
    requireActive(signal);
    const operation = await start(signal);
    operationName = operation.name || undefined;
    onProgress?.(operation);
    const completed = await pollUntilDone(
      operation,
      poll,
      sleep,
      pollIntervalMs,
      signal,
      onProgress
    );
    return finishOperation(completed);
  } catch (error) {
    if (signal.aborted && operationName && cancel) {
      await cancel(operationName);
    }
    throw error;
  }
}

export type ProtoRetryReason =
  | "non-retryable-code"
  | "streaming"
  | "transient"
  | "unsafe";

export interface ProtoRetryDecision {
  delayMs?: number;
  reason: ProtoRetryReason;
  retry: boolean;
}

function getRetryDelayMs(error: ConnectError): number | undefined {
  const delay = error.findDetails(RetryInfoSchema)[0]?.retryDelay;
  if (!delay) {
    return undefined;
  }
  return Math.max(0, Number(delay.seconds) * 1000 + delay.nanos / 1e6);
}

export function getProtoRetryDecision(
  method: DescMethod,
  reason: unknown
): ProtoRetryDecision {
  if (method.methodKind !== "unary") {
    return { reason: "streaming", retry: false };
  }
  if (
    method.idempotency !== MethodOptions_IdempotencyLevel.NO_SIDE_EFFECTS &&
    method.idempotency !== MethodOptions_IdempotencyLevel.IDEMPOTENT
  ) {
    return { reason: "unsafe", retry: false };
  }
  const error = ConnectError.from(reason);
  if (error.code !== Code.Unavailable) {
    return { reason: "non-retryable-code", retry: false };
  }
  const delayMs = getRetryDelayMs(error);
  return delayMs === undefined
    ? { reason: "transient", retry: true }
    : { delayMs, reason: "transient", retry: true };
}

export interface ProtoPartialResultRecovery {
  label: string;
  resourceName: string;
}

export interface ProtoPartialResult {
  complete: boolean;
  recovery: readonly ProtoPartialResultRecovery[];
  unreachable: readonly string[];
  warning?: string;
}

function resourceLabel(resourceName: string): string {
  const segments = resourceName.split("/");
  return segments.at(-1) || resourceName;
}

export function getProtoPartialResult(response: {
  unreachable?: unknown;
}): ProtoPartialResult {
  const unreachable = Array.isArray(response.unreachable)
    ? response.unreachable.filter(
        (value): value is string => typeof value === "string" && value !== ""
      )
    : [];
  if (unreachable.length === 0) {
    return { complete: true, recovery: [], unreachable: [] };
  }
  const noun = unreachable.length === 1 ? "resource" : "resources";
  return {
    complete: false,
    recovery: unreachable.map((resourceName) => ({
      label: `Retry ${resourceLabel(resourceName)}`,
      resourceName,
    })),
    unreachable,
    warning: `Some results are unavailable from ${unreachable.length} ${noun}.`,
  };
}

export interface ProtoPurgePlan {
  confirmationRequired: boolean;
  count: number;
  mode: "execute" | "preview";
  sample: readonly string[];
  warning: string;
}

export function getProtoPurgePlan(
  request: { filter: string; force: boolean },
  response: { purgeCount: number; purgeSample: readonly string[] }
): ProtoPurgePlan {
  if (!request.filter) {
    throw new Error("A purge plan requires a filter.");
  }
  return {
    confirmationRequired: request.force,
    count: response.purgeCount,
    mode: request.force ? "execute" : "preview",
    sample: response.purgeSample,
    warning: request.force
      ? "This permanently deletes every resource matching the filter."
      : "Preview only. No resources will be deleted.",
  };
}

export type ProtoPolicyPreviewAction =
  | "commit"
  | "start-preview"
  | "stop-preview";

export interface ProtoPolicyPreviewPlan {
  action: ProtoPolicyPreviewAction;
  confirmationRequired: boolean;
  enforcesPolicy: boolean;
  notice: string;
}

export function getProtoPolicyPreviewPlan(
  action: ProtoPolicyPreviewAction
): ProtoPolicyPreviewPlan {
  switch (action) {
    case "start-preview":
      return {
        action,
        confirmationRequired: false,
        enforcesPolicy: false,
        notice:
          "Preview compares the experiment with live traffic without enforcing it.",
      };
    case "stop-preview":
      return {
        action,
        confirmationRequired: false,
        enforcesPolicy: false,
        notice: "Stopping preview does not change the live policy.",
      };
    case "commit":
      return {
        action,
        confirmationRequired: true,
        enforcesPolicy: true,
        notice: "Commit replaces the live policy and deletes the experiment.",
      };
    default:
      throw new Error(
        `Unsupported policy preview action: ${action satisfies never}`
      );
  }
}

export type ProtoStabilityLevel = "alpha" | "beta" | "deprecated" | "stable";

export interface ProtoStability {
  guidance?: string;
  level: ProtoStabilityLevel;
  preview: boolean;
}

export interface ProtoStabilityDescriptor {
  deprecated: boolean;
  typeName: string;
}

export function getProtoStability({
  deprecated,
  typeName,
}: ProtoStabilityDescriptor): ProtoStability {
  if (deprecated) {
    return {
      guidance:
        "Deprecated: migrate before the documented support period ends.",
      level: "deprecated",
      preview: false,
    };
  }
  if (ALPHA_VERSION_PATTERN.test(typeName)) {
    return {
      guidance: "Alpha preview: breaking changes are expected.",
      level: "alpha",
      preview: true,
    };
  }
  if (BETA_VERSION_PATTERN.test(typeName)) {
    return {
      guidance: "Beta preview: changes remain possible before stability.",
      level: "beta",
      preview: true,
    };
  }
  return { level: "stable", preview: false };
}
