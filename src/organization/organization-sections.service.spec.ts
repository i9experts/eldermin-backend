import { ConflictException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { OrganizationService } from './organization.service';

// Unit tests for addSection's duplicate-name guard - a Grade's sections
// used to be $push-ed with no check, so re-adding (or double-submitting)
// the same section name created two subdocuments with the same name,
// which every SectionDropdown in the app then rendered as a literal
// duplicate option. Hand-rolled fakes, same lightweight approach as this
// repo's other service-level *.spec.ts files (see teaching.service.spec.ts).

function makeService(existingSections: any[]) {
  const gradeDoc: any = {
    _id: 'grade1',
    schoolSlug: 'demo-school',
    sections: existingSections,
    save: jest.fn().mockImplementation(function (this: any) { return Promise.resolve(this); }),
  };
  const gradeModel: any = {
    findOne: jest.fn().mockResolvedValue(gradeDoc),
  };
  const noop: any = {};
  const service = new OrganizationService(
    noop, noop, noop, gradeModel, noop, noop, noop, noop, noop, noop, noop, noop, noop, noop, noop,
  );
  return { service, gradeDoc };
}

describe('OrganizationService.addSection', () => {
  it('rejects a section name that already exists (case/whitespace insensitive)', async () => {
    const { service } = makeService([
      { _id: new Types.ObjectId(), name: 'A', isActive: true },
    ]);
    await expect(
      service.addSection('grade1', 'demo-school', { name: ' a ' }),
    ).rejects.toThrow(ConflictException);
  });

  it('allows a new, distinct section name and pushes it onto the grade', async () => {
    const { service, gradeDoc } = makeService([
      { _id: new Types.ObjectId(), name: 'A', isActive: true },
    ]);
    await service.addSection('grade1', 'demo-school', { name: 'B', capacity: 30 });
    expect(gradeDoc.sections).toHaveLength(2);
    expect(gradeDoc.sections[1].name).toBe('B');
    expect(gradeDoc.save).toHaveBeenCalled();
  });

  it('ignores an inactive section with the same name and allows re-adding it', async () => {
    const { service, gradeDoc } = makeService([
      { _id: new Types.ObjectId(), name: 'A', isActive: false },
    ]);
    await service.addSection('grade1', 'demo-school', { name: 'A' });
    expect(gradeDoc.sections).toHaveLength(2);
  });

  it('throws NotFoundException when the grade does not exist', async () => {
    const gradeModel: any = { findOne: jest.fn().mockResolvedValue(null) };
    const noop: any = {};
    const service = new OrganizationService(
      noop, noop, noop, gradeModel, noop, noop, noop, noop, noop, noop, noop, noop, noop, noop, noop,
    );
    await expect(
      service.addSection('missing', 'demo-school', { name: 'A' }),
    ).rejects.toThrow(NotFoundException);
  });
});
