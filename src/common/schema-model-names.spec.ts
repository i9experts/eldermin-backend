import * as fs from 'fs';
import * as path from 'path';

/**
 * @nestjs/mongoose registers a model under the schema CLASS name. When two modules register different schemas under the
 * same name, the second registrant silently gets the first model (wrong collection, wrong schema, strict mode drops its
 * fields): that is how teaching's attendance mode never persisted (it used HR's `AttendanceSettings`).
 * This test scans every @Schema class and fails when one class name is used for two different collections.
 */
function walk(dir: string, out: string[] = []): string[] {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith('.ts') && !p.endsWith('.spec.ts')) out.push(p);
  }
  return out;
}

/**
 * PRE-EXISTING clashes found by this scan (2026-10-14): old top-level modules and the newer `modules/*` copies use the same
 * class name for different collections. Which model a module really gets depends on module load order. NOT fixed here (each
 * needs its own analysis, see eldermin-teacher-app-docs/phase9/MODEL_NAME_CLASHES.md); this list only stops NEW clashes.
 * Remove a name from the list when it is fixed (the "still clashes" test below then forces the cleanup).
 */
const KNOWN_PREEXISTING_CLASHES = new Set([
  'Policy', 'ApprovalRequest', 'AcademicYear', 'BoardMember', 'Institution', 'Meeting', 'InventoryItem', 'PurchaseOrder',
  'EnrollmentField', 'Guardian', 'MedicalRecord', 'StudentAttendance', 'StudentNote',
]);

describe('Mongoose model names are unique across all schemas', () => {
  const src = path.resolve(__dirname, '..');
  const found: Array<{ name: string; collection: string; file: string }> = [];
  for (const file of walk(src)) {
    const text = fs.readFileSync(file, 'utf8');
    const re = /@Schema\(([^)]*)\)\s*export\s+class\s+(\w+)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      const opts = m[1];
      const coll = /collection:\s*'([^']+)'/.exec(opts)?.[1] ?? `(default for ${m[2]})`;
      found.push({ name: m[2], collection: coll, file: path.relative(src, file) });
    }
  }

  it('finds the schemas (sanity: scanning works)', () => {
    expect(found.length).toBeGreaterThan(100);
    expect(found.some((f) => f.name === 'ClassAttendanceSettings' && f.collection === 'class_attendance_settings')).toBe(true);
    expect(found.some((f) => f.name === 'AttendanceSettings' && f.collection === 'hr_attendance_settings')).toBe(true);
  });

  const byName = new Map<string, Array<{ collection: string; file: string }>>();
  for (const f of found) byName.set(f.name, [...(byName.get(f.name) || []), f]);
  const clashing = [...byName.entries()].filter(([, v]) => new Set(v.map((x) => x.collection)).size > 1);

  it('no NEW class name is used for two different collections', () => {
    const fresh = clashing.filter(([n]) => !KNOWN_PREEXISTING_CLASHES.has(n))
      .map(([n, v]) => `${n}: ${v.map((x) => `${x.collection} (${x.file})`).join(' vs ')}`);
    expect(fresh).toEqual([]);
  });

  it('the known list is not stale: every listed name still clashes', () => {
    const stillClashing = new Set(clashing.map(([n]) => n));
    expect([...KNOWN_PREEXISTING_CLASHES].filter((n) => !stillClashing.has(n))).toEqual([]);
  });

  it('the teaching and HR attendance settings are different models on different collections', () => {
    const { ClassAttendanceSettings } = require('../modules/teaching/schemas/class-attendance-settings.schema');
    const { AttendanceSettings } = require('../modules/hr/schemas/attendance-settings.schema');
    expect(ClassAttendanceSettings.name).not.toBe(AttendanceSettings.name);
  });
});
