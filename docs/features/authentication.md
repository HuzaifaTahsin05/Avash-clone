# Authentication

Follows the mandatory template from `docs/PROJECT_PLAN.md` §12.

**Gist:** `apps/web` gains real sign-in/sign-up/sign-out against Supabase
Auth, a `SessionProvider` that tracks the current session and derived
role, and a `ProtectedRoute` that gates `/moderation` in the UI. **None of
this is the real security boundary.** The client-side gate exists purely
to avoid flashing content a visitor cannot use — the actual enforcement
is the Worker's `auth` middleware (`apps/api`, already shipped and
tested) verifying the JWT on every request, plus Postgres Row Level
Security on every table. A user who bypasses this UI entirely (curl,
DevTools, a patched build) gets exactly the same server-side rejection
as one who navigates through it normally.

**Technical Detail:**

- `apps/web/src/features/auth/SessionProvider.tsx` reads the current
  session via `supabase.auth.getSession()` on mount and stays in sync via
  `supabase.auth.onAuthStateChange()`, unsubscribing on unmount. It
  exposes `{ session, user, role, accessToken, status }` through the
  `useSession()` hook (re-exported from `useSession.ts`, which owns the
  context/type definitions; `SessionProvider.tsx` owns the subscription
  logic — kept as two files so `Header.tsx`'s existing
  `import { useSession } from '../features/auth/SessionProvider'` needed
  no change). `status` is `'loading'` until the initial `getSession()`
  settles; this is what stops `ProtectedRoute` from flashing a redirect
  or protected content before the session is actually known. Every access
  into `session`/`user`/`app_metadata` is optional-chained — the session
  object comes from a token this app does not fully control, and a
  malformed or partial shape (including a session object with no `user`
  at all) resolves to `anonymous`, never throws.
- **Role mechanism.** `role` comes from `readAppRole()`
  (`@avash/security`), applied to `session.user` directly — Supabase's
  JS client already decodes the JWT for you and exposes its custom
  claims at `session.user.app_metadata`, which is exactly the shape
  `readAppRole()` expects (`APP_ROLE_CLAIM_PATH` = `app_metadata.role`).
  **There is no in-app UI for granting a role.** Setting
  `app_metadata = {"role": "moderator"}` on a user is a deliberate manual
  step, done server-side only via Supabase's dashboard or the admin API
  (which requires the service-role key — never callable from `apps/web`).
  This is intentional: `app_metadata` is not writable by the client
  (unlike `user_metadata`), so a signed-in user cannot self-grant a role
  by any client-side action, scripted or otherwise.
- **Sign-in / sign-up / sign-out**
  (`SignInForm.tsx`, `SignUpForm.tsx`, `useSignIn.ts`, `useSignOut.ts`)
  wrap `supabase.auth.signInWithPassword`, `signUp`, and `signOut`.
  Every failure path renders one of a small fixed set of generic strings
  (`SIGN_IN_GENERIC_ERROR`, `SIGN_UP_GENERIC_ERROR`,
  `SIGN_OUT_GENERIC_ERROR`) — Supabase's own `error.message` is read only
  to decide *that* something failed, never rendered into the DOM. Grepping
  `apps/web/src/features/auth` for `error.message` returns nothing but the
  comments documenting this rule.
  Sign-up shows the same "check your email to confirm your account"
  success state on every non-throwing outcome, including when the address
  is already registered, so the form never discloses account existence
  (`docs/security/threat-model.md`'s account-enumeration mitigation
  pattern). Forms use the shared `.form`/`.field`/`.button`/`.alert`
  primitives from `apps/web/src/styles/global.css`; inputs are labelled,
  keyboard-operable (native `<form>`/`<input>`/`<button>`, no custom
  key handling needed), and each form has an `aria-live` region that
  stays mounted at a stable DOM position so a screen reader announces an
  error the instant it appears rather than only on next focus.
- `ProtectedRoute.tsx` renders `null` while `status === 'loading'` (never
  a redirect or the page's content), redirects to `/login` with the
  attempted path preserved in router state (`location.state.from`) when
  `anonymous`, and renders a generic "Access restricted" page — never a
  redirect loop — when authenticated but lacking the required role. A
  route requiring `role="moderator"` also admits `role="admin"`, via
  `@avash/security`'s `isModerator()`, matching `Header.tsx`'s existing
  `role === 'moderator' || role === 'admin'` check for the nav link.
- `Login.tsx` composes `SignInForm`/`SignUpForm` behind a tab toggle; a
  successful sign-in navigates to `location.state.from` if the visitor
  arrived via a redirect from `ProtectedRoute`, otherwise `/`.

**Driving a signed-in session in Playwright.** No seeded Supabase test
user's credentials were available in this worktree's `.env`/`.dev.vars`,
so `apps/web/e2e/auth.spec.ts` does not call `signInWithPassword` against
a live project. Instead it pre-loads the exact `localStorage` entry
`@supabase/supabase-js` itself writes after a real sign-in —
`sb-<project-ref>-auth-token`, holding the `Session` object verbatim
(verified directly against `SupabaseClient.ts`'s `defaultStorageKey`
derivation and `GoTrueClient.ts`'s `_saveSession`, which stores the
session with no wrapper). This is deterministic and makes no network
call, unlike mocking the GoTrue REST API via `page.route` (that surface
is undocumented and would need every endpoint the client's internal
retry/refresh logic might hit). One spec in that file — the "protected
page renders no data before the session resolves" case — additionally
replaces `window.localStorage` with a version whose `getItem` resolves
after a controlled delay (verified against `supportsLocalStorage()`,
which only probes `setItem`/`removeItem` before adopting it, and
`getItemAsync()`, which `await`s whatever `storage.getItem` returns) so
the otherwise sub-100ms `loading` window can be observed with web-first
assertions instead of an arbitrary `waitForTimeout`.

**Critical Constants:**

| Constant | Value | Defined in | Purpose |
|---|---|---|---|
| `APP_ROLE_CLAIM_PATH` | `app_metadata.role` | `packages/security/roles.ts` | where a custom role lives in the decoded Supabase JWT |
| `AppRole` | `'moderator' \| 'admin'` | `packages/security/roles.ts` | the only two roles the client (and the Worker) recognize |
| `SIGN_IN_GENERIC_ERROR` | fixed string | `apps/web/src/features/auth/useSignIn.ts` | the only text a failed sign-in ever renders |
| `SIGN_UP_GENERIC_ERROR` | fixed string | `apps/web/src/features/auth/SignUpForm.tsx` | the only text a failed sign-up ever renders |
| `SIGN_OUT_GENERIC_ERROR` | fixed string | `apps/web/src/features/auth/useSignOut.ts` | the only text a failed sign-out ever renders |

**Security Considerations:**

STRIDE analysis, mirrored into `docs/security/threat-model.md`:

- *Spoofing:* a forged or replayed session on the client. Not mitigated
  here by design — the client's `role`/`status` are UX signals only.
  Every `apps/api` route re-verifies the JWT itself (already shipped);
  a tampered client-side session grants no server-side access.
- *Tampering:* a user editing their own `user_metadata` (which
  Supabase *does* let a signed-in user write) to try to claim a role.
  Mitigated because `readAppRole()` and the Worker's `auth` middleware
  both read only `app_metadata`, which is server-writable exclusively —
  `user_metadata` is a different claim entirely and is never consulted
  for authorization.
- *Information disclosure:* rendering a raw Supabase error (e.g.
  "Invalid login credentials" vs. some other failure) into the DOM,
  or a sign-up success/failure distinction, either of which lets an
  attacker enumerate registered emails. Mitigated by the fixed generic
  message set on every auth failure path and the uniform "check your
  email" success state on sign-up regardless of whether the address was
  already registered.
- *Denial of service:* rapid-fire sign-in/sign-up attempts. Not
  mitigated in this slice — Supabase Auth's own rate limiting applies,
  and `apps/api` routes have their own independent rate-limit middleware
  for anything past the initial auth handshake. No additional
  client-side throttling was added; flagged as an open item below.
- *Elevation of privilege:* a signed-in non-moderator navigating directly
  to `/moderation`. Mitigated in the UI by `ProtectedRoute`'s no-access
  page (never a redirect loop, never the protected content), and for
  real — not just in the UI — by every `/api/moderation/*` route's own
  `auth` middleware check plus RLS, which this slice does not touch and
  does not need to: it was already frozen and tested before this slice
  started.

**Open item — no client-side sign-in throttling (flagged, not resolved).**
Nothing in `apps/web` currently rate-limits repeated failed sign-in
attempts from the same browser tab beyond whatever Supabase Auth itself
enforces server-side. Left open; revisit if abuse is observed.

**Manual Test Log:**

2026-08-16. Automated coverage: `apps/web/src/features/auth/*.test.ts`
(Vitest, jsdom — session derivation, role resolution, unsubscribe-on-
unmount, and the sign-in generic-error-only rendering path) and
`apps/web/e2e/auth.spec.ts` (Playwright, both Chromium and Firefox
projects — signed-out redirect to `/login`, no-access page for a
signed-in non-moderator with the URL unchanged, moderation nav link
presence/absence by role, and the no-flash-before-resolution assertion
described above). All specs passed locally against `pnpm preview` at
the time of writing. The three-pass manual protocol
(`docs/standards/testing.md`) was not run against a live Supabase
project in this worktree — no test-user credentials were available —
and is called out here rather than assumed done. Reviewer sign-off
pending.
