import {
  AlertTriangle,
  AppWindowMac,
  ChevronRight,
  FileCode2,
  ServerCog,
} from "lucide-react";
import type { KeyboardEvent } from "react";
import { getMethodLabel } from "@/components/onboarding-wizard/mappers";
import { WizardPage } from "@/components/onboarding-wizard/shared/wizard-page";
import type { ConfigMethod } from "@/components/onboarding-wizard/types";
import { SetupFlowExplainer } from "@/components/setup-flow-explainer";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatSetupMethod } from "@/lib/protobuf-enums";
import { cn } from "@/lib/utils";
import type { SetupMethod } from "@/protogen/querylane/console/v1alpha1/onboarding_pb";
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
    description:
      "Connect the PostgreSQL database Querylane will use as internal storage. This is separate from the Postgres servers you manage later.",
    icon: AppWindowMac,
  },
};

function getConfigMethods(
  availableMethods: readonly SetupMethod[]
): ConfigMethod[] {
  return availableMethods.reduce<ConfigMethod[]>((methods, setupMethod) => {
    const method = formatSetupMethod(setupMethod);
    if (method) {
      methods.push(method);
    }
    return methods;
  }, []);
}

function MethodOption({
  isSelected,
  method,
  onKeyDown,
  onSelect,
}: {
  isSelected: boolean;
  method: ConfigMethod;
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
  onSelect: (method: ConfigMethod) => void;
}) {
  const content = METHOD_CONTENT[method];
  const Icon = content.icon;
  return (
    <Button
      aria-checked={isSelected}
      className={cn(
        "group flex h-auto w-full min-w-0 items-start gap-3 overflow-hidden whitespace-normal rounded-xl border px-3.5 py-3 text-left transition-all duration-150",
        isSelected
          ? "border-blue-400 bg-blue-500/[0.08] ring-1 ring-blue-400/20"
          : "border-white/10 bg-white/[0.03] hover:border-white/18 hover:bg-white/[0.05]"
      )}
      data-setup-method-card={method}
      onClick={() => onSelect(method)}
      onKeyDown={onKeyDown}
      role="radio"
      type="button"
      variant="ghost"
    >
      <span
        className={cn(
          "mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg border",
          isSelected
            ? "border-blue-400/40 bg-blue-500/10 text-blue-300"
            : "border-white/10 bg-white/[0.06] text-white/70"
        )}
      >
        <Icon className="size-4" />
      </span>
      <span className="min-w-0 flex-1 space-y-1 overflow-hidden">
        <span className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
          <span className="min-w-0 break-words font-semibold text-sm text-white [overflow-wrap:anywhere] md:text-base">
            {getMethodLabel(method)}
          </span>
          {content.badge ? (
            <Badge
              className="max-w-full shrink-0 border-white/10 bg-white/[0.07] px-2 py-0.5 text-[10px] text-white/72"
              variant="outline"
            >
              {content.badge}
            </Badge>
          ) : null}
        </span>
        <span className="block max-w-3xl break-words text-white/58 text-xs leading-5 [overflow-wrap:anywhere]">
          {content.description}
        </span>
      </span>
    </Button>
  );
}

const NEXT_METHOD_KEYS = new Set(["ArrowDown", "ArrowRight"]);
const PREVIOUS_METHOD_KEYS = new Set(["ArrowUp", "ArrowLeft"]);

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
  if (NEXT_METHOD_KEYS.has(key)) {
    return methods[(currentIndex + 1) % methods.length] ?? null;
  }
  if (PREVIOUS_METHOD_KEYS.has(key)) {
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
  const availableMethods = onboardingState?.availableMethods ?? [];
  const methods = getConfigMethods(availableMethods);
  const manualSetupReason = onboardingState
    ? `Querylane cannot write its configuration to ${onboardingState.configFilePath}, so UI-configured and embedded setup are unavailable. Fix the directory permissions or configure the file manually.`
    : "";

  const handleMethodKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const nextMethod = getNextMethodFromKey({
      currentMethod: selectedMethod,
      key: event.key,
      methods,
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
      description="Pick how Querylane should store its own metadata. You can register the Postgres servers you want to manage right after."
      footer={
        <div className="flex justify-end">
          <Button
            className="h-9 rounded-lg bg-white px-4 font-medium text-[#11151f] text-sm hover:bg-white/90"
            disabled={
              selectedMethod === null || !methods.includes(selectedMethod)
            }
            onClick={goToConfigure}
          >
            Continue
            <ChevronRight className="size-4" />
          </Button>
        </div>
      }
      title="How would you like to get started?"
    >
      <SetupFlowExplainer
        className="mb-4"
        layout="compact"
        tone="onboarding"
        variant="setup"
      />
      {onboardingState && !onboardingState.isHomeWritable ? (
        <Alert
          className="mb-5 border-amber-400/20 bg-amber-500/[0.06]"
          role="status"
        >
          <AlertTriangle className="text-amber-400" />
          <AlertTitle className="text-amber-100">
            Automatic setup unavailable
          </AlertTitle>
          <AlertDescription className="text-amber-100/70">
            {manualSetupReason}
          </AlertDescription>
        </Alert>
      ) : null}
      <div aria-label="Setup method" className="space-y-2.5" role="radiogroup">
        {methods.length === 0 ? (
          <div className="rounded-xl border border-white/12 border-dashed bg-white/[0.03] px-4 py-6 text-center">
            <p className="font-medium text-sm text-white">
              No setup methods available
            </p>
            <p className="mx-auto mt-2 max-w-2xl text-sm text-white/58 leading-6">
              Querylane did not receive any supported setup methods from the
              server. Refresh the page after checking the server configuration.
            </p>
          </div>
        ) : (
          methods.map((method) => (
            <MethodOption
              isSelected={selectedMethod === method}
              key={method}
              method={method}
              onKeyDown={handleMethodKeyDown}
              onSelect={selectMethod}
            />
          ))
        )}
      </div>
    </WizardPage>
  );
}
