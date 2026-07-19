const { app, BrowserWindow, session, desktopCapturer, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

const RECORDINGS_DIR = path.join(__dirname, 'recordings');
const WHISPER_BASE = 'https://api.whisperai.com/v1';
const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 10 * 60 * 1000;

// Minimal .env loader so the API key stays out of the repo without
// pulling in a dependency.
function loadEnv() {
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (match && !(match[1] in process.env)) process.env[match[1]] = match[2];
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function apiError(response) {
  try {
    const body = await response.json();
    if (body && body.error) return `${response.status}: ${body.error}`;
  } catch {
    // non-JSON error body
  }
  return `HTTP ${response.status}`;
}

async function transcribeFile(filePath, languageCode) {
  const apiKey = process.env.WHISPERAI_API_KEY;
  if (!apiKey) {
    throw new Error('WHISPERAI_API_KEY is not set. Copy .env.example to .env and add your key.');
  }
  const headers = { Authorization: apiKey };

  // 1. Upload the raw audio bytes.
  const uploadRes = await fetch(`${WHISPER_BASE}/upload`, {
    method: 'POST',
    headers,
    body: fs.readFileSync(filePath)
  });
  if (!uploadRes.ok) throw new Error(`Upload failed (${await apiError(uploadRes)})`);
  const { upload_url } = await uploadRes.json();

  // 2. Create the transcript job.
  const createBody = { audio_url: upload_url };
  if (languageCode) createBody.language_code = languageCode;
  const createRes = await fetch(`${WHISPER_BASE}/transcript`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(createBody)
  });
  if (!createRes.ok) throw new Error(`Transcript request failed (${await apiError(createRes)})`);
  const job = await createRes.json();

  // 3. Poll until completed or error.
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);
    const pollRes = await fetch(`${WHISPER_BASE}/transcript/${job.id}`, { headers });
    if (!pollRes.ok) throw new Error(`Polling failed (${await apiError(pollRes)})`);
    const transcript = await pollRes.json();
    if (transcript.status === 'completed') return transcript.text;
    if (transcript.status === 'error') {
      throw new Error(transcript.error || 'Transcription failed');
    }
  }
  throw new Error('Timed out waiting for the transcription to finish.');
}

function createWindow() {
  const win = new BrowserWindow({
    width: 900,
    height: 640,
    minWidth: 720,
    minHeight: 480,
    backgroundColor: '#0b0e14',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

app.whenReady().then(() => {
  loadEnv();

  // Grant getDisplayMedia requests a screen source with system loopback
  // audio, so the renderer can record everything the computer plays
  // without showing a picker dialog.
  session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
    desktopCapturer.getSources({ types: ['screen'] }).then((sources) => {
      callback({ video: sources[0], audio: 'loopback' });
    });
  });

  ipcMain.handle('save-recording', async (event, arrayBuffer) => {
    fs.mkdirSync(RECORDINGS_DIR, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filePath = path.join(RECORDINGS_DIR, `recording-${stamp}.webm`);
    fs.writeFileSync(filePath, Buffer.from(arrayBuffer));
    return filePath;
  });

  ipcMain.handle('transcribe', async (event, { filePath, languageCode }) => {
    try {
      // Only allow transcribing files this app saved.
      const resolved = path.resolve(filePath);
      if (!resolved.startsWith(RECORDINGS_DIR + path.sep)) {
        throw new Error('Invalid recording path.');
      }
      const text = await transcribeFile(resolved, languageCode);
      return { ok: true, text };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
