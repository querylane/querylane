import { useState } from "react";
import { DEFAULT_CONFIG_FILE_PATH } from "@/components/config-managed-guidance";
import { buildResetConfigCommand } from "@/components/internal-storage-recovery-command";
import { Button } from "@/components/ui/button";
import { CopyIconButton } from "@/components/ui/copy-icon-button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

function InternalStorageRecoveryDialog({
  configFilePath = DEFAULT_CONFIG_FILE_PATH,
}: {
  configFilePath?: string | undefined;
}) {
  const [open, setOpen] = useState(false);
  const resetCommand = buildResetConfigCommand(configFilePath);

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger
        render={
          <Button
            className="h-auto shrink-0 px-2 py-1 text-destructive text-xs hover:bg-destructive/10"
            onClick={() => setOpen(true)}
            size="sm"
            variant="ghost"
          >
            Reconfigure internal storage
          </Button>
        }
      />
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Reconfigure internal storage</DialogTitle>
          <DialogDescription>
            Stop Querylane, reset the saved internal storage selection, then
            restart the server to open setup again.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="space-y-2">
            <div className="font-medium text-sm">Configuration file</div>
            <div className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2">
              <code className="min-w-0 flex-1 break-all text-xs">
                {configFilePath}
              </code>
              <CopyIconButton
                ariaLabel="Copy configuration file path"
                value={configFilePath}
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="font-medium text-sm">Reset command</div>
            <div className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2">
              <code className="min-w-0 flex-1 break-all text-xs">
                {resetCommand}
              </code>
              <CopyIconButton
                ariaLabel="Copy reset command"
                value={resetCommand}
              />
            </div>
          </div>

          <p className="text-muted-foreground text-sm leading-6">
            Querylane creates a backup and preserves your other settings. The
            command removes only the saved database or embedded storage
            selection.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function InternalStorageRecoveryAction({
  configFilePath,
  show,
}: {
  configFilePath?: string | undefined;
  show: boolean;
}) {
  if (!show) {
    return null;
  }

  return <InternalStorageRecoveryDialog configFilePath={configFilePath} />;
}

export { InternalStorageRecoveryAction, InternalStorageRecoveryDialog };
