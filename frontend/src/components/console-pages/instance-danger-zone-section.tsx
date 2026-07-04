import { DangerZoneSection } from "@/components/danger-zone-section";
import { InlineCode } from "@/components/ui/inline-code";

export function InstanceDangerZoneSection({
  deleteDisabledReason = null,
  instanceDisplayName,
  onDelete,
  pending,
}: {
  deleteDisabledReason?: string | null;
  instanceDisplayName: string;
  onDelete: () => void;
  pending: boolean;
}) {
  const deleteDisabled = pending || Boolean(deleteDisabledReason);
  return (
    <DangerZoneSection
      actions={[
        {
          actionLabel: "Delete instance",
          description: (
            <>
              Permanently remove <InlineCode>{instanceDisplayName}</InlineCode>
              from Querylane. This action cannot be undone.
              {deleteDisabledReason ? (
                <span className="mt-2 block text-destructive">
                  {deleteDisabledReason}
                </span>
              ) : null}
            </>
          ),
          disabled: deleteDisabled,
          disabledReason: deleteDisabledReason,
          onAction: onDelete,
          title: "Delete this instance",
        },
      ]}
      description="Destructive and irreversible actions for this instance live here."
      testId="instance-danger-zone"
    />
  );
}
