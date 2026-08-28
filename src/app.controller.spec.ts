import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('root', () => {
    it('should return "Hello World!"', () => {
      expect(appController.getHello()).toBe('Hello World!');
    });
  });

  describe('health', () => {
    it('reports ok status with a commit and boot time', () => {
      const health = appController.getHealth();
      expect(health.status).toBe('ok');
      expect(typeof health.commit).toBe('string');
      expect(health.commit.length).toBeGreaterThan(0);
      expect(() => new Date(health.deployedAt).toISOString()).not.toThrow();
    });

    it('falls back to "unknown" when no commit-sha env var is set', () => {
      const prevRailway = process.env.RAILWAY_GIT_COMMIT_SHA;
      const prevGit = process.env.GIT_COMMIT_SHA;
      delete process.env.RAILWAY_GIT_COMMIT_SHA;
      delete process.env.GIT_COMMIT_SHA;
      try {
        expect(appController.getHealth().commit).toBe('unknown');
      } finally {
        if (prevRailway !== undefined) process.env.RAILWAY_GIT_COMMIT_SHA = prevRailway;
        if (prevGit !== undefined) process.env.GIT_COMMIT_SHA = prevGit;
      }
    });
  });
});
