import type { ComponentProps, ReactNode } from "react";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface DisabledReasonButtonProps
  extends Omit<ComponentProps<typeof Button>, "children"> {
  children?: ReactNode;
  disabledReason?: string | null;
}

function DisabledReasonButton({
  children,
  disabled = false,
  disabledReason = null,
  ...props
}: DisabledReasonButtonProps) {
  if (disabledReason === null || disabledReason === "") {
    return (
      <Button disabled={disabled} {...props}>
        {children}
      </Button>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button disabled={true} focusableWhenDisabled={true} {...props} />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent>{disabledReason}</TooltipContent>
    </Tooltip>
  );
}

export { DisabledReasonButton };
