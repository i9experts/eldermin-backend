// Pure, framework-free helpers for ProcurementSettingsService's delete
// guards, mirroring subject-category-reference.util.ts's
// buildSubjectCategoryInUseMessage split — kept standalone so the
// message/pluralization logic is directly unit-testable without mocking
// Mongoose models.
//
// VendorCategory/ItemCategory/AssetCategory are referenced by
// Vendor.category / InventoryItem.category (plain strings matched by
// name, not a code ref) so a delete can be blocked by "how many
// vendors/items still use this name". UnitOfMeasure/PaymentTerm/
// DepreciationMethod are used inline as free strings with no formal
// FK anywhere, so they have no equivalent guard — see
// procurement-settings.schema.ts's per-collection comments.

/**
 * "Cannot delete this vendor category — it is still used by N vendor(s)."
 */
export function buildVendorCategoryInUseMessage(vendorCount: number): string {
  return `Cannot delete this vendor category - it is still used by ${vendorCount} vendor${vendorCount === 1 ? '' : 's'}. Reassign those vendors to a different category first, or deactivate the category instead.`;
}

/**
 * "Cannot delete this item category — it is still used by N inventory item(s)."
 */
export function buildItemCategoryInUseMessage(itemCount: number): string {
  return `Cannot delete this item category - it is still used by ${itemCount} inventory item${itemCount === 1 ? '' : 's'}. Reassign those items to a different category first, or deactivate the category instead.`;
}
