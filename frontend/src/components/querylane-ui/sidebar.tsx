import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { cva, type VariantProps } from "class-variance-authority";
import { PanelLeftIcon } from "lucide-react";
import {
  type ComponentProps,
  createContext,
  type RefObject,
  use,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { Button } from "@/components/querylane-ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
} from "@/components/querylane-ui/drawer";
import { useIsMobile } from "@/components/querylane-ui/use-mobile";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import styles from "./sidebar.module.css";

const SIDEBAR_WIDTH = "18rem";
const SIDEBAR_WIDTH_MOBILE = "18rem";
const SIDEBAR_WIDTH_ICON = "3rem";
const SIDEBAR_HOVER_REVEAL_TRIGGER_WIDTH = 20;
const SIDEBAR_HOVER_REVEAL_EDGE_BUFFER = 8;
const SIDEBAR_HOVER_REVEAL_CLOSE_DELAY = 80;
const SKELETON_MIN_WIDTH_PERCENT = 50;
const SKELETON_WIDTH_RANGE_PERCENT = 40;
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
          globalThis.window.innerWidth -
            sidebarWidth -
            SIDEBAR_HOVER_REVEAL_EDGE_BUFFER;
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

      const changedElements = [
        ...container.querySelectorAll<HTMLElement>(SIDEBAR_FOCUSABLE_SELECTOR),
      ].map((element) => ({
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
        "border-sidebar-border bg-sidebar text-sidebar-foreground hover:bg-sidebar-accent fixed top-1/2 z-20 hidden h-12 w-6 -translate-y-1/2 rounded-none shadow-sm focus-visible:ring-2 lg:inline-flex",
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
  const closeTimerRef = useRef<number | undefined>(undefined);

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
              globalThis.window.innerWidth - SIDEBAR_HOVER_REVEAL_TRIGGER_WIDTH;

        if (nearEdge) {
          setRevealed(true);
        }
      }

      globalThis.window.addEventListener("pointermove", handlePointerMove, {
        passive: true,
      });
      return () => {
        globalThis.window.removeEventListener("pointermove", handlePointerMove);
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
        if (closeTimerRef.current !== undefined) {
          globalThis.window.clearTimeout(closeTimerRef.current);
          closeTimerRef.current = undefined;
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
        closeTimerRef.current = globalThis.window.setTimeout(
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

      globalThis.window.addEventListener("pointermove", handlePointerMove, {
        passive: true,
      });
      globalThis.window.addEventListener("blur", handleWindowBlur);
      return () => {
        clearCloseTimer();
        globalThis.window.removeEventListener("pointermove", handlePointerMove);
        globalThis.window.removeEventListener("blur", handleWindowBlur);
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
  function setOpen(value: boolean | ((value: boolean) => boolean)) {
    const openState = typeof value === "function" ? value(open) : value;
    if (setOpenProp) {
      setOpenProp(openState);
    } else {
      setInternalOpen(openState);
    }
  }

  // Helper to toggle the sidebar.
  function toggleSidebar() {
    if (isMobile) {
      setOpenMobile((currentOpen) => !currentOpen);
    } else {
      setOpen((currentOpen) => !currentOpen);
    }
  }

  // We add a state so that we can do data-state="expanded" or "collapsed".
  // This makes it easier to style the sidebar with Tailwind classes.
  const state = open ? "expanded" : "collapsed";

  const contextValue: SidebarContextProps = {
    hoverRevealOpen,
    isMobile,
    open,
    openMobile,
    setHoverRevealOpen,
    setOpen,
    setOpenMobile,
    state,
    toggleSidebar,
  };

  return (
    <SidebarContext.Provider value={contextValue}>
      <div
        className={cn(
          "group/sidebar-wrapper has-data-[variant=inset]:bg-sidebar flex min-h-svh w-full",
          className
        )}
        data-slot="sidebar-wrapper"
        style={{
          "--sidebar-width": SIDEBAR_WIDTH,
          "--sidebar-width-icon": SIDEBAR_WIDTH_ICON,
          ...style,
        }}
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

function hasFloatingSidebarLayout(
  variant: "sidebar" | "floating" | "inset"
): boolean {
  return variant === "floating" || variant === "inset";
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
          "bg-sidebar text-sidebar-foreground flex h-full w-(--sidebar-width) flex-col",
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
      <Drawer
        onOpenChange={setOpenMobile}
        open={openMobile}
        swipeDirection={side}
      >
        <DrawerContent
          className="bg-sidebar text-sidebar-foreground w-[min(var(--sidebar-width),calc(100vw-1rem))] p-0 sm:max-w-none"
          data-mobile="true"
          data-sidebar="sidebar"
          data-slot="sidebar"
          dir={dir}
          {...props}
          style={{
            "--sidebar-width": SIDEBAR_WIDTH_MOBILE,
          }}
        >
          <div className="sr-only">
            <DrawerTitle>Sidebar</DrawerTitle>
            <DrawerDescription>Displays the mobile sidebar.</DrawerDescription>
          </div>
          <div className="flex size-full flex-col">{children}</div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <div
      className="group peer text-sidebar-foreground hidden lg:block"
      data-collapsible={state === "collapsed" ? collapsible : ""}
      data-side={side}
      data-slot="sidebar"
      data-state={state}
      data-variant={variant}
    >
      {/* This is what handles the sidebar gap on desktop */}
      <div
        className={cn(
          "relative w-(--sidebar-width) bg-transparent duration-200 ease-linear",
          styles["gap"],
          "group-data-[collapsible=offcanvas]:w-0",
          "group-data-[side=right]:rotate-180",
          hasFloatingSidebarLayout(variant)
            ? "group-data-[collapsible=icon]:w-[calc(var(--sidebar-width-icon)+(--spacing(4)))]"
            : "group-data-[collapsible=icon]:w-(--sidebar-width-icon)"
        )}
        data-slot="sidebar-gap"
      />
      <div
        aria-hidden={isHiddenOffcanvas ? true : undefined}
        className={cn(
          "fixed inset-y-0 z-10 hidden h-svh w-(--sidebar-width) duration-200 ease-linear group-data-[collapsible=offcanvas]:pointer-events-none group-data-[collapsible=offcanvas]:data-[hover-reveal=open]:pointer-events-auto group-data-[collapsible=offcanvas]:data-[hover-reveal=open]:z-30 group-data-[collapsible=offcanvas]:data-[hover-reveal=open]:shadow-2xl data-[side=left]:left-0 data-[side=left]:group-data-[collapsible=offcanvas]:-translate-x-full data-[side=left]:group-data-[collapsible=offcanvas]:data-[hover-reveal=open]:translate-x-0 data-[side=right]:right-0 data-[side=right]:group-data-[collapsible=offcanvas]:translate-x-full data-[side=right]:group-data-[collapsible=offcanvas]:data-[hover-reveal=open]:translate-x-0 lg:flex",
          styles["panel"],
          // Adjust the padding for floating and inset variants.
          hasFloatingSidebarLayout(variant)
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
          className="bg-sidebar group-data-[variant=floating]:ring-sidebar-border flex size-full flex-col group-data-[variant=floating]:rounded-lg group-data-[variant=floating]:shadow-sm group-data-[variant=floating]:ring-1"
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
        "hover:after:bg-sidebar-border absolute inset-y-0 z-20 hidden w-4 transition-all ease-linear group-data-[side=left]:-right-4 group-data-[side=right]:left-0 after:absolute after:inset-y-0 after:inset-s-1/2 after:w-[2px] sm:flex ltr:-translate-x-1/2 rtl:-translate-x-1/2",
        "in-data-[side=left]:cursor-w-resize in-data-[side=right]:cursor-e-resize",
        "group-data-[side=left]:group-data-[state=collapsed]:cursor-e-resize group-data-[side=right]:group-data-[state=collapsed]:cursor-w-resize",
        "hover:group-data-[collapsible=offcanvas]:bg-sidebar group-data-[collapsible=offcanvas]:translate-x-0 group-data-[collapsible=offcanvas]:after:left-full",
        "group-data-[side=left]:group-data-[collapsible=offcanvas]:-right-2",
        "group-data-[side=right]:group-data-[collapsible=offcanvas]:-left-2",
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
        "bg-background relative flex w-full flex-1 flex-col lg:peer-data-[variant=inset]:m-2 lg:peer-data-[variant=inset]:ml-0 lg:peer-data-[variant=inset]:rounded-xl lg:peer-data-[variant=inset]:shadow-sm lg:peer-data-[variant=inset]:peer-data-[state=collapsed]:ml-2",
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
      className={cn("bg-background h-8 w-full shadow-none", className)}
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
      className={cn("bg-sidebar-border mx-2 w-auto", className)}
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
          "text-sidebar-foreground/70 ring-sidebar-ring flex h-8 shrink-0 items-center rounded-md px-2 text-xs font-medium outline-hidden duration-200 ease-linear group-data-[collapsible=icon]:-mt-8 group-data-[collapsible=icon]:opacity-0 focus-visible:ring-2 [&>svg]:size-4 [&>svg]:shrink-0",
          styles["groupLabel"],
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
          "text-sidebar-foreground ring-sidebar-ring hover:bg-sidebar-accent hover:text-sidebar-accent-foreground absolute top-3.5 right-3 flex aspect-square w-5 items-center justify-center rounded-md p-0 outline-hidden transition-transform group-data-[collapsible=icon]:hidden after:absolute after:-inset-2 focus-visible:ring-2 md:after:hidden [&>svg]:size-4 [&>svg]:shrink-0",
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
  cn(
    "peer/menu-button group/menu-button ring-sidebar-ring hover:bg-sidebar-accent hover:text-sidebar-accent-foreground active:bg-sidebar-accent active:text-sidebar-accent-foreground data-active:bg-sidebar-accent data-active:text-sidebar-accent-foreground data-open:hover:bg-sidebar-accent data-open:hover:text-sidebar-accent-foreground flex w-full items-center gap-2 overflow-hidden rounded-md p-2 text-left text-sm outline-hidden group-has-data-[sidebar=menu-action]/menu-item:pr-8 group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:p-2! focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 data-active:font-medium [&_svg]:size-4 [&_svg]:shrink-0 [&>span:last-child]:truncate",
    styles["menuButton"]
  ),
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
        subtle: "text-sidebar-foreground/70 hover:text-sidebar-foreground",
        default: "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        outline:
          "bg-background hover:bg-sidebar-accent hover:text-sidebar-accent-foreground shadow-(--shadow-sidebar-border) hover:shadow-(--shadow-sidebar-accent)",
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
    render: Boolean(tooltip) ? <TooltipTrigger render={render} /> : render,
    state: {
      active: isActive,
      sidebar: "menu-button",
      size,
      slot: "sidebar-menu-button",
    },
  });

  if (!Boolean(tooltip)) {
    return comp;
  }

  const tooltipProps =
    typeof tooltip === "string" ? { children: tooltip } : tooltip;

  return (
    <Tooltip>
      {comp}
      <TooltipContent
        align="center"
        hidden={state !== "collapsed" || isMobile || hoverRevealOpen}
        side="right"
        {...tooltipProps}
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
          "text-sidebar-foreground ring-sidebar-ring hover:bg-sidebar-accent hover:text-sidebar-accent-foreground peer-hover/menu-button:text-sidebar-accent-foreground absolute top-1.5 right-1 flex aspect-square w-5 items-center justify-center rounded-md p-0 outline-hidden transition-transform group-data-[collapsible=icon]:hidden peer-data-[size=default]/menu-button:top-1.5 peer-data-[size=lg]/menu-button:top-2.5 peer-data-[size=sm]/menu-button:top-1 after:absolute after:-inset-2 focus-visible:ring-2 md:after:hidden [&>svg]:size-4 [&>svg]:shrink-0",
          showOnHover &&
            "peer-data-active/menu-button:text-sidebar-accent-foreground group-focus-within/menu-item:opacity-100 group-hover/menu-item:opacity-100 aria-expanded:opacity-100 md:opacity-0",
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
        "text-sidebar-foreground peer-hover/menu-button:text-sidebar-accent-foreground peer-data-active/menu-button:text-sidebar-accent-foreground pointer-events-none absolute right-1 flex h-5 min-w-5 items-center justify-center rounded-md px-1 text-xs font-medium tabular-nums select-none group-data-[collapsible=icon]:hidden peer-data-[size=default]/menu-button:top-1.5 peer-data-[size=lg]/menu-button:top-2.5 peer-data-[size=sm]/menu-button:top-1",
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
  const [width] = useState(
    () =>
      `${Math.floor(Math.random() * SKELETON_WIDTH_RANGE_PERCENT) + SKELETON_MIN_WIDTH_PERCENT}%`
  );

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
        style={{
          "--skeleton-width": width,
        }}
      />
    </div>
  );
}

function SidebarMenuSub({ className, ...props }: ComponentProps<"ul">) {
  return (
    <ul
      className={cn(
        "border-sidebar-border mx-3.5 flex min-w-0 translate-x-px flex-col gap-1 border-l px-2.5 py-0.5 group-data-[collapsible=icon]:hidden",
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
          "text-sidebar-foreground ring-sidebar-ring hover:bg-sidebar-accent hover:text-sidebar-accent-foreground active:bg-sidebar-accent active:text-sidebar-accent-foreground data-active:bg-sidebar-accent data-active:text-sidebar-accent-foreground [&>svg]:text-sidebar-accent-foreground flex h-7 min-w-0 -translate-x-px items-center gap-2 overflow-hidden rounded-md px-2 outline-hidden group-data-[collapsible=icon]:hidden focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 data-[size=md]:text-sm data-[size=sm]:text-xs [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0",
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
