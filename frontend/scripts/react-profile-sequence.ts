// Measurement order is part of the protocol: parallel execution invalidates pairs.
export function profileSeries<T, R>(
  items: readonly T[],
  collect: (item: T) => Promise<R>
): Promise<R[]> {
  return items.reduce<Promise<R[]>>(
    (pending, item) =>
      pending.then((results) =>
        collect(item).then((result) => {
          results.push(result);
          return results;
        })
      ),
    Promise.resolve([])
  );
}
