import { createContext, useContext } from "react";
import { isRecord } from "@/lib/value-guards";

interface BaseUiSafetyProps {
  "data-agent-confirm"?: string | undefined;
  "data-agent-hidden"?: boolean | string | undefined;
  "data-agent-secret"?: boolean | string | undefined;
}
const BaseUiAnchorContext = createContext<
  ((element: HTMLElement | null) => undefined | (() => void)) | undefined
>(undefined);
function useBaseUiAnchor() {
  return useContext(BaseUiAnchorContext);
}

const BaseUiModalContext = createContext(false);
const BaseUiSafetyContext = createContext<BaseUiSafetyProps>({});
function marked(value: unknown) {
  return value !== undefined && value !== false && value !== "false";
}
function readSafety(props: unknown): BaseUiSafetyProps {
  if (!isRecord(props)) {
    return {};
  }
  return {
    "data-agent-hidden": marked(props["data-agent-hidden"]) || undefined,
    "data-agent-secret": marked(props["data-agent-secret"]) || undefined,
    "data-agent-confirm":
      typeof props["data-agent-confirm"] === "string"
        ? props["data-agent-confirm"]
        : undefined,
  };
}
function useBaseUiSafety(props?: unknown): BaseUiSafetyProps {
  const inherited = useContext(BaseUiSafetyContext);
  const own = readSafety(props);
  return {
    "data-agent-hidden":
      marked(inherited["data-agent-hidden"]) ||
      marked(own["data-agent-hidden"]) ||
      undefined,
    "data-agent-secret":
      marked(inherited["data-agent-secret"]) ||
      marked(own["data-agent-secret"]) ||
      undefined,
    "data-agent-confirm":
      inherited["data-agent-confirm"] ?? own["data-agent-confirm"],
  };
}

function baseUiModal(markers: unknown, fallback: boolean) {
  return isRecord(markers) && markers["modal"] !== undefined
    ? markers["modal"] !== false
    : fallback;
}
function useBaseUiModal() {
  return useContext(BaseUiModalContext);
}

export {
  BaseUiAnchorContext,
  BaseUiModalContext,
  BaseUiSafetyContext,
  type BaseUiSafetyProps,
  baseUiModal,
  useBaseUiAnchor,
  useBaseUiModal,
  useBaseUiSafety,
};
