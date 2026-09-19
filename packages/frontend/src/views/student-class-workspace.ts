export interface ClassWorkspaceMembership {
  class: { id: string };
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
}

export function selectCurrentClass(
  memberships: readonly ClassWorkspaceMembership[],
  preferredClassId: string,
) {
  if (memberships.some((membership) => membership.class.id === preferredClassId)) {
    return preferredClassId;
  }

  return memberships.find((membership) => membership.status === 'APPROVED')?.class.id
    || memberships[0]?.class.id
    || '';
}

export function canViewClassAssignments(status?: ClassWorkspaceMembership['status']) {
  return status === 'APPROVED';
}
