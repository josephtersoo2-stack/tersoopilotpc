import { ApostateEngine, type ApostateEngineDeps } from './apostate/ApostateEngine';
import { CamoufoxEngine, type CamoufoxEngineDeps } from './camoufox/CamoufoxEngine';
import type { BrowserEngine, BrowserSession, EngineType } from './types';

export class EngineFactory {
  private readonly engines = new Map<EngineType, BrowserEngine>();

  constructor(
    apostateEngineOrDeps?: BrowserEngine | ApostateEngineDeps,
    camoufoxEngineOrDeps?: BrowserEngine | CamoufoxEngineDeps,
  ) {
    if (apostateEngineOrDeps && 'launch' in apostateEngineOrDeps) {
      this.engines.set('apostate', apostateEngineOrDeps);
    } else {
      this.engines.set(
        'apostate',
        new ApostateEngine(apostateEngineOrDeps as ApostateEngineDeps | undefined),
      );
    }

    if (camoufoxEngineOrDeps && 'launch' in camoufoxEngineOrDeps) {
      this.engines.set('camoufox', camoufoxEngineOrDeps);
    } else {
      this.engines.set(
        'camoufox',
        new CamoufoxEngine(camoufoxEngineOrDeps as CamoufoxEngineDeps | undefined),
      );
    }
  }

  register(type: EngineType, engine: BrowserEngine): void {
    this.engines.set(type, engine);
  }

  getEngine(type: EngineType): BrowserEngine {
    const engine = this.engines.get(type);
    if (!engine) {
      throw new Error(`ENGINE_NOT_REGISTERED:${type}`);
    }
    return engine;
  }

  hasEngine(type: EngineType): boolean {
    return this.engines.has(type);
  }

  getSession(profileId: string): BrowserSession | undefined {
    for (const engine of this.engines.values()) {
      if (typeof engine.getSession === 'function') {
        const session = engine.getSession(profileId);
        if (session) {
          return session;
        }
      }
    }
    return undefined;
  }
}
