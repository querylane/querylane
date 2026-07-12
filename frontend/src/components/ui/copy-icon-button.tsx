"use client";

import { Check, Copy, TriangleAlert } from "lucide-react";
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
      return;
    }

    const timeout = window.setTimeout(() => {
      setCopyState("idle");
    }, COPY_FEEDBACK_TIMEOUT_MS);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [copyState]);

  const handleClick = async () => {
    if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
      setCopyState("failed");
      return;
    }

    try {
      await navigator.clipboard.writeText(value);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  };

  const stateLabel =
    copyState === "copied"
      ? copiedLabel
      : copyState === "failed"
        ? "Copy failed"
        : ariaLabel;
  let content = children ?? <Copy className="size-3" />;
  if (copyState === "copied") {
    content = (
      <>
        <Check className="size-3 text-success" />
        {children ? copiedLabel : null}
      </>
    );
  } else if (copyState === "failed") {
    content = (
      <>
        <TriangleAlert className="size-3 text-destructive" />
        {children ? "Copy failed" : null}
      </>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            aria-label={stateLabel}
            className={className}
            data-copy-state={copyState}
            onClick={handleClick}
            size={size}
            type="button"
            variant={variant}
          />
        }
      >
        {content}
      </TooltipTrigger>
      <TooltipContent>{stateLabel}</TooltipContent>
    </Tooltip>
  );
}

export { CopyIconButton };
