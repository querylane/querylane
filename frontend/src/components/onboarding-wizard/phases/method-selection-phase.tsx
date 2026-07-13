import {
  AppWindowMac,
  ChevronRight,
  Circle,
  FileCode2,
  ServerCog,
} from "lucide-react";
import type { KeyboardEvent } from "react";
import { getMethodLabel } from "@/components/onboarding-wizard/mappers";
import { WizardPage } from "@/components/onboarding-wizard/shared/wizard-page";
import type { ConfigMethod } from "@/components/onboarding-wizard/types";
import { SetupFlowExplainer } from "@/components/setup-flow-explainer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatSetupMethod } from "@/lib/protobuf-enums";
import { cn } from "@/lib/utils";
import type {
  SetupMethod,
  SetupMethodAvailability,
} from "@/protogen/querylane/console/v1alpha1/onboarding_pb";
import { useOnboardingWizardStore } from "@/stores/onboarding-wizard-store";
import { useSetupStore } from "@/stores/setup-store";

const METHOD_CONTENT: Record<
  ConfigMethod,
  {
    badge?: string;
    description: string;
    icon: typeof AppWindowMac;
  }
> = {
  embedded: {
    badge: "Managed locally",
    description:
      "Run a Querylane-managed PostgreSQL instance on this machine for local development or single-node setups.",
    icon: ServerCog,
  },
  manual_yaml: {
    description:
      "Edit the configuration file directly and let Querylane watch the path for changes as you save it.",
    icon: FileCode2,
  },
  ui_configured: {
    badge: "Recommended",
    description:
      "Connect the PostgreSQL database Querylane will use as internal storage. This is separate from the Postgres servers you manage later.",
    icon: AppWindowMac,
  },
};

const METHOD_ORDER: ConfigMethod[] = [
  "ui_configured",
  "manual_yaml",
  "embedded",
];

interface MethodAvailability {
  available: boolean;
  method: ConfigMethod;
  unavailableReason: string;
}

function getMethodAvailabilities({
  availableMethods,
  setupMethodAvailabilities,
}: {
  availableMethods: readonly SetupMethod[];
  setupMethodAvailabilities: readonly SetupMethodAvailability[];
}): MethodAvailability[] {
  const reportedAvailabilities =
    setupMethodAvailabilities.length > 0
      ? setupMethodAvailabilities
      : availableMethods.map((method) => ({
          available: true,
          method,
          unavailableReason: "",
        }));

  return METHOD_ORDER.reduce<MethodAvailability[]>((methods, method) => {
    const availability = reportedAvailabilities.find(
      (reported) => formatSetupMethod(reported.method) === method
    );
    if (availability) {
      methods.push({
        available: availability.available,
        method,
        unavailableReason: availability.unavailableReason,
      });
    }
    return methods;
  }, []);
}

function MethodOption({
  availability,
  isSelected,
  onKeyDown,
  onSelect,
}: {
  availability: MethodAvailability;
  isSelected: boolean;
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
  onSelect: (method: ConfigMethod) => void;
}) {
  const { available, method, unavailableReason } = availability;
  const content = METHOD_CONTENT[method];
  const Icon = content.icon;
  const reasonId = `setup-method-${method}-unavailable-reason`;
  return (
    <Button
      aria-checked={isSelected}
      aria-describedby={available ? undefined : reasonId}
      aria-disabled={!available}
      className={cn(
        "group flex h-auto w-full min-w-0 items-start gap-4 overflow-hidden whitespace-normal rounded-2xl border px-4 py-4 text-left transition-all duration-150 disabled:opacity-100",
        isSelected &&
          "border-blue-400 bg-blue-500/[0.08] ring-1 ring-blue-400/20",
        available &&
          !isSelected &&
          "border-white/10 bg-white/[0.03] hover:border-white/18 hover:bg-white/[0.05]",
        !available && "border-white/8 bg-white/[0.02]"
      )}
      data-setup-method-card={method}
      disabled={!available}
      onClick={() => onSelect(method)}
      onKeyDown={onKeyDown}
      role="radio"
      type="button"
      variant="ghost"
    >
      <span
        className={cn(
          "mt-0.5 flex size-12 shrink-0 items-center justify-center rounded-2xl border",
          isSelected && "border-blue-400/40 bg-blue-500/10 text-blue-300",
          available &&
            !isSelected &&
            "border-white/10 bg-white/[0.06] text-white/70",
          !available && "border-white/8 bg-white/[0.03] text-white/38"
        )}
      >
        <Icon className="size-6" />
      </span>
      <span className="min-w-0 flex-1 space-y-2 overflow-hidden">
        <span className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
          <span className="min-w-0 break-words font-semibold text-lg text-white [overflow-wrap:anywhere] md:text-xl">
            {getMethodLabel(method)}
          </span>
          {available && content.badge ? (
            <Badge
              className="max-w-full shrink-0 border-white/10 bg-white/[0.07] px-2.5 py-0.5 text-[11px] text-white/72"
              variant="outline"
            >
              {content.badge}
            </Badge>
          ) : null}
          {available ? null : (
            <Badge
              className="max-w-full shrink-0 border-white/10 bg-white/[0.05] px-2.5 py-0.5 text-[11px] text-white/62"
              variant="outline"
            >
              Unavailable
            </Badge>
          )}
        </span>
        <span className="block max-w-3xl break-words text-sm text-white/58 leading-6 [overflow-wrap:anywhere] md:text-base">
          {content.description}
        </span>
        {available ? null : (
          <span
            className="block max-w-3xl break-words text-sm text-white/68 leading-6 [overflow-wrap:anywhere]"
            id={reasonId}
          >
            {unavailableReason}
          </span>
        )}
      </span>
      <span
        className={cn(
          "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full border",
          isSelected && "border-blue-400 bg-blue-500/20 text-blue-300",
          available && !isSelected && "border-white/12 text-white/30",
          !available && "border-white/8 text-white/18"
        )}
      >
        <Circle className={cn("size-3.5", isSelected && "fill-current")} />
      </span>
    </Button>
  );
}

function getNextMethodFromKey({
  currentMethod,
  key,
  methods,
}: {
  currentMethod: ConfigMethod | null;
  key: string;
  methods: ConfigMethod[];
}): ConfigMethod | null {
  if (methods.length === 0) {
    return null;
  }
  const currentIndex = Math.max(
    0,
    currentMethod ? methods.indexOf(currentMethod) : 0
  );
  if (key === "ArrowDown" || key === "ArrowRight") {
    return methods[(currentIndex + 1) % methods.length] ?? null;
  }
  if (key === "ArrowUp" || key === "ArrowLeft") {
    return (
      methods[(currentIndex - 1 + methods.length) % methods.length] ?? null
    );
  }
  if (key === "Home") {
    return methods[0] ?? null;
  }
  if (key === "End") {
    return methods.at(-1) ?? null;
  }
  return null;
}

export function MethodSelectionPhase() {
  const onboardingState = useSetupStore((state) => state.onboardingState);
  const selectedMethod = useOnboardingWizardStore(
    (state) => state.selectedMethod
  );
  const selectMethod = useOnboardingWizardStore((state) => state.selectMethod);
  const goToConfigure = useOnboardingWizardStore(
    (state) => state.goToConfigure
  );
  const methods = getMethodAvailabilities({
    availableMethods: onboardingState?.availableMethods ?? [],
    setupMethodAvailabilities: onboardingState?.setupMethodAvailabilities ?? [],
  });
  const availableMethods = methods.reduce<ConfigMethod[]>(
    (available, availability) => {
      if (availability.available) {
        available.push(availability.method);
      }
      return available;
    },
    []
  );
  const currentMethod =
    selectedMethod && availableMethods.includes(selectedMethod)
      ? selectedMethod
      : null;

  const handleMethodKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const nextMethod = getNextMethodFromKey({
      currentMethod,
      key: event.key,
      methods: availableMethods,
    });
    if (!nextMethod) {
      return;
    }
    event.preventDefault();
    selectMethod(nextMethod);
    requestAnimationFrame(() => {
      document
        .querySelector<HTMLElement>(`[data-setup-method-card="${nextMethod}"]`)
        ?.focus();
    });
  };

  return (
    <WizardPage
      description="Step 1 sets up Querylane internal storage: a dedicated PostgreSQL database for Querylane metadata, saved connections, and query history. Step 2 is adding a Postgres server to manage."
      footer={
        <div className="flex justify-end">
          <Button
            className="h-10 rounded-xl bg-white px-4 font-medium text-[#11151f] text-sm hover:bg-white/90"
            disabled={currentMethod === null}
            onClick={goToConfigure}
          >
            Continue
            <ChevronRight className="size-4" />
          </Button>
        </div>
      }
      title="How would you like to get started?"
    >
      <SetupFlowExplainer className="mb-5" tone="onboarding" variant="setup" />
      <div aria-label="Setup method" className="space-y-3" role="radiogroup">
        {methods.length === 0 ? (
          <div className="rounded-2xl border border-white/12 border-dashed bg-white/[0.03] px-4 py-6 text-center">
            <p className="font-medium text-sm text-white">
              No setup methods available
            </p>
            <p className="mx-auto mt-2 max-w-2xl text-sm text-white/58 leading-6">
              Querylane did not receive any supported setup methods from the
              server. Refresh the page after checking the server configuration.
            </p>
          </div>
        ) : (
          methods.map((availability) => (
            <MethodOption
              availability={availability}
              isSelected={currentMethod === availability.method}
              key={availability.method}
              onKeyDown={handleMethodKeyDown}
              onSelect={selectMethod}
            />
          ))
        )}
      </div>
    </WizardPage>
  );
}
