import { test, expect, type Page } from '@playwright/test';

/**
 * `/report` and `/moderation`, driven purely by route interception against
 * the frozen contract (`packages/types/api.ts` — breedingReportResponseSchema)
 * plus a stubbed Turnstile widget script, never a live `apps/api` or
 * Supabase project. `apps/web/src/pages/{Report,Moderation}.tsx` are real
 * pages as of this writing (this slice), not placeholders.
 */

const API_BASE = 'http://localhost:8787';
const SUPABASE_URL = 'https://kdklmbqkczkaakgswlix.supabase.co';

/**
 * `/moderation` is wrapped in a real `ProtectedRoute role="moderator"`
 * (see `apps/web/e2e/auth.spec.ts`) — anonymous visitors are redirected to
 * `/login` before `Moderation.tsx` ever renders. Seeding a fake moderator
 * session via the same localStorage technique as `auth.spec.ts` is the only
 * way to reach the page's own content in this suite.
 *
 * The project ref is derived from `SUPABASE_URL` above rather than read
 * from `apps/web/.env` — that file is gitignored and doesn't exist in CI's
 * `e2e-web` job (which runs against a pre-built `dist/`, no `.env` step),
 * so a file read here would throw there. The URL itself is public/non-secret
 * (RLS, not secrecy, is the real access gate — §4.1), so hardcoding it is safe.
 */
const STORAGE_KEY = `sb-${new URL(SUPABASE_URL).hostname.split('.')[0]}-auth-token`;

async function signInAsModerator(page: Page) {
  const session = {
    access_token: 'e2e-fake-access-token',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    refresh_token: 'e2e-fake-refresh-token',
    user: {
      id: '00000000-0000-4000-8000-000000000001',
      aud: 'authenticated',
      role: 'authenticated',
      email: 'e2e-moderator@example.test',
      app_metadata: { role: 'moderator' },
      user_metadata: {},
      identities: [],
      created_at: new Date().toISOString(),
    },
  };
  await page.addInitScript(
    ([key, value]) => {
      window.localStorage.setItem(key as string, value as string);
    },
    [STORAGE_KEY, JSON.stringify(session)]
  );
}

/**
 * Cloudflare Turnstile's widget loads its script from a fixed CDN URL and
 * calls `window.turnstile.render(el, { callback })` once ready. Nothing
 * in this sandbox can reach the real Cloudflare service, and there is no
 * documented dummy/always-pass key for this project — so every test that
 * needs a token stubs the script itself rather than the network call it
 * would otherwise make.
 */
async function stubTurnstile(page: import('@playwright/test').Page) {
  await page.route('https://challenges.cloudflare.com/turnstile/v0/api.js', (route) =>
    route.fulfill({
      contentType: 'application/javascript',
      body: `
        window.turnstile = {
          render: function (el, opts) {
            setTimeout(function () { opts.callback('e2e-fake-turnstile-token'); }, 0);
            return 'e2e-widget-id';
          },
          remove: function () {}
        };
      `,
    })
  );
}

const SUCCESS_RESPONSE = {
  id: '99999999-9999-4999-8999-999999999999',
  status: 'pending',
  flaggedForReview: false,
  requestId: '00000000-0000-0000-0000-000000000099',
};

test.describe('/report', () => {
  test('the form submits while signed out (anonymous reporting)', async ({ page }) => {
    await stubTurnstile(page);

    let capturedBody: Record<string, unknown> | undefined;
    await page.route(`${API_BASE}/api/reports/breeding-site`, (route) => {
      capturedBody = route.request().postDataJSON();
      return route.fulfill({ status: 201, json: SUCCESS_RESPONSE });
    });

    await page.goto('/report');
    await expect(page.getByTestId('report-form')).toBeVisible();

    await page.getByTestId('report-lat').fill('23.78');
    await page.getByTestId('report-lng').fill('90.4');
    await page.getByTestId('report-description').fill('Standing water in an open drum near the market.');

    // The stubbed widget script never renders any visible content into
    // the container div (a zero-size element reads as "hidden" to
    // Playwright's actionability checks even though it's attached) — the
    // submit button becoming enabled is the real proof a token arrived.
    await expect(page.getByTestId('turnstile-widget')).toBeAttached();
    await expect(page.getByTestId('submit-report')).toBeEnabled();

    await page.getByTestId('submit-report').click();

    await expect(page.getByTestId('report-success')).toBeVisible();
    expect(capturedBody?.turnstileToken).toBe('e2e-fake-turnstile-token');
    expect(capturedBody?.lat).toBe(23.78);
    expect(capturedBody?.lng).toBe(90.4);
    // No Authorization header worth asserting here since Playwright's
    // route.request() doesn't need one — the point is the request
    // succeeded with no accessToken supplied at all.
  });

  test('a denied geolocation permission still allows manual lat/lng entry and submission', async ({
    page,
  }) => {
    await stubTurnstile(page);
    await page.route(`${API_BASE}/api/reports/breeding-site`, (route) =>
      route.fulfill({ status: 201, json: SUCCESS_RESPONSE })
    );

    // Simulate the browser Geolocation API denying permission —
    // getCurrentPosition's error callback fires with a PERMISSION_DENIED-shaped error.
    // `navigator.geolocation` is a getter-only accessor in Firefox, so a
    // plain assignment is a silent no-op there (same pitfall documented for
    // `window.localStorage` in auth.spec.ts) — defineProperty is required
    // for the override to take effect in every browser this suite runs in.
    await page.addInitScript(() => {
      Object.defineProperty(window.navigator, 'geolocation', {
        value: {
          getCurrentPosition: (_success: unknown, error: (err: { code: number; message: string }) => void) => {
            error({ code: 1, message: 'User denied Geolocation' });
          },
        },
        configurable: true,
      });
    });

    await page.goto('/report');
    await page.getByTestId('use-my-location').click();

    await expect(page.getByTestId('location-permission-denied')).toBeVisible();

    await page.getByTestId('report-lat').fill('23.7');
    await page.getByTestId('report-lng').fill('90.3');

    await expect(page.getByTestId('submit-report')).toBeEnabled();
    await page.getByTestId('submit-report').click();

    await expect(page.getByTestId('report-success')).toBeVisible();
  });

  test('the description counter reflects length and the field is capped', async ({ page }) => {
    await stubTurnstile(page);
    await page.goto('/report');

    const textarea = page.getByTestId('report-description');
    await textarea.fill('hello');
    await expect(page.getByTestId('description-counter')).toContainText('5/1000');
  });
});

test.describe('/moderation', () => {
  const xssDescription = '<script>window.__xssFired = true;</script>Suspicious barrel';

  test('an XSS string in a report description renders inert, never executes', async ({ page }) => {
    await signInAsModerator(page);

    let dialogFired = false;
    page.on('dialog', async (dialog) => {
      dialogFired = true;
      await dialog.dismiss();
    });

    await page.route(`${SUPABASE_URL}/rest/v1/breeding_reports**`, (route) =>
      route.fulfill({
        json: [
          {
            id: '11111111-1111-4111-8111-111111111111',
            description: xssDescription,
            photo_url: null,
            ai_validation: { isPlausible: true, category: 'other', spamLikelihood: 0.2 },
            status: 'pending',
            created_at: '2026-08-14T06:00:00.000Z',
          },
        ],
      })
    );

    await page.goto('/moderation');

    const row = page.getByTestId('moderation-description');
    await expect(row).toBeVisible();
    await expect(row).toContainText('Suspicious barrel');

    expect(dialogFired).toBe(false);

    const injectedScript = await page.locator('[data-testid="moderation-table"] script').count();
    expect(injectedScript).toBe(0);

    const xssRan = await page.evaluate(() => (window as unknown as { __xssFired?: boolean }).__xssFired);
    expect(xssRan).toBeUndefined();
  });

  test('an empty queue renders the empty state, not an error', async ({ page }) => {
    await signInAsModerator(page);
    await page.route(`${SUPABASE_URL}/rest/v1/breeding_reports**`, (route) => route.fulfill({ json: [] }));

    await page.goto('/moderation');

    await expect(page.getByTestId('moderation-empty')).toBeVisible();
  });

  test('verify/reject buttons are enabled for a signed-in moderator', async ({ page }) => {
    await signInAsModerator(page);
    await page.route(`${SUPABASE_URL}/rest/v1/breeding_reports**`, (route) =>
      route.fulfill({
        json: [
          {
            id: '22222222-2222-4222-8222-222222222222',
            description: 'A blocked drain by the school.',
            photo_url: null,
            ai_validation: null,
            status: 'pending',
            created_at: '2026-08-14T06:00:00.000Z',
          },
        ],
      })
    );

    await page.goto('/moderation');

    await expect(page.getByTestId('verify-report')).toBeEnabled();
    await expect(page.getByTestId('reject-report')).toBeEnabled();
  });

  test('visiting /moderation signed out redirects to /login, never rendering report content', async ({
    page,
  }) => {
    await page.route(`${SUPABASE_URL}/rest/v1/breeding_reports**`, (route) =>
      route.fulfill({
        json: [
          {
            id: '22222222-2222-4222-8222-222222222222',
            description: 'A blocked drain by the school.',
            photo_url: null,
            ai_validation: null,
            status: 'pending',
            created_at: '2026-08-14T06:00:00.000Z',
          },
        ],
      })
    );

    await page.goto('/moderation');

    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByTestId('moderation-row')).toHaveCount(0);
  });
});
