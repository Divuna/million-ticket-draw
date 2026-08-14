export interface JobCategoryScope {
  autoCreated: boolean;
  requestedGroup: string;
  classifiedGroup: string | null;
}

/**
 * Automatic discovery is strict: only an exact classifier match may be saved.
 * Manual discovery keeps its existing behavior and may route a candidate to a
 * different valid category later in the worker.
 */
export function classificationMatchesJobScope(scope: JobCategoryScope): boolean {
  return !scope.autoCreated || scope.classifiedGroup === scope.requestedGroup;
}
