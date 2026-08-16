import { describe, test, expect } from 'vitest';
import { assessTriage, type TriageInput } from '../triage';

const noSigns: TriageInput = {
  fever: false,
  severeAbdominalPain: false,
  persistentVomiting: false,
  mucosalBleeding: false,
  lethargyOrRestlessness: false,
  liverEnlargement: false,
  fluidAccumulation: false,
  nauseaOrVomiting: false,
  rash: false,
  achesAndPains: false,
  positiveTourniquetTest: false,
  leukopenia: false,
};

const SEVERE_SIGNS: (keyof TriageInput)[] = [
  'severeAbdominalPain',
  'persistentVomiting',
  'mucosalBleeding',
  'lethargyOrRestlessness',
  'liverEnlargement',
  'fluidAccumulation',
];

const CONSULT_CRITERIA: (keyof TriageInput)[] = [
  'nauseaOrVomiting',
  'rash',
  'achesAndPains',
  'positiveTourniquetTest',
  'leukopenia',
];

describe('assessTriage — severe signs → emergency', () => {
  for (const sign of SEVERE_SIGNS) {
    test(`${sign} alone triggers emergency`, () => {
      expect(assessTriage({ ...noSigns, [sign]: true })).toBe('emergency');
    });
  }

  test('a severe sign outranks fever + consult criteria', () => {
    expect(
      assessTriage({
        ...noSigns,
        fever: true,
        nauseaOrVomiting: true,
        rash: true,
        mucosalBleeding: true,
      })
    ).toBe('emergency');
  });
});

describe('assessTriage — fever + consult criteria boundary', () => {
  test('fever + 1 criterion → monitor (below threshold)', () => {
    expect(assessTriage({ ...noSigns, fever: true, rash: true })).toBe('monitor');
  });

  test('fever + exactly 2 criteria → consult-24h', () => {
    expect(assessTriage({ ...noSigns, fever: true, rash: true, achesAndPains: true })).toBe(
      'consult-24h'
    );
  });

  test('fever + all 5 criteria → consult-24h', () => {
    const allCriteria = Object.fromEntries(CONSULT_CRITERIA.map((key) => [key, true]));
    expect(assessTriage({ ...noSigns, fever: true, ...allCriteria })).toBe('consult-24h');
  });

  test('2 criteria without fever → monitor', () => {
    expect(assessTriage({ ...noSigns, rash: true, achesAndPains: true })).toBe('monitor');
  });
});

describe('assessTriage — monitor and edge inputs', () => {
  test('no signs at all → monitor', () => {
    expect(assessTriage(noSigns)).toBe('monitor');
  });

  test('empty input → monitor, missing fields treated as false', () => {
    expect(assessTriage({})).toBe('monitor');
  });

  test('a partial checklist missing a severe-sign field never escalates on the missing field', () => {
    const { mucosalBleeding: _mucosalBleeding, ...partial } = noSigns;
    expect(assessTriage(partial)).toBe('monitor');
  });
});
