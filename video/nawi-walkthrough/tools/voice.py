# Generates the narration: one WAV per script line (assets/voice/<id>.wav) plus word
# timestamps from the TTS engine itself (assets/voice/words/<id>.json), which
# tools/build.mjs uses to land every visual beat on the spoken word.
#
#   python tools/voice.py [l01,l02,...]     (needs: pip install edge-tts; ffmpeg on PATH)
import asyncio, json, os, subprocess, sys
import edge_tts

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VOICE = 'en-IN-PrabhatNeural'
RATE = '+30%'  # 1.3x pace

async def line(l, out_dir):
    words, audio = [], bytearray()
    comm = edge_tts.Communicate(l['say'], VOICE, rate=RATE, boundary='WordBoundary')
    async for ch in comm.stream():
        if ch['type'] == 'audio':
            audio.extend(ch['data'])
        elif ch['type'] == 'WordBoundary':
            s = ch['offset'] / 1e7
            words.append({'text': ch['text'], 'start': round(s, 3), 'end': round(s + ch['duration'] / 1e7, 3)})
    mp3 = os.path.join(out_dir, f"{l['id']}.mp3")
    with open(mp3, 'wb') as f:
        f.write(audio)
    wav = os.path.join(out_dir, f"{l['id']}.wav")
    # keep 0.3 s after the last word: the engine appends ~0.7 s of silence, and the
    # gaps between lines are set in build.mjs instead
    end = words[-1]['end'] + 0.3
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', mp3, '-t', f'{end:.3f}', '-af', f'afade=t=out:st={end - 0.08:.3f}:d=0.08',
                    '-ar', '48000', '-ac', '1', wav], check=True)
    os.remove(mp3)
    with open(os.path.join(out_dir, 'words', f"{l['id']}.json"), 'w', encoding='utf-8') as f:
        json.dump(words, f, indent=1)
    print(l['id'], len(words), 'words')

async def main():
    script = json.load(open(os.path.join(ROOT, 'script.json'), encoding='utf-8'))
    out_dir = os.path.join(ROOT, 'assets', 'voice')
    os.makedirs(os.path.join(out_dir, 'words'), exist_ok=True)
    only = sys.argv[1].split(',') if len(sys.argv) > 1 else None
    for sc in script['scenes']:
        for l in sc['lines']:
            if not only or l['id'] in only:
                await line(l, out_dir)

asyncio.run(main())
