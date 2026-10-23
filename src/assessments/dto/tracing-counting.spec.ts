import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateQuestionDto } from './assessment.dto';

async function validateQuestion(overrides: Record<string, any>) {
  const dto = plainToInstance(CreateQuestionDto, {
    subject: 'Early Numeracy', grade: 'KG', ...overrides,
  });
  return validate(dto);
}

describe('CreateQuestionDto.tracing / counting', () => {
  it('accepts a well-formed tracing question', async () => {
    const errors = await validateQuestion({
      type: 'tracing', questionText: 'Trace the letter A',
      traceType: 'letter', traceContent: 'A',
    });
    expect(errors).toHaveLength(0);
  });

  it('rejects an invalid traceType', async () => {
    const errors = await validateQuestion({
      type: 'tracing', questionText: 'Trace', traceType: 'squiggle', traceContent: 'A',
    });
    expect(errors.some((e) => e.property === 'traceType')).toBe(true);
  });

  it('accepts a well-formed counting question', async () => {
    const errors = await validateQuestion({
      type: 'counting', questionText: 'Count the stars',
      countEmoji: '⭐', correctCount: 4, countOptions: [3, 4, 5],
    });
    expect(errors).toHaveLength(0);
  });

  it('rejects a negative correctCount', async () => {
    const errors = await validateQuestion({
      type: 'counting', questionText: 'Count', countEmoji: '⭐', correctCount: -1,
    });
    expect(errors.some((e) => e.property === 'correctCount')).toBe(true);
  });

  it('rejects non-numeric countOptions entries', async () => {
    const errors = await validateQuestion({
      type: 'counting', questionText: 'Count', countEmoji: '⭐', correctCount: 3, countOptions: ['3', 'four'],
    });
    expect(errors.some((e) => e.property === 'countOptions')).toBe(true);
  });

  it('accepts a question tagged against a real SNC ECE indicator', async () => {
    const errors = await validateQuestion({
      type: 'tracing', questionText: 'Trace the letter B', traceType: 'letter', traceContent: 'B',
      eceStandardCode: '[ECE-00-A2-01]', eceStandardText: 'Recognizes and names letters of the alphabet.',
      eceIndicatorId: '507f1f77bcf86cd799439011',
    });
    expect(errors).toHaveLength(0);
  });

  it('omitting all tracing/counting/ECE fields is fine for other types', async () => {
    const errors = await validateQuestion({ type: 'mcq', questionText: 'Pick one' });
    expect(errors.filter((e) =>
      ['traceType', 'traceContent', 'countEmoji', 'correctCount', 'countOptions', 'eceStandardCode', 'eceStandardText', 'eceIndicatorId'].includes(e.property),
    )).toHaveLength(0);
  });
});
