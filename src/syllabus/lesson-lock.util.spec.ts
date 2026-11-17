import { computeLessonLock } from './lesson-lock.util';

const NOW = new Date('2026-06-15T00:00:00Z');
const noneCompleted = () => false;
const allCompleted = () => true;

describe('computeLessonLock', () => {
  it('unlocked when no releaseDate and not sequential', () => {
    expect(computeLessonLock({ lessonNo: 1 }, [], false, noneCompleted, NOW)).toEqual({ locked: false });
  });

  it('locked when releaseDate is in the future', () => {
    const result = computeLessonLock({ lessonNo: 1, releaseDate: '2026-07-01' }, [], false, noneCompleted, NOW);
    expect(result.locked).toBe(true);
    expect(result.reason).toContain('2026-07-01');
  });

  it('unlocked when releaseDate has already passed', () => {
    expect(computeLessonLock({ lessonNo: 1, releaseDate: '2026-01-01' }, [], false, noneCompleted, NOW)).toEqual({ locked: false });
  });

  it('unlocked when releaseDate is exactly now', () => {
    expect(computeLessonLock({ lessonNo: 1, releaseDate: NOW }, [], false, noneCompleted, NOW)).toEqual({ locked: false });
  });

  it('sequential + prior lessons all completed -> unlocked', () => {
    const priors = [{ lessonNo: 1 }, { lessonNo: 2 }];
    expect(computeLessonLock({ lessonNo: 3 }, priors, true, allCompleted, NOW)).toEqual({ locked: false });
  });

  it('sequential + a prior lesson not completed -> locked', () => {
    const priors = [{ lessonNo: 1 }, { lessonNo: 2 }];
    const isCompleted = (n: number) => n === 1; // lesson 2 not done
    const result = computeLessonLock({ lessonNo: 3 }, priors, true, isCompleted, NOW);
    expect(result.locked).toBe(true);
    expect(result.reason).toBeTruthy();
  });

  it('not sequential: incomplete priors never lock it', () => {
    const priors = [{ lessonNo: 1 }];
    expect(computeLessonLock({ lessonNo: 2 }, priors, false, noneCompleted, NOW)).toEqual({ locked: false });
  });

  it('releaseDate lock takes priority even when sequential priors are also incomplete', () => {
    const priors = [{ lessonNo: 1 }];
    const result = computeLessonLock({ lessonNo: 2, releaseDate: '2099-01-01' }, priors, true, noneCompleted, NOW);
    expect(result.locked).toBe(true);
    expect(result.reason).toContain('2099-01-01');
  });

  it('no prior lessons at all (first lesson in a sequential topic) -> unlocked', () => {
    expect(computeLessonLock({ lessonNo: 1 }, [], true, noneCompleted, NOW)).toEqual({ locked: false });
  });
});
