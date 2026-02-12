#!/usr/bin/env node

/**
 * Generates short WAV audio files for swing detection feedback.
 *
 * - swing-start.wav: 880 Hz (A5), 100ms, quick attack/decay
 * - swing-end.wav:   440 Hz (A4), 150ms, gentler fade
 *
 * No external dependencies — writes raw PCM WAV directly.
 *
 * Usage: node scripts/generate-sounds.js
 */

const fs = require('fs');
const path = require('path');

const SAMPLE_RATE = 44100;
const BITS_PER_SAMPLE = 16;
const NUM_CHANNELS = 1;

/**
 * Generate a sine wave with an amplitude envelope.
 * @param {number} frequency - Frequency in Hz
 * @param {number} durationMs - Duration in milliseconds
 * @param {number} attackMs - Attack time in milliseconds
 * @param {number} decayMs - Decay time in milliseconds
 * @param {number} amplitude - Peak amplitude (0-1)
 * @returns {Int16Array} PCM sample data
 */
function generateTone(frequency, durationMs, attackMs, decayMs, amplitude = 0.7) {
  const totalSamples = Math.floor((durationMs / 1000) * SAMPLE_RATE);
  const attackSamples = Math.floor((attackMs / 1000) * SAMPLE_RATE);
  const decaySamples = Math.floor((decayMs / 1000) * SAMPLE_RATE);
  const decayStart = totalSamples - decaySamples;

  const samples = new Int16Array(totalSamples);
  const maxVal = 32767;

  for (let i = 0; i < totalSamples; i++) {
    const t = i / SAMPLE_RATE;
    const sine = Math.sin(2 * Math.PI * frequency * t);

    // Envelope: linear attack, sustain, linear decay
    let envelope = 1.0;
    if (i < attackSamples) {
      envelope = i / attackSamples;
    } else if (i >= decayStart) {
      envelope = (totalSamples - i) / decaySamples;
    }

    samples[i] = Math.round(sine * envelope * amplitude * maxVal);
  }

  return samples;
}

/**
 * Write a mono 16-bit PCM WAV file.
 * @param {string} filePath - Output path
 * @param {Int16Array} samples - PCM sample data
 */
function writeWav(filePath, samples) {
  const dataSize = samples.length * (BITS_PER_SAMPLE / 8);
  const fileSize = 44 + dataSize; // 44-byte header + data

  const buffer = Buffer.alloc(fileSize);
  let offset = 0;

  // RIFF header
  buffer.write('RIFF', offset); offset += 4;
  buffer.writeUInt32LE(fileSize - 8, offset); offset += 4;
  buffer.write('WAVE', offset); offset += 4;

  // fmt subchunk
  buffer.write('fmt ', offset); offset += 4;
  buffer.writeUInt32LE(16, offset); offset += 4;           // subchunk size (PCM)
  buffer.writeUInt16LE(1, offset); offset += 2;            // audio format (1 = PCM)
  buffer.writeUInt16LE(NUM_CHANNELS, offset); offset += 2;
  buffer.writeUInt32LE(SAMPLE_RATE, offset); offset += 4;
  buffer.writeUInt32LE(SAMPLE_RATE * NUM_CHANNELS * (BITS_PER_SAMPLE / 8), offset); offset += 4; // byte rate
  buffer.writeUInt16LE(NUM_CHANNELS * (BITS_PER_SAMPLE / 8), offset); offset += 2; // block align
  buffer.writeUInt16LE(BITS_PER_SAMPLE, offset); offset += 2;

  // data subchunk
  buffer.write('data', offset); offset += 4;
  buffer.writeUInt32LE(dataSize, offset); offset += 4;

  // Write PCM samples
  for (let i = 0; i < samples.length; i++) {
    buffer.writeInt16LE(samples[i], offset);
    offset += 2;
  }

  fs.writeFileSync(filePath, buffer);
  console.log(`  ${path.basename(filePath)} (${(fileSize / 1024).toFixed(1)} KB, ${samples.length} samples)`);
}

// --- Generate sounds ---

const outputDir = path.join(__dirname, '..', 'assets', 'sounds');
fs.mkdirSync(outputDir, { recursive: true });

console.log('Generating swing feedback sounds...\n');

// Start sound: 880 Hz (A5), 100ms, quick attack/decay
const startSamples = generateTone(880, 100, 5, 40, 0.7);
writeWav(path.join(outputDir, 'swing-start.wav'), startSamples);

// End sound: 440 Hz (A4), 150ms, gentler fade
const endSamples = generateTone(440, 150, 10, 80, 0.6);
writeWav(path.join(outputDir, 'swing-end.wav'), endSamples);

console.log('\nDone.');
