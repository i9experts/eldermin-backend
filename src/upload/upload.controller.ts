import {
  Controller, Post, Delete, Get, Param, Query,
  UseInterceptors, UploadedFile, UploadedFiles,
  Request, HttpCode, HttpStatus, Body,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { UploadService } from './upload.service';

@Controller('upload')
export class UploadController {
  constructor(private readonly uploadService: UploadService) {}

  private ctx(req: any) {
    return {
      schoolSlug: req?.user?.schoolSlug || req?.headers['x-school-slug'] || 'demo-school',
      userName: req?.user?.name || 'Admin',
    };
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
    const results = await this.uploadService.uploadMultiple(files, folder, schoolSlug);
    return { success: true, data: results };
  }

  @Delete()
  async deleteFile(@Body('key') key: string) {
    await this.uploadService.deleteFile(key);
    return { success: true, message: 'File deleted' };
  }

  @Get('signed-url')
  async getSignedUrl(@Query('key') key: string) {
    const url = await this.uploadService.getSignedUrl(key);
    return { url };
  }
}
