import { Types } from 'mongoose';
import { LibrarySettings, LibrarySettingsSchema } from './schemas/library-settings.schema';
import mongoose from 'mongoose';

describe('LibraryZoneDef urduLabel/color fields', () => {
  const Model = mongoose.models.LibrarySettingsZoneSignTest
    || mongoose.model('LibrarySettingsZoneSignTest', LibrarySettingsSchema, undefined, { overwriteModels: true });

  it('round-trips a zone with urduLabel and color set', () => {
    const doc = new Model({
      tenantId: new Types.ObjectId(),
      zones: [
        { name: 'Non-fiction', description: 'General non-fiction', urduLabel: 'غیر افسانوی کتب', color: 'upper_primary' },
      ],
    });
    const err = doc.validateSync();
    expect(err).toBeUndefined();
    expect(doc.zones[0].name).toBe('Non-fiction');
    expect(doc.zones[0].urduLabel).toBe('غیر افسانوی کتب');
    expect(doc.zones[0].color).toBe('upper_primary');
  });

  it('defaults urduLabel and color to null when not provided (existing zones unaffected)', () => {
    const doc = new Model({
      tenantId: new Types.ObjectId(),
      zones: [{ name: 'Islamic Books' }],
    });
    const err = doc.validateSync();
    expect(err).toBeUndefined();
    expect(doc.zones[0].urduLabel).toBeNull();
    expect(doc.zones[0].color).toBeNull();
  });
});
