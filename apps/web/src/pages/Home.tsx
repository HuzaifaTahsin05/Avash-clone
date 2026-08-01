export default function Home() {
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
        <p className="status-panel__item">
          <span className="status-panel__dot status-panel__dot--pending" aria-hidden="true" />
          API: not connected
        </p>
      </section>
    </main>
  );
}
