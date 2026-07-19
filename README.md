# Pro Listener

An elegant dark-themed desktop app that records your computer's audio output and transcribes it with the [WhisperAI API](https://whisperai.com/docs).

## Features

- **System audio capture** — records everything your computer plays (WASAPI loopback via Electron), no microphone or picker dialog involved.
- **Timed recordings** — set a max duration in seconds; recording stops automatically, or press **Stop** anytime.
- **One-click transcription** — uploads the recording to WhisperAI, polls until done, and displays the transcript below the controls.
- **Language selection** — pin the transcription language or let WhisperAI auto-detect it.
- **Real-time mode** — flip the toggle and Record streams system audio live over WhisperAI's realtime WebSocket; partial turns appear dimmed and finalize as you listen.

## Setup

1. Install [Node.js](https://nodejs.org) (LTS).
2. Install dependencies:

   ```sh
   npm install
   ```

3. Configure your API key:

   ```sh
   cp .env.example .env
   ```

   Then edit `.env` and set `WHISPERAI_API_KEY` to your key from the [WhisperAI Developer Portal](https://whisperai.com/developer#keys). The `.env` file is gitignored and the key is only ever read by the Electron main process.

## Usage

```sh
npm start
```

Prefer launching without a terminal? Create a desktop shortcut once (Windows):

```powershell
powershell -ExecutionPolicy Bypass -File create-shortcut.ps1
```

1. Pick a **language** (or leave on auto-detect) and a **max duration** in seconds.
2. Press **Record** — the app captures all system audio output.
3. Press **Stop** (or wait for the auto-stop) — the recording is saved to `recordings/` as WebM/Opus.
4. Press **Transcribe** — the transcript appears below once WhisperAI finishes processing.

### Real-time mode

Flip the **Real-time** toggle, then press **Record**. Audio is resampled to 16 kHz mono PCM and streamed over the realtime WebSocket (`whisperai-realtime-pro`); the transcript updates live, with in-progress turns shown dimmed. Press **Stop** (or wait for the max duration) to end the session — realtime usage is billed by WebSocket session duration, so the status row shows the billed seconds when available. The renderer authenticates with a single-use browser token minted by the main process; the API key itself is never exposed. Note that the language selector does not apply in real-time mode.

## Project structure

| File | Role |
| --- | --- |
| `main.js` | Electron main process: window, loopback audio grant, recording persistence, WhisperAI API calls |
| `preload.js` | Narrow IPC bridge exposed to the renderer |
| `renderer/` | Dark UI: controls, recording logic (MediaRecorder), realtime streaming (AudioWorklet + WebSocket), transcript display |

## Notes

- Recordings are saved locally in `recordings/` (gitignored).
- Transcription requires an internet connection; audio is uploaded to WhisperAI's API and stored under your API account (delete via `DELETE /v1/transcript/{id}` if needed).
- System audio loopback capture is supported on Windows.
