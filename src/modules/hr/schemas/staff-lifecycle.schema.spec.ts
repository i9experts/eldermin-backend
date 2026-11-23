import mongoose from 'mongoose';
import { StaffLifecycleSchema } from './staff-lifecycle.schema';

// Regression test for a classic Mongoose trap: a nested subdocument field
// literally named `type` (interviews[].type - "in_person"/"phone"/...) is
// indistinguishable from the SchemaType option of the same name on the
// surrounding `{...}` schema-shape object unless disambiguated as
// `{ type: String }`. Left as a bare `type: String`, Mongoose silently
// compiled the whole `interviews` array as a plain string array with no
// subdocument schema at all - every real interview object pushed to it
// then failed with "Cast to [string] failed", surfacing to the HR UI as
// "Failed to schedule interview".
describe('StaffLifecycleSchema - interviews array', () => {
  const Model = mongoose.models.TestStaffLifecycleInterviews
    || mongoose.model('TestStaffLifecycleInterviews', StaffLifecycleSchema);

  it('compiles interviews as a real subdocument array, not a plain string array', () => {
    const path: any = StaffLifecycleSchema.path('interviews');
    expect(path.instance).toBe('Array');
    expect(path.schema).toBeDefined();
    expect(Object.keys(path.schema.paths)).toEqual(expect.arrayContaining([
      'round', 'scheduledAt', 'venue', 'interviewers', 'type', 'status', 'feedback', 'rating', 'recommendation',
    ]));
  });

  it('validates a scheduled interview (the exact shape scheduleInterview() pushes) without a cast error', () => {
    const doc = new Model({
      tenantId: new mongoose.Types.ObjectId(),
      institutionId: new mongoose.Types.ObjectId(),
      firstName: 'Tahir',
      lastName: 'Arshad',
      positionTitle: 'Math Teacher',
      stage: 'interview',
      interviews: [{
        round: 1,
        type: 'in_person',
        scheduledAt: new Date('2026-12-02T09:00:00.000Z'),
        venue: 'Main Branch',
        interviewers: ['Uzair Hassan'],
        status: 'scheduled',
      }],
    });
    const err = doc.validateSync();
    expect(err).toBeUndefined();
    expect(doc.interviews[0].type).toBe('in_person');
    expect(doc.interviews[0].round).toBe(1);
  });
});
