import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const modelsDir = path.join(rootDir, 'apps', 'renderer', 'public', 'openwakeword', 'models');
const ortDir = path.join(rootDir, 'apps', 'renderer', 'public', 'openwakeword', 'ort');
const publicOwwDir = path.join(rootDir, 'apps', 'renderer', 'public', 'openwakeword');

fs.mkdirSync(modelsDir, { recursive: true });
fs.mkdirSync(ortDir, { recursive: true });

const MODELS = [
  'melspectrogram.onnx',
  'embedding_model.onnx',
  'silero_vad.onnx',
  'hey_jarvis_v0.1.onnx',
  'alexa_v0.1.onnx',
  'hey_mycroft_v0.1.onnx',
  'hey_rhasspy_v0.1.onnx',
  'timer_v0.1.onnx',
  'weather_v0.1.onnx',
];

const BASE_URL = 'https://github.com/dscripka/openWakeWord/releases/download/v0.5.1/';

async function downloadModel(name) {
  const dest = path.join(modelsDir, name);
  if (fs.existsSync(dest) && fs.statSync(dest).size > 1000) {
    console.log(`[Model] Already exists: ${name} (${fs.statSync(dest).size} bytes)`);
    return;
  }

  const url = BASE_URL + name;
  console.log(`[Model] Downloading ${name} from ${url}...`);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to download ${name}: HTTP ${res.status}`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(dest, buffer);
  console.log(`[Model] Saved ${name} (${buffer.length} bytes)`);
}

async function main() {
  console.log('--- Starting openWakeWord asset setup ---');

  // 1. Download models
  for (const m of MODELS) {
    await downloadModel(m);
  }

  // 2. Setup hey_tersoo.onnx
  const heyTersooDest = path.join(modelsDir, 'hey_tersoo.onnx');
  if (!fs.existsSync(heyTersooDest)) {
    console.log('[Model] Setting up hey_tersoo.onnx default baseline...');
    const jarvisSrc = path.join(modelsDir, 'hey_jarvis_v0.1.onnx');
    fs.copyFileSync(jarvisSrc, heyTersooDest);
    console.log('[Model] hey_tersoo.onnx created from baseline.');
  }

  // 3. Copy ONNX Runtime Web WASM and MJS files
  let ortDistPath = path.join(
    rootDir,
    'node_modules',
    '.pnpm',
    'onnxruntime-web@1.30.0',
    'node_modules',
    'onnxruntime-web',
    'dist'
  );

  try {
    const { createRequire } = await import('node:module');
    const req = createRequire(path.join(rootDir, 'apps', 'renderer', 'package.json'));
    const resolvedEntry = req.resolve('onnxruntime-web');
    const resolvedDist = path.dirname(resolvedEntry);
    if (fs.existsSync(resolvedDist)) {
      ortDistPath = resolvedDist;
    }
  } catch {}

  if (fs.existsSync(ortDistPath)) {
    console.log(`[ORT] Copying ORT WASM files from ${ortDistPath}...`);
    const files = fs.readdirSync(ortDistPath);
    let copied = 0;
    for (const f of files) {
      if (f.endsWith('.wasm') || f.endsWith('.mjs') || f.endsWith('.js')) {
        fs.copyFileSync(path.join(ortDistPath, f), path.join(ortDir, f));
        copied++;
      }
    }
    console.log(`[ORT] Copied ${copied} ORT files to ${ortDir}`);
  } else {
    console.warn(`[ORT] Warning: dist path not found at ${ortDistPath}`);
  }

  // 4. Copy mic-worklet.js
  let owwPkgPath = path.join(
    rootDir,
    'node_modules',
    '.pnpm',
    'openwakeword-web@0.1.0',
    'node_modules',
    'openwakeword-web',
    'src',
    'mic-worklet.js'
  );

  try {
    const { createRequire } = await import('node:module');
    const req = createRequire(path.join(rootDir, 'apps', 'renderer', 'package.json'));
    const resolvedEntry = req.resolve('openwakeword-web');
    const resolvedSrc = path.join(path.dirname(resolvedEntry), '..', 'src', 'mic-worklet.js');
    if (fs.existsSync(resolvedSrc)) {
      owwPkgPath = resolvedSrc;
    }
  } catch {}

  if (fs.existsSync(owwPkgPath)) {
    const destWorklet = path.join(publicOwwDir, 'mic-worklet.js');
    fs.copyFileSync(owwPkgPath, destWorklet);
    console.log(`[Worklet] Copied mic-worklet.js to ${destWorklet}`);
  }

  console.log('--- openWakeWord asset setup completed successfully! ---');
}

main().catch((err) => {
  console.error('Asset setup failed:', err);
  process.exit(1);
});
