import { Types } from 'mongoose';
import { StaffNotifier } from './staff-notifier.service';

describe('StaffNotifier', () => {
  const uid = new Types.ObjectId();
  const input = { recipientUserId: uid, schoolSlug: 'demo', type: 'ptm', title: 'T', body: 'B', relatedEntityId: 'e1' };

  it('creates a notification row with the given fields', async () => {
    const model: any = { create: jest.fn().mockResolvedValue({}) };
    await new StaffNotifier(model).notify(input);
    expect(model.create).toHaveBeenCalledTimes(1);
    expect(model.create).toHaveBeenCalledWith({
      recipientUserId: uid, schoolSlug: 'demo', type: 'ptm', title: 'T', body: 'B', relatedEntityId: 'e1',
    });
  });

  it('swallows create() errors', async () => {
    const model: any = { create: jest.fn().mockRejectedValue(new Error('db down')) };
    await expect(new StaffNotifier(model).notify(input)).resolves.toBeUndefined();
  });

  it.each([
    ['null recipient', { recipientUserId: null }],
    ['undefined recipient', { recipientUserId: undefined }],
    ['empty slug', { schoolSlug: '' }],
  ])('does not write when %s', async (_n, patch) => {
    const model: any = { create: jest.fn() };
    await new StaffNotifier(model).notify({ ...input, ...(patch as any) });
    expect(model.create).not.toHaveBeenCalled();
  });
});
