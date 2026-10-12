import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { EventsService } from './events.service';
import { EventsController } from './events.controller';

// Tiny in-memory matcher for the operators the service uses ($and, $or, $in, $exists, equality incl. null).
function matches(doc: any, f: any): boolean {
  return Object.entries(f).every(([k, v]: [string, any]) => {
    if (k === '$and') return v.every((x: any) => matches(doc, x));
    if (k === '$or') return v.some((x: any) => matches(doc, x));
    const val = doc[k];
    if (v && typeof v === 'object' && !(v instanceof Date)) {
      if ('$in' in v) return v.$in.includes(val);
      if ('$nin' in v) return !v.$nin.includes(val);
      if ('$exists' in v) return (val !== undefined) === v.$exists;
      if ('$ne' in v) return val !== v.$ne;
    }
    if (v === null) return val === null || val === undefined;
    return String(val) === String(v);
  });
}

const EVENTS: any[] = [
  { _id: 'draft', title: 'Draft', status: 'draft', visibility: 'public', campusId: null, schoolSlug: 's' },
  { _id: 'pub', title: 'Public', status: 'published', visibility: 'public', campusId: null, schoolSlug: 's' },
  { _id: 'internal', title: 'Staff only', status: 'published', visibility: 'internal', campusId: null, schoolSlug: 's' },
  { _id: 'mine', title: 'Mine', status: 'published', visibility: 'public', campusId: 'c1', schoolSlug: 's' },
  { _id: 'other', title: 'Other campus', status: 'published', visibility: 'public', campusId: 'c2', schoolSlug: 's' },
  { _id: 'priv', title: 'Private', status: 'published', visibility: 'private', campusId: null, schoolSlug: 's' },
  { _id: 'unl', title: 'Unlisted', status: 'published', visibility: 'unlisted', campusId: null, schoolSlug: 's' },
  { _id: 'novis', title: 'Legacy no visibility', status: 'published', campusId: null, schoolSlug: 's' },
  { _id: 'done', title: 'Done', status: 'completed', visibility: 'public', campusId: null, schoolSlug: 's' },
  { _id: 'cancel', title: 'Cancelled', status: 'cancelled', visibility: 'public', campusId: null, schoolSlug: 's' },
];
const TT = [{ name: 'VIP', priceTiers: [{ price: 5000 }] }];
const PC = [{ code: 'P20', discountValue: 20 }];

function make() {
  const eventModel: any = {
    find: jest.fn((f: any) => { const r = EVENTS.filter((d) => matches(d, f)); const c: any = { sort: () => c, lean: async () => r }; return c; }),
    findOne: jest.fn((f: any) => ({ lean: async () => EVENTS.find((d) => matches(d, f)) || null })),
  };
  const ttModel: any = { find: jest.fn(() => { const c: any = { sort: () => c, lean: async () => TT }; return c; }) };
  const pcModel: any = { find: jest.fn(() => ({ lean: async () => PC })) };
  const noop: any = {};
  const service = new EventsService(eventModel, ttModel, pcModel, noop, noop, noop, noop, noop, noop, noop);
  return { service, ttModel, pcModel, eventModel };
}
const teacher = { role: 'teacher', campusId: 'c1' };

describe('EventsService teacher visibility', () => {
  it('teacher list: no drafts, no other-campus events; internal and own-campus events stay', async () => {
    const { service } = make();
    const ids = (await service.getEvents('s', {}, teacher)).map((e: any) => e._id).sort();
    expect(ids).toEqual(['cancel', 'done', 'internal', 'mine', 'novis', 'pub']);
  });

  it('teacher list with ?status=draft stays empty (cannot widen the filter)', async () => {
    const { service } = make();
    expect(await service.getEvents('s', { status: 'draft' }, teacher)).toEqual([]);
  });

  it.each([undefined, null, ''])('teacher without a campus (%p): list and by id -> 403 with the exact message, nothing read', async (campusId) => {
    const { service, eventModel } = make();
    const u: any = { role: 'teacher', campusId };
    await expect(service.getEvents('s', {}, u)).rejects.toThrow(ForbiddenException);
    await expect(service.getEvents('s', {}, u)).rejects.toThrow('No campus assigned \u2014 contact your administrator');
    await expect(service.getEventById('s', 'pub', u)).rejects.toThrow(ForbiddenException);
    expect(eventModel.find).not.toHaveBeenCalled();
    expect(eventModel.findOne).not.toHaveBeenCalled();
  });

  it.each(['admin', 'principal', 'parent', 'hr_manager', 'institution_owner'])('%s without a campus is unchanged (no 403)', async (role) => {
    const { service } = make();
    expect((await service.getEvents('s', {}, { role })).length).toBe(EVENTS.length);
    expect((await service.getEventById('s', 'draft', { role }) as any)._id).toBe('draft');
  });

  it('teacher detail: no ticketTypes / promoCodes keys and the ticket collections are not read', async () => {
    const { service, ttModel, pcModel } = make();
    const e: any = await service.getEventById('s', 'pub', teacher);
    expect(e._id).toBe('pub');
    expect(Object.keys(e)).not.toEqual(expect.arrayContaining(['ticketTypes']));
    expect(JSON.stringify(e)).not.toMatch(/ticketTypes|promoCodes|priceTiers|P20|VIP/);
    expect(ttModel.find).not.toHaveBeenCalled();
    expect(pcModel.find).not.toHaveBeenCalled();
  });

  it('teacher detail: draft and other-campus events -> 404; internal event readable', async () => {
    const { service } = make();
    await expect(service.getEventById('s', 'draft', teacher)).rejects.toThrow(NotFoundException);
    await expect(service.getEventById('s', 'other', teacher)).rejects.toThrow(NotFoundException);
    expect((await service.getEventById('s', 'internal', teacher) as any)._id).toBe('internal');
  });

  it('teacher: private and unlisted events are not listed and by id -> 404', async () => {
    const { service } = make();
    const ids = (await service.getEvents('s', {}, teacher)).map((e: any) => e._id);
    expect(ids).not.toContain('priv');
    expect(ids).not.toContain('unl');
    await expect(service.getEventById('s', 'priv', teacher)).rejects.toThrow(NotFoundException);
    await expect(service.getEventById('s', 'unl', teacher)).rejects.toThrow(NotFoundException);
  });

  it.each(['admin', 'principal', 'institution_owner', 'parent', 'hr_manager'])('%s: unchanged (drafts, other campuses, tickets and promos included)', async (role) => {
    const { service } = make();
    expect((await service.getEvents('s', {}, { role, campusId: 'c1' })).length).toBe(EVENTS.length);
    const d: any = await service.getEventById('s', 'draft', { role, campusId: 'c1' });
    expect(d.ticketTypes).toEqual(TT);
    expect(d.promoCodes).toEqual(PC);
    expect((await service.getEventById('s', 'other', { role, campusId: 'c1' }) as any)._id).toBe('other');
  });

  it('no user (legacy call) is unchanged', async () => {
    const { service } = make();
    expect((await service.getEvents('s')).length).toBe(EVENTS.length);
  });

  it('controller passes req.user through', async () => {
    const { service } = make();
    const ctl = new EventsController(service, {} as any);
    const rows: any[] = await ctl.getEvents({ user: { ...teacher, schoolSlug: 's' } }, {});
    expect(rows.some((r) => r._id === 'draft')).toBe(false);
    await expect(ctl.getEventById({ user: { ...teacher, schoolSlug: 's' } }, 'draft')).rejects.toThrow(NotFoundException);
  });
});
