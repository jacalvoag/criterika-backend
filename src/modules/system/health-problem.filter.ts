import { randomUUID } from 'node:crypto';
import {
  ArgumentsHost,
  Catch,
  HttpException,
  type ExceptionFilter,
} from '@nestjs/common';
import type { Response } from 'express';

@Catch()
export class HealthProblemFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    const candidate = error instanceof HttpException ? error.getStatus() : 500;
    const status = candidate === 429 || candidate === 503 ? candidate : 500;
    const requestId = randomUUID();
    response.setHeader('X-Request-Id', requestId);
    response.setHeader('Cache-Control', 'no-store');
    if (status === 429 || status === 503)
      response.setHeader('Retry-After', status === 429 ? '60' : '5');
    const code =
      status === 429
        ? 'RATE_LIMITED'
        : status === 503
          ? 'SERVICE_UNAVAILABLE'
          : 'INTERNAL_ERROR';
    return response
      .status(status)
      .type('application/problem+json')
      .json({
        type: 'about:blank',
        title:
          status === 429
            ? 'TooManyRequests'
            : status === 503
              ? 'Unavailable'
              : 'InternalError',
        status,
        detail:
          status === 429
            ? 'Demasiadas solicitudes.'
            : status === 503
              ? 'Servicio no disponible.'
              : 'Error interno inesperado.',
        code,
        requestId,
      });
  }
}
