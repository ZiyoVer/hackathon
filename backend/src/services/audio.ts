const MULAW_BIAS = 0x84;
const MULAW_CLIP = 32635;

export function mulawToPcm16(mulaw: Buffer): Buffer {
  const pcm = Buffer.alloc(mulaw.length * 2);
  for (let i = 0; i < mulaw.length; i += 1) {
    pcm.writeInt16LE(decodeMulawSample(mulaw[i]), i * 2);
  }
  return pcm;
}

export function pcm16ToMulaw(pcm: Buffer): Buffer {
  const samples = Math.floor(pcm.length / 2);
  const out = Buffer.alloc(samples);
  for (let i = 0; i < samples; i += 1) {
    out[i] = encodeMulawSample(pcm.readInt16LE(i * 2));
  }
  return out;
}

export function resamplePcm16(pcm: Buffer, inputRate: number, outputRate: number): Buffer {
  if (inputRate === outputRate) {
    return pcm;
  }
  const inputSamples = Math.floor(pcm.length / 2);
  const outputSamples = Math.max(1, Math.floor((inputSamples * outputRate) / inputRate));
  const output = Buffer.alloc(outputSamples * 2);

  for (let i = 0; i < outputSamples; i += 1) {
    const sourceIndex = Math.min(inputSamples - 1, Math.floor((i * inputRate) / outputRate));
    output.writeInt16LE(pcm.readInt16LE(sourceIndex * 2), i * 2);
  }
  return output;
}

function decodeMulawSample(sample: number): number {
  const mu = ~sample & 0xff;
  const sign = mu & 0x80;
  const exponent = (mu >> 4) & 0x07;
  const mantissa = mu & 0x0f;
  let pcm = ((mantissa << 3) + MULAW_BIAS) << exponent;
  pcm -= MULAW_BIAS;
  return sign ? -pcm : pcm;
}

function encodeMulawSample(sample: number): number {
  let pcm = Math.max(-MULAW_CLIP, Math.min(MULAW_CLIP, sample));
  const sign = pcm < 0 ? 0x80 : 0x00;
  if (pcm < 0) {
    pcm = -pcm;
  }
  pcm += MULAW_BIAS;

  let exponent = 7;
  for (let mask = 0x4000; (pcm & mask) === 0 && exponent > 0; mask >>= 1) {
    exponent -= 1;
  }
  const mantissa = (pcm >> (exponent + 3)) & 0x0f;
  return ~(sign | (exponent << 4) | mantissa) & 0xff;
}
