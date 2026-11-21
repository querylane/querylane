import {
  Toast,
  ToastAction,
  ToastClose,
  ToastDescription,
  ToastRegion,
  ToastTitle,
} from "@ui-sdk/react/toast";
import { XIcon } from "lucide-react";

function Toaster() {
  return (
    <ToastRegion
      aria-label="Notifications"
      className="fixed right-4 bottom-4 z-50 w-88 max-w-[calc(100vw-2rem)]"
      data-agent-hidden={true}
    >
      {() => (
        <Toast className="relative flex items-start gap-3 rounded-lg border border-border bg-popover p-4 text-sm text-popover-foreground shadow-lg data-[type=error]:border-destructive motion-reduce:transition-none">
          <div className="min-w-0 flex-1">
            <ToastTitle className="font-medium" />
            <ToastDescription className="mt-1 text-muted-foreground" />
          </div>
          <ToastAction className="rounded-md border border-border px-2 py-1 focus-visible:ring-2 focus-visible:ring-ring" />
          <ToastClose
            aria-label="Dismiss notification"
            className="rounded-md p-1 focus-visible:ring-2 focus-visible:ring-ring"
          >
            <XIcon aria-hidden="true" className="size-4" />
          </ToastClose>
        </Toast>
      )}
    </ToastRegion>
  );
}

export { Toaster };
