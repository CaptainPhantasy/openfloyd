const PORT = process.env['PORT'] ?? '3000';

async function healthcheck(): Promise<void> {
  try {
    const response = await fetch(`http://localhost:${PORT}/health`, {
      signal: AbortSignal.timeout(5_000),
    });
    process.exit(response.ok ? 0 : 1);
  } catch {
    process.exit(1);
  }
}

healthcheck().catch(() => process.exit(1));
