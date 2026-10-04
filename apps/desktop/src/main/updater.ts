import { app, type BrowserWindow } from 'electron';

export interface UpdateStatus {
  status: 'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error';
  version?: string | undefined;
  progressPercent?: number | undefined;
  error?: string | undefined;
}

export class AppUpdater {
  private currentStatus: UpdateStatus = { status: 'idle' };

  constructor(private readonly getWindow: () => BrowserWindow | null) {}

  getStatus(): UpdateStatus {
    return { ...this.currentStatus };
  }

  private setStatus(patch: Partial<UpdateStatus>): void {
    this.currentStatus = { ...this.currentStatus, ...patch };
    const win = this.getWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send('app.update_status', this.currentStatus);
    }
  }

  async checkForUpdates(): Promise<UpdateStatus> {
    if (!app.isPackaged) {
      this.setStatus({ status: 'not-available', version: app.getVersion() });
      return this.currentStatus;
    }

    try {
      this.setStatus({ status: 'checking' });
      // In production packaged apps with electron-updater installed:
      // const { autoUpdater } = await import('electron-updater');
      // autoUpdater.checkForUpdatesAndNotify();
      this.setStatus({ status: 'not-available', version: app.getVersion() });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.setStatus({ status: 'error', error: msg });
    }

    return this.currentStatus;
  }
}
