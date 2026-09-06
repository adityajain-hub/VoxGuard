import asyncio
import websockets
import aiohttp
import numpy as np
import io
import soundfile as sf
import os
import sys

async def test_backend():
    print("Testing WebSocket...")
    try:
        async with websockets.connect("ws://localhost:8000/ws/analyze/live") as ws:
            # Send 32000 samples of raw Float32 data (2 seconds at 16kHz)
            dummy_audio = np.zeros(32000, dtype=np.float32)
            await ws.send(dummy_audio.tobytes())
            
            # Receive response
            response = await ws.recv()
            print(f"WebSocket Response: {response}")
    except Exception as e:
        print(f"WebSocket test failed: {e}")

    print("\nTesting Forensic Upload...")
    try:
        # Create a dummy valid WAV file
        dummy_wav = np.zeros(32000, dtype=np.float32)
        bio = io.BytesIO()
        sf.write(bio, dummy_wav, 16000, format='WAV', subtype='PCM_16')
        bio.seek(0)

        data = aiohttp.FormData()
        data.add_field('file', bio, filename='dummy.wav', content_type='audio/wav')
        data.add_field('caller_id', 'Test')
        data.add_field('amount', '0')

        async with aiohttp.ClientSession() as session:
            async with session.post("http://localhost:8000/api/analyze/forensic", data=data, headers={'X-API-Key': 'SIH-VOX-2026'}) as resp:
                result = await resp.json()
                print(f"Upload Response: {result}")
    except Exception as e:
        print(f"Upload test failed: {e}")

if __name__ == "__main__":
    asyncio.run(test_backend())
