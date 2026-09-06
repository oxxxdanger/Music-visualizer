// ============================================
// STATE MANAGEMENT
// ============================================

const state = {
    tracks: [],
    currentIndex: -1,
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    volume: 0.8,
    isDragging: false,
};

// ============================================
// DOM REFS
// ============================================

const canvas = document.getElementById('visualizerCanvas');
const ctx = canvas.getContext('2d');
const fileInput = document.getElementById('fileInput');
const uploadBtn = document.getElementById('uploadBtn');
const playlistContainer = document.getElementById('playlistContainer');
const playBtn = document.getElementById('playBtn');
const progressBar = document.getElementById('progressBar');
const currentTimeDisplay = document.getElementById('currentTime');
const totalTimeDisplay = document.getElementById('totalTime');
const volumeControl = document.getElementById('volumeControl');
const trackNameEl = document.querySelector('.track-name');
const trackArtistEl = document.querySelector('.track-artist');

// ============================================
// AUDIO ENGINE
// ============================================

let audioContext = null;
let analyser = null;
let dataArray = null;
let audioBuffer = null;
let sourceNode = null;
let gainNode = null;
let animationId = null;
let isAudioReady = false;

function initAudioContext() {
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 512;
        dataArray = new Uint8Array(analyser.frequencyBinCount);
        gainNode = audioContext.createGain();
        gainNode.gain.value = state.volume;
        analyser.connect(gainNode);
        gainNode.connect(audioContext.destination);
    }
    return audioContext;
}

function loadTrack(buffer) {
    if (sourceNode) {
        sourceNode.stop();
        sourceNode.disconnect();
    }

    audioBuffer = buffer;
    sourceNode = audioContext.createBufferSource();
    sourceNode.buffer = buffer;
    sourceNode.connect(analyser);

    state.duration = buffer.duration;
    state.currentTime = 0;

    updateTimeDisplay();
    progressBar.max = 100;
    progressBar.value = 0;
    progressBar.disabled = false;

    isAudioReady = true;
    updatePlayButton();

    // Play automatically
    playTrack();
}

function playTrack() {
    if (!isAudioReady || !sourceNode) return;

    if (audioContext.state === 'suspended') {
        audioContext.resume();
    }

    sourceNode.start(0, state.currentTime);
    state.isPlaying = true;
    updatePlayButton();
    startVisualization();
}

function pauseTrack() {
    if (sourceNode) {
        state.currentTime = audioContext.currentTime - sourceNode.startTime + state.currentTime;
        sourceNode.stop();
        sourceNode.disconnect();
        sourceNode = audioContext.createBufferSource();
        sourceNode.buffer = audioBuffer;
        sourceNode.connect(analyser);
        state.isPlaying = false;
        updatePlayButton();
        cancelAnimationFrame(animationId);
    }
}

function togglePlay() {
    if (!isAudioReady) return;
    if (state.isPlaying) {
        pauseTrack();
    } else {
        playTrack();
    }
}

function seekTo(percent) {
    if (!audioBuffer) return;
    state.currentTime = (percent / 100) * state.duration;
    if (state.isPlaying) {
        pauseTrack();
        playTrack();
    }
    updateTimeDisplay();
}

// ============================================
// VISUALIZATION ENGINE
// ============================================

function resizeCanvas() {
    const rect = canvas.parentElement.getBoundingClientRect();
    canvas.width = rect.width * window.devicePixelRatio;
    canvas.height = rect.height * window.devicePixelRatio;
    canvas.style.width = rect.width + 'px';
    canvas.style.height = rect.height + 'px';
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
}

function startVisualization() {
    if (animationId) cancelAnimationFrame(animationId);
    drawVisualization();
}

function drawVisualization() {
    if (!state.isPlaying) return;

    analyser.getByteFrequencyData(dataArray);

    const width = canvas.width / window.devicePixelRatio;
    const height = canvas.height / window.devicePixelRatio;

    ctx.clearRect(0, 0, width, height);

    const barWidth = width / dataArray.length;
    let x = 0;

    // Center line gradient
    const gradient = ctx.createLinearGradient(0, 0, width, 0);
    gradient.addColorStop(0, 'rgba(160, 180, 255, 0.4)');
    gradient.addColorStop(0.5, 'rgba(200, 220, 255, 0.8)');
    gradient.addColorStop(1, 'rgba(160, 180, 255, 0.4)');

    for (let i = 0; i < dataArray.length; i++) {
        const value = dataArray[i] / 255;
        const barHeight = value * height * 0.75;

        // Main bar
        const alpha = 0.3 + value * 0.5;
        ctx.fillStyle = `rgba(200, 215, 255, ${alpha * 0.6})`;
        ctx.fillRect(x, height/2 - barHeight/2, barWidth - 1, barHeight);

        // Glow bar (shorter, brighter)
        const glowHeight = barHeight * 0.3;
        ctx.fillStyle = `rgba(230, 240, 255, ${alpha * 0.3})`;
        ctx.fillRect(x, height/2 - glowHeight/2, barWidth - 1, glowHeight);

        // Center line accent
        if (value > 0.3) {
            ctx.fillStyle = `rgba(180, 200, 255, ${value * 0.2})`;
            ctx.fillRect(x, height/2 - 1, barWidth - 1, 2);
        }

        x += barWidth;
    }

    // Vignette effect
    const vignette = ctx.createRadialGradient(
        width/2, height/2, height * 0.1,
        width/2, height/2, height * 0.8
    );
    vignette.addColorStop(0, 'rgba(0,0,0,0)');
    vignette.addColorStop(1, 'rgba(0,0,0,0.3)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, width, height);

    // Update progress
    if (sourceNode && state.isPlaying) {
        const elapsed = audioContext.currentTime - sourceNode.startTime + state.currentTime;
        state.currentTime = Math.min(elapsed, state.duration);
        const percent = (state.currentTime / state.duration) * 100;
        if (!state.isDragging) {
            progressBar.value = percent;
        }
        updateTimeDisplay();

        // Auto-advance when track ends
        if (state.currentTime >= state.duration) {
            nextTrack();
            return;
        }
    }

    animationId = requestAnimationFrame(drawVisualization);
}

// ============================================
// PLAYLIST MANAGEMENT
// ============================================

function addTracks(files) {
    const validFiles = Array.from(files).filter(f => 
        f.type.startsWith('audio/') || 
        /\.(mp3|wav|flac|m4a|aac|ogg)$/i.test(f.name)
    );

    if (validFiles.length === 0) {
        alert('Please select audio files (MP3, WAV, FLAC, M4A, etc.)');
        return;
    }

    validFiles.forEach(file => {
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const arrayBuffer = e.target.result;
                const audioCtx = initAudioContext();
                const buffer = await audioCtx.decodeAudioData(arrayBuffer);
                
                const track = {
                    id: Date.now() + Math.random(),
                    name: file.name.replace(/\.[^/.]+$/, ''),
                    file: file,
                    buffer: buffer,
                };

                state.tracks.push(track);
                renderPlaylist();

                // Auto-play first track
                if (state.tracks.length === 1) {
                    selectTrack(0);
                }
            } catch (err) {
                console.error('Error loading track:', err);
            }
        };
        reader.readAsArrayBuffer(file);
    });
}

function selectTrack(index) {
    if (index < 0 || index >= state.tracks.length) return;

    const track = state.tracks[index];
    state.currentIndex = index;

    // Update UI
    trackNameEl.textContent = track.name;
    trackArtistEl.textContent = 'Local File';
    renderPlaylist();

    // Load the buffer
    if (track.buffer) {
        loadTrack(track.buffer);
    } else {
        // If buffer not loaded yet, reload the file
        const reader = new FileReader();
        reader.onload = async (e) => {
            const arrayBuffer = e.target.result;
            const audioCtx = initAudioContext();
            const buffer = await audioCtx.decodeAudioData(arrayBuffer);
            track.buffer = buffer;
            loadTrack(buffer);
        };
        reader.readAsArrayBuffer(track.file);
    }
}

function nextTrack() {
    if (state.tracks.length === 0) return;
    const next = (state.currentIndex + 1) % state.tracks.length;
    selectTrack(next);
}

function renderPlaylist() {
    if (state.tracks.length === 0) {
        playlistContainer.innerHTML = '<li class="empty-state">No tracks yet</li>';
        return;
    }

    playlistContainer.innerHTML = state.tracks.map((track, index) => `
        <li class="${index === state.currentIndex ? 'active' : ''}" 
            data-index="${index}">
            ${track.name}
        </li>
    `).join('');

    // Add click handlers
    playlistContainer.querySelectorAll('li[data-index]').forEach(el => {
        el.addEventListener('click', () => {
            const index = parseInt(el.dataset.index);
            if (index !== state.currentIndex) {
                selectTrack(index);
            }
        });
    });
}

// ============================================
// UI UPDATES
// ============================================

function updatePlayButton() {
    if (!isAudioReady) {
        playBtn.disabled = true;
        return;
    }
    playBtn.disabled = false;
    playBtn.innerHTML = state.isPlaying 
        ? `<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
            <rect x="6" y="4" width="4" height="16"/>
            <rect x="14" y="4" width="4" height="16"/>
           </svg>`
        : `<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
            <polygon points="5,3 19,12 5,21"/>
           </svg>`;
}

function updateTimeDisplay() {
    currentTimeDisplay.textContent = formatTime(state.currentTime);
    totalTimeDisplay.textContent = formatTime(state.duration);
}

function formatTime(seconds) {
    if (!seconds || isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// ============================================
// EVENT HANDLERS
// ============================================

// Upload
uploadBtn.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
        addTracks(e.target.files);
    }
    e.target.value = '';
});

// Play/Pause
playBtn.addEventListener('click', togglePlay);

// Progress
progressBar.addEventListener('input', (e) => {
    state.isDragging = true;
    seekTo(parseFloat(e.target.value));
});

progressBar.addEventListener('change', (e) => {
    state.isDragging = false;
    seekTo(parseFloat(e.target.value));
});

// Volume
volumeControl.addEventListener('input', (e) => {
    state.volume = parseFloat(e.target.value) / 100;
    if (gainNode) {
        gainNode.gain.value = state.volume;
    }
});

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return;
    if (e.code === 'Space') {
        e.preventDefault();
        togglePlay();
    }
});

// Window resize
window.addEventListener('resize', resizeCanvas);

// ============================================
// INITIALIZATION
// ============================================

function init() {
    resizeCanvas();
    renderPlaylist();
    updatePlayButton();
    updateTimeDisplay();

    // Demo: Preload a sample if you want - skip for cleaner start
    console.log('🎵 Music Visualizer ready');
}

init();


// Dark Mode Toggle
const toggleButton = document.getElementById('theme-toggle');
toggleButton.addEventListener('click', () => {
    document.body.classList.toggle('dark-mode');
    const isDark = document.body.classList.contains('dark-mode');
    toggleButton.textContent = isDark ? '☀️ Light Mode' : '🌙 Dark Mode';
    // Save preference
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
});

// Load saved preference on page load
if (localStorage.getItem('theme') === 'dark') {
    document.body.classList.add('dark-mode');
    toggleButton.textContent = '☀️ Light Mode';
}
