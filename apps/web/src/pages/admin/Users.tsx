import { useState } from 'react';
import { appRoleSchema, type AppRole } from '@avash/types';
import { useSession } from '../../features/auth/SessionProvider';
import { useManagedUsers } from '../../features/admin/useManagedUsers';
import { useAssignRole } from '../../features/admin/useAssignRole';
import { ROLE_LABELS } from '../../features/dashboard/roleDashboards';
import '../../features/dashboard/dashboard.css';

const ROLE_OPTIONS: readonly AppRole[] = appRoleSchema.options;

/**
 * The in-app role assignment mechanism. Before this existed,
 * `app_metadata.role` could only be set by hand in the Supabase dashboard.
 *
 * The <select> writes immediately on change rather than behind a Save
 * button: there is exactly one field, the change is reversible from the
 * same control, and the table refetches from the server afterwards — so
 * what is displayed is always the role that actually stuck, never an
 * optimistic guess.
 */
export default function AdminUsers() {
  const { accessToken, user } = useSession();
  const [page, setPage] = useState(1);
  const query = useManagedUsers(accessToken, page);
  const assign = useAssignRole();

  const [pendingUserId, setPendingUserId] = useState<string | null>(null);

  const handleRoleChange = (userId: string, nextRole: string) => {
    const parsed = appRoleSchema.safeParse(nextRole);
    if (!parsed.success || !accessToken) {
      return;
    }
    setPendingUserId(userId);
    assign?.mutate?.(
      { userId, role: parsed.data, accessToken },
      { onSettled: () => setPendingUserId(null) }
    );
  };

  const users = query?.data?.users ?? [];

  return (
    <main className="page page--wide">
      <h1 className="page__title">Users &amp; roles</h1>
      <p className="page__description">
        A role change takes effect on the user’s next sign-in — the claim is baked into their session
        token when it is issued, so an already-signed-in user keeps their current role until then.
        Every change is written to the audit trail.
      </p>

      {query?.isLoading ? (
        <p data-testid="admin-users-loading">Loading…</p>
      ) : query?.isError ? (
        <div className="alert alert--error" data-testid="admin-users-error">
          Unable to load the user list right now.
        </div>
      ) : users.length === 0 ? (
        <p data-testid="admin-users-empty">No accounts yet.</p>
      ) : (
        <table className="table" data-testid="admin-users-table">
          <thead>
            <tr>
              <th>Email</th>
              <th>Role</th>
              <th>Joined</th>
              <th>Last sign-in</th>
            </tr>
          </thead>
          <tbody>
            {users.map((managed) => {
              const isSelf = managed?.id === user?.id;
              return (
                <tr
                  key={managed.id}
                  data-testid="admin-users-row"
                  className={isSelf ? 'admin-users__row--self' : undefined}
                >
                  <td data-testid="admin-users-email">
                    {managed?.email ?? '(no email)'}
                    {isSelf ? ' (you)' : ''}
                  </td>
                  <td>
                    {/* aria-label rather than a visually-hidden <label>:
                        the column header already names the control for a
                        sighted user, and this gives a screen reader the
                        row context the header alone cannot. */}
                    <select
                      aria-label={`Role for ${managed?.email ?? 'this account'}`}
                      className="admin-users__role-select"
                      data-testid="admin-users-role-select"
                      value={managed.role}
                      // An admin cannot demote themselves — the API refuses
                      // it (409) to avoid a project with zero admins and no
                      // way back in. Disabling the control says so before
                      // the round trip rather than after.
                      disabled={isSelf || pendingUserId === managed.id}
                      onChange={(event) => handleRoleChange(managed.id, event?.target?.value ?? '')}
                    >
                      {ROLE_OPTIONS.map((role) => (
                        <option key={role} value={role}>
                          {ROLE_LABELS[role] ?? role}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>{managed?.createdAt ? new Date(managed.createdAt).toLocaleDateString() : '—'}</td>
                  <td>
                    {managed?.lastSignInAt ? new Date(managed.lastSignInAt).toLocaleDateString() : 'Never'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {assign?.isError ? (
        <p className="field__error" role="alert" data-testid="admin-users-assign-error">
          {assign.error?.message ?? 'Could not change that role. Please try again.'}
        </p>
      ) : null}

      {assign?.isSuccess && !assign?.isPending ? (
        <p className="alert" role="status" data-testid="admin-users-assign-success">
          Role updated.
        </p>
      ) : null}

      {(query?.data?.nextPage ?? null) !== null || page > 1 ? (
        <div className="field">
          <button
            type="button"
            className="button button--secondary"
            disabled={page <= 1}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            data-testid="admin-users-prev"
          >
            Previous
          </button>{' '}
          <button
            type="button"
            className="button button--secondary"
            disabled={(query?.data?.nextPage ?? null) === null}
            onClick={() => setPage((current) => current + 1)}
            data-testid="admin-users-next"
          >
            Next
          </button>
        </div>
      ) : null}
    </main>
  );
}
