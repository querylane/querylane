import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

function FilterToggle({
  checked,
  description,
  id,
  label,
  onCheckedChange,
}: {
  checked: boolean;
  description: string;
  id: string;
  label: string;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border bg-card/80 p-2">
      <div className="min-w-0">
        <Label htmlFor={id}>{label}</Label>
        <p className="mt-1 truncate text-muted-foreground text-xs">
          {description}
        </p>
      </div>
      <Switch
        checked={checked}
        id={id}
        onCheckedChange={onCheckedChange}
        size="sm"
      />
    </div>
  );
}

export { FilterToggle };
