import { BadRequestException, NotFoundException } from '@nestjs/common';
import { InstitutionSetupService } from './institution-setup.service';

// Unit tests for the Meeting Minutes recorder added to InstitutionSetupService
// (upsert/action-item-status/submit/approve + PDF generation) — hand-rolled
// fakes, same lightweight approach as this module's other *.spec.ts files
// (see organization-sections.service.spec.ts).

function makeMeetingDoc(overrides: any = {}) {
  const doc: any = {
    _id: 'meeting1',
    schoolSlug: 'demo-school',
    title: 'Q3 Board Meeting',
    status: 'scheduled',
    scheduledAt: new Date('2026-10-24T10:00:00Z'),
    agendaItems: [{ order: 0, topic: 'Budget review' }],
    attendees: ['Ayesha Khan'],
    meetingMinutes: undefined,
    markModified: jest.fn(),
    ...overrides,
  };
  doc.save = jest.fn().mockImplementation(function (this: any) { return Promise.resolve(this); });
  return doc;
}

function makeService(meetingDoc: any) {
  const meetingModel: any = {
    findOne: jest.fn().mockImplementation((filter: any) => {
      // lean() calls (used by generateMeetingMinutesPdf) resolve a plain
      // object; non-lean calls resolve the mutable doc with save/markModified.
      const result = meetingDoc && meetingDoc._id === filter._id && meetingDoc.schoolSlug === filter.schoolSlug ? meetingDoc : null;
      return { lean: () => Promise.resolve(result ? { ...result } : null), then: (res: any) => res(result) };
    }),
  };
  const pdfService: any = { generateMeetingMinutesPdf: jest.fn().mockResolvedValue(Buffer.from('pdf')) };
  const noop: any = {};
  const service = new InstitutionSetupService(
    noop, noop, meetingModel, noop, noop, noop, noop, noop, noop, pdfService,
  );
  return { service, pdfService };
}

describe('InstitutionSetupService — Meeting Minutes', () => {
  it('getMeetingMinutes returns null when none recorded yet', async () => {
    const { service } = makeService(makeMeetingDoc());
    await expect(service.getMeetingMinutes('meeting1', 'demo-school')).resolves.toBeNull();
  });

  it('getMeetingMinutes throws NotFoundException for an unknown meeting', async () => {
    const { service } = makeService(makeMeetingDoc());
    await expect(service.getMeetingMinutes('nope', 'demo-school')).rejects.toThrow(NotFoundException);
  });

  it('upsertMeetingMinutes creates a draft record, stamps recordedBy/recordedAt once, and bumps a scheduled meeting to completed', async () => {
    const meetingDoc = makeMeetingDoc();
    const { service } = makeService(meetingDoc);

    const result: any = await service.upsertMeetingMinutes('meeting1', 'demo-school', {
      attendance: [{ name: 'Ayesha Khan', attendanceStatus: 'present' }],
      generalNotes: 'Discussed Q3 budget',
    }, 'Admin User');

    expect(result.status).toBe('draft');
    expect(result.recordedBy).toBe('Admin User');
    expect(result.recordedAt).toBeInstanceOf(Date);
    expect(meetingDoc.status).toBe('completed');
    expect(meetingDoc.save).toHaveBeenCalled();
  });

  it('upsertMeetingMinutes does not overwrite recordedBy/recordedAt or reset status on a later edit', async () => {
    const firstRecordedAt = new Date('2026-10-24T11:00:00Z');
    const meetingDoc = makeMeetingDoc({
      status: 'completed',
      meetingMinutes: { status: 'pending_approval', recordedBy: 'Original Recorder', recordedAt: firstRecordedAt, actionItems: [] },
    });
    const { service } = makeService(meetingDoc);

    const result: any = await service.upsertMeetingMinutes('meeting1', 'demo-school', { generalNotes: 'Addendum' }, 'Someone Else');

    expect(result.status).toBe('pending_approval');
    expect(result.recordedBy).toBe('Original Recorder');
    expect(result.recordedAt).toBe(firstRecordedAt);
    expect(result.generalNotes).toBe('Addendum');
  });

  it('updateMinutesActionItem updates the status of one action item by index', async () => {
    const meetingDoc = makeMeetingDoc({
      meetingMinutes: {
        status: 'draft',
        actionItems: [
          { description: 'Send budget doc', status: 'open' },
          { description: 'Book venue', status: 'open' },
        ],
      },
    });
    const { service } = makeService(meetingDoc);

    const result: any = await service.updateMinutesActionItem('meeting1', 'demo-school', 1, 'done');

    expect(result.actionItems[0].status).toBe('open');
    expect(result.actionItems[1].status).toBe('done');
    expect(meetingDoc.markModified).toHaveBeenCalledWith('meetingMinutes.actionItems');
  });

  it('updateMinutesActionItem throws NotFoundException for an out-of-range index', async () => {
    const meetingDoc = makeMeetingDoc({ meetingMinutes: { status: 'draft', actionItems: [] } });
    const { service } = makeService(meetingDoc);
    await expect(service.updateMinutesActionItem('meeting1', 'demo-school', 0, 'done')).rejects.toThrow(NotFoundException);
  });

  it('submitMeetingMinutesForApproval moves draft minutes to pending_approval', async () => {
    const meetingDoc = makeMeetingDoc({ meetingMinutes: { status: 'draft', actionItems: [] } });
    const { service } = makeService(meetingDoc);
    const result: any = await service.submitMeetingMinutesForApproval('meeting1', 'demo-school');
    expect(result.status).toBe('pending_approval');
  });

  it('submitMeetingMinutesForApproval rejects when no minutes exist yet', async () => {
    const { service } = makeService(makeMeetingDoc());
    await expect(service.submitMeetingMinutesForApproval('meeting1', 'demo-school')).rejects.toThrow(BadRequestException);
  });

  it('approveMeetingMinutes stamps approvedBy/approvedAt and moves status to approved', async () => {
    const meetingDoc = makeMeetingDoc({ meetingMinutes: { status: 'pending_approval', actionItems: [] } });
    const { service } = makeService(meetingDoc);
    const result: any = await service.approveMeetingMinutes('meeting1', 'demo-school', 'Ms. Ayesha Khan');
    expect(result.status).toBe('approved');
    expect(result.approvedBy).toBe('Ms. Ayesha Khan');
    expect(result.approvedAt).toBeInstanceOf(Date);
  });

  it('approveMeetingMinutes rejects when no minutes exist yet', async () => {
    const { service } = makeService(makeMeetingDoc());
    await expect(service.approveMeetingMinutes('meeting1', 'demo-school', 'Chair')).rejects.toThrow(BadRequestException);
  });

  it('generateMeetingMinutesPdf loads the meeting (lean) and delegates to PdfService', async () => {
    const meetingDoc = makeMeetingDoc({ meetingMinutes: { status: 'approved', actionItems: [] } });
    const { service, pdfService } = makeService(meetingDoc);
    const pdf = await service.generateMeetingMinutesPdf('meeting1', 'demo-school', 'user1');
    expect(pdf).toEqual(Buffer.from('pdf'));
    expect(pdfService.generateMeetingMinutesPdf).toHaveBeenCalledWith(
      'demo-school',
      expect.objectContaining({ _id: 'meeting1', title: 'Q3 Board Meeting' }),
      'user1',
    );
  });

  it('generateMeetingMinutesPdf throws NotFoundException for an unknown meeting', async () => {
    const { service } = makeService(makeMeetingDoc());
    await expect(service.generateMeetingMinutesPdf('nope', 'demo-school', 'user1')).rejects.toThrow(NotFoundException);
  });
});
