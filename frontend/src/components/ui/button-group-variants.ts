import { cva } from "class-variance-authority";

const buttonGroupVariants = cva(
  "flex w-fit items-stretch *:focus-visible:relative *:focus-visible:z-10 has-[>[data-querylane-slot=button-group]]:gap-2 has-[select[aria-hidden=true]:last-child]:[&>[data-querylane-slot=select-trigger]:last-of-type]:rounded-r-md [&>[data-querylane-slot=select-trigger]:not([class*='w-'])]:w-fit [&>input]:flex-1",
  {
    variants: {
      orientation: {
        horizontal:
          "*:data-querylane-slot:rounded-r-none [&>[data-querylane-slot]:not(:has(~[data-querylane-slot]))]:rounded-r-md! [&>[data-querylane-slot]~[data-querylane-slot]]:rounded-l-none [&>[data-querylane-slot]~[data-querylane-slot]]:border-l-0",
        vertical:
          "flex-col *:data-querylane-slot:rounded-b-none [&>[data-querylane-slot]:not(:has(~[data-querylane-slot]))]:rounded-b-md! [&>[data-querylane-slot]~[data-querylane-slot]]:rounded-t-none [&>[data-querylane-slot]~[data-querylane-slot]]:border-t-0",
      },
    },
    defaultVariants: {
      orientation: "horizontal",
    },
  }
);

export { buttonGroupVariants };
