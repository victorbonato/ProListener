const els = {
  language: document.getElementById('language'),
  duration: document.getElementById('duration'),
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

async function startRecording() {
  const maxSeconds = Math.max(1, Math.min(3600, Number(els.duration.value) || 60));
  els.duration.value = maxSeconds;

  try {
    // The main process answers this request with a screen source whose
    // audio is the system loopback — i.e. everything the computer plays.
    displayStream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: true
    });
  } catch (err) {
    setStatus(`Could not capture system audio: ${err.message}`, 'error');
    return;
  }

  const audioTracks = displayStream.getAudioTracks();
  if (audioTracks.length === 0) {
    displayStream.getTracks().forEach((t) => t.stop());
    setStatus('No system audio track available.', 'error');
    return;
  }

  const audioStream = new MediaStream(audioTracks);
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
