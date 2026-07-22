export interface IdentifiableProblem {
  id: string;
}

export function toggleProblem<T extends IdentifiableProblem>(selected: readonly T[], problem: T): T[] {
  return selected.some((item) => item.id === problem.id)
    ? selected.filter((item) => item.id !== problem.id)
    : [...selected, problem];
}

export function setCurrentPageSelected<T extends IdentifiableProblem>(
  selected: readonly T[],
  currentPage: readonly T[],
  shouldSelect: boolean,
): T[] {
  const pageIds = new Set(currentPage.map((item) => item.id));
  if (!shouldSelect) return selected.filter((item) => !pageIds.has(item.id));

  const selectedIds = new Set(selected.map((item) => item.id));
  return [...selected, ...currentPage.filter((item) => !selectedIds.has(item.id))];
}

export function isCurrentPageSelected<T extends IdentifiableProblem>(
  selected: readonly T[],
  currentPage: readonly T[],
): boolean {
  const selectedIds = new Set(selected.map((item) => item.id));
  return currentPage.length > 0 && currentPage.every((item) => selectedIds.has(item.id));
}
