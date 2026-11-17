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
  route?: any; existingAllocation?: any; allocationFindOneAndUpdateResult?: any;
  bedTaken?: any; transportAllocFindOneAndUpdateResult?: any;
} = {}) {
  const n: any = {};
  const roomModel: any = Object.assign(
    jest.fn().mockImplementation((data: any) => ({ ...data, save: () => Promise.resolve({ ...data, _id: 'newroom1' }) })),
    {
      findOne: jest.fn((filter: any) => Promise.resolve(
        overrides.room && overrides.room.schoolSlug === filter.schoolSlug && String(overrides.room._id) === String(filter._id)
          ? overrides.room : null,
      )),
      updateOne: jest.fn().mockResolvedValue({}),
    },
  );
  const blockModel: any = {
    findOne: jest.fn((filter: any) => Promise.resolve(
      overrides.block && overrides.block.schoolSlug === filter.schoolSlug && String(overrides.block._id) === String(filter._id)
        ? overrides.block : null,
    )),
    updateOne: jest.fn().mockResolvedValue({}),
  };
  const allocationModel: any = Object.assign(
    jest.fn().mockImplementation((data: any) => ({ ...data, save: () => Promise.resolve({ ...data, _id: 'alloc1' }) })),
    {
      findOneAndUpdate: jest.fn().mockResolvedValue(
        overrides.allocationFindOneAndUpdateResult !== undefined ? overrides.allocationFindOneAndUpdateResult : (overrides.maintenance ?? null),
      ),
      findOne: jest.fn((filter: any) => {
        // bedNumber-uniqueness lookup (status: 'active') vs the
        // already-checked-out double-checkout lookup (no status filter) -
        // distinguish by whether the query carries a bedNumber.
        if (filter.bedNumber !== undefined) return Promise.resolve(overrides.bedTaken ?? null);
        return Promise.resolve(overrides.existingAllocation ?? null);
      }),
    },
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
  const routeModel: any = {
    findOne: jest.fn((filter: any) => Promise.resolve(
      overrides.route && overrides.route.schoolSlug === filter.schoolSlug && String(overrides.route._id) === String(filter._id)
        ? overrides.route : null,
    )),
    updateOne: jest.fn().mockResolvedValue({}),
  };
  const studentTransportModel: any = Object.assign(
    jest.fn().mockImplementation((data: any) => ({ ...data, save: () => Promise.resolve({ ...data, _id: 'talloc1' }) })),
    { findOneAndUpdate: jest.fn().mockResolvedValue(overrides.transportAllocFindOneAndUpdateResult ?? null) },
  );
  const ServiceAny: any = CampusService;
  const service = new ServiceAny(
    n, routeModel, studentTransportModel, blockModel, roomModel, allocationModel, maintenanceModel, n, n,
    buildingModel, campusRoomModel, n, n,
  ) as CampusService;
  return {
    service, roomModel, blockModel, allocationModel, maintenanceModel, campusRoomModel, buildingModel,
    routeModel, studentTransportModel,
  };
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
    await expect(service.allocateHostel({ studentId: '507f1f77bcf86cd799439011', schoolSlug: 's1' }))
      .rejects.toThrow(BadRequestException);
  });

  it('does not leak another tenant\'s room via a spoofed roomId', async () => {
    const { service } = makeService({ room: { ...ROOM, schoolSlug: 'other-school' }, block: BLOCK });
    await expect(service.allocateHostel({ studentId: '507f1f77bcf86cd799439011', roomId: 'room1', blockId: 'block1', schoolSlug: 's1' }))
      .rejects.toThrow(NotFoundException);
  });

  it('does not leak another tenant\'s block via a spoofed blockId', async () => {
    const { service } = makeService({ room: ROOM, block: { ...BLOCK, schoolSlug: 'other-school' } });
    await expect(service.allocateHostel({ studentId: '507f1f77bcf86cd799439011', roomId: 'room1', blockId: 'block1', schoolSlug: 's1' }))
      .rejects.toThrow(NotFoundException);
  });

  it('throws a clean 400, not a 500, when the room is full', async () => {
    const { service } = makeService({ room: { ...ROOM, occupancy: 2, capacity: 2 }, block: BLOCK });
    await expect(service.allocateHostel({ studentId: '507f1f77bcf86cd799439011', roomId: 'room1', blockId: 'block1', schoolSlug: 's1' }))
      .rejects.toThrow(BadRequestException);
  });

  it('allocates successfully and scopes the occupancy updates by schoolSlug', async () => {
    const { service, roomModel, blockModel } = makeService({ room: ROOM, block: BLOCK });
    await service.allocateHostel({ studentId: '507f1f77bcf86cd799439011', roomId: 'room1', blockId: 'block1', schoolSlug: 's1' });
    expect(roomModel.updateOne).toHaveBeenCalledWith(
      { _id: 'room1', schoolSlug: 's1' },
      expect.objectContaining({ $set: expect.objectContaining({ occupancy: 2 }) }),
    );
    expect(blockModel.updateOne).toHaveBeenCalledWith({ _id: 'block1', schoolSlug: 's1' }, { $inc: { occupiedBeds: 1 } });
  });

  // Regression: room-level occupancy vs capacity never stopped two
  // different students both being handed the same bedNumber in the same
  // room, as long as the room still had a free slot overall.
  it('rejects allocating an already-occupied bed in the same room', async () => {
    const { service } = makeService({ room: ROOM, block: BLOCK, bedTaken: { _id: 'alloc0', bedNumber: 'Bed 1' } });
    await expect(service.allocateHostel({ studentId: '507f1f77bcf86cd799439012', roomId: 'room1', blockId: 'block1', bedNumber: 'Bed 1', schoolSlug: 's1' }))
      .rejects.toThrow(BadRequestException);
  });

  it('allows the allocation when the requested bed is free', async () => {
    const { service, roomModel } = makeService({ room: ROOM, block: BLOCK, bedTaken: null });
    await service.allocateHostel({ studentId: '507f1f77bcf86cd799439012', roomId: 'room1', blockId: 'block1', bedNumber: 'Bed 2', schoolSlug: 's1' });
    expect(roomModel.updateOne).toHaveBeenCalled();
  });
});

describe('CampusService.checkOutHostel', () => {
  const ACTIVE_ALLOC = { _id: 'alloc1', schoolSlug: 's1', roomId: 'room1', blockId: 'block1', status: 'active' };

  it('checks out an active allocation and frees the room/block counters', async () => {
    const { service, roomModel, blockModel } = makeService({ allocationFindOneAndUpdateResult: ACTIVE_ALLOC });
    const result = await service.checkOutHostel('alloc1', 's1');
    expect(result).toEqual(ACTIVE_ALLOC);
    expect(roomModel.updateOne).toHaveBeenCalledWith(
      { _id: 'room1', schoolSlug: 's1' },
      { $inc: { occupancy: -1 }, $set: { status: 'available' } },
    );
    expect(blockModel.updateOne).toHaveBeenCalledWith({ _id: 'block1', schoolSlug: 's1' }, { $inc: { occupiedBeds: -1 } });
  });

  // Regression: checking out the same allocation twice used to decrement
  // the room/block counters a second time for a bed that was never
  // actually reoccupied, corrupting occupancy and eventually driving it
  // negative - making a room look like it has more free space than it does.
  it('rejects checking out an already-checked-out allocation instead of double-decrementing', async () => {
    const { service, roomModel, blockModel } = makeService({
      allocationFindOneAndUpdateResult: null,
      existingAllocation: { ...ACTIVE_ALLOC, status: 'checked_out' },
    });
    await expect(service.checkOutHostel('alloc1', 's1')).rejects.toThrow(BadRequestException);
    expect(roomModel.updateOne).not.toHaveBeenCalled();
    expect(blockModel.updateOne).not.toHaveBeenCalled();
  });

  it('throws NotFoundException for an allocation that does not exist for this tenant', async () => {
    const { service } = makeService({ allocationFindOneAndUpdateResult: null, existingAllocation: null });
    await expect(service.checkOutHostel('missing', 's1')).rejects.toThrow(NotFoundException);
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

const ROUTE = { _id: 'route1', schoolSlug: 's1', totalStudents: 2 };

describe('CampusService.allocateStudentTransport', () => {
  it('rejects a missing studentId/routeId', async () => {
    const { service } = makeService();
    await expect(service.allocateStudentTransport({ routeId: 'route1', schoolSlug: 's1' })).rejects.toThrow(BadRequestException);
    await expect(service.allocateStudentTransport({ studentId: '507f1f77bcf86cd799439011', schoolSlug: 's1' })).rejects.toThrow(BadRequestException);
  });

  // Regression: findByIdAndUpdate(data.routeId, ...) with no schoolSlug
  // filter let a caller increment - and silently "succeed" against -
  // another tenant's route totalStudents counter by id guessing, without
  // ever confirming the route belonged to (or even existed for) this
  // tenant at all.
  it('does not leak another tenant\'s route via a spoofed routeId', async () => {
    const { service } = makeService({ route: { ...ROUTE, schoolSlug: 'other-school' } });
    await expect(service.allocateStudentTransport({ studentId: '507f1f77bcf86cd799439011', routeId: 'route1', schoolSlug: 's1' }))
      .rejects.toThrow(NotFoundException);
  });

  it('allocates and increments only the new route, scoped by schoolSlug', async () => {
    const { service, routeModel } = makeService({ route: ROUTE, transportAllocFindOneAndUpdateResult: null });
    await service.allocateStudentTransport({ studentId: '507f1f77bcf86cd799439011', routeId: 'route1', schoolSlug: 's1' });
    expect(routeModel.updateOne).toHaveBeenCalledWith({ _id: 'route1', schoolSlug: 's1' }, { $inc: { totalStudents: 1 } });
    expect(routeModel.updateOne).toHaveBeenCalledTimes(1);
  });

  // Regression: reassigning a student to a new route incremented the new
  // route's totalStudents but never decremented the old route's, so the
  // old route's count drifted further out of sync every time a student
  // switched routes.
  it('decrements the previous route when a student is reassigned to a new one', async () => {
    const { service, routeModel } = makeService({
      route: ROUTE,
      transportAllocFindOneAndUpdateResult: { routeId: 'old-route', studentId: '507f1f77bcf86cd799439011' },
    });
    await service.allocateStudentTransport({ studentId: '507f1f77bcf86cd799439011', routeId: 'route1', schoolSlug: 's1' });
    expect(routeModel.updateOne).toHaveBeenCalledWith({ _id: 'route1', schoolSlug: 's1' }, { $inc: { totalStudents: 1 } });
    expect(routeModel.updateOne).toHaveBeenCalledWith({ _id: 'old-route', schoolSlug: 's1' }, { $inc: { totalStudents: -1 } });
  });

  it('does not double-decrement when the student is already on this exact route', async () => {
    const { service, routeModel } = makeService({
      route: ROUTE,
      transportAllocFindOneAndUpdateResult: { routeId: 'route1', studentId: '507f1f77bcf86cd799439011' },
    });
    await service.allocateStudentTransport({ studentId: '507f1f77bcf86cd799439011', routeId: 'route1', schoolSlug: 's1' });
    expect(routeModel.updateOne).toHaveBeenCalledTimes(1);
  });
});

describe('CampusService.removeStudentTransport', () => {
  it('throws instead of silently no-oping when the allocation does not exist for this tenant', async () => {
    const { service, routeModel } = makeService({ transportAllocFindOneAndUpdateResult: null });
    await expect(service.removeStudentTransport('missing', 's1')).rejects.toThrow(NotFoundException);
    expect(routeModel.updateOne).not.toHaveBeenCalled();
  });

  it('deactivates the allocation and decrements the route, scoped by schoolSlug', async () => {
    const { service, routeModel } = makeService({
      transportAllocFindOneAndUpdateResult: { _id: 'talloc1', routeId: 'route1' },
    });
    await service.removeStudentTransport('talloc1', 's1');
    expect(routeModel.updateOne).toHaveBeenCalledWith({ _id: 'route1', schoolSlug: 's1' }, { $inc: { totalStudents: -1 } });
  });
});

describe('CampusService.createRoom', () => {
  // Regression: a room could be created pointing at a blockId that didn't
  // belong to (or even exist for) this tenant - a dangling cross-tenant
  // reference that only surfaced later, confusingly, when allocateHostel's
  // own block lookup failed against a perfectly real-looking room.
  it('rejects a blockId that does not belong to this tenant', async () => {
    const { service } = makeService({ block: { ...BLOCK, schoolSlug: 'other-school' } });
    await expect(service.createRoom({ roomNumber: '101', blockId: 'block1', schoolSlug: 's1', capacity: 2 }))
      .rejects.toThrow(NotFoundException);
  });

  it('creates the room once the block is confirmed to belong to this tenant', async () => {
    const { service } = makeService({ block: BLOCK });
    const room = await service.createRoom({ roomNumber: '101', blockId: 'block1', schoolSlug: 's1', capacity: 2 });
    expect(room).toMatchObject({ roomNumber: '101', blockId: 'block1', schoolSlug: 's1' });
  });
});
