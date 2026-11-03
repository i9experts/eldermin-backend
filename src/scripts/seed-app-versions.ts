import { NestFactory } from '@nestjs/core';
import { getModelToken } from '@nestjs/mongoose';
import { AppModule } from '../app.module';
import { AppVersion } from '../app-version/schemas/app-version.schema';
import { seedAppVersions } from '../app-version/app-version.seed';

(async () => {
  const app = await NestFactory.createApplicationContext(AppModule);
  const n = await seedAppVersions(app.get(getModelToken(AppVersion.name)));
  console.log(`app_versions: inserted ${n} missing row(s); existing rows untouched`);
  await app.close();
})();
