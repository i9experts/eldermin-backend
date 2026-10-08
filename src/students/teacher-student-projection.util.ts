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
 *  5. (B5 round 2, owner-stated 2026-10-08, pending confirmation)
 *     Emails (any key containing `email`): guardians[].email, personalEmail,
 *     PTM guardianEmail, ...
 *     Addresses: any key containing address | street | postal | zip | geo |
 *     latitude | longitude | mailing, plus exact town, city, province, country,
 *     permanent{City,Province,Country}, previousSchoolCity, pickup... and dropoff....
 *     Documents: documents, document, fileUrl, documentUrl(s).
 *     Hostel: any key containing `hostel`.
 *     Transport: every `transport*` key except transportRoute (route NAME is
 *     kept); a nested `transport` object keeps only its route name; plus
 *     stop(s) | driver | vehicle | pickup | dropoff keys.
 *     Medical: the `medical` object keeps ONLY `allergies` and
 *     `emergencyAction` (the critical alert); everything else is dropped.
 *
 * KEPT: student DOB (dateOfBirth...), guardian name / relation / isPrimary,
 * medical.allergies, transportRoute, siblings, house, etc.
 * See docs/staff-portal/PHASE6_FIXES.md.
 */
export const TEACHER_DENY_EXACT_KEYS: ReadonlySet<string> = new Set([
  'fees', 'fee', 'feestatus', 'feestructure', 'feeplan', 'feediscount', 'feesummary', 'feeassignment', 'recentfees',
  'monthlytuitionfee', 'tuitionfee', 'monthlyfeearrears', 'feearrears', 'arrears',
  'invoices', 'invoice', 'payments', 'payment', 'paidamount', 'netamount', 'outstanding', 'balance',
  'discount', 'concession', 'scholarship', 'scholarshipholder', 'scholarshipdetail',
  'monthlyincome', 'income', 'householdincome', 'familyincome', 'employer', 'occupation',
]);
// B5 round 2 exact keys
for (const k of [
  'town', 'city', 'province', 'country', 'permanentcity', 'permanentprovince', 'permanentcountry', 'previousschoolcity',
  'documents', 'document', 'fileurl', 'documenturl', 'documenturls',
  'stop', 'stops', 'pickup', 'dropoff',
]) (TEACHER_DENY_EXACT_KEYS as Set<string>).add(k);
const DENY_PATTERN =
  /phone|mobile|whatsapp|landline|telephone|cnic|nationalid|bform|passport|visa|email|address|street|postal|zipcode|geo|latitude|longitude|mailing|hostel|pickup|dropoff|driver|vehicle|^transport(?!route$|$)/;

/** Containers whose children are allow-listed (everything else inside is dropped). */
const TEACHER_MEDICAL_KEEP: ReadonlySet<string> = new Set(['allergies', 'emergencyaction']);
const TEACHER_TRANSPORT_KEEP: ReadonlySet<string> = new Set(['routename', 'route', 'name']);

export function isTeacherDeniedKey(key: string): boolean {
  const k = key.toLowerCase();
  return TEACHER_DENY_EXACT_KEYS.has(k) || DENY_PATTERN.test(k);
}

/** Mongo exclusion projection for the top-level Student fields (cheap, DB side). Nested guardians are cleaned by `stripTeacherSensitive`. */
export const TEACHER_STUDENT_SELECT =
  '-nationalId -bForm -passportNumber -visaNo -personalPhone -whatsApp -altPhone ' +
  '-emergencyContactPhone -tutorPhone -scholarshipHolder -scholarshipDetail ' +
  '-guardians.cnic -guardians.phone -guardians.occupation -guardians.employer -guardians.monthlyIncome ' +
  '-medical.doctorPhone ' +
  // B5 round 2
  '-guardians.email -personalEmail -address -town -city -province -country -postalCode ' +
  '-permanentAddress -permanentCity -permanentProvince -permanentCountry -permanentPostalCode -previousSchoolCity ' +
  '-documents -hostelResident -hostelRoom -transportRequired -transportStop ' +
  '-medical.bloodGroup -medical.medications -medical.conditions -medical.doctorName -medical.doctorClinic ' +
  '-medical.peRestrictions -medical.dietaryRestrictions -medical.insuranceProvider -medical.insurancePolicyNumber -medical.specialNeedsDetail';

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
      const lk = k.toLowerCase();
      if ((lk === 'medical' || lk === 'transport') && val && typeof val === 'object' && !Array.isArray(val)) {
        const keep = lk === 'medical' ? TEACHER_MEDICAL_KEEP : TEACHER_TRANSPORT_KEEP;
        const inner: any = walk(val);
        const filtered: any = {};
        for (const [ik, iv] of Object.entries(inner || {})) if (keep.has(ik.toLowerCase())) filtered[ik] = iv;
        out[k] = filtered;
        continue;
      }
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
