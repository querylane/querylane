function HeaderStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col items-end">
      <span className="font-mono font-semibold text-sm tabular-nums">
        {value}
      </span>
      <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
        {label}
      </span>
    </div>
  );
}

export { HeaderStat };
