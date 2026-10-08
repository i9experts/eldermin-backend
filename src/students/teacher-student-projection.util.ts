import { isTeacherCaller } from '../staff-portal/teacher-identity.util';

/**
 * B5 (privacy): role-based field projection for the TEACHER role on every
 * student-bearing response the Teacher app can reach. One shared, explicit
 * deny-list; applied ONLY when `isTeacherCaller(user)`. Every other role gets
 * the payload back untouched (same object reference, byte-for-byte).
 *
 * DENY-LIST (key names, matched case-insensitively at ANY depth, so nested
 * guardians[], medical{}, customFields{} and arrays of students are covered):
 *
 *  1. Fees / finance (exact keys): fees, fee, feeStatus, feeStructure,
 *     feePlan, feeDiscount, feeSummary, feeAssignment, recentFees,
 *     monthlyTuitionFee, tuitionFee, monthlyFeeArrears, feeArrears, arrears,
 *     invoices, invoice, payments, payment, paidAmount, netAmount,
 *     outstanding, balance, discount, concession, scholarship,
 *     scholarshipHolder, scholarshipDetail.
 *  2. Phone numbers (any key containing phone | mobile | whatsapp | landline
 *     | telephone): guardians[].phone, whatsApp, altPhone, personalPhone,
 *     emergencyContactPhone, tutorPhone, medical.doctorPhone, PTM
 *     guardianPhone, ...
 *  3. National / identity numbers (any key containing cnic | nationalid |
 *     bform | passport | visa): nationalId, bForm, passportNumber, visaNo,
 *     guardians[].cnic.
 *  4. Income / employment (exact keys): monthlyIncome, income,
 *     householdIncome, familyIncome, employer, occupation.
 *
 * NOT stripped (OWNER DECISION, see docs): guardian email, student DOB,
 * home/permanent address, medical details, documents list, siblings, house,
 * transport, etc. See docs/staff-portal/PHASE6_FIXES.md.
 */
export const TEACHER_DENY_EXACT_KEYS: ReadonlySet<string> = new Set([
  'fees', 'fee', 'feestatus', 'feestructure', 'feeplan', 'feediscount', 'feesummary', 'feeassignment', 'recentfees',
  'monthlytuitionfee', 'tuitionfee', 'monthlyfeearrears', 'feearrears', 'arrears',
  'invoices', 'invoice', 'payments', 'payment', 'paidamount', 'netamount', 'outstanding', 'balance',
  'discount', 'concession', 'scholarship', 'scholarshipholder', 'scholarshipdetail',
  'monthlyincome', 'income', 'householdincome', 'familyincome', 'employer', 'occupation',
]);
const DENY_PATTERN = /phone|mobile|whatsapp|landline|telephone|cnic|nationalid|bform|passport|visa/;

export function isTeacherDeniedKey(key: string): boolean {
  const k = key.toLowerCase();
  return TEACHER_DENY_EXACT_KEYS.has(k) || DENY_PATTERN.test(k);
}

/** Mongo exclusion projection for the top-level Student fields (cheap, DB side). Nested guardians are cleaned by `stripTeacherSensitive`. */
export const TEACHER_STUDENT_SELECT =
  '-nationalId -bForm -passportNumber -visaNo -personalPhone -whatsApp -altPhone ' +
  '-emergencyContactPhone -tutorPhone -scholarshipHolder -scholarshipDetail ' +
  '-guardians.cnic -guardians.phone -guardians.occupation -guardians.employer -guardians.monthlyIncome ' +
  '-medical.doctorPhone';

function isPlainContainer(v: any): boolean {
  if (v === null || typeof v !== 'object') return false;
  if (Array.isArray(v)) return true;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

/**
 * Deep copy with deny-listed keys removed. Mongoose documents are converted
 * with toObject(); ObjectId / Date / Buffer leaves are kept as they are.
 */
export function stripTeacherSensitive<T = any>(value: T): T {
  const walk = (v: any): any => {
    if (v === null || v === undefined) return v;
    if (typeof v !== 'object') return v;
    if (v._bsontype) return v; // ObjectId, Decimal128 ...
    if (typeof v.toObject === 'function' && !Array.isArray(v) && !(v instanceof Date)) {
      try { v = v.toObject(); } catch { /* fall through */ }
    }
    if (Array.isArray(v)) return v.map(walk);
    if (!isPlainContainer(v)) return v;
    const out: any = {};
    for (const [k, val] of Object.entries(v)) {
      if (isTeacherDeniedKey(k)) continue;
      out[k] = walk(val);
    }
    return out;
  };
  return walk(value);
}

/** Entry point for controllers/services: teacher -> projected copy; anyone else -> the SAME object, untouched. */
export function projectForTeacher<T = any>(user: { role?: string; primaryRole?: string } | undefined | null, payload: T): T {
  return isTeacherCaller(user) ? stripTeacherSensitive(payload) : payload;
}

export const TEACHER_NO_FINANCE_MESSAGE = 'Fee and finance data is not available to the teacher role.';
