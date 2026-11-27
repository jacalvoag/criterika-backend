import { randomUUID } from 'node:crypto';
import {
  Controller,
  Get,
  Inject,
  Res,
  ServiceUnavailableException,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Response } from 'express';
import { HealthService } from './health.service.js';
import { HealthProblemFilter } from './health-problem.filter.js';

@Controller('api/v1/health')
@UseGuards(ThrottlerGuard)
@UseFilters(HealthProblemFilter)
export class HealthController {
  constructor(@Inject(HealthService) private readonly health: HealthService) {}
  @Get()
  async get(@Res() response: Response) {
    if (!(await this.health.ready())) throw new ServiceUnavailableException();
    return response
      .set({ 'X-Request-Id': randomUUID(), 'Cache-Control': 'no-store' })
      .status(200)
      .json({ estado: 'OK', fechaServidor: new Date().toISOString() });
  }
}
