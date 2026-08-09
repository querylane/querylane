import { Code, ConnectError } from "@connectrpc/connect";

export function toConnectError(error: unknown): ConnectError {
  return ConnectError.from(error);
}

/**
 * The backend rejects SetupAppDatabase / WatchConfigChanges with
 * FailedPrecondition once the app database is initialized. For onboarding
 * flows that means: setup already finished (possibly in the background),
 * which callers should treat as success, not as an error.
 */
export function isAlreadyConfigured(connectError: ConnectError): boolean {
  return (
    connectError.code === Code.FailedPrecondition &&
    connectError.rawMessage.toLowerCase().includes("already configured")
  );
}
