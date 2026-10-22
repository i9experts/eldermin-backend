import { recordLoginUsage } from './usage-log.util';

function todayMidnight() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

describe('recordLoginUsage', () => {
  it('upserts a UsageLog for the right institution/date and increments dailyLogins', async () => {
    const findOneAndUpdate = jest.fn((..._args: any[]) => Promise.resolve({}));
    const usageLogModel: any = { findOneAndUpdate };

    await recordLoginUsage(usageLogModel, 'deenway-school');

    expect(findOneAndUpdate).toHaveBeenCalledTimes(1);
    const [filter, update, options] = findOneAndUpdate.mock.calls[0] as any[];
    expect(filter).toEqual({ institutionSlug: 'deenway-school', date: todayMidnight() });
    expect(update).toEqual({
      $inc: { dailyLogins: 1 },
      $setOnInsert: { institutionSlug: 'deenway-school', date: todayMidnight() },
    });
    expect(options).toEqual({ upsert: true });
  });

  it('multiple logins the same day accumulate via $inc rather than overwriting or creating duplicate documents', async () => {
    // Simulates the real unique (institutionSlug, date) index + upsert behaviour:
    // each call targets the SAME filter, so a real DB would $inc the same doc.
    const findOneAndUpdate = jest.fn((..._args: any[]) => Promise.resolve({}));
    const usageLogModel: any = { findOneAndUpdate };

    await recordLoginUsage(usageLogModel, 'deenway-school');
    await recordLoginUsage(usageLogModel, 'deenway-school');
    await recordLoginUsage(usageLogModel, 'deenway-school');

    expect(findOneAndUpdate).toHaveBeenCalledTimes(3);
    const calls = findOneAndUpdate.mock.calls as any[][];
    const filters = calls.map((c) => c[0]);
    expect(filters[0]).toEqual(filters[1]);
    expect(filters[1]).toEqual(filters[2]);
    // Every call is a bare $inc:1 - never a $set of an absolute count -
    // so three calls against the same filter accumulate to 3, not stay at 1.
    for (const call of calls) {
      expect(call[1].$inc).toEqual({ dailyLogins: 1 });
    }
  });

  it('a write failure is logged and swallowed, never thrown - a login must still succeed', async () => {
    const usageLogModel: any = {
      findOneAndUpdate: jest.fn((..._args: any[]) => Promise.reject(new Error('mongo down'))),
    };
    await expect(recordLoginUsage(usageLogModel, 'deenway-school')).resolves.toBeUndefined();
  });

  it('is a no-op when there is no institutionSlug to attribute the login to', async () => {
    const findOneAndUpdate = jest.fn((..._args: any[]) => Promise.resolve({}));
    const usageLogModel: any = { findOneAndUpdate };
    await recordLoginUsage(usageLogModel, null);
    await recordLoginUsage(usageLogModel, undefined);
    expect(findOneAndUpdate).not.toHaveBeenCalled();
  });
});
