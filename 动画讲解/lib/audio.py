"""旁白轨 → chXX/build/audio/mix.wav（只有旁白，无配乐）。usage: .venv/bin/python lib/audio.py chXX [lang]"""
import json, subprocess, sys, wave
import numpy as np
SR = 44100
ch = sys.argv[1]; lang = sys.argv[2] if len(sys.argv) > 2 else 'zh'
base = f'{ch}/build' if lang == 'zh' else f'{ch}/build/{lang}'
TL = json.load(open(f'{base}/timeline.json'))
N = int((TL['total'] + 1.0) * SR); rng = np.random.default_rng(5)
def fft_conv(x, ir):
    n = 1 << (len(x) + len(ir) - 1).bit_length()
    return np.fft.irfft(np.fft.rfft(x, n) * np.fft.rfft(ir, n), n)[: len(x)]
def lp(x, fc):
    tau = 1 / (2 * np.pi * fc); k = np.exp(-np.arange(int(tau * SR * 6)) / (tau * SR)); k /= k.sum(); return fft_conv(x, k).astype(np.float32)
def load(path):
    tmp = path.replace('.mp3', '.wav'); subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', path, '-ar', str(SR), '-ac', '1', tmp], check=True)
    with wave.open(tmp) as w: return np.frombuffer(w.readframes(w.getnframes()), np.int16).astype(np.float32) / 32768
vo = np.zeros(N, np.float32)
for sc in TL['scenes']:
    x = load(f"{base}/audio/vo-{sc['id']}.mp3"); i = int((sc['start'] + sc['lead']) * SR); vo[i : i + len(x)] += x[: N - i]
vo = vo - lp(vo, 70)
ir = (rng.standard_normal(int(0.5 * SR)) * np.exp(-np.arange(int(0.5 * SR)) / SR * 9) * 0.01).astype(np.float32)
x = np.tanh(vo * 1.8) / 1.3 + fft_conv(vo, ir).astype(np.float32) * 0.6
x = x / max(np.abs(x).max(), 1e-6) * 0.89
with wave.open(f'{base}/audio/mix_raw.wav', 'wb') as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes((np.clip(x, -1, 1) * 32767).astype(np.int16).tobytes())
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', f'{base}/audio/mix_raw.wav', '-af', 'loudnorm=I=-16:TP=-1.5:LRA=9', '-ar', '48000', '-ac', '2', f'{base}/audio/mix.wav'], check=True)
print('mix.wav ok')
