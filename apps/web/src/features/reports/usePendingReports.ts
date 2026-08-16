import { useQuery } from '@tanstack/react-query';
import { aiValidationSchema, type AiValidation } from '@avash/types';
import { supabase } from '../../lib/supabaseClient';

export interface PendingReportRow {
  id: string;
  description: string | null;
  photo_url: string | null;
  ai_validation: AiValidation | null;
  status: string;
  created_at: string;
}

/**
 * Reads the moderation queue directly from Supabase (design decision,
 * see docs/features/breeding-reports.md) rather than through
 * `apps/api` — the `breeding_reports_select_moderation` RLS policy
 * already in the frozen migration is what makes this safe: only a
 * signed-in moderator/admin's session can see pending rows here, the
 * same anon-key + session pattern other public-read features use.
 */
export async function fetchPendingReports(): Promise<PendingReportRow[]> {
  const { data, error } = await supabase
    .from('breeding_reports')
    .select('id, description, photo_url, ai_validation, status, created_at')
    .eq('status', 'pending')
    .order('created_at', { ascending: true });

  if (error) {
    throw new Error('Unable to load the moderation queue.');
  }

  // `ai_validation` is untrusted JSON straight from the DB (not routed
  // through apps/api's zod-validated responses) — a malformed or
  // legacy-shaped blob must never be trusted as the frozen AiValidation
  // shape, so it's re-validated here and dropped to null on mismatch
  // rather than cast.
  return (data ?? []).map((row) => {
    const parsed = aiValidationSchema.safeParse(row.ai_validation);
    return {
      id: row.id,
      description: row.description,
      photo_url: row.photo_url,
      status: row.status,
      created_at: row.created_at,
      ai_validation: parsed.success ? parsed.data : null,
    };
  });
}

export function usePendingReports() {
  return useQuery<PendingReportRow[], Error>({
    queryKey: ['reports', 'moderation-queue'],
    queryFn: fetchPendingReports,
  });
}
