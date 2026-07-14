import { Lock } from "lucide-react";

export function ConfigManagedNotice() {
  return (
    <div className="flex items-start gap-3 rounded-md border border-amber-500/25 bg-amber-500/10 px-4 py-3 dark:border-amber-400/40">
      <Lock
        aria-hidden="true"
        className="mt-0.5 size-4 shrink-0 text-amber-700 dark:text-amber-400"
      />
      <div className="space-y-0.5">
        <p className="font-medium text-amber-900 text-sm dark:text-amber-200">
          Managed via configuration file
        </p>
        <p className="text-amber-800/90 text-sm dark:text-amber-300/90">
          This instance is defined in the server configuration file and cannot
          be edited from the UI. Update your config and restart the server to
          change these settings.
        </p>
      </div>
    </div>
  );
}
