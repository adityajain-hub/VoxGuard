class AudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.bufferSize = 4096;
    this.buffer = new Float32Array(this.bufferSize);
    this.bytesWritten = 0;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    if (input.length > 0) {
      const channelData = input[0];
      
      for (let i = 0; i < channelData.length; i++) {
        this.buffer[this.bytesWritten++] = channelData[i];
        
        if (this.bytesWritten >= this.bufferSize) {
          // Send the full buffer to the main thread
          this.port.postMessage(this.buffer);
          this.buffer = new Float32Array(this.bufferSize);
          this.bytesWritten = 0;
        }
      }
    }
    return true;
  }
}

registerProcessor('audio-processor', AudioProcessor);
