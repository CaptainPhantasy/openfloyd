import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createLogger } from '../utils/logger.js';
import type { VibeBoxBridge } from './vibebox-bridge.js';

const execFileAsync = promisify(execFile);
const log = createLogger('delivery-service');

const GITHUB_ORG = process.env['GITHUB_ORG'] ?? 'LegacyAI-FloydsLabs';
const GITHUB_PAT = process.env['GITHUB_PAT'] ?? '';

/**
 * HOST-SIDE DELIVERY SERVICE
 *
 * This service runs on the host machine — never inside a container.
 * It holds the GitHub credentials and executes all git operations.
 *
 * Flow:
 * 1. Worker finishes building code inside its sandbox
 * 2. Orchestrator calls extractWorkspace() to copy files from container to host temp dir
 * 3. Orchestrator calls this service to commit + push from the HOST
 * 4. Credentials never enter the container
 */
export class DeliveryService {
  private bridge: VibeBoxBridge;

  constructor(bridge: VibeBoxBridge) {
    this.bridge = bridge;
  }

  /**
   * Push worker output to an existing repo as a new branch.
   * All git operations happen on the HOST using host-held credentials.
   */
  async pushToExistingRepo(
    workerId: string,
    repoUrl: string,
    branchName: string,
    commitMessage: string,
  ): Promise<{ branch: string; commitSha: string; tempDir: string }> {
    if (!GITHUB_PAT) throw new Error('GITHUB_PAT not configured on host');

    log.info({ workerId, repoUrl, branchName }, 'Starting host-side delivery to existing repo');

    // Step 1: Extract workspace from container to host
    const tempDir = await this.bridge.extractWorkspace(workerId);

    try {
      // Step 2: Init git, commit (on HOST)
      await this.execGit(tempDir, ['init']);
      await this.execGit(tempDir, ['checkout', '-b', branchName]);
      await this.execGit(tempDir, ['add', '-A']);
      await this.execGit(tempDir, ['commit', '-m', commitMessage]);

      // Step 3: Add remote with HOST credentials and push (on HOST)
      const authedUrl = repoUrl.replace(
        'https://github.com/',
        `https://x-access-token:${GITHUB_PAT}@github.com/`,
      );
      await this.execGit(tempDir, ['remote', 'add', 'origin', authedUrl]);
      await this.execGit(tempDir, ['push', '-u', 'origin', branchName]);

      // Step 4: Get commit SHA
      const sha = await this.execGit(tempDir, ['rev-parse', 'HEAD']);

      const commitSha = sha.stdout.trim();
      log.info({ workerId, branch: branchName, commitSha }, 'Pushed to existing repo from host');
      return { branch: branchName, commitSha, tempDir };
    } catch (err) {
      // Clean up on failure
      await this.bridge.cleanupExtraction(tempDir);
      throw err;
    }
  }

  /**
   * Create a new repo in the GitHub org and push worker output.
   * ONLY called after explicit owner approval.
   * All operations happen on the HOST.
   */
  async createAndPushNewRepo(
    workerId: string,
    repoName: string,
    description: string,
    isPrivate: boolean,
  ): Promise<{ repoUrl: string; commitSha: string; tempDir: string }> {
    if (!GITHUB_PAT) throw new Error('GITHUB_PAT not configured on host');

    log.info({ workerId, repoName, org: GITHUB_ORG, private: isPrivate }, 'Creating new repo from host (owner-approved)');

    // Step 1: Create repo via GitHub API (from HOST)
    const { stdout: createOut } = await execFileAsync('curl', [
      '-sf', '-X', 'POST',
      '-H', `Authorization: token ${GITHUB_PAT}`,
      '-H', 'Content-Type: application/json',
      '-d', JSON.stringify({ name: repoName, description, private: isPrivate, auto_init: false }),
      `https://api.github.com/orgs/${GITHUB_ORG}/repos`,
    ], { timeout: 15_000 });

    log.info({ repoName, response: createOut.substring(0, 200) }, 'Repo creation API response');

    // Step 2: Extract workspace from container to host
    const tempDir = await this.bridge.extractWorkspace(workerId);

    try {
      // Step 3: Init, commit, push (on HOST)
      await this.execGit(tempDir, ['init']);
      await this.execGit(tempDir, ['add', '-A']);
      await this.execGit(tempDir, ['commit', '-m', 'feat: initial commit from OPEN-FLOYD']);

      const repoUrl = `https://github.com/${GITHUB_ORG}/${repoName}`;
      const authedUrl = `https://x-access-token:${GITHUB_PAT}@github.com/${GITHUB_ORG}/${repoName}.git`;
      await this.execGit(tempDir, ['remote', 'add', 'origin', authedUrl]);
      await this.execGit(tempDir, ['push', '-u', 'origin', 'main']);

      const sha = await this.execGit(tempDir, ['rev-parse', 'HEAD']);
      const commitSha = sha.stdout.trim();

      log.info({ workerId, repoUrl, commitSha }, 'New repo created and pushed from host');
      return { repoUrl, commitSha, tempDir };
    } catch (err) {
      await this.bridge.cleanupExtraction(tempDir);
      throw err;
    }
  }

  /**
   * Clean up after delivery. Call this after confirming push succeeded.
   */
  async cleanup(tempDir: string): Promise<void> {
    await this.bridge.cleanupExtraction(tempDir);
  }

  hasCredentials(): boolean {
    return GITHUB_PAT.length > 0;
  }

  getOrg(): string {
    return GITHUB_ORG;
  }

  private async execGit(cwd: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
    const { stdout, stderr } = await execFileAsync('git', args, {
      cwd,
      timeout: 30_000,
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: 'OPEN-FLOYD',
        GIT_AUTHOR_EMAIL: 'floyd@floyds-labs.com',
        GIT_COMMITTER_NAME: 'OPEN-FLOYD',
        GIT_COMMITTER_EMAIL: 'floyd@floyds-labs.com',
      },
    });
    return { stdout, stderr };
  }
}
