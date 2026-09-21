// Single source of truth for the "framework" enum shared by Curriculum,
// Syllabus, and SloTemplate. Before this, each of those three schemas (plus
// the Syllabus/SloTemplate DTOs) hardcoded its own copy of this list, and
// they had quietly drifted apart: Curriculum allowed 'islamic'/'hybrid' but
// not 'national-pk'; Syllabus and SloTemplate allowed 'national-pk' but not
// 'islamic'/'hybrid'. The frontend's single Create Curriculum form defaults
// to 'national-pk' - which Curriculum's schema rejected outright, so every
// first attempt to create a curriculum without manually changing the
// dropdown failed with a Mongoose validation error. Importing this shared
// array everywhere means the three can never diverge like that again.
export const CURRICULUM_FRAMEWORKS = [
  'national-pk', 'cambridge', 'ib', 'american', 'national', 'islamic', 'hybrid', 'custom',
] as const;

export type CurriculumFramework = (typeof CURRICULUM_FRAMEWORKS)[number];
