// Shared, framework-free salary calculation engine — the single source of
// truth for turning a school's configured SalaryComponents into actual
// per-employee amounts, used by both HrService.setStaffSalaryStructure
// (assigning a structure) and payroll processing (running a month's
// payroll). Previously this logic was duplicated and inconsistent: the
// backend only understood "percentage_of_basic", and the frontend payroll
// grid separately hardcoded a recalculation rule for exactly one component
// code ('HRA'). Centralizing it here means every calculation type behaves
// identically everywhere it's used, and new calculation types (percentage
// of gross, percentage of one or more other components) are implemented
// once. See PAY-02.
//
// Money is calculated in integer cents throughout (not floating-point
// rupees/dollars) specifically to avoid the classic 0.1 + 0.2 !== 0.3
// class of drift that repeated percentage multiplication on floats can
// accumulate across many components — this is the "decimal-safe" part.

export type SalaryCalculationType =
  | 'fixed'
  | 'manual'
  | 'percentage_of_basic'
  | 'percentage_of_gross'
  | 'percentage_of_components';

export interface SalaryComponentLike {
  _id?: any;
  code: string;
  name: string;
  type: 'earning' | 'deduction';
  calculationType: SalaryCalculationType;
  defaultAmount?: number | null;
  percentageValue?: number | null;
  basisComponentCodes?: string[] | null;
  accountCode?: string | null;
}

export interface ComputedSalaryLine {
  componentId?: any;
  code: string;
  name: string;
  type: 'earning' | 'deduction';
  calculationType: SalaryCalculationType;
  amount: number;
  accountCode?: string | null;
}

export interface SalaryComputationResult {
  lines: ComputedSalaryLine[];
  grossSalary: number;
  totalDeductions: number;
  netSalary: number;
}

export class CircularSalaryComponentError extends Error {
  constructor(cyclePath: string[]) {
    super(`Circular salary component dependency detected: ${cyclePath.join(' → ')}`);
    this.name = 'CircularSalaryComponentError';
  }
}

const toCents = (n: number | null | undefined): number => Math.round((n || 0) * 100);
const fromCents = (c: number): number => Math.round(c) / 100;

/**
 * Computes every component's amount for one employee, given the school's
 * configured components and any per-employee overrides (manual entries, or
 * an explicit override of a normally-computed fixed/percentage value —
 * payroll processing allows adjusting any component's value per employee,
 * per PAY-01).
 *
 * Evaluation order (deterministic, not insertion order):
 *   1. fixed / manual        — literal value (override, else configured default)
 *   2. percentage_of_basic   — % of the BASIC component's stage-1 amount
 *   3. percentage_of_components — % of one or more named components,
 *      resolved in dependency order (topological sort); a cycle throws
 *      CircularSalaryComponentError rather than looping or guessing.
 *   4. percentage_of_gross   — % of the sum of every earning computed in
 *      stages 1–3 (deliberately excludes other percentage_of_gross
 *      components, since a component can't safely be defined as a
 *      percentage of a total that includes itself).
 */
export function computeSalaryStructure(
  components: SalaryComponentLike[],
  overrides: Record<string, number> = {},
): SalaryComputationResult {
  const byCode = new Map(components.map(c => [c.code, c]));
  const amountCents = new Map<string, number>();

  // ── Stage 1: fixed & manual ──
  for (const c of components) {
    if (c.calculationType !== 'fixed' && c.calculationType !== 'manual') continue;
    const overrideVal = overrides[c.code];
    const value = overrideVal !== undefined ? overrideVal : (c.calculationType === 'fixed' ? (c.defaultAmount || 0) : 0);
    amountCents.set(c.code, toCents(value));
  }

  // ── Stage 2: percentage_of_basic ──
  const basicCents = amountCents.get('BASIC') || 0;
  for (const c of components) {
    if (c.calculationType !== 'percentage_of_basic') continue;
    if (overrides[c.code] !== undefined) { amountCents.set(c.code, toCents(overrides[c.code])); continue; }
    amountCents.set(c.code, Math.round(basicCents * ((c.percentageValue || 0) / 100)));
  }

  // ── Stage 3: percentage_of_components, topologically ordered ──
  const dependents = components.filter(c => c.calculationType === 'percentage_of_components');
  const visited = new Set<string>();
  const inStack = new Set<string>();
  const stackPath: string[] = [];

  const resolve = (code: string) => {
    if (amountCents.has(code)) return; // already resolved in an earlier stage or earlier in this pass
    const comp = byCode.get(code);
    if (!comp || comp.calculationType !== 'percentage_of_components') {
      // References a component that isn't itself percentage-of-components
      // (fixed/manual/percentage_of_basic) but wasn't resolved above -
      // e.g. it references a component code that doesn't exist at all, or
      // one this employee's structure simply doesn't include. Treat as 0
      // rather than throwing - a missing basis component is a data/config
      // issue to surface separately (validation), not a crash here.
      amountCents.set(code, amountCents.get(code) || 0);
      return;
    }
    if (inStack.has(code)) {
      throw new CircularSalaryComponentError([...stackPath.slice(stackPath.indexOf(code)), code]);
    }
    inStack.add(code);
    stackPath.push(code);
    for (const basisCode of comp.basisComponentCodes || []) resolve(basisCode);
    inStack.delete(code);
    stackPath.pop();

    const basisCents = (comp.basisComponentCodes || []).reduce((sum, bc) => sum + (amountCents.get(bc) || 0), 0);
    amountCents.set(code, Math.round(basisCents * ((comp.percentageValue || 0) / 100)));
    visited.add(code);
  };

  for (const c of dependents) {
    if (overrides[c.code] !== undefined) { amountCents.set(c.code, toCents(overrides[c.code])); continue; }
    resolve(c.code);
  }

  // ── Stage 4: percentage_of_gross ──
  // Gross-so-far = every earning resolved in stages 1–3 (fixed/manual/
  // percentage_of_basic/percentage_of_components), deliberately excluding
  // any other percentage_of_gross earning.
  let grossSoFarCents = 0;
  for (const c of components) {
    if (c.type !== 'earning' || c.calculationType === 'percentage_of_gross') continue;
    grossSoFarCents += amountCents.get(c.code) || 0;
  }
  for (const c of components) {
    if (c.calculationType !== 'percentage_of_gross') continue;
    if (overrides[c.code] !== undefined) { amountCents.set(c.code, toCents(overrides[c.code])); continue; }
    amountCents.set(c.code, Math.round(grossSoFarCents * ((c.percentageValue || 0) / 100)));
  }

  const lines: ComputedSalaryLine[] = components.map(c => ({
    componentId: c._id, code: c.code, name: c.name, type: c.type,
    calculationType: c.calculationType, amount: fromCents(amountCents.get(c.code) || 0),
    accountCode: c.accountCode ?? null,
  }));

  const grossSalary = fromCents(lines.filter(l => l.type === 'earning').reduce((s, l) => s + toCents(l.amount), 0));
  const totalDeductions = fromCents(lines.filter(l => l.type === 'deduction').reduce((s, l) => s + toCents(l.amount), 0));
  const netSalary = fromCents(toCents(grossSalary) - toCents(totalDeductions));

  return { lines, grossSalary, totalDeductions, netSalary };
}

/**
 * Validates a set of components for structural problems before they're
 * used in a real payroll run: a percentage_of_components component with no
 * basis selected, a percentage value out of a sane 0–100+ range (allows
 * >100 deliberately - e.g. a 150% bonus multiplier is unusual but not
 * inherently invalid), and - critically - a circular dependency, checked
 * eagerly here (independent of any specific employee's overrides) so a bad
 * configuration is caught at Payroll Settings save time, not discovered
 * mid-payroll-run for whichever employee happens to trigger it.
 */
export function validateSalaryComponentGraph(components: SalaryComponentLike[]): string[] {
  const errors: string[] = [];
  const byCode = new Map(components.map(c => [c.code, c]));

  for (const c of components) {
    if (c.calculationType.startsWith('percentage_') && (c.percentageValue == null || c.percentageValue < 0)) {
      errors.push(`${c.name}: percentage value must be zero or greater`);
    }
    if (c.calculationType === 'percentage_of_components') {
      if (!c.basisComponentCodes || c.basisComponentCodes.length === 0) {
        errors.push(`${c.name}: select at least one component it's a percentage of`);
      }
      for (const basisCode of c.basisComponentCodes || []) {
        if (!byCode.has(basisCode)) errors.push(`${c.name}: references unknown component code "${basisCode}"`);
      }
    }
    if (c.calculationType === 'fixed' && (c.defaultAmount == null || c.defaultAmount < 0)) {
      errors.push(`${c.name}: fixed amount must be zero or greater`);
    }
  }

  // Cycle check across the whole graph, independent of any employee's data.
  const visited = new Set<string>();
  const inStack = new Set<string>();
  const dfs = (code: string, path: string[]): void => {
    if (inStack.has(code)) { errors.push(`Circular dependency: ${[...path, code].join(' → ')}`); return; }
    if (visited.has(code)) return;
    const comp = byCode.get(code);
    if (!comp || comp.calculationType !== 'percentage_of_components') { visited.add(code); return; }
    inStack.add(code);
    for (const basisCode of comp.basisComponentCodes || []) dfs(basisCode, [...path, code]);
    inStack.delete(code);
    visited.add(code);
  };
  for (const c of components) dfs(c.code, []);

  return [...new Set(errors)];
}
