import 'reflect-metadata';
import * as fs from 'fs';
import * as path from 'path';
import mongoose from 'mongoose';
import { getModelToken } from '@nestjs/mongoose';
import { Behaviour, BehaviourSchema } from './schemas/student-supporting.schema';
import { BehaviourRecord, BehaviourRecordSchema } from '../behaviour/schemas/behaviour.schema';
import { PdfService } from '../pdf/pdf.service';
import { StudentsService } from './students.service';

// BB12: the legacy student_behaviour store (class Behaviour) and behaviour_records (class BehaviourRecord) must never share a Mongoose model
// name. pdf.module used to register BehaviourRecordSchema under the name 'Behaviour', so whichever module loaded first decided which collection
// StudentsService (POST /students/behaviour, Student 360's legacy half) AND PdfService used.

const src = (p: string) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const paramToken = (cls: any, nameOfClass: string): string[] => {
  const self: Array<{ index: number; param: any }> = Reflect.getMetadata('self:paramtypes', cls) || [];
  return self.map((x) => String(x.param));
};

describe('BB12: unique model names, independent of module load order', () => {
  it('the two schemas live in two collections and the class names differ', () => {
    expect(Behaviour.name).not.toBe(BehaviourRecord.name);
    const legacy = mongoose.model('Bb12Legacy', BehaviourSchema);
    const records = mongoose.model('Bb12Records', BehaviourRecordSchema);
    expect(legacy.collection.name).toBe('student_behaviour');
    expect(records.collection.name).toBe('behaviour_records');
  });
  it('no module registers the model name "Behaviour" with the record schema, and every "Behaviour" registration uses the legacy schema', () => {
    const dir = path.join(__dirname, '..');
    const walk = (d: string): string[] => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() && e.name !== 'node_modules' ? walk(path.join(d, e.name)) : e.name.endsWith('.module.ts') ? [path.join(d, e.name)] : []));
    for (const f of walk(dir)) {
      const text = fs.readFileSync(f, 'utf8');
      expect(text).not.toMatch(/name:\s*'Behaviour'\s*,/);
      for (const m of text.matchAll(/name:\s*Behaviour\.name\s*,\s*schema:\s*(\w+)/g)) expect(m[1]).toBe('BehaviourSchema');
      for (const m of text.matchAll(/name:\s*BehaviourRecord\.name\s*,\s*schema:\s*(\w+)/g)) expect(m[1]).toBe('BehaviourRecordSchema');
    }
  });
  it('pdf.module registers behaviour_records under its own name and PdfService injects exactly that token', () => {
    expect(src('pdf/pdf.module.ts')).toMatch(/name:\s*BehaviourRecord\.name,\s*schema:\s*BehaviourRecordSchema/);
    expect(paramToken(PdfService, 'x')).toContain(String(getModelToken(BehaviourRecord.name)));
    expect(paramToken(PdfService, 'x')).not.toContain(String(getModelToken('Behaviour')));
  });
  it('StudentsService injects the legacy model by Behaviour.name and the records model by BehaviourRecord.name (two different tokens)', () => {
    const tokens = paramToken(StudentsService, 'x');
    expect(tokens).toContain(String(getModelToken(Behaviour.name)));
    expect(tokens).toContain(String(getModelToken(BehaviourRecord.name)));
    expect(String(getModelToken(Behaviour.name))).not.toBe(String(getModelToken(BehaviourRecord.name)));
  });
});
