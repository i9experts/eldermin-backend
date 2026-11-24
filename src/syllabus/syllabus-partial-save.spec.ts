import * as mongoose from 'mongoose';
import { SyllabusSchema } from './schemas/syllabus.schema';

// Reproduces the real cause of "Internal server error" when marking a
// topic/sub-topic covered (or generating a pacing guide, or any other
// small edit) on an otherwise-fine syllabus: by default, Mongoose's
// `.save()` checks every REQUIRED path in the whole document, not just
// the ones actually changed - so a single legacy/imported lesson
// elsewhere in the same syllabus (saved before `type` became a required
// enum field, for example) silently failed validation on every save of
// that document from then on, even a save that never touched that
// lesson at all. A Mongoose ValidationError thrown from inside the
// service is a plain Error, not an HttpException, so the global
// exception filter turns it into the generic, undiagnosable 500
// "Internal server error" (see src/filters/sentry.filter.ts) - the
// admin had no way to tell this apart from a real server bug.
// `saveSyllabus`'s `{ validateModifiedOnly: true }` is the fix: only
// the paths actually changed need to be valid; pre-existing, untouched
// data elsewhere in the document is left alone.
//
// No DB connection is used or needed - Mongoose validates a document
// BEFORE it ever tries to talk to the database, so validateSync against
// a model compiled straight from the real schema is enough to prove
// this, offline, the same technique used elsewhere in this repo (see
// behaviour-model-names-bb12.spec.ts). `Model.hydrate()` (rather than
// `new Model()`) is used to build each document because it, like a real
// `findOne()` result, starts with nothing "modified" - a brand-new,
// unsaved document would report every field as modified regardless of
// what's mutated next, which would make these tests pass for the wrong
// reason.
const SyllabusModel = mongoose.model('SyllabusPartialSaveTest', SyllabusSchema);

function syllabusWithLegacyBadLesson() {
  const fresh = new SyllabusModel({
    tenantId: new mongoose.Types.ObjectId(),
    institutionId: new mongoose.Types.ObjectId(),
    subjectName: 'English Language',
    gradeLevel: 'PRE K-2',
    academicYearLabel: '2026-2027',
    units: [
      {
        unitNo: 1, unitName: 'Unit 1',
        topics: [
          {
            topicNo: 1, topicName: 'Reading',
            subTopics: [{ subTopicNo: 1, subTopicName: 'Stage 2', isCovered: false }],
            // A lesson saved before `type` was a required enum field -
            // exactly the kind of pre-existing, unrelated data a
            // coordinator ticking a checkbox elsewhere has no reason to
            // know or care about.
            lessons: [{ lessonNo: 1, title: 'Old reading link' } as any],
          },
        ],
      },
    ],
  });
  return SyllabusModel.hydrate(fresh.toObject()) as any;
}

describe('Syllabus partial update must not be blocked by unrelated legacy data', () => {
  it('reproduces the bug: saving an UNTOUCHED syllabus still 500s because of the legacy lesson, under the old default', () => {
    const syllabus = syllabusWithLegacyBadLesson();
    expect(syllabus.modifiedPaths()).toEqual([]); // nothing touched at all
    const err = syllabus.validateSync(); // the old `syllabus.save()` behaviour
    expect(err).toBeTruthy();
    expect(String(err)).toMatch(/lessons\.0\.type/);
  });

  it('the fix: { validateModifiedOnly: true } saves that same untouched syllabus cleanly', () => {
    const syllabus = syllabusWithLegacyBadLesson();
    const err = syllabus.validateSync({ validateModifiedOnly: true });
    expect(err).toBeUndefined();
  });

  it('marking a sub-topic covered on that syllabus still saves cleanly - the real click from the screenshot', () => {
    const syllabus = syllabusWithLegacyBadLesson();
    syllabus.units[0].topics[0].subTopics[0].isCovered = true;
    syllabus.totalTopics = 1;
    syllabus.coveredTopics = 1;
    syllabus.markModified('units');
    const err = syllabus.validateSync({ validateModifiedOnly: true });
    expect(err).toBeUndefined();
  });

  it('generatePacingGuide-style bulk plannedWeek writes across the whole units tree still save cleanly', () => {
    const syllabus = syllabusWithLegacyBadLesson();
    syllabus.units[0].topics[0].subTopics[0].plannedWeek = 3;
    syllabus.markModified('units');
    const err = syllabus.validateSync({ validateModifiedOnly: true });
    expect(err).toBeUndefined();
  });

  it('a genuinely invalid value on a path actually being written is still caught (not silently let through)', () => {
    const syllabus = syllabusWithLegacyBadLesson();
    // subTopicNo is required - simulate a caller writing a subdocument that itself breaks a real rule.
    (syllabus.units[0].topics[0].subTopics[0] as any).subTopicNo = undefined;
    syllabus.markModified('units.0.topics.0.subTopics.0.subTopicNo');
    const err = syllabus.validateSync({ validateModifiedOnly: true });
    expect(err).toBeTruthy();
    expect(String(err)).toMatch(/subTopicNo/);
  });
});
