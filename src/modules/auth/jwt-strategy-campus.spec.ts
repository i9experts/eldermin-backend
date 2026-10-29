import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy campus (BB11)', () => {
  const cfg: any = { get: () => 'secret' };
  it('a token WITHOUT campusId gets the campus derived from the account; a token WITH one keeps its own', async () => {
    const st = new JwtStrategy(cfg, { check: jest.fn().mockResolvedValue({ campusId: 'camp-derived' }) } as any);
    expect((await st.validate({ sub: 'u1', role: 'teacher' })).campusId).toBe('camp-derived');
    expect((await st.validate({ sub: 'u1', role: 'teacher', campusId: 'camp-token' })).campusId).toBe('camp-token');
  });
  it('nothing derived (multi-campus school, no campus on the staff row): the user stays campus-less, nothing is invented', async () => {
    const none = new JwtStrategy(cfg, { check: jest.fn().mockResolvedValue({}) } as any);
    expect((await none.validate({ sub: 'u1', role: 'teacher' })).campusId).toBeUndefined();
  });
});
