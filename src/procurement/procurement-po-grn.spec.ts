import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ProcurementService } from './procurement.service';

// Pins the PO edit/approve/reverse flow and the GRN edit flow fixed for
// the "PO edit doesn't save, approve doesn't work, no reverse option"
// report - mirrors the PurchaseRequest coverage style already established
// for this module (status-guarded edits, explicit approve/cancel methods).

function makePO(overrides: Partial<any> = {}) {
  return {
    _id: 'po1',
    vendorId: 'vendor1',
    status: 'draft',
    items: [{ itemName: 'Paper', quantity: 10, unitPrice: 100, discount: 0, taxRate: 0, receivedQuantity: 0 }],
    totalAmount: 1000,
    balanceDue: 1000,
    paidAmount: 0,
    ...overrides,
  };
}

function makeService(opts: {
  po?: any; grn?: any; poForGrn?: any;
} = {}) {
  const poModel: any = {
    findOne: jest.fn().mockResolvedValue(opts.po),
    findOneAndUpdate: jest.fn().mockImplementation((_f: any, update: any) => Promise.resolve({ ...opts.po, ...update.$set })),
    findById: jest.fn().mockResolvedValue(opts.poForGrn),
    findByIdAndUpdate: jest.fn().mockResolvedValue(undefined),
  };
  const vendorModel: any = { findByIdAndUpdate: jest.fn().mockResolvedValue(undefined) };
  function GrnModelCtor(this: any, doc: any) { Object.assign(this, doc); this.save = jest.fn().mockResolvedValue(this); }
  const grnModel: any = GrnModelCtor;
  grnModel.findOne = jest.fn().mockResolvedValue(opts.grn);
  grnModel.findOneAndUpdate = jest.fn().mockImplementation((_f: any, update: any) => Promise.resolve({ ...opts.grn, ...update.$set }));
  const inventoryModel: any = { findByIdAndUpdate: jest.fn().mockResolvedValue(undefined) };
  const prModel: any = {};
  const assetModel: any = {};
  const service = new ProcurementService(vendorModel, prModel, poModel, grnModel, inventoryModel, assetModel);
  return { service, poModel, vendorModel, grnModel, inventoryModel };
}

describe('ProcurementService.updatePO', () => {
  it('persists an edit to a draft PO (the reported "edit opens but does not save" bug)', async () => {
    const { service, poModel } = makeService({ po: makePO() });
    await service.updatePO('po1', 'demo-school', { title: 'Updated title' });
    expect(poModel.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: 'po1', schoolSlug: 'demo-school' },
      { $set: expect.objectContaining({ title: 'Updated title' }) },
      { new: true, runValidators: true },
    );
  });

  it('recomputes totals when items are edited', async () => {
    const { service, poModel } = makeService({ po: makePO() });
    await service.updatePO('po1', 'demo-school', {
      items: [{ itemName: 'Paper', quantity: 5, unitPrice: 200, discount: 10, taxRate: 10 }],
    });
    const setArg = poModel.findOneAndUpdate.mock.calls[0][1].$set;
    expect(setArg.subtotal).toBe(1000);
    expect(setArg.totalDiscount).toBe(100);
    expect(setArg.totalAmount).toBeCloseTo(990);
  });

  it('refuses to edit a PO that already has goods received', async () => {
    const { service } = makeService({ po: makePO({ status: 'partially_received' }) });
    await expect(service.updatePO('po1', 'demo-school', { title: 'x' })).rejects.toThrow(BadRequestException);
  });

  it('strips server-owned fields (status, approvedBy, paidAmount) from the edit payload', async () => {
    const { service, poModel } = makeService({ po: makePO() });
    await service.updatePO('po1', 'demo-school', { title: 'x', status: 'paid', approvedBy: 'hacker', paidAmount: 999999 });
    const setArg = poModel.findOneAndUpdate.mock.calls[0][1].$set;
    expect(setArg.status).toBeUndefined();
    expect(setArg.approvedBy).toBeUndefined();
    expect(setArg.paidAmount).toBeUndefined();
  });

  it('404s when the PO does not exist', async () => {
    const { service } = makeService({ po: null });
    await expect(service.updatePO('po1', 'demo-school', { title: 'x' })).rejects.toThrow(NotFoundException);
  });
});

describe('ProcurementService.approvePO', () => {
  it('approves a draft PO', async () => {
    const { service, poModel } = makeService({ po: makePO({ status: 'draft' }) });
    await service.approvePO('po1', 'demo-school', 'Admin');
    const setArg = poModel.findOneAndUpdate.mock.calls[0][1].$set;
    expect(setArg.status).toBe('approved');
    expect(setArg.approvedBy).toBe('Admin');
    expect(setArg.approvedAt).toBeInstanceOf(Date);
  });

  it('refuses to approve a PO that is not in draft', async () => {
    const { service } = makeService({ po: makePO({ status: 'sent' }) });
    await expect(service.approvePO('po1', 'demo-school', 'Admin')).rejects.toThrow(BadRequestException);
  });
});

describe('ProcurementService.cancelPO (Reverse PO)', () => {
  it('cancels a draft/approved/sent PO and rolls back the vendor totals createPO applied', async () => {
    const { service, poModel, vendorModel } = makeService({ po: makePO({ status: 'sent', totalAmount: 1000, balanceDue: 1000 }) });
    await service.cancelPO('po1', 'demo-school', 'Admin', 'Vendor could not fulfil');
    expect(vendorModel.findByIdAndUpdate).toHaveBeenCalledWith('vendor1', {
      $inc: { totalPurchased: -1000, outstandingBalance: -1000 },
    });
    const setArg = poModel.findOneAndUpdate.mock.calls[0][1].$set;
    expect(setArg.status).toBe('cancelled');
    expect(setArg.cancelledBy).toBe('Admin');
    expect(setArg.cancellationReason).toBe('Vendor could not fulfil');
  });

  it('refuses to cancel an already-cancelled PO', async () => {
    const { service } = makeService({ po: makePO({ status: 'cancelled' }) });
    await expect(service.cancelPO('po1', 'demo-school', 'Admin')).rejects.toThrow(BadRequestException);
  });

  it('refuses to cancel a PO that has received goods or been paid', async () => {
    const { service: s1 } = makeService({ po: makePO({ status: 'fully_received' }) });
    await expect(s1.cancelPO('po1', 'demo-school', 'Admin')).rejects.toThrow(BadRequestException);
    const { service: s2 } = makeService({ po: makePO({ status: 'paid' }) });
    await expect(s2.cancelPO('po1', 'demo-school', 'Admin')).rejects.toThrow(BadRequestException);
  });
});

describe('ProcurementService.updatePOStatus', () => {
  it('refuses to change the status of an already cancelled/paid PO', async () => {
    const { service } = makeService({ po: makePO({ status: 'cancelled' }) });
    await expect(service.updatePOStatus('po1', 'demo-school', 'sent')).rejects.toThrow(BadRequestException);
  });
});

describe('ProcurementService.updateGRN', () => {
  function makeGRN(overrides: Partial<any> = {}) {
    return {
      _id: 'grn1', purchaseOrderId: 'po1', verified: false,
      items: [{ itemName: 'Paper', orderedQuantity: 10, receivedQuantity: 5 }],
      ...overrides,
    };
  }

  it('refuses to edit an already-verified GRN', async () => {
    const { service } = makeService({ grn: makeGRN({ verified: true }) });
    await expect(service.updateGRN('grn1', 'demo-school', { notes: 'x' })).rejects.toThrow(BadRequestException);
  });

  it('persists a metadata edit on an unverified GRN', async () => {
    const { service, grnModel } = makeService({ grn: makeGRN() });
    await service.updateGRN('grn1', 'demo-school', { notes: 'Updated note' });
    expect(grnModel.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: 'grn1', schoolSlug: 'demo-school' },
      { $set: expect.objectContaining({ notes: 'Updated note' }) },
      { new: true, runValidators: true },
    );
  });

  it('reverses the old item quantities and re-applies the new ones on an item edit', async () => {
    const po = makePO({ items: [{ itemName: 'Paper', quantity: 10, unitPrice: 100, receivedQuantity: 5 }] });
    const { service, poModel } = makeService({ grn: makeGRN(), poForGrn: po });
    await service.updateGRN('grn1', 'demo-school', {
      items: [{ itemName: 'Paper', orderedQuantity: 10, receivedQuantity: 8 }],
    });
    // Two findByIdAndUpdate calls on the PO: one reversing -5, one applying +8 -> net receivedQuantity 8
    const calls = poModel.findByIdAndUpdate.mock.calls;
    expect(calls.length).toBeGreaterThanOrEqual(2);
    const lastSetItems = calls[calls.length - 1][1].$set.items;
    expect(lastSetItems.find((i: any) => i.itemName === 'Paper').receivedQuantity).toBe(8);
  });

  it('404s when the GRN does not exist', async () => {
    const { service } = makeService({ grn: null });
    await expect(service.updateGRN('grn1', 'demo-school', { notes: 'x' })).rejects.toThrow(NotFoundException);
  });
});

describe('ProcurementService.createGRN', () => {
  it('marks the PO fully_received when all items are received', async () => {
    const po = makePO({ items: [{ itemName: 'Paper', quantity: 10, unitPrice: 100, receivedQuantity: 0 }] });
    const { service, poModel } = makeService({ poForGrn: po });
    await service.createGRN({
      purchaseOrderId: 'po1', poNumber: 'PO-1', vendorName: 'V', receivedDate: new Date(),
      items: [{ itemName: 'Paper', orderedQuantity: 10, receivedQuantity: 10 }],
      schoolSlug: 'demo-school',
    });
    const setArg = poModel.findByIdAndUpdate.mock.calls[0][1].$set;
    expect(setArg.status).toBe('fully_received');
  });
});
