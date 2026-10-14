import { Types } from 'mongoose';
import { StaffPortalService } from './staff-portal.service';

// Thread list/message fixes found by the Phase 7a app work:
//  - getThreadMessages used to return the OLDEST 500 messages, so a long thread never showed its newest ones;
//  - listThreads.unreadCount was computed over the (max 100) returned rows only.

const oid = () => new Types.ObjectId();

function setup(opts: { messagesNewestFirst?: any[]; messagesOldestFirst?: any[]; threads?: any[]; unreadTotal?: number } = {}) {
  const user = { userId: oid().toString(), tenantId: oid().toString(), schoolSlug: 'demo', name: 'Ms Teacher', role: 'teacher' };
  const staff = { _id: oid() };
  const staffModel: any = { findOne: jest.fn().mockResolvedValue(staff) };

  const threadDoc = { _id: oid(), schoolSlug: 'demo', status: 'open', toObject() { return { _id: this._id, status: this.status }; } };
  const threadFind: any = { sort: jest.fn().mockReturnThis(), limit: jest.fn().mockReturnThis(), lean: jest.fn().mockResolvedValue(opts.threads ?? []) };
  const threadModel: any = {
    findOne: jest.fn().mockResolvedValue(threadDoc),
    find: jest.fn(() => threadFind),
    countDocuments: jest.fn().mockResolvedValue(opts.unreadTotal ?? 0),
  };

  const calls: Array<{ filter: any; sort: any; limit: number }> = [];
  const messageModel: any = {
    find: jest.fn((filter: any) => {
      const rec: any = { filter, sort: undefined, limit: 0 };
      calls.push(rec);
      const q: any = {
        sort: (s: any) => { rec.sort = s; return q; },
        limit: (n: number) => { rec.limit = n; return q; },
        lean: () => Promise.resolve(rec.sort?.createdAt === -1 ? [...(opts.messagesNewestFirst ?? [])] : [...(opts.messagesOldestFirst ?? [])]),
      };
      return q;
    }),
  };

  const noop: any = {};
  const service = new StaffPortalService(
    noop /*user*/, noop /*tenant*/, staffModel, noop /*campus*/, noop /*profile*/, noop /*student*/,
    noop /*studentLeave*/, noop /*notification*/, threadModel, messageModel, noop /*deviceToken*/, noop /*deletion*/,
    noop /*roles*/, noop /*notifier*/,
  );
  return { service, user, threadModel, threadFind, messageModel, calls, staff, threadDoc };
}

describe('StaffPortalService.getThreadMessages', () => {
  it('returns the NEWEST 500 messages, oldest -> newest', async () => {
    const m = (n: number) => ({ _id: n, createdAt: new Date(2026, 0, n) });
    const { service, user, calls } = setup({ messagesNewestFirst: [m(3), m(2), m(1)] }); // what a createdAt:-1 query yields
    const r: any = await service.getThreadMessages(user as any, oid().toString());
    expect(calls).toHaveLength(1);
    expect(calls[0].sort).toEqual({ createdAt: -1 });
    expect(calls[0].limit).toBe(500);
    expect(r.messages.map((x: any) => x._id)).toEqual([1, 2, 3]); // reversed back to chronological order
  });

  it('after=<ISO>: only newer messages, oldest first, same thread/school scope', async () => {
    const older = [{ _id: 1 }, { _id: 2 }];
    const { service, user, calls, threadDoc } = setup({ messagesOldestFirst: older });
    const r: any = await service.getThreadMessages(user as any, oid().toString(), '2026-01-05T10:00:00.000Z');
    expect(calls[0].filter.createdAt).toEqual({ $gt: new Date('2026-01-05T10:00:00.000Z') });
    expect(String(calls[0].filter.threadId)).toBe(String(threadDoc._id));
    expect(calls[0].filter.schoolSlug).toBe('demo');
    expect(calls[0].sort).toEqual({ createdAt: 1 });
    expect(r.messages.map((x: any) => x._id)).toEqual([1, 2]);
  });

  it('an invalid after value is ignored (falls back to the newest-500 behaviour)', async () => {
    const { service, user, calls } = setup({ messagesNewestFirst: [{ _id: 2 }, { _id: 1 }] });
    const r: any = await service.getThreadMessages(user as any, oid().toString(), 'not-a-date');
    expect(calls[0].filter.createdAt).toBeUndefined();
    expect(calls[0].sort).toEqual({ createdAt: -1 });
    expect(r.messages.map((x: any) => x._id)).toEqual([1, 2]);
  });

  it('still refuses threads that are not mine (ownership query unchanged)', async () => {
    const { service, user, threadModel } = setup();
    await service.getThreadMessages(user as any, oid().toString());
    const q = threadModel.findOne.mock.calls[0][0];
    expect(q).toHaveProperty('staffId');
    expect(q).toHaveProperty('schoolSlug', 'demo');
  });
});

describe('StaffPortalService.listThreads unreadCount', () => {
  it('counts ALL matching unread threads, not only the (max 100) returned rows', async () => {
    const rows = Array.from({ length: 100 }, (_, i) => ({ _id: i, staffHasUnread: i < 3 })); // only 3 unread among the 100 returned
    const { service, user, threadModel } = setup({ threads: rows, unreadTotal: 137 });
    const r: any = await service.listThreads(user as any, {});
    expect(r.items).toHaveLength(100);
    expect(r.unreadCount).toBe(137);
    const countFilter = threadModel.countDocuments.mock.calls[0][0];
    expect(countFilter.staffHasUnread).toBe(true);
    expect(countFilter).toHaveProperty('staffId');
    expect(countFilter).toHaveProperty('schoolSlug', 'demo');
  });

  it('respects the status filter in the count (open only)', async () => {
    const { service, user, threadModel } = setup({ unreadTotal: 2 });
    await service.listThreads(user as any, { status: 'open' });
    expect(threadModel.countDocuments.mock.calls[0][0].status).toBe('open');
  });
});
