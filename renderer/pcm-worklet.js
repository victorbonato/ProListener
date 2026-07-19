// Converts incoming audio (already resampled to the AudioContext rate,
// 16 kHz) to mono 16-bit PCM frames and posts them to the main thread.
class PCMCaptureProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0];
    if (!input || input.length === 0 || input[0].length === 0) return true;

    const frames = input[0].length;
    const pcm = new Int16Array(frames);
    for (let i = 0; i < frames; i++) {
      let sample = 0;
      for (let ch = 0; ch < input.length; ch++) sample += input[ch][i];
      sample = Math.max(-1, Math.min(1, sample / input.length));
      pcm[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
    }
    this.port.postMessage(pcm, [pcm.buffer]);
    return true;
  }
}

registerProcessor('pcm-capture', PCMCaptureProcessor);
