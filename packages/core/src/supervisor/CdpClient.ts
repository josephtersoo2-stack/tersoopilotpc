import type { CDPClient } from '../fingerprint/CdpEmulator';

/** Default per-command timeout. */
const DEFAULT_COMMAND_TIMEOUT_MS = 30_000;
/** Upper bound on in-flight commands, so a wedged target cannot grow forever. */
const MAX_PENDING_COMMANDS = 512;

interface PendingCommand {
  resolve: (val: unknown) => void;
  reject: (err: unknown) => void;
  timer: NodeJS.Timeout;
}

export class WebSocketCdpClient implements CDPClient {
  private readonly ws: WebSocket;
  private nextId = 1;
  private closed = false;
  private readonly pending = new Map<number, PendingCommand>();

  static async connect(wsUrl: string, timeoutMs = 5000): Promise<WebSocketCdpClient> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(wsUrl);
      const timer = setTimeout(() => {
        try {
          ws.close();
        } catch {
          // Ignore
        }
        reject(new Error(`CDP connection timeout to ${wsUrl}`));
      }, timeoutMs);

      ws.onopen = () => {
        clearTimeout(timer);
        resolve(new WebSocketCdpClient(ws));
      };
      ws.onerror = (err) => {
        clearTimeout(timer);
        const error =
          err instanceof Error ? err : new Error(`WebSocket error on ${wsUrl}`);
        reject(error);
      };
    });
  }

  constructor(ws: WebSocket) {
    this.ws = ws;
    this.ws.onmessage = (event) => {
      try {
        const rawData = event.data as unknown;
        const raw = typeof rawData === 'string' ? rawData : String(rawData);
        const msg = JSON.parse(raw) as {
          id?: number;
          result?: unknown;
          error?: { message?: string };
        };
        if (msg.id && this.pending.has(msg.id)) {
          const handler = this.pending.get(msg.id)!;
          this.pending.delete(msg.id);
          clearTimeout(handler.timer);
          if (msg.error) {
            handler.reject(new Error(msg.error.message || JSON.stringify(msg.error)));
          } else {
            handler.resolve(msg.result);
          }
        }
      } catch {
        // Ignore malformed message
      }
    };

    // A target that goes away must not leave callers hanging on a promise that
    // can never settle.
    this.ws.onclose = () => {
      this.failAllPending(new Error('CDP connection closed'));
    };
    this.ws.onerror = () => {
      this.failAllPending(new Error('CDP connection error'));
    };
  }

  private failAllPending(err: Error): void {
    this.closed = true;
    for (const handler of this.pending.values()) {
      clearTimeout(handler.timer);
      handler.reject(err);
    }
    this.pending.clear();
  }

  send(
    method: string,
    params?: Record<string, unknown>,
    timeoutMs: number = DEFAULT_COMMAND_TIMEOUT_MS,
  ): Promise<unknown> {
    if (this.closed) {
      return Promise.reject(new Error(`CDP connection closed before sending '${method}'`));
    }
    if (this.pending.size >= MAX_PENDING_COMMANDS) {
      return Promise.reject(
        new Error(
          `Refusing CDP command '${method}': ${this.pending.size} commands already in flight`,
        ),
      );
    }

    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP command '${method}' timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      if (typeof timer.unref === 'function') timer.unref();

      this.pending.set(id, { resolve, reject, timer });
      try {
        this.ws.send(JSON.stringify({ id, method, params }));
      } catch (err) {
        this.pending.delete(id);
        clearTimeout(timer);
        reject(err);
      }
    });
  }

  close(): void {
    this.failAllPending(new Error('CDP client closed'));
    try {
      this.ws.close();
    } catch {
      // Ignore
    }
  }
}
