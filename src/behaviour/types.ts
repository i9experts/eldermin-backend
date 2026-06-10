// ============================================================
// BEHAVIOUR & TARBIYAH — TYPES + CONSTANTS
// Eldermin ERP | React + TypeScript
// ============================================================

export type BehaviourType = 'positive' | 'negative' | 'neutral';
export type SeverityLevel = 'low' | 'medium' | 'high' | 'critical';
export type TarbiyahRating = 'excellent' | 'good' | 'satisfactory' | 'needs_improvement' | 'critical';
export type InterventionTier = 'tier1_universal' | 'tier2_targeted' | 'tier3_intensive';

export interface BehaviourRecord {
  _id: string;
  studentId: string;
  studentName: string;
  grade: string;
  section?: string;
  date: string;
  type: BehaviourType;
  category: string;
  title: string;
  description: string;
  severity: SeverityLevel;
  points: number;
  actionTaken?: string;
  consequence?: string;
  followUpRequired: boolean;
  followUpDate?: string;
  resolved: boolean;
  parentNotified: boolean;
  reportedBy: string;
  verified: boolean;
  academicYear: string;
}

export interface TarbiyahTrait {
  key: string;
  nameEn: string;
  nameAr: string;
  category: string;
}

export interface TraitScore {
  traitKey: string;
  score: number; // 1-5
  observation?: string;
}

export interface TarbiyahAssessment {
  _id: string;
  studentId: string;
  studentName: string;
  grade: string;
  section?: string;
  period: string;
  periodType: string;
  assessmentDate: string;
  traits: TraitScore[];
  overallScore: number;
  overallPercentage: number;
  overallRating: TarbiyahRating;
  teacherObservations?: string;
  areasOfStrength: string[];
  areasForImprovement: string[];
  assessedBy: string;
  parentShared: boolean;
  academicYear?: string;
}

export interface CounsellingSession {
  _id: string;
  studentId: string;
  studentName: string;
  grade: string;
  sessionDate: string;
  sessionTime?: string;
  duration?: number;
  type: string;
  format: string;
  referredBy: string;
  referralReason?: string;
  counsellor: string;
  sessionNotes?: string;
  studentResponse?: string;
  actionPlan?: string;
  goals?: string[];
  status: string;
  followUpRequired: boolean;
  nextSessionDate?: string;
  parentInformed: boolean;
  parentPresent?: boolean;
  confidential: boolean;
  academicYear?: string;
}

export interface InterventionAction {
  _id: string;
  action: string;
  responsible: string;
  dueDate?: string;
  status: string;
  completionNote?: string;
}

export interface Intervention {
  _id: string;
  studentId: string;
  studentName: string;
  grade: string;
  title: string;
  type: string;
  tier: InterventionTier;
  concern: string;
  goals: string[];
  strategies: string[];
  actions: InterventionAction[];
  startDate: string;
  reviewDate?: string;
  status: string;
  outcome?: string;
  team: string[];
  createdBy: string;
  progressNotes: { date: string; note: string; addedBy: string }[];
  academicYear?: string;
}

// ── Constants ─────────────────────────────────────────────────
export const TYPE_CONFIG: Record<BehaviourType, { label: string; color: string; bg: string; border: string }> = {
  positive: { label: 'Positive', color: 'text-emerald-700', bg: 'bg-emerald-100', border: 'border-emerald-200' },
  negative: { label: 'Negative', color: 'text-red-700', bg: 'bg-red-100', border: 'border-red-200' },
  neutral: { label: 'Neutral', color: 'text-blue-700', bg: 'bg-blue-100', border: 'border-blue-200' },
};

export const SEVERITY_CONFIG: Record<SeverityLevel, { label: string; color: string; dot: string }> = {
  low: { label: 'Low', color: 'bg-gray-100 text-gray-600', dot: 'bg-gray-400' },
  medium: { label: 'Medium', color: 'bg-amber-100 text-amber-700', dot: 'bg-amber-500' },
  high: { label: 'High', color: 'bg-orange-100 text-orange-700', dot: 'bg-orange-500' },
  critical: { label: 'Critical', color: 'bg-red-100 text-red-700', dot: 'bg-red-600' },
};

export const TARBIYAH_RATING_CONFIG: Record<TarbiyahRating, { label: string; color: string; stars: number }> = {
  excellent: { label: 'Excellent (Mumtaz)', color: 'text-emerald-600 bg-emerald-50', stars: 5 },
  good: { label: 'Good (Jayyid)', color: 'text-blue-600 bg-blue-50', stars: 4 },
  satisfactory: { label: 'Satisfactory (Maqbool)', color: 'text-amber-600 bg-amber-50', stars: 3 },
  needs_improvement: { label: 'Needs Improvement', color: 'text-orange-600 bg-orange-50', stars: 2 },
  critical: { label: 'Critical Concern', color: 'text-red-600 bg-red-50', stars: 1 },
};

export const TARBIYAH_TRAITS: TarbiyahTrait[] = [
  { key: 'sidq',     nameEn: 'Truthfulness (Sidq)',      nameAr: 'الصدق',     category: 'character' },
  { key: 'amanah',   nameEn: 'Trustworthiness (Amanah)', nameAr: 'الأمانة',   category: 'character' },
  { key: 'adab',     nameEn: 'Manners & Respect (Adab)', nameAr: 'الأدب',     category: 'social' },
  { key: 'ihsan',    nameEn: 'Excellence (Ihsan)',        nameAr: 'الإحسان',   category: 'academic' },
  { key: 'sabr',     nameEn: 'Patience (Sabr)',           nameAr: 'الصبر',     category: 'character' },
  { key: 'tawadu',   nameEn: "Humility (Tawadu')",        nameAr: 'التواضع',   category: 'character' },
  { key: 'shukr',    nameEn: 'Gratitude (Shukr)',         nameAr: 'الشكر',     category: 'spiritual' },
  { key: 'ukhuwwah', nameEn: 'Brotherhood (Ukhuwwah)',    nameAr: 'الأخوة',    category: 'social' },
  { key: 'ijtihad',  nameEn: 'Diligence (Ijtihad)',       nameAr: 'الاجتهاد', category: 'academic' },
  { key: 'nazafah',  nameEn: 'Cleanliness (Nazafah)',     nameAr: 'النظافة',   category: 'spiritual' },
  { key: 'itqan',    nameEn: 'Precision (Itqan)',         nameAr: 'الإتقان',   category: 'academic' },
  { key: 'tawakkul', nameEn: 'Trust in Allah (Tawakkul)', nameAr: 'التوكل',   category: 'spiritual' },
];

export const BEHAVIOUR_CATEGORIES = {
  positive: [
    'academic_excellence', 'helping_others', 'leadership',
    'good_conduct', 'community_service', 'innovation',
    'sportsmanship', 'attendance_excellence', 'moral_courage',
  ],
  negative: [
    'misconduct', 'bullying', 'cheating', 'dishonesty',
    'disrespect', 'property_damage', 'late_coming',
    'uniform_violation', 'phone_misuse', 'absenteeism',
    'fighting', 'harassment', 'vandalism',
  ],
  neutral: [
    'counselling_referral', 'parent_meeting', 'warning_issued',
    'behaviour_contract', 'restorative_practice',
  ],
};

export const CATEGORY_LABELS: Record<string, string> = {
  academic_excellence: 'Academic Excellence',
  helping_others: 'Helping Others',
  leadership: 'Leadership',
  good_conduct: 'Good Conduct',
  community_service: 'Community Service',
  innovation: 'Innovation',
  sportsmanship: 'Sportsmanship',
  attendance_excellence: 'Perfect Attendance',
  moral_courage: 'Moral Courage',
  misconduct: 'Misconduct',
  bullying: 'Bullying',
  cheating: 'Cheating',
  dishonesty: 'Dishonesty',
  disrespect: 'Disrespect',
  property_damage: 'Property Damage',
  late_coming: 'Late Coming',
  uniform_violation: 'Uniform Violation',
  phone_misuse: 'Phone Misuse',
  absenteeism: 'Absenteeism',
  fighting: 'Fighting',
  harassment: 'Harassment',
  vandalism: 'Vandalism',
  counselling_referral: 'Counselling Referral',
  parent_meeting: 'Parent Meeting',
  warning_issued: 'Warning Issued',
  behaviour_contract: 'Behaviour Contract',
  restorative_practice: 'Restorative Practice',
};

export const INTERVENTION_TIERS = [
  { value: 'tier1_universal', label: 'Tier 1 — Universal', desc: 'School-wide prevention', color: 'bg-green-100 text-green-700' },
  { value: 'tier2_targeted', label: 'Tier 2 — Targeted', desc: 'Small group support', color: 'bg-amber-100 text-amber-700' },
  { value: 'tier3_intensive', label: 'Tier 3 — Intensive', desc: 'Individual intensive', color: 'bg-red-100 text-red-700' },
];

export const GRADES = [
  'Pre-Nursery','Nursery','KG-1','KG-2',
  'Grade 1','Grade 2','Grade 3','Grade 4','Grade 5',
  'Grade 6','Grade 7','Grade 8',
  'Grade 9','Grade 10','Grade 11','Grade 12',
];

export const STAFF_LIST = [
  'Ahmad Ali','Sara Malik','Usman Khan','Ayesha Siddiqui',
  'Bilal Ahmed','Fatima Noor','Hassan Raza','Zainab Mirza',
];

// ── Seed Data ─────────────────────────────────────────────────
export const SEED_RECORDS: BehaviourRecord[] = [
  {
    _id: 'r1', studentId: 's1', studentName: 'Sara Khan', grade: 'Grade 7', section: 'A',
    date: '2025-02-05', type: 'positive', category: 'academic_excellence',
    title: 'Outstanding Science Project', points: 10,
    description: 'Presented an exceptional science project on renewable energy. Showed deep research and creativity.',
    severity: 'low', followUpRequired: false, resolved: true,
    parentNotified: true, reportedBy: 'Ahmad Ali', verified: true, academicYear: '2025-26',
  },
  {
    _id: 'r2', studentId: 's2', studentName: 'Ahmed Bilal', grade: 'Grade 7', section: 'B',
    date: '2025-02-08', type: 'negative', category: 'misconduct',
    title: 'Classroom Disruption', points: -5,
    description: 'Repeatedly disrupted the class during Mathematics period despite verbal warnings.',
    severity: 'medium', followUpRequired: true, followUpDate: '2025-02-15', resolved: false,
    parentNotified: true, reportedBy: 'Sara Malik', verified: true, academicYear: '2025-26',
    actionTaken: 'Verbal warning issued. Parent informed.', consequence: 'verbal_warning',
  },
  {
    _id: 'r3', studentId: 's3', studentName: 'Usman Tariq', grade: 'Grade 9', section: 'A',
    date: '2025-02-10', type: 'negative', category: 'bullying',
    title: 'Bullying Incident in Playground', points: -15,
    description: 'Reported to have been bullying a Grade 7 student during lunch break. Witnesses confirmed.',
    severity: 'critical', followUpRequired: true, followUpDate: '2025-02-11', resolved: false,
    parentNotified: false, reportedBy: 'Usman Khan', verified: false, academicYear: '2025-26',
    consequence: 'counselling',
  },
  {
    _id: 'r4', studentId: 's4', studentName: 'Maryam Hussain', grade: 'Grade 5', section: 'A',
    date: '2025-02-12', type: 'positive', category: 'helping_others',
    title: 'Acts of Kindness Initiative', points: 8,
    description: 'Organized a food drive for underprivileged families. Showed exceptional leadership and compassion.',
    severity: 'low', followUpRequired: false, resolved: true,
    parentNotified: true, reportedBy: 'Ahmad Ali', verified: true, academicYear: '2025-26',
  },
  {
    _id: 'r5', studentId: 's5', studentName: 'Ali Hassan', grade: 'Grade 9', section: 'B',
    date: '2025-02-13', type: 'negative', category: 'late_coming',
    title: 'Repeated Late Arrival', points: -3,
    description: 'Third occurrence of arriving late this month. No valid reason provided.',
    severity: 'medium', followUpRequired: true, followUpDate: '2025-02-20', resolved: false,
    parentNotified: false, reportedBy: 'Bilal Ahmed', verified: true, academicYear: '2025-26',
    consequence: 'written_warning',
  },
];

export const SEED_TARBIYAH: TarbiyahAssessment[] = [
  {
    _id: 't1', studentId: 's1', studentName: 'Sara Khan', grade: 'Grade 7', section: 'A',
    period: 'Term 1 2025-26', periodType: 'termly', assessmentDate: '2025-02-01',
    traits: [
      { traitKey: 'sidq', score: 5, observation: 'Always honest, even when difficult' },
      { traitKey: 'amanah', score: 5, observation: 'Highly responsible with school property' },
      { traitKey: 'adab', score: 4, observation: 'Respectful to all teachers and peers' },
      { traitKey: 'ihsan', score: 5, observation: 'Exceptional quality in all academic work' },
      { traitKey: 'sabr', score: 4, observation: 'Patient during difficulties' },
      { traitKey: 'tawadu', score: 4, observation: 'Humble despite academic achievements' },
      { traitKey: 'shukr', score: 5, observation: 'Expresses gratitude regularly' },
      { traitKey: 'ukhuwwah', score: 5, observation: 'Excellent team player, helps classmates' },
      { traitKey: 'ijtihad', score: 5, observation: 'Works hard consistently' },
      { traitKey: 'nazafah', score: 4, observation: 'Maintains personal and workspace cleanliness' },
      { traitKey: 'itqan', score: 4, observation: 'Careful and precise in work' },
      { traitKey: 'tawakkul', score: 5, observation: 'Strong faith and reliance on Allah' },
    ],
    overallScore: 4.58, overallPercentage: 91.7, overallRating: 'excellent',
    teacherObservations: 'Sara is an exemplary student in both academics and character. A role model for her peers.',
    areasOfStrength: ['Truthfulness', 'Excellence', 'Brotherhood'],
    areasForImprovement: [],
    assessedBy: 'Ahmad Ali', parentShared: true, academicYear: '2025-26',
  },
  {
    _id: 't2', studentId: 's2', studentName: 'Ahmed Bilal', grade: 'Grade 7', section: 'B',
    period: 'Term 1 2025-26', periodType: 'termly', assessmentDate: '2025-02-01',
    traits: [
      { traitKey: 'sidq', score: 3, observation: 'Sometimes avoids full truth when in trouble' },
      { traitKey: 'amanah', score: 3, observation: 'Needs reminders about responsibilities' },
      { traitKey: 'adab', score: 2, observation: 'Has shown disrespect to peers on occasions' },
      { traitKey: 'ihsan', score: 3, observation: 'Has potential but lacks consistency' },
      { traitKey: 'sabr', score: 2, observation: 'Gets frustrated easily, needs work' },
      { traitKey: 'tawadu', score: 2, observation: 'Shows arrogance at times' },
      { traitKey: 'shukr', score: 3, observation: 'Average gratitude expression' },
      { traitKey: 'ukhuwwah', score: 2, observation: 'Struggles with teamwork' },
      { traitKey: 'ijtihad', score: 3, observation: 'Inconsistent effort' },
      { traitKey: 'nazafah', score: 3, observation: 'Acceptable' },
      { traitKey: 'itqan', score: 3, observation: 'Careless at times' },
      { traitKey: 'tawakkul', score: 3, observation: 'Moderate' },
    ],
    overallScore: 2.75, overallPercentage: 55, overallRating: 'needs_improvement',
    teacherObservations: 'Ahmed has potential but needs significant character development work. Counselling recommended.',
    areasOfStrength: ['Gratitude', 'Cleanliness'],
    areasForImprovement: ['Manners', 'Patience', 'Humility', 'Brotherhood'],
    assessedBy: 'Sara Malik', parentShared: false, academicYear: '2025-26',
  },
];

export const SEED_INTERVENTIONS: Intervention[] = [
  {
    _id: 'int1', studentId: 's2', studentName: 'Ahmed Bilal', grade: 'Grade 7',
    title: 'Behaviour Improvement Plan — Ahmed Bilal',
    type: 'behavioural', tier: 'tier2_targeted',
    concern: 'Repeated classroom disruption, disrespect towards peers, and declining Tarbiyah scores',
    goals: ['Reduce classroom disruptions to 0 per week', 'Improve Adab score to 4 by Term 2', 'Build positive relationships with 3 peers'],
    strategies: ['Weekly check-in with counsellor', 'Seat change to front row', 'Anger management techniques', 'Positive reinforcement system'],
    actions: [
      { _id: 'a1', action: 'Weekly counselling session', responsible: 'Ahmad Ali', dueDate: '2025-03-01', status: 'in_progress' },
      { _id: 'a2', action: 'Parent meeting to discuss plan', responsible: 'Class Teacher', dueDate: '2025-02-20', status: 'completed', completionNote: 'Parents fully cooperative' },
      { _id: 'a3', action: 'Assign peer mentor', responsible: 'Ahmad Ali', dueDate: '2025-02-25', status: 'pending' },
    ],
    startDate: '2025-02-10', reviewDate: '2025-03-10',
    status: 'active', team: ['Ahmad Ali', 'Sara Malik', 'School Counsellor'],
    createdBy: 'Ahmad Ali', progressNotes: [
      { date: '2025-02-12', note: 'First session completed. Student showed willingness to improve.', addedBy: 'Ahmad Ali' },
    ], academicYear: '2025-26',
  },
];

export const SEED_COUNSELLING: CounsellingSession[] = [
  {
    _id: 'cs1', studentId: 's2', studentName: 'Ahmed Bilal', grade: 'Grade 7',
    sessionDate: '2025-02-12', sessionTime: '10:00 AM', duration: 45,
    type: 'behavioural', format: 'individual',
    referredBy: 'Sara Malik', referralReason: 'Repeated classroom disruption',
    counsellor: 'Ahmad Ali',
    sessionNotes: 'Discussed root causes of disruptive behaviour. Student mentioned feeling left out socially.',
    studentResponse: 'Open to talking. Admitted behaviour was wrong. Wants to improve.',
    actionPlan: 'Weekly sessions. Peer mentoring programme. Parent involvement.',
    goals: ['Improve classroom behaviour', 'Build social connections'],
    status: 'completed', followUpRequired: true, nextSessionDate: '2025-02-19',
    parentInformed: true, parentPresent: false, confidential: false, academicYear: '2025-26',
  },
  {
    _id: 'cs2', studentId: 's3', studentName: 'Usman Tariq', grade: 'Grade 9',
    sessionDate: '2025-02-14', sessionTime: '02:00 PM', duration: 60,
    type: 'behavioural', format: 'individual',
    referredBy: 'Principal', referralReason: 'Bullying incident',
    counsellor: 'Ahmad Ali',
    status: 'scheduled', followUpRequired: false,
    parentInformed: true, parentPresent: false, confidential: false, academicYear: '2025-26',
  },
];
