import { Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { DisabledReasonButton } from "@/components/ui/disabled-reason-button";

interface DangerZoneAction {
  actionLabel: string;
  description: ReactNode;
  disabled?: boolean;
  disabledReason?: string | null;
  onAction: () => void;
  title: string;
}
interface DangerZoneSectionProps {
  actions: DangerZoneAction[];
  description?: ReactNode;
  testId?: string;
}
function DangerZoneSection({
  actions,
  description,
  testId,
}: DangerZoneSectionProps) {
  if (actions.length === 0) {
    return null;
  }
  return (
    <Card
      className="border-destructive/30 bg-destructive/[0.03]"
      data-testid={testId}
    >
      <CardHeader className="gap-2">
        <div className="space-y-1">
          <h2 className="font-medium text-base text-destructive">
            Danger zone
          </h2>
          {description ? (
            <p className="max-w-3xl text-muted-foreground text-sm">
              {description}
            </p>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {actions.map((action) => {
          const disabledReason = action.disabledReason ?? null;
          return (
            <div
              className="flex flex-col gap-3 rounded-lg border border-destructive/20 bg-background/80 p-4 sm:flex-row sm:items-center sm:justify-between"
              key={action.actionLabel}
            >
              <div className="space-y-1">
                <p className="font-medium text-sm">{action.title}</p>
                <p className="text-muted-foreground text-sm">
                  {action.description}
                </p>
              </div>
              <DisabledReasonButton
                disabled={action.disabled}
                disabledReason={disabledReason}
                onClick={action.onAction}
                size="sm"
                variant="destructive"
              >
                <Trash2 data-icon="inline-start" />
                {action.actionLabel}
              </DisabledReasonButton>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

export { DangerZoneSection };
