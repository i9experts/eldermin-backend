// Assessment Master Settings — built-in grading-scale starting points.
// An admin picks one of these as the initial band list for a new
// AssessmentGradingScale, then edits freely from there; presetKey is stored
// on the saved scale purely so the UI can show "Based on: Cambridge" - it
// never gates or re-derives anything at grading time, only `bands` does.
//
// Percentage cutoffs below are the commonly published/used conventions for
// each system, not restated verbatim from any single board's current
// official notification (boundaries can vary by subject/session for some
// boards, e.g. Cambridge and IB) - they're meant as a faithful, reasonable
// starting point a school then adjusts to match its own board's current
// circular if needed.
export interface GradingPresetBand {
  minPercent: number;
  maxPercent: number;
  label: string;
  gpaPoint?: number;
  isPassing: boolean;
}

export interface GradingPreset {
  key: string;
  name: string;
  description: string;
  bands: GradingPresetBand[];
}

export const GRADING_SCALE_PRESETS: GradingPreset[] = [
  {
    key: 'default',
    name: 'Eldermin Default',
    description: "Eldermin's long-standing built-in scale - pick this to keep today's grading exactly as it was before Master Settings existed.",
    bands: [
      { minPercent: 90, maxPercent: 100, label: 'A+', gpaPoint: 4.0, isPassing: true },
      { minPercent: 80, maxPercent: 89.99, label: 'A', gpaPoint: 3.7, isPassing: true },
      { minPercent: 70, maxPercent: 79.99, label: 'B+', gpaPoint: 3.3, isPassing: true },
      { minPercent: 60, maxPercent: 69.99, label: 'B', gpaPoint: 3.0, isPassing: true },
      { minPercent: 50, maxPercent: 59.99, label: 'C', gpaPoint: 2.0, isPassing: true },
      { minPercent: 40, maxPercent: 49.99, label: 'D', gpaPoint: 1.0, isPassing: true },
      { minPercent: 0, maxPercent: 39.99, label: 'F', gpaPoint: 0.0, isPassing: false },
    ],
  },
  {
    key: 'ib',
    name: 'IB (1–7 Point Scale)',
    description: 'International Baccalaureate style 7-point scale, commonly used by schools for internal/progress reporting (the IB itself sets exact grade boundaries per subject per exam session).',
    bands: [
      { minPercent: 90, maxPercent: 100, label: '7', gpaPoint: 4.0, isPassing: true },
      { minPercent: 80, maxPercent: 89.99, label: '6', gpaPoint: 3.5, isPassing: true },
      { minPercent: 70, maxPercent: 79.99, label: '5', gpaPoint: 3.0, isPassing: true },
      { minPercent: 60, maxPercent: 69.99, label: '4', gpaPoint: 2.5, isPassing: true },
      { minPercent: 50, maxPercent: 59.99, label: '3', gpaPoint: 2.0, isPassing: true },
      { minPercent: 40, maxPercent: 49.99, label: '2', gpaPoint: 1.0, isPassing: false },
      { minPercent: 0, maxPercent: 39.99, label: '1', gpaPoint: 0.0, isPassing: false },
    ],
  },
  {
    key: 'cambridge',
    name: 'Cambridge (IGCSE / O Level)',
    description: 'Cambridge International-style A*–G lettering used for IGCSE/O Level reporting.',
    bands: [
      { minPercent: 90, maxPercent: 100, label: 'A*', gpaPoint: 4.0, isPassing: true },
      { minPercent: 80, maxPercent: 89.99, label: 'A', gpaPoint: 3.7, isPassing: true },
      { minPercent: 70, maxPercent: 79.99, label: 'B', gpaPoint: 3.3, isPassing: true },
      { minPercent: 60, maxPercent: 69.99, label: 'C', gpaPoint: 3.0, isPassing: true },
      { minPercent: 50, maxPercent: 59.99, label: 'D', gpaPoint: 2.0, isPassing: true },
      { minPercent: 40, maxPercent: 49.99, label: 'E', gpaPoint: 1.5, isPassing: true },
      { minPercent: 30, maxPercent: 39.99, label: 'F', gpaPoint: 1.0, isPassing: false },
      { minPercent: 20, maxPercent: 29.99, label: 'G', gpaPoint: 0.5, isPassing: false },
      { minPercent: 0, maxPercent: 19.99, label: 'U', gpaPoint: 0.0, isPassing: false },
    ],
  },
  {
    key: 'aku-eb',
    name: 'AKU-EB',
    description: "Aga Khan University Examination Board's published grading scale (A-1 through F).",
    bands: [
      { minPercent: 90, maxPercent: 100, label: 'A-1', gpaPoint: 4.0, isPassing: true },
      { minPercent: 80, maxPercent: 89.99, label: 'A', gpaPoint: 3.7, isPassing: true },
      { minPercent: 70, maxPercent: 79.99, label: 'B', gpaPoint: 3.3, isPassing: true },
      { minPercent: 60, maxPercent: 69.99, label: 'C', gpaPoint: 3.0, isPassing: true },
      { minPercent: 50, maxPercent: 59.99, label: 'D', gpaPoint: 2.0, isPassing: true },
      { minPercent: 40, maxPercent: 49.99, label: 'E', gpaPoint: 1.0, isPassing: true },
      { minPercent: 0, maxPercent: 39.99, label: 'F', gpaPoint: 0.0, isPassing: false },
    ],
  },
  {
    key: 'provincial',
    name: 'Provincial Board (Matric / BISE style)',
    description: 'A typical Pakistani provincial board (BISE) matriculation-style grading band.',
    bands: [
      { minPercent: 80, maxPercent: 100, label: 'A-1', gpaPoint: 4.0, isPassing: true },
      { minPercent: 70, maxPercent: 79.99, label: 'A', gpaPoint: 3.7, isPassing: true },
      { minPercent: 60, maxPercent: 69.99, label: 'B', gpaPoint: 3.3, isPassing: true },
      { minPercent: 50, maxPercent: 59.99, label: 'C', gpaPoint: 2.5, isPassing: true },
      { minPercent: 40, maxPercent: 49.99, label: 'D', gpaPoint: 1.5, isPassing: true },
      { minPercent: 33, maxPercent: 39.99, label: 'E', gpaPoint: 1.0, isPassing: true },
      { minPercent: 0, maxPercent: 32.99, label: 'F', gpaPoint: 0.0, isPassing: false },
    ],
  },
];

export function findGradingPreset(key: string): GradingPreset | undefined {
  return GRADING_SCALE_PRESETS.find((p) => p.key === key);
}
