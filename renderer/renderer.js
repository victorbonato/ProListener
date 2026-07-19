const els = {
  language: document.getElementById('language'),
  duration: document.getElementById('duration'),
  realtimeToggle: document.getElementById('realtime-toggle'),
  record: document.getElementById('btn-record'),
  stop: document.getElementById('btn-stop'),
  transcribe: document.getElementById('btn-transcribe'),
  status: document.getElementById('status'),
  statusDot: document.getElementById('status-dot'),
  timer: document.getElementById('timer'),
  transcript: document.getElementById('transcript'),
  copy: document.getElementById('btn-copy')
};

let recorder = null;
let displayStream = null;
let chunks = [];
let savedFilePath = null;
let timerInterval = null;
let autoStopTimeout = null;
let recordingStartedAt = 0;

// Real-time mode state
let ws = null;
let audioCtx = null;
let liveFinalText = '';
let liveStopping = false;

function setStatus(text, tone = 'idle') {
  els.status.textContent = text;
  els.statusDot.className = `status-dot ${tone}`;
}

function formatTime(totalSeconds) {
  const m = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
  const s = String(totalSeconds % 60).padStart(2, '0');
  return `${m}:${s}`;
}

function startTimer(maxSeconds) {
  recordingStartedAt = Date.now();
  els.timer.hidden = false;
  els.timer.textContent = `00:00 / ${formatTime(maxSeconds)}`;
  timerInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - recordingStartedAt) / 1000);
    els.timer.textContent = `${formatTime(elapsed)} / ${formatTime(maxSeconds)}`;
  }, 250);
}

function stopTimer() {
  clearInterval(timerInterval);
  clearTimeout(autoStopTimeout);
  timerInterval = null;
  autoStopTimeout = null;
}

async function captureSystemAudio() {
  try {
    // The main process answers this request with a screen source whose
    // audio is the system loopback — i.e. everything the computer plays.
    displayStream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: true
    });
  } catch (err) {
    setStatus(`Could not capture system audio: ${err.message}`, 'error');
    return null;
  }

  const audioTracks = displayStream.getAudioTracks();
  if (audioTracks.length === 0) {
    displayStream.getTracks().forEach((t) => t.stop());
    displayStream = null;
    setStatus('No system audio track available.', 'error');
    return null;
  }
  return new MediaStream(audioTracks);
}

function clampedMaxSeconds() {
  const maxSeconds = Math.max(1, Math.min(3600, Number(els.duration.value) || 60));
  els.duration.value = maxSeconds;
  return maxSeconds;
}

async function startRecording() {
  if (els.realtimeToggle.checked) return startRealtime();

  const maxSeconds = clampedMaxSeconds();
  const audioStream = await captureSystemAudio();
  if (!audioStream) return;

  chunks = [];
  savedFilePath = null;

  recorder = new MediaRecorder(audioStream, { mimeType: 'audio/webm;codecs=opus' });
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };
  recorder.onstop = onRecordingStopped;
  recorder.start(1000);

  els.record.disabled = true;
  els.record.classList.add('recording');
  els.stop.disabled = false;
  els.transcribe.disabled = true;

  startTimer(maxSeconds);
  autoStopTimeout = setTimeout(stopRecording, maxSeconds * 1000);
  setStatus('Recording system audio…', 'recording');
}

function stopRecording() {
  if (ws) return stopRealtime();
  if (!recorder || recorder.state === 'inactive') return;
  stopTimer();
  recorder.stop();
}

async function onRecordingStopped() {
  displayStream.getTracks().forEach((t) => t.stop());
  displayStream = null;
  recorder = null;

  els.record.disabled = false;
  els.record.classList.remove('recording');
  els.stop.disabled = true;
  els.timer.hidden = true;

  const blob = new Blob(chunks, { type: 'audio/webm' });
  chunks = [];

  if (blob.size === 0) {
    setStatus('Recording was empty — nothing was saved.', 'error');
    return;
  }

  try {
    const arrayBuffer = await blob.arrayBuffer();
    savedFilePath = await window.proListener.saveRecording(arrayBuffer);
    els.transcribe.disabled = false;
    setStatus(`Recording saved — ready to transcribe. (${savedFilePath})`, 'ok');
  } catch (err) {
    setStatus(`Failed to save recording: ${err.message}`, 'error');
  }
}

/* ---------- Real-time mode ---------- */

const REALTIME_SAMPLE_RATE = 16000;
const REALTIME_CHUNK_SAMPLES = 1600; // 100 ms at 16 kHz

function renderLiveTranscript(partialText) {
  const hasContent = liveFinalText || partialText;
  els.transcript.classList.toggle('empty', !hasContent);
  els.transcript.textContent = liveFinalText;
  if (partialText) {
    const span = document.createElement('span');
    span.className = 'partial';
    span.textContent = partialText;
    els.transcript.appendChild(span);
  }
  if (!hasContent) els.transcript.textContent = 'Listening…';
}

function handleRealtimeMessage(event) {
  let msg;
  try {
    msg = JSON.parse(event.data);
  } catch {
    return;
  }

  switch (msg.type) {
    case 'Begin':
      setStatus('Live — streaming system audio to WhisperAI…', 'recording');
      break;
    case 'Turn': {
      const text = msg.transcript ?? msg.text ?? '';
      if (msg.end_of_turn) {
        if (text.trim()) liveFinalText += (liveFinalText ? '\n\n' : '') + text.trim();
        renderLiveTranscript('');
      } else {
        renderLiveTranscript(text);
      }
      break;
    }
    case 'Termination': {
      const billed = msg.session_duration_seconds;
      setStatus(
        billed != null
          ? `Live session ended — ${Math.ceil(billed)}s of realtime usage.`
          : 'Live session ended.',
        'ok'
      );
      break;
    }
    case 'Error':
      setStatus(`Realtime error: ${msg.error ?? 'unknown error'}`, 'error');
      break;
  }
}

async function startRealtime() {
  const maxSeconds = clampedMaxSeconds();

  const audioStream = await captureSystemAudio();
  if (!audioStream) return;

  setStatus('Connecting to WhisperAI realtime…', 'working');
  const tokenResult = await window.proListener.getRealtimeToken();
  if (!tokenResult.ok) {
    displayStream.getTracks().forEach((t) => t.stop());
    displayStream = null;
    setStatus(tokenResult.error, 'error');
    return;
  }

  liveFinalText = '';
  liveStopping = false;
  els.copy.hidden = true;
  renderLiveTranscript('');

  const params = new URLSearchParams({
    token: tokenResult.token,
    speech_model: 'whisperai-realtime-pro',
    sample_rate: String(REALTIME_SAMPLE_RATE),
    encoding: 'pcm_s16le'
  });
  ws = new WebSocket(`wss://api.whisperai.com/v1/realtime/ws?${params}`);
  ws.binaryType = 'arraybuffer';

  ws.onopen = async () => {
    // Feed the loopback stream through a 16 kHz AudioContext (which
    // resamples) into the PCM worklet, batching ~100 ms per frame.
    audioCtx = new AudioContext({ sampleRate: REALTIME_SAMPLE_RATE });
    await audioCtx.audioWorklet.addModule('pcm-worklet.js');
    const source = audioCtx.createMediaStreamSource(audioStream);
    const worklet = new AudioWorkletNode(audioCtx, 'pcm-capture');

    let pending = new Int16Array(REALTIME_CHUNK_SAMPLES);
    let pendingLength = 0;
    worklet.port.onmessage = (e) => {
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      let data = e.data;
      while (data.length > 0) {
        const space = REALTIME_CHUNK_SAMPLES - pendingLength;
        const take = Math.min(space, data.length);
        pending.set(data.subarray(0, take), pendingLength);
        pendingLength += take;
        data = data.subarray(take);
        if (pendingLength === REALTIME_CHUNK_SAMPLES) {
          ws.send(pending.buffer.slice(0));
          pendingLength = 0;
        }
      }
    };
    source.connect(worklet);

    els.record.disabled = true;
    els.record.classList.add('recording');
    els.stop.disabled = false;
    els.transcribe.disabled = true;

    startTimer(maxSeconds);
    autoStopTimeout = setTimeout(stopRealtime, maxSeconds * 1000);
    setStatus('Live — streaming system audio to WhisperAI…', 'recording');
  };

  ws.onmessage = handleRealtimeMessage;

  ws.onerror = () => {
    if (!liveStopping) setStatus('Realtime connection failed.', 'error');
  };

  ws.onclose = () => {
    cleanupRealtime();
  };
}

function stopRealtime() {
  liveStopping = true;
  stopTimer();
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.close();
  } else {
    cleanupRealtime();
  }
}

function cleanupRealtime() {
  if (audioCtx) {
    audioCtx.close();
    audioCtx = null;
  }
  if (displayStream) {
    displayStream.getTracks().forEach((t) => t.stop());
    displayStream = null;
  }
  ws = null;

  stopTimer();
  els.record.disabled = false;
  els.record.classList.remove('recording');
  els.stop.disabled = true;
  els.transcribe.disabled = !savedFilePath;
  els.timer.hidden = true;

  if (liveFinalText) els.copy.hidden = false;
  if (els.statusDot.classList.contains('recording') || els.statusDot.classList.contains('working')) {
    setStatus('Live session ended.', 'ok');
  }
}

els.realtimeToggle.addEventListener('change', () => {
  if (els.realtimeToggle.checked) {
    setStatus('Real-time mode — press Record to stream live audio.', 'idle');
  } else {
    setStatus('Ready — press Record to capture system audio.', 'idle');
  }
});

async function transcribe() {
  if (!savedFilePath) return;

  els.transcribe.disabled = true;
  els.record.disabled = true;
  setStatus('Uploading recording & transcribing…', 'working');

  const result = await window.proListener.transcribe({
    filePath: savedFilePath,
    languageCode: els.language.value
  });

  els.transcribe.disabled = false;
  els.record.disabled = false;

  if (!result.ok) {
    setStatus(`Transcription failed: ${result.error}`, 'error');
    return;
  }

  const text = (result.text || '').trim();
  els.transcript.textContent = text || '(No speech detected in the recording.)';
  els.transcript.classList.toggle('empty', !text);
  els.copy.hidden = !text;
  setStatus('Transcription complete.', 'ok');
}

async function copyTranscript() {
  await navigator.clipboard.writeText(els.transcript.textContent);
  els.copy.textContent = 'Copied!';
  setTimeout(() => {
    els.copy.textContent = 'Copy';
  }, 1500);
}

els.record.addEventListener('click', startRecording);
els.stop.addEventListener('click', stopRecording);
els.transcribe.addEventListener('click', transcribe);
els.copy.addEventListener('click', copyTranscript);
