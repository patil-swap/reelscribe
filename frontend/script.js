/**
 * ReelScribe - Core Logic (Vanilla JS)
 * Version: 1.2
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
        currentView: 'transcript', // 'transcript' | 'remix'
        userVoice: localStorage.getItem('reelscribe_voice') || '',
        library: [],
        libraryView: 'grid', // grid or list
        libSelectedItems: new Set(), // For multi-select and bulk actions
        libFilterType: 'all', // all, original, imported, remix
        selectedSources: [], // IDs for remixing
        backendUrl: window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
            ? 'http://localhost:8000' 
            : '',
        
        // Google OAuth
        gToken: null,
        GOOGLE_CLIENT_ID: null // Will be fetched from /config
    };

    // --- DOM Elements ---
    const elements = {
        // Main Input
        urlInput: document.getElementById('url-input'),
        transcribeBtn: document.getElementById('transcribe-btn'),
        dropZone: document.getElementById('drop-zone'),
        fileInput: document.getElementById('file-input'),
        modelSelect: document.getElementById('model-select'),
        timestampToggle: document.getElementById('timestamp-toggle'),
        
        // Progress & Info
        progressCard: document.getElementById('progress-card'),
        progressPercent: document.getElementById('progress-percent'),
        progressBar: document.getElementById('progress-bar'),
        statusText: document.getElementById('status-text'),
        videoThumb: document.getElementById('video-thumb'),
        videoTitle: document.getElementById('video-title'),
        videoChannel: document.getElementById('video-channel'),
        cancelBtn: document.getElementById('cancel-btn'),
        
        // Result & Tabs
        resultSection: document.getElementById('result-section'),
        tabTranscript: document.getElementById('tab-transcript'),
        tabRemix: document.getElementById('tab-remix'),
        viewTranscript: document.getElementById('view-transcript'),
        viewRemix: document.getElementById('view-remix'),
        transcriptContainer: document.getElementById('transcript-container'),
        resetBtn: document.getElementById('reset-btn'),
        
        // Remix UI
        remixSourceList: document.getElementById('remix-source-list'),
        remixPrompt: document.getElementById('remix-prompt'),
        blendSlider: document.getElementById('blend-slider'),
        generateRemixBtn: document.getElementById('generate-remix-btn'),
        remixResult: document.getElementById('remix-result'),
        remixOutput: document.getElementById('remix-output'),
        remixTitle: document.getElementById('remix-title'),
        remixTags: document.getElementById('remix-tags'),
        diffArea: document.getElementById('diff-area'),
        diffLeft: document.getElementById('diff-left'),
        diffRight: document.getElementById('diff-right'),
        diffToggleBtn: document.getElementById('diff-toggle-btn'),
        saveVariantBtn: document.getElementById('save-variant-btn'),

        // Library & Modals
        libraryBtn: document.getElementById('library-btn'),
        libraryModal: document.getElementById('library-modal'),
        libraryContent: document.getElementById('library-content'),
        closeLibraryBtn: document.getElementById('close-library-btn'),
        libSearch: document.getElementById('lib-search'),
        libClearAll: document.getElementById('lib-clear-all'),
        libBulkImport: document.getElementById('lib-bulk-import'),
        libUploadBtn: document.getElementById('lib-upload-btn'),
        libUploadInput: document.getElementById('lib-upload-input'),
        libViewGrid: document.getElementById('lib-view-grid'),
        libViewList: document.getElementById('lib-view-list'),
        gDriveBtn: document.getElementById('gdrive-backup-btn'),
        
        voiceModal: document.getElementById('voice-modal'),
        voiceInput: document.getElementById('voice-input'),
        saveVoiceBtn: document.getElementById('save-voice-btn'),
        closeVoiceBtn: document.getElementById('close-voice-btn'),

        // Misc
        themeToggle: document.getElementById('theme-toggle'),
        sunIcon: document.getElementById('sun-icon'),
        moonIcon: document.getElementById('moon-icon'),
        recBadge: document.getElementById('rec-badge'),
        toastContainer: document.getElementById('toast-container'),
        copyTextBtn: document.getElementById('copy-text'),
        copyJsonBtn: document.getElementById('copy-json'),
        downloadTxtBtn: document.getElementById('download-txt'),
        downloadSrtBtn: document.getElementById('download-srt'),
        downloadVttBtn: document.getElementById('download-vtt'),
        downloadMdBtn: document.getElementById('download-md'),
        copyTimestampsBtn: document.getElementById('copy-timestamps'),
        videoDuration: document.getElementById('video-duration'),
        videoViews: document.getElementById('video-views'),
        remixVariantBtn: document.getElementById('remix-variant-btn'),
        libPreviewModal: document.getElementById('lib-preview-modal'),
        libPreviewTitle: document.getElementById('lib-preview-title'),
        libPreviewType: document.getElementById('lib-preview-type'),
        libPreviewDate: document.getElementById('lib-preview-date'),
        libPreviewText: document.getElementById('lib-preview-text'),
        libPreviewRemixBtn: document.getElementById('lib-preview-remix-btn'),
        libPreviewCloseBtn: document.getElementById('lib-preview-close-btn'),
        
        // Advanced & Bulk
        englishToggle: document.getElementById('english-toggle'),
        remixBackBtn: document.getElementById('remix-back-btn'),
        remixPlatform: document.getElementById('remix-platform'),
        hookSlider: document.getElementById('hook-slider'),
        hookStrengthLabel: document.getElementById('hook-strength-label'),
        remixTimestampToggle: document.getElementById('remix-timestamp-toggle'),
        libImportFolderBtn: document.getElementById('lib-import-folder-btn'),
        libExportZipBtn: document.getElementById('lib-export-zip-btn'),
        libFilterType: document.getElementById('lib-filter-type'),
        libSelectedCount: document.getElementById('lib-selected-count'),
    };

    // --- DB Setup (IndexedDB) ---
    const DB_NAME = 'reelscribeDB';
    const STORE_NAME = 'library';
    let db;

    const initDB = () => {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, 2);
            request.onerror = () => reject('DB Error');
            request.onsuccess = (e) => {
                db = e.target.result;
                resolve();
            };
            request.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    db.createObjectStore(STORE_NAME, { keyPath: 'id' });
                }
            };
        });
    };

    const saveToDB = (item) => {
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            const request = tx.objectStore(STORE_NAME).put(item);
            request.onsuccess = () => resolve();
            request.onerror = () => reject('Failed to save to DB');
        });
    };

    const getAllFromDB = () => {
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readonly');
            const request = tx.objectStore(STORE_NAME).getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject('Failed to load from DB');
        });
    };

    const deleteFromDB = (id) => {
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            const request = tx.objectStore(STORE_NAME).delete(id);
            request.onsuccess = () => resolve();
            request.onerror = () => reject('Failed to delete from DB');
        });
    };

    // --- Core Initialization ---
    const init = async () => {
        await initDB();
        await fetchConfig(); // Get environment-based config
        initTheme();
        state.userVoice = localStorage.getItem('userVoice');
        loadLibrary();
        setupEventListeners();
        setupKeyboardShortcuts();
        
        // Auto-load last transcript if exists
        const saved = localStorage.getItem('lastTranscript');
        if (saved) {
            state.lastTranscript = JSON.parse(saved);
            state.currentTitle = state.lastTranscript.title || 'transcript';
            showResult(state.lastTranscript);
        }
    };

    // --- View Handling ---
    function switchView(view) {
        state.currentView = view;
        if (view === 'transcript') {
            elements.viewTranscript.classList.remove('hidden');
            elements.viewRemix.classList.add('hidden');
            elements.tabTranscript.classList.add('glass-active');
            elements.tabRemix.classList.remove('glass-active');
            elements.tabRemix.classList.add('text-secondary');
        } else {
            elements.viewTranscript.classList.add('hidden');
            elements.viewRemix.classList.remove('hidden');
            elements.tabRemix.classList.add('glass-active');
            elements.tabTranscript.classList.remove('glass-active');
            elements.tabTranscript.classList.add('text-secondary');
            
            // Check for Voice Profile
            if (!state.userVoice) {
                // If skipped before, don't nag too hard, but show once per session or manually
                elements.voiceModal.classList.remove('hidden');
            }
            // Auto-load current transcript as source if just finished
            if (state.lastTranscript && state.selectedSources.length === 0) {
                loadSourcesIntoRemix([state.lastTranscript]);
            }
        }
    }

    // --- Transcription Flow ---
    async function startTranscription() {
        if (state.isLoading) return;

        const url = elements.urlInput.value.trim();
        const file = elements.fileInput.files[0];

        if (!url && !file) {
            showToast('Please provide a URL or upload a file.', 'error');
            return;
        }

        state.isLoading = true;
        state.abortController = new AbortController();
        
        updateProgress(0, 'Initializing...');
        elements.progressCard.classList.remove('hidden');
        elements.resultSection.classList.add('hidden');
        
        const formData = new FormData();
        formData.append('model', elements.modelSelect.value);
        formData.append('timestamps', elements.timestampToggle.checked);
        if (elements.englishToggle.checked) {
            formData.append('language', 'en');
        }

        try {
            if (url) {
                updateProgress(10, 'Fetching video info...');
                const infoRes = await fetch(`${state.backendUrl}/video-info?url=${encodeURIComponent(url)}`, { signal: state.abortController.signal });
                if (!infoRes.ok) throw await infoRes.json();
                const info = await infoRes.json();
                state.currentTitle = info.title;
                showVideoInfo(info);

                // §3.4 Length warnings
                const durationSec = info.duration || 0;
                if (durationSec > 4 * 3600) {
                    const proceed = confirm(`⚠️ This video is over 4 hours long (${Math.round(durationSec/3600)}h). Transcription will be very slow and may time out. Proceed anyway?`);
                    if (!proceed) {
                        state.isLoading = false;
                        elements.progressCard.classList.add('hidden');
                        return;
                    }
                } else if (durationSec > 2 * 3600) {
                    showToast(`⚠️ Long video (${Math.round(durationSec/60)} min). Transcription may take a while.`, 'info');
                }

                formData.append('url', url);
            } else {
                state.currentTitle = file.name.replace(/\.[^/.]+$/, "");
                showVideoInfo({ title: file.name, channel: `${(file.size/1024/1024).toFixed(1)} MB`, thumbnail_url: '' });
                formData.append('file', file);
            }

            // Fake progress
            let fakeProgress = 20;
            const timer = setInterval(() => {
                if (fakeProgress < 95) {
                    fakeProgress += Math.random() * 2;
                    updateProgress(fakeProgress, 'Transcribing with Whisper...');
                }
            }, 2000);

            const res = await fetch(`${state.backendUrl}/transcribe`, { 
                method: 'POST', 
                body: formData, 
                signal: state.abortController.signal 
            });
            clearInterval(timer);
            
            if (!res.ok) throw await res.json();
            const result = await res.json();
            
            state.lastTranscript = {
                ...result,
                id: uuid(),
                title: state.currentTitle,
                date: new Date().toISOString(),
                type: 'original'
            };
            
            await saveToDB(state.lastTranscript);
            showResult(state.lastTranscript);
            showToast('Transcription complete!', 'success');
            loadLibrary(); // refresh library
            
        } catch (err) {
            clearInterval(timer);
            if (err.name !== 'AbortError') handleError(err);
        } finally {
            state.isLoading = false;
            elements.progressCard.classList.add('hidden');
        }
    }

    // --- Remix Studio Logic ---
    async function generateRemix() {
        if (state.selectedSources.length === 0) {
            showToast('Please select at least one source transcript in the Library.', 'info');
            return;
        }

        const activeEmotion = document.querySelector('.emotion-pill.active')?.dataset.emotion || 'raw';
        const length = document.querySelector('.remix-len-btn.glass-active')?.dataset.len || '60s';
        
        // Advanced settings
        const platform = elements.remixPlatform.value !== 'none' ? `Platform: ${elements.remixPlatform.value}` : '';
        const hookStr = elements.hookSlider.value;
        const hookDesc = hookStr === '1' ? 'Subtle Hook' : hookStr === '3' ? 'Aggressive/Viral Hook' : 'Normal Hook';
        const tsCues = elements.remixTimestampToggle.checked ? 'Include timestamp cues [00:00] for cuts.' : '';

        const userPrompt = `emotion: ${activeEmotion} | ${platform} | ${hookDesc} | ${tsCues} | draft: ${elements.remixPrompt.value}`;
        
        state.isLoading = true;
        elements.generateRemixBtn.disabled = true;
        showToast('Generating script...', 'info');

        try {
            const body = {
                sources: state.selectedSources.map(s => s.transcript),
                userPrompt: `${userPrompt} | My Voice Style: ${state.userVoice || 'Natural spoken style, enthusiastic but clear.'}`,
                length: length,
                blend: parseFloat(elements.blendSlider.value)
            };

            const res = await fetch(`${state.backendUrl}/generate-script`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });

            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                // §5: 502 → retry with simplified prompt
                if (res.status === 502) {
                    showToast('Remix failed. Retrying with simplified prompt...', 'info');
                    const retryBody = { ...body, userPrompt: `${userPrompt}. JSON only.` };
                    const retryRes = await fetch(`${state.backendUrl}/generate-script`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(retryBody)
                    });
                    if (!retryRes.ok) throw await retryRes.json();
                    const retryData = await retryRes.json();
                    displayRemixResult(retryData);
                    showToast('Script remixed!', 'success');
                    return;
                }
                throw errData;
            }
            const data = await res.json();
            
            displayRemixResult(data);
            showToast('Script remixed!', 'success');
        } catch (err) {
            handleError(err);
        } finally {
            state.isLoading = false;
            elements.generateRemixBtn.disabled = false;
        }
    }

    function displayRemixResult(data) {
        elements.remixResult.classList.remove('hidden');
        elements.remixTitle.value = data.title;
        elements.remixOutput.innerText = data.script;
        
        // Tags
        elements.remixTags.innerHTML = (data.tags || []).map(t => `<span class="library-tag">#${t}</span>`).join('');
        
        // Setup Diff
        const originalText = state.selectedSources.map(s => s.transcript).join('\n\n');
        renderDiff(originalText, data.script);

        elements.remixResult.scrollIntoView({ behavior: 'smooth' });
    }

    function renderDiff(oldText, newText) {
        const diff = Diff.diffLines(oldText, newText);
        let leftHtml = '', rightHtml = '';

        diff.forEach((part) => {
            const colorClass = part.added ? 'diff-added' : part.removed ? 'diff-removed' : '';
            const line = part.value;
            
            if (part.added) {
                rightHtml += `<div class="${colorClass}">${line}</div>`;
            } else if (part.removed) {
                leftHtml += `<div class="${colorClass}">${line}</div>`;
            } else {
                leftHtml += `<div>${line}</div>`;
                rightHtml += `<div>${line}</div>`;
            }
        });

        elements.diffLeft.innerHTML = leftHtml;
        elements.diffRight.innerHTML = rightHtml;
    }

    function loadSourcesIntoRemix(sources) {
        state.selectedSources = sources;
        elements.remixSourceList.innerHTML = sources.map(s => `
            <div class="glass px-3 py-1.5 flex items-center gap-2 text-[10px] font-bold">
                <span class="truncate max-w-[150px] opacity-70">${s.title}</span>
                <button onclick="removeRemixSource('${s.id}')" class="hover:text-red-400">×</button>
            </div>
        `).join('');
    }

    window.removeRemixSource = (id) => {
        state.selectedSources = state.selectedSources.filter(s => s.id !== id);
        loadSourcesIntoRemix(state.selectedSources);
    };

    // --- Library Logic ---
    async function loadLibrary() {
        state.library = await getAllFromDB();
        renderLibrary();
    }

    function renderLibrary() {
        const query = elements.libSearch.value.toLowerCase();
        const filterType = state.libFilterType;

        const filtered = state.library.filter(item => {
            const matchesQuery = item.title.toLowerCase().includes(query) || item.transcript.toLowerCase().includes(query);
            const matchesType = filterType === 'all' || (item.type || 'transcript') === filterType;
            return matchesQuery && matchesType;
        }).sort((a,b) => new Date(b.date) - new Date(a.date));

        const layoutClass = state.libraryView === 'list' ? 'flex flex-col gap-4' : 'library-grid';

        elements.libraryContent.innerHTML = `
            <div class="${layoutClass}">
                ${filtered.length === 0 ? '<p class="text-secondary text-sm col-span-full text-center py-8">No items match your filter.</p>' : ''}
                ${filtered.map(item => `
                    <div class="library-item glass p-5 space-y-3 flex flex-col cursor-pointer group relative" data-id="${item.id}" onclick="openLibraryPreview('${item.id}')">
                        <div class="absolute top-4 right-4 z-10" onclick="event.stopPropagation()">
                            <input type="checkbox" class="lib-checkbox rounded border-white/10 bg-dark/50 text-primary focus:ring-primary/40 cursor-pointer w-4 h-4" 
                                onchange="toggleLibrarySelection('${item.id}', this.checked)"
                                ${state.libSelectedItems.has(item.id) ? 'checked' : ''}>
                        </div>
                        <div class="flex justify-between items-start pr-8">
                            <span class="text-[9px] font-black uppercase ${item.type === 'remix' ? 'text-cyan-400' : 'text-secondary'}">${item.type || 'transcript'}</span>
                            <span class="text-[9px] text-white/30">${new Date(item.date).toLocaleDateString()}</span>
                        </div>
                        <h4 class="font-bold text-sm line-clamp-2 pr-2">${item.title}</h4>
                        <p class="text-xs text-secondary line-clamp-3">${item.transcript}</p>
                        ${item.tags && item.tags.length ? `<div class="flex flex-wrap gap-1">${item.tags.map(t => `<span class="library-tag">#${t}</span>`).join('')}</div>` : ''}
                        <div class="mt-auto pt-4 flex justify-between items-center">
                            <button onclick="event.stopPropagation(); importToRemix('${item.id}')" class="text-[10px] font-bold text-primary hover:underline">REMIX THIS</button>
                            <button onclick="event.stopPropagation(); deleteItem('${item.id}')" class="text-red-400 opacity-0 group-hover:opacity-100 italic text-[10px] transition-opacity">Delete</button>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;

        updateBulkActionsVisibility();
    }

    window.toggleLibrarySelection = (id, checked) => {
        if (checked) {
            state.libSelectedItems.add(id);
        } else {
            state.libSelectedItems.delete(id);
        }
        updateBulkActionsVisibility();
    };

    function updateBulkActionsVisibility() {
        elements.libSelectedCount.innerText = state.libSelectedItems.size;
        if (state.libSelectedItems.size > 0) {
            elements.libBulkImport.classList.remove('hidden');
        } else {
            elements.libBulkImport.classList.add('hidden');
        }
    }

    window.importToRemix = (id) => {
        const item = state.library.find(i => i.id === id);
        if (item) {
            if (!state.selectedSources.find(s => s.id === id)) {
                loadSourcesIntoRemix([...state.selectedSources, item]);
            }
            elements.libraryModal.classList.add('hidden');
            switchView('remix');
            showToast('Transcript added to remix bag.', 'success');
        }
    };

    window.deleteItem = async (id) => {
        if (confirm('Delete this item?')) {
            await deleteFromDB(id);
            loadLibrary();
        }
    };

    // §3.7 Library card click → preview modal
    window.openLibraryPreview = (id) => {
        const item = state.library.find(i => i.id === id);
        if (!item) return;
        elements.libPreviewModal.dataset.previewId = id;
        elements.libPreviewTitle.innerText = item.title;
        elements.libPreviewType.innerText = item.type || 'transcript';
        elements.libPreviewDate.innerText = new Date(item.date).toLocaleString();
        elements.libPreviewText.innerText = item.transcript;
        elements.libPreviewModal.classList.remove('hidden');
    };

    // --- Event Listeners ---
    function setupEventListeners() {
        // Tabs
        elements.tabTranscript.onclick = () => switchView('transcript');
        elements.tabRemix.onclick = () => switchView('remix');

        // Transcribe
        elements.transcribeBtn.onclick = startTranscription;
        elements.cancelBtn.onclick = () => state.abortController?.abort();
        elements.resetBtn.onclick = resetUI;
        elements.themeToggle.onclick = toggleTheme;
        elements.modelSelect.onchange = updateModelBadge;

        // Remix Tools
        document.querySelectorAll('.emotion-pill').forEach(btn => {
            btn.onclick = () => {
                document.querySelectorAll('.emotion-pill').forEach(p => p.classList.remove('active'));
                btn.classList.add('active');
            };
        });

        document.querySelectorAll('.remix-len-btn').forEach(btn => {
            btn.onclick = () => {
                document.querySelectorAll('.remix-len-btn').forEach(p => {
                    p.classList.remove('glass-active');
                    p.classList.add('text-secondary');
                });
                btn.classList.add('glass-active');
                btn.classList.remove('text-secondary');
            };
        });

        elements.generateRemixBtn.onclick = generateRemix;
        elements.diffToggleBtn.onclick = () => elements.diffArea.classList.toggle('hidden');

        // §3.6 Remix This Variant — re-run generation with current output as the new seed
        elements.remixVariantBtn.onclick = () => {
            const currentScript = elements.remixOutput.innerText;
            if (!currentScript || currentScript.startsWith('Your remixed')) return;
            // Push the current generated script as the sole source
            const variantSeed = {
                id: uuid(),
                title: elements.remixTitle.value || 'Variant',
                transcript: currentScript,
                date: new Date().toISOString(),
                type: 'remix'
            };
            loadSourcesIntoRemix([variantSeed]);
            elements.remixResult.classList.add('hidden');
            generateRemix();
        };
        
        elements.saveVariantBtn.onclick = () => {
            const variant = {
                id: uuid(),
                title: elements.remixTitle.value,
                transcript: elements.remixOutput.innerText,
                date: new Date().toISOString(),
                type: 'remix',
                tags: []
            };
            saveToDB(variant);
            loadLibrary();
            showToast('Variant saved to library!', 'success');
        };

        elements.gDriveBtn.onclick = handleGDriveBackup;

        // Modals
        elements.libraryBtn.onclick = () => {
            loadLibrary();
            elements.libraryModal.classList.remove('hidden');
        };
        elements.closeLibraryBtn.onclick = () => elements.libraryModal.classList.add('hidden');
        elements.libSearch.oninput = renderLibrary;

        // §3.7 Library preview modal
        elements.libPreviewCloseBtn.onclick = () => elements.libPreviewModal.classList.add('hidden');
        elements.libPreviewRemixBtn.onclick = () => {
            const id = elements.libPreviewModal.dataset.previewId;
            if (id) {
                importToRemix(id);
                elements.libPreviewModal.classList.add('hidden');
            }
        };

        elements.libClearAll.onclick = () => {
            if(confirm('Clear ALL data? This cannot be undone.')) {
                indexedDB.deleteDatabase(DB_NAME);
                location.reload();
            }
        };

        elements.libUploadBtn.onclick = () => elements.libUploadInput.click();
        elements.libUploadInput.addEventListener('change', handleLibraryBulkUpload);

        elements.libViewGrid.onclick = () => setLibraryView('grid');
        elements.libViewList.onclick = () => setLibraryView('list');

        // Advanced & Bulk features listeners
        elements.remixBackBtn.onclick = () => switchView('transcript');
        
        elements.hookSlider.oninput = () => {
            const val = elements.hookSlider.value;
            elements.hookStrengthLabel.innerText = val === '1' ? 'Subtle' : val === '3' ? 'Viral' : 'Normal';
        };

        elements.libFilterType.onchange = renderLibrary;
        
        elements.libBulkImport.onclick = () => {
            const ids = Array.from(state.libSelectedItems);
            ids.forEach(id => {
                const item = state.library.find(i => i.id === id);
                if (item && !state.selectedSources.find(s => s.id === id)) {
                    state.selectedSources.push(item);
                }
            });
            loadSourcesIntoRemix(state.selectedSources);
            elements.libraryModal.classList.add('hidden');
            switchView('remix');
            showToast(`${ids.length} item(s) added to remix.`, 'success');
        };

        elements.libExportZipBtn.onclick = handleZipExport;
        elements.libImportFolderBtn.onclick = handleFolderImport;

        elements.saveVoiceBtn.onclick = () => {
            const val = elements.voiceInput.value.trim();
            if (val) {
                state.userVoice = val;
                localStorage.setItem('userVoice', val);
                elements.voiceModal.classList.add('hidden');
                showToast('Voice profile updated!', 'success');
            }
        };

        elements.closeVoiceBtn.onclick = () => {
            elements.voiceModal.classList.add('hidden');
            showToast('Using default neutral voice.', 'info');
        };

        // Export Actions
        elements.copyTextBtn.onclick = () => copyToClipboard(elements.transcriptContainer.innerText, 'Copied!');
        // §10.4 Copy with Timestamps
        elements.copyTimestampsBtn.onclick = () => {
            if (state.lastTranscript?.segments?.length) {
                const withTs = state.lastTranscript.segments
                    .map(s => `[${formatTime(s.start || 0)}] ${s.text}`).join('\n');
                copyToClipboard(withTs, 'Copied with timestamps!');
            } else {
                copyToClipboard(elements.transcriptContainer.innerText, 'Copied!');
            }
        };
        elements.copyJsonBtn.onclick = () => copyToClipboard(JSON.stringify(state.lastTranscript), 'JSON Copied!');
        elements.downloadTxtBtn.onclick = () => downloadFile(`${state.currentTitle}.txt`, elements.transcriptContainer.innerText);
        elements.downloadSrtBtn.onclick = () => downloadFile(`${state.currentTitle}.srt`, generateSRT(state.lastTranscript));
        elements.downloadVttBtn.onclick = () => downloadFile(`${state.currentTitle}.vtt`, generateVTT(state.lastTranscript));
        elements.downloadMdBtn.onclick = () => downloadFile(`${state.currentTitle}.md`, generateMarkdown(state.lastTranscript));

        // File handling
        elements.dropZone.onclick = () => elements.fileInput.click();
        elements.fileInput.onchange = handleFileSelect;
    }


    // --- File Handlers ---
    async function handleFileSelect() {
        const file = elements.fileInput.files[0];
        if (!file) return;

        // Special handling for JSON import (previously transcribed texts)
        if (file.name.endsWith('.json')) {
            try {
                const text = await file.text();
                const data = JSON.parse(text);
                
                // Basic validation: must have transcript
                if (!data.transcript) throw new Error('Invalid JSON format');

                const item = {
                    ...data,
                    id: data.id || uuid(),
                    title: data.title || file.name.replace('.json', ''),
                    date: data.date || new Date().toISOString(),
                    type: data.type || 'imported'
                };

                await saveToDB(item);
                await loadLibrary();
                showToast(`Imported: ${item.title}`, 'success');
                
                // Show in result area if it's a single import
                state.lastTranscript = item;
                state.currentTitle = item.title;
                showResult(item);
                
                elements.fileInput.value = ''; // Reset
                return;
            } catch (err) {
                showToast('Failed to import JSON. Invalid format.', 'error');
                return;
            }
        } else if (file.name.endsWith('.txt')) {
            try {
                const text = await file.text();
                const item = {
                    id: uuid(),
                    title: file.name.replace('.txt', ''),
                    transcript: text,
                    date: new Date().toISOString(),
                    type: 'imported'
                };

                await saveToDB(item);
                await loadLibrary();
                showToast(`Imported: ${item.title}`, 'success');
                
                state.lastTranscript = item;
                state.currentTitle = item.title;
                showResult(item);
                
                elements.fileInput.value = ''; // Reset
                return;
            } catch (err) {
                showToast('Failed to import TXT. Invalid format.', 'error');
                return;
            }
        }

        showToast(`Ready: ${file.name}`, 'info');
    }

    function setLibraryView(view) {
        state.libraryView = view;
        if (elements.libViewGrid && elements.libViewList) {
            elements.libViewGrid.classList.toggle('glass-active', view === 'grid');
            elements.libViewGrid.classList.toggle('text-secondary', view !== 'grid');
            elements.libViewList.classList.toggle('glass-active', view === 'list');
            elements.libViewList.classList.toggle('text-secondary', view !== 'list');
        }
        renderLibrary();
    }

    async function handleLibraryBulkUpload(event) {
        const files = Array.from(event.target.files || elements.libUploadInput.files);
        if (files.length === 0) return;
        
        showToast(`Importing ${files.length} files...`, 'info');
        let importedCount = 0;

        for (const file of files) {
            try {
                const text = await file.text();
                let item;
                const fileNameLower = file.name.toLowerCase();

                if (fileNameLower.endsWith('.json')) {
                    const data = JSON.parse(text);
                    if (!data.transcript) throw new Error('Invalid JSON');
                    item = {
                        ...data,
                        id: data.id || uuid(),
                        title: data.title || file.name.replace(/\.json$/i, ''),
                        date: data.date || new Date().toISOString(),
                        type: data.type || 'imported'
                    };
                } else if (fileNameLower.endsWith('.txt')) {
                    item = {
                        id: uuid(),
                        title: file.name.replace(/\.txt$/i, ''),
                        transcript: text,
                        date: new Date().toISOString(),
                        type: 'imported'
                    };
                } else {
                    continue; // Skip unsupported formats
                }

                await saveToDB(item);
                importedCount++;
            } catch (err) {
                console.error(`Failed to import ${file.name}:`, err);
            }
        }

        elements.libUploadInput.value = ''; // Reset
        await loadLibrary();
        showToast(`Successfully imported ${importedCount} files!`, 'success');
    }

    async function handleZipExport() {
        if (state.libSelectedItems.size === 0) return;
        
        try {
            showToast('Generating ZIP...', 'info');
            const zip = new JSZip();
            
            for (const id of state.libSelectedItems) {
                const item = state.library.find(i => i.id === id);
                if (item) {
                    const safeTitle = (item.title || 'transcript').replace(/[^a-z0-9]/gi, '_').toLowerCase();
                    const fileName = `${safeTitle}_${item.id.substring(0,6)}.txt`;
                    zip.file(fileName, item.transcript);
                }
            }
            
            const content = await zip.generateAsync({ type: 'blob' });
            const url = URL.createObjectURL(content);
            const a = document.createElement('a');
            a.href = url;
            a.download = `reelscribe_export_${new Date().toISOString().split('T')[0]}.zip`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            showToast('ZIP Export downloaded!', 'success');
        } catch (err) {
            console.error(err);
            showToast('Failed to export ZIP.', 'error');
        }
    }

    async function handleFolderImport() {
        if (!window.showDirectoryPicker) {
            alert("Your browser doesn't support Folder Import. Please use Chrome/Edge or the 'Import Files' button instead.");
            return;
        }

        try {
            const dirHandle = await window.showDirectoryPicker();
            showToast('Scanning folder...', 'info');
            let importedCount = 0;

            async function processDirectory(dir) {
                for await (const entry of dir.values()) {
                    if (entry.kind === 'file') {
                        const file = await entry.getFile();
                        const fileNameLower = file.name.toLowerCase();
                        
                        if (fileNameLower.endsWith('.txt')) {
                            const text = await file.text();
                            await saveToDB({
                                id: uuid(),
                                title: file.name.replace(/\.txt$/i, ''),
                                transcript: text,
                                date: new Date().toISOString(),
                                type: 'imported'
                            });
                            importedCount++;
                        } else if (fileNameLower.endsWith('.json')) {
                            try {
                                const text = await file.text();
                                const data = JSON.parse(text);
                                if (data.transcript) {
                                    await saveToDB({
                                        ...data,
                                        id: data.id || uuid(),
                                        title: data.title || file.name.replace(/\.json$/i, ''),
                                        date: data.date || new Date().toISOString(),
                                        type: data.type || 'imported'
                                    });
                                    importedCount++;
                                }
                            } catch (e) { /* skip bad json */ }
                        }
                    } else if (entry.kind === 'directory') {
                        await processDirectory(entry);
                    }
                }
            }

            await processDirectory(dirHandle);
            await loadLibrary();
            showToast(`Imported ${importedCount} items from folder.`, 'success');

        } catch (err) {
            if (err.name !== 'AbortError') {
                console.error(err);
                showToast('Failed to import folder.', 'error');
            }
        }
    }

    function handleError(err) {
        console.error("Application Error:", err);
        let msg = 'An error occurred. Please try again.';
        
        if (err instanceof SyntaxError) {
            msg = 'Server returned an invalid response (possibly an error page).';
        } else if (err && err.detail) {
            msg = err.detail; // FastAPI convention
        } else if (err && err.message) {
            msg = err.message;
        } else if (typeof err === 'string') {
            msg = err;
        }
        
        showToast(msg, 'error');
    }



    // --- Helpers ---
    function updateProgress(p, msg) {
        const val = Math.min(Math.round(p), 100);
        elements.progressBar.style.width = `${val}%`;
        elements.progressPercent.innerText = `${val}%`;
        elements.statusText.innerText = msg;
    }

    function showVideoInfo(info) {
        elements.videoTitle.innerText = info.title;
        elements.videoChannel.innerText = info.channel;
        // §3.2 Duration and view_count
        if (info.duration) {
            elements.videoDuration.innerText = `⏱ ${formatTime(info.duration)}`;
            elements.videoDuration.classList.remove('hidden');
        } else {
            elements.videoDuration.classList.add('hidden');
        }
        if (info.view_count) {
            elements.videoViews.innerText = `👁 ${info.view_count.toLocaleString()} views`;
            elements.videoViews.classList.remove('hidden');
        } else {
            elements.videoViews.classList.add('hidden');
        }
        if (info.thumbnail_url) {
            elements.videoThumb.src = info.thumbnail_url;
            elements.videoThumb.classList.remove('hidden');
        } else {
            elements.videoThumb.classList.add('hidden');
        }
    }

    function showResult(result) {
        elements.resultSection.classList.remove('hidden');
        let html = result.transcript;
        if (result.segments && result.segments.length > 0) {
            html = result.segments.map(s => `<span class="text-secondary font-mono mr-2">[${formatTime(s.start || 0)}]</span>${s.text}`).join('\n');
        }
        elements.transcriptContainer.innerHTML = html;
        localStorage.setItem('lastTranscript', JSON.stringify(result));
    }

    function resetUI() {
        elements.urlInput.value = '';
        elements.fileInput.value = '';
        elements.resultSection.classList.add('hidden');
        localStorage.removeItem('lastTranscript'); // Clear persistence for fresh start
        state.lastTranscript = null;
        switchView('transcript');
    }

    function initTheme() {
        document.documentElement.classList.toggle('dark', state.theme === 'dark');
        elements.sunIcon.classList.toggle('hidden', state.theme === 'dark');
        elements.moonIcon.classList.toggle('hidden', state.theme !== 'dark');
    }

    function toggleTheme() {
        state.theme = state.theme === 'dark' ? 'light' : 'dark';
        initTheme();
        localStorage.setItem('theme', state.theme);
    }

    function updateModelBadge() {
        elements.recBadge.classList.toggle('hidden', elements.modelSelect.value !== 'whisper-large-v3-turbo');
    }

    function showToast(msg, type) {
        const t = document.createElement('div');
        t.className = `toast glass p-4 text-xs font-bold rounded-xl border-l-4 ${type === 'error' ? 'border-red-500' : 'border-secondary'}`;
        t.innerText = msg;
        elements.toastContainer.appendChild(t);
        setTimeout(() => {
            t.style.opacity = '0';
            setTimeout(() => t.remove(), 400);
        }, 4000);
    }

    async function copyToClipboard(txt, msg) {
        await navigator.clipboard.writeText(txt);
        showToast(msg, 'success');
    }

    function downloadFile(name, content) {
        const b = new Blob([content], { type: 'text/plain' });
        const u = URL.createObjectURL(b);
        const a = document.createElement('a');
        a.href = u;
        a.download = name;
        a.click();
    }

    function formatTime(s) {
        const min = Math.floor(s / 60);
        const sec = Math.floor(s % 60);
        return `${min}:${sec.toString().padStart(2, '0')}`;
    }

    function uuid() {
        return Math.random().toString(36).substring(2, 11);
    }

    function setupKeyboardShortcuts() {
        document.onkeydown = (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); elements.urlInput.focus(); }
            // §3.8 Ctrl+Enter → start transcription
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); startTranscription(); }
            // Esc closes modals
            if (e.key === 'Escape') {
                elements.libraryModal.classList.add('hidden');
                elements.libPreviewModal.classList.add('hidden');
            }
        };
    }

    function sanitizeFilename(filename) {
        return filename.replace(/[^a-z0-9]/gi, '_').toLowerCase().substring(0, 50);
    }

    // --- Google Drive Backup Logic ---
    let tokenClient;

    async function fetchConfig() {
        try {
            const res = await fetch(`${state.backendUrl}/config`);
            const data = await res.json();
            state.GOOGLE_CLIENT_ID = data.GOOGLE_CLIENT_ID;
            console.log("Config loaded dynamically.");
        } catch (err) {
            console.error("Failed to fetch config:", err);
        }
    }

    async function handleGDriveBackup() {
        if (!state.GOOGLE_CLIENT_ID) {
            showToast('Google Drive integration not configured on server.', 'error');
            return;
        }

        if (!state.gToken) {
            initGSI();
            return;
        }

        try {
            showToast('Syncing with Google Drive...', 'info');
            const libraryJson = JSON.stringify(state.library);
            const folderId = await getOrCreateFolder();
            await uploadLibraryToDrive(folderId, libraryJson);
            showToast('Backup successful!', 'success');
        } catch (err) {
            console.error(err);
            state.gToken = null; // Reset token on failure
            showToast('Backup failed. Check console for details.', 'error');
        }
    }

    function initGSI() {
        tokenClient = google.accounts.oauth2.initTokenClient({
            client_id: state.GOOGLE_CLIENT_ID,
            scope: 'https://www.googleapis.com/auth/drive.file',
            callback: (res) => {
                if (res.error) return;
                state.gToken = res.access_token;
                handleGDriveBackup();
            }
        });
        tokenClient.requestAccessToken();
    }

    async function getOrCreateFolder() {
        const query = encodeURIComponent("name = 'ReelScribe Library' and mimeType = 'application/vnd.google-apps.folder' and trashed = false");
        const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${query}`, {
            headers: { Authorization: `Bearer ${state.gToken}` }
        });
        const data = await res.json();
        
        if (data.files && data.files.length > 0) {
            return data.files[0].id;
        }

        const createRes = await fetch(`https://www.googleapis.com/drive/v3/files`, {
            method: 'POST',
            headers: { 
                Authorization: `Bearer ${state.gToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                name: 'ReelScribe Library',
                mimeType: 'application/vnd.google-apps.folder'
            })
        });
        const folder = await createRes.json();
        return folder.id;
    }

    async function uploadLibraryToDrive(folderId, content) {
        const metadata = {
            name: 'reelscribe_backup.json',
            parents: [folderId]
        };

        const file = new Blob([content], { type: 'application/json' });
        const formData = new FormData();
        formData.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
        formData.append('file', file);

        const query = encodeURIComponent(`name = 'reelscribe_backup.json' and '${folderId}' in parents and trashed = false`);
        const searchRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${query}`, {
            headers: { Authorization: `Bearer ${state.gToken}` }
        });
        const searchData = await searchRes.json();

        let url = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
        let method = 'POST';

        if (searchData.files && searchData.files.length > 0) {
            const fileId = searchData.files[0].id;
            url = `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart`;
            method = 'PATCH';
        }

        const res = await fetch(url, {
            method: method,
            headers: { Authorization: `Bearer ${state.gToken}` },
            body: formData
        });

        if (!res.ok) throw await res.json();
    }

    function generateVTT(data) {
        if (!data || !data.segments || !data.segments.length) return data ? data.transcript : '';
        const pad = (n, z = 2) => String(n).padStart(z, '0');
        const toVttTime = (s) => {
            const ms = Math.floor((s % 1) * 1000);
            const secs = Math.floor(s);
            const h = Math.floor(secs / 3600);
            const m = Math.floor((secs % 3600) / 60);
            const sc = secs % 60;
            return `${pad(h)}:${pad(m)}:${pad(sc)}.${String(ms).padStart(3, '0')}`;
        };
        const cues = data.segments.map((s, i) =>
            `${i + 1}\n${toVttTime(s.start || 0)} --> ${toVttTime(s.end || 0)}\n${s.text.trim()}`
        ).join('\n\n');
        return `WEBVTT\n\n${cues}`;
    }

    function generateSRT(data) {
        if (!data || !data.segments) return data ? data.transcript : "";
        return data.segments.map((s, i) => {
            const msStart = Math.floor((s.start % 1) * 1000);
            const fullSecsStart = Math.floor(s.start);
            const hStart = Math.floor(fullSecsStart / 3600);
            const mStart = Math.floor((fullSecsStart % 3600) / 60);
            const sStart = fullSecsStart % 60;
            
            const msEnd = Math.floor((s.end % 1) * 1000);
            const fullSecsEnd = Math.floor(s.end);
            const hEnd = Math.floor(fullSecsEnd / 3600);
            const mEnd = Math.floor((fullSecsEnd % 3600) / 60);
            const sEnd = fullSecsEnd % 60;

            const start = `${hStart.toString().padStart(2, '0')}:${mStart.toString().padStart(2, '0')}:${sStart.toString().padStart(2, '0')},${msStart.toString().padStart(3, '0')}`;
            const end = `${hEnd.toString().padStart(2, '0')}:${mEnd.toString().padStart(2, '0')}:${sEnd.toString().padStart(2, '0')},${msEnd.toString().padStart(3, '0')}`;
            
            return `${i + 1}\n${start} --> ${end}\n${s.text.trim()}\n`;
        }).join('\n');
    }

    function generateMarkdown(data) {
        if (!data) return "";
        let md = `# ${state.currentTitle}\n\n`;
        if (data.model_used) md += `**Model:** ${data.model_used}\n`;
        md += `**Duration:** ${formatTime(data.duration || 0)}\n\n---\n\n`;
        
        if (data.segments) {
            md += data.segments.map(s => `> **[${formatTime(s.start)}]** ${s.text.trim()}`).join('\n\n');
        } else {
            md += data.transcript;
        }
        return md;
    }

    init();
});
