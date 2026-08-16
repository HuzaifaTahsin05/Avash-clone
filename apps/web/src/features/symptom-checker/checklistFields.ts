import type { SymptomChecklist } from '@avash/types';

export interface ChecklistFieldDef {
  key: keyof SymptomChecklist;
  label: string;
  /** WHO warning signs that alone drive the deterministic engine straight to "emergency" (ADR-004). */
  severe: boolean;
}

/**
 * Human-readable labels for the 12 frozen checklist fields
 * (`packages/types/api.ts` `symptomChecklistSchema`). Grouped by the same
 * severe-sign / consult-criteria split the rule engine uses
 * (`packages/security/triage.ts`) so the form visually explains why an
 * answer matters, without the UI itself making any triage decision.
 */
export const SEVERE_SIGN_FIELDS: ChecklistFieldDef[] = [
  { key: 'severeAbdominalPain', label: 'Severe or persistent abdominal pain', severe: true },
  { key: 'persistentVomiting', label: 'Persistent vomiting', severe: true },
  { key: 'mucosalBleeding', label: 'Bleeding from the gums, nose, or other mucosal sites', severe: true },
  { key: 'lethargyOrRestlessness', label: 'Unusual lethargy or restlessness', severe: true },
  { key: 'liverEnlargement', label: 'Liver enlargement (as told by a health worker)', severe: true },
  { key: 'fluidAccumulation', label: 'Clinical signs of fluid accumulation (as told by a health worker)', severe: true },
];

export const OTHER_SYMPTOM_FIELDS: ChecklistFieldDef[] = [
  { key: 'fever', label: 'Fever', severe: false },
  { key: 'nauseaOrVomiting', label: 'Nausea or vomiting', severe: false },
  { key: 'rash', label: 'Skin rash', severe: false },
  { key: 'achesAndPains', label: 'Muscle, joint, or eye pain', severe: false },
  { key: 'positiveTourniquetTest', label: 'Positive tourniquet test (as told by a health worker)', severe: false },
  { key: 'leukopenia', label: 'Leukopenia — low white blood cell count (from a recent blood test, if known)', severe: false },
];

export const ALL_CHECKLIST_FIELDS: ChecklistFieldDef[] = [...SEVERE_SIGN_FIELDS, ...OTHER_SYMPTOM_FIELDS];
