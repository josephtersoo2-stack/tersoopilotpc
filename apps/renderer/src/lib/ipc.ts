import type { CommandName, CommandInput, CommandOutput, EventName, EventPayload } from '@tersoo/contracts';

export async function invokeIpc<C extends CommandName>(
  channel: C,
  input?: CommandInput<C>,
): Promise<CommandOutput<C>> {
  if (!window.tersoo?.invoke) {
    throw new Error(`Tersoo IPC bridge not available for channel '${channel}'`);
  }
  return window.tersoo.invoke(channel, input);
}

export function subscribeIpc<E extends EventName>(
  event: E,
  handler: (payload: EventPayload<E>) => void,
): () => void {
  if (!window.tersoo?.on) {
    return () => {};
  }
  return window.tersoo.on(event, (payload) => handler(payload));
}
