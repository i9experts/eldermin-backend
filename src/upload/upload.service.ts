import { Injectable, BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import * as multer from 'multer';
import { randomUUID } from 'crypto';
import * as path from 'path';

export const ALLOWED_TYPES = {
  document: ['application/pdf', 'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain'],
  image: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
  any: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
};

export const STORAGE_NOT_CONFIGURED_MESSAGE = 'File uploads are not available on this server (storage is not configured).';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

@Injectable()
export class UploadService {
  private s3: S3Client;
  private bucket: string;

  constructor() {
    this.s3 = new S3Client({
      region: process.env.AWS_REGION || 'ap-south-1',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
      },
    });
    this.bucket = process.env.AWS_S3_BUCKET || 'eldermin-files';
  }

  /** True only when S3 credentials and a bucket are present (checked on every call, never contacts AWS). */
  isStorageConfigured(): boolean {
    const set = (v?: string) => !!v && v.trim().length > 0;
    return set(process.env.AWS_ACCESS_KEY_ID) && set(process.env.AWS_SECRET_ACCESS_KEY) && set(this.bucket);
  }

  /** Throws 503 BEFORE any SDK call when storage is not configured. */
  private assertStorageConfigured(): void {
    if (!this.isStorageConfigured()) throw new ServiceUnavailableException(STORAGE_NOT_CONFIGURED_MESSAGE);
  }

  async uploadFile(
    file: Express.Multer.File,
    folder: string,
    schoolSlug: string,
  ): Promise<{ url: string; key: string; fileName: string; fileSize: number; fileType: string }> {
    this.assertStorageConfigured();
    if (!file) throw new BadRequestException('No file provided');
    if (file.size > MAX_FILE_SIZE) throw new BadRequestException('File too large. Max 10MB allowed.');

    const ext = path.extname(file.originalname).toLowerCase();
    const uniqueName = `${randomUUID()}${ext}`;
    const key = `${schoolSlug}/${folder}/${uniqueName}`;

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype,
      Metadata: {
        originalName: file.originalname,
        schoolSlug,
        uploadedAt: new Date().toISOString(),
      },
    });

    await this.s3.send(command);

    const url = `https://${this.bucket}.s3.${process.env.AWS_REGION || 'ap-south-1'}.amazonaws.com/${key}`;

    return {
      url,
      key,
      fileName: file.originalname,
      fileSize: file.size,
      fileType: file.mimetype,
    };
  }

  async uploadMultiple(
    files: Express.Multer.File[],
    folder: string,
    schoolSlug: string,
  ) {
    this.assertStorageConfigured();
    return Promise.all(files.map(f => this.uploadFile(f, folder, schoolSlug)));
  }

  async deleteFile(key: string): Promise<void> {
    this.assertStorageConfigured();
    const command = new DeleteObjectCommand({ Bucket: this.bucket, Key: key });
    await this.s3.send(command);
  }

  // Fetches a previously-uploaded file's raw bytes back, given its S3
  // key - used where the backend itself needs to process an upload
  // (e.g. OMR image analysis), rather than just serving it to a browser.
  async getFileBuffer(key: string): Promise<Buffer> {
    this.assertStorageConfigured();
    const command = new GetObjectCommand({ Bucket: this.bucket, Key: key });
    const response = await this.s3.send(command);
    const chunks: Buffer[] = [];
    for await (const chunk of response.Body as any) {
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  async getSignedUrl(key: string, expiresIn = 3600): Promise<string> {
    this.assertStorageConfigured();
    const command = new GetObjectCommand({ Bucket: this.bucket, Key: key });
    return getSignedUrl(this.s3, command, { expiresIn });
  }

  getMulterConfig() {
    return {
      storage: multer.memoryStorage(),
      limits: { fileSize: MAX_FILE_SIZE },
      fileFilter: (_req: any, file: Express.Multer.File, cb: any) => {
        const allowed = ALLOWED_TYPES.any;
        if (allowed.includes(file.mimetype)) {
          cb(null, true);
        } else {
          cb(new BadRequestException(`File type ${file.mimetype} not allowed`), false);
        }
      },
    };
  }
}
