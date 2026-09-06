# Waveform Visualizer

A professional music visualizer built with the Web Audio API. Upload your audio files and watch real-time frequency visualization with a clean, minimal interface.

## Features

- 🎵 Upload and play MP3, WAV, FLAC, M4A files
- 📊 Real-time frequency visualization
- 📋 Playlist management with auto-advance
- 🎛️ Volume control and progress seeking
- ⌨️ Keyboard shortcuts (Space to play/pause)
- 📱 Responsive design

## How It Works

### Audio Processing
The application uses the Web Audio API to decode audio files and analyze frequency data in real-time. When you upload a file:

1. The file is read as an ArrayBuffer
2. It's decoded into an AudioBuffer using `decodeAudioData()`
3. An AnalyserNode captures frequency data every frame
4. The visualization draws bars representing frequency intensities

### Visualization Pipeline