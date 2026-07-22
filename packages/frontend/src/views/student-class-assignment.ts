export interface AssignmentOption {
  id: string;
}

export function selectInitialAssignment(
  assignments: readonly AssignmentOption[],
  requestedId?: string,
): string {
  if (requestedId && assignments.some((assignment) => assignment.id === requestedId)) return requestedId;
  return assignments[0]?.id || '';
}

export function isLatestAssignmentRequest(requestId: number, latestRequestId: number): boolean {
  return requestId === latestRequestId;
}
