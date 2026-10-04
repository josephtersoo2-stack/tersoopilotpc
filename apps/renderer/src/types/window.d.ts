import type {
  CommandInput,
  CommandName,
  CommandOutput,
  EventName,
  EventPayload,
} from '@tersoo/contracts';

export interface TersooApi {
  invoke<C extends CommandName = CommandName>(
    name: C,
    input?: CommandInput<C>,
  ): Promise<CommandOutput<C>>;
  on<E extends EventName = EventName>(
    name: E,
    handler: (payload: EventPayload<E>) => void,
  ): () => void;
}

declare global {
  interface Window {
    tersoo?: TersooApi;
  }
}
