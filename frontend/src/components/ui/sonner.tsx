import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CircleCheckIcon, InfoIcon, TriangleExclamationPointIcon, OctagonXIcon, LoaderCircleIcon } from "lucide-react"

const Toaster = ({ theme: toastTheme, ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()
  const resolvedTheme: NonNullable<ToasterProps["theme"]> =
    toastTheme ??
    (theme === "light" || theme === "dark" || theme === "system"
      ? theme
      : "system")

  return (
    <Sonner
      className="toaster group"
      icons={{
        success: (
          <CircleCheckIcon className="size-4" />
        ),
        info: (
          <InfoIcon className="size-4" />
        ),
        warning: (
          <TriangleExclamationPointIcon className="size-4" />
        ),
        error: (
          <OctagonXIcon className="size-4" />
        ),
        loading: (
          <LoaderCircleIcon className="size-4 animate-spin" />
        ),
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "cn-toast",
        },
      }}
      {...props}
      theme={resolvedTheme}
    />
  )
}

export { Toaster }
