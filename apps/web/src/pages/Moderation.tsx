import { SPAM_LIKELIHOOD_REJECT_THRESHOLD } from '@avash/types';
import { useSession } from '../features/auth/SessionProvider';
import { usePendingReports } from '../features/reports/usePendingReports';
import { useVerifyReport } from '../features/reports/useVerifyReport';

export default function Moderation() {
  const { accessToken } = useSession();
  const queue = usePendingReports();
  const verify = useVerifyReport();

  const handleDecision = (id: string, status: 'verified' | 'rejected') => {
    if (!accessToken) return;
    verify?.mutate?.({ id, status, accessToken });
  };

  return (
    <main className="page page--wide">
      <h1 className="page__title">Moderation queue</h1>
      <p className="page__description">Pending citizen breeding-site reports awaiting review.</p>

      {queue?.isLoading ? (
        <p data-testid="moderation-loading">Loading…</p>
      ) : queue?.isError ? (
        <div className="alert alert--error" data-testid="moderation-error">
          Unable to load the moderation queue right now.
        </div>
      ) : (queue?.data ?? []).length === 0 ? (
        <p data-testid="moderation-empty">No pending reports.</p>
      ) : (
        <table className="table" data-testid="moderation-table">
          <thead>
            <tr>
              <th>Description</th>
              <th>Flag</th>
              <th>Reported</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {(queue?.data ?? []).map((report) => {
              const spamLikelihood = report?.ai_validation?.spamLikelihood ?? 0;
              const flagged = spamLikelihood > SPAM_LIKELIHOOD_REJECT_THRESHOLD;
              return (
                <tr key={report.id} data-testid="moderation-row">
                  <td data-testid="moderation-description">{report?.description ?? '(no description)'}</td>
                  <td>
                    {flagged ? <span className="badge badge--severe">Flagged for review</span> : null}
                  </td>
                  <td>{report?.created_at ? new Date(report.created_at).toLocaleString() : '—'}</td>
                  <td>
                    <button
                      type="button"
                      className="button"
                      onClick={() => handleDecision(report.id, 'verified')}
                      disabled={!accessToken || verify?.isPending}
                      data-testid="verify-report"
                    >
                      Verify
                    </button>{' '}
                    <button
                      type="button"
                      className="button button--secondary"
                      onClick={() => handleDecision(report.id, 'rejected')}
                      disabled={!accessToken || verify?.isPending}
                      data-testid="reject-report"
                    >
                      Reject
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {verify?.isError ? (
        <p className="field__error" data-testid="verify-error">
          {verify.error?.message ?? 'Something went wrong. Please try again.'}
        </p>
      ) : null}
    </main>
  );
}
