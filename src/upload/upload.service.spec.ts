import { ServiceUnavailableException } from '@nestjs/common';
import { UploadService, STORAGE_NOT_CONFIGURED_MESSAGE } from './upload.service';
import { UploadController } from './upload.controller';

// Fakes/env stubs only: the S3 client is replaced, AWS is never contacted.
const ENV_KEYS = ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_S3_BUCKET', 'AWS_REGION'];
const saved: Record<string, string | undefined> = {};
beforeEach(() => { for (const k of ENV_KEYS) { saved[k] = process.env[k]; delete process.env[k]; } });
afterEach(() => { for (const k of ENV_KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } });

const file: any = { originalname: 'a.pdf', mimetype: 'application/pdf', size: 3, buffer: Buffer.from('abc') };
function mk() {
  const svc = new UploadService();
  const send = jest.fn(async () => ({}));
  (svc as any).s3 = { send };
  return { svc, send };
}

describe('upload without storage configuration', () => {
  it('message text', () => {
    expect(STORAGE_NOT_CONFIGURED_MESSAGE).toBe('File uploads are not available on this server (storage is not configured).');
  });
  it.each([
    ['no env at all', {}],
    ['empty key id', { AWS_ACCESS_KEY_ID: '', AWS_SECRET_ACCESS_KEY: 'x' }],
    ['blank secret', { AWS_ACCESS_KEY_ID: 'x', AWS_SECRET_ACCESS_KEY: '   ' }],
  ])('%s: every operation is a 503 and the SDK is never called', async (_n, env) => {
    Object.assign(process.env, env);
    const { svc, send } = mk();
    const ops: Array<() => Promise<any>> = [
      () => svc.uploadFile(file, 'docs', 's'),
      () => svc.uploadMultiple([file], 'docs', 's'),
      () => svc.deleteFile('k'),
      () => svc.getSignedUrl('k'),
      () => svc.getFileBuffer('k'),
    ];
    for (const op of ops) {
      await expect(op()).rejects.toBeInstanceOf(ServiceUnavailableException);
      await expect(op()).rejects.toThrow(STORAGE_NOT_CONFIGURED_MESSAGE);
    }
    expect(send).not.toHaveBeenCalled();
  });
  it('controller endpoints surface the 503 for single/multiple/delete/signed-url', async () => {
    const { svc } = mk();
    const c = new UploadController(svc);
    const req = { user: { schoolSlug: 's' }, headers: {} };
    await expect(c.uploadSingle(file, 'docs', req)).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(c.uploadMultiple([file], 'docs', req)).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(c.deleteFile('k')).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(c.getSignedUrl('k')).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
  it('configured server behaves as before (SDK called, url returned)', async () => {
    Object.assign(process.env, { AWS_ACCESS_KEY_ID: 'AK', AWS_SECRET_ACCESS_KEY: 'SK', AWS_S3_BUCKET: 'b', AWS_REGION: 'r' });
    const { svc, send } = mk();
    const r = await svc.uploadFile(file, 'docs', 's');
    expect(send).toHaveBeenCalledTimes(1);
    expect(r.url).toMatch(/^https:\/\/b\.s3\.r\.amazonaws\.com\/s\/docs\/.+\.pdf$/);
    await svc.deleteFile('k');
    expect(send).toHaveBeenCalledTimes(2);
  });
});
