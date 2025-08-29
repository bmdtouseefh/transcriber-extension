class AudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.bufferSize = 4096;
    this.buffer = new Float32Array(this.bufferSize);
    this.bufferIndex = 0;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];

    if (input.length > 0) {
      const inputChannel = input[0]; // Get first (mono) channel

      for (let i = 0; i < inputChannel.length; i++) {
        this.buffer[this.bufferIndex] = inputChannel[i];
        this.bufferIndex++;

        // Send buffer when full
        if (this.bufferIndex >= this.bufferSize) {
          // Send copy of buffer to main thread
          this.port.postMessage(new Float32Array(this.buffer));
          this.bufferIndex = 0;
        }
      }
    }

    return true; // Keep processor alive
  }
}

registerProcessor("audio-processor", AudioProcessor);
