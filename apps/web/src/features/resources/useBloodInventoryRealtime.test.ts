import { describe, test, expect, vi, afterEach } from 'vitest';
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';

// react-dom's act() warns unless this global is set — normally done by
// React Testing Library's setup, which this repo deliberately does not use
// (docs/standards/testing.md bans RTL component-tree tests). This harness
// still needs act() to flush the effect that subscribes/unsubscribes the
// Realtime channel. Mirrors apps/web/src/features/map/useLeafletMap.test.ts.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const unsubscribeMock = vi.fn();
const removeChannelMock = vi.fn();
const onMock = vi.fn();
const subscribeMock = vi.fn();

const channelInstance = {
  on: onMock,
  subscribe: subscribeMock,
  unsubscribe: unsubscribeMock,
};

vi.mock('../../lib/supabaseClient', () => ({
  supabase: {
    channel: vi.fn(() => channelInstance),
    removeChannel: (...args: unknown[]) => removeChannelMock(...args),
  },
}));

describe('useBloodInventoryRealtime', () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;
  let unmounted = false;

  afterEach(() => {
    if (root && !unmounted) {
      act(() => {
        root?.unmount();
      });
    }
    container?.remove();
    container = null;
    root = null;
    unmounted = false;
    vi.clearAllMocks();
  });

  test('subscribes on mount and removes the channel on unmount', async () => {
    onMock.mockReturnValue(channelInstance);
    subscribeMock.mockReturnValue(channelInstance);

    const { useBloodInventoryRealtime } = await import('./useBloodInventoryRealtime');

    function Harness() {
      useBloodInventoryRealtime(() => {});
      return null;
    }

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    act(() => {
      root?.render(createElement(Harness));
    });

    expect(onMock).toHaveBeenCalledWith(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'blood_inventory' },
      expect.any(Function)
    );
    expect(subscribeMock).toHaveBeenCalledTimes(1);
    expect(removeChannelMock).not.toHaveBeenCalled();

    act(() => {
      root?.unmount();
    });
    unmounted = true;

    expect(removeChannelMock).toHaveBeenCalledTimes(1);
    expect(removeChannelMock).toHaveBeenCalledWith(channelInstance);
  });
});
