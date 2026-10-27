// Abrevia 1 — Operations Workspace Frontend Logic
let currentTicket = null;
let pollInterval = null;
let dashboardMode = 'en';

const I18N = {
    en: {
        consoleBadge: 'Operations Console',
        signOut: 'Sign Out',
        sidebarTitle: 'Active Conversations',
        refresh: '↻ Refresh',
        loadingQueues: 'Loading conversations...',
        noTickets: 'No active conversations.<br>Click "New Customer Thread" below.',
        newThreadBtn: 'New Customer Thread',
        selectConversation: 'Select a conversation',
        selectSubtitle: 'Choose a ticket from the sidebar or start a new thread',
        activeBadge: 'Active',
        purgeBtn: 'End & Purge Thread',
        emptyFeedTitle: 'Select an active conversation to view and send bilingual messages',
        emptyFeedSubtitle: 'Inbound SMS translated to English • Outbound replies reviewed in Spanish',
        noMessagesInThread: 'No messages yet in this thread.<br>Send an outbound SMS reply below to start.',
        inputLabel: 'Type reply in English (Agent):',
        inputPlaceholder: 'Type your reply in English (e.g. Your delivery is scheduled for tomorrow at 2 PM)...',
        translateBtn: 'Translate →',
        translating: 'Translating...',
        hitlTitle: 'Human-In-The-Loop Review (Spanish text to be sent via SMS):',
        hitlSubtitle: 'Edit text freely before sending',
        cancelHitl: 'Cancel',
        sendBtn: 'Send SMS to Customer',
        sendingSms: 'Sending SMS...',
        modalTitle: 'Start New Customer Thread',
        modalSubtitle: 'Enter customer\'s SMS phone number with country code (e.g. +14155552671 or +526601750245).',
        modalPhoneLabel: 'Phone Number',
        modalCancel: 'Cancel',
        modalSubmit: 'Create Thread',
        targetLang: 'Spanish',
        purgeConfirm: (phone) => `Are you sure you want to end and permanently purge conversation with ${phone}? All message records will be deleted.`,
        purgedNotice: 'Conversation data purged from server.',
        agentDeliveredSMS: 'Delivered SMS (Spanish):',
        agentOriginalDraft: 'Original Agent Draft (English):',
        customerTranslated: 'Translated into English:',
        customerOriginal: 'Original Inbound SMS (Spanish):'
    },
    es: {
        consoleBadge: 'Consola de Operaciones',
        signOut: 'Cerrar Sesión',
        sidebarTitle: 'Conversaciones Activas',
        refresh: '↻ Actualizar',
        loadingQueues: 'Cargando conversaciones...',
        noTickets: 'No hay conversaciones activas.<br>Haga clic en "Nuevo Hilo de Cliente" abajo.',
        newThreadBtn: 'Nuevo Hilo de Cliente',
        selectConversation: 'Selecciona una conversación',
        selectSubtitle: 'Elige un ticket de la barra lateral o inicia un nuevo hilo',
        activeBadge: 'Activo',
        purgeBtn: 'Finalizar y Purgar Hilo',
        emptyFeedTitle: 'Selecciona una conversación activa para ver y enviar mensajes bilingües',
        emptyFeedSubtitle: 'Mensajes entrantes traducidos a español • Respuestas salientes revisadas en inglés',
        noMessagesInThread: 'Aún no hay mensajes en este hilo.<br>Envía una respuesta SMS abajo para iniciar.',
        inputLabel: 'Escribe respuesta en Español (Agente):',
        inputPlaceholder: 'Escribe tu respuesta en español (ej. Su entrega está programada para mañana a las 2 PM)...',
        translateBtn: 'Traducir →',
        translating: 'Traduciendo...',
        hitlTitle: 'Revisión Humana HITL (Texto en inglés que se enviará por SMS):',
        hitlSubtitle: 'Edita el texto libremente antes de enviar',
        cancelHitl: 'Cancelar',
        sendBtn: 'Enviar SMS al Cliente',
        sendingSms: 'Enviando SMS...',
        modalTitle: 'Iniciar Nuevo Hilo de Cliente',
        modalSubtitle: 'Ingresa el número de teléfono con código de país (ej. +526601750245 o +14155552671).',
        modalPhoneLabel: 'Número de Teléfono',
        modalCancel: 'Cancelar',
        modalSubmit: 'Crear Hilo',
        targetLang: 'English',
        purgeConfirm: (phone) => `¿Estás seguro de que deseas finalizar y purgar permanentemente la conversación con ${phone}? Todos los registros se eliminarán.`,
        purgedNotice: 'Los datos de la conversación han sido purgados del servidor.',
        agentDeliveredSMS: 'SMS Enviado al Cliente (Inglés):',
        agentOriginalDraft: 'Borrador Original del Agente (Español):',
        customerTranslated: 'Traducido al Español:',
        customerOriginal: 'SMS Original Entrante (Inglés):'
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

    document.getElementById('headerConsoleBadge').textContent = t.consoleBadge;
    document.getElementById('signOutLink').textContent = t.signOut;
    document.getElementById('sidebarTitle').textContent = t.sidebarTitle;
    document.getElementById('refreshBtn').textContent = t.refresh;
    document.getElementById('newThreadBtnText').textContent = t.newThreadBtn;

    if (!currentTicket) {
        document.getElementById('activeCustomerTitle').textContent = t.selectConversation;
        document.getElementById('activeSubtitle').textContent = t.selectSubtitle;
    }

    document.getElementById('activeBadge').textContent = t.activeBadge;
    document.getElementById('purgeBtn').textContent = t.purgeBtn;

    const emptyTitle = document.getElementById('emptyFeedTitle');
    if (emptyTitle) emptyTitle.textContent = t.emptyFeedTitle;
    const emptySub = document.getElementById('emptyFeedSubtitle');
    if (emptySub) emptySub.textContent = t.emptyFeedSubtitle;

    // Composer
    document.getElementById('agentInputLabel').textContent = t.inputLabel;
    document.getElementById('agent-input').placeholder = t.inputPlaceholder;
    document.getElementById('translate-btn').textContent = t.translateBtn;

    // HITL
    document.getElementById('hitlTitleText').textContent = t.hitlTitle;
    document.getElementById('hitlSubtitle').textContent = t.hitlSubtitle;
    document.getElementById('cancelHitlBtn').textContent = t.cancelHitl;
    document.getElementById('sendBtnText').textContent = t.sendBtn;

    // Modal
    document.getElementById('modalTitle').textContent = t.modalTitle;
    document.getElementById('modalSubtitle').textContent = t.modalSubtitle;
    document.getElementById('modalPhoneLabel').textContent = t.modalPhoneLabel;
    document.getElementById('modalCancelBtn').textContent = t.modalCancel;
    document.getElementById('modalSubmitBtn').textContent = t.modalSubmit;
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
    document.getElementById('activeCustomerTitle').textContent = `Customer: ${customerPhone}`;
    document.getElementById('activeSubtitle').textContent = `Thread ID: ${ticketId.slice(0, 8)}... • Two-Way SMS Active`;
    document.getElementById('activeBadge').classList.remove('hidden');
    document.getElementById('purgeBtn').classList.remove('hidden');
    document.getElementById('inputArea').classList.remove('hidden');

    cancelHITL();
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
            // If English Agent Mode: top is delivered Spanish SMS, bottom is original draft in English
            // If Spanish Agent Mode: top is delivered English SMS, bottom is original draft in Spanish
            const topLabel = t.agentDeliveredSMS;
            const topText = (dashboardMode === 'en') ? (m.spanish_text || '') : (m.english_text || '');
            const bottomLabel = t.agentOriginalDraft;
            const bottomText = (dashboardMode === 'en') ? (m.english_text || '') : (m.spanish_text || '');

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
                    </div>
                </div>
            `;
        } else {
            // Inbound message from Customer
            // If English Agent Mode: top is translated English, bottom is original customer text (Spanish)
            // If Spanish Agent Mode: top is translated Spanish, bottom is original customer text (English)
            const topLabel = t.customerTranslated;
            const topText = (dashboardMode === 'en') ? (m.english_text || '') : (m.spanish_text || '');
            const bottomLabel = t.customerOriginal;
            const bottomText = (dashboardMode === 'en') ? (m.spanish_text || '') : (m.english_text || '');

            return `
                <div class="flex flex-col items-start space-y-1 max-w-xl mr-auto">
                    <span class="text-[10px] text-slate-500 font-medium ml-1">${dashboardMode === 'en' ? 'Customer' : 'Cliente'} (${escapeHtml(currentTicket.customer_phone)}) &bull; ${time}</span>
                    <div class="bg-slate-800 border border-slate-700 text-slate-100 rounded-2xl rounded-tl-sm p-3.5 shadow-md text-sm space-y-1.5 w-full">
                        <div class="text-sm font-medium text-emerald-300 pb-1 border-b border-slate-700">
                            <span class="font-bold uppercase tracking-wider text-[10px] text-emerald-400 block">${topLabel}</span>
                            ${escapeHtml(topText)}
                        </div>
                        <div class="text-xs text-slate-400">
                            <span class="font-bold uppercase tracking-wider text-[10px] text-slate-500 block">${bottomLabel}</span>
                            ${escapeHtml(bottomText)}
                        </div>
                    </div>
                </div>
            `;
        }
    }).join('');

    if (scrollToBottom) {
        feed.scrollTop = feed.scrollHeight;
    }
}

// HITL Step 1: Translate agent draft into target language for review
async function handleTranslateAndSend() {
    const inputEl = document.getElementById('agent-input');
    const draftText = inputEl.value.trim();
    if (!draftText) return;

    const t = I18N[dashboardMode];
    const translateBtn = document.getElementById('translate-btn');
    translateBtn.disabled = true;
    translateBtn.textContent = t.translating;

    try {
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

        // Show HITL Review Box
        const hitlContainer = document.getElementById('hitlContainer');
        const reviewBox = document.getElementById('target-review-box');
        reviewBox.value = data.translated;
        hitlContainer.classList.remove('hidden');
        reviewBox.focus();
    } catch (err) {
        alert('Translation error: ' + (err.name === 'TimeoutError' ? 'Translation request timed out. Please try again.' : err.message));
    } finally {
        translateBtn.disabled = false;
        translateBtn.textContent = t.translateBtn;
    }
}

// HITL Step 2: Confirm reviewed translation and dispatch SMS via httpSMS
async function confirmAndSend() {
    if (!currentTicket) return;
    const reviewedText = document.getElementById('target-review-box').value.trim();
    const originalDraft = document.getElementById('agent-input').value.trim();
    if (!reviewedText) return;

    const t = I18N[dashboardMode];
    const sendBtn = document.getElementById('send-btn');
    const sendBtnText = document.getElementById('sendBtnText');
    sendBtn.disabled = true;
    sendBtnText.textContent = t.sendingSms;

    // Depending on mode:
    // en mode: draft is english, reviewedText is spanish (SMS body)
    // es mode: draft is spanish, reviewedText is english (SMS body)
    const englishText = (dashboardMode === 'en') ? originalDraft : reviewedText;
    const spanishText = (dashboardMode === 'en') ? reviewedText : originalDraft;

    try {
        const res = await fetch('/api/send-sms', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                to: currentTicket.customer_phone,
                body: reviewedText, // The SMS sent across cellular
                ticketId: currentTicket.id,
                englishText: englishText,
                spanishText: spanishText
            })
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to send SMS');

        // Clear inputs and reset HITL box
        document.getElementById('agent-input').value = '';
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
