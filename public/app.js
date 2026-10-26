// Abrevia 1 — Operations Workspace Frontend Logic
let currentTicket = null;
let pollInterval = null;

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    refreshTickets();
    // Poll for new messages/tickets every 5 seconds
    pollInterval = setInterval(() => {
        refreshTickets(false);
        if (currentTicket) {
            fetchMessages(currentTicket.id, false);
        }
    }, 5000);
});

// Fetch active tickets from backend
async function refreshTickets(showLoading = true) {
    const listEl = document.getElementById('ticketList');
    if (showLoading && !currentTicket) {
        listEl.innerHTML = '<div class="text-center py-8 text-xs text-slate-500">Loading queues...</div>';
    }

    try {
        const res = await fetch('/api/tickets');
        if (!res.ok) throw new Error('Failed to load tickets');
        const data = await res.json();
        const tickets = data.tickets || [];

        if (tickets.length === 0) {
            listEl.innerHTML = `
                <div class="text-center py-8 text-xs text-slate-500">
                    No active conversations.<br>Click "New Customer Thread" below.
                </div>
            `;
            return;
        }

        listEl.innerHTML = tickets.map(t => {
            const isSelected = currentTicket && currentTicket.id === t.id;
            const dateStr = new Date(t.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            return `
                <div onclick="selectTicket('${t.id}', '${t.customer_phone}')" 
                     class="w-full text-left p-3 rounded-xl cursor-pointer transition border ${
                         isSelected 
                         ? 'bg-brand-600/15 border-brand-500/40 text-white shadow-sm' 
                         : 'bg-slate-900/60 border-slate-800 text-slate-300 hover:bg-slate-800/60 hover:border-slate-700'
                     }">
                    <div class="flex justify-between items-center mb-1">
                        <span class="font-semibold text-xs text-white">${escapeHtml(t.customer_phone)}</span>
                        <span class="text-[10px] text-slate-500">${dateStr}</span>
                    </div>
                    <div class="flex justify-between items-center text-[11px] text-slate-400">
                        <span>SMS Relay</span>
                        <span class="text-[10px] ${t.status === 'active' ? 'text-emerald-400' : 'text-slate-500'} font-medium uppercase">
                            ${t.status}
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

// Render messages in feed
function renderChatFeed(messages, scrollToBottom = false) {
    const feed = document.getElementById('chatFeed');
    if (!feed) return;

    if (messages.length === 0) {
        feed.innerHTML = `
            <div class="text-center py-12 text-slate-500 text-xs">
                No messages yet in this thread.<br>Send an outbound SMS reply below to start.
            </div>
        `;
        return;
    }

    feed.innerHTML = messages.map(m => {
        const isAgent = m.sender === 'agent';
        const time = new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        if (isAgent) {
            // Outbound message from Agent
            return `
                <div class="flex flex-col items-end space-y-1 max-w-xl ml-auto">
                    <span class="text-[10px] text-slate-500 font-medium mr-1">Agent (You) &bull; ${time}</span>
                    <div class="bg-brand-600 text-white rounded-2xl rounded-tr-sm p-3.5 shadow-md text-sm space-y-1.5 w-full">
                        <div class="text-xs text-blue-100 pb-1 border-b border-blue-400/30">
                            <span class="font-bold uppercase tracking-wider text-[10px] text-blue-200 block">Delivered SMS (Spanish):</span>
                            ${escapeHtml(m.spanish_text || '')}
                        </div>
                        <div class="text-xs text-blue-200">
                            <span class="font-bold uppercase tracking-wider text-[10px] text-blue-300 block">Original Agent Draft (English):</span>
                            ${escapeHtml(m.english_text || '')}
                        </div>
                    </div>
                </div>
            `;
        } else {
            // Inbound message from Customer
            return `
                <div class="flex flex-col items-start space-y-1 max-w-xl mr-auto">
                    <span class="text-[10px] text-slate-500 font-medium ml-1">Customer (${escapeHtml(currentTicket.customer_phone)}) &bull; ${time}</span>
                    <div class="bg-slate-800 border border-slate-700 text-slate-100 rounded-2xl rounded-tl-sm p-3.5 shadow-md text-sm space-y-1.5 w-full">
                        <div class="text-sm font-medium text-emerald-300 pb-1 border-b border-slate-700">
                            <span class="font-bold uppercase tracking-wider text-[10px] text-emerald-400 block">Translated into English:</span>
                            ${escapeHtml(m.english_text || '')}
                        </div>
                        <div class="text-xs text-slate-400">
                            <span class="font-bold uppercase tracking-wider text-[10px] text-slate-500 block">Original Inbound SMS (Spanish):</span>
                            ${escapeHtml(m.spanish_text || '')}
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

// HITL Step 1: Translate English text into Spanish for review
async function handleTranslateAndSend() {
    const englishInput = document.getElementById('english-input');
    const englishText = englishInput.value.trim();
    if (!englishText) return;

    const translateBtn = document.getElementById('translate-btn');
    translateBtn.disabled = true;
    translateBtn.textContent = 'Translating...';

    try {
        const transRes = await fetch('/api/translate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: englishText, targetLang: 'Spanish' })
        });

        const data = await transRes.json();
        if (!transRes.ok) throw new Error(data.error || 'Translation failed');

        // Show HITL Review Box
        const hitlContainer = document.getElementById('hitlContainer');
        const reviewBox = document.getElementById('spanish-review-box');
        reviewBox.value = data.translated;
        hitlContainer.classList.remove('hidden');
        reviewBox.focus();
    } catch (err) {
        alert('Translation error: ' + err.message);
    } finally {
        translateBtn.disabled = false;
        translateBtn.textContent = 'Translate →';
    }
}

// HITL Step 2: Confirm reviewed Spanish and dispatch SMS via httpSMS
async function confirmAndSend() {
    if (!currentTicket) return;
    const spanishText = document.getElementById('spanish-review-box').value.trim();
    const englishText = document.getElementById('english-input').value.trim();
    if (!spanishText) return;

    const sendBtn = document.getElementById('send-btn');
    sendBtn.disabled = true;
    sendBtn.textContent = 'Sending SMS...';

    try {
        const res = await fetch('/api/send-sms', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                to: currentTicket.customer_phone,
                body: spanishText,
                ticketId: currentTicket.id,
                englishText: englishText
            })
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to send SMS');

        // Clear inputs and reset HITL box
        document.getElementById('english-input').value = '';
        cancelHITL();

        // Refresh feed
        await fetchMessages(currentTicket.id, true);
    } catch (err) {
        alert('Send SMS error: ' + err.message);
    } finally {
        sendBtn.disabled = false;
        sendBtn.innerHTML = '<span>Send SMS to Customer</span> <span>&rarr;</span>';
    }
}

// Cancel HITL review
function cancelHITL() {
    const hitlContainer = document.getElementById('hitlContainer');
    if (hitlContainer) {
        hitlContainer.classList.add('hidden');
    }
    const reviewBox = document.getElementById('spanish-review-box');
    if (reviewBox) reviewBox.value = '';
}

// End & Purge Conversation (ZDR deletion)
async function purgeCurrentConversation() {
    if (!currentTicket) return;
    const confirmed = confirm(`Are you sure you want to end and permanently purge conversation with ${currentTicket.customer_phone}? All message records will be deleted.`);
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
        document.getElementById('activeCustomerTitle').textContent = 'Select a conversation';
        document.getElementById('activeSubtitle').textContent = 'Choose a ticket from the sidebar or start a new thread';
        document.getElementById('activeBadge').classList.add('hidden');
        document.getElementById('purgeBtn').classList.add('hidden');
        document.getElementById('inputArea').classList.add('hidden');
        document.getElementById('chatFeed').innerHTML = `
            <div class="text-center py-12 text-slate-500 text-xs">
                Conversation data purged from server.
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
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
