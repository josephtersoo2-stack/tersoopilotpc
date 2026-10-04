import type net from 'node:net';

/**
 * Socket reader that buffers incoming chunks and allows reading exact byte counts
 * or reading until a delimiter without losing any trailing bytes.
 */
export class BufferedSocketReader {
  private buffer: Buffer = Buffer.alloc(0);
  private closed = false;
  private error: Error | null = null;
  private waitingData: (() => void) | null = null;

  constructor(private readonly socket: net.Socket) {
    this.socket.on('data', this.onData);
    this.socket.on('end', this.onEnd);
    this.socket.on('close', this.onEnd);
    this.socket.on('error', this.onError);
  }

  private onData = (chunk: Buffer | Uint8Array) => {
    this.buffer = Buffer.concat([new Uint8Array(this.buffer), new Uint8Array(chunk)]);
    if (this.waitingData) {
      const cb = this.waitingData;
      this.waitingData = null;
      cb();
    }
  };

  private onEnd = () => {
    this.closed = true;
    if (this.waitingData) {
      const cb = this.waitingData;
      this.waitingData = null;
      cb();
    }
  };

  private onError = (err: Error) => {
    this.error = err;
    if (this.waitingData) {
      const cb = this.waitingData;
      this.waitingData = null;
      cb();
    }
  };

  /**
   * Reads exactly `n` bytes from the socket.
   */
  async readN(n: number, timeoutMs = 15000): Promise<Buffer> {
    const startTime = Date.now();

    while (this.buffer.length < n) {
      if (this.error) throw this.error;
      if (this.closed) {
        throw new Error(`Socket closed before reading ${n} bytes (had ${this.buffer.length})`);
      }

      const remainingTime = timeoutMs - (Date.now() - startTime);
      if (remainingTime <= 0) {
        throw new Error(`Timeout waiting for ${n} bytes`);
      }

      await new Promise<void>((resolve, reject) => {
        let timer: NodeJS.Timeout | null = null;

        const onWake = () => {
          if (timer) clearTimeout(timer);
          resolve();
        };

        timer = setTimeout(() => {
          this.waitingData = null;
          reject(new Error(`Timeout waiting for ${n} bytes`));
        }, remainingTime);

        this.waitingData = onWake;
      });
    }

    const result = this.buffer.subarray(0, n);
    this.buffer = this.buffer.subarray(n);
    return result;
  }

  /**
   * Reads until the specified ASCII delimiter marker is reached (e.g. '\r\n\r\n').
   */
  async readUntil(marker: string, maxBytes = 65536, timeoutMs = 15000): Promise<string> {
    const startTime = Date.now();
    const markerLen = Buffer.byteLength(marker, 'utf-8');

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const idx = this.buffer.indexOf(marker);
      if (idx !== -1) {
        const end = idx + markerLen;
        const result = this.buffer.subarray(0, end).toString('utf-8');
        this.buffer = this.buffer.subarray(end);
        return result;
      }

      if (this.buffer.length >= maxBytes) {
        throw new Error(`Exceeded maximum read limit (${maxBytes} bytes) waiting for marker`);
      }

      if (this.error) throw this.error;
      if (this.closed) {
        throw new Error('Socket closed before marker was found');
      }

      const remainingTime = timeoutMs - (Date.now() - startTime);
      if (remainingTime <= 0) {
        throw new Error('Timeout waiting for marker');
      }

      await new Promise<void>((resolve, reject) => {
        let timer: NodeJS.Timeout | null = null;

        const onWake = () => {
          if (timer) clearTimeout(timer);
          resolve();
        };

        timer = setTimeout(() => {
          this.waitingData = null;
          reject(new Error('Timeout waiting for marker'));
        }, remainingTime);

        this.waitingData = onWake;
      });
    }
  }

  /**
   * Returns any unconsumed buffered bytes and unbinds listeners so the socket can be piped.
   */
  release(): Buffer {
    this.socket.off('data', this.onData);
    this.socket.off('end', this.onEnd);
    this.socket.off('close', this.onEnd);
    this.socket.off('error', this.onError);
    const unconsumed = this.buffer;
    this.buffer = Buffer.alloc(0);
    return unconsumed;
  }
}
