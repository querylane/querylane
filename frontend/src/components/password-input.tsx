import { Eye, EyeOff } from "lucide-react";
import { type ComponentProps, useState } from "react";
import { Button } from "@/components/querylane-ui/button";
import { Input } from "@/components/querylane-ui/input";

function PasswordInput({
  className,
  disabled,
  ...props
}: Omit<ComponentProps<typeof Input>, "type">) {
  const [isVisible, setIsVisible] = useState(false);

  return (
    <div className="relative w-full min-w-0">
      <Input
        className={className}
        disabled={disabled}
        trailingAction={true}
        type={isVisible ? "text" : "password"}
        {...props}
      />
      <Button
        aria-label={isVisible ? "Hide password" : "Show password"}
        aria-pressed={isVisible}
        className="absolute top-1/2 right-2 size-8 -translate-y-1/2"
        disabled={disabled}
        onClick={() => setIsVisible((current) => !current)}
        onPointerDown={(event) => {
          event.preventDefault();
        }}
        presentation="quiet"
        type="button"
        variant="ghost"
      >
        {isVisible ? (
          <EyeOff className="pointer-events-none size-4" />
        ) : (
          <Eye className="pointer-events-none size-4" />
        )}
      </Button>
    </div>
  );
}

export { PasswordInput };
