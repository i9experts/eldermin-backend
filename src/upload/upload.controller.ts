import {
  Controller, Post, Delete, Get, Param, Query,
  UseInterceptors, UploadedFile, UploadedFiles,
  Request, HttpCode, HttpStatus, Body, BadRequestException, ForbiddenException,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { UploadService } from './upload.service';
import { Roles } from '../auth/decorators';
import { SCHOOL_STAFF_ROLES } from '../auth/role-sets';

/** Folder names used by the clients today: documents, signatures, inventory, homework-attachments, id-card-watermarks, ece-evidence. */
export const UPLOAD_FOLDER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

/**
 * An object key (<schoolSlug>/<folder>/<uuid>.<ext>, built by UploadService) may only be read or deleted by its own
 * school. Platform super_admin (no school in the token) is not restricted. Exported for tests.
 */
export function assertKeyBelongsToSchool(key: unknown, schoolSlug?: string, role?: string): string {
  if (typeof key !== 'string' || !key.trim()) throw new BadRequestException('A file key is required');
  if (key.includes('..') || key.startsWith('/')) throw new BadRequestException('Invalid file key');
  if (role !== 'super_admin') {
    if (!schoolSlug || !key.startsWith(`${schoolSlug}/`)) throw new ForbiddenException('You can only access your own school\'s files');
  }
  return key;
}

// D9: school staff only. Before this the whole controller was open to any token (parent, student, reseller included);
// no parent / student / reseller client calls it (the web pages and the teacher app that do are staff-only).
@Roles(...SCHOOL_STAFF_ROLES)
@Controller('upload')
export class UploadController {
  constructor(private readonly uploadService: UploadService) {}

  private ctx(req: any) {
    return {
      schoolSlug: req?.user?.schoolSlug || req?.headers['x-school-slug'] || 'demo-school',
      userName: req?.user?.name || 'Admin',
    };
  }

  private assertFolder(folder: string) {
    if (!UPLOAD_FOLDER_PATTERN.test(folder || '')) throw new BadRequestException('Invalid upload folder');
  }

  @Post('single/:folder')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor('file'))
  async uploadSingle(
    @UploadedFile() file: Express.Multer.File,
    @Param('folder') folder: string,
    @Request() req: any,
  ) {
    const { schoolSlug } = this.ctx(req);
    this.assertFolder(folder);
    const result = await this.uploadService.uploadFile(file, folder, schoolSlug);
    return { success: true, data: result };
  }

  @Post('multiple/:folder')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FilesInterceptor('files', 10))
  async uploadMultiple(
    @UploadedFiles() files: Express.Multer.File[],
    @Param('folder') folder: string,
    @Request() req: any,
  ) {
    const { schoolSlug } = this.ctx(req);
    this.assertFolder(folder);
    const results = await this.uploadService.uploadMultiple(files, folder, schoolSlug);
    return { success: true, data: results };
  }

  @Delete()
  async deleteFile(@Body('key') key: string, @Request() req: any) {
    assertKeyBelongsToSchool(key, req?.user?.schoolSlug, req?.user?.role);
    await this.uploadService.deleteFile(key);
    return { success: true, message: 'File deleted' };
  }

  @Get('signed-url')
  async getSignedUrl(@Query('key') key: string, @Request() req: any) {
    assertKeyBelongsToSchool(key, req?.user?.schoolSlug, req?.user?.role);
    const url = await this.uploadService.getSignedUrl(key);
    return { url };
  }
}
