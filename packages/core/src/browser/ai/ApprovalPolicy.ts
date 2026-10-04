import { NavigationError } from '../navigation/NavigationError';
import type { AIAction } from './AIActionSchema';

export type ActionRiskLevel =
  | 'read'
  | 'reversible-write'
  | 'sensitive-write'
  | 'irreversible-write';

export interface ApprovalRequest {
  action: AIAction;
  resolvedTarget: Record<string, unknown>;
  payload?: Record<string, unknown> | undefined;
  risk: ActionRiskLevel;
}

export interface ApprovalPolicy {
  classifyRisk(action: AIAction): ActionRiskLevel;
  assertApprovedIfRequired(input: ApprovalRequest): Promise<void>;
}

export class DefaultApprovalPolicy implements ApprovalPolicy {
  constructor(private readonly autoApproveReversible = true) {}

  classifyRisk(action: AIAction): ActionRiskLevel {
    switch (action.type) {
      case 'wait_for_url':
      case 'wait_for_element':
        return 'read';

      case 'navigate':
      case 'open_tab':
      case 'back':
      case 'forward':
        return 'reversible-write';

      case 'fill': {
        const val = action.value.toLowerCase();
        if (
          val.includes('password') ||
          val.includes('credit') ||
          val.includes('card') ||
          val.includes('ssn')
        ) {
          return 'sensitive-write';
        }
        return 'reversible-write';
      }

      case 'click': {
        const name = (action.target.name || '').toLowerCase();
        if (
          name.includes('delete') ||
          name.includes('remove account') ||
          name.includes('cancel subscription') ||
          name.includes('purchase') ||
          name.includes('buy') ||
          name.includes('pay') ||
          name.includes('transfer') ||
          name.includes('submit order')
        ) {
          return 'irreversible-write';
        }

        if (
          name.includes('send') ||
          name.includes('confirm') ||
          name.includes('submit') ||
          name.includes('apply')
        ) {
          return 'sensitive-write';
        }

        return 'reversible-write';
      }

      case 'finish':
      case 'request_human':
        return 'read';

      default:
        return 'sensitive-write';
    }
  }

  async assertApprovedIfRequired(input: ApprovalRequest): Promise<void> {
    if (input.risk === 'irreversible-write') {
      throw new NavigationError(
        'HUMAN_REQUIRED',
        `High-risk irreversible action requires explicit user approval: ${JSON.stringify(input.action)}`,
      );
    }

    if (input.risk === 'sensitive-write' && !this.autoApproveReversible) {
      throw new NavigationError(
        'HUMAN_REQUIRED',
        `Sensitive action requires user approval: ${JSON.stringify(input.action)}`,
      );
    }
  }
}
