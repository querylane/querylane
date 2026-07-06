"use client";

import { Check, Copy } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const COPY_FEEDBACK_TIMEOUT_MS = 1500;

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
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setCopied(false);
    }, COPY_FEEDBACK_TIMEOUT_MS);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [copied]);

  const handleClick = async () => {
    if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
      return;
    }

    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      // Ignore clipboard failures and keep the action non-blocking.
    }
  };

  const content = children ?? (copied ? <Check className="size-3 text-success" /> : <Copy className="size-3" />);

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            aria-label={ariaLabel}
            className={className}
            data-copied={copied ? "true" : "false"}
            onClick={handleClick}
            size={size}
            type="button"
            variant={variant}
          />
        }
      >
        {content}
      </TooltipTrigger>
      <TooltipContent>{copied ? copiedLabel : ariaLabel}</TooltipContent>
    </Tooltip>
  );
}

export { CopyIconButton };
