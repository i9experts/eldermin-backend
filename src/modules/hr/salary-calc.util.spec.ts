import { computeSalaryStructure, validateSalaryComponentGraph, CircularSalaryComponentError, SalaryComponentLike } from './salary-calc.util';

function comp(overrides: Partial<SalaryComponentLike> & Pick<SalaryComponentLike, 'code' | 'name' | 'type' | 'calculationType'>): SalaryComponentLike {
  return { defaultAmount: undefined, percentageValue: undefined, basisComponentCodes: [], accountCode: null, ...overrides };
}

describe('computeSalaryStructure', () => {
  it('computes a fixed component from its configured default amount', () => {
    const components = [comp({ code: 'TRANSPORT', name: 'Transport', type: 'earning', calculationType: 'fixed', defaultAmount: 1000 })];
    const { lines, grossSalary } = computeSalaryStructure(components);
    expect(lines[0].amount).toBe(1000);
    expect(grossSalary).toBe(1000);
  });

  it('computes a manual component from a per-employee override, defaulting to 0 with none given', () => {
    const components = [comp({ code: 'BASIC', name: 'Basic', type: 'earning', calculationType: 'manual' })];
    expect(computeSalaryStructure(components).lines[0].amount).toBe(0);
    expect(computeSalaryStructure(components, { BASIC: 50000 }).lines[0].amount).toBe(50000);
  });

  it('computes percentage_of_basic from the BASIC component amount', () => {
    const components = [
      comp({ code: 'BASIC', name: 'Basic', type: 'earning', calculationType: 'manual' }),
      comp({ code: 'HRA', name: 'HRA', type: 'earning', calculationType: 'percentage_of_basic', percentageValue: 40 }),
    ];
    const { lines } = computeSalaryStructure(components, { BASIC: 50000 });
    expect(lines.find(l => l.code === 'HRA')!.amount).toBe(20000);
  });

  it('computes percentage_of_gross from every non-percentage_of_gross earning', () => {
    const components = [
      comp({ code: 'BASIC', name: 'Basic', type: 'earning', calculationType: 'manual' }),
      comp({ code: 'TRANSPORT', name: 'Transport', type: 'earning', calculationType: 'fixed', defaultAmount: 5000 }),
      comp({ code: 'BONUS', name: 'Performance Bonus', type: 'earning', calculationType: 'percentage_of_gross', percentageValue: 10 }),
    ];
    const { lines } = computeSalaryStructure(components, { BASIC: 45000 });
    // gross-so-far excludes BONUS itself: 45000 + 5000 = 50000 -> 10% = 5000
    expect(lines.find(l => l.code === 'BONUS')!.amount).toBe(5000);
  });

  it('computes a component as a percentage of a single other named component (the PF example from the spec)', () => {
    const components = [
      comp({ code: 'BASIC', name: 'Basic', type: 'earning', calculationType: 'manual' }),
      comp({ code: 'PF', name: 'Provident Fund', type: 'deduction', calculationType: 'percentage_of_components', percentageValue: 10, basisComponentCodes: ['BASIC'] }),
    ];
    const { lines } = computeSalaryStructure(components, { BASIC: 50000 });
    expect(lines.find(l => l.code === 'PF')!.amount).toBe(5000);
  });

  it('computes a component as a percentage of MULTIPLE named components (10% of Basic + HRA, from the spec example)', () => {
    const components = [
      comp({ code: 'BASIC', name: 'Basic', type: 'earning', calculationType: 'manual' }),
      comp({ code: 'HRA', name: 'HRA', type: 'earning', calculationType: 'percentage_of_basic', percentageValue: 40 }),
      comp({ code: 'PF', name: 'Provident Fund', type: 'deduction', calculationType: 'percentage_of_components', percentageValue: 10, basisComponentCodes: ['BASIC', 'HRA'] }),
    ];
    const { lines } = computeSalaryStructure(components, { BASIC: 50000 });
    // Basic 50000, HRA 40% = 20000, PF = 10% of (50000+20000) = 7000
    expect(lines.find(l => l.code === 'PF')!.amount).toBe(7000);
  });

  it('resolves a chain of percentage_of_components components in dependency order', () => {
    const components = [
      comp({ code: 'BASIC', name: 'Basic', type: 'earning', calculationType: 'manual' }),
      comp({ code: 'A', name: 'A', type: 'earning', calculationType: 'percentage_of_components', percentageValue: 50, basisComponentCodes: ['BASIC'] }), // 50% of 10000 = 5000
      comp({ code: 'B', name: 'B', type: 'deduction', calculationType: 'percentage_of_components', percentageValue: 20, basisComponentCodes: ['A'] }), // 20% of 5000 = 1000
    ];
    const { lines } = computeSalaryStructure(components, { BASIC: 10000 });
    expect(lines.find(l => l.code === 'A')!.amount).toBe(5000);
    expect(lines.find(l => l.code === 'B')!.amount).toBe(1000);
  });

  it('rejects a direct circular dependency (A depends on B, B depends on A)', () => {
    const components = [
      comp({ code: 'A', name: 'A', type: 'earning', calculationType: 'percentage_of_components', percentageValue: 10, basisComponentCodes: ['B'] }),
      comp({ code: 'B', name: 'B', type: 'earning', calculationType: 'percentage_of_components', percentageValue: 10, basisComponentCodes: ['A'] }),
    ];
    expect(() => computeSalaryStructure(components)).toThrow(CircularSalaryComponentError);
  });

  it('rejects a longer circular chain (A -> B -> C -> A)', () => {
    const components = [
      comp({ code: 'A', name: 'A', type: 'earning', calculationType: 'percentage_of_components', percentageValue: 10, basisComponentCodes: ['B'] }),
      comp({ code: 'B', name: 'B', type: 'earning', calculationType: 'percentage_of_components', percentageValue: 10, basisComponentCodes: ['C'] }),
      comp({ code: 'C', name: 'C', type: 'earning', calculationType: 'percentage_of_components', percentageValue: 10, basisComponentCodes: ['A'] }),
    ];
    expect(() => computeSalaryStructure(components)).toThrow(CircularSalaryComponentError);
  });

  it('computes gross, total deductions, and net salary correctly across a mixed structure', () => {
    const components = [
      comp({ code: 'BASIC', name: 'Basic', type: 'earning', calculationType: 'manual' }),
      comp({ code: 'HRA', name: 'HRA', type: 'earning', calculationType: 'percentage_of_basic', percentageValue: 40 }),
      comp({ code: 'TRANSPORT', name: 'Transport', type: 'earning', calculationType: 'fixed', defaultAmount: 1000 }),
      comp({ code: 'TAX', name: 'Income Tax', type: 'deduction', calculationType: 'manual' }),
      comp({ code: 'LOAN', name: 'Loan Deduction', type: 'deduction', calculationType: 'fixed', defaultAmount: 2000 }),
    ];
    const { grossSalary, totalDeductions, netSalary } = computeSalaryStructure(components, { BASIC: 50000, TAX: 5000 });
    expect(grossSalary).toBe(50000 + 20000 + 1000); // 71000
    expect(totalDeductions).toBe(5000 + 2000); // 7000
    expect(netSalary).toBe(71000 - 7000); // 64000
  });

  it('avoids floating-point drift across repeated percentage calculations', () => {
    const components = [
      comp({ code: 'BASIC', name: 'Basic', type: 'earning', calculationType: 'manual' }),
      comp({ code: 'A', name: 'A', type: 'earning', calculationType: 'percentage_of_basic', percentageValue: 33.33 }),
    ];
    const { lines } = computeSalaryStructure(components, { BASIC: 10001 });
    // Must be a clean 2-decimal value, not something like 3333.6333000000003
    expect(Number.isInteger(lines[0].amount * 100)).toBe(true);
  });
});

describe('validateSalaryComponentGraph', () => {
  it('flags a percentage_of_components component with no basis selected', () => {
    const components = [comp({ code: 'PF', name: 'Provident Fund', type: 'deduction', calculationType: 'percentage_of_components', percentageValue: 10, basisComponentCodes: [] })];
    const errors = validateSalaryComponentGraph(components);
    expect(errors.some(e => e.includes('at least one component'))).toBe(true);
  });

  it('flags a negative percentage value', () => {
    const components = [comp({ code: 'HRA', name: 'HRA', type: 'earning', calculationType: 'percentage_of_basic', percentageValue: -5 })];
    expect(validateSalaryComponentGraph(components).length).toBeGreaterThan(0);
  });

  it('flags a circular dependency without needing computeSalaryStructure to be called', () => {
    const components = [
      comp({ code: 'A', name: 'A', type: 'earning', calculationType: 'percentage_of_components', percentageValue: 10, basisComponentCodes: ['B'] }),
      comp({ code: 'B', name: 'B', type: 'earning', calculationType: 'percentage_of_components', percentageValue: 10, basisComponentCodes: ['A'] }),
    ];
    expect(validateSalaryComponentGraph(components).some(e => e.startsWith('Circular dependency'))).toBe(true);
  });

  it('passes a valid, acyclic, fully-configured component set', () => {
    const components = [
      comp({ code: 'BASIC', name: 'Basic', type: 'earning', calculationType: 'manual' }),
      comp({ code: 'HRA', name: 'HRA', type: 'earning', calculationType: 'percentage_of_basic', percentageValue: 40 }),
      comp({ code: 'PF', name: 'Provident Fund', type: 'deduction', calculationType: 'percentage_of_components', percentageValue: 10, basisComponentCodes: ['BASIC', 'HRA'] }),
    ];
    expect(validateSalaryComponentGraph(components)).toEqual([]);
  });
});
