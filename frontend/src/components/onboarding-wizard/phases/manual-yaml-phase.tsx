import {
  ArrowLeft,
  Check,
  ChevronRight,
  ClipboardCopy,
  Copy,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useOnboardingWizardControllerContext } from "@/components/onboarding-wizard/hooks/use-onboarding-wizard-controller-context";
import { buildConfigPreview } from "@/components/onboarding-wizard/phases/manual-yaml-config-preview";
import { WizardPage } from "@/components/onboarding-wizard/shared/wizard-page";
import { Badge } from "@/components/querylane-ui/badge";
import { Button } from "@/components/querylane-ui/button";
import { handleAsyncAction } from "@/lib/ui-action";
import { useOnboardingWizardStore } from "@/stores/onboarding-wizard-store";
import { useSetupStore } from "@/stores/setup-store";

const COPY_RESET_DELAY_MS = 1500;

const writeClipboard = async (value: string) => {
  if (!Boolean(navigator.clipboard)) {
    throw new Error("Clipboard unavailable");
  }
  await navigator.clipboard.writeText(value);
};

export function ManualYamlPhase() {
  const onboardingState = useSetupStore((state) => state.onboardingState);
  const startProgress = useOnboardingWizardStore(
    (state) => state.startProgress
  );
  const { goBackToMethodSelection } = useOnboardingWizardControllerContext();
  const configFilePath =
    onboardingState?.configFilePath ?? "~/.querylane/config.yaml";
  const [copyState, setCopyState] = useState<"copied" | "idle">("idle");
  const [pathCopyState, setPathCopyState] = useState<"copied" | "idle">("idle");
  const configPreview = buildConfigPreview(configFilePath);
  useEffect(
    function resetCopyFeedback() {
      if (copyState === "idle") {
        return;
      }
      const timer = globalThis.window.setTimeout(() => {
        setCopyState("idle");
      }, COPY_RESET_DELAY_MS);
      return () => {
        globalThis.window.clearTimeout(timer);
      };
    },
    [copyState]
  );
  useEffect(
    function resetPathCopyFeedback() {
      if (pathCopyState === "idle") {
        return;
      }
      const timer = globalThis.window.setTimeout(() => {
        setPathCopyState("idle");
      }, COPY_RESET_DELAY_MS);
      return () => {
        globalThis.window.clearTimeout(timer);
      };
    },
    [pathCopyState]
  );
  const copyPath = async () => {
    try {
      await writeClipboard(configFilePath);
      setPathCopyState("copied");
    } catch {
      setPathCopyState("idle");
    }
  };
  return (
    <WizardPage
      description="Create the config file with your PostgreSQL connection details. Querylane watches this file and picks up changes automatically."
      footer={
        <div className="flex items-center justify-between gap-4">
          <Button
            className="h-9"
            onClick={goBackToMethodSelection}
            presentation="onboarding-secondary"
            variant="ghost"
          >
            <ArrowLeft className="size-4" />
            Back
          </Button>
          <Button
            className="h-9"
            onClick={startProgress}
            presentation="onboarding-primary"
          >
            Continue
            <ChevronRight className="size-4" />
          </Button>
        </div>
      }
      title="YAML Configuration"
      titleBadge={
        <Badge presentation="onboarding-success" variant="outline">
          Recommended for file-based setups
        </Badge>
      }
    >
      <div className="space-y-5">
        <div className="rounded-xl border border-white/10 bg-white/3 p-4">
          <div className="text-base font-medium text-white/84">
            Default path
          </div>
          <div className="bg-onboarding-preview mt-3 flex items-center gap-3 rounded-xl border border-white/8 px-4 py-3">
            <span className="min-w-0 flex-1 font-mono text-xs break-all text-white/92">
              {configFilePath}
            </span>
            <Button
              aria-label="Copy config file path"
              className="h-8 shrink-0"
              onClick={handleAsyncAction(copyPath)}
              presentation="onboarding-copy"
              variant="ghost"
            >
              {pathCopyState === "copied" ? (
                <Check className="size-3.5" />
              ) : (
                <ClipboardCopy className="size-3.5" />
              )}
              {pathCopyState === "copied" ? "Copied" : "Copy path"}
            </Button>
          </div>
          <p className="mt-3 text-sm leading-6 text-white/54">
            Override with{" "}
            <code className="rounded bg-white/6 px-1.5 py-0.5 text-xs text-white/72">
              {"--config <path>"}
            </code>{" "}
            or{" "}
            <code className="rounded bg-white/6 px-1.5 py-0.5 text-xs text-white/72">
              QUERYLANE_CONFIG
            </code>
            .
          </p>
        </div>

        <div className="overflow-hidden rounded-xl border border-white/10 bg-white/3">
          <div className="flex items-center justify-between border-b border-white/8 px-5 py-4">
            <div className="text-base font-medium text-white">config.yaml</div>
            <Button
              className="h-8"
              onClick={handleAsyncAction(async () => {
                try {
                  await writeClipboard(configPreview);
                  setCopyState("copied");
                } catch {
                  setCopyState("idle");
                }
              })}
              presentation="onboarding-download"
              variant="ghost"
            >
              {copyState === "copied" ? (
                <Check className="size-3.5" />
              ) : (
                <Copy className="size-3.5" />
              )}
              {copyState === "copied" ? "Copied" : "Copy"}
            </Button>
          </div>
          <pre className="overflow-x-auto p-4 font-mono text-xs leading-6 text-white/84">
            <code data-testid="manual-yaml-config-preview">
              {configPreview}
            </code>
          </pre>
        </div>

        <div className="border-onboarding-accent/24 bg-onboarding-detail rounded-xl border px-4 py-3 text-sm leading-6 text-white/70">
          Querylane will begin watching the configured path on step 3. Once the
          file is saved, it will validate the contents and continue setup
          automatically.
        </div>
      </div>
    </WizardPage>
  );
}
