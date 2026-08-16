import { useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';

export type RealtimeStatus = 'connecting' | 'live' | 'unavailable';

export interface BloodInventoryChangePayload {
  inventoryId: number | null;
  hospitalId: string | null;
  bloodGroup: string | null;
  unitsAvailable: number | null;
  plateletUnits: number | null;
  updatedAt: string | null;
}

/**
 * `postgres_changes` payloads are untrusted at the type level (R7) even
 * though they come from our own DB — the Realtime wire format is JSON,
 * not the DTO schema, so every field gets optional chaining plus a
 * runtime `typeof` check rather than a cast.
 */
function toChangePayload(row: unknown): BloodInventoryChangePayload {
  const r = row as Record<string, unknown> | null | undefined;
  return {
    inventoryId: typeof r?.id === 'number' ? r.id : null,
    hospitalId: typeof r?.hospital_id === 'string' ? r.hospital_id : null,
    bloodGroup: typeof r?.blood_group === 'string' ? r.blood_group : null,
    unitsAvailable: typeof r?.units_available === 'number' ? r.units_available : null,
    plateletUnits: typeof r?.platelet_units === 'number' ? r.platelet_units : null,
    updatedAt: typeof r?.updated_at === 'string' ? r.updated_at : null,
  };
}

/**
 * Subscribes to `postgres_changes` on `blood_inventory` directly against
 * Supabase (ADR-010) — never proxied through the Worker. Returns a status
 * ('connecting' until the channel confirms, 'live' once subscribed,
 * 'unavailable' on error/timeout/close) so the page can show a "live
 * updates unavailable" message and keep rendering the last fetched list
 * rather than going blank. The channel is removed on unmount.
 */
export function useBloodInventoryRealtime(
  onChange: (payload: BloodInventoryChangePayload) => void
): RealtimeStatus {
  const [status, setStatus] = useState<RealtimeStatus>('connecting');
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    const channel = supabase
      .channel('blood_inventory-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'blood_inventory' },
        (payload) => {
          const row = (payload as { new?: unknown; old?: unknown } | undefined)?.new ?? payload?.old;
          onChangeRef.current(toChangePayload(row));
        }
      )
      .subscribe((subscribeStatus) => {
        if (subscribeStatus === 'SUBSCRIBED') {
          setStatus('live');
        } else if (
          subscribeStatus === 'CHANNEL_ERROR' ||
          subscribeStatus === 'TIMED_OUT' ||
          subscribeStatus === 'CLOSED'
        ) {
          setStatus('unavailable');
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return status;
}
