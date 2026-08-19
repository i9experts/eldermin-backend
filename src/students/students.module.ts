// ============================================================
// STUDENTS MODULE (NestJS)
// ============================================================

import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { StudentsController } from './students.controller';
import { StudentsService } from './students.service';
import { Student, StudentSchema } from './schemas/student.schema';
import {
  StudentAttendance, StudentAttendanceSchema,
  StudentFee, StudentFeeSchema,
  Behaviour, BehaviourSchema,
  AssessmentResult, AssessmentResultSchema,
} from './schemas/student-supporting.schema';
import { UploadModule } from '../upload/upload.module';
import { SchoolSchema, Campus, CampusSchema } from '../organization/schemas/organization.schema';
import { GroupInstitution, GroupInstitutionSchema } from '../organization/schemas/group-institution.schema';
import { Family, FamilySchema } from '../families/schemas/family.schema';

@Module({
  imports: [
    UploadModule,
    MongooseModule.forFeature([
      { name: Student.name, schema: StudentSchema },
      { name: StudentAttendance.name, schema: StudentAttendanceSchema },
      { name: StudentFee.name, schema: StudentFeeSchema },
      { name: Behaviour.name, schema: BehaviourSchema },
      { name: AssessmentResult.name, schema: AssessmentResultSchema },
      { name: 'School', schema: SchoolSchema },
      { name: Family.name, schema: FamilySchema },
      { name: Campus.name, schema: CampusSchema },
      { name: GroupInstitution.name, schema: GroupInstitutionSchema },
    ]),
  ],
  controllers: [StudentsController],
  providers: [StudentsService],
  exports: [StudentsService],   // ← exported so AdmissionsModule can call createFromEnrollment
})
export class StudentsModule {}


// ============================================================
// FILE: src/services/students.api.ts  (FRONTEND)
// Axios service for Student 360
// ============================================================

/*
import axios from 'axios';

const BASE = import.meta.env.VITE_API_URL || 'http://93.127.163.238:3001';

const api = axios.create({
  baseURL: `${BASE}/api/v1/students`,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  config.headers['x-school-slug'] = localStorage.getItem('schoolSlug') || 'demo-school';
  config.headers['x-academic-year'] = localStorage.getItem('academicYear') || '2025-26';
  return config;
});

// ── Dashboard ─────────────────────────────────────────────────
export const fetchStudentDashboard = (academicYear?: string) =>
  api.get('/dashboard', { params: { academicYear } }).then(r => r.data);

// ── Students ──────────────────────────────────────────────────
export const fetchStudents = (params?: any) =>
  api.get('/', { params }).then(r => r.data);

export const fetchStudentById = (id: string) =>
  api.get(`/${id}`).then(r => r.data);

export const fetchStudent360 = (id: string) =>
  api.get(`/${id}/360`).then(r => r.data);

export const createStudent = (data: any) =>
  api.post('/', data).then(r => r.data);

export const updateStudent = (id: string, data: any) =>
  api.put(`/${id}`, data).then(r => r.data);

// ── Attendance ────────────────────────────────────────────────
export const fetchAttendance = (params?: any) =>
  api.get('/attendance/list', { params }).then(r => r.data);

export const fetchAttendanceSummary = (studentId: string, month?: string) =>
  api.get(`/${studentId}/attendance/summary`, { params: { month } }).then(r => r.data);

export const markAttendance = (data: any) =>
  api.post('/attendance', data).then(r => r.data);

export const bulkMarkAttendance = (data: any) =>
  api.post('/attendance/bulk', data).then(r => r.data);

// ── Fees ──────────────────────────────────────────────────────
export const fetchFees = (params?: any) =>
  api.get('/fees/list', { params }).then(r => r.data);

export const fetchFeeStatement = (studentId: string) =>
  api.get(`/${studentId}/fees/statement`).then(r => r.data);

export const createFee = (data: any) =>
  api.post('/fees', data).then(r => r.data);

export const collectFee = (id: string, data: any) =>
  api.patch(`/fees/${id}/collect`, data).then(r => r.data);

// ── Behaviour ─────────────────────────────────────────────────
export const fetchBehaviour = (params?: any) =>
  api.get('/behaviour/list', { params }).then(r => r.data);

export const fetchStudentBehaviour = (studentId: string) =>
  api.get(`/${studentId}/behaviour`).then(r => r.data);

export const createBehaviour = (data: any) =>
  api.post('/behaviour', data).then(r => r.data);

export const updateBehaviour = (id: string, data: any) =>
  api.put(`/behaviour/${id}`, data).then(r => r.data);

// ── Results ───────────────────────────────────────────────────
export const fetchStudentResults = (studentId: string) =>
  api.get(`/${studentId}/results`).then(r => r.data);

export const createResult = (data: any) =>
  api.post('/results', data).then(r => r.data);

// ── Reports ───────────────────────────────────────────────────
export const fetchClassReport = (grade: string, section: string, academicYear: string) =>
  api.get('/report/class', { params: { grade, section, academicYear } }).then(r => r.data);
*/


// ============================================================
// FILE: src/hooks/useStudents.ts  (FRONTEND)
// React Query hooks for Student 360
// ============================================================

/*
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as api from '../services/students.api';

const K = {
  dashboard: (ay?: string) => ['students', 'dashboard', ay],
  list: (p?: any) => ['students', 'list', p],
  one: (id: string) => ['students', id],
  s360: (id: string) => ['students', id, '360'],
  attendance: (p?: any) => ['students', 'attendance', p],
  attSummary: (id: string, m?: string) => ['students', id, 'attendance', m],
  fees: (p?: any) => ['students', 'fees', p],
  feeStatement: (id: string) => ['students', id, 'fees'],
  behaviour: (p?: any) => ['students', 'behaviour', p],
  results: (id: string) => ['students', id, 'results'],
};

// Dashboard
export const useStudentDashboard = (academicYear?: string) =>
  useQuery({ queryKey: K.dashboard(academicYear), queryFn: () => api.fetchStudentDashboard(academicYear) });

// Students list
export const useStudents = (params?: any) =>
  useQuery({ queryKey: K.list(params), queryFn: () => api.fetchStudents(params) });

// Single student
export const useStudent = (id: string) =>
  useQuery({ queryKey: K.one(id), queryFn: () => api.fetchStudentById(id), enabled: !!id });

// Student 360
export const useStudent360 = (id: string) =>
  useQuery({ queryKey: K.s360(id), queryFn: () => api.fetchStudent360(id), enabled: !!id });

// Create student
export const useCreateStudent = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.createStudent,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['students', 'list'] }),
  });
};

// Update student
export const useUpdateStudent = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => api.updateStudent(id, data),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: K.one(id) });
      qc.invalidateQueries({ queryKey: ['students', 'list'] });
    },
  });
};

// Attendance
export const useAttendance = (params?: any) =>
  useQuery({ queryKey: K.attendance(params), queryFn: () => api.fetchAttendance(params) });

export const useAttendanceSummary = (studentId: string, month?: string) =>
  useQuery({
    queryKey: K.attSummary(studentId, month),
    queryFn: () => api.fetchAttendanceSummary(studentId, month),
    enabled: !!studentId,
  });

export const useBulkMarkAttendance = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.bulkMarkAttendance,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['students', 'attendance'] }),
  });
};

// Fees
export const useFees = (params?: any) =>
  useQuery({ queryKey: K.fees(params), queryFn: () => api.fetchFees(params) });

export const useFeeStatement = (studentId: string) =>
  useQuery({
    queryKey: K.feeStatement(studentId),
    queryFn: () => api.fetchFeeStatement(studentId),
    enabled: !!studentId,
  });

export const useCollectFee = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => api.collectFee(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['students', 'fees'] }),
  });
};

// Behaviour
export const useBehaviour = (params?: any) =>
  useQuery({ queryKey: K.behaviour(params), queryFn: () => api.fetchBehaviour(params) });

export const useStudentBehaviour = (studentId: string) =>
  useQuery({
    queryKey: [...K.behaviour(), studentId],
    queryFn: () => api.fetchStudentBehaviour(studentId),
    enabled: !!studentId,
  });

export const useCreateBehaviour = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.createBehaviour,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['students', 'behaviour'] }),
  });
};

// Results
export const useStudentResults = (studentId: string) =>
  useQuery({
    queryKey: K.results(studentId),
    queryFn: () => api.fetchStudentResults(studentId),
    enabled: !!studentId,
  });

export const useCreateResult = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.createResult,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['students', 'results'] }),
  });
};
*/
