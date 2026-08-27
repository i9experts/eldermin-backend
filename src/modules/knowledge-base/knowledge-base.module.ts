import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { KbArticle, KbArticleSchema } from './schemas/kb-article.schema';
import { KnowledgeBaseService } from './knowledge-base.service';
import { KnowledgeBaseController } from './knowledge-base.controller';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: KbArticle.name, schema: KbArticleSchema }]),
  ],
  controllers: [KnowledgeBaseController],
  providers: [KnowledgeBaseService],
  exports: [KnowledgeBaseService],
})
export class KnowledgeBaseModule {}
