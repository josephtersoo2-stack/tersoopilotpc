import type { CDPSession, ElementHandle, Page } from 'playwright-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ShadowDom } from '../src/crosshair/ShadowDom';
import { CrosshairError } from '../src/util/errors';

describe('Ticket 4.3: ShadowDom Piercing Helpers & Element Resolution', () => {
  let mockPage: Page;
  let mockCdp: CDPSession;
  let mockElement: ElementHandle<Element>;

  beforeEach(() => {
    vi.clearAllMocks();

    mockElement = {
      boundingBox: vi.fn().mockResolvedValue({
        x: 100,
        y: 200,
        width: 150,
        height: 50,
      }),
      isVisible: vi.fn().mockResolvedValue(true),
      dispose: vi.fn().mockResolvedValue(undefined),
    } as unknown as ElementHandle<Element>;

    const mockJsHandle = {
      asElement: vi.fn().mockReturnValue(mockElement),
      dispose: vi.fn().mockResolvedValue(undefined),
      evaluate: vi.fn(),
      evaluateHandle: vi.fn(),
    };

    mockPage = {
      evaluateHandle: vi.fn().mockResolvedValue(mockJsHandle),
    } as unknown as Page;

    mockCdp = {
      send: vi.fn().mockResolvedValue({
        object: {
          type: 'object',
          objectId: 'remote-obj-id-123',
          className: 'HTMLButtonElement',
        },
      }),
    } as unknown as CDPSession;
  });

  it('findElement delegates to evaluateHandle and returns resolved ElementHandle', async () => {
    const el = await ShadowDom.findElement(mockPage, 'button.submit-btn');

    expect(el).toBe(mockElement);
    expect(mockPage.evaluateHandle).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({
        sel: 'button.submit-btn',
        visOnly: false,
      }),
    );
  });

  it('findElement returns null when element is not found', async () => {
    const nullHandle = {
      asElement: vi.fn().mockReturnValue(null),
      dispose: vi.fn().mockResolvedValue(undefined),
    };
    (mockPage.evaluateHandle as any).mockResolvedValueOnce(nullHandle);

    const el = await ShadowDom.findElement(mockPage, '#non-existent');
    expect(el).toBeNull();
    expect(nullHandle.dispose).toHaveBeenCalled();
  });

  it('findAllElements returns array of ElementHandles', async () => {
    const mockItemHandle = {
      asElement: vi.fn().mockReturnValue(mockElement),
      dispose: vi.fn().mockResolvedValue(undefined),
    };

    const mockListHandle = {
      evaluate: vi.fn().mockResolvedValue(2),
      evaluateHandle: vi.fn().mockResolvedValue(mockItemHandle),
      dispose: vi.fn().mockResolvedValue(undefined),
    };

    (mockPage.evaluateHandle as any).mockResolvedValueOnce(mockListHandle);

    const elements = await ShadowDom.findAllElements(mockPage, 'input.text-field');
    expect(elements).toHaveLength(2);
    expect(elements[0]).toBe(mockElement);
    expect(mockListHandle.dispose).toHaveBeenCalled();
  });

  it('findXPath evaluates deep relative XPath across shadow trees', async () => {
    const el = await ShadowDom.findXPath(mockPage, '//button[text()="Save"]');
    expect(el).toBe(mockElement);
    expect(mockPage.evaluateHandle).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({
        xp: '//button[text()="Save"]',
        visOnly: false,
      }),
    );
  });

  it('pierce traverses nested component paths sequentially', async () => {
    const el = await ShadowDom.pierce(mockPage, ['header-nav', 'user-menu', 'button.logout']);
    expect(el).toBe(mockElement);
    expect(mockPage.evaluateHandle).toHaveBeenCalledWith(
      expect.any(Function),
      ['header-nav', 'user-menu', 'button.logout'],
    );
  });

  it('pierce returns null if path is empty', async () => {
    const el = await ShadowDom.pierce(mockPage, []);
    expect(el).toBeNull();
    expect(mockPage.evaluateHandle).not.toHaveBeenCalled();
  });

  it('resolveBoundingBox extracts viewport coordinates', async () => {
    const box = await ShadowDom.resolveBoundingBox(mockElement);
    expect(box).toEqual({
      x: 100,
      y: 200,
      width: 150,
      height: 50,
    });
  });

  it('resolveBoundingBox returns null when element is not rendered', async () => {
    (mockElement.boundingBox as any).mockResolvedValueOnce(null);
    const box = await ShadowDom.resolveBoundingBox(mockElement);
    expect(box).toBeNull();
  });

  it('resolveNodeViaCdp calls DOM.resolveNode and returns remote object', async () => {
    const res = await ShadowDom.resolveNodeViaCdp(mockCdp, 42);
    expect(res).toEqual({
      type: 'object',
      objectId: 'remote-obj-id-123',
      className: 'HTMLButtonElement',
    });
    expect(mockCdp.send).toHaveBeenCalledWith('DOM.resolveNode', {
      backendNodeId: 42,
    });
  });

  it('wraps evaluation errors in CrosshairError', async () => {
    (mockPage.evaluateHandle as any).mockRejectedValueOnce(new Error('Page crashed'));

    await expect(
      ShadowDom.findElement(mockPage, 'button'),
    ).rejects.toThrow(CrosshairError);
  });
});
