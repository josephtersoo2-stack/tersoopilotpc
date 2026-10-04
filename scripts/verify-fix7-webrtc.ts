// scripts/verify-fix7-webrtc.ts
// Live automated verification script for Fix 7 (WebRTC ICE Leak & STUN Verification)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

import { DEFAULT_PRESET_IDS } from '../packages/contracts/src';
import { createContainer, loadConfig } from '../packages/core/src';

const WEBRTC_TEST_HTML = `<!DOCTYPE html>
<html>
<head><title>WebRTC Test</title></head>
<body>
  <h1>WebRTC ICE Candidate Test</h1>
  <div id="status">WAITING</div>
  <pre id="candidates"></pre>
  <script>
    (async () => {
      const candidates = [];
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
      });

      pc.onicecandidate = (e) => {
        if (e.candidate) {
          candidates.push(e.candidate.candidate);
        } else {
          // ICE gathering finished
          finish();
        }
      };

      pc.createDataChannel('test');
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      function finish() {
        const privateIpRegex = /\\b(?:10\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}|192\\.168\\.\\d{1,3}\\.\\d{1,3}|172\\.(?:1[6-9]|2\\d|3[0-1])\\.\\d{1,3}\\.\\d{1,3})\\b/;
        const hasPrivateIp = candidates.some(c => privateIpRegex.test(c));

        document.getElementById('candidates').textContent = JSON.stringify({
          candidateCount: candidates.length,
          candidates,
          hasPrivateIp,
        }, null, 2);
        document.getElementById('status').textContent = 'DONE';
      }

      // Fallback timeout in case onicecandidate null event is delayed
      setTimeout(finish, 5000);
    })();
  </script>
</body>
</html>`;

async function main() {
  console.log('================================================================');
  console.log('  Verifying Fix 7: WebRTC ICE Leak Protection in Live Chromium');
  console.log('================================================================');

  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(WEBRTC_TEST_HTML);
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as any).port;
  const testUrl = `http://127.0.0.1:${port}/`;

  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const testUserDataDir = path.resolve('scratch/webrtc-test-data');
  if (!fs.existsSync(testUserDataDir)) {
    fs.mkdirSync(testUserDataDir, { recursive: true });
  }

  const config = loadConfig(testUserDataDir, chromePath, { headless: false });
  const container = await createContainer(config);

  const profile = await container.services.profiles.create({
    name: 'WebRTC Leak Test Profile',
    presetId: DEFAULT_PRESET_IDS.windows11,
  });

  try {
    await container.services.profiles.launch(profile.id, { headless: false });
    const page = container.crosshair.getPage(profile.id);
    await page.goto(testUrl, { waitUntil: 'load' });

    await page.waitForFunction(() => document.getElementById('status')?.textContent === 'DONE', {
      timeout: 10000,
    });

    const rawData = await page.textContent('#candidates');
    const data = JSON.parse(rawData || '{}');
    console.log('WebRTC Telemetry:');
    console.log(JSON.stringify(data, null, 2));

    if (data.hasPrivateIp) {
      console.error('\n❌ FAIL: WebRTC leaked private LAN IP address!');
      process.exit(1);
    } else {
      console.log('\n✅ PASS: No private LAN IP leaked in WebRTC candidates!');
      console.log('🎉 FIX 7 VERIFIED: WebRTC leak prevention active and confirmed.');
    }
  } finally {
    await container.services.profiles.stop(profile.id);
    await new Promise((r) => setTimeout(r, 2000));
    try {
      await container.services.profiles.delete(profile.id);
    } catch {}
    server.close();
  }
}

main().catch((err) => {
  console.error('Fatal WebRTC verification error:', err);
  process.exit(1);
});
