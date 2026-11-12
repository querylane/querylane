import { Skeleton } from "@/components/ui/skeleton";

function HeaderStat({
  label,
  loading = false,
  value,
}: {
  label: string;
  loading?: boolean;
  value: string;
}) {
  return (
    <div className="flex flex-col items-end">
      {loading ? (
        <Skeleton className="my-0.5 h-4 w-10" />
      ) : (
        <span className="font-mono text-sm font-semibold tabular-nums">
          {value}
        </span>
      )}
      <span className="tracking-wider text-(length:--text-micro) text-muted-foreground uppercase">
        {label}
      </span>
    </div>
  );
}

export { HeaderStat };
