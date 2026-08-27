import { buildOfferLetterVariables, renderOfferLetterTemplate } from './offer-letter-template.util';

describe('renderOfferLetterTemplate', () => {
  const offer = {
    candidateName: 'Ayesha Khan',
    candidateEmail: 'ayesha@example.com',
    candidatePhone: '0300-1234567',
    designation: 'Senior Teacher',
    department: 'Academics',
    currency: 'PKR',
    proposedSalary: 85000,
    proposedJoiningDate: '2026-08-01T00:00:00.000Z',
    offerValidUntil: '2026-07-15T00:00:00.000Z',
    probationPeriodMonths: 3,
    reportingTo: 'Principal',
    offerNo: 'OFR-2026-0001',
  };

  it('substitutes every recognised placeholder with its formatted value', () => {
    const body = 'Dear {{candidateName}}, we offer you {{designation}} in {{department}} at {{schoolName}} for {{proposedSalary}}, joining {{joiningDate}}.';
    const rendered = renderOfferLetterTemplate(body, offer, 'Greenwood School');
    expect(rendered).toBe(
      'Dear Ayesha Khan, we offer you Senior Teacher in Academics at Greenwood School for PKR 85,000/month, joining 01 August 2026.',
    );
  });

  it('resolves an unknown placeholder to an empty string rather than leaving literal {{...}} text', () => {
    expect(renderOfferLetterTemplate('Hello {{notARealVar}}!', offer, 'School')).toBe('Hello !');
  });

  it('leaves plain text with no placeholders untouched', () => {
    expect(renderOfferLetterTemplate('No variables here.', offer, 'School')).toBe('No variables here.');
  });

  it('defaults proposedSalary currency to PKR and amount to 0 when absent', () => {
    const minimal = { candidateName: 'X' };
    expect(renderOfferLetterTemplate('{{proposedSalary}}', minimal, 'School')).toBe('PKR 0/month');
  });

  it('falls back department to an em-dash when not provided, matching the PDF fields display', () => {
    const vars = buildOfferLetterVariables({ candidateName: 'X' }, 'School');
    expect(vars.department).toBe('—');
  });

  it('formats probation period only when present', () => {
    expect(buildOfferLetterVariables({ probationPeriodMonths: 6 }, 'School').probationPeriod).toBe('6 months');
    expect(buildOfferLetterVariables({}, 'School').probationPeriod).toBe('');
  });

  it('handles an empty/undefined body without throwing', () => {
    expect(renderOfferLetterTemplate('', offer, 'School')).toBe('');
    expect(renderOfferLetterTemplate(undefined as any, offer, 'School')).toBe('');
  });
});
