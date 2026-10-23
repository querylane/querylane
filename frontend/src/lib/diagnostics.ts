type LogValue = string | number | boolean | bigint | null | undefined;
type LogPayload = Record<string, unknown> | undefined;

interface DiagnosticLogger {
  debug: (message: string, payload?: LogPayload) => void;
  error: (message: string, payload?: LogPayload) => void;
  fmt: (strings: readonly string[], ...values: LogValue[]) => string;
  info: (message: string, payload?: LogPayload) => void;
  trace: (message: string, payload?: LogPayload) => void;
  warn: (message: string, payload?: LogPayload) => void;
}

function ignoreLog(_message: string, _payload?: LogPayload): null {
  return null;
}

const logger: DiagnosticLogger = {
  debug: ignoreLog,
  error: ignoreLog,
  fmt: (strings: readonly string[], ...values: LogValue[]) =>
    strings.reduce(
      (result, part, index) => result + part + String(values[index] ?? ""),
      ""
    ),
  info: ignoreLog,
  trace: ignoreLog,
  warn: ignoreLog,
};

function captureException(error: unknown, _context?: Record<string, unknown>) {
  globalThis.reportError?.(error);
}

export type { DiagnosticLogger };
export { captureException, logger };
