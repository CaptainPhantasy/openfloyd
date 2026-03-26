import { createLogger } from '../utils/logger.js';

const log = createLogger('embedding-service');

const DEFAULT_DIMENSIONS = 1536;

export class EmbeddingService {
  private apiKey: string;
  private baseUrl: string;
  private model: string;
  private dimensions: number;

  constructor(config: { apiKey: string; baseUrl?: string; model?: string; dimensions?: number }) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl ?? 'https://api.z.ai/api/paas/v4';
    this.model = config.model ?? 'embedding-3';
    this.dimensions = config.dimensions ?? DEFAULT_DIMENSIONS;
    log.info({ model: this.model, dimensions: this.dimensions }, 'Embedding service initialized');
  }

  async embed(text: string): Promise<Float32Array> {
    const response = await fetch(`${this.baseUrl}/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        input: text,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Embedding API error ${response.status}: ${errText}`);
    }

    const data = await response.json() as {
      data: Array<{ embedding: number[] }>;
      usage: { prompt_tokens: number; total_tokens: number };
    };

    if (!data.data[0]?.embedding) {
      throw new Error('No embedding returned from API');
    }

    return new Float32Array(data.data[0].embedding);
  }

  async embedBatch(texts: string[]): Promise<Float32Array[]> {
    const results: Float32Array[] = [];

    // Batch in groups of 20 (typical API limit)
    for (let i = 0; i < texts.length; i += 20) {
      const batch = texts.slice(i, i + 20);

      const response = await fetch(`${this.baseUrl}/embeddings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          input: batch,
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Embedding batch API error ${response.status}: ${errText}`);
      }

      const data = await response.json() as {
        data: Array<{ embedding: number[]; index: number }>;
      };

      // Sort by index to maintain order
      const sorted = data.data.sort((a, b) => a.index - b.index);
      for (const item of sorted) {
        results.push(new Float32Array(item.embedding));
      }
    }

    return results;
  }

  getDimensions(): number {
    return this.dimensions;
  }
}
