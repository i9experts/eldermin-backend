import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateQuestionDto } from './assessment.dto';

const base = {
  subject: 'Islamiyat', grade: 'Grade 3', type: 'matching',
  questionText: 'Match the characteristic with its meaning.',
};

async function validateQuestion(overrides: Record<string, any>) {
  const dto = plainToInstance(CreateQuestionDto, { ...base, ...overrides });
  return validate(dto);
}

describe('CreateQuestionDto.matchingPairs', () => {
  it('accepts a well-formed matching question with several pairs', async () => {
    const errors = await validateQuestion({
      matchingPairs: [
        { left: 'Sidq', right: 'Truthfulness' },
        { left: 'Amanah', right: 'Trustworthiness' },
      ],
    });
    expect(errors.filter((e) => e.property === 'matchingPairs')).toHaveLength(0);
  });

  it('omitting matchingPairs entirely is fine (optional) - other types never set it', async () => {
    const errors = await validateQuestion({});
    expect(errors.filter((e) => e.property === 'matchingPairs')).toHaveLength(0);
  });

  it('rejects a pair missing its right-hand text', async () => {
    const errors = await validateQuestion({ matchingPairs: [{ left: 'Sidq' }] });
    expect(errors.some((e) => e.property === 'matchingPairs')).toBe(true);
  });

  it('rejects a pair with a non-string left value', async () => {
    const errors = await validateQuestion({ matchingPairs: [{ left: 42, right: 'Truthfulness' }] });
    expect(errors.some((e) => e.property === 'matchingPairs')).toBe(true);
  });
});
