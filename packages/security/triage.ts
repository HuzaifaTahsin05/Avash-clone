/**
 * The deterministic WHO triage rule engine (ADR-004, Appendix B). The LLM
 * never makes this decision — it only maps free text to this checklist
 * shape upstream. Pure function: no I/O, no async, no dependency
 * injection. Every branch is individually tested (packages/security/test/triage.test.ts).
 */

export interface TriageInput {
  fever: boolean;
  severeAbdominalPain: boolean;
  persistentVomiting: boolean;
  mucosalBleeding: boolean;
  lethargyOrRestlessness: boolean;
  liverEnlargement: boolean;
  fluidAccumulation: boolean;
  nauseaOrVomiting: boolean;
  rash: boolean;
  achesAndPains: boolean;
  positiveTourniquetTest: boolean;
  leukopenia: boolean;
}

export type TriageOutcome = 'emergency' | 'consult-24h' | 'monitor';

export const TRIAGE_OUTCOME_EMERGENCY: TriageOutcome = 'emergency';
export const TRIAGE_OUTCOME_CONSULT_24H: TriageOutcome = 'consult-24h';
export const TRIAGE_OUTCOME_MONITOR: TriageOutcome = 'monitor';

const SEVERE_SIGN_KEYS: readonly (keyof TriageInput)[] = [
  'severeAbdominalPain',
  'persistentVomiting',
  'mucosalBleeding',
  'lethargyOrRestlessness',
  'liverEnlargement',
  'fluidAccumulation',
];

const CONSULT_CRITERIA_KEYS: readonly (keyof TriageInput)[] = [
  'nauseaOrVomiting',
  'rash',
  'achesAndPains',
  'positiveTourniquetTest',
  'leukopenia',
];

/**
 * The engine's output is the response — Gemini's output never overrides
 * it (ADR-004). Real branch bodies land with the symptom-checker slice;
 * this signature is frozen here because packages/types and the route both
 * reference it.
 */
export function assessTriage(input: Partial<TriageInput>): TriageOutcome {
  const hasSevereSign = SEVERE_SIGN_KEYS.some((key) => input?.[key] === true);
  if (hasSevereSign) {
    return TRIAGE_OUTCOME_EMERGENCY;
  }

  const consultCriteriaCount = CONSULT_CRITERIA_KEYS.filter((key) => input?.[key] === true).length;
  if (input?.fever === true && consultCriteriaCount >= 2) {
    return TRIAGE_OUTCOME_CONSULT_24H;
  }

  return TRIAGE_OUTCOME_MONITOR;
}
