import type { PoolClient } from 'pg';
import type { JsonValue } from '../../database/persistence-values.js';
import type { projectCurrentRegistrationDocuments } from '../legal/current-registration-documents.js';
import type { RegistrationCommands } from './registration-commands.js';
import { parseRegistrationInputAt } from './registration-input.js';
import {
  parseRegistrationCodeInput,
  parseRegistrationId,
  parseRegistrationIdempotencyKey,
} from './registration-request.js';

interface Intention {
  key: string;
  route: string;
}

interface OperationResponse {
  status: number;
  body: JsonValue;
  sessionBinding?: { accountId: string; sessionId: string };
}

type UnitOfWorkResult =
  | { kind: 'EXECUTED' | 'REPLAY'; status: number; body: JsonValue }
  | { kind: 'MISMATCH' | 'IN_PROGRESS' | 'EXPIRED' | 'REPLAY_DENIED' };

interface RegistrationDependencies {
  commands: Pick<RegistrationCommands, 'start' | 'resend' | 'verify'>;
  legalReader: {
    getCurrentDocuments(): Promise<
      ReturnType<typeof projectCurrentRegistrationDocuments>
    >;
  };
  passwords: { hash(password: string): Promise<string> };
  idempotency: { fingerprint(intention: Intention, body: unknown): Buffer };
  unitOfWork: {
    execute(
      intention: Intention,
      fingerprint: Buffer,
      work: (tx: PoolClient, clock: () => Date) => Promise<OperationResponse>,
      clock?: () => Date,
      requestId?: string,
    ): Promise<UnitOfWorkResult>;
  };
}

type FailureCode =
  | 'INVALID_REQUEST'
  | 'IDEMPOTENCY_KEY_REQUIRED'
  | 'VALIDATION_FAILED'
  | 'RESOURCE_NOT_FOUND'
  | 'STATE_CONFLICT'
  | 'LEGAL_VERSION_OUTDATED'
  | 'LEGAL_CONFIGURATION_MISSING'
  | 'CODE_INVALID'
  | 'CODE_EXPIRED'
  | 'RATE_LIMITED'
  | 'IDEMPOTENCY_KEY_REUSED'
  | 'REQUEST_IN_PROGRESS'
  | 'OPERATION_FORBIDDEN';

const statuses: Record<FailureCode, number> = {
  INVALID_REQUEST: 400,
  IDEMPOTENCY_KEY_REQUIRED: 400,
  VALIDATION_FAILED: 422,
  RESOURCE_NOT_FOUND: 404,
  STATE_CONFLICT: 409,
  LEGAL_VERSION_OUTDATED: 409,
  LEGAL_CONFIGURATION_MISSING: 503,
  CODE_INVALID: 401,
  CODE_EXPIRED: 401,
  RATE_LIMITED: 429,
  IDEMPOTENCY_KEY_REUSED: 409,
  REQUEST_IN_PROGRESS: 409,
  OPERATION_FORBIDDEN: 403,
};

function reject(
  code: FailureCode,
  retryAfterSeconds?: number,
): OperationResponse {
  return {
    status: statuses[code],
    body: {
      code,
      ...(retryAfterSeconds === undefined ? {} : { retryAfterSeconds }),
    },
  };
}

function convertResult(
  result: Awaited<
    ReturnType<RegistrationCommands['start'] | RegistrationCommands['resend']>
  >,
): OperationResponse {
  return result.kind === 'success'
    ? { status: 202, body: result.value }
    : reject(result.code, result.retryAfterSeconds);
}

function recover(
  result: UnitOfWorkResult,
): OperationResponse & { replayed: boolean } {
  if (result.kind === 'EXECUTED' || result.kind === 'REPLAY') {
    return {
      status: result.status,
      body: result.body,
      replayed: result.kind === 'REPLAY',
    };
  }
  const code: Record<
    'MISMATCH' | 'IN_PROGRESS' | 'EXPIRED' | 'REPLAY_DENIED',
    FailureCode
  > = {
    MISMATCH: 'IDEMPOTENCY_KEY_REUSED',
    IN_PROGRESS: 'REQUEST_IN_PROGRESS',
    EXPIRED: 'STATE_CONFLICT',
    REPLAY_DENIED: 'OPERATION_FORBIDDEN',
  };
  return { ...reject(code[result.kind]), replayed: false };
}

/** HTTP orchestration; its dependencies are supplied by the registration infrastructure. */
export class RegistrationApplication {
  constructor(private readonly dependencies: RegistrationDependencies) {}

  async getCurrentDocuments(): Promise<OperationResponse> {
    const result = await this.dependencies.legalReader.getCurrentDocuments();
    return result.ok
      ? { status: 200, body: result.value }
      : reject('LEGAL_CONFIGURATION_MISSING');
  }

  async start(
    body: unknown,
    key: unknown,
    acceptedAt: Date,
    trustedIp: string,
    requestId?: string,
  ) {
    const parsedKey = parseRegistrationIdempotencyKey(key);
    if (!parsedKey.ok) return { ...reject(parsedKey.reason), replayed: false };
    const parsed = parseRegistrationInputAt(body, acceptedAt);
    if (!parsed.ok) return { ...reject('VALIDATION_FAILED'), replayed: false };
    const intention = {
      key: parsedKey.value,
      route: '/api/v1/auth/registrations',
    };
    const normalized = {
      ...parsed.value,
      legalSelection: {
        ...parsed.value.legalSelection,
        purposeCodes: [...parsed.value.legalSelection.purposeCodes].sort(),
      },
    };
    const fingerprint = this.dependencies.idempotency.fingerprint(
      intention,
      normalized,
    );
    const passwordHash = await this.dependencies.passwords.hash(
      normalized.password,
    );
    const { password: _password, ...input } = normalized;
    const result = await this.dependencies.unitOfWork.execute(
      intention,
      fingerprint,
      async (tx, clock) =>
        convertResult(
          await this.dependencies.commands.start(
            tx,
            {
              ...input,
              passwordHash,
              acceptedAt,
              ip: trustedIp,
            },
            clock(),
          ),
        ),
      undefined,
      requestId,
    );
    return recover(result);
  }

  async resend(registrationId: unknown, key: unknown, requestId?: string) {
    const parsedKey = parseRegistrationIdempotencyKey(key);
    if (!parsedKey.ok) return { ...reject(parsedKey.reason), replayed: false };
    const id = parseRegistrationId(registrationId);
    if (!id.ok) return { ...reject(id.reason), replayed: false };
    const intention = {
      key: parsedKey.value,
      route: `/api/v1/auth/registrations/${id.value}/resend`,
    };
    const fingerprint = this.dependencies.idempotency.fingerprint(
      intention,
      {},
    );
    return recover(
      await this.dependencies.unitOfWork.execute(
        intention,
        fingerprint,
        async (tx, clock) =>
          convertResult(
            await this.dependencies.commands.resend(tx, id.value, clock),
          ),
        undefined,
        requestId,
      ),
    );
  }

  async verify(
    registrationId: unknown,
    key: unknown,
    body: unknown,
    requestId?: string,
  ) {
    const parsedKey = parseRegistrationIdempotencyKey(key);
    if (!parsedKey.ok) return { ...reject(parsedKey.reason), replayed: false };
    const id = parseRegistrationId(registrationId);
    if (!id.ok) return { ...reject(id.reason), replayed: false };
    const code = parseRegistrationCodeInput(body);
    if (!code.ok) return { ...reject(code.reason), replayed: false };
    const intention = {
      key: parsedKey.value,
      route: `/api/v1/auth/registrations/${id.value}/verify`,
    };
    const fingerprint = this.dependencies.idempotency.fingerprint(intention, {
      codigo: code.value,
    });
    return recover(
      await this.dependencies.unitOfWork.execute(
        intention,
        fingerprint,
        async (tx, clock) => {
          const result = await this.dependencies.commands.verify(
            tx,
            id.value,
            code.value,
            clock,
          );
          if (result.kind === 'rejected')
            return reject(
              result.code,
              'retryAfterSeconds' in result
                ? result.retryAfterSeconds
                : undefined,
            );
          return {
            status: 201,
            body: result.value,
            sessionBinding: {
              accountId: result.value.usuario.id,
              sessionId: result.value.sessionId,
            },
          };
        },
        undefined,
        requestId,
      ),
    );
  }
}
