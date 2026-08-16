import { useQuery } from '@tanstack/react-query';
import { managedUserListResponseSchema, type ManagedUserListResponse } from '@avash/types';
import { fetchApi } from '../../lib/apiClient';

export const MANAGED_USERS_QUERY_KEY = ['admin', 'users'] as const;

/**
 * Goes through `apps/api`, not Supabase directly — listing users needs the
 * Admin API, which needs the service-role key, which must never reach the
 * browser (R2). This is the one read in `apps/web` that has no
 * direct-from-Supabase alternative.
 */
export async function fetchManagedUsers(accessToken: string, page = 1): Promise<ManagedUserListResponse> {
  const result = await fetchApi(`/api/admin/users?page=${page}`, managedUserListResponseSchema, {
    accessToken,
  });
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result.data;
}

export function useManagedUsers(accessToken: string | null, page = 1) {
  return useQuery<ManagedUserListResponse, Error>({
    queryKey: [...MANAGED_USERS_QUERY_KEY, page],
    queryFn: () => fetchManagedUsers(accessToken as string, page),
    // Never fires without a token — the route 401s, and a signed-out
    // render of this page is already prevented by ProtectedRoute.
    enabled: Boolean(accessToken),
  });
}
