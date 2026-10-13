import type { DescMessage, JsonValue, MessageShape } from "@bufbuild/protobuf";

export type ProtoFormValues<T> = T extends { $typeName: "google.protobuf.Timestamp" | "google.protobuf.Duration" }
  ? string
  : T extends { $typeName: "google.protobuf.FieldMask" }
    ? string[]
    : T extends { $typeName: "google.protobuf.Any" }
      ? { typeUrl?: string; valueBase64?: string }
      : T extends { $typeName: "google.protobuf.Struct" | "google.protobuf.Value" | "google.protobuf.ListValue" }
        ? JsonValue
        : T extends bigint | Uint8Array
          ? string
          : T extends (infer Item)[]
            ? ProtoFormValues<Item>[]
            : T extends object
              ? string extends keyof T
                ? { key: string; value: ProtoFormValues<T[string]> }[] | { [key: string]: ProtoFormValues<T[string]> }
                : true extends IsProtoOneof<T>
                  ? { [Key in keyof FlattenOneof<T>]: ProtoFormValues<FlattenOneof<T>[Key]> }
                  : { [Key in keyof T as Key extends `$${string}` ? never : Key]: ProtoFormValues<T[Key]> }
              : T;

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

export type ProtoFormShape<Desc extends DescMessage> = DescMessage extends Desc
  ? Record<string, unknown>
  : {
      [Key in keyof Omit<MessageShape<Desc>, "$typeName" | "$unknown">]: ProtoFormValues<MessageShape<Desc>[Key]>;
    };
