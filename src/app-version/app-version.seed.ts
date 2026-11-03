import { Model } from 'mongoose';
import { AppVersionApp, AppVersionPlatform } from './schemas/app-version.schema';

// Migration: 2026-11-03-seed-app-versions
// min = "0.0.0" everywhere so nobody is forced to update yet.
export const APP_VERSIONS_SEED: Array<{
  app: AppVersionApp; platform: AppVersionPlatform; latestVersion: string; minVersion: string; storeUrl: string;
}> = [
  {
    app: 'parent', platform: 'android',
    // TODO(owner): confirm the version currently LIVE on Google Play (1.0.9 is just pubspec.yaml's value).
    latestVersion: '1.0.9', minVersion: '0.0.0',
    // TODO(owner): verify package id - parent app's build.gradle applicationId is com.eldermin.eldermin_parent_app.
    storeUrl: 'https://play.google.com/store/apps/details?id=com.eldermin.parentapp',
  },
  {
    app: 'parent', platform: 'ios',
    // TODO(owner): confirm the version currently LIVE on the App Store.
    latestVersion: '1.0.9', minVersion: '0.0.0',
    storeUrl: 'https://apps.apple.com/app/id6816867998',
  },
  {
    app: 'teacher', platform: 'android',
    latestVersion: '1.0.0', minVersion: '0.0.0',
    // TODO(owner): confirm this matches the Play listing's package id.
    storeUrl: 'https://play.google.com/store/apps/details?id=com.eldermin.eldermin_teacher_app',
  },
  {
    app: 'teacher', platform: 'ios',
    latestVersion: '1.0.0', minVersion: '0.0.0',
    storeUrl: 'https://apps.apple.com/app/id6826105220',
  },
];

/** Idempotent: inserts missing rows only ($setOnInsert) - never overwrites values edited via the admin API. */
export async function seedAppVersions(model: Model<any>): Promise<number> {
  const res = await model.bulkWrite(
    APP_VERSIONS_SEED.map(({ app, platform, ...rest }) => ({
      updateOne: { filter: { app, platform }, update: { $setOnInsert: { app, platform, ...rest, updateMessage: null } }, upsert: true },
    })),
  );
  return res.upsertedCount;
}
