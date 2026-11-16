import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { PostgresModule } from './database/postgres.module.js';

@Module({
  imports: [PostgresModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
