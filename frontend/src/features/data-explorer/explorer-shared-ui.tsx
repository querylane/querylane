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
        <span className="font-mono font-semibold text-sm tabular-nums">
          {value}
        </span>
      )}
      <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
        {label}
      </span>
    </div>
  );
}

export { HeaderStat };
