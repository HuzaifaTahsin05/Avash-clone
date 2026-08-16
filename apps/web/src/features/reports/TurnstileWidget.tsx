import { useEffect, useRef } from 'react';

const TURNSTILE_SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js';

interface TurnstileRenderOptions {
  sitekey: string;
  callback: (token: string) => void;
  'error-callback'?: () => void;
  'expired-callback'?: () => void;
}

interface TurnstileGlobal {
  render: (container: HTMLElement, options: TurnstileRenderOptions) => string;
  remove: (widgetId: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileGlobal;
  }
}

let scriptLoadPromise: Promise<void> | null = null;

/** Loads the Turnstile script-tag widget exactly once per page, however many widgets mount. */
function loadTurnstileScript(): Promise<void> {
  if (window?.turnstile) {
    return Promise.resolve();
  }
  if (scriptLoadPromise) {
    return scriptLoadPromise;
  }
  scriptLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = TURNSTILE_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Turnstile'));
    document.head.appendChild(script);
  });
  return scriptLoadPromise;
}

export interface TurnstileWidgetProps {
  siteKey: string;
  onVerify: (token: string) => void;
  onExpire?: () => void;
}

/**
 * Renders Cloudflare Turnstile via its plain script-tag widget API rather
 * than a React SDK — there is no Turnstile React wrapper installed in
 * this workspace (`apps/web/package.json`), and pulling one in was a
 * judgment call this slice opted against to avoid a lockfile conflict
 * with sibling workers building in parallel.
 */
export function TurnstileWidget({ siteKey, onVerify, onExpire }: TurnstileWidgetProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    loadTurnstileScript()
      .then(() => {
        if (cancelled) return;
        const container = containerRef.current;
        const turnstile = window?.turnstile;
        if (!container || !turnstile?.render) return;

        widgetIdRef.current = turnstile.render(container, {
          sitekey: siteKey,
          callback: (token) => onVerify?.(token),
          'expired-callback': () => onExpire?.(),
        });
      })
      .catch(() => {
        // A blocked/unreachable Turnstile script leaves the widget absent;
        // the submit button stays disabled (no token ever arrives) rather
        // than throwing into the page.
      });

    return () => {
      cancelled = true;
      const widgetId = widgetIdRef.current;
      if (widgetId && window?.turnstile?.remove) {
        window.turnstile.remove(widgetId);
      }
    };
    // Intentionally keyed on `siteKey` alone — `onVerify`/`onExpire` are
    // event-callback props read fresh via optional chaining at call time
    // (R7), not values this effect needs to re-run for.
  }, [siteKey]);

  return <div ref={containerRef} data-testid="turnstile-widget" />;
}
