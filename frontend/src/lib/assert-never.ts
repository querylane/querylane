function assertNever(value: never): never {
  throw new Error(`Unhandled value: ${String(value)}`);
}

export { assertNever };
