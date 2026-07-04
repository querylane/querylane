import type { ToasterProps } from "sonner";
import { Toaster as BaseToaster } from "@/components/ui/sonner";
import { useTheme } from "@/theme-provider";

const Toaster = ({ theme: toastTheme, ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return <BaseToaster theme={toastTheme ?? theme} {...props} />;
};

export { Toaster };
