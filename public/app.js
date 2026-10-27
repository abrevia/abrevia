// Abrevia 1 — Operations Workspace Frontend Logic
let currentTicket = null;
let pollInterval = null;
let dashboardMode = 'en';
let currentAttachment = null; // { file, base64, name, size, type, uploadedUrl }

const I18N = {
    en: {
        consoleBadge: 'Console',
        signOut: 'Sign Out',
        sidebarTitle: 'Active Conversations',
        refresh: '↻ Refresh',
        loadingQueues: 'Loading conversations...',
        noTickets: 'No active conversations.<br>Click "New Recipient Thread" below.',
        newThreadBtn: 'New Recipient Thread',
        selectConversation: 'Select a conversation',
        selectSubtitle: 'Choose a ticket from the sidebar or start a new thread',
        threadSubtitle: (id) => `Thread: ${id.slice(0, 8)}... • Two-Way SMS Relay`,
        activeBadge: 'Active',
        purgeBtn: 'End & Purge Thread',
        emptyFeedTitle: 'Select an active conversation to view and send bilingual messages',
        emptyFeedSubtitle: 'Inbound SMS translated to English • Outbound replies reviewed in Spanish',
        noMessagesInThread: 'No messages yet in this thread.<br>Send an outbound SMS reply below to start.',
        inputLabel: 'Type reply in English (Agent):',
        inputPlaceholder: 'Type your reply in English (e.g. Your delivery is scheduled for tomorrow at 2 PM)...',
        translateBtn: 'Send',
        translating: 'Translating...',
        progressStatus: 'AI Translating...',
        progressComplete: '✓ Translated & Verified (100%)',
        hitlTitle: 'Human-In-The-Loop Review (Spanish text to be sent via SMS):',
        hitlSubtitle: 'Edit text freely • Press Enter ↵ to send',
        cancelHitl: 'Cancel',
        sendBtn: 'Send SMS to Recipient',
        sendingSms: 'Sending SMS...',
        uploadingFile: 'Uploading attachment...',
        mmsNotice: 'MMS Attachment queued:',
        modalTitle: 'Start New Recipient Thread',
        modalSubtitle: 'Enter recipient\'s SMS phone number with country code (e.g. +14155552671 or +526601750245).',
        modalPhoneLabel: 'Phone Number',
        modalCancel: 'Cancel',
        modalSubmit: 'Create Thread',
        targetLang: 'Spanish',
        purgeConfirm: (phone) => `Are you sure you want to end and permanently purge conversation with ${phone}? All message records will be deleted.`,
        purgedNotice: 'Conversation data purged from server.',
        agentDeliveredSMS: 'Delivered SMS to Recipient (Spanish):',
        agentOriginalDraft: 'Original Agent Draft (English):',
        customerTranslated: 'Translated into English:',
        customerOriginal: 'Original Inbound SMS from Recipient (Spanish):',
        viewAttachment: 'View Attached File'
    },
    es: {
        consoleBadge: 'Console',
        signOut: 'Cerrar Sesión',
        sidebarTitle: 'Conversaciones Activas',
        refresh: '↻ Actualizar',
        loadingQueues: 'Cargando conversaciones...',
        noTickets: 'No hay conversaciones activas.<br>Haga clic en "Nuevo Hilo de Destinatario" abajo.',
        newThreadBtn: 'Nuevo Hilo de Destinatario',
        selectConversation: 'Selecciona una conversación',
        selectSubtitle: 'Elige un ticket de la barra lateral o inicia un nuevo hilo',
        threadSubtitle: (id) => `Hilo: ${id.slice(0, 8)}... • Relevo SMS Bilingüe`,
        activeBadge: 'Activo',
        purgeBtn: 'Finalizar y Purgar Hilo',
        emptyFeedTitle: 'Selecciona una conversación activa para ver y enviar mensajes bilingües',
        emptyFeedSubtitle: 'Mensajes entrantes traducidos a español • Respuestas salientes revisadas en inglés',
        noMessagesInThread: 'Aún no hay mensajes en este hilo.<br>Envía una respuesta SMS abajo para iniciar.',
        inputLabel: 'Escribe respuesta en Español (Agente):',
        inputPlaceholder: 'Escribe tu respuesta en español (ej. Su entrega está programada para mañana a las 2 PM)...',
        translateBtn: 'Enviar',
        translating: 'Traduciendo...',
        progressStatus: 'Traducción IA en progreso...',
        progressComplete: '✓ Traducción Verificada (100%)',
        hitlTitle: 'Revisión Humana HITL (Texto en inglés que se enviará por SMS):',
        hitlSubtitle: 'Edita el texto libremente • Presiona Enter ↵ para enviar',
        cancelHitl: 'Cancelar',
        sendBtn: 'Enviar SMS al Destinatario',
        sendingSms: 'Enviando SMS...',
        uploadingFile: 'Subiendo archivo adjunto...',
        mmsNotice: 'Archivo MMS adjunto:',
        modalTitle: 'Iniciar Nuevo Hilo de Destinatario',
        modalSubtitle: 'Ingresa el número de teléfono del destinatario con código de país (ej. +526601750245 o +14155552671).',
        modalPhoneLabel: 'Número de Teléfono',
        modalCancel: 'Cancelar',
        modalSubmit: 'Crear Hilo',
        targetLang: 'English',
        purgeConfirm: (phone) => `¿Estás seguro de que deseas finalizar y purgar permanentemente la conversación con ${phone}? Todos los registros se eliminarán.`,
        purgedNotice: 'Los datos de la conversación han sido purgados del servidor.',
        agentDeliveredSMS: 'SMS Enviado al Destinatario (Inglés):',
        agentOriginalDraft: 'Borrador Original del Agente (Español):',
        customerTranslated: 'Traducido al Español:',
        customerOriginal: 'SMS Original Entrante del Destinatario (Inglés):',
        viewAttachment: 'Ver Archivo Adjunto'
    }
};

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    // Determine language mode from URL param ?lang= or localStorage
    const params = new URLSearchParams(window.location.search);
    const paramLang = params.get('lang');
    if (paramLang && (paramLang === 'en' || paramLang === 'es')) {
        dashboardMode = paramLang;
        localStorage.setItem('abrevia_agent_lang', dashboardMode);
    } else {
        dashboardMode = localStorage.getItem('abrevia_agent_lang') || 'en';
    }

    applyDashboardLocalization();
    refreshTickets();

    // Keyboard shortcuts: Enter to Translate and Enter to Send SMS
    const agentInput = document.getElementById('agent-input');
    if (agentInput) {
        agentInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                // If HITL box is open with text, send it; otherwise translate draft
                const hitlContainer = document.getElementById('hitlContainer');
                const targetReview = document.getElementById('target-review-box');
                if (hitlContainer && !hitlContainer.classList.contains('hidden') && targetReview?.value.trim()) {
                    confirmAndSend();
                } else {
                    handleTranslateAndSend();
                }
            }
        });
    }

    const reviewBox = document.getElementById('target-review-box');
    if (reviewBox) {
        reviewBox.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                confirmAndSend();
            }
        });
    }

    // Poll for new messages/tickets every 5 seconds
    pollInterval = setInterval(() => {
        refreshTickets(false);
        if (currentTicket) {
            fetchMessages(currentTicket.id, false);
        }
    }, 5000);
});

// Mode switch handler
function switchDashboardMode(mode) {
    dashboardMode = mode;
    localStorage.setItem('abrevia_agent_lang', mode);
    applyDashboardLocalization();
    
    // Re-render feed if ticket open
    if (currentTicket) {
        fetchMessages(currentTicket.id, false);
    }
}

// Apply localization strings to all UI elements
function applyDashboardLocalization() {
    const t = I18N[dashboardMode];

    // Header buttons
    const btnEn = document.getElementById('modeBtnEn');
    const btnEs = document.getElementById('modeBtnEs');
    if (dashboardMode === 'en') {
        btnEn.className = 'px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-1.5 bg-brand-600 text-white shadow-sm transition';
        btnEs.className = 'px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-1.5 text-slate-400 hover:text-white transition';
    } else {
        btnEs.className = 'px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-1.5 bg-brand-600 text-white shadow-sm transition';
        btnEn.className = 'px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-1.5 text-slate-400 hover:text-white transition';
    }

    // Header title next to logo
    const headerTitle = document.getElementById('headerConsoleTitle');
    if (headerTitle) headerTitle.textContent = t.consoleBadge;
    document.getElementById('signOutLink').textContent = t.signOut;
    document.getElementById('sidebarTitle').textContent = t.sidebarTitle;
    document.getElementById('refreshBtn').textContent = t.refresh;
    document.getElementById('newThreadBtnText').textContent = t.newThreadBtn;

    if (!currentTicket) {
        document.getElementById('activeCustomerTitle').textContent = t.selectConversation;
        document.getElementById('activeSubtitle').textContent = t.selectSubtitle;
    } else {
        document.getElementById('activeCustomerTitle').textContent = `${dashboardMode === 'en' ? 'Recipient' : 'Destinatario'}: ${currentTicket.customer_phone}`;
        document.getElementById('activeSubtitle').textContent = t.threadSubtitle(currentTicket.id);
    }

    document.getElementById('activeBadge').textContent = t.activeBadge;
    const purgeBtnEl = document.getElementById('purgeBtn');
    if (purgeBtnEl) purgeBtnEl.textContent = t.purgeBtn;

    const emptyTitle = document.getElementById('emptyFeedTitle');
    if (emptyTitle) emptyTitle.textContent = t.emptyFeedTitle;
    const emptySub = document.getElementById('emptyFeedSubtitle');
    if (emptySub) emptySub.textContent = t.emptyFeedSubtitle;

    // Composer
    const agentInputLabel = document.getElementById('agentInputLabel');
    if (agentInputLabel) agentInputLabel.textContent = t.inputLabel;
    document.getElementById('agent-input').placeholder = t.inputPlaceholder;
    document.getElementById('translate-btn').innerHTML = `<span>${t.translateBtn}</span> <span class="text-[10px] bg-brand-700/80 text-blue-200 px-1.5 py-0.5 rounded font-mono font-bold">↵</span>`;

    // HITL
    document.getElementById('hitlTitleText').textContent = t.hitlTitle;
    document.getElementById('hitlSubtitle').textContent = t.hitlSubtitle;
    document.getElementById('cancelHitlBtn').textContent = t.cancelHitl;
    document.getElementById('sendBtnText').textContent = t.sendBtn;
    updateHitlAttachmentPreview();

    // Modal
    document.getElementById('modalTitle').textContent = t.modalTitle;
    document.getElementById('modalSubtitle').textContent = t.modalSubtitle;
    document.getElementById('modalPhoneLabel').textContent = t.modalPhoneLabel;
    document.getElementById('modalCancelBtn').textContent = t.modalCancel;
    document.getElementById('modalSubmitBtn').textContent = t.modalSubmit;
}

// File Attachment Handlers
function triggerFileInput() {
    document.getElementById('fileInput').click();
}

function handleFileSelected(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
        alert(dashboardMode === 'en' ? 'File size exceeds 10MB limit.' : 'El archivo supera el límite de 10MB.');
        event.target.value = '';
        return;
    }

    const reader = new FileReader();
    reader.onload = () => {
        currentAttachment = {
            file: file,
            base64: reader.result,
            name: file.name,
            size: (file.size / 1024).toFixed(1) + ' KB',
            type: file.type || 'application/octet-stream',
            uploadedUrl: null
        };

        const chip = document.getElementById('attachmentChip');
        document.getElementById('attachedFileName').textContent = currentAttachment.name;
        document.getElementById('attachedFileSize').textContent = currentAttachment.size;
        chip.classList.remove('hidden');

        updateHitlAttachmentPreview();
    };
    reader.readAsDataURL(file);
}

function removeAttachment() {
    currentAttachment = null;
    const fileInput = document.getElementById('fileInput');
    if (fileInput) fileInput.value = '';
    const chip = document.getElementById('attachmentChip');
    if (chip) chip.classList.add('hidden');
    updateHitlAttachmentPreview();
}

function updateHitlAttachmentPreview() {
    const notice = document.getElementById('hitlAttachmentNotice');
    if (!notice) return;
    const t = I18N[dashboardMode];
    if (currentAttachment) {
        document.getElementById('hitlAttachmentLabel').textContent = t.mmsNotice;
        document.getElementById('hitlAttachmentFileName').textContent = currentAttachment.name;
        notice.classList.remove('hidden');
    } else {
        notice.classList.add('hidden');
    }
}

// Fetch active tickets from backend
async function refreshTickets(showLoading = true) {
    const listEl = document.getElementById('ticketList');
    const t = I18N[dashboardMode];

    if (showLoading && !currentTicket) {
        listEl.innerHTML = `<div class="text-center py-8 text-xs text-slate-500">${t.loadingQueues}</div>`;
    }

    try {
        const res = await fetch('/api/tickets');
        if (!res.ok) throw new Error('Failed to load tickets');
        const data = await res.json();
        const tickets = data.tickets || [];

        if (tickets.length === 0) {
            listEl.innerHTML = `
                <div class="text-center py-8 text-xs text-slate-500">
                    ${t.noTickets}
                </div>
            `;
            return;
        }

        listEl.innerHTML = tickets.map(item => {
            const isSelected = currentTicket && currentTicket.id === item.id;
            const dateStr = new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            return `
                <div onclick="selectTicket('${item.id}', '${item.customer_phone}')" 
                     class="w-full text-left p-3 rounded-xl cursor-pointer transition border ${
                         isSelected 
                         ? 'bg-brand-600/15 border-brand-500/40 text-white shadow-sm' 
                         : 'bg-slate-900/60 border-slate-800 text-slate-300 hover:bg-slate-800/60 hover:border-slate-700'
                     }">
                    <div class="flex justify-between items-center mb-1">
                        <span class="font-semibold text-xs text-white">${escapeHtml(item.customer_phone)}</span>
                        <span class="text-[10px] text-slate-500">${dateStr}</span>
                    </div>
                    <div class="flex justify-between items-center text-[11px] text-slate-400">
                        <span>SMS Relay</span>
                        <span class="text-[10px] ${item.status === 'active' ? 'text-emerald-400' : 'text-slate-500'} font-medium uppercase">
                            ${item.status}
                        </span>
                    </div>
                </div>
            `;
        }).join('');
    } catch (err) {
        console.error('Error refreshing tickets:', err);
    }
}

// Select a ticket to view conversation
async function selectTicket(ticketId, customerPhone) {
    currentTicket = { id: ticketId, customer_phone: customerPhone };
    const t = I18N[dashboardMode];
    
    // Update Header
    document.getElementById('activeCustomerTitle').textContent = `${dashboardMode === 'en' ? 'Recipient' : 'Destinatario'}: ${customerPhone}`;
    document.getElementById('activeSubtitle').textContent = t.threadSubtitle(ticketId);
    document.getElementById('activeBadge').classList.remove('hidden');
    const purgeBtnEl = document.getElementById('purgeBtn');
    if (purgeBtnEl) purgeBtnEl.classList.remove('hidden');
    document.getElementById('inputArea').classList.remove('hidden');

    cancelHITL();
    removeAttachment();
    refreshTickets(false);
    await fetchMessages(ticketId, true);
}

// Fetch messages for active ticket
async function fetchMessages(ticketId, scrollToBottom = true) {
    if (!currentTicket || currentTicket.id !== ticketId) return;

    try {
        const res = await fetch(`/api/tickets?id=${ticketId}`);
        if (!res.ok) return;
        const data = await res.json();
        const messages = data.messages || [];
        renderChatFeed(messages, scrollToBottom);
    } catch (err) {
        console.error('Error fetching messages:', err);
    }
}

// Render attachment link or preview if text contains a media link
function renderAttachmentSnippet(rawText) {
    if (!rawText) return '';
    const urlMatch = rawText.match(/(https?:\/\/[^\s]+)/);
    if (!urlMatch) return '';
    const url = urlMatch[1];
    const isImage = /\.(jpeg|jpg|gif|png|webp)($|\?)/i.test(url) || url.includes('/storage/v1/object/public/attachments/');
    const t = I18N[dashboardMode];

    if (isImage) {
        return `
            <div class="mt-2 pt-2 border-t border-white/10">
                <a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">
                    <img src="${escapeHtml(url)}" alt="Attachment" class="max-h-44 rounded-lg border border-white/20 hover:opacity-90 transition object-cover" />
                </a>
            </div>
        `;
    } else {
        return `
            <div class="mt-2 pt-2 border-t border-white/10">
                <a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-black/30 hover:bg-black/50 border border-white/20 text-xs text-white transition">
                    <span>📎</span>
                    <span class="underline">${t.viewAttachment}</span>
                    <span>&rarr;</span>
                </a>
            </div>
        `;
    }
}

// Render messages in feed with bidirectional support
function renderChatFeed(messages, scrollToBottom = false) {
    const feed = document.getElementById('chatFeed');
    if (!feed) return;
    const t = I18N[dashboardMode];

    if (messages.length === 0) {
        feed.innerHTML = `
            <div class="text-center py-12 text-slate-500 text-xs">
                ${t.noMessagesInThread}
            </div>
        `;
        return;
    }

    feed.innerHTML = messages.map(m => {
        const isAgent = m.sender === 'agent';
        const time = new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        if (isAgent) {
            // Outbound message from Agent
            const topLabel = t.agentDeliveredSMS;
            const topText = (dashboardMode === 'en') ? (m.spanish_text || '') : (m.english_text || '');
            const bottomLabel = t.agentOriginalDraft;
            const bottomText = (dashboardMode === 'en') ? (m.english_text || '') : (m.spanish_text || '');
            const attachmentHtml = renderAttachmentSnippet(m.spanish_text || m.english_text || '');

            return `
                <div class="flex flex-col items-end space-y-1 max-w-xl ml-auto">
                    <span class="text-[10px] text-slate-500 font-medium mr-1">${dashboardMode === 'en' ? 'Agent (You)' : 'Agente (Usted)'} &bull; ${time}</span>
                    <div class="bg-brand-600 text-white rounded-2xl rounded-tr-sm p-3.5 shadow-md text-sm space-y-1.5 w-full">
                        <div class="text-xs text-blue-100 pb-1 border-b border-blue-400/30">
                            <span class="font-bold uppercase tracking-wider text-[10px] text-blue-200 block">${topLabel}</span>
                            ${escapeHtml(topText)}
                        </div>
                        <div class="text-xs text-blue-200">
                            <span class="font-bold uppercase tracking-wider text-[10px] text-blue-300 block">${bottomLabel}</span>
                            ${escapeHtml(bottomText)}
                        </div>
                        ${attachmentHtml}
                    </div>
                </div>
            `;
        } else {
            // Inbound message from Customer
            const topLabel = t.customerTranslated;
            const topText = (dashboardMode === 'en') ? (m.english_text || '') : (m.spanish_text || '');
            const bottomLabel = t.customerOriginal;
            const bottomText = (dashboardMode === 'en') ? (m.spanish_text || '') : (m.english_text || '');
            const attachmentHtml = renderAttachmentSnippet(m.spanish_text || m.english_text || '');

            return `
                <div class="flex flex-col items-start space-y-1 max-w-xl mr-auto">
                    <span class="text-[10px] text-slate-500 font-medium ml-1">${dashboardMode === 'en' ? 'Recipient' : 'Destinatario'} (${escapeHtml(currentTicket.customer_phone)}) &bull; ${time}</span>
                    <div class="bg-slate-800 border border-slate-700 text-slate-100 rounded-2xl rounded-tl-sm p-3.5 shadow-md text-sm space-y-1.5 w-full">
                        <div class="text-sm font-medium text-emerald-300 pb-1 border-b border-slate-700">
                            <span class="font-bold uppercase tracking-wider text-[10px] text-emerald-400 block">${topLabel}</span>
                            ${escapeHtml(topText)}
                        </div>
                        <div class="text-xs text-slate-400">
                            <span class="font-bold uppercase tracking-wider text-[10px] text-slate-500 block">${bottomLabel}</span>
                            ${escapeHtml(bottomText)}
                        </div>
                        ${attachmentHtml}
                    </div>
                </div>
            `;
        }
    }).join('');

    if (scrollToBottom) {
        feed.scrollTop = feed.scrollHeight;
    }
}

// HITL Step 1: Translate agent draft into target language for review with % progress
async function handleTranslateAndSend() {
    const inputEl = document.getElementById('agent-input');
    const draftText = inputEl.value.trim();
    if (!draftText && !currentAttachment) return;

    const t = I18N[dashboardMode];
    const translateBtn = document.getElementById('translate-btn');
    const progressContainer = document.getElementById('translationProgressContainer');
    const progressBarFill = document.getElementById('progressBarFill');
    const progressPercentage = document.getElementById('progressPercentage');
    const progressStatusText = document.getElementById('progressStatusText');

    translateBtn.disabled = true;
    translateBtn.innerHTML = `<span>${t.translating}</span>`;

    // Show on-screen progress bar
    if (progressContainer) {
        progressContainer.classList.remove('hidden');
        if (progressBarFill) progressBarFill.style.width = '12%';
        if (progressPercentage) progressPercentage.textContent = '12%';
        if (progressStatusText) progressStatusText.textContent = t.progressStatus;
    }

    // Engaging % progress progression
    let progressVal = 12;
    const progressTimer = setInterval(() => {
        if (progressVal < 88) {
            progressVal += Math.floor(Math.random() * 12) + 6;
            if (progressVal > 88) progressVal = 88;
            if (progressBarFill) progressBarFill.style.width = `${progressVal}%`;
            if (progressPercentage) progressPercentage.textContent = `${progressVal}%`;
        }
    }, 110);

    try {
        let translatedText = draftText;
        if (draftText) {
            const transRes = await fetch('/api/translate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    text: draftText, 
                    targetLang: t.targetLang 
                }),
                signal: AbortSignal.timeout(8000)
            });

            const data = await transRes.json();
            if (!transRes.ok) throw new Error(data.error || 'Translation failed');
            translatedText = data.translated;
        }

        clearInterval(progressTimer);

        // Flash 100% completion
        if (progressBarFill) progressBarFill.style.width = '100%';
        if (progressPercentage) progressPercentage.textContent = '100%';
        if (progressStatusText) progressStatusText.textContent = t.progressComplete;

        // Brief pleasant pause to display 100% before opening review box
        await new Promise(r => setTimeout(r, 260));
        if (progressContainer) progressContainer.classList.add('hidden');

        // Show HITL Review Box
        const hitlContainer = document.getElementById('hitlContainer');
        const reviewBox = document.getElementById('target-review-box');
        reviewBox.value = translatedText;
        hitlContainer.classList.remove('hidden');
        updateHitlAttachmentPreview();
        reviewBox.focus();
    } catch (err) {
        clearInterval(progressTimer);
        if (progressContainer) progressContainer.classList.add('hidden');
        alert('Translation error: ' + (err.name === 'TimeoutError' ? 'Translation request timed out. Please try again.' : err.message));
    } finally {
        translateBtn.disabled = false;
        translateBtn.innerHTML = `<span>${t.translateBtn}</span> <span class="text-[10px] bg-brand-700/80 text-blue-200 px-1.5 py-0.5 rounded font-mono font-bold">↵</span>`;
    }
}

// HITL Step 2: Confirm reviewed translation, upload attachment if any, and dispatch SMS via httpSMS
async function confirmAndSend() {
    if (!currentTicket) return;
    const reviewedText = document.getElementById('target-review-box').value.trim();
    const originalDraft = document.getElementById('agent-input').value.trim();
    if (!reviewedText && !currentAttachment) return;

    const t = I18N[dashboardMode];
    const sendBtn = document.getElementById('send-btn');
    const sendBtnText = document.getElementById('sendBtnText');
    sendBtn.disabled = true;

    // 1. Upload attachment if present and not yet uploaded
    let mediaUrl = currentAttachment?.uploadedUrl || null;
    if (currentAttachment && !mediaUrl) {
        sendBtnText.textContent = t.uploadingFile;
        try {
            const upRes = await fetch('/api/upload', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    filename: currentAttachment.name,
                    contentType: currentAttachment.type,
                    base64Data: currentAttachment.base64
                })
            });

            const upData = await upRes.json();
            if (!upRes.ok) throw new Error(upData.error || 'Failed to upload attachment');
            mediaUrl = upData.url;
            currentAttachment.uploadedUrl = mediaUrl;
        } catch (upErr) {
            alert('Attachment upload error: ' + upErr.message);
            sendBtn.disabled = false;
            sendBtnText.textContent = t.sendBtn;
            return;
        }
    }

    sendBtnText.textContent = t.sendingSms;

    // Depending on mode:
    const englishText = (dashboardMode === 'en') ? (originalDraft || (mediaUrl ? 'Attachment sent' : '')) : (reviewedText || (mediaUrl ? 'Attachment sent' : ''));
    const spanishText = (dashboardMode === 'en') ? (reviewedText || (mediaUrl ? 'Adjunto enviado' : '')) : (originalDraft || (mediaUrl ? 'Adjunto enviado' : ''));
    const smsBody = reviewedText || (dashboardMode === 'en' ? 'Adjunto recibido:' : 'Attachment:');

    try {
        const res = await fetch('/api/send-sms', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                to: currentTicket.customer_phone,
                body: smsBody,
                mediaUrl: mediaUrl,
                ticketId: currentTicket.id,
                englishText: englishText,
                spanishText: spanishText
            })
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to send SMS');

        // Clear inputs and reset HITL box and attachment
        document.getElementById('agent-input').value = '';
        removeAttachment();
        cancelHITL();

        // Refresh feed
        await fetchMessages(currentTicket.id, true);
    } catch (err) {
        alert('Send SMS error: ' + err.message);
    } finally {
        sendBtn.disabled = false;
        sendBtnText.textContent = t.sendBtn;
    }
}

// Cancel HITL review
function cancelHITL() {
    const hitlContainer = document.getElementById('hitlContainer');
    if (hitlContainer) {
        hitlContainer.classList.add('hidden');
    }
    const reviewBox = document.getElementById('target-review-box');
    if (reviewBox) reviewBox.value = '';
}

// End & Purge Conversation (ZDR deletion)
async function purgeCurrentConversation() {
    if (!currentTicket) return;
    const t = I18N[dashboardMode];
    const confirmed = confirm(t.purgeConfirm(currentTicket.customer_phone));
    if (!confirmed) return;

    try {
        const res = await fetch('/api/purge', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ticketId: currentTicket.id })
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Purge failed');

        currentTicket = null;
        document.getElementById('activeCustomerTitle').textContent = t.selectConversation;
        document.getElementById('activeSubtitle').textContent = t.selectSubtitle;
        document.getElementById('activeBadge').classList.add('hidden');
        document.getElementById('purgeBtn').classList.add('hidden');
        document.getElementById('inputArea').classList.add('hidden');
        document.getElementById('chatFeed').innerHTML = `
            <div class="text-center py-12 text-slate-500 text-xs">
                ${t.purgedNotice}
            </div>
        `;
        cancelHITL();
        removeAttachment();
        await refreshTickets(true);
    } catch (err) {
        alert('Purge error: ' + err.message);
    }
}

// Modal handling for New Ticket
function openNewTicketModal() {
    document.getElementById('newTicketModal').classList.remove('hidden');
    document.getElementById('newCustomerPhone').focus();
}

function closeNewTicketModal() {
    document.getElementById('newTicketModal').classList.add('hidden');
    document.getElementById('newCustomerPhone').value = '';
}

async function handleCreateTicket(e) {
    e.preventDefault();
    const phone = document.getElementById('newCustomerPhone').value.trim();
    if (!phone) return;

    try {
        const res = await fetch('/api/tickets', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ customerPhone: phone })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to create thread');

        closeNewTicketModal();
        await refreshTickets(true);
        if (data.ticket) {
            selectTicket(data.ticket.id, data.ticket.customer_phone);
        }
    } catch (err) {
        alert('Create thread error: ' + err.message);
    }
}

// Utility: escape HTML
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
