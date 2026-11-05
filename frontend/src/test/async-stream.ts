/** In-memory RPC streams with explicit asynchronous iteration and cancellation. */
function streamOf<T>(...items: T[]): AsyncIterable<T> {
  return {
    [Symbol.asyncIterator]() {
      const iterator = items[Symbol.iterator]();
      let closed = false;
      return {
        next(): Promise<IteratorResult<T>> {
          return Promise.resolve(
            closed ? { done: true, value: undefined } : iterator.next()
          );
        },
        return(): Promise<IteratorResult<T>> {
          closed = true;
          return Promise.resolve({ done: true, value: undefined });
        },
      };
    },
  };
}

function rejectedStream(error: Error): AsyncIterable<never> {
  return {
    [Symbol.asyncIterator]() {
      let closed = false;
      return {
        next(): Promise<IteratorResult<never>> {
          if (closed) {
            return Promise.resolve({ done: true, value: undefined });
          }
          closed = true;
          return Promise.reject(error);
        },
        return(): Promise<IteratorResult<never>> {
          closed = true;
          return Promise.resolve({ done: true, value: undefined });
        },
      };
    },
  };
}

export { rejectedStream, streamOf };
