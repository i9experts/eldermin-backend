import { NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { PTMService } from './ptm.service';

const chain = (v: any) => { const c: any = { lean: () => Promise.resolve(v) }; return c; };
const oid = () => new Types.ObjectId().toString();

describe('PTMService.generateMeetingPdf - downloadable meeting record', () => {
  it('loads the meeting and hands it to PdfService.generatePTMMeetingPdf with the school slug/user', async () => {
    const id = oid();
    const meeting = {
      _id: id, tenantId: 't', teacherId: 'teach1', studentName: 'Ayesha Khan',
      status: 'completed', discussionPoints: ['Falling grades'],
      meetingNotes: 'Parent agreed to a tutor', actionItems: [], parentAttended: true,
    };
    const ptmModel: any = { findOne: jest.fn(() => chain(meeting)) };
    const generatePTMMeetingPdf = jest.fn().mockResolvedValue(Buffer.from('pdf'));
    const pdfService: any = { generatePTMMeetingPdf };
    const service = new PTMService(ptmModel, {} as any, {} as any, {} as any, pdfService, undefined, undefined);

    const result = await service.generateMeetingPdf(id, 't', 'demo-school', 'user-1', { role: 'admin' } as any);

    expect(result).toEqual(Buffer.from('pdf'));
    expect(generatePTMMeetingPdf).toHaveBeenCalledWith('demo-school', meeting, 'user-1');
  });

  it('throws NotFoundException for a meeting that does not exist, rather than generating a PDF for nothing', async () => {
    const ptmModel: any = { findOne: jest.fn(() => chain(null)) };
    const pdfService: any = { generatePTMMeetingPdf: jest.fn() };
    const service = new PTMService(ptmModel, {} as any, {} as any, {} as any, pdfService, undefined, undefined);

    await expect(service.generateMeetingPdf(oid(), 't', 'demo-school', 'user-1', { role: 'admin' } as any))
      .rejects.toThrow(NotFoundException);
    expect(pdfService.generatePTMMeetingPdf).not.toHaveBeenCalled();
  });
});
