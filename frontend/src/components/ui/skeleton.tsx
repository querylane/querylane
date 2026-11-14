import { cn } from "cn";

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-muted", className)}
      data-querylane-slot="skeleton"
      {...props}
    />
  );
}

export { Skeleton };
