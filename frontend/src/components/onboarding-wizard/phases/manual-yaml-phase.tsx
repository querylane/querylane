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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useOnboardingWizardStore } from "@/stores/onboarding-wizard-store";
import { useSetupStore } from "@/stores/setup-store";

const COPY_RESET_DELAY_MS = 1500;

const writeClipboard = async (value: string) => {
  if (!navigator.clipboard) {
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
      const timer = window.setTimeout(
        () => setCopyState("idle"),
        COPY_RESET_DELAY_MS
      );
      return () => window.clearTimeout(timer);
    },
    [copyState]
  );
  useEffect(
    function resetPathCopyFeedback() {
      if (pathCopyState === "idle") {
        return;
      }
      const timer = window.setTimeout(
        () => setPathCopyState("idle"),
        COPY_RESET_DELAY_MS
      );
      return () => window.clearTimeout(timer);
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
            className="h-10 rounded-xl border-white/10 px-4 text-sm text-white/78 hover:bg-white/[0.04] hover:text-white"
            onClick={goBackToMethodSelection}
            variant="ghost"
          >
            <ArrowLeft className="size-4" />
            Back
          </Button>
          <Button
            className="h-10 rounded-xl bg-white px-4 font-medium text-[#11151f] text-sm hover:bg-white/90"
            onClick={startProgress}
          >
            Continue
            <ChevronRight className="size-4" />
          </Button>
        </div>
      }
      title="YAML Configuration"
      titleBadge={
        <Badge
          className="border-emerald-400/28 bg-emerald-500/10 px-3 py-1 text-emerald-200 text-xs"
          variant="outline"
        >
          Recommended for file-based setups
        </Badge>
      }
    >
      <div className="space-y-5">
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <div className="font-medium text-base text-white/84">
            Default path
          </div>
          <div className="mt-3 flex items-center gap-3 rounded-xl border border-white/8 bg-[#080b12] px-4 py-3">
            <span className="flex-1 font-mono text-sm text-white/92 md:text-base">
              {configFilePath}
            </span>
            <Button
              aria-label="Copy config file path"
              className="h-8 shrink-0 rounded-lg border-white/10 px-3 text-white/68 text-xs hover:bg-white/[0.06] hover:text-white"
              onClick={copyPath}
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
          <p className="mt-3 text-sm text-white/54 leading-6">
            Override with{" "}
            <code className="rounded bg-white/[0.06] px-2 py-1 text-white/72">
              {"--config <path>"}
            </code>{" "}
            or{" "}
            <code className="rounded bg-white/[0.06] px-2 py-1 text-white/72">
              QUERYLANE_CONFIG
            </code>
            .
          </p>
        </div>

        <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
          <div className="flex items-center justify-between border-white/8 border-b px-5 py-4">
            <div className="font-medium text-lg text-white">config.yaml</div>
            <Button
              className="h-9 rounded-lg border-white/10 px-3 text-sm text-white/78 hover:bg-white/[0.05] hover:text-white"
              onClick={async () => {
                try {
                  await writeClipboard(configPreview);
                  setCopyState("copied");
                } catch {
                  setCopyState("idle");
                }
              }}
              variant="ghost"
            >
              {copyState === "copied" ? (
                <Check className="size-4" />
              ) : (
                <Copy className="size-4" />
              )}
              {copyState === "copied" ? "Copied" : "Copy"}
            </Button>
          </div>
          <pre className="overflow-x-auto p-5 font-mono text-sm text-white/84 leading-7">
            <code data-testid="manual-yaml-config-preview">
              {configPreview}
            </code>
          </pre>
        </div>

        <div className="rounded-2xl border border-[#4d72d8]/24 bg-[#0d1324] px-4 py-3 text-sm text-white/70 leading-6">
          Querylane will begin watching the configured path on step 3. Once the
          file is saved, it will validate the contents and continue setup
          automatically.
        </div>
      </div>
    </WizardPage>
  );
}
