import { create as createProto } from "@bufbuild/protobuf";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { useId } from "react";
import { useWatch } from "react-hook-form";
import { useOnboardingWizardControllerContext } from "@/components/onboarding-wizard/hooks/use-onboarding-wizard-controller-context";
import { LabeledInput } from "@/components/onboarding-wizard/shared/labeled-input";
import { WizardPage } from "@/components/onboarding-wizard/shared/wizard-page";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/querylane-ui/select";
import {
  SelectItemDescription,
  SelectValue,
} from "@/components/select-extensions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useProtoForm } from "@/lib/use-proto-form";
import { EmbeddedSetupConfigSchema } from "@/protogen/querylane/console/v1alpha1/onboarding_pb";
import { useOnboardingWizardStore } from "@/stores/onboarding-wizard-store";
import { useSetupStore } from "@/stores/setup-store";

const PERSISTENCE_MODE_OPTIONS = [
  {
    description: "Keeps the embedded data directory between Querylane runs.",
    label: "Persistent",
    value: "persistent",
  },
  {
    description:
      "Starts fresh each run and removes the data directory on shutdown.",
    label: "Ephemeral",
    value: "ephemeral",
  },
] as const;
export function EmbeddedPhase() {
  const portId = useId();
  const modeId = useId();
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
  const form = useProtoForm(EmbeddedSetupConfigSchema, {
    defaultValues: {
      mode: "persistent",
      port: 5433,
    },
    mode: "all",
  });
  const { control, formState, register, setValue } = form;
  const isValid = formState.isValid;
  const errors = formState.errors;
  const mode = useWatch({ control, name: "mode" });
  const handleContinue = () => {
    const values = form.getValues();
    setSubmittedEmbeddedConfig(createProto(EmbeddedSetupConfigSchema, values));
    startProgress();
  };
  return (
    <WizardPage
      description="Run a Querylane-managed embedded PostgreSQL instance locally. Querylane will start it, initialize the metadata schema, and persist the configuration for later boots."
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
            disabled={!isValid}
            onClick={handleContinue}
          >
            Continue
            <ChevronRight className="size-4" />
          </Button>
        </div>
      }
      title="Embedded PostgreSQL"
    >
      <div className="space-y-5">
        <div className="grid gap-5 md:grid-cols-[200px_minmax(0,1fr)]">
          <LabeledInput
            error={errors.port?.message}
            id={portId}
            label="Port"
            {...register("port", {
              valueAsNumber: true,
            })}
          />

          <div className="space-y-3">
            <Label
              className="font-medium text-base text-white"
              htmlFor={modeId}
            >
              Persistence mode
            </Label>
            <Select
              onValueChange={(value) => {
                if (!value) {
                  return;
                }
                setValue("mode", value, {
                  shouldDirty: true,
                  shouldValidate: true,
                });
              }}
              value={mode}
            >
              <SelectTrigger
                className="h-11 w-full rounded-xl border-white/10 bg-white/[0.03] px-4 py-0 text-base text-white leading-none focus-visible:border-[#4b73d7] focus-visible:ring-[#4b73d7]/25 [&_svg]:size-4 [&_svg]:text-white/68"
                id={modeId}
              >
                <SelectValue>
                  {(value) =>
                    PERSISTENCE_MODE_OPTIONS.find(
                      (option) => option.value === value
                    )?.label ?? "Select a mode"
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent className="rounded-[20px] border border-white/10 bg-[#070a11] p-2 text-white shadow-[0_20px_60px_rgba(0,0,0,0.45)]">
                {PERSISTENCE_MODE_OPTIONS.map((option) => (
                  <SelectItem
                    className="rounded-xl px-4 py-3 text-white focus:bg-white/[0.07] focus:text-white"
                    key={option.value}
                    label={option.label}
                    value={option.value}
                  >
                    <span className="text-base text-white">{option.label}</span>
                    <SelectItemDescription className="mt-1 text-sm text-white/58">
                      {option.description}
                    </SelectItemDescription>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <div className="grid gap-4 text-sm text-white/62 md:grid-cols-[200px_minmax(0,1fr)]">
            <div>Data path</div>
            <div className="font-mono text-white/88">{embeddedDataPath}</div>
            <div>Runtime</div>
            <div className="text-white/88">Embedded PostgreSQL</div>
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
