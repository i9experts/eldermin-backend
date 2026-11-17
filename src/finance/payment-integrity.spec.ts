import { FinanceService } from './finance.service';
import { BadRequestException } from '@nestjs/common';

// Regression coverage for three bugs reported by The Deenway School across a
// large batch of student fee records: (1) a double-click/retry on "Record
// Payment" silently created a second Payment doc and double-counted it
// forever in every Collection report, with no guard at all; (2) a payment
// reversed via reversePayment() kept showing as "collected" in those same
// reports because isRefunded was never excluded; (3) deleting/reverting an
// invoice that had absorbed an earlier month's arrears never un-rolled that
// earlier invoice, orphaning it from Receivables/Defaulters forever while
// Parent Portal still showed it as payable.

function makeService(overrides: Record<number, any>) {
  const params: any[] = new Array(38).fill({});
  for (const [idx, val] of Object.entries(overrides)) params[Number(idx)] = val;
  return new (FinanceService as any)(...params);
}

const INVOICE_IDX = 2;
const PAYMENT_IDX = 3;
const JOURNAL_IDX = 14;

describe('FinanceService — payment/invoice integrity fixes', () => {
  describe('recordPayment — duplicate-submission guard', () => {
    const invoice = {
      _id: 'inv1', schoolSlug: 's', status: 'sent', totalAmount: 10000, paidAmount: 0,
    };

    it('rejects an identical payment recorded on the same invoice within the last 10 seconds', async () => {
      const paymentModel: any = {
        findOne: jest.fn().mockResolvedValue({ _id: 'existing-payment' }), // a recent duplicate exists
      };
      const invoiceModel: any = {
        findOne: jest.fn().mockResolvedValue(invoice),
      };
      const svc = makeService({ [INVOICE_IDX]: invoiceModel, [PAYMENT_IDX]: paymentModel });

      await expect(svc.recordPayment('inv1', 's', { amount: 5000, paymentDate: new Date().toISOString() }))
        .rejects.toThrow(BadRequestException);
      expect(paymentModel.findOne).toHaveBeenCalledWith(expect.objectContaining({
        invoiceId: invoice._id, amount: 5000, isRefunded: { $ne: true },
      }));
    });

    it('allows the payment through when no recent duplicate exists', async () => {
      function PaymentCtor(this: any, doc: any) { Object.assign(this, doc); this.save = jest.fn().mockResolvedValue(this); }
      const paymentModel: any = PaymentCtor;
      paymentModel.findOne = jest.fn().mockResolvedValue(null);

      const invoiceModel: any = {
        findOne: jest.fn().mockResolvedValue({ ...invoice }),
        findByIdAndUpdate: jest.fn().mockResolvedValue({}),
      };
      const svc: any = makeService({ [INVOICE_IDX]: invoiceModel, [PAYMENT_IDX]: paymentModel });
      svc.getBaseCurrencyCode = jest.fn().mockResolvedValue('PKR');
      svc.postFeePaymentJournal = jest.fn().mockResolvedValue(undefined);

      const result = await svc.recordPayment('inv1', 's', { amount: 5000, paymentDate: new Date().toISOString() });
      expect(result.amount).toBe(5000);
      expect(invoiceModel.findByIdAndUpdate).toHaveBeenCalledWith('inv1', {
        $set: { paidAmount: 5000, balanceDue: 5000, status: 'partial' },
      });
    });
  });

  describe('getCollectionReport — excludes reversed payments', () => {
    it('includes isRefunded: { $ne: true } in the payment match for every groupBy', async () => {
      const paymentModel: any = {
        find: jest.fn().mockReturnValue({
          sort: jest.fn().mockReturnThis(),
          select: jest.fn().mockReturnThis(),
          lean: jest.fn().mockResolvedValue([]),
        }),
      };
      const svc = makeService({ [PAYMENT_IDX]: paymentModel });
      await svc.getCollectionReport('s', { groupBy: 'slip' });
      expect(paymentModel.find).toHaveBeenCalledWith(expect.objectContaining({
        schoolSlug: 's', isRefunded: { $ne: true },
      }));
    });
  });

  describe('softDeleteInvoice — un-rolls orphaned arrears on delete', () => {
    it('clears rolledForwardInto on any invoice that had rolled its balance into the deleted invoice', async () => {
      const invoiceDoc: any = {
        _id: 'inv-oct', schoolSlug: 's', status: 'sent', paidAmount: 0,
        invoiceNumber: 'INV-OCT', save: jest.fn().mockResolvedValue(undefined),
      };
      const invoiceModel: any = {
        findOne: jest.fn().mockResolvedValue(invoiceDoc),
        updateMany: jest.fn().mockResolvedValue({}),
      };
      const paymentModel: any = { countDocuments: jest.fn().mockResolvedValue(0) };
      const journalModel: any = { find: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }) };
      const svc = makeService({ [INVOICE_IDX]: invoiceModel, [PAYMENT_IDX]: paymentModel, [JOURNAL_IDX]: journalModel });

      await svc.softDeleteInvoice('inv-oct', 's', 'admin');

      expect(invoiceModel.updateMany).toHaveBeenCalledWith(
        { schoolSlug: 's', rolledForwardInto: 'inv-oct' },
        { $set: { rolledForwardInto: null } },
      );
      expect(invoiceDoc.isDeleted).toBe(true);
    });
  });

  describe('fixOrphanedRolledForwardInvoices — repairs already-orphaned invoices', () => {
    it('finds invoices whose rolledForwardInto target no longer exists and un-rolls them (dry run by default)', async () => {
      const orphan = { _id: 'inv-sep', invoiceNumber: 'INV-SEP', studentName: 'Abeera Khan', month: '2026-09', balanceDue: 3000, rolledForwardInto: 'inv-oct-deleted' };
      const invoiceModel: any = {
        find: jest.fn()
          .mockReturnValueOnce({ select: jest.fn().mockReturnThis(), lean: jest.fn().mockResolvedValue([orphan]) })
          .mockReturnValueOnce({ select: jest.fn().mockReturnThis(), lean: jest.fn().mockResolvedValue([]) }), // target invoice is gone
        updateMany: jest.fn().mockResolvedValue({}),
      };
      const svc = makeService({ [INVOICE_IDX]: invoiceModel });

      const dryResult = await svc.fixOrphanedRolledForwardInvoices('s', true);
      expect(dryResult.orphansFound).toBe(1);
      expect(dryResult.orphansFixed).toBe(0);
      expect(invoiceModel.updateMany).not.toHaveBeenCalled();
    });

    it('actually clears rolledForwardInto when dryRun is false', async () => {
      const orphan = { _id: 'inv-sep', invoiceNumber: 'INV-SEP', studentName: 'Abeera Khan', month: '2026-09', balanceDue: 3000, rolledForwardInto: 'inv-oct-deleted' };
      const invoiceModel: any = {
        find: jest.fn()
          .mockReturnValueOnce({ select: jest.fn().mockReturnThis(), lean: jest.fn().mockResolvedValue([orphan]) })
          .mockReturnValueOnce({ select: jest.fn().mockReturnThis(), lean: jest.fn().mockResolvedValue([]) }),
        updateMany: jest.fn().mockResolvedValue({}),
      };
      const svc = makeService({ [INVOICE_IDX]: invoiceModel });

      const result = await svc.fixOrphanedRolledForwardInvoices('s', false);
      expect(result.orphansFixed).toBe(1);
      expect(invoiceModel.updateMany).toHaveBeenCalledWith(
        { _id: { $in: [orphan._id] } },
        { $set: { rolledForwardInto: null } },
      );
    });
  });
});
