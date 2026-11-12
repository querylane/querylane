import { BotIcon } from "lucide-react";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAgentAccessStore } from "@/features/user-settings/agent-access";

function AgentAccessToggle() {
  const enabled = useAgentAccessStore((state) => state.enabled);
  const setEnabled = useAgentAccessStore((state) => state.setEnabled);
  return (
    <div data-agent-hidden={true}>
      <Button
        aria-label={
          enabled ? "Disable agent access" : "Enable agent access for this tab"
        }
        aria-pressed={enabled}
        onClick={(event) => {
          if (event.isTrusted) {
            setEnabled(!enabled);
          }
        }}
        size="icon-sm"
        title="Agent access is off by default. Each requested action requires approval; SQL and database writes stay manual."
        type="button"
        variant={enabled ? "secondary" : "ghost"}
      >
        <BotIcon aria-hidden="true" className="size-4" />
      </Button>
    </div>
  );
}

function AgentAccessIntegration() {
  const enabled = useAgentAccessStore((state) => state.enabled);
  const approval = useAgentAccessStore((state) => state.approval);
  useEffect(
    function registerOptInAgentTools() {
      if (!enabled) {
        return undefined;
      }
      let active = true;
      let unregister: (() => void) | undefined;
      import("@/features/user-settings/agent-tools")
        .then(({ registerAgentTools }) => {
          if (!active) {
            return undefined;
          }
          unregister = registerAgentTools();
          return undefined;
        })
        .catch(() => {
          useAgentAccessStore.getState().setEnabled(false);
        });
      return () => {
        active = false;
        unregister?.();
        useAgentAccessStore.getState().approval?.decide(false);
      };
    },
    [enabled]
  );

  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open) {
          approval?.decide(false);
        }
      }}
      open={approval !== null}
    >
      <DialogContent data-agent-hidden={true} showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Approve one agent action?</DialogTitle>
          <DialogDescription>
            The browser agent requests {approval?.action.action} on{" "}
            {approval?.action.label ?? "an unnamed control"}. Only this action
            is approved. SQL execution, database writes, and destructive actions
            must be performed manually.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            onClick={() => approval?.decide(false)}
            type="button"
            variant="outline"
          >
            Deny action
          </Button>
          <Button
            onClick={(event) => {
              if (event.isTrusted) {
                approval?.decide(true);
              }
            }}
            type="button"
          >
            Approve action
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export { AgentAccessIntegration, AgentAccessToggle };
