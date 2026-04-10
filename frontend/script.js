/**
 * ReelScribe - Core Logic (Vanilla JS)
 */

document.addEventListener('DOMContentLoaded', () => {
    // --- State Management ---
    let state = {
        isLoading: false,
        isAborted: false,
        lastTranscript: null,
        abortController: null,
        theme: localStorage.getItem('theme') || 'dark',
        currentTitle: 'transcript',
        backendUrl: window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
            ? 'http://localhost:8000' 
            : '' // Relative if deployed together, or put Railway URL here
    };

    // --- DOM Elements ---
    const elements = {
        urlInput: document.getElementById('url-input'),
        transcribeBtn: document.getElementById('transcribe-btn'),
        dropZone: document.getElementById('drop-zone'),
        fileInput: document.getElementById('file-input'),
        modelSelect: document.getElementById('model-select'),
        timestampToggle: document.getElementById('timestamp-toggle'),
        progressCard: document.getElementById('progress-card'),
        progressPercent: document.getElementById('progress-percent'),
        progressBar: document.getElementById('progress-bar'),
        statusText: document.getElementById('status-text'),
        videoThumb: document.getElementById('video-thumb'),
        videoTitle: document.getElementById('video-title'),
        videoChannel: document.getElementById('video-channel'),
        cancelBtn: document.getElementById('cancel-btn'),
        resultSection: document.getElementById('result-section'),
        transcriptContainer: document.getElementById('transcript-container'),
        resetBtn: document.getElementById('reset-btn'),
        themeToggle: document.getElementById('theme-toggle'),
        sunIcon: document.getElementById('sun-icon'),
        moonIcon: document.getElementById('moon-icon'),
        recBadge: document.getElementById('rec-badge'),
        toastContainer: document.getElementById('toast-container'),
        
        // Buttons
        copyTextBtn: document.getElementById('copy-text'),
        copyJsonBtn: document.getElementById('copy-json'),
        downloadTxtBtn: document.getElementById('download-txt'),
        downloadSrtBtn: document.getElementById('download-srt'),
        downloadMdBtn: document.getElementById('download-md')
    };

    // --- Initialization ---
    initTheme();
    loadLastTranscript();
    setupEventListeners();
    setupKeyboardShortcuts();

    // --- Functions ---

    function setupEventListeners() {
        // Main Actions
        elements.transcribeBtn.addEventListener('click', startTranscription);
        elements.urlInput.addEventListener('keypress', (e) => e.key === 'Enter' && startTranscription());
        
        // File Upload
        elements.dropZone.addEventListener('click', () => elements.fileInput.click());
        elements.fileInput.addEventListener('change', handleFileSelect);
        elements.dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            elements.dropZone.classList.add('dragover');
        });
        elements.dropZone.addEventListener('dragleave', () => elements.dropZone.classList.remove('dragover'));
        elements.dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            elements.dropZone.classList.remove('dragover');
            if (e.dataTransfer.files.length) {
                elements.fileInput.files = e.dataTransfer.files;
                handleFileSelect();
            }
        });

        // Other Controls
        elements.cancelBtn.addEventListener('click', cancelTranscription);
        elements.resetBtn.addEventListener('click', resetUI);
        elements.themeToggle.addEventListener('click', toggleTheme);
        elements.modelSelect.addEventListener('change', updateModelBadge);
        
        // Export Actions
        elements.copyTextBtn.addEventListener('click', () => copyToClipboard(elements.transcriptContainer.innerText, 'Text copied!'));
        elements.copyJsonBtn.addEventListener('click', () => copyToClipboard(JSON.stringify(state.lastTranscript, null, 2), 'JSON copied!'));
        
        elements.downloadTxtBtn.addEventListener('click', () => {
            const filename = `${sanitizeFilename(state.currentTitle)}.txt`;
            downloadFile(filename, elements.transcriptContainer.innerText);
        });
        elements.downloadSrtBtn.addEventListener('click', () => {
            const filename = `${sanitizeFilename(state.currentTitle)}.srt`;
            downloadFile(filename, generateSRT(state.lastTranscript));
        });
        elements.downloadMdBtn.addEventListener('click', () => {
            const filename = `${sanitizeFilename(state.currentTitle)}.md`;
            downloadFile(filename, generateMarkdown(state.lastTranscript));
        });
    }

    function setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            // Ctrl/Cmd + K -> Focus URL
            if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
                e.preventDefault();
                elements.urlInput.focus();
            }
            // Ctrl/Cmd + Enter -> Start
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                e.preventDefault();
                startTranscription();
            }
            // Esc -> Cancel
            if (e.key === 'Escape' && state.isLoading) {
                cancelTranscription();
            }
        });
    }

    async function startTranscription() {
        if (state.isLoading) return;

        const url = elements.urlInput.value.trim();
        const file = elements.fileInput.files[0];

        if (!url && !file) {
            showToast('Please provide a URL or upload a file.', 'error');
            return;
        }

        // --- Prepare UI ---
        state.isLoading = true;
        state.isAborted = false;
        state.abortController = new AbortController();
        
        updateProgress(0, 'Initializing...');
        elements.progressCard.classList.remove('hidden');
        elements.resultSection.classList.add('hidden');
        elements.transcribeBtn.disabled = true;

        const formData = new FormData();
        formData.append('model', elements.modelSelect.value);
        formData.append('timestamps', elements.timestampToggle.checked);

        // --- Step 1: Handle URL (Get Info First) ---
        if (url) {
            try {
                updateProgress(10, 'Fetching video info...');
                const infoRes = await fetch(`${state.backendUrl}/video-info?url=${encodeURIComponent(url)}`, {
                    signal: state.abortController.signal
                });
                
                if (!infoRes.ok) throw await infoRes.json();
                
                const info = await infoRes.json();
                state.currentTitle = info.title;
                showVideoInfo(info);
                formData.append('url', url);
            } catch (err) {
                if (err.name === 'AbortError') return;
                handleError(err);
                return;
            }
        } else if (file) {
            state.currentTitle = file.name.replace(/\.[^/.]+$/, ""); // Remove extension
            elements.videoTitle.innerText = file.name;
            elements.videoChannel.innerText = `${(file.size / (1024 * 1024)).toFixed(2)} MB`;
            formData.append('file', file);
        }

        // --- Step 2: Simulate Progress ---
        // Since we don't have true server streaming, we'll simulate until ~90%
        let progress = 20;
        const progressInterval = setInterval(() => {
            if (progress < 90) {
                progress += Math.random() * 5;
                updateProgress(progress, 'Transcribing with Whisper...');
            }
        }, 3000);

        // --- Step 3: Transcribe Call ---
        try {
            updateProgress(progress, 'Processing audio...');
            const response = await fetch(`${state.backendUrl}/transcribe`, {
                method: 'POST',
                body: formData,
                signal: state.abortController.signal
            });

            clearInterval(progressInterval);

            if (!response.ok) throw await response.json();

            const result = await response.json();
            state.lastTranscript = result;
            showResult(result);
            showToast('Transcription complete!', 'success');
        } catch (err) {
            clearInterval(progressInterval);
            if (err.name === 'AbortError') {
                showToast('Transcription cancelled.', 'info');
                return;
            }
            handleError(err);
        } finally {
            state.isLoading = false;
            elements.transcribeBtn.disabled = false;
            elements.progressCard.classList.add('hidden');
        }
    }

    function cancelTranscription() {
        if (state.abortController) {
            state.abortController.abort();
            state.isAborted = true;
            resetUI();
        }
    }

    function updateProgress(percent, msg) {
        const p = Math.min(Math.round(percent), 100);
        elements.progressPercent.innerText = `${p}%`;
        elements.progressBar.style.width = `${p}%`;
        elements.statusText.innerText = msg;
    }

    function showVideoInfo(info) {
        elements.videoThumb.src = info.thumbnail_url;
        elements.videoThumb.classList.remove('hidden');
        elements.videoTitle.innerText = info.title;
        elements.videoChannel.innerText = info.channel;
    }

    function showResult(result) {
        elements.resultSection.classList.remove('hidden');
        
        let content = result.transcript;
        if (result.segments && result.segments.length > 0) {
            content = result.segments.map(s => {
                const time = formatTime(s.start);
                return `<span class="text-secondary font-mono mr-2">[${time}]</span> ${s.text}`;
            }).join('\n');
        }
        
        elements.transcriptContainer.innerHTML = content;
        
        // Add title to result for persistence
        result.title = state.currentTitle;
        localStorage.setItem('lastTranscript', JSON.stringify(result));
        
        // Scroll to result
        elements.resultSection.scrollIntoView({ behavior: 'smooth' });
    }

    function resetUI() {
        elements.urlInput.value = '';
        elements.fileInput.value = '';
        elements.progressCard.classList.add('hidden');
        elements.resultSection.classList.add('hidden');
        elements.videoThumb.classList.add('hidden');
        elements.videoTitle.innerText = 'Processing...';
        elements.videoChannel.innerText = '';
        state.isLoading = false;
    }

    function handleFileSelect() {
        const file = elements.fileInput.files[0];
        if (file) {
            elements.urlInput.value = ''; // Clear URL if file is selected
            showToast(`Selected: ${file.name}`, 'info');
        }
    }

    function handleError(err) {
        console.error(err);
        const msg = err.detail || 'An unexpected error occurred.';
        showToast(msg, 'error');
        elements.progressCard.classList.add('hidden');
        state.isLoading = false;
        elements.transcribeBtn.disabled = false;
    }

    // --- Helpers ---

    function formatTime(seconds) {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = Math.floor(seconds % 60);
        return `${h > 0 ? h.toString().padStart(2, '0') + ':' : ''}${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }

    function showToast(message, type = 'info') {
        const toast = document.createElement('div');
        const colors = {
            success: 'bg-green-500/20 border-green-500 text-green-500',
            error: 'bg-red-500/20 border-red-500 text-red-500',
            info: 'bg-blue-500/20 border-blue-500 text-blue-500'
        };
        
        toast.className = `toast glass p-4 rounded-lg flex items-center justify-between pointer-events-auto ${colors[type]}`;
        toast.innerHTML = `
            <span class="text-sm font-medium">${message}</span>
            <button class="ml-4 text-white/50 hover:text-white">&times;</button>
        `;
        
        elements.toastContainer.appendChild(toast);
        
        const remove = () => {
            toast.style.transform = 'translateX(100%)';
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 300);
        };

        toast.querySelector('button').onclick = remove;
        setTimeout(remove, 4000);
    }

    function initTheme() {
        if (state.theme === 'light') {
            document.documentElement.classList.remove('dark');
            elements.sunIcon.classList.remove('hidden');
            elements.moonIcon.classList.add('hidden');
        } else {
            document.documentElement.classList.add('dark');
            elements.sunIcon.classList.add('hidden');
            elements.moonIcon.classList.remove('hidden');
        }
    }

    function toggleTheme() {
        state.theme = state.theme === 'dark' ? 'light' : 'dark';
        document.documentElement.classList.toggle('dark');
        elements.sunIcon.classList.toggle('hidden');
        elements.moonIcon.classList.toggle('hidden');
        localStorage.setItem('theme', state.theme);
    }

    function updateModelBadge() {
        if (elements.modelSelect.value === 'whisper-large-v3-turbo') {
            elements.recBadge.classList.remove('hidden');
        } else {
            elements.recBadge.classList.add('hidden');
        }
    }

    function loadLastTranscript() {
        const saved = localStorage.getItem('lastTranscript');
        if (saved) {
            state.lastTranscript = JSON.parse(saved);
            state.currentTitle = state.lastTranscript.title || 'transcript';
            showResult(state.lastTranscript);
            showToast('Last transcript restored.', 'info');
        }
    }

    async function copyToClipboard(text, msg) {
        try {
            await navigator.clipboard.writeText(text);
            showToast(msg, 'success');
        } catch (err) {
            showToast('Failed to copy.', 'error');
        }
    }

    function downloadFile(filename, content) {
        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    }

    function generateSRT(data) {
        if (!data || !data.segments) return data ? data.transcript : "";
        return data.segments.map((s, i) => {
            const start = formatSRTTime(s.start);
            const end = formatSRTTime(s.end);
            return `${i + 1}\n${start} --> ${end}\n${s.text.trim()}\n`;
        }).join('\n');
    }

    function formatSRTTime(seconds) {
        const ms = Math.floor((seconds % 1) * 1000);
        const fullSecs = Math.floor(seconds);
        const h = Math.floor(fullSecs / 3600);
        const m = Math.floor((fullSecs % 3600) / 60);
        const s = fullSecs % 60;
        return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')},${ms.toString().padStart(3, '0')}`;
    }

    function generateMarkdown(data) {
        if (!data) return "";
        let md = `# ${state.currentTitle}\n\n`;
        md += `**Model:** ${data.model_used}\n`;
        md += `**Duration:** ${formatTime(data.duration)}\n\n---\n\n`;
        
        if (data.segments) {
            md += data.segments.map(s => `> **[${formatTime(s.start)}]** ${s.text.trim()}`).join('\n\n');
        } else {
            md += data.transcript;
        }
        return md;
    }

    function sanitizeFilename(filename) {
        return filename.replace(/[^a-z0-9]/gi, '_').toLowerCase().substring(0, 50);
    }
});
