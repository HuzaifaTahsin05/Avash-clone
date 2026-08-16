import { useMutation } from '@tanstack/react-query';
import {
  symptomCheckResponseSchema,
  type SymptomCheckRequest,
  type SymptomCheckResponse,
} from '@avash/types';
import { fetchApi } from '../../lib/apiClient';

/** Exported separately so the request logic is testable without rendering a component tree. */
export async function submitSymptomCheck(payload: SymptomCheckRequest): Promise<SymptomCheckResponse> {
  const result = await fetchApi('/api/symptom-check', symptomCheckResponseSchema, {
    method: 'POST',
    body: payload,
  });
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result.data;
}

export function useSymptomCheck() {
  return useMutation<SymptomCheckResponse, Error, SymptomCheckRequest>({
    mutationFn: submitSymptomCheck,
  });
}
