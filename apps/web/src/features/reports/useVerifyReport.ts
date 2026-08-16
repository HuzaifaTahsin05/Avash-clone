import { useMutation, useQueryClient } from '@tanstack/react-query';
import { breedingReportResponseSchema, type BreedingReportResponse, type BreedingReportVerifyRequest } from '@avash/types';
import { fetchApi } from '../../lib/apiClient';

export interface VerifyReportInput {
  id: string;
  status: BreedingReportVerifyRequest['status'];
  accessToken: string;
}

export async function verifyReport(input: VerifyReportInput): Promise<BreedingReportResponse> {
  const result = await fetchApi(
    `/api/reports/breeding-site/${input.id}/verify`,
    breedingReportResponseSchema,
    { method: 'PATCH', body: { status: input.status }, accessToken: input.accessToken }
  );
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result.data;
}

/** Refetches the pending queue on success — a verified/rejected row must drop off the list. */
export function useVerifyReport() {
  const queryClient = useQueryClient();
  return useMutation<BreedingReportResponse, Error, VerifyReportInput>({
    mutationFn: verifyReport,
    onSuccess: () => {
      queryClient?.invalidateQueries?.({ queryKey: ['reports', 'moderation-queue'] });
    },
  });
}
