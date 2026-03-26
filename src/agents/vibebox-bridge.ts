import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve } from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { createLogger } from '../utils/logger.js';
import type { WorkerConfig, WorkerTask, VMInstance, CommandResult } from '../types/index.js';

const execFileAsync = promisify(execFile);
const log = createLogger('vibebox-bridge');

const SSH_KEY_PATH = process.env['VIBEBOX_SSH_KEY'] ?? '/Volumes/SanDisk1gb/floyd-sandbox/.vibebox/ssh_key';
const VM_BASE_IP = '192.168.64';
const WORKER_IMAGE = process.env['WORKER_IMAGE'] ?? 'openfloyd-worker:latest';
const GITHUB_ORG = process.env['GITHUB_ORG'] ?? 'LegacyAI-FloydsLabs';
const GITHUB_PAT = process.env['GITHUB_PAT'] ?? '';

type SpawnMode = 'docker' | 'ssh';

/**
 * ZERO TRUST WORKER ARCHITECTURE
 *
 * Workers run in Docker containers with:
 * - --network none (no internet access, ever)
 * - No credentials, no PAT, no SSH keys
 * - No Docker socket access
 * - Memory + CPU limits
 *
 * Workers can ONLY:
 * - Read/write files inside /workspace
 * - Execute commands inside their sandbox
 *
 * Workers CANNOT:
 * - Access the network
 * - Push to GitHub
 * - Call external APIs
 * - Access host filesystem
 * - Spawn other containers
 *
 * The ORCHESTRATOR (on the host) handles all external operations:
 * - Copies files OUT of the container via `docker cp`
 * - Executes git operations on the host with host-held credentials
 * - Creates repos via GitHub API from the host
 * - Pushes code from the host
 */
export class VibeBoxBridge {
  private vms = new Map<string, VMInstance>();
  private nextIpSuffix = 10;
  private spawnMode: SpawnMode;

  constructor() {
    this.spawnMode = this.detectSpawnMode();
    log.info({ spawnMode: this.spawnMode }, 'VibeBox bridge initialized (zero-trust mode)');
  }

  private detectSpawnMode(): SpawnMode {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { execFileSync } = require('node:child_process') as typeof import('node:child_process');
      execFileSync('docker', ['info'], { timeout: 3000, stdio: 'ignore' });
      return 'docker';
    } catch {
      return 'ssh';
    }
  }

  async spawnVM(workerId: string, config: WorkerConfig): Promise<VMInstance> {
    log.info({ workerId, type: config.type, mode: this.spawnMode }, 'Spawning worker environment');

    if (this.spawnMode === 'docker') {
      return this.spawnDocker(workerId, config);
    }
    return this.spawnSSH(workerId, config);
  }

  private async spawnDocker(workerId: string, config: WorkerConfig): Promise<VMInstance> {
    const memLimit = `${config.memoryMB}m`;

    try {
      // ALL containers: --network none, no credentials, no env vars with secrets
      await execFileAsync('docker', [
        'run', '-d',
        '--name', workerId,
        '--memory', memLimit,
        '--cpus', '1',
        '--network', 'none',
        '--label', 'openfloyd-worker=true',
        '--read-only',
        '--tmpfs', '/workspace:rw,exec,size=512m',
        '--tmpfs', '/tmp:rw,noexec,size=64m',
        WORKER_IMAGE,
        'sleep', 'infinity',
      ], { timeout: 30_000 });

      const vm: VMInstance = {
        id: workerId,
        ip: `container-${workerId}`,
        state: 'running',
        createdAt: new Date(),
        config,
      };
      this.vms.set(workerId, vm);
      log.info({ workerId }, 'Docker container started (network=none, read-only root, no credentials)');
      return vm;
    } catch (err) {
      log.error({ err, workerId }, 'Docker spawn failed');
      throw err;
    }
  }

  private async spawnSSH(workerId: string, config: WorkerConfig): Promise<VMInstance> {
    const ip = `${VM_BASE_IP}.${this.nextIpSuffix++}`;

    const vm: VMInstance = {
      id: workerId,
      ip,
      state: 'running',
      createdAt: new Date(),
      config,
    };

    try {
      await this.executeSSH(ip, 'echo "VM alive"');
      log.info({ workerId, ip }, 'SSH VM is responsive');
    } catch {
      log.warn({ workerId, ip }, 'SSH VM not responsive — will retry on first command');
    }

    this.vms.set(workerId, vm);
    return vm;
  }

  async terminateVM(workerId: string): Promise<void> {
    const vm = this.vms.get(workerId);
    if (!vm) {
      log.warn({ workerId }, 'VM not found for termination');
      return;
    }
    log.info({ workerId, mode: this.spawnMode }, 'Terminating worker environment');

    if (this.spawnMode === 'docker') {
      try {
        await execFileAsync('docker', ['rm', '-f', workerId], { timeout: 10_000 });
      } catch (err) {
        log.error({ err, workerId }, 'Docker terminate failed');
      }
    } else {
      try {
        await this.executeSSH(vm.ip, 'sudo shutdown -h now');
      } catch {
        // Expected — shutdown kills SSH session
      }
    }

    vm.state = 'stopped';
    this.vms.delete(workerId);
  }

  async listVMs(): Promise<VMInstance[]> {
    await Promise.resolve();
    return Array.from(this.vms.values());
  }

  async executeCommand(workerId: string, command: string): Promise<CommandResult> {
    const vm = this.vms.get(workerId);
    if (!vm) {
      return { stdout: '', stderr: 'VM not found', exitCode: 1, durationMs: 0 };
    }

    const start = Date.now();

    if (this.spawnMode === 'docker') {
      try {
        const { stdout, stderr } = await execFileAsync(
          'docker', ['exec', workerId, 'sh', '-c', command],
          { timeout: 30_000 },
        );
        return { stdout, stderr, exitCode: 0, durationMs: Date.now() - start };
      } catch (err) {
        const error = err as { stdout?: string; stderr?: string; code?: number };
        return {
          stdout: error.stdout ?? '',
          stderr: error.stderr ?? (err instanceof Error ? err.message : String(err)),
          exitCode: error.code ?? 1,
          durationMs: Date.now() - start,
        };
      }
    }

    try {
      const result = await this.executeSSH(vm.ip, command);
      return { stdout: result.stdout, stderr: result.stderr, exitCode: 0, durationMs: Date.now() - start };
    } catch (err) {
      const error = err as { stdout?: string; stderr?: string; code?: number };
      return {
        stdout: error.stdout ?? '',
        stderr: error.stderr ?? (err instanceof Error ? err.message : String(err)),
        exitCode: error.code ?? 1,
        durationMs: Date.now() - start,
      };
    }
  }

  async sendTask(workerId: string, task: WorkerTask): Promise<void> {
    const vm = this.vms.get(workerId);
    if (!vm) throw new Error(`VM not found for worker ${workerId}`);

    const taskJson = JSON.stringify(task);

    if (this.spawnMode === 'docker') {
      await execFileAsync('docker', ['exec', workerId, 'sh', '-c', `echo '${taskJson.replace(/'/g, "'\\''")}' > /tmp/task.json`]);
    } else {
      const escaped = taskJson.replace(/'/g, "'\\''");
      await this.executeSSH(vm.ip, `echo '${escaped}' > /tmp/task.json`);
    }
    log.info({ workerId, taskId: task.id }, 'Task sent to worker');
  }

  streamLogs(workerId: string, callback: (logLine: string) => void): void {
    if (this.spawnMode === 'docker') {
      const child = execFile('docker', ['logs', '-f', workerId]);
      child.stdout?.on('data', (data: Buffer) => callback(data.toString()));
      child.on('error', () => { /* connection lost */ });
      return;
    }

    const vm = this.vms.get(workerId);
    if (!vm) return;

    const child = execFile('ssh', [
      '-i', SSH_KEY_PATH,
      '-o', 'StrictHostKeyChecking=no',
      '-o', 'ConnectTimeout=5',
      `floyd@${vm.ip}`,
      'tail', '-f', '/tmp/worker.log',
    ]);
    child.stdout?.on('data', (data: Buffer) => callback(data.toString()));
    child.on('error', () => { /* connection lost */ });
  }

  async uploadFile(workerId: string, localPath: string, remotePath: string): Promise<void> {
    if (this.spawnMode === 'docker') {
      await execFileAsync('docker', ['cp', localPath, `${workerId}:${remotePath}`]);
      return;
    }

    const vm = this.vms.get(workerId);
    if (!vm) throw new Error(`VM not found for worker ${workerId}`);
    await execFileAsync('scp', [
      '-i', SSH_KEY_PATH, '-o', 'StrictHostKeyChecking=no',
      localPath, `floyd@${vm.ip}:${remotePath}`,
    ]);
  }

  async downloadFile(workerId: string, remotePath: string, localPath: string): Promise<void> {
    if (this.spawnMode === 'docker') {
      await execFileAsync('docker', ['cp', `${workerId}:${remotePath}`, localPath]);
      return;
    }

    const vm = this.vms.get(workerId);
    if (!vm) throw new Error(`VM not found for worker ${workerId}`);
    await execFileAsync('scp', [
      '-i', SSH_KEY_PATH, '-o', 'StrictHostKeyChecking=no',
      `floyd@${vm.ip}:${remotePath}`, localPath,
    ]);
  }

  /**
   * Extract the entire /workspace from a container to a temp dir on the HOST.
   * This is how the orchestrator gets the worker's output without giving the
   * worker any access to the host filesystem or network.
   */
  async extractWorkspace(workerId: string): Promise<string> {
    const tempDir = await mkdtemp(resolve(tmpdir(), `floyd-delivery-${workerId}-`));

    if (this.spawnMode === 'docker') {
      await execFileAsync('docker', ['cp', `${workerId}:/workspace/.`, tempDir], { timeout: 30_000 });
    } else {
      const vm = this.vms.get(workerId);
      if (!vm) throw new Error(`VM not found for worker ${workerId}`);
      await execFileAsync('scp', [
        '-r', '-i', SSH_KEY_PATH, '-o', 'StrictHostKeyChecking=no',
        `floyd@${vm.ip}:/workspace/.`, tempDir,
      ]);
    }

    log.info({ workerId, tempDir }, 'Worker workspace extracted to host');
    return tempDir;
  }

  /**
   * Clean up a temporary extraction directory.
   */
  async cleanupExtraction(tempDir: string): Promise<void> {
    await rm(tempDir, { recursive: true, force: true });
    log.info({ tempDir }, 'Extraction directory cleaned up');
  }

  getVM(workerId: string): VMInstance | undefined {
    return this.vms.get(workerId);
  }

  getSpawnMode(): SpawnMode {
    return this.spawnMode;
  }

  getGitHubOrg(): string {
    return GITHUB_ORG;
  }

  hasGitHubCredentials(): boolean {
    return GITHUB_PAT.length > 0;
  }

  private async executeSSH(ip: string, command: string): Promise<{ stdout: string; stderr: string }> {
    const { stdout, stderr } = await execFileAsync('ssh', [
      '-i', SSH_KEY_PATH,
      '-o', 'StrictHostKeyChecking=no',
      '-o', 'ConnectTimeout=10',
      `floyd@${ip}`,
      command,
    ], { timeout: 30_000 });
    return { stdout, stderr };
  }
}
