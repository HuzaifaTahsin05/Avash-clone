import { useMutation, useQueryClient } from '@tanstack/react-query';
import { roleAssignmentResponseSchema, type AppRole, type RoleAssignmentResponse } from '@avash/types';
import { fetchApi } from '../../lib/apiClient';
import { MANAGED_USERS_QUERY_KEY } from './useManagedUsers';

export interface AssignRoleInput {
  userId: string;
  role: AppRole;
  reason?: string;
  accessToken: string;
}

export async function assignRole(input: AssignRoleInput): Promise<RoleAssignmentResponse> {
  const result = await fetchApi(`/api/admin/users/${input.userId}/role`, roleAssignmentResponseSchema, {
    method: 'PATCH',
    body: { role: input.role, ...(input.reason ? { reason: input.reason } : {}) },
    accessToken: input.accessToken,
  });
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result.data;
}

/** Refetches the user list on success so the table shows the role that actually stuck, not the one requested. */
export function useAssignRole() {
  const queryClient = useQueryClient();
  return useMutation<RoleAssignmentResponse, Error, AssignRoleInput>({
    mutationFn: assignRole,
    onSuccess: () => {
      queryClient?.invalidateQueries?.({ queryKey: MANAGED_USERS_QUERY_KEY });
    },
  });
}
