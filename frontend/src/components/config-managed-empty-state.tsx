import { FileText } from "lucide-react";
import { useEffect, useState } from "react";
import {
  buildConfigManagedInstanceSnippet,
  DEFAULT_CONFIG_FILE_PATH,
} from "@/components/config-managed-guidance";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { handleAsyncAction } from "@/lib/ui-action";

const COPY_FEEDBACK_RESET_MS = 2000;

interface ConfigManagedEmptyStateProps {
  configFilePath?: string | undefined;
  variant?: "inline" | "fullscreen";
}

export function ConfigManagedEmptyState({
  configFilePath = DEFAULT_CONFIG_FILE_PATH,
  variant = "inline",
}: ConfigManagedEmptyStateProps) {
  const [copyState, setCopyState] = useState<"copied" | "error" | "idle">(
    "idle"
  );
  const snippet = buildConfigManagedInstanceSnippet(configFilePath);
  useEffect(
    function resetCopyStateFeedback(): (() => void) | undefined {
      if (copyState === "idle") {
        return undefined;
      }
      const resetTimer = globalThis.window.setTimeout(() => {
        setCopyState("idle");
      }, COPY_FEEDBACK_RESET_MS);
      return () => {
        globalThis.window.clearTimeout(resetTimer);
      };
    },
    [copyState]
  );
  const emptyState = (
    <EmptyState
      action={
        <div className="flex flex-col items-center gap-3">
          <code className="rounded-md bg-muted px-2.5 py-1 font-mono text-xs text-muted-foreground">
            {configFilePath}
          </code>
          <Button
            onClick={handleAsyncAction(async () => {
              if (!Boolean(navigator.clipboard)) {
                setCopyState("error");
                return;
              }

              try {
                await navigator.clipboard.writeText(snippet);
                setCopyState("copied");
              } catch {
                setCopyState("error");
              }
            })}
            size="sm"
            type="button"
            variant="outline"
          >
            Copy YAML snippet
          </Button>
          {copyState === "copied" ? (
            <span className="text-xs text-muted-foreground">
              Copied YAML snippet.
            </span>
          ) : null}
          {copyState === "error" ? (
            <span className="text-xs text-destructive" role="alert">
              Could not copy YAML snippet.
            </span>
          ) : null}
        </div>
      }
      description="Instances are managed via the server configuration file. Add an instance block, then restart the server to see it here."
      icon={FileText}
      title="No instances configured"
    />
  );

  if (variant === "fullscreen") {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background p-6">
        <div className="w-full max-w-lg">{emptyState}</div>
      </div>
    );
  }

  return emptyState;
}
