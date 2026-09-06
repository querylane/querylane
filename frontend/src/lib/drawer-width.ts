/**
 * Shared width for right-side detail drawers: 45% of the viewport, clamped
 * between 34rem and 60rem, and never wider than the viewport itself.
 */
const DETAIL_DRAWER_WIDTH_CLASS =
  "data-[side=right]:w-[min(calc(100vw-1rem),clamp(34rem,45vw,60rem))] data-[side=right]:sm:max-w-none";

export { DETAIL_DRAWER_WIDTH_CLASS };
