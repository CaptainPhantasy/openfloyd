import { createLogger } from '../utils/logger.js';
import type { ExecutionResult, SandboxConfig } from '../types/index.js';

const log = createLogger('wasm-sandbox');

const DEFAULT_TIMEOUT_MS = 5_000;
const DEFAULT_MEMORY_BYTES = 256 * 1024 * 1024;


export interface WasmSandboxConfig {
  defaultTimeout?: number;
  defaultMemoryBytes?: number;
}

export class WasmSandbox {
  private defaultTimeout: number;
  private defaultMemoryBytes: number;
  private executionCount = 0;
  private totalDurationMs = 0;

  constructor(config?: WasmSandboxConfig) {
    this.defaultTimeout = config?.defaultTimeout ?? DEFAULT_TIMEOUT_MS;
    this.defaultMemoryBytes = config?.defaultMemoryBytes ?? DEFAULT_MEMORY_BYTES;

    log.info(
      { defaultTimeout: this.defaultTimeout, defaultMemoryBytes: this.defaultMemoryBytes },
      'WASM sandbox initialized',
    );
  }

  async execute(params: SandboxConfig & { code: string }): Promise<ExecutionResult> {
    const startTime = Date.now();
    const timeout = params.timeout || this.defaultTimeout;
    const memoryBytes = params.memoryBytes || this.defaultMemoryBytes;
    const maxPages = Math.ceil(memoryBytes / (64 * 1024));

    log.info(
      { language: params.language, timeout, maxPages, codeLength: params.code.length },
      'Executing code in WASM sandbox',
    );

    try {
      const createPlugin = await this.loadExtism();

      const wasmModule = await this.getLanguageRuntime(params.language);

      const plugin = await createPlugin(wasmModule, {
        useWasi: true,
        runInWorker: true,
        timeoutMs: timeout,
        memory: { maxPages },
        allowedPaths: {},
        allowedHosts: params.allowedHosts ?? [],
        config: { code: params.code },
      });

      try {
        const result = await plugin.call('eval', params.code);
        const output = result?.text() ?? '';
        const duration = Date.now() - startTime;

        this.executionCount++;
        this.totalDurationMs += duration;

        log.info(
          { language: params.language, duration_ms: duration, outputLength: output.length },
          'WASM execution completed',
        );

        return { output, error: null, duration_ms: duration, exit_code: 0 };
      } finally {
        await plugin.close();
      }
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      const isTimeout = errorMessage.toLowerCase().includes('timeout');

      log.error(
        { err: error, language: params.language, duration_ms: duration, isTimeout },
        'WASM execution failed',
      );

      return {
        output: null,
        error: isTimeout ? `Execution timed out after ${timeout}ms` : errorMessage,
        duration_ms: duration,
        exit_code: 1,
      };
    }
  }

  getStats(): { executions: number; totalDurationMs: number; avgDurationMs: number } {
    return {
      executions: this.executionCount,
      totalDurationMs: this.totalDurationMs,
      avgDurationMs: this.executionCount > 0 ? this.totalDurationMs / this.executionCount : 0,
    };
  }

  private async loadExtism(): Promise<typeof import('@extism/extism').default> {
    const mod = await import('@extism/extism');
    return mod.default;
  }

  private async getLanguageRuntime(language: string): Promise<string | Uint8Array> {
    const runtimePaths: Record<string, string> = {
      javascript: './runtime/javascript-env.wasm',
      python: './runtime/python-env.wasm',
    };

    const path = runtimePaths[language];
    if (!path) {
      throw new Error(`Unsupported language: ${language}. Supported: ${Object.keys(runtimePaths).join(', ')}`);
    }

    return path;
  }
}
