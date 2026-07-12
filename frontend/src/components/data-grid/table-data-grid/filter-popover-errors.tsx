interface FilterErrorsProps {
  errors: string[];
}

function FilterErrors({ errors }: FilterErrorsProps) {
  if (errors.length === 0) {
    return null;
  }
  return (
    <div className="border-t px-3.5 py-2.5">
      <ul className="list-disc space-y-1 pl-5 text-destructive text-xs">
        {errors.map((error) => (
          <li key={error}>{error}</li>
        ))}
      </ul>
    </div>
  );
}

export { FilterErrors };
