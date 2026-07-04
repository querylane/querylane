"use client"

import type { ComponentProps } from "react"

import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"

interface DisabledReasonButtonProps extends ComponentProps<typeof Button> {
  disabledReason?: string | null
}

function DisabledReasonButton({
  children,
  disabled = false,
  disabledReason = null,
  ...props
}: DisabledReasonButtonProps) {
  if (!disabledReason) {
    return (
      <Button disabled={disabled} {...props}>
        {children}
      </Button>
    )
  }

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          // Focusable wrapper: the inner button is disabled (not focusable), so
          // tabIndex here lets keyboard users focus it to reveal the reason
          // tooltip (base-ui wires aria-describedby to the trigger).
          <span className="inline-flex cursor-not-allowed" tabIndex={0} />
        }
      >
        <Button disabled {...props}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{disabledReason}</TooltipContent>
    </Tooltip>
  )
}

export { DisabledReasonButton }
