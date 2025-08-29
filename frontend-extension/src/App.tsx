import React, { useState, useRef } from "react";

const App: React.FC = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState("");
  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const handleMicClick = async () => {
    if (!isRecording) {
      wsRef.current = new WebSocket(
        "ws://localhost:8000/ws/transcribe_adaptive"
      );

      wsRef.current.onmessage = (event) => {
        const newText = event.data;
        setTranscript((prev) => prev + " " + newText);
      };

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            channelCount: 1,
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });

        const audioContext = new (window.AudioContext ||
          (window as any).webkitAudioContext)();

        const contextSampleRate = audioContext.sampleRate;
        console.log("AudioContext sample rate:", contextSampleRate);

        const source = audioContext.createMediaStreamSource(stream);
        let processingNode: ScriptProcessorNode;

        if (contextSampleRate !== 16000) {
          const processor = audioContext.createScriptProcessor(4096, 1, 1);

          processor.onaudioprocess = (event) => {
            if (wsRef.current?.readyState === WebSocket.OPEN) {
              const inputData = event.inputBuffer.getChannelData(0);
              const downsampleRatio = contextSampleRate / 16000;
              const outputLength = Math.floor(
                inputData.length / downsampleRatio
              );
              const outputData = new Float32Array(outputLength);

              for (let i = 0; i < outputLength; i++) {
                const sourceIndex = Math.floor(i * downsampleRatio);
                outputData[i] = inputData[sourceIndex];
              }

              wsRef.current.send(outputData.buffer);
            }
          };

          source.connect(processor);
          processor.connect(audioContext.destination);
          processingNode = processor;
        } else {
          const processor = audioContext.createScriptProcessor(4096, 1, 1);

          processor.onaudioprocess = (event) => {
            if (wsRef.current?.readyState === WebSocket.OPEN) {
              const audioData = event.inputBuffer.getChannelData(0);
              const buffer = new Float32Array(audioData);
              wsRef.current.send(buffer.buffer);
            }
          };

          source.connect(processor);
          processor.connect(audioContext.destination);
          processingNode = processor;
        }

        audioContextRef.current = audioContext;
        audioProcessorRef.current = processingNode;
        streamRef.current = stream;
        setIsRecording(true);
      } catch (error) {
        console.error("Error accessing microphone:", error);
      }
    } else {
      // Stop recording
      if (audioProcessorRef.current) {
        audioProcessorRef.current.disconnect();
        audioProcessorRef.current = null;
      }

      if (audioContextRef.current) {
        audioContextRef.current.close();
        audioContextRef.current = null;
      }

      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }

      wsRef.current?.close();
      setIsRecording(false);
    }
  };

  const clearTranscript = () => {
    setTranscript("");
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(transcript);
  };

  return (
    <div className="p-4 w-80">
      <h2 className="text-lg font-bold mb-3">Mic Transcriber 🎙️</h2>

      {/* Controls */}
      <div className="space-y-2 mb-4">
        <button
          onClick={handleMicClick}
          className={`w-full px-4 py-2 rounded font-medium ${
            isRecording
              ? "bg-red-500 text-white hover:bg-red-600"
              : "bg-blue-500 text-white hover:bg-blue-600"
          }`}
        >
          {isRecording ? "🔴 Stop Recording" : "🎙️ Start Recording"}
        </button>
      </div>

      {/* Transcript Display */}
      <div className="space-y-2">
        <div className="flex justify-between items-center">
          <span className="text-sm font-medium">Transcript:</span>
          <div className="space-x-1">
            <button
              onClick={copyToClipboard}
              className="text-xs px-2 py-1 bg-gray-200 rounded hover:bg-gray-300"
              disabled={!transcript}
            >
              Copy
            </button>
            <button
              onClick={clearTranscript}
              className="text-xs px-2 py-1 bg-gray-200 rounded hover:bg-gray-300"
              disabled={!transcript}
            >
              Clear
            </button>
          </div>
        </div>

        <div className="min-h-[100px] max-h-[200px] overflow-y-auto p-2 border rounded text-sm whitespace-pre-wrap bg-gray-50">
          {transcript || "Start recording to see transcription..."}
        </div>
      </div>

      {/* Status */}
      {isRecording && (
        <div className="mt-2 text-xs text-green-600 animate-pulse">
          🔴 Recording and transcribing...
        </div>
      )}
    </div>
  );
};

export default App;
