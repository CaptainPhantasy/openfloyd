import { readFile } from 'node:fs/promises';
import type { SystemConfig } from '../types/index.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('schema-validator');

export class ValidationError extends Error {
  constructor(
    message: string,
    public readonly path: string,
    public readonly expected: string,
    public readonly received: string,
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}

type ValidatorFn = (value: unknown, path: string) => ValidationError[];

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requiredField(obj: Record<string, unknown>, field: string, path: string): ValidationError[] {
  if (!(field in obj)) {
    return [new ValidationError(`Missing required field "${field}"`, `${path}.${field}`, 'defined', 'undefined')];
  }
  return [];
}


const validateSystemSection: ValidatorFn = (value, path) => {
  const errors: ValidationError[] = [];
  if (!isObject(value)) {
    errors.push(new ValidationError('Must be an object', path, 'object', typeof value));
    return errors;
  }

  errors.push(...requiredField(value, 'version', path));
  errors.push(...requiredField(value, 'logLevel', path));

  if (typeof value['logLevel'] === 'string') {
    const validLevels = ['trace', 'debug', 'info', 'warn', 'error', 'fatal'];
    if (!validLevels.includes(value['logLevel'])) {
      errors.push(new ValidationError(
        `Invalid log level "${value['logLevel']}"`,
        `${path}.logLevel`,
        validLevels.join(' | '),
        value['logLevel'],
      ));
    }
  }

  return errors;
};

const validateModelsSection: ValidatorFn = (value, path) => {
  const errors: ValidationError[] = [];
  if (!isObject(value)) {
    errors.push(new ValidationError('Must be an object', path, 'object', typeof value));
    return errors;
  }

  errors.push(...requiredField(value, 'providers', path));

  if (isObject(value['providers'])) {
    for (const [providerName, providerConfig] of Object.entries(value['providers'] as Record<string, unknown>)) {
      if (!isObject(providerConfig)) {
        errors.push(new ValidationError('Provider must be an object', `${path}.providers.${providerName}`, 'object', typeof providerConfig));
        continue;
      }
      errors.push(...requiredField(providerConfig, 'apiKey', `${path}.providers.${providerName}`));
    }
  }

  return errors;
};

export function validateConfig(config: unknown): { valid: boolean; errors: ValidationError[] } {
  const errors: ValidationError[] = [];

  if (!isObject(config)) {
    errors.push(new ValidationError('Config must be an object', 'root', 'object', typeof config));
    return { valid: false, errors };
  }

  errors.push(...requiredField(config, 'system', 'root'));
  errors.push(...requiredField(config, 'models', 'root'));
  errors.push(...requiredField(config, 'agents', 'root'));

  if (isObject(config['system'])) {
    errors.push(...validateSystemSection(config['system'], 'root.system'));
  }

  if (isObject(config['models'])) {
    errors.push(...validateModelsSection(config['models'], 'root.models'));
  }

  const valid = errors.length === 0;
  log.info({ valid, errorCount: errors.length }, 'Config validation complete');
  return { valid, errors };
}

export async function loadAndValidateConfig(filePath: string): Promise<SystemConfig> {
  const raw = await readFile(filePath, 'utf-8');
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ValidationError('Invalid JSON', filePath, 'valid JSON', 'parse error');
  }

  const result = validateConfig(parsed);
  if (!result.valid) {
    const messages = result.errors.map((e) => `  ${e.path}: ${e.message}`).join('\n');
    throw new Error(`Config validation failed:\n${messages}`);
  }

  return parsed as SystemConfig;
}
