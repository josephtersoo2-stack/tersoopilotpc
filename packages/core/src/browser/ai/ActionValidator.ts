import { NavigationError } from '../navigation/NavigationError';
import { NavigationPolicy } from '../navigation/NavigationPolicy';
import type { AIAction } from './AIActionSchema';

export class ActionValidator {
  constructor(
    private readonly allowedHosts?: string[],
    private readonly allowHistoryNavigation: boolean = false,
  ) {}

  async validate(action: AIAction): Promise<void> {
    if (!action || typeof action !== 'object' || !action.type) {
      throw new Error('Invalid AI action: payload must be an object with a type property');
    }

    switch (action.type) {
      case 'navigate': {
        if (!action.url || typeof action.url !== 'string') {
          throw new Error('AI action "navigate" requires a valid url string');
        }
        NavigationPolicy.validateNavigationUrl(action.url, this.allowedHosts);
        return;
      }
      case 'open_tab': {
        if (!action.url || typeof action.url !== 'string') {
          throw new Error('AI action "open_tab" requires a valid url string');
        }
        NavigationPolicy.validateNavigationUrl(action.url, this.allowedHosts);
        return;
      }
      case 'click': {
        if (!action.target || typeof action.target !== 'object') {
          throw new Error('AI action "click" requires a target object');
        }
        return;
      }
      case 'fill': {
        if (!action.target || typeof action.target !== 'object') {
          throw new Error('AI action "fill" requires a target object');
        }
        if (typeof action.value !== 'string') {
          throw new Error('AI action "fill" requires a string value');
        }
        return;
      }
      case 'wait_for_url': {
        if (!action.pattern || typeof action.pattern !== 'string') {
          throw new Error('AI action "wait_for_url" requires a pattern string');
        }
        return;
      }
      case 'wait_for_element': {
        if (!action.target || typeof action.target !== 'object') {
          throw new Error('AI action "wait_for_element" requires a target object');
        }
        return;
      }
      case 'back':
      case 'forward': {
        if (!this.allowHistoryNavigation) {
          throw new NavigationError(
            'REDIRECT_UNEXPECTED',
            'AI history navigation is disabled by policy',
          );
        }
        return;
      }
      case 'finish':
      case 'request_human':
        return;
      default:
        throw new Error(`Unrecognized or disallowed AI action type: ${(action as any).type}`);
    }
  }
}
