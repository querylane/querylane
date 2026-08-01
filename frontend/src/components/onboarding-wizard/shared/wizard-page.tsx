import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

interface WizardPageProps {
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  description?: ReactNode;
  footer: ReactNode;
  title: ReactNode;
  titleBadge?: ReactNode;
}

export function WizardPage({
  children,
  className,
  contentClassName,
  description,
  footer,
  title,
  titleBadge,
}: WizardPageProps) {
  return (
    <div className={cn("flex flex-1 flex-col", className)}>
      <header className="space-y-1.5">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-semibold text-lg text-white tracking-tight md:text-xl">
            {title}
          </h1>
          {titleBadge}
        </div>
        {description ? (
          <div className="max-w-3xl text-sm text-white/62 leading-6">
            {description}
          </div>
        ) : null}
      </header>

      <div className={cn("flex-1 pt-4", contentClassName)}>{children}</div>

      <footer className="mt-5 border-white/10 border-t pt-3.5">{footer}</footer>
    </div>
  );
}
