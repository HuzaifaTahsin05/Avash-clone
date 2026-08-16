import { SymptomCheckerForm } from '../features/symptom-checker/SymptomCheckerForm';

export default function SymptomChecker() {
  return (
    <main className="page">
      <h1 className="page__title">Symptom Checker</h1>
      <p className="page__description">
        Answer a few questions about how you feel. A deterministic rule engine — not the AI —
        decides how urgently you should seek care.
      </p>
      <SymptomCheckerForm />
    </main>
  );
}
