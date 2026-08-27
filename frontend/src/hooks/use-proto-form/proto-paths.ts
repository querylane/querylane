type IsProtoOneof<T> = T extends { case: string; value: infer _V }
  ? { case: undefined; value?: undefined } extends T
    ? true
    : false
  : false;

/**
 * Converts a union to an intersection via distributive conditional types.
 * Used to merge all oneof branch value types so that Path<T> can resolve
 * properties from ANY branch, not just properties shared across ALL branches.
 */
type UnionToIntersection<U> = (
  U extends unknown
    ? (k: U) => void
    : never
) extends (k: infer I) => void
  ? I
  : never;

/**
 * Extracts all non-undefined `value` types from a proto oneof union,
 * then collapses the union into a single flat object with:
 *   case: all case string literals | undefined
 *   value: intersection of all value types | undefined
 *
 * The intersection (not union) is critical: with a union, Path<T> can only
 * resolve properties shared across ALL branches (often none). With an
 * intersection, Path<T> can resolve properties from ANY branch, enabling
 * paths like `authConfig.auth.value.keyRef` without type casts.
 *
 * This intentionally drops the case-to-value correlation constraint.
 * Runtime validation via createProtoResolver still enforces correctness.
 */
interface FlattenOneof<T> {
  case: T extends { case: infer C } ? C : never;
  value:
    | UnionToIntersection<
        T extends { case: string; value: infer V } ? V : never
      >
    | undefined;
}

/**
 * Recursively walks a type and flattens any proto oneof unions it finds.
 * Non-oneof fields pass through unchanged. Arrays and tuples are traversed.
 */
export type FlattenProtoOneofs<T> = T extends (infer U)[]
  ? FlattenProtoOneofs<U>[]
  : T extends object
    ? true extends IsProtoOneof<T>
      ? { [K in keyof FlattenOneof<T>]: FlattenProtoOneofs<FlattenOneof<T>[K]> }
      : { [K in keyof T]: FlattenProtoOneofs<T[K]> }
    : T;
