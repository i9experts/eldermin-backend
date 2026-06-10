// ============================================================
// ADMISSIONS MODULE (NestJS)
// ============================================================

import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AdmissionsController } from './admissions.controller';
import { AdmissionsService } from './admissions.service';
import { StudentsModule } from '../students/students.module';
import { Lead, LeadSchema } from './schemas/lead.schema';
import { Applicant, ApplicantSchema } from './schemas/applicant.schema';
import {
  EntranceTest, EntranceTestSchema,
  Interview, InterviewSchema,
  Enrollment, EnrollmentSchema,
  Retention, RetentionSchema,
} from './schemas/evaluation-enrollment-retention.schema';

@Module({
  imports: [
    StudentsModule,
    MongooseModule.forFeature([
      { name: Lead.name, schema: LeadSchema },
      { name: Applicant.name, schema: ApplicantSchema },
      { name: EntranceTest.name, schema: EntranceTestSchema },
      { name: Interview.name, schema: InterviewSchema },
      { name: Enrollment.name, schema: EnrollmentSchema },
      { name: Retention.name, schema: RetentionSchema },
    ]),
  ],
  controllers: [AdmissionsController],
  providers: [AdmissionsService],
  exports: [AdmissionsService],
})
export class AdmissionsModule {}


// ============================================================
// ⬇️  FRONTEND FILES BELOW
// Save these in /root/eduos-frontend/src/
// ============================================================


// ============================================================
// FILE: src/services/admissions.api.ts
// Axios API service for Admissions module
// ============================================================

/*
import axios from 'axios';

const BASE = import.meta.env.VITE_API_URL || 'http://93.127.163.238:3001';

const api = axios.create({
  baseURL: `${BASE}/api/admissions`,
  headers: { 'Content-Type': 'application/json' },
});

// Attach token from localStorage
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  const schoolSlug = localStorage.getItem('schoolSlug') || 'demo-school';
  const academicYear = localStorage.getItem('academicYear') || '2025-26';
  config.headers['x-school-slug'] = schoolSlug;
  config.headers['x-academic-year'] = academicYear;
  return config;
});

// ── Dashboard ─────────────────────────────────────────────────
export const fetchDashboard = (academicYear?: string) =>
  api.get('/dashboard', { params: { academicYear } }).then(r => r.data);

// ── Leads ─────────────────────────────────────────────────────
export const fetchLeads = (params?: any) =>
  api.get('/leads', { params }).then(r => r.data);

export const fetchLeadById = (id: string) =>
  api.get(`/leads/${id}`).then(r => r.data);

export const createLead = (data: any) =>
  api.post('/leads', data).then(r => r.data);

export const updateLead = (id: string, data: any) =>
  api.put(`/leads/${id}`, data).then(r => r.data);

export const deleteLead = (id: string) =>
  api.delete(`/leads/${id}`).then(r => r.data);

export const convertLead = (id: string, data: any) =>
  api.post(`/leads/${id}/convert`, data).then(r => r.data);

export const fetchLeadStats = () =>
  api.get('/leads/stats').then(r => r.data);

// ── Applicants ────────────────────────────────────────────────
export const fetchApplicants = (params?: any) =>
  api.get('/applicants', { params }).then(r => r.data);

export const fetchApplicantById = (id: string) =>
  api.get(`/applicants/${id}`).then(r => r.data);

export const createApplicant = (data: any) =>
  api.post('/applicants', data).then(r => r.data);

export const updateApplicant = (id: string, data: any) =>
  api.put(`/applicants/${id}`, data).then(r => r.data);

export const updateDocument = (id: string, data: any) =>
  api.patch(`/applicants/${id}/document`, data).then(r => r.data);

// ── Tests ─────────────────────────────────────────────────────
export const fetchTests = (params?: any) =>
  api.get('/tests', { params }).then(r => r.data);

export const createTest = (data: any) =>
  api.post('/tests', data).then(r => r.data);

export const submitTestResult = (id: string, data: any) =>
  api.patch(`/tests/${id}/result`, data).then(r => r.data);

// ── Interviews ────────────────────────────────────────────────
export const fetchInterviews = (params?: any) =>
  api.get('/interviews', { params }).then(r => r.data);

export const createInterview = (data: any) =>
  api.post('/interviews', data).then(r => r.data);

export const submitInterviewResult = (id: string, data: any) =>
  api.patch(`/interviews/${id}/result`, data).then(r => r.data);

// ── Enrollments ───────────────────────────────────────────────
export const fetchEnrollments = (params?: any) =>
  api.get('/enrollments', { params }).then(r => r.data);

export const createEnrollment = (data: any) =>
  api.post('/enrollments', data).then(r => r.data);

export const updateEnrollment = (id: string, data: any) =>
  api.put(`/enrollments/${id}`, data).then(r => r.data);

// ── Retention ─────────────────────────────────────────────────
export const fetchRetention = (params?: any) =>
  api.get('/retention', { params }).then(r => r.data);

export const createRetention = (data: any) =>
  api.post('/retention', data).then(r => r.data);

export const updateRetention = (id: string, data: any) =>
  api.put(`/retention/${id}`, data).then(r => r.data);

// ── Reports ───────────────────────────────────────────────────
export const fetchReport = (params: any) =>
  api.get('/reports', { params }).then(r => r.data);
*/


// ============================================================
// FILE: src/hooks/useAdmissions.ts
// React Query hooks — replace seed data in components
// ============================================================

/*
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as admApi from '../services/admissions.api';

const KEYS = {
  dashboard: (ay?: string) => ['admissions', 'dashboard', ay],
  leads: (p?: any) => ['admissions', 'leads', p],
  lead: (id: string) => ['admissions', 'lead', id],
  leadStats: () => ['admissions', 'leads', 'stats'],
  applicants: (p?: any) => ['admissions', 'applicants', p],
  applicant: (id: string) => ['admissions', 'applicant', id],
  tests: (p?: any) => ['admissions', 'tests', p],
  interviews: (p?: any) => ['admissions', 'interviews', p],
  enrollments: (p?: any) => ['admissions', 'enrollments', p],
  retention: (p?: any) => ['admissions', 'retention', p],
  report: (p?: any) => ['admissions', 'report', p],
};

// Dashboard
export const useAdmissionDashboard = (academicYear?: string) =>
  useQuery({ queryKey: KEYS.dashboard(academicYear), queryFn: () => admApi.fetchDashboard(academicYear) });

// Leads
export const useLeads = (params?: any) =>
  useQuery({ queryKey: KEYS.leads(params), queryFn: () => admApi.fetchLeads(params) });

export const useLeadStats = () =>
  useQuery({ queryKey: KEYS.leadStats(), queryFn: admApi.fetchLeadStats });

export const useCreateLead = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: admApi.createLead,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admissions', 'leads'] }),
  });
};

export const useUpdateLead = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => admApi.updateLead(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admissions', 'leads'] }),
  });
};

export const useConvertLead = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => admApi.convertLead(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admissions', 'leads'] });
      qc.invalidateQueries({ queryKey: ['admissions', 'applicants'] });
    },
  });
};

// Applicants
export const useApplicants = (params?: any) =>
  useQuery({ queryKey: KEYS.applicants(params), queryFn: () => admApi.fetchApplicants(params) });

export const useCreateApplicant = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: admApi.createApplicant,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admissions', 'applicants'] }),
  });
};

export const useUpdateApplicant = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => admApi.updateApplicant(id, data),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: ['admissions', 'applicants'] });
      qc.invalidateQueries({ queryKey: KEYS.applicant(id) });
    },
  });
};

// Tests
export const useTests = (params?: any) =>
  useQuery({ queryKey: KEYS.tests(params), queryFn: () => admApi.fetchTests(params) });

export const useCreateTest = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: admApi.createTest,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admissions', 'tests'] }),
  });
};

export const useSubmitTestResult = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => admApi.submitTestResult(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admissions', 'tests'] });
      qc.invalidateQueries({ queryKey: ['admissions', 'applicants'] });
    },
  });
};

// Interviews
export const useInterviews = (params?: any) =>
  useQuery({ queryKey: KEYS.interviews(params), queryFn: () => admApi.fetchInterviews(params) });

export const useCreateInterview = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: admApi.createInterview,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admissions', 'interviews'] }),
  });
};

export const useSubmitInterviewResult = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => admApi.submitInterviewResult(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admissions', 'interviews'] });
      qc.invalidateQueries({ queryKey: ['admissions', 'applicants'] });
    },
  });
};

// Enrollments
export const useEnrollments = (params?: any) =>
  useQuery({ queryKey: KEYS.enrollments(params), queryFn: () => admApi.fetchEnrollments(params) });

export const useCreateEnrollment = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: admApi.createEnrollment,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admissions', 'enrollments'] });
      qc.invalidateQueries({ queryKey: ['admissions', 'applicants'] });
    },
  });
};

export const useUpdateEnrollment = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => admApi.updateEnrollment(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admissions', 'enrollments'] }),
  });
};

// Retention
export const useRetention = (params?: any) =>
  useQuery({ queryKey: KEYS.retention(params), queryFn: () => admApi.fetchRetention(params) });

export const useUpdateRetention = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => admApi.updateRetention(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admissions', 'retention'] }),
  });
};

// Report
export const useAdmissionReport = (params: any) =>
  useQuery({ queryKey: KEYS.report(params), queryFn: () => admApi.fetchReport(params) });
*/
