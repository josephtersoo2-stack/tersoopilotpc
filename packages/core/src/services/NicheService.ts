import crypto from 'node:crypto';

import {
  Niche as NicheSchema,
  NicheCreateInput as NicheCreateInputSchema,
  NicheUpdateInput as NicheUpdateInputSchema,
  type Niche,
  type NicheCreateInput,
  type NicheUpdateInput,
} from '@tersoo/contracts';

import type { Repos } from '../persistence/repos';
import { TersooError } from '../util/errors';

export interface NicheServiceDeps {
  repos: Repos;
}

export class NicheService {
  constructor(private readonly deps: NicheServiceDeps) {}

  private mapRowToNiche(row: {
    id: string;
    name: string;
    description: string;
    keywords: string;
    seed_urls: string;
    tags: string;
    created_at: number;
    updated_at: number;
  }): Niche {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      keywords: JSON.parse(row.keywords || '[]') as string[],
      seedUrls: JSON.parse(row.seed_urls || '[]') as string[],
      tags: JSON.parse(row.tags || '[]') as string[],
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async list(): Promise<Niche[]> {
    let rows = await this.deps.repos.niches.list();
    if (rows.length === 0) {
      await this.seedDefaults();
      rows = await this.deps.repos.niches.list();
    }
    return rows.map((r) => this.mapRowToNiche(r));
  }

  async getById(id: string): Promise<Niche | null> {
    const row = await this.deps.repos.niches.getById(id);
    if (!row) return null;
    return this.mapRowToNiche(row);
  }

  async create(input: NicheCreateInput | unknown): Promise<Niche> {
    const parsed = NicheCreateInputSchema.parse(input);
    const now = Date.now();
    const id = crypto.randomUUID();

    const row = {
      id,
      name: parsed.name,
      description: parsed.description ?? '',
      keywords: JSON.stringify(parsed.keywords ?? []),
      seed_urls: JSON.stringify(parsed.seedUrls ?? []),
      tags: JSON.stringify(parsed.tags ?? []),
      created_at: now,
      updated_at: now,
    };

    await this.deps.repos.niches.create(row);
    return this.mapRowToNiche(row);
  }

  async update(input: NicheUpdateInput | unknown): Promise<Niche> {
    const parsed = NicheUpdateInputSchema.parse(input);
    const existing = await this.deps.repos.niches.getById(parsed.id);
    if (!existing) {
      throw new TersooError('INTERNAL', `Niche '${parsed.id}' not found`);
    }

    const now = Date.now();
    const patch: Record<string, unknown> = { updated_at: now };
    if (parsed.name !== undefined) patch.name = parsed.name;
    if (parsed.description !== undefined) patch.description = parsed.description;
    if (parsed.keywords !== undefined) patch.keywords = JSON.stringify(parsed.keywords);
    if (parsed.seedUrls !== undefined) patch.seed_urls = JSON.stringify(parsed.seedUrls);
    if (parsed.tags !== undefined) patch.tags = JSON.stringify(parsed.tags);

    await this.deps.repos.niches.update(parsed.id, patch);
    const updated = await this.deps.repos.niches.getById(parsed.id);
    return this.mapRowToNiche(updated!);
  }

  async delete(id: string): Promise<void> {
    await this.deps.repos.niches.delete(id);
  }

  private async seedDefaults(): Promise<void> {
    const now = Date.now();
    const defaults = [
      {
        id: crypto.randomUUID(),
        name: 'Simulation & Driving Games',
        description: 'Vehicular simulation, bus routes, realistic coach driving, and simulation gameplay.',
        keywords: JSON.stringify([
          'This 249 KM Bus Journey Was INSANE! 🔥 | Bus Simulator Coach Master Gameplay',
          'Bus Simulator Coach Master 2026',
          'Euro Truck Simulator 2 realistic driving',
          'City Bus Simulator route challenge',
          'Heavy highway bus coach simulation',
        ]),
        seed_urls: JSON.stringify([
          'https://www.youtube.com',
          'https://store.steampowered.com',
          'https://reddit.com/r/trucksim',
        ]),
        tags: JSON.stringify(['gaming', 'simulation', 'bus']),
        created_at: now,
        updated_at: now,
      },
      {
        id: crypto.randomUUID(),
        name: 'Tech & Hardware Reviews',
        description: 'Consumer electronics, PC builds, smartphone comparisons, and gadget unboxings.',
        keywords: JSON.stringify([
          'Best Mechanical Keyboards 2026',
          'Top budget gaming monitor',
          'Next gen smartphone speed test',
          'Desk setup productivity gadgets',
        ]),
        seed_urls: JSON.stringify([
          'https://www.youtube.com',
          'https://theverge.com',
          'https://reddit.com/r/gadgets',
        ]),
        tags: JSON.stringify(['tech', 'gadgets', 'reviews']),
        created_at: now,
        updated_at: now,
      },
      {
        id: crypto.randomUUID(),
        name: 'Smart Shopping & Lifestyle',
        description: 'Trending products, reviews, unboxings, and consumer lifehacks.',
        keywords: JSON.stringify([
          'Must have home gadgets 2026',
          'Amazon hidden gems you need',
          'Best wireless noise cancelling headphones',
        ]),
        seed_urls: JSON.stringify([
          'https://www.youtube.com',
          'https://amazon.com',
        ]),
        tags: JSON.stringify(['shopping', 'lifestyle']),
        created_at: now,
        updated_at: now,
      },
    ];

    for (const d of defaults) {
      await this.deps.repos.niches.create(d).catch(() => {});
    }
  }
}
