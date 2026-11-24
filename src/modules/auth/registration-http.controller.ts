import { randomUUID } from 'node:crypto';
import { isIP } from 'node:net';
import {
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Param,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { RegistrationApplication } from './registration-application.js';

export const REGISTRATION_RATE_LIMITER = Symbol('REGISTRATION_RATE_LIMITER');

/** A shared limiter is supplied by the deployment. */
export interface RegistrationRateLimiter {
  check(
    ip: string,
    operation: 'documents' | 'start' | 'resend' | 'verify',
  ): Promise<{ allowed: true } | { allowed: false; retryAfterSeconds: number }>;
}

type ResponseResult = { status: number; body: unknown; replayed?: boolean };

@Controller('api/v1')
export class RegistrationHttpController {
  constructor(
    @Inject(RegistrationApplication)
    private readonly application: RegistrationApplication,
    @Inject(REGISTRATION_RATE_LIMITER)
    private readonly limiter: RegistrationRateLimiter,
  ) {}

  @Get('legal/documents/current')
  async documents(@Req() request: Request, @Res() response: Response) {
    return this.handle(request, response, 'documents', () =>
      this.application.getCurrentDocuments(),
    );
  }

  @Post('auth/registrations')
  async start(
    @Req() request: Request,
    @Res() response: Response,
    @Headers('idempotency-key') key: unknown,
    @Body() body: unknown,
  ) {
    const acceptedAt = new Date();
    return this.handle(request, response, 'start', (ip) =>
      this.application.start(body, key, acceptedAt, ip),
    );
  }

  @Post('auth/registrations/:registrationId/resend')
  async resend(
    @Req() request: Request,
    @Res() response: Response,
    @Headers('idempotency-key') key: unknown,
    @Param('registrationId') registrationId: string,
  ) {
    return this.handle(request, response, 'resend', () =>
      this.application.resend(registrationId, key),
    );
  }

  @Post('auth/registrations/:registrationId/verify')
  async verify(
    @Req() request: Request,
    @Res() response: Response,
    @Headers('idempotency-key') key: unknown,
    @Param('registrationId') registrationId: string,
    @Body() body: unknown,
  ) {
    return this.handle(request, response, 'verify', () =>
      this.application.verify(registrationId, key, body),
    );
  }

  private async handle(
    request: Request,
    response: Response,
    operation: 'documents' | 'start' | 'resend' | 'verify',
    work: (ip: string) => Promise<ResponseResult>,
  ) {
    const requestId = randomUUID();
    response.setHeader('X-Request-Id', requestId);
    response.setHeader('Cache-Control', 'no-store');
    try {
      // Express ignores forwarding headers unless explicitly configured to trust a proxy.
      const ip = request.ip;
      if (!ip || isIP(ip) === 0)
        throw new Error('Dirección de conexión no disponible.');
      const limit = await this.limiter.check(ip, operation);
      if (!limit.allowed) {
        if (
          !Number.isInteger(limit.retryAfterSeconds) ||
          limit.retryAfterSeconds < 1 ||
          limit.retryAfterSeconds > 86400
        ) {
          throw new RangeError('Tiempo de espera inválido.');
        }
        return this.send(response, requestId, {
          status: 429,
          body: {
            code: 'RATE_LIMITED',
            retryAfterSeconds: limit.retryAfterSeconds,
          },
        });
      }
      return this.send(response, requestId, await work(ip));
    } catch {
      return this.send(response, requestId, {
        status: 500,
        body: { code: 'INTERNAL_ERROR' },
      });
    }
  }

  private send(response: Response, requestId: string, result: ResponseResult) {
    if (result.replayed !== undefined) {
      response.setHeader('Idempotency-Replayed', String(result.replayed));
    }
    if (result.status < 400)
      return response.status(result.status).json(result.body);
    const problem = result.body as { code: string; retryAfterSeconds?: number };
    if (
      result.status === 429 &&
      Number.isInteger(problem.retryAfterSeconds) &&
      problem.retryAfterSeconds! >= 1 &&
      problem.retryAfterSeconds! <= 86400
    ) {
      response.setHeader('Retry-After', String(problem.retryAfterSeconds));
    }
    return response
      .status(result.status)
      .type('application/problem+json')
      .json({
        type: 'about:blank',
        title: 'No se pudo completar la solicitud',
        status: result.status,
        detail: 'No se pudo completar la solicitud.',
        code: problem.code,
        requestId,
      });
  }
}
