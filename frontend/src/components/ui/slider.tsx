import { Slider as SliderPrimitive } from "@base-ui/react/slider";
import { cn } from "@/lib/utils";

type SliderProps = Omit<SliderPrimitive.Root.Props<number>, "children"> & {
  "aria-label": string;
  "aria-valuetext"?: string;
};

function Slider({
  "aria-label": ariaLabel,
  "aria-valuetext": ariaValueText,
  className,
  ...props
}: SliderProps) {
  return (
    <SliderPrimitive.Root
      className={cn("relative flex min-w-0 items-center", className)}
      {...props}
    >
      <SliderPrimitive.Control className="flex h-11 w-full touch-none items-center select-none">
        <SliderPrimitive.Track className="h-1.5 w-full rounded-full bg-border select-none">
          <SliderPrimitive.Indicator className="rounded-full bg-primary select-none" />
          <SliderPrimitive.Thumb
            aria-label={ariaLabel}
            aria-valuetext={ariaValueText}
            className="size-4 rounded-full border-2 border-primary bg-background shadow-sm select-none has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50"
          />
        </SliderPrimitive.Track>
      </SliderPrimitive.Control>
    </SliderPrimitive.Root>
  );
}

export { Slider };
