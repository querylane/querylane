import "react";

declare module "react" {
  interface CSSProperties
    extends Record<`--${string}`, string | number | undefined> {}
}
