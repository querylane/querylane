import { Check, Copy, TriangleExclamationPoint } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const COPY_FEEDBACK_TIMEOUT_MS = 1500;
type CopyState = "copied" | "failed" | "idle";

interface CopyIconButtonProps {
  ariaLabel: string;
  children?: ReactNode;
  className?: string;
  copiedLabel?: string;
  size?: "icon-xs" | "icon-sm" | "icon" | "sm";
  value: string;
  variant?: "ghost" | "outline";
}

async function copyText(value: string) {
  try {
    await globalThis.navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
}
function copyLabel(
  state: CopyState,
  labels: { ariaLabel: string; copiedLabel: string }
) {
  if (state === "copied") {
    return labels.copiedLabel;
  }
  return state === "failed" ? "Copy failed" : labels.ariaLabel;
}
function CopyFeedback({
  state,
  children,
  copiedLabel,
}: {
  state: CopyState;
  children?: ReactNode;
  copiedLabel: string;
}) {
  if (state === "idle") {
    return children ?? <Copy className="size-3" />;
  }
  const Icon = state === "copied" ? Check : TriangleExclamationPoint;
  const label = state === "copied" ? copiedLabel : "Copy failed";
  return (
    <>
      <Icon
        className={
          state === "copied" ? "size-3 text-success" : "size-3 text-destructive"
        }
      />
      {Boolean(children) ? label : null}
    </>
  );
}

function CopyIconButton({
  ariaLabel,
  children,
  className,
  copiedLabel = "Copied",
  size = "icon-xs",
  value,
  variant = "ghost",
}: CopyIconButtonProps) {
  const [copyState, setCopyState] = useState<CopyState>("idle");

  useEffect(() => {
    if (copyState === "idle") {
      return undefined;
    }

    const timeout = globalThis.setTimeout(() => {
      setCopyState("idle");
    }, COPY_FEEDBACK_TIMEOUT_MS);

    return () => {
      globalThis.clearTimeout(timeout);
    };
  }, [copyState]);

  const handleCopyText = async () => {
    const copied = await copyText(value);
    setCopyState(copied ? "copied" : "failed");
  };
  const stateLabel = copyLabel(copyState, { ariaLabel, copiedLabel });
  const content = (
    <CopyFeedback copiedLabel={copiedLabel} state={copyState}>
      {children}
    </CopyFeedback>
  );

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            aria-label={stateLabel}
            className={className}
            data-copy-state={copyState}
            onClick={handleCopyText}
            size={size}
            type="button"
            variant={variant}
          />
        }
      >
        {content}
      </TooltipTrigger>
      <TooltipContent align={Boolean(children) ? "center" : "end"}>
        {stateLabel}
      </TooltipContent>
    </Tooltip>
  );
}

export { CopyIconButton };
