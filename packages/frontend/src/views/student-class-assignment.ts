export interface AssignmentOption {
  id: string;
}

export type AssignmentFilter = 'ALL' | 'COMPLETED' | 'INCOMPLETE';

export interface AssignmentProgressOption {
  progress: { completed: boolean };
}

export function selectInitialAssignment(
  assignments: readonly AssignmentOption[],
  requestedId?: string,
): string {
  if (requestedId && assignments.some((assignment) => assignment.id === requestedId)) return requestedId;
  return '';
}

export function filterClassAssignments<T extends AssignmentProgressOption>(
  assignments: readonly T[],
  filter: AssignmentFilter,
): T[] {
  if (filter === 'COMPLETED') return assignments.filter((assignment) => assignment.progress.completed);
  if (filter === 'INCOMPLETE') return assignments.filter((assignment) => !assignment.progress.completed);
  return [...assignments];
}

export function isLatestAssignmentRequest(requestId: number, latestRequestId: number): boolean {
  return requestId === latestRequestId;
}
