const { webcrypto } = require('crypto');
global.crypto = webcrypto;

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const fs = require('fs');

const uri = fs.readFileSync('.env','utf8').split('\n')
  .find(l=>l.startsWith('MONGODB_URI=')).split('=').slice(1).join('=').trim();

const SLUG = 'demo-school';
const AY = '2025-26';

const grades = [
  'Pre-Nursery','Nursery','KG-1','KG-2',
  'Grade 1','Grade 2','Grade 3','Grade 4','Grade 5',
  'Grade 6','Grade 7','Grade 8',
  'Grade 9','Grade 10','Grade 11','Grade 12'
];

const maleNames = [
  'Ahmed Ali','Muhammad Hassan','Usman Khan','Bilal Ahmed',
  'Hamza Sheikh','Abdullah Malik','Zubair Raza','Faisal Qureshi',
  'Omer Farooq','Saad Hussain','Talha Baig','Arslan Chaudhry',
  'Imran Siddiqui','Tariq Mehmood','Adil Nawaz','Kamran Akbar',
  'Shehroz Mirza','Waqas Butt','Junaid Iqbal','Asad Rehman'
];

const femaleNames = [
  'Ayesha Malik','Sara Ahmed','Fatima Khan','Zainab Ali',
  'Maryam Hussain','Noor Fatima','Hira Baig','Sana Sheikh',
  'Amna Qureshi','Rabia Siddiqui','Khadija Mirza','Mahnoor Raza',
  'Anum Butt','Sumbal Akbar','Aliya Chaudhry','Momina Iqbal',
  'Sidra Nawaz','Laiba Rehman','Maira Mehmood','Aroha Farooq'
];

const staffList = [
  { firstName:'Ahmad', lastName:'Ali', designation:'Mathematics Teacher', dept:'Academics', type:'teaching' },
  { firstName:'Sara', lastName:'Malik', designation:'English Teacher', dept:'Academics', type:'teaching' },
  { firstName:'Usman', lastName:'Khan', designation:'Science Teacher', dept:'Academics', type:'teaching' },
  { firstName:'Ayesha', lastName:'Siddiqui', designation:'Urdu Teacher', dept:'Academics', type:'teaching' },
  { firstName:'Bilal', lastName:'Ahmed', designation:'Islamiat Teacher', dept:'Academics', type:'teaching' },
  { firstName:'Fatima', lastName:'Noor', designation:'Computer Teacher', dept:'Academics', type:'teaching' },
  { firstName:'Hassan', lastName:'Raza', designation:'PE Teacher', dept:'Sports', type:'teaching' },
  { firstName:'Zainab', lastName:'Mirza', designation:'Arts Teacher', dept:'Academics', type:'teaching' },
  { firstName:'Tariq', lastName:'Mehmood', designation:'Principal', dept:'Management', type:'admin' },
  { firstName:'Amna', lastName:'Sheikh', designation:'Vice Principal', dept:'Management', type:'admin' },
  { firstName:'Kamran', lastName:'Butt', designation:'HR Manager', dept:'HR', type:'admin' },
  { firstName:'Nadia', lastName:'Hussain', designation:'Accountant', dept:'Finance', type:'admin' },
  { firstName:'Imran', lastName:'Qureshi', designation:'Admission Officer', dept:'Admissions', type:'admin' },
  { firstName:'Rabia', lastName:'Iqbal', designation:'School Counsellor', dept:'Student Affairs', type:'admin' },
  { firstName:'Omer', lastName:'Farooq', designation:'IT Administrator', dept:'IT', type:'admin' },
];

const rand = (arr) => arr[Math.floor(Math.random() * arr.length)];
const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

mongoose.connect(uri).then(async () => {
  const db = mongoose.connection.db;
  console.log('✅ Connected to MongoDB Atlas');

  // ── CLEAR EXISTING DEMO DATA ──────────────────────────────
  console.log('🧹 Clearing existing demo data...');
  await Promise.all([
    db.collection('students').deleteMany({ schoolSlug: SLUG }),
    db.collection('staff').deleteMany({ schoolSlug: SLUG }),
    db.collection('grades').deleteMany({ schoolSlug: SLUG }),
    db.collection('academic_years').deleteMany({ schoolSlug: SLUG }),
    db.collection('fee_structures').deleteMany({ schoolSlug: SLUG }),
    db.collection('admission_leads').deleteMany({ schoolSlug: SLUG }),
    db.collection('behaviour_records').deleteMany({ schoolSlug: SLUG }),
    db.collection('tarbiyah_assessments').deleteMany({ schoolSlug: SLUG }),
    db.collection('campuses').deleteMany({ schoolSlug: SLUG }),
    db.collection('departments').deleteMany({ schoolSlug: SLUG }),
  ]);

  // ── SCHOOL PROFILE ────────────────────────────────────────
  console.log('🏫 Setting up school profile...');
  await db.collection('schools').updateOne(
    { slug: SLUG },
    { $set: {
      slug: SLUG, name: 'Al-Noor International School',
      type: 'school', curriculum: 'cambridge',
      phone: '+92 42 1234567', email: 'info@demo-school.com',
      address: { street: '24 Model Town', city: 'Lahore', country: 'Pakistan' },
      establishedYear: 2010, currency: 'PKR',
      mediumOfInstruction: 'English', termsPerYear: 3,
      multiCampus: false, isActive: true,
      updatedAt: new Date(),
    }},
    { upsert: true }
  );

  // ── CAMPUS ───────────────────────────────────────────────
  console.log('🏢 Creating campus...');
  await db.collection('campuses').insertOne({
    name: 'Main Campus', code: 'MC-001',
    phone: '+92 42 1234567', email: 'main@demo-school.com',
    address: '24 Model Town, Lahore', city: 'Lahore',
    principalName: 'Tariq Mehmood', capacity: 1200,
    isActive: true, schoolSlug: SLUG,
    createdAt: new Date(), updatedAt: new Date(),
  });

  // ── ACADEMIC YEAR ─────────────────────────────────────────
  console.log('📅 Creating academic year...');
  await db.collection('academic_years').insertOne({
    name: AY, startDate: new Date('2025-04-01'),
    endDate: new Date('2026-03-31'), isCurrent: true,
    terms: [
      { name: 'Term 1', startDate: new Date('2025-04-01'), endDate: new Date('2025-07-31'), isCurrent: false },
      { name: 'Term 2', startDate: new Date('2025-08-01'), endDate: new Date('2025-11-30'), isCurrent: true },
      { name: 'Term 3', startDate: new Date('2025-12-01'), endDate: new Date('2026-03-31'), isCurrent: false },
    ],
    totalWorkingDays: 220, schoolSlug: SLUG,
    createdAt: new Date(), updatedAt: new Date(),
  });

  // ── DEPARTMENTS ───────────────────────────────────────────
  console.log('🏛️ Creating departments...');
  const depts = ['Academics','Management','HR','Finance','Admissions','IT','Sports','Student Affairs'];
  for (const d of depts) {
    await db.collection('departments').insertOne({
      name: d, isActive: true, schoolSlug: SLUG,
      createdAt: new Date(), updatedAt: new Date(),
    });
  }

  // ── GRADES ───────────────────────────────────────────────
  console.log('📚 Creating grades...');
  const gradeIds = {};
  for (let i = 0; i < grades.length; i++) {
    const sections = ['A','B','C'].map(s => ({
      _id: new mongoose.Types.ObjectId(),
      name: s, capacity: 35,
      classTeacher: rand(staffList).firstName + ' ' + rand(staffList).lastName,
      isActive: true,
    }));
    const res = await db.collection('grades').insertOne({
      name: grades[i], displayOrder: i + 1,
      sections, isActive: true, schoolSlug: SLUG,
      createdAt: new Date(), updatedAt: new Date(),
    });
    gradeIds[grades[i]] = res.insertedId;
  }

  // ── STAFF ─────────────────────────────────────────────────
  console.log('👨‍🏫 Creating staff members...');
  const staffIds = [];
  for (let si = 0; si < staffList.length; si++) {
    const s = staffList[si];
    const hash = await bcrypt.hash('Staff@1234', 10);
    const res = await db.collection('staff').insertOne({
      employeeId: `EMP-${String(si + 1).padStart(3, '0')}`,
      firstName: s.firstName, lastName: s.lastName,
      designation: s.designation, department: s.dept,
      employeeType: s.type === 'teaching' ? 'teaching' : 'non_teaching',
      email: `${s.firstName.toLowerCase()}.${s.lastName.toLowerCase()}@demo-school.com`,
      phone: `+92 300 ${randInt(1000000, 9999999)}`,
      cnic: `35202-${randInt(1000000, 9999999)}-${randInt(1,9)}`,
      joiningDate: new Date(`${randInt(2018,2023)}-${String(randInt(1,12)).padStart(2,'0')}-01`),
      salary: randInt(40000, 150000),
      status: 'active', gender: rand(['male','female']),
      qualification: rand(['B.Ed','M.Ed','MSc','MA','BS']),
      experience: randInt(2, 15),
      address: `House ${randInt(1,200)}, Model Town, Lahore`,
      schoolSlug: SLUG, academicYear: AY,
      createdAt: new Date(), updatedAt: new Date(),
    });
    staffIds.push({ id: res.insertedId, name: `${s.firstName} ${s.lastName}` });
  }
  console.log(`   ✅ ${staffIds.length} staff members created`);

  // ── STUDENTS ──────────────────────────────────────────────
  console.log('👨‍🎓 Creating students...');
  const teachingGrades = grades.slice(4); // Grade 1 onwards
  let studentCount = 0;
  const studentIds = [];

  for (const grade of teachingGrades) {
    const studentsPerGrade = randInt(25, 40);
    for (let i = 0; i < studentsPerGrade; i++) {
      const isMale = Math.random() > 0.48;
      const name = isMale ? rand(maleNames) : rand(femaleNames);
      const [firstName, ...lastParts] = name.split(' ');
      const lastName = lastParts.join(' ');
      const section = rand(['A','B','C']);
      const rollNo = String(studentCount + 1).padStart(3,'0');

      const res = await db.collection('students').insertOne({
        studentId: `${SLUG}-STU-${rollNo}`,
        firstName, lastName,
        fullName: name,
        rollNumber: `STU-${rollNo}`,
        grade, section,
        gender: isMale ? 'male' : 'female',
        dateOfBirth: new Date(`${randInt(2008,2018)}-${String(randInt(1,12)).padStart(2,'0')}-${String(randInt(1,28)).padStart(2,'0')}`),
        admissionDate: new Date(`${randInt(2020,2025)}-04-01`),
        status: 'active',
        feeStatus: rand(['paid','pending','partial']),
        guardianName: rand(maleNames),
        guardianPhone: `+92 300 ${randInt(1000000, 9999999)}`,
        guardianRelation: rand(['Father','Mother','Uncle','Guardian']),
        address: `House ${randInt(1,500)}, ${rand(['Model Town','Gulberg','DHA','Bahria Town'])}, Lahore`,
        bloodGroup: rand(['A+','B+','O+','AB+','A-','B-','O-']),
        previousSchool: rand(['City Grammar School','Beacon House','Roots','The City School','']),
        schoolSlug: SLUG, academicYear: AY,
        createdAt: new Date(), updatedAt: new Date(),
      });
      studentIds.push({ id: res.insertedId, name, grade, section });
      studentCount++;
    }
  }
  console.log(`   ✅ ${studentCount} students created`);

  // ── FEE STRUCTURES ────────────────────────────────────────
  console.log('💰 Creating fee structures...');
  const feeMap = {
    'Pre-Nursery': 8000, 'Nursery': 8000, 'KG-1': 9000, 'KG-2': 9000,
    'Grade 1': 10000, 'Grade 2': 10000, 'Grade 3': 11000, 'Grade 4': 11000,
    'Grade 5': 12000, 'Grade 6': 13000, 'Grade 7': 13000, 'Grade 8': 14000,
    'Grade 9': 16000, 'Grade 10': 16000, 'Grade 11': 18000, 'Grade 12': 18000,
  };
  for (const [grade, amount] of Object.entries(feeMap)) {
    await db.collection('fee_structures').insertOne({
      name: `${grade} Monthly Fee`, grade,
      academicYear: AY, frequency: 'monthly',
      items: [
        { feeHead: 'Tuition Fee', amount, discount: 0, isOptional: false },
        { feeHead: 'Computer Fee', amount: 500, discount: 0, isOptional: false },
        { feeHead: 'Library Fee', amount: 300, discount: 0, isOptional: false },
      ],
      totalAmount: amount + 800,
      dueDay: 10, lateFinePerDay: 50,
      gracePeriodDays: 5, isActive: true,
      schoolSlug: SLUG,
      createdAt: new Date(), updatedAt: new Date(),
    });
  }
  console.log('   ✅ Fee structures created for all 16 grades');

  // ── ADMISSION LEADS ───────────────────────────────────────
  console.log('📋 Creating admission leads...');
  const sources = ['walk_in','phone','website','referral','social_media'];
  const statuses = ['new','contacted','visited','applied','enrolled','not_interested'];
  for (let i = 0; i < 25; i++) {
    const isMale = Math.random() > 0.5;
    const name = isMale ? rand(maleNames) : rand(femaleNames);
    await db.collection('admission_leads').insertOne({
      studentName: name,
      guardianName: rand(maleNames),
      guardianPhone: `+92 300 ${randInt(1000000, 9999999)}`,
      guardianEmail: `parent${i}@gmail.com`,
      gradeApplying: rand(grades.slice(0, 10)),
      source: rand(sources),
      status: rand(statuses),
      inquiryDate: new Date(Date.now() - randInt(1, 60) * 24 * 60 * 60 * 1000),
      notes: rand(['Interested in Cambridge section','Needs scholarship','Sibling already enrolled','']),
      assignedTo: rand(staffIds).name,
      schoolSlug: SLUG, academicYear: AY,
      createdAt: new Date(), updatedAt: new Date(),
    });
  }
  console.log('   ✅ 25 admission leads created');

  // ── BEHAVIOUR RECORDS ─────────────────────────────────────
  console.log('❤️ Creating behaviour records...');
  const positiveCategories = ['academic_excellence','helping_others','leadership','good_conduct','attendance_excellence'];
  const negativeCategories = ['late_coming','uniform_violation','misconduct','phone_misuse','disrespect'];
  const selectedStudents = studentIds.slice(0, 30);

  for (let i = 0; i < 40; i++) {
    const student = rand(selectedStudents);
    const isPositive = Math.random() > 0.4;
    const category = isPositive ? rand(positiveCategories) : rand(negativeCategories);
    await db.collection('behaviour_records').insertOne({
      studentName: student.name,
      studentId: student.id,
      grade: student.grade,
      section: student.section,
      date: new Date(Date.now() - randInt(1, 90) * 24 * 60 * 60 * 1000),
      type: isPositive ? 'positive' : 'negative',
      category,
      title: isPositive ? `Commendation: ${category.replace(/_/g,' ')}` : `Incident: ${category.replace(/_/g,' ')}`,
      description: isPositive
        ? `Student demonstrated excellent ${category.replace(/_/g,' ')} behaviour.`
        : `Student was involved in ${category.replace(/_/g,' ')} incident.`,
      severity: isPositive ? 'low' : rand(['low','medium','high']),
      points: isPositive ? randInt(3, 10) : -randInt(3, 10),
      resolved: Math.random() > 0.4,
      parentNotified: Math.random() > 0.5,
      reportedBy: rand(staffIds).name,
      verified: true,
      followUpRequired: !isPositive && Math.random() > 0.6,
      schoolSlug: SLUG, academicYear: AY,
      createdAt: new Date(), updatedAt: new Date(),
    });
  }
  console.log('   ✅ 40 behaviour records created');

  // ── TARBIYAH ASSESSMENTS ──────────────────────────────────
  console.log('🕌 Creating Tarbiyah assessments...');
  const traits = ['sidq','amanah','adab','ihsan','sabr','tawadu','shukr','ukhuwwah','ijtihad','nazafah','itqan','tawakkul'];
  const tarbiyahStudents = studentIds.slice(0, 15);

  for (const student of tarbiyahStudents) {
    const traitScores = traits.map(key => ({
      traitKey: key,
      score: randInt(2, 5),
      observation: rand(['Excellent','Good','Needs improvement','Average','']),
    }));
    const avgScore = traitScores.reduce((a,t) => a + t.score, 0) / traits.length;
    const pct = (avgScore / 5) * 100;
    const rating = avgScore >= 4.5 ? 'excellent' : avgScore >= 3.5 ? 'good' : avgScore >= 2.5 ? 'satisfactory' : 'needs_improvement';

    await db.collection('tarbiyah_assessments').insertOne({
      studentId: student.id,
      studentName: student.name,
      grade: student.grade,
      section: student.section,
      period: 'Term 1 2025-26',
      periodType: 'termly',
      assessmentDate: new Date('2025-07-31'),
      traits: traitScores,
      overallScore: parseFloat(avgScore.toFixed(2)),
      overallPercentage: parseFloat(pct.toFixed(1)),
      overallRating: rating,
      teacherObservations: rand([
        'Student shows good character development.',
        'Needs more focus on Islamic values.',
        'Excellent role model for peers.',
        'Significant improvement this term.',
      ]),
      assessedBy: rand(staffIds).name,
      parentShared: Math.random() > 0.5,
      schoolSlug: SLUG, academicYear: AY,
      createdAt: new Date(), updatedAt: new Date(),
    });
  }
  console.log('   ✅ 15 Tarbiyah assessments created');

  // ── SUMMARY ───────────────────────────────────────────────
  console.log('\n🎉 DEMO DATA SEEDED SUCCESSFULLY!\n');
  console.log('═══════════════════════════════════════');
  console.log(`✅ School:        Al-Noor International School`);
  console.log(`✅ Grades:        ${grades.length} grades configured`);
  console.log(`✅ Staff:         ${staffList.length} members`);
  console.log(`✅ Students:      ${studentCount} students`);
  console.log(`✅ Fee Structures: 16 (all grades)`);
  console.log(`✅ Admission Leads: 25`);
  console.log(`✅ Behaviour Records: 40`);
  console.log(`✅ Tarbiyah Assessments: 15`);
  console.log('═══════════════════════════════════════');
  console.log('\nLogin: admin@demo-school.com / Admin@1234');
  console.log('Staff login: [name]@demo-school.com / Staff@1234\n');

  process.exit(0);
}).catch(e => {
  console.error('❌ Error:', e.message);
  process.exit(1);
});
