import { SuperAdminService } from './super-admin.service';
import { gradeBand } from '../leads/schemas/parent-lead.schema';

describe('gradeBand', () => {
  it('buckets pre-primary and Grade 1-5 as primary', () => {
    expect(gradeBand('KG')).toBe('primary');
    expect(gradeBand('Grade 5')).toBe('primary');
  });
  it('buckets Grade 6 and up as secondary', () => {
    expect(gradeBand('Grade 6')).toBe('secondary');
    expect(gradeBand('Grade 12')).toBe('secondary');
  });
  it('is unknown for an empty/unrecognized value', () => {
    expect(gradeBand(undefined)).toBe('unknown');
    expect(gradeBand('Year 4')).toBe('unknown');
  });
});

// Minimal in-memory Mongo-query matcher covering only the operators
// buildParentLeadMatch actually emits ($ne, $gte, $lte, a RegExp instance,
// and plain/nested-path equality) - enough to exercise the real filter
// logic without standing up a database.
function matches(doc: any, query: any): boolean {
  return Object.entries(query).every(([path, cond]: [string, any]) => {
    const value = path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), doc);
    if (cond instanceof RegExp) return cond.test(value ?? '');
    if (cond && typeof cond === 'object' && !(cond instanceof RegExp)) {
      return Object.entries(cond).every(([op, opVal]: [string, any]) => {
        if (op === '$ne') return value !== opVal;
        if (op === '$gte') return value >= opVal;
        if (op === '$lte') return value <= opVal;
        return true;
      });
    }
    return value === cond;
  });
}

function buildService(leads: any[]) {
  const svc: any = Object.create(SuperAdminService.prototype);
  svc.parentLeadModel = {
    find: (q: any) => ({
      sort: () => ({
        lean: async () => leads.filter(l => matches(l, q)),
      }),
    }),
    distinct: async (field: string) => {
      const vals = leads.map(l => field.split('.').reduce((o, k) => (o == null ? undefined : o[k]), l));
      return Array.from(new Set(vals));
    },
    aggregate: async (pipeline: any[]) => {
      const match = pipeline.find(s => s.$match)?.$match || {};
      let docs = leads.filter(l => matches(l, match));
      const group = pipeline.find(s => s.$group)?.$group;
      if (!group) return docs;
      const groups = new Map<string, any[]>();
      for (const d of docs) {
        const keyObj = group._id === null
          ? null
          : typeof group._id === 'string'
            ? d[group._id.replace('$', '')]
            : Object.fromEntries(Object.entries(group._id).map(([k, expr]: [string, any]) => [k, d[String(expr).replace('$', '')]]));
        const key = JSON.stringify(keyObj);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(d);
      }
      let rows = Array.from(groups.entries()).map(([key, items]) => {
        const idVal = JSON.parse(key);
        const row: any = { _id: idVal, count: items.length };
        if (group.linked) row.linked = items.filter((d: any) => d.matchedInstitutionId != null).length;
        if (group.total) row.total = items.length;
        return row;
      });
      const project = pipeline.find(s => s.$project)?.$project;
      if (project) {
        rows = rows.map((r: any) => {
          const out: any = {};
          for (const [k, v] of Object.entries(project)) {
            if (v === '$_id.country') out.country = r._id.country;
            else if (v === '$_id.city') out.city = r._id.city;
            else if (v === '$_id') out.schoolName = r._id;
            else if (k === 'count') out.count = r.count;
          }
          return out;
        });
      }
      return rows;
    },
  };
  return svc as SuperAdminService;
}

const LEADS = [
  { fullName: 'A', matchedInstitutionId: null, location: { country: 'Pakistan', city: 'Karachi' }, schoolNameRaw: 'Hope School', createdAt: new Date('2026-01-05') },
  { fullName: 'B', matchedInstitutionId: 'inst-1', location: { country: 'Pakistan', city: 'Karachi' }, schoolNameRaw: 'Linked School', createdAt: new Date('2026-01-10') },
  { fullName: 'C', matchedInstitutionId: null, location: { country: 'Pakistan', city: 'Lahore' }, schoolNameRaw: 'Hope School', createdAt: new Date('2026-02-01') },
];

describe('SuperAdminService.getParentLeads filters', () => {
  it('filters by linked=false to only unmatched leads', async () => {
    const svc = buildService(LEADS);
    const result = await svc.getParentLeads({ linked: 'false' });
    expect(result.leads.map((l: any) => l.fullName)).toEqual(['A', 'C']);
  });

  it('filters by city', async () => {
    const svc = buildService(LEADS);
    const result = await svc.getParentLeads({ city: 'Lahore' });
    expect(result.leads.map((l: any) => l.fullName)).toEqual(['C']);
  });
});

describe('SuperAdminService.getParentLeadInsights', () => {
  it('reports the top schools parents are waiting on among unlinked leads only', async () => {
    const svc = buildService(LEADS);
    const insights = await svc.getParentLeadInsights({});
    expect(insights.topUnlinkedSchools).toEqual([{ schoolName: 'Hope School', count: 2 }]);
    expect(insights.totals).toEqual({ total: 3, linked: 1, unlinked: 2 });
  });
});
