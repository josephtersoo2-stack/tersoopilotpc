import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { PromptService } from '../src/services/PromptService';
import { openDb, type AppDatabase } from '../src/persistence/db';
import { Repos } from '../src/persistence/repos';
import { loadConfig } from '../src/config';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

describe('PromptService', () => {
  let tmpDir: string;
  let db: AppDatabase;
  let repos: Repos;
  let promptService: PromptService;
  const rootMigrationsDir = path.resolve(__dirname, '../../../migrations');

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tersoo-prompt-test-'));
    const config = loadConfig(tmpDir, 'dummy-chrome');
    db = openDb(config, rootMigrationsDir);
    repos = new Repos(db);
    promptService = new PromptService({ repos });
  });

  afterEach(() => {
    try {
      db.close();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  it('lists all default prompts with isCustom false', async () => {
    const list = await promptService.listPrompts();
    expect(list.length).toBeGreaterThanOrEqual(6);

    const copilotPrompt = list.find((p) => p.id === 'copilot_system');
    expect(copilotPrompt).toBeDefined();
    expect(copilotPrompt?.category).toBe('copilot');
    expect(copilotPrompt?.isCustom).toBe(false);
    expect(copilotPrompt?.currentText).toBe(copilotPrompt?.defaultText);
    expect(copilotPrompt?.currentText).toContain('Tersoo Copilot');

    const treePrompt = list.find((p) => p.id === 'tree_system');
    expect(treePrompt).toBeDefined();
    expect(treePrompt?.category).toBe('automation');
    expect(treePrompt?.isCustom).toBe(false);
  });

  it('updates a prompt and persists the customization', async () => {
    const customText = 'You are a customized Tersoo Copilot prompt with specialized rules.';
    const updated = await promptService.updatePrompt('copilot_system', customText);

    expect(updated.id).toBe('copilot_system');
    expect(updated.isCustom).toBe(true);
    expect(updated.currentText).toBe(customText);

    // Verify it is returned by getPrompt
    const retrieved = await promptService.getPrompt('copilot_system');
    expect(retrieved).toBe(customText);

    // Verify it reflects in listPrompts
    const list = await promptService.listPrompts();
    const found = list.find((p) => p.id === 'copilot_system');
    expect(found?.isCustom).toBe(true);
    expect(found?.currentText).toBe(customText);
  });

  it('resets a customized prompt back to system default', async () => {
    await promptService.updatePrompt('tree_system', 'Custom tree instructions.');
    expect(await promptService.getPrompt('tree_system')).toBe('Custom tree instructions.');

    const reset = await promptService.resetPrompt('tree_system');
    expect(reset.isCustom).toBe(false);
    expect(reset.currentText).toBe(reset.defaultText);

    const retrieved = await promptService.getPrompt('tree_system');
    expect(retrieved).toBe(reset.defaultText);
  });

  it('resets all prompts back to default', async () => {
    await promptService.updatePrompt('copilot_system', 'Custom copilot');
    await promptService.updatePrompt('vision_system', 'Custom vision');

    const all = await promptService.resetAll();
    for (const p of all) {
      expect(p.isCustom).toBe(false);
      expect(p.currentText).toBe(p.defaultText);
    }
  });
});
