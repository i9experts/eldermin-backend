import { AuthService } from './auth.service';

// "Show Me Around" tour persistence: a 'global' scope marks the one-time
// sidebar/topbar tour as seen (so the frontend never auto-starts it
// again); any other scope is a module key, tracked independently in
// moduleToursSeen so dismissing one module's tour never affects another's.

function makeService() {
  let lastFilter: any;
  let lastUpdate: any;
  const svc: any = Object.create(AuthService.prototype);
  svc.userModel = {
    findOneAndUpdate: (filter: any, update: any) => {
      lastFilter = filter; lastUpdate = update;
      return { select: () => Promise.resolve({ _id: 'u1', globalTourCompleted: true, moduleToursSeen: ['finance'] }) };
    },
  };
  return { svc, getLast: () => ({ filter: lastFilter, update: lastUpdate }) };
}

describe('AuthService.updateTourState', () => {
  it('marks the global tour completed with a timestamp', async () => {
    const { svc, getLast } = makeService();
    await svc.updateTourState('u1', 't1', 'global');
    const { filter, update } = getLast();
    expect(filter).toEqual({ _id: 'u1', tenantId: 't1' });
    expect(update.$set.globalTourCompleted).toBe(true);
    expect(update.$set.globalTourCompletedAt).toBeInstanceOf(Date);
  });

  it('adds a module key to moduleToursSeen without touching the global flag', async () => {
    const { svc, getLast } = makeService();
    await svc.updateTourState('u1', 't1', 'finance');
    const { update } = getLast();
    expect(update.$addToSet).toEqual({ moduleToursSeen: 'finance' });
    expect(update.$set).toBeUndefined();
  });

  it('throws when the user does not exist', async () => {
    const svc: any = Object.create(AuthService.prototype);
    svc.userModel = { findOneAndUpdate: () => ({ select: () => Promise.resolve(null) }) };
    await expect(svc.updateTourState('missing', 't1', 'global')).rejects.toThrow('User not found');
  });
});
