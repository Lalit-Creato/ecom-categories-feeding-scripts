import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EcomSeedingService } from './ecom-seeding.service';
import { EcomSeedingController } from './ecom-seeding.controller';

@Module({
  imports: [ConfigModule.forRoot()],
  controllers: [EcomSeedingController],
  providers: [EcomSeedingService],
  exports: [EcomSeedingService],
})
export class EcomSeedingModule {}

