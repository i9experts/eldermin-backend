import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PointsTransaction, PointsTransactionSchema } from './schemas/points-transaction.schema';
import { StudentPointsTotal, StudentPointsTotalSchema } from './schemas/student-points-total.schema';
import { AwardedBadge, AwardedBadgeSchema } from './schemas/awarded-badge.schema';
import { Student, StudentSchema } from '../students/schemas/student.schema';
import { GamificationService } from './gamification.service';
import { GamificationController } from './gamification.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: PointsTransaction.name, schema: PointsTransactionSchema },
      { name: StudentPointsTotal.name, schema: StudentPointsTotalSchema },
      { name: AwardedBadge.name, schema: AwardedBadgeSchema },
      // Only needed to denormalize a student's name/grade/section onto
      // the cached leaderboard row - same minimal-registration reasoning
      // the rest of the LMS modules already use for Student.
      { name: Student.name, schema: StudentSchema },
    ]),
  ],
  controllers: [GamificationController],
  providers: [GamificationService],
  exports: [GamificationService],
})
export class GamificationModule {}
