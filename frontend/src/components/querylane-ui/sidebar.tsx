import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { cva, type VariantProps } from "class-variance-authority";
import { PanelLeftIcon } from "lucide-react";
import {
  type ComponentProps,
  type CSSProperties,
  createContext,
  type RefObject,
  use,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { useIsMobile } from "@/components/querylane-ui/use-mobile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { anyPredicate } from "@/lib/predicates";
import { cn } from "@/lib/utils";

const SIDEBAR_COOKIE_NAME = "sidebar_state";
const SIDEBAR_COOKIE_MAX_AGE = 60 * 60 * 24 * 7;
const SIDEBAR_WIDTH = "16rem";
const SIDEBAR_WIDTH_MOBILE = "18rem";
const SIDEBAR_WIDTH_ICON = "3rem";
const SIDEBAR_HOVER_REVEAL_TRIGGER_WIDTH = 20;
const SIDEBAR_HOVER_REVEAL_EDGE_BUFFER = 8;
const SIDEBAR_HOVER_REVEAL_CLOSE_DELAY = 80;
const SIDEBAR_HOVER_REVEAL_FALLBACK_WIDTH = 256;
const SIDEBAR_FOCUSABLE_SELECTOR = [
  "a[href]",
  "button",
  "input",
  "select",
  "textarea",
  "[tabindex]",
  '[contenteditable="true"]',
].join(",");

interface SidebarContextProps {
  hoverRevealOpen: boolean;
  isMobile: boolean;
  open: boolean;
  openMobile: boolean;
  setHoverRevealOpen: (open: boolean) => void;
  setOpen: (open: boolean) => void;
  setOpenMobile: (open: boolean) => void;
  state: "expanded" | "collapsed";
  toggleSidebar: () => void;
}

const SidebarContext = createContext<SidebarContextProps | null>(null);

function useSidebar() {
  const context = use(SidebarContext);
  if (!context) {
    throw new Error("useSidebar must be used within a SidebarProvider.");
  }

  return context;
}

function isHoverRevealPointer(event: PointerEvent) {
  return event.pointerType === "mouse" || event.pointerType === "pen";
}

function isPointerWithinSidebarHoverRevealBounds(
  container: HTMLDivElement | null,
  event: PointerEvent,
  side: "left" | "right"
) {
  const rect = container?.getBoundingClientRect();
  if (!rect) {
    const sidebarWidth = SIDEBAR_HOVER_REVEAL_FALLBACK_WIDTH;
    return side === "left"
      ? event.clientX <= sidebarWidth + SIDEBAR_HOVER_REVEAL_EDGE_BUFFER
      : event.clientX >=
          window.innerWidth - sidebarWidth - SIDEBAR_HOVER_REVEAL_EDGE_BUFFER;
  }

  const verticalInside =
    event.clientY >= rect.top - SIDEBAR_HOVER_REVEAL_EDGE_BUFFER &&
    event.clientY <= rect.bottom + SIDEBAR_HOVER_REVEAL_EDGE_BUFFER;

  if (!verticalInside) {
    return false;
  }

  return side === "left"
    ? event.clientX <= rect.right + SIDEBAR_HOVER_REVEAL_EDGE_BUFFER
    : event.clientX >= rect.left - SIDEBAR_HOVER_REVEAL_EDGE_BUFFER;
}

function shouldKeepSidebarHoverRevealOpen(container: HTMLDivElement | null) {
  return Boolean(container?.querySelector("[data-popup-open]"));
}

function useHiddenSidebarFocusGuard({
  containerRef,
  hidden,
}: {
  containerRef: RefObject<HTMLDivElement | null>;
  hidden: boolean;
}) {
  useEffect(
    function syncHiddenSidebarFocusability() {
      const container = containerRef.current;
      if (!(container && hidden)) {
        return;
      }

      const changedElements = Array.from(
        container.querySelectorAll<HTMLElement>(SIDEBAR_FOCUSABLE_SELECTOR)
      ).map((element) => ({
        element,
        tabIndex: element.getAttribute("tabindex"),
      }));

      for (const { element } of changedElements) {
        element.setAttribute("tabindex", "-1");
      }

      return () => {
        for (const { element, tabIndex } of changedElements) {
          if (tabIndex === null) {
            element.removeAttribute("tabindex");
          } else {
            element.setAttribute("tabindex", tabIndex);
          }
        }
      };
    },
    [containerRef, hidden]
  );
}

function SidebarOffcanvasTrigger({
  show,
  side,
  sidebarContainerId,
}: {
  show: boolean;
  side: "left" | "right";
  sidebarContainerId: string;
}) {
  if (!show) {
    return null;
  }

  return (
    <SidebarTrigger
      aria-controls={sidebarContainerId}
      aria-expanded={false}
      aria-label="Expand menu"
      className={cn(
        "fixed top-1/2 z-20 hidden h-12 w-6 -translate-y-1/2 rounded-none border-sidebar-border bg-sidebar text-sidebar-foreground shadow-sm hover:bg-sidebar-accent focus-visible:ring-2 lg:inline-flex",
        side === "left"
          ? "left-0 rounded-r-md border-y border-r"
          : "right-0 rounded-l-md border-y border-l"
      )}
    />
  );
}

function useSidebarHoverReveal({
  containerRef,
  enabled,
  side,
}: {
  containerRef: RefObject<HTMLDivElement | null>;
  enabled: boolean;
  side: "left" | "right";
}) {
  const [revealed, setRevealed] = useState(false);
  const [previousEnabled, setPreviousEnabled] = useState(enabled);
  const closeTimer = useRef<number | undefined>(undefined);

  if (previousEnabled !== enabled) {
    setPreviousEnabled(enabled);
    if (!enabled) {
      setRevealed(false);
    }
  }

  useEffect(
    function revealSidebarFromScreenEdge() {
      if (!(enabled && !revealed)) {
        return;
      }

      function handlePointerMove(event: PointerEvent) {
        if (!isHoverRevealPointer(event)) {
          return;
        }

        const nearEdge =
          side === "left"
            ? event.clientX <= SIDEBAR_HOVER_REVEAL_TRIGGER_WIDTH
            : event.clientX >=
              window.innerWidth - SIDEBAR_HOVER_REVEAL_TRIGGER_WIDTH;

        if (nearEdge) {
          setRevealed(true);
        }
      }

      window.addEventListener("pointermove", handlePointerMove, {
        passive: true,
      });
      return () => {
        window.removeEventListener("pointermove", handlePointerMove);
      };
    },
    [enabled, revealed, side]
  );

  useEffect(
    function retractSidebarAwayFromPointer() {
      if (!(enabled && revealed)) {
        return;
      }

      function clearCloseTimer() {
        if (closeTimer.current !== undefined) {
          window.clearTimeout(closeTimer.current);
          closeTimer.current = undefined;
        }
      }

      function handlePointerMove(event: PointerEvent) {
        if (!isHoverRevealPointer(event)) {
          return;
        }

        const insideSidebar = isPointerWithinSidebarHoverRevealBounds(
          containerRef.current,
          event,
          side
        );

        if (
          insideSidebar ||
          shouldKeepSidebarHoverRevealOpen(containerRef.current)
        ) {
          clearCloseTimer();
          return;
        }

        clearCloseTimer();
        closeTimer.current = window.setTimeout(
          function closeSidebarHoverReveal() {
            if (shouldKeepSidebarHoverRevealOpen(containerRef.current)) {
              return;
            }
            setRevealed(false);
          },
          SIDEBAR_HOVER_REVEAL_CLOSE_DELAY
        );
      }

      function handleWindowBlur() {
        if (shouldKeepSidebarHoverRevealOpen(containerRef.current)) {
          return;
        }
        setRevealed(false);
      }

      window.addEventListener("pointermove", handlePointerMove, {
        passive: true,
      });
      window.addEventListener("blur", handleWindowBlur);
      return () => {
        clearCloseTimer();
        window.removeEventListener("pointermove", handlePointerMove);
        window.removeEventListener("blur", handleWindowBlur);
      };
    },
    [containerRef, enabled, revealed, side]
  );

  return revealed;
}

function SidebarProvider({
  defaultOpen = true,
  open: openProp,
  onOpenChange: setOpenProp,
  className,
  style,
  children,
  ...props
}: ComponentProps<"div"> & {
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const isMobile = useIsMobile();
  const [openMobile, setOpenMobile] = useState(false);
  const [hoverRevealOpen, setHoverRevealOpen] = useState(false);

  // This is the internal state of the sidebar.
  // We use openProp and setOpenProp for control from outside the component.
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const open = openProp ?? internalOpen;
  const setOpen = useCallback(
    (value: boolean | ((value: boolean) => boolean)) => {
      const openState = typeof value === "function" ? value(open) : value;
      if (setOpenProp) {
        setOpenProp(openState);
      } else {
        setInternalOpen(openState);
      }

      // This sets the cookie to keep the sidebar state.
      document.cookie = `${SIDEBAR_COOKIE_NAME}=${openState}; path=/; max-age=${SIDEBAR_COOKIE_MAX_AGE}`;
    },
    [setOpenProp, open]
  );

  // Helper to toggle the sidebar.
  const toggleSidebar = useCallback(
    () =>
      isMobile
        ? setOpenMobile((currentOpen) => !currentOpen)
        : setOpen((currentOpen) => !currentOpen),
    [isMobile, setOpen]
  );

  // We add a state so that we can do data-state="expanded" or "collapsed".
  // This makes it easier to style the sidebar with Tailwind classes.
  const state = open ? "expanded" : "collapsed";

  const contextValue = useMemo<SidebarContextProps>(
    () => ({
      hoverRevealOpen,
      isMobile,
      open,
      openMobile,
      setHoverRevealOpen,
      setOpen,
      setOpenMobile,
      state,
      toggleSidebar,
    }),
    [state, open, setOpen, isMobile, hoverRevealOpen, openMobile, toggleSidebar]
  );

  return (
    <SidebarContext.Provider value={contextValue}>
      <div
        className={cn(
          "group/sidebar-wrapper flex min-h-svh w-full has-data-[variant=inset]:bg-sidebar",
          className
        )}
        data-slot="sidebar-wrapper"
        style={
          {
            "--sidebar-width": SIDEBAR_WIDTH,
            "--sidebar-width-icon": SIDEBAR_WIDTH_ICON,
            ...style,
          } as CSSProperties
        }
        {...props}
      >
        {children}
      </div>
    </SidebarContext.Provider>
  );
}

function shouldRevealSidebarOnHover(
  collapsible: "offcanvas" | "icon" | "none",
  state: "expanded" | "collapsed",
  isMobile: boolean
): boolean {
  return collapsible === "offcanvas" && state === "collapsed" && !isMobile;
}

function isSidebarOffcanvasHidden(
  collapsible: "offcanvas" | "icon" | "none",
  state: "expanded" | "collapsed",
  hoverRevealOpen: boolean
): boolean {
  return (
    collapsible === "offcanvas" && state === "collapsed" && !hoverRevealOpen
  );
}

function Sidebar({
  side = "left",
  variant = "sidebar",
  collapsible = "offcanvas",
  className,
  children,
  dir,
  ...props
}: ComponentProps<"div"> & {
  side?: "left" | "right";
  variant?: "sidebar" | "floating" | "inset";
  collapsible?: "offcanvas" | "icon" | "none";
}) {
  const { isMobile, state, openMobile, setHoverRevealOpen, setOpenMobile } =
    useSidebar();
  const hoverRevealContainerRef = useRef<HTMLDivElement>(null);
  const generatedSidebarId = useId();
  const hoverRevealOpen = useSidebarHoverReveal({
    containerRef: hoverRevealContainerRef,
    enabled: shouldRevealSidebarOnHover(collapsible, state, isMobile),
    side,
  });
  const isHiddenOffcanvas = isSidebarOffcanvasHidden(
    collapsible,
    state,
    hoverRevealOpen
  );
  const sidebarContainerId = props.id ?? generatedSidebarId;

  useHiddenSidebarFocusGuard({
    containerRef: hoverRevealContainerRef,
    hidden: isHiddenOffcanvas,
  });

  useEffect(
    function syncHoverRevealContext() {
      setHoverRevealOpen(hoverRevealOpen);
      return () => {
        setHoverRevealOpen(false);
      };
    },
    [hoverRevealOpen, setHoverRevealOpen]
  );

  if (collapsible === "none") {
    return (
      <div
        className={cn(
          "flex h-full w-(--sidebar-width) flex-col bg-sidebar text-sidebar-foreground",
          className
        )}
        data-slot="sidebar"
        {...props}
      >
        {children}
      </div>
    );
  }

  if (isMobile) {
    return (
      <Sheet onOpenChange={setOpenMobile} open={openMobile} {...props}>
        <SheetContent
          className="w-(--sidebar-width) bg-sidebar p-0 text-sidebar-foreground [&>button]:hidden"
          data-mobile="true"
          data-sidebar="sidebar"
          data-slot="sidebar"
          dir={dir}
          side={side}
          style={
            {
              "--sidebar-width": SIDEBAR_WIDTH_MOBILE,
              maxWidth: "none",
              width: "min(var(--sidebar-width), calc(100vw - 1rem))",
            } as CSSProperties
          }
        >
          <SheetHeader className="sr-only">
            <SheetTitle>Sidebar</SheetTitle>
            <SheetDescription>Displays the mobile sidebar.</SheetDescription>
          </SheetHeader>
          <div className="flex h-full w-full flex-col">{children}</div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <div
      className="group peer hidden text-sidebar-foreground lg:block"
      data-collapsible={state === "collapsed" ? collapsible : ""}
      data-side={side}
      data-slot="sidebar"
      data-state={state}
      data-variant={variant}
    >
      {/* This is what handles the sidebar gap on desktop */}
      <div
        className={cn(
          "relative w-(--sidebar-width) bg-transparent transition-[width] duration-200 ease-linear",
          "group-data-[collapsible=offcanvas]:w-0",
          "group-data-[side=right]:rotate-180",
          anyPredicate(
            () => variant === "floating",
            () => variant === "inset"
          )
            ? "group-data-[collapsible=icon]:w-[calc(var(--sidebar-width-icon)+(--spacing(4)))]"
            : "group-data-[collapsible=icon]:w-(--sidebar-width-icon)"
        )}
        data-slot="sidebar-gap"
      />
      <div
        aria-hidden={isHiddenOffcanvas ? true : undefined}
        className={cn(
          "fixed inset-y-0 z-10 hidden h-svh w-(--sidebar-width) transition-[transform,width] duration-200 ease-linear data-[side=right]:right-0 data-[side=left]:left-0 group-data-[collapsible=offcanvas]:pointer-events-none data-[side=left]:group-data-[collapsible=offcanvas]:data-[hover-reveal=open]:translate-x-0 data-[side=right]:group-data-[collapsible=offcanvas]:data-[hover-reveal=open]:translate-x-0 group-data-[collapsible=offcanvas]:data-[hover-reveal=open]:pointer-events-auto group-data-[collapsible=offcanvas]:data-[hover-reveal=open]:z-30 data-[side=left]:group-data-[collapsible=offcanvas]:-translate-x-full data-[side=right]:group-data-[collapsible=offcanvas]:translate-x-full group-data-[collapsible=offcanvas]:data-[hover-reveal=open]:shadow-2xl lg:flex",
          // Adjust the padding for floating and inset variants.
          anyPredicate(
            () => variant === "floating",
            () => variant === "inset"
          )
            ? "p-2 group-data-[collapsible=icon]:w-[calc(var(--sidebar-width-icon)+(--spacing(4))+2px)]"
            : "group-data-[collapsible=icon]:w-(--sidebar-width-icon) group-data-[side=left]:border-r group-data-[side=right]:border-l",
          className
        )}
        data-hover-reveal={hoverRevealOpen ? "open" : "closed"}
        data-side={side}
        data-slot="sidebar-container"
        id={sidebarContainerId}
        inert={isHiddenOffcanvas ? true : undefined}
        ref={hoverRevealContainerRef}
        {...props}
      >
        <div
          className="flex size-full flex-col bg-sidebar group-data-[variant=floating]:rounded-lg group-data-[variant=floating]:shadow-sm group-data-[variant=floating]:ring-1 group-data-[variant=floating]:ring-sidebar-border"
          data-sidebar="sidebar"
          data-slot="sidebar-inner"
        >
          {children}
        </div>
      </div>
      <SidebarOffcanvasTrigger
        show={state === "collapsed" && collapsible === "offcanvas"}
        side={side}
        sidebarContainerId={sidebarContainerId}
      />
    </div>
  );
}

function SidebarTrigger({
  className,
  onClick,
  ...props
}: ComponentProps<typeof Button>) {
  const { toggleSidebar } = useSidebar();

  return (
    <Button
      className={cn(className)}
      data-sidebar="trigger"
      data-slot="sidebar-trigger"
      onClick={(event) => {
        onClick?.(event);
        toggleSidebar();
      }}
      size="icon-sm"
      variant="ghost"
      {...props}
    >
      <PanelLeftIcon />
      <span className="sr-only">Toggle Sidebar</span>
    </Button>
  );
}

function SidebarRail({ className, ...props }: ComponentProps<typeof Button>) {
  const { toggleSidebar } = useSidebar();

  return (
    <Button
      aria-label="Toggle Sidebar"
      className={cn(
        "absolute inset-y-0 z-20 hidden w-4 transition-all ease-linear after:absolute after:inset-y-0 after:start-1/2 after:w-[2px] hover:after:bg-sidebar-border group-data-[side=left]:-right-4 group-data-[side=right]:left-0 sm:flex ltr:-translate-x-1/2 rtl:-translate-x-1/2",
        "in-data-[side=left]:cursor-w-resize in-data-[side=right]:cursor-e-resize",
        "[[data-side=left][data-state=collapsed]_&]:cursor-e-resize [[data-side=right][data-state=collapsed]_&]:cursor-w-resize",
        "group-data-[collapsible=offcanvas]:translate-x-0 hover:group-data-[collapsible=offcanvas]:bg-sidebar group-data-[collapsible=offcanvas]:after:left-full",
        "[[data-side=left][data-collapsible=offcanvas]_&]:-right-2",
        "[[data-side=right][data-collapsible=offcanvas]_&]:-left-2",
        "h-auto rounded-none border-0 bg-transparent p-0 text-inherit shadow-none hover:bg-transparent",
        className
      )}
      data-sidebar="rail"
      data-slot="sidebar-rail"
      onClick={toggleSidebar}
      tabIndex={-1}
      title="Toggle Sidebar"
      type="button"
      variant="ghost"
      {...props}
    />
  );
}

function SidebarInset({ className, ...props }: ComponentProps<"main">) {
  return (
    <main
      className={cn(
        "relative flex w-full flex-1 flex-col bg-background lg:peer-data-[variant=inset]:peer-data-[state=collapsed]:ml-2 lg:peer-data-[variant=inset]:m-2 lg:peer-data-[variant=inset]:ml-0 lg:peer-data-[variant=inset]:rounded-xl lg:peer-data-[variant=inset]:shadow-sm",
        className
      )}
      data-slot="sidebar-inset"
      {...props}
    />
  );
}

function SidebarInput({ className, ...props }: ComponentProps<typeof Input>) {
  return (
    <Input
      className={cn("h-8 w-full bg-background shadow-none", className)}
      data-sidebar="input"
      data-slot="sidebar-input"
      {...props}
    />
  );
}

function SidebarHeader({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn("flex flex-col gap-2 p-2", className)}
      data-sidebar="header"
      data-slot="sidebar-header"
      {...props}
    />
  );
}

function SidebarFooter({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn("flex flex-col gap-2 p-2", className)}
      data-sidebar="footer"
      data-slot="sidebar-footer"
      {...props}
    />
  );
}

function SidebarSeparator({
  className,
  ...props
}: ComponentProps<typeof Separator>) {
  return (
    <Separator
      className={cn("mx-2 w-auto bg-sidebar-border", className)}
      data-sidebar="separator"
      data-slot="sidebar-separator"
      {...props}
    />
  );
}

function SidebarContent({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "no-scrollbar flex min-h-0 flex-1 flex-col gap-2 overflow-auto group-data-[collapsible=icon]:overflow-hidden",
        className
      )}
      data-sidebar="content"
      data-slot="sidebar-content"
      {...props}
    />
  );
}

function SidebarGroup({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn("relative flex w-full min-w-0 flex-col p-2", className)}
      data-sidebar="group"
      data-slot="sidebar-group"
      {...props}
    />
  );
}

function SidebarGroupLabel({
  className,
  render,
  ...props
}: useRender.ComponentProps<"div"> & ComponentProps<"div">) {
  return useRender({
    defaultTagName: "div",
    props: mergeProps<"div">(
      {
        className: cn(
          "flex h-8 shrink-0 items-center rounded-md px-2 font-medium text-sidebar-foreground/70 text-xs outline-hidden ring-sidebar-ring transition-[margin,opacity] duration-200 ease-linear focus-visible:ring-2 group-data-[collapsible=icon]:-mt-8 group-data-[collapsible=icon]:opacity-0 [&>svg]:size-4 [&>svg]:shrink-0",
          className
        ),
      },
      props
    ),
    render,
    state: {
      sidebar: "group-label",
      slot: "sidebar-group-label",
    },
  });
}

function SidebarGroupAction({
  className,
  render,
  ...props
}: useRender.ComponentProps<"button"> & ComponentProps<"button">) {
  return useRender({
    defaultTagName: "button",
    props: mergeProps<"button">(
      {
        className: cn(
          "absolute top-3.5 right-3 flex aspect-square w-5 items-center justify-center rounded-md p-0 text-sidebar-foreground outline-hidden ring-sidebar-ring transition-transform after:absolute after:-inset-2 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 group-data-[collapsible=icon]:hidden md:after:hidden [&>svg]:size-4 [&>svg]:shrink-0",
          className
        ),
      },
      props
    ),
    render,
    state: {
      sidebar: "group-action",
      slot: "sidebar-group-action",
    },
  });
}

function SidebarGroupContent({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn("w-full text-sm", className)}
      data-sidebar="group-content"
      data-slot="sidebar-group-content"
      {...props}
    />
  );
}

function SidebarMenu({ className, ...props }: ComponentProps<"ul">) {
  return (
    <ul
      className={cn("flex w-full min-w-0 flex-col gap-1", className)}
      data-sidebar="menu"
      data-slot="sidebar-menu"
      {...props}
    />
  );
}

function SidebarMenuItem({ className, ...props }: ComponentProps<"li">) {
  return (
    <li
      className={cn("group/menu-item relative", className)}
      data-sidebar="menu-item"
      data-slot="sidebar-menu-item"
      {...props}
    />
  );
}

const sidebarMenuButtonVariants = cva(
  "peer/menu-button group/menu-button flex w-full items-center gap-2 overflow-hidden rounded-md p-2 text-left text-sm outline-hidden ring-sidebar-ring transition-[width,height,padding] hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 group-has-data-[sidebar=menu-action]/menu-item:pr-8 aria-disabled:pointer-events-none aria-disabled:opacity-50 data-active:bg-sidebar-accent data-active:font-medium data-active:text-sidebar-accent-foreground data-open:hover:bg-sidebar-accent data-open:hover:text-sidebar-accent-foreground group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:p-2! [&>span:last-child]:truncate [&_svg]:size-4 [&_svg]:shrink-0",
  {
    defaultVariants: {
      size: "default",
      variant: "default",
    },
    variants: {
      size: {
        default: "h-8 text-sm",
        lg: "h-12 text-sm group-data-[collapsible=icon]:p-0!",
        sm: "h-7 text-xs",
      },
      variant: {
        default: "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        outline:
          "bg-background shadow-[0_0_0_1px_var(--sidebar-border)] hover:bg-sidebar-accent hover:text-sidebar-accent-foreground hover:shadow-[0_0_0_1px_var(--sidebar-accent)]",
      },
    },
  }
);

function SidebarMenuButton({
  render,
  isActive = false,
  variant = "default",
  size = "default",
  tooltip,
  className,
  ...props
}: useRender.ComponentProps<"button"> &
  ComponentProps<"button"> & {
    isActive?: boolean;
    tooltip?: string | ComponentProps<typeof TooltipContent>;
  } & VariantProps<typeof sidebarMenuButtonVariants>) {
  const { hoverRevealOpen, isMobile, state } = useSidebar();
  const comp = useRender({
    defaultTagName: "button",
    props: mergeProps<"button">(
      {
        className: cn(sidebarMenuButtonVariants({ size, variant }), className),
      },
      props
    ),
    render: tooltip ? <TooltipTrigger render={render} /> : render,
    state: {
      active: isActive,
      sidebar: "menu-button",
      size,
      slot: "sidebar-menu-button",
    },
  });

  if (!tooltip) {
    return comp;
  }

  if (typeof tooltip === "string") {
    tooltip = {
      children: tooltip,
    };
  }

  return (
    <Tooltip>
      {comp}
      <TooltipContent
        align="center"
        hidden={state !== "collapsed" || isMobile || hoverRevealOpen}
        side="right"
        {...tooltip}
      />
    </Tooltip>
  );
}

function SidebarMenuAction({
  className,
  render,
  showOnHover = false,
  ...props
}: useRender.ComponentProps<"button"> &
  ComponentProps<"button"> & {
    showOnHover?: boolean;
  }) {
  return useRender({
    defaultTagName: "button",
    props: mergeProps<"button">(
      {
        className: cn(
          "absolute top-1.5 right-1 flex aspect-square w-5 items-center justify-center rounded-md p-0 text-sidebar-foreground outline-hidden ring-sidebar-ring transition-transform after:absolute after:-inset-2 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 peer-hover/menu-button:text-sidebar-accent-foreground group-data-[collapsible=icon]:hidden peer-data-[size=default]/menu-button:top-1.5 peer-data-[size=lg]/menu-button:top-2.5 peer-data-[size=sm]/menu-button:top-1 md:after:hidden [&>svg]:size-4 [&>svg]:shrink-0",
          showOnHover &&
            "group-focus-within/menu-item:opacity-100 group-hover/menu-item:opacity-100 aria-expanded:opacity-100 peer-data-active/menu-button:text-sidebar-accent-foreground md:opacity-0",
          className
        ),
      },
      props
    ),
    render,
    state: {
      sidebar: "menu-action",
      slot: "sidebar-menu-action",
    },
  });
}

function SidebarMenuBadge({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "pointer-events-none absolute right-1 flex h-5 min-w-5 select-none items-center justify-center rounded-md px-1 font-medium text-sidebar-foreground text-xs tabular-nums peer-hover/menu-button:text-sidebar-accent-foreground group-data-[collapsible=icon]:hidden peer-data-[size=default]/menu-button:top-1.5 peer-data-[size=lg]/menu-button:top-2.5 peer-data-[size=sm]/menu-button:top-1 peer-data-active/menu-button:text-sidebar-accent-foreground",
        className
      )}
      data-sidebar="menu-badge"
      data-slot="sidebar-menu-badge"
      {...props}
    />
  );
}

function SidebarMenuSkeleton({
  className,
  showIcon = false,
  ...props
}: ComponentProps<"div"> & {
  showIcon?: boolean;
}) {
  // Random width between 50 to 90%.
  const width = useRef(`${Math.floor(Math.random() * 40) + 50}%`).current;

  return (
    <div
      className={cn("flex h-8 items-center gap-2 rounded-md px-2", className)}
      data-sidebar="menu-skeleton"
      data-slot="sidebar-menu-skeleton"
      {...props}
    >
      {showIcon ? (
        <Skeleton
          className="size-4 rounded-md"
          data-sidebar="menu-skeleton-icon"
        />
      ) : null}
      <Skeleton
        className="h-4 max-w-(--skeleton-width) flex-1"
        data-sidebar="menu-skeleton-text"
        style={
          {
            "--skeleton-width": width,
          } as CSSProperties
        }
      />
    </div>
  );
}

function SidebarMenuSub({ className, ...props }: ComponentProps<"ul">) {
  return (
    <ul
      className={cn(
        "mx-3.5 flex min-w-0 translate-x-px flex-col gap-1 border-sidebar-border border-l px-2.5 py-0.5 group-data-[collapsible=icon]:hidden",
        className
      )}
      data-sidebar="menu-sub"
      data-slot="sidebar-menu-sub"
      {...props}
    />
  );
}

function SidebarMenuSubItem({ className, ...props }: ComponentProps<"li">) {
  return (
    <li
      className={cn("group/menu-sub-item relative", className)}
      data-sidebar="menu-sub-item"
      data-slot="sidebar-menu-sub-item"
      {...props}
    />
  );
}

function SidebarMenuSubButton({
  render,
  size = "md",
  isActive = false,
  className,
  ...props
}: useRender.ComponentProps<"a"> &
  ComponentProps<"a"> & {
    size?: "sm" | "md";
    isActive?: boolean;
  }) {
  return useRender({
    defaultTagName: "a",
    props: mergeProps<"a">(
      {
        className: cn(
          "flex h-7 min-w-0 -translate-x-px items-center gap-2 overflow-hidden rounded-md px-2 text-sidebar-foreground outline-hidden ring-sidebar-ring hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 data-active:bg-sidebar-accent data-[size=md]:text-sm data-[size=sm]:text-xs data-active:text-sidebar-accent-foreground group-data-[collapsible=icon]:hidden [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-sidebar-accent-foreground",
          className
        ),
      },
      props
    ),
    render,
    state: {
      active: isActive,
      sidebar: "menu-sub-button",
      size,
      slot: "sidebar-menu-sub-button",
    },
  });
}

export {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInput,
  SidebarInset,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
  useSidebar,
};
