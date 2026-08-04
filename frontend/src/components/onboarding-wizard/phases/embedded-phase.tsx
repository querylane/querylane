import { create as createProto } from "@bufbuild/protobuf";
import { AlertTriangle, ArrowLeft, ChevronRight } from "lucide-react";
import { useOnboardingWizardControllerContext } from "@/components/onboarding-wizard/hooks/use-onboarding-wizard-controller-context";
import { WizardPage } from "@/components/onboarding-wizard/shared/wizard-page";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { EmbeddedSetupConfigSchema } from "@/protogen/querylane/console/v1alpha1/onboarding_pb";
import { useOnboardingWizardStore } from "@/stores/onboarding-wizard-store";
import { useSetupStore } from "@/stores/setup-store";

export function EmbeddedPhase() {
  const onboardingState = useSetupStore((state) => state.onboardingState);
  const startProgress = useOnboardingWizardStore(
    (state) => state.startProgress
  );
  const setSubmittedEmbeddedConfig = useOnboardingWizardStore(
    (state) => state.setSubmittedEmbeddedConfig
  );
  const { goBackToMethodSelection } = useOnboardingWizardControllerContext();
  const embeddedDataPath =
    onboardingState?.embeddedDataPath ?? "~/.querylane/pgdata";
  // Embedded setup is normally only offered when the home directory is
  // writable; treat a non-writable home defensively as "no persistence".
  const persistenceAvailable = onboardingState?.isHomeWritable ?? true;
  const handleContinue = () => {
    setSubmittedEmbeddedConfig(
      createProto(EmbeddedSetupConfigSchema, {
        mode: persistenceAvailable ? "persistent" : "ephemeral",
      })
    );
    startProgress();
  };
  return (
    <WizardPage
      description="Run a Querylane-managed embedded PostgreSQL instance locally. Querylane will start it, initialize the metadata schema, and persist the configuration for later boots."
      footer={
        <div className="flex items-center justify-between gap-4">
          <Button
            className="h-9 rounded-lg border-white/10 px-4 text-sm text-white/78 hover:bg-white/[0.04] hover:text-white"
            onClick={goBackToMethodSelection}
            variant="ghost"
          >
            <ArrowLeft className="size-4" />
            Back
          </Button>
          <Button
            className="h-9 rounded-lg bg-white px-4 font-medium text-[#11151f] text-sm hover:bg-white/90"
            onClick={handleContinue}
          >
            Continue
            <ChevronRight className="size-4" />
          </Button>
        </div>
      }
      title="Embedded PostgreSQL"
    >
      <div className="space-y-4">
        {persistenceAvailable ? null : (
          <Alert
            className="border-amber-400/25 bg-amber-500/[0.08]"
            role="alert"
          >
            <AlertTriangle className="text-amber-400" />
            <AlertTitle className="text-amber-100">
              Data will not persist
            </AlertTitle>
            <AlertDescription className="text-amber-100/75">
              Querylane cannot write to {embeddedDataPath}, so the embedded
              database will run in ephemeral mode: all metadata, saved
              connections, and query history are lost on shutdown. Fix the
              directory permissions to enable persistent storage.
            </AlertDescription>
          </Alert>
        )}

        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <div className="grid gap-4 text-sm text-white/62 md:grid-cols-[200px_minmax(0,1fr)]">
            <div>Storage</div>
            <div className="text-white/88">
              {persistenceAvailable
                ? "Persistent: data is kept across restarts"
                : "Ephemeral: data is cleared on shutdown"}
            </div>
            <div>Data path</div>
            <div className="font-mono text-white/88">{embeddedDataPath}</div>
            <div>Network</div>
            <div className="text-white/88">
              Local port, chosen automatically
            </div>
            <div>Managed by</div>
            <div className="text-white/88">
              Querylane startup and setup workflow
            </div>
          </div>
        </div>
      </div>
    </WizardPage>
  );
}
