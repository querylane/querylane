import type { ErrorComponentProps } from "@tanstack/react-router";
import { DatabaseLayout } from "@/components/database-layout";
import { RouteErrorView } from "@/components/route-error-view";

export function InstanceLayoutErrorComponent({
  error,
  reset,
}: ErrorComponentProps) {
  return (
    <DatabaseLayout>
      <RouteErrorView
        containerClassName="min-h-[60vh]"
        error={error}
        reset={reset}
      />
    </DatabaseLayout>
  );
}
