import crypto from 'node:crypto';

import {
  TaskTemplate as TaskTemplateSchema,
  TemplateCreateInput as TemplateCreateInputSchema,
  TemplateUpdateInput as TemplateUpdateInputSchema,
  TemplateInstantiateInput as TemplateInstantiateInputSchema,
  type TaskDetail,
  type TaskTemplate,
  type TemplateCreateInput,
  type TemplateUpdateInput,
  type TemplateInstantiateInput,
  type Workflow,
} from '@tersoo/contracts';

import type { Repos } from '../persistence/repos';
import type { TaskService } from './TaskService';
import { WorkflowValidator } from '../task/WorkflowValidator';
import { TaskError, TersooError } from '../util/errors';

export interface TemplateServiceDeps {
  repos: Repos;
  tasks?: TaskService;
}

export class TemplateService {
  constructor(private readonly deps: TemplateServiceDeps) {}

  async list(category?: string): Promise<TaskTemplate[]> {
    // Ensure built-in templates are seeded on initial query
    await this.ensureBuiltinTemplates();
    const rows = await this.deps.repos.templates.list(category);
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      category: row.category as any,
      description: row.description,
      definition: JSON.parse(row.definition) as Workflow,
      isBuiltin: Boolean(row.is_builtin),
      tags: JSON.parse(row.tags || '[]') as string[],
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  async getById(id: string): Promise<TaskTemplate | null> {
    const row = await this.deps.repos.templates.getById(id);
    if (!row) return null;
    return {
      id: row.id,
      name: row.name,
      category: row.category as any,
      description: row.description,
      definition: JSON.parse(row.definition) as Workflow,
      isBuiltin: Boolean(row.is_builtin),
      tags: JSON.parse(row.tags || '[]') as string[],
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async create(input: TemplateCreateInput | unknown): Promise<TaskTemplate> {
    const parsed = TemplateCreateInputSchema.parse(input);
    WorkflowValidator.validate(parsed.definition);

    const now = Date.now();
    const id = crypto.randomUUID();
    const row = {
      id,
      name: parsed.name,
      category: parsed.category,
      description: parsed.description,
      definition: JSON.stringify(parsed.definition),
      is_builtin: 0,
      tags: JSON.stringify(parsed.tags ?? []),
      created_at: now,
      updated_at: now,
    };

    await this.deps.repos.templates.create(row);

    return {
      id,
      name: parsed.name,
      category: parsed.category,
      description: parsed.description,
      definition: parsed.definition,
      isBuiltin: false,
      tags: parsed.tags ?? [],
      createdAt: now,
      updatedAt: now,
    };
  }

  async update(input: TemplateUpdateInput | unknown): Promise<TaskTemplate> {
    const parsed = TemplateUpdateInputSchema.parse(input);
    const existing = await this.deps.repos.templates.getById(parsed.id);
    if (!existing) {
      throw new TersooError('INTERNAL', `Task template ${parsed.id} not found`);
    }

    if (parsed.definition) {
      WorkflowValidator.validate(parsed.definition);
    }

    const now = Date.now();
    const patch: Record<string, unknown> = { updated_at: now };
    if (parsed.name !== undefined) patch.name = parsed.name;
    if (parsed.category !== undefined) patch.category = parsed.category;
    if (parsed.description !== undefined) patch.description = parsed.description;
    if (parsed.definition !== undefined) patch.definition = JSON.stringify(parsed.definition);
    if (parsed.tags !== undefined) patch.tags = JSON.stringify(parsed.tags);

    await this.deps.repos.templates.update(parsed.id, patch);

    const updated = await this.getById(parsed.id);
    if (!updated) {
      throw new TersooError('INTERNAL', 'Failed to retrieve updated template');
    }
    return updated;
  }

  async delete(id: string): Promise<void> {
    const existing = await this.deps.repos.templates.getById(id);
    if (!existing) return;
    if (existing.is_builtin) {
      throw new TersooError('POLICY_VIOLATION', 'Built-in system templates cannot be deleted.');
    }
    await this.deps.repos.templates.delete(id);
  }

  /**
   * Instantiates a template into a customized executable Task.
   */
  async instantiate(input: TemplateInstantiateInput | unknown): Promise<TaskDetail> {
    if (!this.deps.tasks) {
      throw new TersooError('INTERNAL', 'TaskService not provided to TemplateService');
    }
    const parsed = TemplateInstantiateInputSchema.parse(input);
    const template = await this.getById(parsed.templateId);
    if (!template) {
      throw new TersooError('INTERNAL', `Template ${parsed.templateId} not found`);
    }

    // Clone workflow definition
    const workflow: Workflow = JSON.parse(JSON.stringify(template.definition));
    workflow.name = parsed.taskName;

    // Merge custom/randomized variables
    if (parsed.variables) {
      workflow.variables = {
        ...workflow.variables,
        ...parsed.variables,
      };
    }

    // Apply action probabilities if requested
    if (parsed.actionProbabilities && Object.keys(parsed.actionProbabilities).length > 0) {
      for (const step of workflow.steps) {
        if (step.type === 'engage' && step.action && step.action in parsed.actionProbabilities) {
          step.probability = parsed.actionProbabilities[step.action];
        }
      }
    }

    // Create concrete Task in database
    return this.deps.tasks.create({
      name: parsed.taskName,
      tags: [...template.tags, template.category],
      definition: workflow,
    });
  }

  /**
   * Seeds default system templates if table is empty.
   */
  async ensureBuiltinTemplates(): Promise<void> {
    const now = Date.now();
    const builtins: Array<{
      id: string;
      name: string;
      category: string;
      description: string;
      tags: string[];
      workflow: Workflow;
    }> = [
      {
        id: 'tpl-youtube-dual-video-engagement',
        name: 'YouTube Dual-Video Authentic Engagement',
        category: 'youtube',
        description:
          'Watches 2 videos with anti-live/shorts protection, expands and micro-scrolls descriptions, performs visual like/subscribe clicks, and types persona comments.',
        tags: ['youtube', 'video', 'dual-video', 'engagement', 'anti-detection'],
        workflow: {
          schemaVersion: 1,
          name: 'YouTube Dual-Video Authentic Engagement',
          variables: {
            videoTopic: [
              'elden ring boss fight gameplay',
              'cyberpunk 2077 phantom liberty gameplay',
              'gta 5 funny moments stunts',
              'red dead redemption 2 secrets',
            ] as any,
            customComment: '{Awesome|Incredible|Masterclass} gameplay! {Really enjoyed|Loved} the {combat flow|boss fight|skills}, {great content|keep it up|subscribed}!',
            secondVideoTopic: [
              'minecraft epic builds timelapse',
              'forza horizon 5 drift gameplay',
              'baldurs gate 3 best builds',
              'witcher 3 hidden details',
            ] as any,
            secondComment: '{Insane|Truly impressive|Top tier} playthrough, {looking forward to the next episode|this made my day|great editing}!',
            skipAds: 'true',
            autoDismissPopups: 'true',
          },
          steps: [
            {
              type: 'llm',
              goal: "Navigate to https://www.google.com. On Google, locate search bar, type 'youtube', press Enter. Click official YouTube link. Confirm YouTube has loaded.",
              maxIterations: 15,
            },
            {
              type: 'llm',
              goal: "On YouTube, locate search box, type '{{videoTopic}}', and search. Locate a standard video thumbnail/title (STRICTLY AVOIDING any live streams or shorts) and click to start playback.",
              maxIterations: 15,
            },
            {
              type: 'llm',
              goal: "Verify video is playing. Skip any ads if possible. Watch playback for 20-30 seconds, then return done.",
              maxIterations: 20,
            },
            { type: 'engage', action: 'read_description', optional: true, timeoutMs: 20000, probability: 0.75 },
            { type: 'sleep', minMs: 1200, maxMs: 2000 },
            { type: 'engage', action: 'like', optional: true, timeoutMs: 10000, probability: 0.85 },
            { type: 'sleep', minMs: 1500, maxMs: 2500 },
            { type: 'engage', action: 'subscribe', optional: true, timeoutMs: 10000, probability: 0.45 },
            { type: 'sleep', minMs: 1500, maxMs: 2500 },
            { type: 'engage', action: 'comment', commentText: '{{customComment}}', optional: true, timeoutMs: 15000, probability: 0.35 },
            { type: 'sleep', minMs: 2500, maxMs: 4000 },
            {
              type: 'llm',
              goal: "On YouTube, locate search box, type '{{secondVideoTopic}}', and search. Locate a standard video thumbnail/title (STRICTLY AVOIDING live streams or shorts) and click to start playback.",
              maxIterations: 15,
            },
            {
              type: 'llm',
              goal: "Verify video is playing. Skip any ads if possible. Watch playback for 20-30 seconds, then return done.",
              maxIterations: 20,
            },
            { type: 'engage', action: 'read_description', optional: true, timeoutMs: 20000, probability: 0.70 },
            { type: 'sleep', minMs: 1200, maxMs: 2000 },
            { type: 'engage', action: 'like', optional: true, timeoutMs: 10000, probability: 0.80 },
            { type: 'sleep', minMs: 1500, maxMs: 2500 },
            { type: 'engage', action: 'subscribe', optional: true, timeoutMs: 10000, probability: 0.40 },
            { type: 'sleep', minMs: 1500, maxMs: 2500 },
            { type: 'engage', action: 'comment', commentText: '{{secondComment}}', optional: true, timeoutMs: 15000, probability: 0.30 },
            { type: 'sleep', minMs: 2000, maxMs: 3500 },
            { type: 'screenshot', name: 'youtube-dual-video-verified' },
          ],
        },
      },
      {
        id: 'tpl-cookie-warmer-trust-builder',
        name: 'Cookie Warmer & Trust Builder',
        category: 'warming',
        description:
          'Visits high-authority global websites (Wikipedia, BBC, Reddit, Yahoo) with natural scrolls to build organic cookies, IndexedDB, and browser trust history.',
        tags: ['warming', 'cookies', 'trust', 'fingerprint', 'stealth'],
        workflow: {
          schemaVersion: 1,
          name: 'Cookie Warmer & Trust Builder',
          variables: {
            autoDismissPopups: 'true',
          },
          steps: [
            {
              type: 'navigate',
              url: 'https://en.wikipedia.org/wiki/Special:Random',
              allowedHosts: ['wikipedia.org', 'en.wikipedia.org'],
              waitUntil: 'domcontentloaded',
              timeoutMs: 35000,
              aiRecovery: true,
              goal: 'Navigate to random Wikipedia article and establish initial browsing cookies',
            },
            { type: 'scroll', direction: 'down', amount: 500, kinetic: true },
            { type: 'sleep', minMs: 4000, maxMs: 7000 },
            {
              type: 'navigate',
              url: 'https://www.bbc.com/news',
              allowedHosts: ['bbc.com', 'www.bbc.com'],
              waitUntil: 'domcontentloaded',
              timeoutMs: 35000,
              aiRecovery: true,
              goal: 'Visit BBC news and accept consent cookies',
            },
            { type: 'scroll', direction: 'down', amount: 650, kinetic: true },
            { type: 'sleep', minMs: 4500, maxMs: 8000 },
            {
              type: 'navigate',
              url: 'https://www.reddit.com/r/technology/',
              allowedHosts: ['reddit.com', 'www.reddit.com'],
              waitUntil: 'domcontentloaded',
              timeoutMs: 35000,
              aiRecovery: true,
              goal: 'Visit Reddit community and build social session cookies',
            },
            { type: 'scroll', direction: 'down', amount: 600, kinetic: true },
            { type: 'sleep', minMs: 4000, maxMs: 7500 },
            { type: 'screenshot', name: 'cookie-warming-complete' },
          ],
        },
      },
      {
        id: 'tpl-google-organic-search-ctr',
        name: 'Google Organic Search & Multi-Result Explorer',
        category: 'seo',
        description:
          'Runs a repeating organic-search cycle: searches a keyword, reads the results page naturally, opens a randomly chosen organic result, reads the destination, returns to the results page, then searches a different keyword and repeats.',
        tags: ['seo', 'google', 'ctr', 'search', 'organic', 'multi-visit'],
        workflow: {
          schemaVersion: 1,
          name: 'Google Organic Search & Multi-Result Explorer',
          /**
           * Every knob this template uses is a variable so the same workflow can
           * be retargeted (Bing/DDG) or re-tuned without editing any step.
           *
           * Pool variables expose two reference forms at run time:
           *   {{name}}      one random pick, fixed for the whole run
           *   {{name.pool}} a fresh random pick EVERY time the step runs
           * The `.pool` form is what lets each round search a different keyword
           * and open a different result slot.
           */
          variables: {
            // --- Search engine (single-sourced: change the URL to retarget) ---
            searchEngineUrl: 'https://www.google.com',

            // --- How many full search→read→return cycles to run ---
            serpRounds: '3',

            // --- Keyword pool: a new keyword is drawn on every round ---
            searchQuery: [
              'best mechanical keyboard 2024',
              'top productivity tools for developers',
              'ergonomic office desk setup guide',
              'nextjs vs remix performance comparison',
              'how to improve focus while working from home',
              'quietest mechanical keyboard switches',
            ],

            // --- Which organic result to open (0 = first blue link) ---
            resultSlot: ['0', '1', '2'],

            // --- Reused goal text for the page-reading judgement call ---
            readPageGoal:
              'Read the page you landed on the way a person would: scroll down through it at a ' +
              'natural pace and take in the content. If the page is a blog post, news article or ' +
              'other long-form piece, and there is an obviously related article, a "Read more", ' +
              '"Related posts" or next-article link, then click one such link and read that ' +
              'briefly as well. Do not sign in, subscribe, or click anything destructive. When you ' +
              'have read enough, finish.',
          },
          steps: [
            {
              type: 'navigate',
              // No allowedHosts here on purpose: it would have to be edited
              // alongside searchEngineUrl, and the profile's own navigation
              // policy already governs where the browser may go.
              url: '{{searchEngineUrl}}',
              waitUntil: 'domcontentloaded',
              timeoutMs: 35000,
              aiRecovery: true,
              goal: 'Load the search engine and dismiss any consent or cookie dialog',
            },
            { type: 'waitFor', selector: 'intent:search_input', timeoutMs: 20000 },
            { type: 'click', selector: 'intent:search_input', humanized: true },
            {
              type: 'type',
              selector: 'intent:search_input',
              text: '{{searchQuery.pool}}',
              humanized: true,
              pressEnter: true,
              clearFirst: true,
            },
            { type: 'waitFor', selector: 'intent:top_result', timeoutMs: 25000 },

            // The cycle. `{{serpRounds}}` sets how long it runs; everything the
            // body touches is re-interpolated per iteration, so the keyword and
            // the result slot differ on every round.
            {
              type: 'repeat',
              times: '{{serpRounds}}',
              label: 'SERP cycle',
              // A single slow or blocked page must not abort the whole run.
              continueOnError: true,
              steps: [
                // --- 1. Read the results page like a person scanning it ---
                { type: 'waitFor', selector: 'intent:top_result', timeoutMs: 25000 },
                { type: 'sleep', minMs: 1800, maxMs: 3200 },
                { type: 'scroll', direction: 'down', amount: 320, kinetic: true },
                { type: 'sleep', minMs: 2200, maxMs: 3800 },
                { type: 'scroll', direction: 'down', amount: 430, kinetic: true },
                { type: 'sleep', minMs: 1800, maxMs: 3200 },
                // Glance back up: readers re-check what they passed.
                { type: 'scroll', direction: 'up', amount: 260, kinetic: true },
                { type: 'sleep', minMs: 1200, maxMs: 2400 },

                // --- 2. Open a random organic result ---
                { type: 'click', selector: 'intent:search_result:{{resultSlot.pool}}', humanized: true },

                // --- 3. Read the destination page ---
                { type: 'sleep', minMs: 6000, maxMs: 11000 },
                { type: 'scroll', direction: 'down', amount: 380, kinetic: true },
                { type: 'sleep', minMs: 4000, maxMs: 7000 },
                { type: 'scroll', direction: 'down', amount: 460, kinetic: true },
                { type: 'sleep', minMs: 3500, maxMs: 6500 },
                { type: 'scroll', direction: 'up', amount: 300, kinetic: true },
                { type: 'sleep', minMs: 1500, maxMs: 3000 },

                // --- 4. Let the model judge the page and follow related content
                //        when it is an article. Optional so an unreadable page
                //        never fails the run.
                {
                  type: 'llm',
                  goal: '{{readPageGoal}}',
                  maxIterations: 8,
                  optional: true,
                },

                // --- 5. Back to the results page ---
                { type: 'goBack', timeoutMs: 30000 },
                { type: 'waitFor', selector: 'intent:search_input', timeoutMs: 25000 },
                { type: 'sleep', minMs: 2000, maxMs: 3500 },

                // --- 6. Back up to the search bar and search something new ---
                { type: 'scroll', direction: 'up', amount: 900, kinetic: true },
                { type: 'sleep', minMs: 1500, maxMs: 2600 },
                { type: 'click', selector: 'intent:search_input', humanized: true },
                {
                  type: 'type',
                  selector: 'intent:search_input',
                  text: '{{searchQuery.pool}}',
                  humanized: true,
                  pressEnter: true,
                  clearFirst: true,
                },
              ],
            },

            { type: 'screenshot', name: 'google-organic-multi-visit-verified' },
          ],
        },
      },
      {
        id: 'tpl-social-media-feed-surf',
        name: 'Social Media Feed Surfer & Reader',
        category: 'social',
        description:
          'Simulates casual social media browsing on public feeds with humanized scrolling, dwell micro-pauses, and reading behavior.',
        tags: ['social', 'twitter', 'reading', 'browsing'],
        workflow: {
          schemaVersion: 1,
          name: 'Social Media Feed Surfer & Reader',
          variables: {
            targetFeedUrl: 'https://news.ycombinator.com',
          },
          steps: [
            {
              type: 'navigate',
              url: '{{targetFeedUrl}}',
              waitUntil: 'domcontentloaded',
              timeoutMs: 35000,
              goal: 'Navigate to tech community feed',
            },
            { type: 'sleep', minMs: 2500, maxMs: 4500 },
            { type: 'scroll', direction: 'down', amount: 400, kinetic: true },
            { type: 'sleep', minMs: 3000, maxMs: 6000 },
            { type: 'scroll', direction: 'down', amount: 500, kinetic: true },
            { type: 'sleep', minMs: 4000, maxMs: 7000 },
            { type: 'scroll', direction: 'up', amount: 250, kinetic: true },
            { type: 'sleep', minMs: 2000, maxMs: 4000 },
            { type: 'screenshot', name: 'social-feed-verified' },
          ],
        },
      },
    ];

    for (const item of builtins) {
      const existing = await this.deps.repos.templates.getById(item.id);
      if (!existing) {
        await this.deps.repos.templates.create({
          id: item.id,
          name: item.name,
          category: item.category,
          description: item.description,
          definition: JSON.stringify(item.workflow),
          is_builtin: 1,
          tags: JSON.stringify(item.tags),
          created_at: now,
          updated_at: now,
        });
      } else if (existing.is_builtin) {
        await this.deps.repos.templates.update(item.id, {
          name: item.name,
          category: item.category,
          description: item.description,
          definition: JSON.stringify(item.workflow),
          tags: JSON.stringify(item.tags),
          updated_at: now,
        });
      }
    }
  }
}
