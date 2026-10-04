import { TersooError, type ErrorCode } from '../util/errors';

export class LlmError extends TersooError {
  override readonly name = 'LlmError';

  constructor(code: ErrorCode, message: string, meta: Record<string, unknown> = {}) {
    super(code, message, meta);
  }
}
