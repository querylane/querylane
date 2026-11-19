import type { ReactNode } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";

export function BrowserSurface({ children }: { children: ReactNode }) {
  return (
    <TooltipProvider>
      <div className="bg-background p-6 text-foreground">{children}</div>
    </TooltipProvider>
  );
}
