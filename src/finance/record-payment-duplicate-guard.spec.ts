import { BadRequestException } from '@nestjs/common';
import { Types } from 'mongoose';
import { FinanceService } from './finance.service';

// Pins the fix for "fee shown as received 2-4 times" reported across many
// students on the Finance module's Collect Payment flow. Root cause: the
// Collect Fee modal's Save button wasn't disabled while the request was in
// flight, so a double-click (or a slow network prompting another click)
// fired recordPayment twice with identical data, each creating its own
// Payment document. The frontend now disables Save during the request
// (ModalFooter's `saving` prop); this test pins the backend's own defense
// in depth - rejecting an exact-amount repeat for the same invoice within
// a short window.

function makeService(invoiceModel: any, paymentModel: any) {
  const n: any = {};
  const args = [n, n, invoiceModel, paymentModel];
  while (args.length < 40) args.push(n);
  const FinanceServiceAny: any = FinanceService;
  const service: FinanceService = new FinanceServiceAny(...args);
  jest.spyOn(service as any, 'getBaseCurrencyCode').mockResolvedValue('PKR');
  jest.spyOn(service as any, 'postFeePaymentJournal').mockResolvedValue(undefined);
  return service;
}

describe('FinanceService.recordPayment — duplicate-submission guard', () => {
  const invoiceId = String(new Types.ObjectId());
  const baseInvoice = {
    _id: invoiceId, status: 'partial', paidAmount: 0, totalAmount: 10000,
    studentId: new Types.ObjectId(), studentName: 'Test Student', invoiceNumber: 'INV-001',
  };

  it('rejects a second payment of the same amount for the same invoice within the dedup window', async () => {
    const invoiceModel: any = {
      findOne: jest.fn().mockResolvedValue({ ...baseInvoice }),
      findByIdAndUpdate: jest.fn(),
    };
    const paymentModel: any = function (this: any, doc: any) { Object.assign(this, doc); this.save = jest.fn().mockResolvedValue(this); };
    paymentModel.findOne = jest.fn().mockReturnValue({
      sort: () => ({ lean: () => Promise.resolve({ _id: 'existing-payment', amount: 3000 }) }),
    });

    const service = makeService(invoiceModel, paymentModel);

    await expect(
      service.recordPayment(invoiceId, 'school', { amount: 3000, paymentDate: new Date().toISOString() }),
    ).rejects.toThrow(BadRequestException);
    expect(invoiceModel.findByIdAndUpdate).not.toHaveBeenCalled();
  });

  it('allows the payment when no recent duplicate exists', async () => {
    const invoiceModel: any = {
      findOne: jest.fn().mockResolvedValue({ ...baseInvoice }),
      findByIdAndUpdate: jest.fn().mockResolvedValue({}),
    };
    const paymentModel: any = function (this: any, doc: any) { Object.assign(this, doc); this.save = jest.fn().mockResolvedValue(this); };
    paymentModel.findOne = jest.fn().mockReturnValue({ sort: () => ({ lean: () => Promise.resolve(null) }) });

    const service = makeService(invoiceModel, paymentModel);

    const result = await service.recordPayment(invoiceId, 'school', { amount: 3000, paymentDate: new Date().toISOString() });

    expect(result).toBeDefined();
    expect(invoiceModel.findByIdAndUpdate).toHaveBeenCalledTimes(1);
  });

  it('does not block a genuinely different payment amount made shortly after', async () => {
    const invoiceModel: any = {
      findOne: jest.fn().mockResolvedValue({ ...baseInvoice }),
      findByIdAndUpdate: jest.fn().mockResolvedValue({}),
    };
    const paymentModel: any = function (this: any, doc: any) { Object.assign(this, doc); this.save = jest.fn().mockResolvedValue(this); };
    // The dedup query itself filters by amount, so a differently-amounted
    // recent payment simply never matches - simulated here by returning null.
    paymentModel.findOne = jest.fn().mockReturnValue({ sort: () => ({ lean: () => Promise.resolve(null) }) });

    const service = makeService(invoiceModel, paymentModel);

    await expect(
      service.recordPayment(invoiceId, 'school', { amount: 5000, paymentDate: new Date().toISOString() }),
    ).resolves.toBeDefined();
  });
});
