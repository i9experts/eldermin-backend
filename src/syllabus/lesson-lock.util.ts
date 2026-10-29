// ============================================================
// LESSON LOCK — LMS Phase 1 pacing
// Pure, framework-free so it can be unit tested directly and reused by
// every reader of course content (Parent Portal's getMyCourses, Student
// 360's getStudentLearning) without duplicating the same two checks.
// A lesson is locked when EITHER its own releaseDate hasn't arrived yet
// (calendar-based pacing) OR its topic is sequentialLessons and an
// earlier lesson (by `order`) in the same topic isn't completed yet
// (instructor-paced, order-based pacing). Neither check existed before
// this field/flag were added, so every lesson that predates them is
// unaffected - this never locks anything that wasn't explicitly set up to be.
// ============================================================

export interface LessonLockInput {
  lessonNo: number;
}

export interface LessonLockResult {
  locked: boolean;
  reason?: string;
}

export function computeLessonLock(
  lesson: { lessonNo: number; releaseDate?: Date | string | null },
  priorLessonsInOrder: LessonLockInput[],
  sequentialLessons: boolean | undefined,
  isCompleted: (lessonNo: number) => boolean,
  now: Date = new Date(),
): LessonLockResult {
  if (lesson.releaseDate) {
    const release = new Date(lesson.releaseDate);
    if (release.getTime() > now.getTime()) {
      return { locked: true, reason: `Available from ${release.toISOString().slice(0, 10)}` };
    }
  }
  if (sequentialLessons) {
    const incompletePrior = priorLessonsInOrder.find((p) => !isCompleted(p.lessonNo));
    if (incompletePrior) {
      return { locked: true, reason: 'Complete the previous lesson in this topic first' };
    }
  }
  return { locked: false };
}
