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

function setStatus(text, tone = 'idle') {
  els.status.textContent = text;
  els.statusDot.className = `status-dot ${tone}`;
}
