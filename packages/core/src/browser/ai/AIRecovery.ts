import type { Page } from 'playwright-core';
import type { LlmService } from '../../llm/LlmService';
import { ActionValidator } from './ActionValidator';
import { AINavigator } from './AINavigator';

export class AIRecovery {
  static async attemptRecovery(
    page: Page,
    goal: string,
    llm: LlmService,
    allowedHosts?: string[],
  ): Promise<boolean> {
    try {
      const validator = new ActionValidator(allowedHosts);
      const navigator = new AINavigator(page, llm, validator);
      const result = await navigator.run(
        `Recover navigation toward goal: ${goal}`,
        6,
      );
      return result.status === 'SUCCESS';
    } catch {
      return false;
    }
  }
}
