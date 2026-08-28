import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  // Captured once at module load (server boot), not per-request, so this
  // is genuinely "when did this running process start" rather than "now".
  private readonly deployedAt = new Date().toISOString();

  getHello(): string {
    return 'Hello World!';
  }

  getHealth() {
    return {
      status: 'ok',
      commit: process.env.RAILWAY_GIT_COMMIT_SHA || process.env.GIT_COMMIT_SHA || 'unknown',
      deployedAt: this.deployedAt,
    };
  }
}
