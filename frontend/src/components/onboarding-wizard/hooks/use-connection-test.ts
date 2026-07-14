import { ConnectError } from "@connectrpc/connect";
import { useEffect, useRef, useState } from "react";

import { useTestInstanceConnectionMutation } from "@/hooks/api/instance";
import {
  buildTestInstanceConnectionRequest,
  getPostgresConfigFingerprint,
} from "@/lib/instance-connection";
import type { PostgresConfig } from "@/protogen/querylane/console/v1alpha1/instance_pb";

type ConnectionTestStatus = "error" | "idle" | "success" | "testing";

const SUCCESS_DISPLAY_MS = 4000;

export function useConnectionTest() {
  const [status, setStatus] = useState<ConnectionTestStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [verifiedConnectionFingerprint, setVerifiedConnectionFingerprint] =
    useState<string | null>(null);
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const testInstanceConnectionMutation = useTestInstanceConnectionMutation();

  useEffect(function clearSuccessTimerOnUnmount() {
    return () => {
      if (successTimerRef.current) {
        clearTimeout(successTimerRef.current);
      }
    };
  }, []);

  const testConnection = async (config: PostgresConfig) => {
    if (successTimerRef.current) {
      clearTimeout(successTimerRef.current);
      successTimerRef.current = null;
    }

    setStatus("testing");
    setErrorMessage(null);

    try {
      await testInstanceConnectionMutation.mutateAsync(
        buildTestInstanceConnectionRequest(config)
      );
      setVerifiedConnectionFingerprint(getPostgresConfigFingerprint(config));
      setStatus("success");
      successTimerRef.current = setTimeout(() => {
        setStatus("idle");
        successTimerRef.current = null;
      }, SUCCESS_DISPLAY_MS);
    } catch (error) {
      let message = "Connection test failed";
      if (error instanceof ConnectError) {
        message = error.rawMessage;
      } else if (error instanceof Error) {
        ({ message } = error);
      }
      setStatus("error");
      setErrorMessage(message);
      setVerifiedConnectionFingerprint(null);
    }
  };

  const resetTest = () => {
    if (successTimerRef.current) {
      clearTimeout(successTimerRef.current);
      successTimerRef.current = null;
    }
    setStatus("idle");
    setErrorMessage(null);
    setVerifiedConnectionFingerprint(null);
  };

  return {
    errorMessage,
    getConnectionFingerprint: getPostgresConfigFingerprint,
    resetTest,
    status,
    testConnection,
    verifiedConnectionFingerprint,
  };
}

export type { ConnectionTestStatus };
