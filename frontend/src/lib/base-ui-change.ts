import { type ChangeDetails, dispatch } from "@ui-sdk/core";

// Preserve SDK provenance/cancellation without giving it Base UI's interaction state.
function dispatchBaseUiChange<Value, Reason extends string>(
  callback:
    | ((value: Value, details: ChangeDetails<Reason>) => void)
    | undefined,
  value: Value,
  details: { event: Event; cancel: () => void; reason: Reason }
) {
  if (
    dispatch({ options: () => ({ onChange: callback }) }, "onChange", value, {
      reason: details.reason,
      event: details.event,
    })
  ) {
    details.cancel();
    details.event.preventDefault();
  }
}

export { dispatchBaseUiChange };
