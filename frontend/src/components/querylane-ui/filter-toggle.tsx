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
    <div className="bg-card/80 flex items-center justify-between gap-3 rounded-lg border p-2">
      <div className="min-w-0">
        <Label htmlFor={id}>{label}</Label>
        <p className="text-muted-foreground mt-1 truncate text-xs">
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
