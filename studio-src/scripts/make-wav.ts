/**
 * Writes a WAV of the synthesized violin playing G major (one octave, up and
 * down) for Chromium's fake microphone in the browser tests:
 *   --use-file-for-fake-audio-capture=<this file>
 *
 *   npm run wav -- out.wav
 */
import { writeFileSync } from "node:fs";
import { midiToFreq } from "../src/dsp/notes";
import { buildDrill } from "../src/dsp/theory";
import { renderPhrase, type PhraseNote } from "../src/dsp/violin";

const out = process.argv[2] ?? "violin-gmajor.wav";
const sr = 48000;
const drill = buildDrill({ instrument: "violin", tonic: "G", mode: "major", form: "scale", octaves: 1 });
// A little intonation error per note so the scores are not all perfect.
const errors = [2, -6, 9, -3, 4, -12, 7, 1, -4, 6, -2, 11, -7, 3, 0];
const notes: PhraseNote[] = drill.map((n, i) => ({ freq: midiToFreq(n.midi + errors[i % errors.length] / 100), start: 0.4 + i * 0.85, duration: 0.7, vibratoDepth: 14 }));
const audio = renderPhrase(notes, sr, 3, 1.2);

const data = Buffer.alloc(44 + audio.length * 2);
data.write("RIFF", 0);
data.writeUInt32LE(36 + audio.length * 2, 4);
data.write("WAVE", 8);
data.write("fmt ", 12);
data.writeUInt32LE(16, 16);
data.writeUInt16LE(1, 20); // PCM
data.writeUInt16LE(1, 22); // mono
data.writeUInt32LE(sr, 24);
data.writeUInt32LE(sr * 2, 28);
data.writeUInt16LE(2, 32);
data.writeUInt16LE(16, 34);
data.write("data", 36);
data.writeUInt32LE(audio.length * 2, 40);
for (let i = 0; i < audio.length; i++) data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, audio[i] * 1.6)) * 32767), 44 + i * 2);
writeFileSync(out, data);
console.log(`${out}: ${(audio.length / sr).toFixed(1)} s, ${drill.map((n) => n.label).join(" ")}`);
