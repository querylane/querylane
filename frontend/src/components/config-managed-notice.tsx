import { Lock } from "lucide-react";

export function ConfigManagedNotice() {
  return (
    <div className="border-warning-500/25 bg-warning-500/10 dark:border-warning-400/40 flex items-start gap-3 rounded-md border px-4 py-3">
      <Lock
        aria-hidden="true"
        className="text-warning-700 dark:text-warning-400 mt-0.5 size-4 shrink-0"
      />
      <div className="space-y-0.5">
        <p className="text-warning-900 dark:text-warning-200 text-sm font-medium">
          Managed via configuration file
        </p>
        <p className="text-warning-800/90 dark:text-warning-300/90 text-sm">
          This instance is defined in the server configuration file and cannot
          be edited from the UI. Update your config and restart the server to
          change these settings.
        </p>
      </div>
    </div>
  );
}
