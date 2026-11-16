#!/usr/bin/env python3
"""Generate voiceover audio locally — no API key, no ElevenLabs.

Free fallback chain (first available engine wins):
  1. kokoro — Kokoro-82M, fully local/offline, Apache-2.0 (pip install kokoro)
  2. edge   — edge-tts, Microsoft neural voices online, no key (pip install edge-tts)
  3. say    — macOS built-in TTS (zero install)

Usage:
  python3 scripts/make_vo.py <vo_script.txt> <out_dir> [--engine auto|kokoro|edge|say] [--voice NAME]

Input file: one VO block per blank-line-separated paragraph; lines starting
with '#' or '---' are skipped (headers/separators from the §10 script format).
Output: <out_dir>/vo_01.wav|mp3 … (numbered, in script order).
Word timing comes later from the real audio via faster-whisper, so any
engine works — see SKILL §10b for voices and per-block retakes.
"""
import argparse
import shutil
import subprocess
import sys
from pathlib import Path


def load_blocks(path):
    blocks, cur = [], []
    for raw in Path(path).read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or line.startswith("---"):
            if cur:
                blocks.append(" ".join(cur))
                cur = []
            continue
        cur.append(line)
    if cur:
        blocks.append(" ".join(cur))
    return blocks


def gen_kokoro(text, out, voice):
    from kokoro import KPipeline

    import numpy as np
    import soundfile as sf

    v = voice or "af_heart"
    pipe = KPipeline(lang_code=v[0] if v[:1] in ("a", "b") else "a")
    parts = []
    for r in pipe(text, voice=v, speed=1.0):
        a = getattr(r, "audio", None)
        if a is None and isinstance(r, tuple):
            a = r[-1]  # older pip versions yield (graphemes, phonemes, audio)
        if hasattr(a, "detach"):
            a = a.detach().cpu().numpy()
        parts.append(np.asarray(a))
    sf.write(out, np.concatenate(parts), 24000)


def gen_edge(text, out, voice):
    subprocess.run(
        ["edge-tts", "--voice", voice or "en-US-ChristopherNeural", "--text", text, "--write-media", str(out)],
        check=True,
    )


def gen_say(text, out, voice):
    aiff = out.with_suffix(".aiff")
    subprocess.run(["say", "-v", voice or "Samantha", "-o", str(aiff), text], check=True)
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(aiff), str(out)], check=True)
    aiff.unlink()


def have_kokoro():
    try:
        import kokoro  # noqa: F401
        import numpy  # noqa: F401
        import soundfile  # noqa: F401

        return True
    except ImportError:
        return False


def have_edge():
    return shutil.which("edge-tts") is not None


def have_say():
    return shutil.which("say") is not None


ENGINES = {
    "kokoro": (have_kokoro, gen_kokoro, ".wav"),
    "edge": (have_edge, gen_edge, ".mp3"),
    "say": (have_say, gen_say, ".wav"),
}
ORDER = ["kokoro", "edge", "say"]


def main():
    ap = argparse.ArgumentParser(description="Local VO generation: Kokoro → edge-tts → macOS say.")
    ap.add_argument("script", help="plain-text VO script (blank-line separated blocks)")
    ap.add_argument("out_dir", help="output directory, e.g. assets/vo")
    ap.add_argument("--engine", default="auto", choices=["auto", *ORDER])
    ap.add_argument("--voice", default=None, help="engine-specific voice name")
    a = ap.parse_args()

    blocks = load_blocks(a.script)
    if not blocks:
        sys.exit(f"No VO blocks found in {a.script}")

    if a.engine == "auto":
        name = next((e for e in ORDER if ENGINES[e][0]()), None)
        if not name:
            sys.exit("No TTS engine found. Try: pip install kokoro  |  pip install edge-tts  (macOS also has built-in 'say')")
    else:
        name = a.engine
        if not ENGINES[name][0]():
            hint = {"kokoro": "pip install kokoro", "edge": "pip install edge-tts", "say": "macOS only"}.get(name, "")
            sys.exit(f"Engine '{name}' unavailable ({hint}).")

    _, gen, ext = ENGINES[name]
    out = Path(a.out_dir)
    out.mkdir(parents=True, exist_ok=True)
    for i, block in enumerate(blocks, 1):
        target = out / f"vo_{i:02d}{ext}"
        gen(block, target, a.voice)
        print(f"  {target}")
    print(f"Done: {len(blocks)} block(s) via {name} -> {out}/")


if __name__ == "__main__":
    main()
