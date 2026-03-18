import { mkdir, access, constants } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createLogger } from '../utils/logger.js';

const log = createLogger('auth-manager');

export interface AuthManagerConfig {
  authPath: string;
}

export class WhatsAppAuthManager {
  private authPath: string;

  constructor(config: AuthManagerConfig) {
    this.authPath = resolve(config.authPath);
  }

  async ensureAuthDirectory(): Promise<void> {
    try {
      await access(this.authPath, constants.R_OK | constants.W_OK);
    } catch {
      await mkdir(this.authPath, { recursive: true });
      log.info({ path: this.authPath }, 'Created auth directory');
    }
  }

  async loadAuthState(): Promise<ReturnType<typeof import('@whiskeysockets/baileys').useMultiFileAuthState>> {
    await this.ensureAuthDirectory();

    const { useMultiFileAuthState } = await import('@whiskeysockets/baileys');
    const state = await useMultiFileAuthState(this.authPath);

    log.info({ path: this.authPath }, 'Auth state loaded');
    return state;
  }

  getAuthPath(): string {
    return this.authPath;
  }
}

export class AuthorizationManager {
  private allowedNumbers: Set<string>;

  constructor(allowedNumbers: string[]) {
    this.allowedNumbers = new Set(
      allowedNumbers.map((n) => this.normalizeNumber(n)),
    );
    log.info({ count: this.allowedNumbers.size }, 'Authorization manager initialized');
  }

  isAuthorized(sender: string): boolean {
    const normalized = this.normalizeNumber(this.extractNumber(sender));
    return this.allowedNumbers.has(normalized);
  }

  addNumber(number: string): void {
    this.allowedNumbers.add(this.normalizeNumber(number));
  }

  removeNumber(number: string): void {
    this.allowedNumbers.delete(this.normalizeNumber(number));
  }

  getAllowedNumbers(): string[] {
    return [...this.allowedNumbers];
  }

  private extractNumber(jid: string): string {
    return jid.split('@')[0] ?? jid;
  }

  private normalizeNumber(number: string): string {
    return number.replace(/[^0-9]/g, '');
  }
}
