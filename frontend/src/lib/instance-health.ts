import { anyUnpack, timestampDate } from "@bufbuild/protobuf/wkt";
import { ErrorInfoSchema } from "@/protogen/google/rpc/error_details_pb";
import type { Status } from "@/protogen/google/rpc/status_pb";

const METRIC_KEYS = ["connections", "storage", "cache", "io"] as const;

type MetricKey = (typeof METRIC_KEYS)[number];
type MetricPartialErrors = Partial<Record<MetricKey, Status>>;

function isMetricKey(value: string | undefined): value is MetricKey {
  return METRIC_KEYS.some((key) => key === value);
}

function getMetricFromMessage(message: string): MetricKey | undefined {
  const normalizedMessage = message.toLowerCase().replaceAll(/[^a-z0-9]/g, "");
  return METRIC_KEYS.find((key) => normalizedMessage.includes(key));
}

function formatConnectionCheckLabel(
  timestamp: Parameters<typeof timestampDate>[0] | null | undefined
): string | null {
  if (!timestamp) {
    return null;
  }

  try {
    return `Last checked ${new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(timestampDate(timestamp))}`;
  } catch {
    return null;
  }
}

function getMetricPartialErrors(partialErrors: Status[]): MetricPartialErrors {
  const errors: MetricPartialErrors = {};

  for (const partialError of partialErrors) {
    const messageMetric = getMetricFromMessage(partialError.message);
    if (messageMetric) {
      errors[messageMetric] = partialError;
    }

    for (const detail of partialError.details) {
      let errorInfo: ReturnType<typeof anyUnpack<typeof ErrorInfoSchema>>;
      try {
        errorInfo = anyUnpack(detail, ErrorInfoSchema);
      } catch {
        errorInfo = undefined;
      }
      const metric = errorInfo?.metadata["metric"];
      if (isMetricKey(metric)) {
        errors[metric] = partialError;
      }
    }
  }

  return errors;
}

export type { MetricPartialErrors };
export { formatConnectionCheckLabel, getMetricPartialErrors };
