// ============================================================
// BADGE CATALOG — LMS Phase 5 (gamification)
// A small, fixed, hardcoded set of system badges rather than a
// per-school custom badge designer - the same scope reduction prior LMS
// phases made (e.g. Phase 1 skipped cross-course prerequisites). A full
// designer (upload an icon, write custom trigger rules) is real future
// work; this ships real, visible gamification now. Each entry's
// `key` is the stable identifier stored on AwardedBadge - never rename
// a key once it has shipped, or every already-earned badge loses its
// display data.
// ============================================================
export interface BadgeDefinition {
  key: string;
  label: string;
  description: string;
  icon: string;
}

export const BADGE_CATALOG: BadgeDefinition[] = [
  { key: 'first_lesson', label: 'First Step', description: 'Completed your first lesson.', icon: '🎯' },
  { key: 'course_complete', label: 'Course Champion', description: 'Completed 100% of a course.', icon: '🏆' },
  { key: 'quiz_ace', label: 'Quiz Ace', description: 'Scored 90% or higher on a self-paced quiz.', icon: '⭐' },
  { key: 'forum_contributor', label: 'Discussion Starter', description: 'Posted your first message in a course forum.', icon: '💬' },
  { key: 'points_100', label: 'Rising Star', description: 'Earned 100 points.', icon: '🌟' },
  { key: 'points_500', label: 'High Achiever', description: 'Earned 500 points.', icon: '🚀' },
  { key: 'points_1000', label: 'LMS Legend', description: 'Earned 1000 points.', icon: '👑' },
];

export const BADGE_BY_KEY: Record<string, BadgeDefinition> = Object.fromEntries(BADGE_CATALOG.map((b) => [b.key, b]));

// Milestones checked whenever a student's running total changes -
// ordered ascending so awardPointMilestoneBadges can stop at the first
// one not yet reached.
export const POINTS_MILESTONES: { threshold: number; badgeKey: string }[] = [
  { threshold: 100, badgeKey: 'points_100' },
  { threshold: 500, badgeKey: 'points_500' },
  { threshold: 1000, badgeKey: 'points_1000' },
];
