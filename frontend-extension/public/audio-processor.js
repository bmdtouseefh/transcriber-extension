// audio-processor.js
class AudioDownsampleProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.port.onmessage = (event) => {};
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];

    if (input.length > 0) {
      const inputData = input[0];
      // Simple downsampling by taking every Nth sample.
      // A more advanced implementation might use interpolation for better quality.
      const downsampleRatio = sampleRate / 16000;
      const outputLength = Math.floor(inputData.length / downsampleRatio);
      const outputData = new Float32Array(outputLength);

      for (let i = 0; i < outputLength; i++) {
        const sourceIndex = Math.floor(i * downsampleRatio);
        outputData[i] = inputData[sourceIndex];
      }
      this.port.postMessage(outputData.buffer);
    }

    return true;
  }
}

registerProcessor("audio-downsample-processor", AudioDownsampleProcessor);
