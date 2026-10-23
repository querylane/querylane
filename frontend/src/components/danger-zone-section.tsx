import { Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import { Card, CardContent, CardHeader } from "@/components/querylane-ui/card";
import { DisabledReasonButton } from "@/components/ui/disabled-reason-button";

interface DangerZoneAction {
  actionLabel: string;
  description: ReactNode;
  disabled?: boolean;
  disabledReason?: string | null;
  handleClick: () => void;
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
    <Card data-testid={testId} presentation="danger">
      <CardHeader presentation="compact-row">
        <div className="space-y-1">
          <h2 className="text-destructive text-base font-medium">
            Danger zone
          </h2>
          {Boolean(description) ? (
            <p className="text-muted-foreground max-w-3xl text-sm">
              {description}
            </p>
          ) : null}
        </div>
      </CardHeader>
      <CardContent presentation="stacked">
        {actions.map((action) => {
          const disabledReason = action.disabledReason ?? null;
          return (
            <div
              className="border-destructive/20 bg-background/80 flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between"
              key={action.actionLabel}
            >
              <div className="min-w-0 space-y-1 [overflow-wrap:anywhere]">
                <p className="text-sm font-medium">{action.title}</p>
                <p className="text-muted-foreground text-sm">
                  {action.description}
                </p>
              </div>
              <DisabledReasonButton
                disabled={action.disabled}
                disabledReason={disabledReason}
                onClick={action.handleClick}
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
