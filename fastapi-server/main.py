from fastapi import FastAPI, WebSocket, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from faster_whisper import WhisperModel

import numpy as np


MODEL_NAME = "tiny.en" # small.en, base.en, tiny.en
DEVICE = "cpu"           
COMPUTE_TYPE = "int8"  

model = WhisperModel(MODEL_NAME, device=DEVICE, compute_type=COMPUTE_TYPE)

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "ok", "model": MODEL_NAME, "device": DEVICE, "compute_type": COMPUTE_TYPE}

@app.websocket("/ws/transcribe_adaptive")
async def websocket_transcribe_adaptive(ws: WebSocket):
    await ws.accept()
    try:
        audio_buffer = np.array([], dtype=np.float32)
        sample_rate = 16000
        min_chunk_duration = 3.0
        max_chunk_duration = 8.0  # Longer max for complete sentences
        min_chunk_size = int(sample_rate * min_chunk_duration)
        max_chunk_size = int(sample_rate * max_chunk_duration)
        
        silence_threshold = 0.01
        silence_duration_threshold = 0.8  # 800ms of silence triggers processing
        silence_samples_threshold = int(sample_rate * silence_duration_threshold)
        
        previous_text = ""
        
        while True:
            data = await ws.receive_bytes()
            new_audio = np.frombuffer(data, dtype=np.float32)
            audio_buffer = np.concatenate([audio_buffer, new_audio])
            
            # Check if we have minimum audio and detect silence
            if len(audio_buffer) >= min_chunk_size:
                # Look for silence at the end
                recent_samples = min(silence_samples_threshold, len(audio_buffer) - min_chunk_size)
                if recent_samples > 0:
                    recent_audio = audio_buffer[-recent_samples:]
                    recent_energy = np.mean(np.abs(recent_audio))
                    
                    # Process if we hit silence or max duration
                    should_process = (
                        recent_energy < silence_threshold or 
                        len(audio_buffer) >= max_chunk_size
                    )
                    
                    if should_process:
                        chunk = audio_buffer.copy()
                        
                        # Improved preprocessing
                        chunk = chunk / (np.max(np.abs(chunk)) + 1e-8)  # Normalize
                        
                        segments, info = model.transcribe(
                            chunk,
                            beam_size=5,  # Even higher for best quality
                            temperature=[0.0, 0.2],  # Multiple temperatures
                            patience=2.0,
                            condition_on_previous_text=True,
                            compression_ratio_threshold=2.4,
                            log_prob_threshold=-1.0,
                            no_speech_threshold=0.6,
                            vad_filter=True,
                            vad_parameters=dict(
                                min_silence_duration_ms=100,
                                speech_pad_ms=200
                            ),
                            language="en",
                        )
                        
                        current_text = "".join([segment.text for segment in segments]).strip()
                        
                        if current_text and current_text != previous_text:
                            # More sophisticated deduplication
                            if previous_text and current_text.startswith(previous_text):
                                new_part = current_text[len(previous_text):].strip()
                            else:
                                new_part = current_text
                            
                            if new_part:
                                await ws.send_text(new_part)
                                previous_text = current_text
                        
                        # Keep small buffer for context
                        keep_samples = int(sample_rate * 0.5)  # 500ms
                        audio_buffer = audio_buffer[-keep_samples:] if len(audio_buffer) > keep_samples else np.array([], dtype=np.float32)
                
    except Exception as e:
        await ws.close()
        raise HTTPException(500,detail=f"WebSocket error: {e}")
        