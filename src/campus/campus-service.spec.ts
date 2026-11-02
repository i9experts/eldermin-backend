import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CampusService } from './campus.service';

// Regression coverage for the Campus Operations QA pass:
// - allocateHostel used to look up room/block with a bare findById (no
//   schoolSlug filter), so a caller could allocate against - and corrupt
//   the occupancy counters of - another tenant's room/block by id guessing.
// - "Room is full" threw a plain Error (500) instead of a clean 400.
// - There was no way to edit an allocation's own fields (status/notes/etc)
//   short of re-running allocateHostel, which creates a brand new document.
// - updateMaintenance didn't exist at all - the frontend's edit flow called
//   nothing and just showed a fake success toast.
// - deleteBuilding never checked for rooms still pointing at it.

function chain(v: any) {
  return { lean: () => Promise.resolve(v), sort: () => chain(v), skip: () => chain(v), limit: () => Promise.resolve(v) };
}

function makeService(overrides: {
  room?: any; block?: any; maintenance?: any; roomCount?: number; building?: any;
} = {}) {
  const n: any = {};
  const roomModel: any = {
    findOne: jest.fn((filter: any) => Promise.resolve(
      overrides.room && overrides.room.schoolSlug === filter.schoolSlug && String(overrides.room._id) === String(filter._id)
        ? overrides.room : null,
    )),
    updateOne: jest.fn().mockResolvedValue({}),
  };
  const blockModel: any = {
    findOne: jest.fn((filter: any) => Promise.resolve(
      overrides.block && overrides.block.schoolSlug === filter.schoolSlug && String(overrides.block._id) === String(filter._id)
        ? overrides.block : null,
    )),
    updateOne: jest.fn().mockResolvedValue({}),
  };
  const allocationModel: any = Object.assign(
    jest.fn().mockImplementation((data: any) => ({ ...data, save: () => Promise.resolve({ ...data, _id: 'alloc1' }) })),
    { findOneAndUpdate: jest.fn().mockResolvedValue(overrides.maintenance ?? null) },
  );
  const maintenanceModel: any = {
    findOneAndUpdate: jest.fn().mockResolvedValue(overrides.maintenance ?? null),
  };
  const campusRoomModel: any = {
    countDocuments: jest.fn().mockResolvedValue(overrides.roomCount ?? 0),
  };
  const buildingModel: any = {
    findOneAndDelete: jest.fn().mockResolvedValue(overrides.building ?? { _id: 'b1' }),
  };
  const ServiceAny: any = CampusService;
  const service = new ServiceAny(
    n, n, n, blockModel, roomModel, allocationModel, maintenanceModel, n, n,
    buildingModel, campusRoomModel, n, n,
  ) as CampusService;
  return { service, roomModel, blockModel, allocationModel, maintenanceModel, campusRoomModel, buildingModel };
}

const ROOM = { _id: 'room1', schoolSlug: 's1', occupancy: 1, capacity: 2 };
const BLOCK = { _id: 'block1', schoolSlug: 's1' };

describe('CampusService.allocateHostel', () => {
  it('rejects a missing studentId', async () => {
    const { service } = makeService();
    await expect(service.allocateHostel({ roomId: 'room1', blockId: 'block1', schoolSlug: 's1' }))
      .rejects.toThrow(BadRequestException);
  });

  it('rejects a missing roomId/blockId', async () => {
    const { service } = makeService();
    await expect(service.allocateHostel({ studentId: 'stu1', schoolSlug: 's1' }))
      .rejects.toThrow(BadRequestException);
  });

  it('does not leak another tenant\'s room via a spoofed roomId', async () => {
    const { service } = makeService({ room: { ...ROOM, schoolSlug: 'other-school' }, block: BLOCK });
    await expect(service.allocateHostel({ studentId: 'stu1', roomId: 'room1', blockId: 'block1', schoolSlug: 's1' }))
      .rejects.toThrow(NotFoundException);
  });

  it('does not leak another tenant\'s block via a spoofed blockId', async () => {
    const { service } = makeService({ room: ROOM, block: { ...BLOCK, schoolSlug: 'other-school' } });
    await expect(service.allocateHostel({ studentId: 'stu1', roomId: 'room1', blockId: 'block1', schoolSlug: 's1' }))
      .rejects.toThrow(NotFoundException);
  });

  it('throws a clean 400, not a 500, when the room is full', async () => {
    const { service } = makeService({ room: { ...ROOM, occupancy: 2, capacity: 2 }, block: BLOCK });
    await expect(service.allocateHostel({ studentId: 'stu1', roomId: 'room1', blockId: 'block1', schoolSlug: 's1' }))
      .rejects.toThrow(BadRequestException);
  });

  it('allocates successfully and scopes the occupancy updates by schoolSlug', async () => {
    const { service, roomModel, blockModel } = makeService({ room: ROOM, block: BLOCK });
    await service.allocateHostel({ studentId: 'stu1', roomId: 'room1', blockId: 'block1', schoolSlug: 's1' });
    expect(roomModel.updateOne).toHaveBeenCalledWith(
      { _id: 'room1', schoolSlug: 's1' },
      expect.objectContaining({ $set: expect.objectContaining({ occupancy: 2 }) }),
    );
    expect(blockModel.updateOne).toHaveBeenCalledWith({ _id: 'block1', schoolSlug: 's1' }, { $inc: { occupiedBeds: 1 } });
  });
});

describe('CampusService.updateHostelAllocation', () => {
  it('updates only the provided editable fields', async () => {
    const { service, allocationModel } = makeService({ maintenance: { _id: 'a1', status: 'on_leave' } });
    await service.updateHostelAllocation('a1', 's1', { status: 'on_leave', notes: 'Sick leave' });
    expect(allocationModel.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: 'a1', schoolSlug: 's1' },
      { $set: { status: 'on_leave', notes: 'Sick leave' } },
      { new: true },
    );
  });

  it('throws when the allocation does not exist for this tenant', async () => {
    const { service } = makeService({ maintenance: null });
    await expect(service.updateHostelAllocation('missing', 's1', { status: 'active' })).rejects.toThrow(NotFoundException);
  });
});

describe('CampusService.updateMaintenance', () => {
  it('updates the provided fields and leaves others untouched', async () => {
    const { service, maintenanceModel } = makeService({ maintenance: { _id: 'm1', title: 'Fixed' } });
    await service.updateMaintenance('m1', 's1', { title: 'Fixed', priority: 'high' });
    expect(maintenanceModel.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: 'm1', schoolSlug: 's1' },
      { $set: { title: 'Fixed', priority: 'high' } },
      { new: true },
    );
  });

  it('throws a clear error instead of silently no-oping when the ticket does not exist', async () => {
    const { service } = makeService({ maintenance: null });
    await expect(service.updateMaintenance('missing', 's1', { title: 'x' })).rejects.toThrow(NotFoundException);
  });
});

describe('CampusService.deleteBuilding', () => {
  it('refuses to delete a building that still has rooms pointing at it', async () => {
    const { service, buildingModel } = makeService({ roomCount: 3 });
    await expect(service.deleteBuilding('b1', 's1')).rejects.toThrow(BadRequestException);
    expect(buildingModel.findOneAndDelete).not.toHaveBeenCalled();
  });

  it('deletes normally once no rooms reference it', async () => {
    const { service, buildingModel } = makeService({ roomCount: 0, building: { _id: 'b1' } });
    await service.deleteBuilding('b1', 's1');
    expect(buildingModel.findOneAndDelete).toHaveBeenCalledWith({ _id: 'b1', schoolSlug: 's1' });
  });
});
