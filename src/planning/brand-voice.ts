import { readFile, writeFile } from 'node:fs/promises';
import { createLogger } from '../utils/logger.js';
import type { Brand, VoiceValidation } from '../types/index.js';
import type { LLMRouterFn } from './planner.js';
import { TaskType } from '../types/index.js';

const log = createLogger('brand-voice');

/**
 * BrandVoiceManager stores brand voice definitions persistently in a JSON file.
 * When a brand is not yet defined, it generates inquiry questions so the agent
 * can ask the user about their desired voice. Once informed, the voice data is
 * saved to the persistent store.
 */
export class BrandVoiceManager {
  private brands = new Map<string, Brand>();
  private filePath: string;
  private routerFn: LLMRouterFn | null = null;

  constructor(filePath: string) {
    this.filePath = filePath;
  }

  setRouter(fn: LLMRouterFn): void {
    this.routerFn = fn;
  }

  async loadBrands(): Promise<void> {
    try {
      const data = await readFile(this.filePath, 'utf-8');
      const parsed = JSON.parse(data) as Brand[];
      for (const brand of parsed) {
        this.brands.set(brand.id, brand);
      }
      log.info({ count: this.brands.size }, 'Brands loaded');
    } catch {
      log.info('No existing brands file — starting fresh');
    }
  }

  async saveBrands(): Promise<void> {
    const data = Array.from(this.brands.values());
    await writeFile(this.filePath, JSON.stringify(data, null, 2), 'utf-8');
    log.info({ count: data.length }, 'Brands saved');
  }

  getBrand(id: string): Brand | undefined {
    return this.brands.get(id);
  }

  getAllBrands(): Brand[] {
    return Array.from(this.brands.values());
  }

  /**
   * Register a new brand voice. This is called after the agent has inquired
   * and the user has provided their desired brand voicing.
   */
  async registerBrand(brand: Brand): Promise<void> {
    this.brands.set(brand.id, brand);
    await this.saveBrands();
    log.info({ brandId: brand.id, name: brand.name }, 'Brand registered');
  }

  /**
   * Generate inquiry questions to ask the user about their brand voice.
   * The agent should present these to the user and use the answers to
   * build a Brand definition via registerBrand().
   */
  generateBrandInquiry(brandName: string): string[] {
    return [
      `What tone should ${brandName} use? (e.g., professional, casual, authoritative, friendly, playful)`,
      `What vocabulary style fits ${brandName}? (e.g., technical, simple, academic, conversational)`,
      `Describe the writing style for ${brandName} (e.g., concise and direct, detailed and thorough, storytelling)`,
      `Are there any words or phrases ${brandName} should AVOID?`,
      `Are there any preferred phrases or taglines for ${brandName}?`,
      `Can you provide 1-2 example sentences that capture ${brandName}'s voice?`,
      `What are ${brandName}'s brand colors? (primary, secondary, accent — hex codes preferred)`,
    ];
  }

  /**
   * Build a Brand object from user-provided answers to the inquiry questions.
   */
  buildBrandFromAnswers(id: string, name: string, answers: {
    tone: string;
    vocabulary: string;
    style: string;
    avoidWords?: string[];
    preferredPhrases?: string[];
    examples?: string[];
    colors?: { primary: string; secondary: string; accent: string };
  }): Brand {
    return {
      id,
      name,
      voice: {
        tone: answers.tone,
        vocabulary: answers.vocabulary,
        style: answers.style,
        avoidWords: answers.avoidWords,
        preferredPhrases: answers.preferredPhrases,
        examples: answers.examples,
      },
      colors: answers.colors,
    };
  }

  async applyVoice(content: string, brandId: string): Promise<string> {
    const brand = this.brands.get(brandId);
    if (!brand) {
      log.warn({ brandId }, 'Brand not found — returning original content');
      return content;
    }

    if (!this.routerFn) {
      return content;
    }

    try {
      const response = await this.routerFn({
        taskType: TaskType.MARKETING,
        messages: [
          {
            role: 'system',
            content: `You are a brand voice editor. Rewrite the following content to match this brand voice:
Tone: ${brand.voice.tone}
Vocabulary: ${brand.voice.vocabulary}
Style: ${brand.voice.style}
${brand.voice.avoidWords ? `Avoid these words: ${brand.voice.avoidWords.join(', ')}` : ''}
${brand.voice.preferredPhrases ? `Preferred phrases: ${brand.voice.preferredPhrases.join(', ')}` : ''}
${brand.voice.examples ? `Examples of the voice:\n${brand.voice.examples.join('\n')}` : ''}

Return ONLY the rewritten content, nothing else.`,
          },
          { role: 'user', content },
        ],
        maxTokens: 2048,
      });
      return response.content;
    } catch (err) {
      log.error({ err, brandId }, 'Failed to apply voice');
      return content;
    }
  }

  async generateContent(prompt: string, brandId: string): Promise<string> {
    const brand = this.brands.get(brandId);
    if (!brand) {
      throw new Error(`Brand not found: ${brandId}`);
    }

    if (!this.routerFn) {
      throw new Error('LLM router not configured');
    }

    const response = await this.routerFn({
      taskType: TaskType.MARKETING,
      messages: [
        {
          role: 'system',
          content: `You are a content creator for the brand "${brand.name}".
Voice: Tone=${brand.voice.tone}, Vocabulary=${brand.voice.vocabulary}, Style=${brand.voice.style}
${brand.voice.preferredPhrases ? `Use phrases like: ${brand.voice.preferredPhrases.join(', ')}` : ''}
${brand.voice.avoidWords ? `Never use: ${brand.voice.avoidWords.join(', ')}` : ''}`,
        },
        { role: 'user', content: prompt },
      ],
      maxTokens: 2048,
    });

    return response.content;
  }

  validateVoice(content: string, brandId: string): VoiceValidation {
    const brand = this.brands.get(brandId);
    if (!brand) {
      return { isValid: false, score: 0, issues: [{ type: 'error', description: 'Brand not found', suggestion: 'Register the brand first' }] };
    }

    const issues: VoiceValidation['issues'] = [];
    let score = 1.0;

    // Check for avoided words
    if (brand.voice.avoidWords) {
      for (const word of brand.voice.avoidWords) {
        if (content.toLowerCase().includes(word.toLowerCase())) {
          issues.push({
            type: 'avoid_word',
            description: `Contains avoided word: "${word}"`,
            suggestion: `Remove or replace "${word}"`,
          });
          score -= 0.1;
        }
      }
    }

    // Check for preferred phrases (bonus)
    if (brand.voice.preferredPhrases) {
      const found = brand.voice.preferredPhrases.filter((p) =>
        content.toLowerCase().includes(p.toLowerCase()),
      );
      if (found.length > 0) {
        score = Math.min(1.0, score + found.length * 0.05);
      }
    }

    score = Math.max(0, Math.min(1.0, score));

    return {
      isValid: score >= 0.7 && issues.length === 0,
      score,
      issues,
    };
  }
}
