import { useHealth } from '../features/health/useHealth';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

export default function Home() {
  const isOnline = useOnlineStatus();
  const health = useHealth();

  return (
    <main className="page">
      <h1 className="page__title">
        আভাস <span className="page__title-en">(Avash)</span>
      </h1>
      <p className="page__tagline">সুরক্ষার আগাম বার্তা — an early message of protection.</p>
      <p className="page__description">
        A dengue outbreak early-warning system for Bangladesh: a predictive
        risk map, citizen breeding-site reports, and a live hospital/blood
        resource ticker.
      </p>
      <section className="status-panel" aria-label="API connection status">
        <h2 className="status-panel__title">System status</h2>
        {!isOnline ? (
          <p className="status-panel__item" data-testid="status-offline">
            <span className="status-panel__dot status-panel__dot--offline" aria-hidden="true" />
            You are offline
          </p>
        ) : health.isLoading ? (
          <p className="status-panel__item" data-testid="status-loading">
            <span className="status-panel__dot status-panel__dot--pending" aria-hidden="true" />
            <span className="status-panel__skeleton" aria-hidden="true" />
          </p>
        ) : health.isError ? (
          <p className="status-panel__item" data-testid="status-error">
            <span className="status-panel__dot status-panel__dot--error" aria-hidden="true" />
            API: unavailable right now. Please try again later.
          </p>
        ) : (
          <p className="status-panel__item" data-testid="status-success">
            <span className="status-panel__dot status-panel__dot--ok" aria-hidden="true" />
            API: {health.data?.status ?? 'unknown'} ({health.data?.environment ?? 'unknown'},{' '}
            {health.data?.version ?? 'unknown'})
          </p>
        )}
      </section>
    </main>
  );
}
