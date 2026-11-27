import { SmtpTransport } from '@nestjs/mail';
import type { RegistrationSettings } from '../../config/registration-settings.js';
import { RegistrationLegalReader } from './registration-legal-reader.js';

/** Performs a read-only legal check and SMTP handshake. It never sends a message. */
export class RegistrationEnvironmentCheck {
  constructor(
    private readonly legal: Pick<
      RegistrationLegalReader,
      'getCurrentDocuments'
    >,
    private readonly settings: Pick<RegistrationSettings, 'smtpUrl'>,
  ) {}
  async check() {
    const documents = await this.legal.getCurrentDocuments();
    const smtp = new SmtpTransport({
      url: this.settings.smtpUrl,
      startTls: 'required',
      timeouts: { connect: '5s', greeting: '5s', command: '5s', data: '10s' },
    });
    let connected = false;
    try {
      await smtp.verify();
      connected = true;
    } catch {
      connected = false;
    } finally {
      try {
        await smtp.close();
      } catch {
        connected = false;
      }
    }
    return {
      status: documents.ok && connected ? 'ok' : 'incomplete',
      database: 'ok',
      legalDocuments: documents.ok ? 'ok' : 'LEGAL_CONFIGURATION_MISSING',
      smtp: connected ? 'ok' : 'SMTP_UNAVAILABLE',
    };
  }
}
