import { useEffect } from "react";
import { type ToasterProps, toast } from "sonner";
import { Toaster as BaseToaster } from "@/components/ui/sonner";
import { useTheme } from "@/theme-context";

function Toaster({ theme: toastTheme, ...props }: ToasterProps) {
  const { theme } = useTheme();

  useEffect(function replayPreMountNotifications() {
    for (const notification of toast.getToasts()) {
      if ("title" in notification) {
        toast(notification.title, notification);
      }
    }
  }, []);

  return <BaseToaster theme={toastTheme ?? theme} {...props} />;
}

export { Toaster };
