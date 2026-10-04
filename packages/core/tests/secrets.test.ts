import { describe, expect, it } from 'vitest';

import { MemorySecretDriver, SecretVault } from '../src/secrets/SecretVault';

describe('Ticket 0.9: SecretVault', () => {
  it('MemorySecretDriver performs set, get, and delete operations', async () => {
    const driver = new MemorySecretDriver();

    await driver.setPassword('svc', 'acc', 'secret-val');
    expect(await driver.getPassword('svc', 'acc')).toBe('secret-val');

    expect(await driver.getPassword('svc', 'nonexistent')).toBeNull();

    const deleted = await driver.deletePassword('svc', 'acc');
    expect(deleted).toBe(true);
    expect(await driver.getPassword('svc', 'acc')).toBeNull();

    const deletedAgain = await driver.deletePassword('svc', 'acc');
    expect(deletedAgain).toBe(false);
  });

  it('SecretVault manages proxy passwords and returns keychain reference keys', async () => {
    const vault = new SecretVault(new MemorySecretDriver());

    const ref = await vault.setProxyPassword('px-999', 'my-proxy-password');
    expect(ref).toBe('tersoopilot/proxy/px-999/password');

    // Retrieve via proxy helper and via generic credential getter
    expect(await vault.getProxyPassword('px-999')).toBe('my-proxy-password');
    expect(await vault.getProxyCredentials('px-999')).toBe('my-proxy-password');
    expect(await vault.getSecret(ref)).toBe('my-proxy-password');

    // Delete
    const deleted = await vault.deleteProxyPassword('px-999');
    expect(deleted).toBe(true);
    expect(await vault.getProxyCredentials('px-999')).toBeNull();
  });

  it('SecretVault manages session cookies and signing keys', async () => {
    const vault = new SecretVault(new MemorySecretDriver());

    const cookieRef = await vault.setSessionCookie('prof-1', 'example.com', '{"sid":"abc"}');
    expect(cookieRef).toBe('tersoopilot/session/prof-1/example.com');
    expect(await vault.getSessionCookie('prof-1', 'example.com')).toBe('{"sid":"abc"}');

    await vault.deleteSessionCookie('prof-1', 'example.com');
    expect(await vault.getSessionCookie('prof-1', 'example.com')).toBeNull();

    const signRef = await vault.setSigningKey('update', 'signing-secret-123');
    expect(signRef).toBe('tersoopilot/signing/update');
    expect(await vault.getSigningKey('update')).toBe('signing-secret-123');

    await vault.deleteSigningKey('update');
    expect(await vault.getSigningKey('update')).toBeNull();
  });

  it('SecretVault handles generic setSecret and invalid keys', async () => {
    const vault = new SecretVault(new MemorySecretDriver());

    await vault.setSecret('app/config/token', 'token-123');
    expect(await vault.getSecret('app/config/token')).toBe('token-123');

    const deleted = await vault.deleteSecret('app/config/token');
    expect(deleted).toBe(true);
    expect(await vault.getSecret('app/config/token')).toBeNull();

    expect(await vault.getSecret('invalid-key-without-slash')).toBeNull();
    await expect(vault.setSecret('invalid', 'val')).rejects.toThrow(/Invalid secret key/);
    expect(await vault.deleteSecret('invalid')).toBe(false);
  });
});
