type Predicate = () => unknown;

function allPredicates(...predicates: readonly Predicate[]): boolean {
  return predicates.every((predicate) => Boolean(predicate()));
}

function anyPredicate(...predicates: readonly Predicate[]): boolean {
  return predicates.some((predicate) => Boolean(predicate()));
}

export { allPredicates, anyPredicate };
