import {
  buildVendorCategoryInUseMessage,
  buildItemCategoryInUseMessage,
  buildAssetCategoryInUseMessage,
} from './procurement-settings-reference.util';

describe('buildVendorCategoryInUseMessage', () => {
  it('pluralizes for more than one vendor', () => {
    expect(buildVendorCategoryInUseMessage(3)).toBe(
      'Cannot delete this vendor category - it is still used by 3 vendors. Reassign those vendors to a different category first, or deactivate the category instead.',
    );
  });

  it('does not pluralize for exactly one vendor', () => {
    expect(buildVendorCategoryInUseMessage(1)).toBe(
      'Cannot delete this vendor category - it is still used by 1 vendor. Reassign those vendors to a different category first, or deactivate the category instead.',
    );
  });
});

describe('buildItemCategoryInUseMessage', () => {
  it('pluralizes for more than one item', () => {
    expect(buildItemCategoryInUseMessage(5)).toBe(
      'Cannot delete this item category - it is still used by 5 inventory items. Reassign those items to a different category first, or deactivate the category instead.',
    );
  });

  it('does not pluralize for exactly one item', () => {
    expect(buildItemCategoryInUseMessage(1)).toBe(
      'Cannot delete this item category - it is still used by 1 inventory item. Reassign those items to a different category first, or deactivate the category instead.',
    );
  });
});

describe('buildAssetCategoryInUseMessage', () => {
  it('pluralizes for more than one asset', () => {
    expect(buildAssetCategoryInUseMessage(4)).toBe(
      'Cannot delete this asset category - it is still used by 4 assets. Reassign those assets to a different category first, or deactivate the category instead.',
    );
  });

  it('does not pluralize for exactly one asset', () => {
    expect(buildAssetCategoryInUseMessage(1)).toBe(
      'Cannot delete this asset category - it is still used by 1 asset. Reassign those assets to a different category first, or deactivate the category instead.',
    );
  });
});
