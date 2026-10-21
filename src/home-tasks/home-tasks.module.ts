import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { HomeTasksController } from './home-tasks.controller';
import { HomeTasksService } from './home-tasks.service';
import { HomeTask, HomeTaskSchema } from './schemas/home-task.schema';
import { Student, StudentSchema } from '../students/schemas/student.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: HomeTask.name, schema: HomeTaskSchema },
      { name: Student.name, schema: StudentSchema },
    ]),
  ],
  controllers: [HomeTasksController],
  providers: [HomeTasksService],
  exports: [HomeTasksService],
})
export class HomeTasksModule {}
