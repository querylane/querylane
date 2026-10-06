type IsProtoOneof<T> = T extends { case: string; value: infer _V }
  ? { case: undefined; value?: undefined } extends T
    ? true
    : false
  : false;

type UnionToIntersection<U> = (U extends unknown ? (k: U) => void : never) extends (k: infer I) => void ? I : never;

interface FlattenOneof<T> {
  case: T extends { case: infer C } ? C : never;
  value: UnionToIntersection<T extends { case: string; value: infer V } ? V : never> | undefined;
}

export type FlattenProtoOneofs<T> = T extends (infer U)[]
  ? FlattenProtoOneofs<U>[]
  : T extends object
    ? true extends IsProtoOneof<T>
      ? { [K in keyof FlattenOneof<T>]: FlattenProtoOneofs<FlattenOneof<T>[K]> }
      : { [K in keyof T]: FlattenProtoOneofs<T[K]> }
    : T;
