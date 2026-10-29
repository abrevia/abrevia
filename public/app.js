// Abrevia 1 — Operations Workspace Frontend Logic
let currentTicket = null;
let pollInterval = null;
let dashboardMode = 'en';
let currentAttachment = null; // { file, base64, name, size, type, uploadedUrl }
let hitlModeEnabled = false; // Abrevia 1 default: Instant translation without human in the loop
let contactsMap = {}; // phone -> { phone, name, company, email, notes, updatedAt }

const I18N = {
    en: {
        consoleBadge: 'Console Status',
        consoleStatus: 'Active',
        billingBtn: 'Billing',
        signOut: 'Sign Out',
        sidebarTitle: 'Conversations',
        contactsBtn: 'Contacts',
        editContactBtn: 'Contact Info',
        addContactBtn: 'Add Contact',
        syncDeviceBtn: '📱 Sync Device Contacts',
        pullDeviceBtnText: 'Pull from Device',
        contactsSyncedNotice: (count) => `Successfully synced ${count} contacts to your account!`,
        contactsSyncFailed: 'No contacts could be imported. Please verify your file format (.vcf or .csv).',
        refresh: '↻ Refresh',
        loadingQueues: 'Loading conversations...',
        noTickets: 'No active conversations.<br>Click "New Recipient Thread" below.',
        newThreadBtn: 'New Recipient Thread',
        mobileBackBtn: 'Chats',
        closeThreadBtn: 'Close',
        selectConversation: 'Select a conversation',
        selectSubtitle: 'Choose a ticket from the sidebar or start a new thread',
        threadSubtitle: (id) => `Thread: ${id.slice(0, 8)}... • Two-Way Asynchronous Communication Relay`,
        purgeBtn: 'Purge',
        purgeBtnTitle: 'End & Purge Thread',
        emptyFeedTitle: 'Select an active conversation to view and send bilingual messages',
        emptyFeedSubtitle: 'Inbound asynchronous communication translated to English • Outbound replies translated & dispatched in real time',
        noMessagesInThread: 'No messages yet in this thread.<br>Send an outbound message below to start.',
        inputLabel: 'Type reply in English (Agent):',
        inputPlaceholder: 'Type your reply in English (e.g. Your delivery is scheduled for tomorrow at 2 PM)...',
        translateBtn: 'Send',
        translating: 'Translating...',
        progressStatus: 'Auto-Correcting Grammar & Translating...',
        progressComplete: '✓ Translated & Verified (100%)',
        progressSending: 'Sending Message...',
        progressSent: '✓ Self-Corrected & Sent!',
        instantModeLabel: 'Secure Instant Translation & Message Delivery',
        grammarBadge: 'Bilingual Self-Correcting Grammar',
        hitlTogglePremium: 'Proofread translated message',
        hitlToggleActive: 'Proofread translated message: ON',
        hitlTitle: 'Human-In-The-Loop Review (Spanish message to be sent):',
        hitlSubtitle: 'Edit text freely • Press Enter ↵ to send',
        cancelHitl: 'Cancel',
        sendBtn: 'Send Message',
        sendingSms: 'Sending Message...',
        uploadingFile: 'Uploading attachment...',
        mmsNotice: 'Attachment queued:',
        modalTitle: 'Start New Recipient Thread',
        modalSubtitle: 'Phone numbers are auto-saved as contacts. You can optionally add a name and details.',
        modalPhoneLabel: 'Phone Number',
        modalAutoSaveNote: 'Auto-saved to your contact directory upon creation',
        modalNameLabel: 'Contact Name (Optional)',
        modalCompanyLabel: 'Company / Role (Optional)',
        modalNotesLabel: 'Internal Notes (Optional)',
        modalCancel: 'Cancel',
        modalSubmit: 'Create Thread',
        editContactModalTitle: 'Contact Information',
        editContactModalSubtitle: 'Edit name, company, and notes for this recipient.',
        contactsModalTitle: 'Contact Directory',
        contactsModalSubtitle: 'All recipients are automatically saved here once their phone number is entered.',
        contactsSearchPlaceholder: 'Search contacts by name, phone, or company...',
        noContactsFound: 'No contacts saved yet.',
        targetLang: 'Spanish',
        purgeConfirm: (phone) => `Are you sure you want to end and permanently purge conversation with ${phone}? All message records will be deleted.`,
        purgedNotice: 'Conversation data purged from server.',
        agentDeliveredSMS: 'Delivered Message to Recipient (Spanish):',
        agentOriginalDraft: 'Original Agent Draft (English):',
        customerTranslated: 'Translated into English:',
        customerOriginal: 'Original Inbound Message from Recipient (Spanish):',
        viewAttachment: 'View Attached File',
        trialPill: (days) => `Premium Trial: ${days}d left`,
        trialPillExpired: 'Free Tier • Upgrade to Pro',
        trialPillPro: 'Operations Pro',
        templatesBtn: 'Templates',
        templatesModalTitle: 'Quick Response Templates',
        templatesModalSubtitle: 'Click any pre-verified operational snippet to insert it into your composer.',
        scheduleBtnTitle: 'Schedule message for delayed delivery',
        scheduleModalTitle: 'Schedule Message Dispatch',
        scheduleModalSubtitle: 'Select a future time to automatically deliver this message to the recipient.',
        autoResponderBtn: 'Auto-Reply',
        autoRespModalTitle: 'After-Hours Auto-Responder',
        autoRespModalSubtitle: 'Automatically send a verified bilingual message when an inbound text arrives outside operational hours.',
        optOutBadge: '🚫 Opted Out (STOP)',
        optOutBanner: 'Recipient has opted out of automated messaging (STOP). Messaging is paused.',
        deliveredReceipt: 'Delivered',
        sentReceipt: 'Sent',
        scheduledBadge: (timeStr) => `⏱️ Scheduled for ${timeStr}`,
        hitlBtnLabel: 'Proofread (HITL)',
        hitlBtnOn: 'ON',
        hitlBtnOff: 'OFF'
    },
    es: {
        consoleBadge: 'Estado de Consola',
        consoleStatus: 'Activo',
        billingBtn: 'Facturación',
        signOut: 'Cerrar Sesión',
        sidebarTitle: 'Conversaciones',
        contactsBtn: 'Contactos',
        editContactBtn: 'Info de Contacto',
        addContactBtn: 'Agregar Contacto',
        syncDeviceBtn: '📱 Sincronizar Contactos',
        pullDeviceBtnText: 'Extraer de Dispositivo',
        contactsSyncedNotice: (count) => `¡${count} contactos sincronizados a su cuenta con éxito!`,
        contactsSyncFailed: 'No se pudieron importar contactos. Por favor verifique el formato (.vcf o .csv).',
        refresh: '↻ Actualizar',
        loadingQueues: 'Cargando conversaciones...',
        noTickets: 'No hay conversaciones activas.<br>Haga clic en "Nuevo Hilo de Destinatario" abajo.',
        newThreadBtn: 'Nuevo Hilo de Destinatario',
        mobileBackBtn: 'Hilos',
        closeThreadBtn: 'Cerrar',
        selectConversation: 'Selecciona una conversación',
        selectSubtitle: 'Elige un ticket de la barra lateral o inicia un nuevo hilo',
        threadSubtitle: (id) => `Hilo: ${id.slice(0, 8)}... • Relevo de Comunicación Asíncrona Bilingüe`,
        purgeBtn: 'Purgar',
        purgeBtnTitle: 'Finalizar y Purgar Hilo',
        emptyFeedTitle: 'Selecciona una conversación activa para ver y enviar mensajes bilingües',
        emptyFeedSubtitle: 'Comunicación asíncrona entrante traducida al español • Respuestas traducidas y enviadas en tiempo real',
        noMessagesInThread: 'Aún no hay mensajes en este hilo.<br>Envía un mensaje abajo para iniciar.',
        inputLabel: 'Escribe respuesta en Español (Agente):',
        inputPlaceholder: 'Escribe tu respuesta en español (ej. Su entrega está programada para mañana a las 2 PM)...',
        translateBtn: 'Enviar',
        translating: 'Traduciendo...',
        progressStatus: 'Auto-corrigiendo gramática y traduciendo...',
        progressComplete: '✓ Traducción Verificada (100%)',
        progressSending: 'Enviando Mensaje...',
        progressSent: '✓ ¡Auto-corregido y enviado!',
        instantModeLabel: 'Traducción Instantánea Segura y Entrega de Mensajes',
        grammarBadge: 'Gramática Bilingüe Auto-Correctora',
        hitlTogglePremium: 'Revisar mensaje traducido',
        hitlToggleActive: 'Revisar mensaje traducido: ACTIVO',
        hitlTitle: 'Revisión Humana HITL (Mensaje en inglés que se enviará):',
        hitlSubtitle: 'Edita el texto libremente • Presiona Enter ↵ para enviar',
        cancelHitl: 'Cancelar',
        sendBtn: 'Enviar Mensaje',
        sendingSms: 'Enviando Mensaje...',
        uploadingFile: 'Subiendo archivo adjunto...',
        mmsNotice: 'Archivo adjunto:',
        modalTitle: 'Iniciar Nuevo Hilo de Destinatario',
        modalSubtitle: 'Los teléfonos se guardan automáticamente como contactos. Puede agregar nombre y datos opcionalmente.',
        modalPhoneLabel: 'Número de Teléfono',
        modalAutoSaveNote: 'Guardado automáticamente en su directorio al crear el hilo',
        modalNameLabel: 'Nombre del Contacto (Opcional)',
        modalCompanyLabel: 'Empresa / Rol (Opcional)',
        modalNotesLabel: 'Notas Internas (Opcional)',
        modalCancel: 'Cancelar',
        modalSubmit: 'Crear Hilo',
        editContactModalTitle: 'Información del Contacto',
        editContactModalSubtitle: 'Edita el nombre, empresa y notas de este destinatario.',
        contactsModalTitle: 'Directorio de Contactos',
        contactsModalSubtitle: 'Todos los destinatarios se guardan automáticamente aquí al ingresar su teléfono.',
        contactsSearchPlaceholder: 'Buscar contactos por nombre, teléfono o empresa...',
        noContactsFound: 'No hay contactos guardados aún.',
        targetLang: 'English',
        purgeConfirm: (phone) => `¿Estás seguro de que deseas finalizar y purgar permanentemente la conversación con ${phone}? Todos los registros se eliminarán.`,
        purgedNotice: 'Los datos de la conversación han sido purgados del servidor.',
        agentDeliveredSMS: 'Mensaje Enviado al Destinatario (Inglés):',
        agentOriginalDraft: 'Borrador Original del Agente (Español):',
        customerTranslated: 'Traducido al Español:',
        customerOriginal: 'Mensaje Original Entrante del Destinatario (Inglés):',
        viewAttachment: 'Ver Archivo Adjunto',
        trialPill: (days) => `Prueba Premium: ${days}d`,
        trialPillExpired: 'Plan Gratis • Mejorar a Pro',
        trialPillPro: 'Operaciones Pro',
        templatesBtn: 'Plantillas',
        templatesModalTitle: 'Plantillas de Respuesta Rápida',
        templatesModalSubtitle: 'Haga clic en cualquier plantilla operativa pre-verificada para insertarla en su redacción.',
        scheduleBtnTitle: 'Programar mensaje para entrega diferida',
        scheduleModalTitle: 'Programar Envío de Mensaje',
        scheduleModalSubtitle: 'Seleccione un horario futuro para entregar automáticamente este mensaje al destinatario.',
        autoResponderBtn: 'Auto-Respuesta',
        autoRespModalTitle: 'Respuesta Automática Fuera de Horario',
        autoRespModalSubtitle: 'Envía automáticamente un mensaje bilingüe verificado cuando llega un texto fuera del horario operativo.',
        optOutBadge: '🚫 Desuscrito (ALTO)',
        optOutBanner: 'El destinatario se ha desuscrito de los mensajes (ALTO). Comunicación en pausa.',
        deliveredReceipt: 'Entregado',
        sentReceipt: 'Enviado',
        scheduledBadge: (timeStr) => `⏱️ Programado para ${timeStr}`,
        hitlBtnLabel: 'Revisar (HITL)',
        hitlBtnOn: 'ACTIVO',
        hitlBtnOff: 'INACTIVO'
    }
};

// 14-Day Free Trial & Feature Gating
function getTrialInfo() {
    const isPaid = localStorage.getItem('abrevia_tier') === 'paid' || localStorage.getItem('abrevia_tier') === 'pro' || localStorage.getItem('abrevia_tier') === 'premium';
    if (isPaid) {
        return { isPro: true, inTrial: false, daysLeft: 0, trialExpired: false };
    }
    
    let trialStart = localStorage.getItem('abrevia_trial_start');
    if (!trialStart) {
        trialStart = String(Date.now());
        localStorage.setItem('abrevia_trial_start', trialStart);
    }
    
    const startTime = parseInt(trialStart, 10) || Date.now();
    const trialDurationMs = 30 * 24 * 60 * 60 * 1000;
    const elapsed = Date.now() - startTime;
    const remainingMs = trialDurationMs - elapsed;
    
    if (remainingMs > 0) {
        const daysLeft = Math.max(1, Math.ceil(remainingMs / (24 * 60 * 60 * 1000)));
        return { isPro: false, inTrial: true, daysLeft: daysLeft, trialExpired: false };
    } else {
        return { isPro: false, inTrial: false, daysLeft: 0, trialExpired: true };
    }
}

function requireProFeature(featureName) {
    const trial = getTrialInfo();
    if (trial.isPro || trial.inTrial) {
        return true;
    }
    
    const msg = dashboardMode === 'es'
        ? `La función "${featureName}" forma parte de Operaciones Pro.\n\nSu prueba gratuita de 30 días ha finalizado. Actualice a Operaciones Pro ($49/mes) para desbloquear esta función y mensajes ilimitados.`
        : `The "${featureName}" feature is part of Operations Pro.\n\nYour 30-day free trial has concluded. Upgrade to Operations Pro ($49/mo) to unlock this feature and unlimited messaging.`;
        
    const proceed = confirm(msg + (dashboardMode === 'es' ? '\n\n¿Desea ver las opciones de Facturación ahora?' : '\n\nWould you like to view Billing options now?'));
    if (proceed) {
        openBillingModal();
    }
    return false;
}

function updateTrialUI() {
    const trial = getTrialInfo();
    const pillBtn = document.getElementById('trialPillBtn');
    const pillText = document.getElementById('trialPillText');
    const billingTrialBadge = document.getElementById('billingTrialBadge');
    const billingTrialSub = document.getElementById('billingTrialSub');
    const billingTrialDays = document.getElementById('billingTrialDays');
    const t = I18N[dashboardMode];
    
    if (!pillBtn || !pillText) return;
    
    if (trial.isPro) {
        pillText.textContent = t.trialPillPro || 'Operations Pro';
        pillBtn.className = 'inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/25 transition shadow-sm';
        if (billingTrialBadge) {
            billingTrialBadge.textContent = 'PRO ACTIVE';
            billingTrialBadge.className = 'text-[9px] bg-emerald-500/20 text-emerald-300 font-bold px-1.5 py-0.5 rounded-full border border-emerald-500/40';
        }
        if (billingTrialSub) {
            billingTrialSub.textContent = dashboardMode === 'es' ? 'Plan Operaciones Pro activo con todas las funciones desbloqueadas.' : 'Operations Pro plan active with all features unlocked.';
        }
        if (billingTrialDays) {
            billingTrialDays.textContent = 'PRO';
            billingTrialDays.className = 'text-xs font-mono font-bold text-emerald-300 shrink-0 ml-2';
        }
    } else if (trial.inTrial) {
        pillText.textContent = t.trialPill(trial.daysLeft);
        pillBtn.className = 'inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-brand-500/15 text-brand-300 border border-brand-500/30 hover:bg-brand-500/25 transition shadow-sm';
        if (billingTrialBadge) {
            billingTrialBadge.textContent = `${trial.daysLeft}D LEFT`;
            billingTrialBadge.className = 'text-[9px] bg-brand-500/20 text-brand-300 font-bold px-1.5 py-0.5 rounded-full border border-brand-500/40';
        }
        if (billingTrialSub) {
            billingTrialSub.textContent = dashboardMode === 'es' ? `Prueba Premium de 30 Días • Mejore cuando desee o pague por uso seguro con Stripe` : `30-Day Free Premium Trial • Upgrade anytime or pay as you go securely via Stripe`;
        }
        if (billingTrialDays) {
            billingTrialDays.textContent = `${trial.daysLeft}d left`;
            billingTrialDays.className = 'text-xs font-mono font-bold text-brand-300 shrink-0 ml-2';
        }
    } else {
        pillText.textContent = t.trialPillExpired || 'Free Tier • Upgrade to Pro';
        pillBtn.className = 'inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30 hover:bg-amber-500/25 transition shadow-sm';
        if (billingTrialBadge) {
            billingTrialBadge.textContent = 'EXPIRED';
            billingTrialBadge.className = 'text-[9px] bg-amber-500/20 text-amber-300 font-bold px-1.5 py-0.5 rounded-full border border-amber-500/40';
        }
        if (billingTrialSub) {
            billingTrialSub.textContent = dashboardMode === 'es' ? 'Prueba concluida. En plan gratuito básico (hasta 500 msgs/mes).' : 'Trial concluded. On basic free tier (up to 500 msgs/mo).';
        }
        if (billingTrialDays) {
            billingTrialDays.textContent = '0d';
            billingTrialDays.className = 'text-xs font-mono font-bold text-amber-400 shrink-0 ml-2';
        }
    }
}

// Pre-verified Bilingual Operational Snippets (Macros)
const QUICK_TEMPLATES = [
    {
        id: 'delivery_en_route',
        title_en: '🚚 Delivery En Route',
        title_es: '🚚 Entrega en Camino',
        text_en: 'Hello! Our driver is currently en route to your location. Estimated arrival is within 30-45 minutes.',
        text_es: '¡Hola! Nuestro conductor está en camino a su ubicación. La llegada estimada es de 30 a 45 minutos.'
    },
    {
        id: 'confirm_address',
        title_en: '📍 Confirm Address & Gate Code',
        title_es: '📍 Confirmar Dirección y Código',
        text_en: 'Could you please verify your exact street address and any gate code or apartment unit number for our driver?',
        text_es: '¿Podría verificar su dirección exacta y cualquier código de acceso o número de departamento para nuestro conductor?'
    },
    {
        id: 'appointment_reminder',
        title_en: '📅 Appointment Reminder',
        title_es: '📅 Recordatorio de Cita',
        text_en: 'Friendly reminder of your upcoming service appointment scheduled for tomorrow. Please reply to this text to confirm.',
        text_es: 'Recordatorio de su próxima cita de servicio programada para mañana. Por favor responda a este mensaje para confirmar.'
    },
    {
        id: 'ready_pickup',
        title_en: '📦 Ready for Pickup',
        title_es: '📦 Listo para Recoger',
        text_en: 'Your order is ready for pickup at our facility. Please bring a photo ID and reference your order number.',
        text_es: 'Su pedido está listo para ser recogido en nuestras instalaciones. Por favor traiga una identificación oficial y su número de pedido.'
    },
    {
        id: 'photo_request',
        title_en: '📸 Photo Request',
        title_es: '📸 Solicitar Fotografía',
        text_en: 'To assist you faster, could you please reply to this text with a quick photo of the item or issue?',
        text_es: 'Para ayudarle más rápido, ¿podría responder a este mensaje con una foto rápida del artículo o problema?'
    },
    {
        id: 'operational_delay',
        title_en: '⏱️ Operational Delay Notice',
        title_es: '⏱️ Aviso de Demora Operativa',
        text_en: 'We are experiencing a slight operational delay in your area. Our crew will arrive as soon as possible. Thank you for your patience!',
        text_es: 'Estamos experimentando una ligera demora operativa en su área. Nuestro equipo llegará lo antes posible. ¡Agradecemos su paciencia!'
    }
];

function openTemplatesModal() {
    if (!requireProFeature(dashboardMode === 'es' ? 'Plantillas de Respuesta Rápida' : 'Quick Response Templates')) {
        return;
    }
    renderTemplatesList();
    const modal = document.getElementById('templatesModal');
    if (modal) modal.classList.remove('hidden');
}

function closeTemplatesModal() {
    const modal = document.getElementById('templatesModal');
    if (modal) modal.classList.add('hidden');
}

function renderTemplatesList() {
    const container = document.getElementById('templatesListContainer');
    if (!container) return;
    const isEs = dashboardMode === 'es';
    
    container.innerHTML = QUICK_TEMPLATES.map(tpl => {
        const title = isEs ? tpl.title_es : tpl.title_en;
        const text = isEs ? tpl.text_es : tpl.text_en;
        return `
            <div onclick="insertTemplate('${tpl.id}')" class="bg-slate-900/80 hover:bg-slate-800 border border-slate-800 hover:border-brand-500/50 p-3 rounded-xl cursor-pointer transition group">
                <div class="flex items-center justify-between mb-1">
                    <span class="text-xs font-bold text-white group-hover:text-brand-300 transition">${escapeHtml(title)}</span>
                    <span class="text-[10px] text-brand-400 font-semibold opacity-80 group-hover:opacity-100">${isEs ? 'Insertar ↵' : 'Insert ↵'}</span>
                </div>
                <p class="text-xs text-slate-400 line-clamp-2 leading-relaxed italic">"${escapeHtml(text)}"</p>
            </div>
        `;
    }).join('');
}

function insertTemplate(tplId) {
    const tpl = QUICK_TEMPLATES.find(t => t.id === tplId);
    if (!tpl) return;
    const isEs = dashboardMode === 'es';
    const textToInsert = isEs ? tpl.text_es : tpl.text_en;
    
    const inputEl = document.getElementById('agent-input');
    if (inputEl) {
        inputEl.value = textToInsert;
        inputEl.focus();
    }
    closeTemplatesModal();
}

// Scheduled / Delayed Dispatch Logic
function getScheduledMessages() {
    try {
        return JSON.parse(localStorage.getItem('abrevia_scheduled_messages') || '[]');
    } catch {
        return [];
    }
}

function saveScheduledMessages(list) {
    localStorage.setItem('abrevia_scheduled_messages', JSON.stringify(list));
}

function openScheduleModal() {
    if (!requireProFeature(dashboardMode === 'es' ? 'Programación de Mensajes' : 'Scheduled Message Dispatch')) {
        return;
    }
    const inputEl = document.getElementById('agent-input');
    const draftText = inputEl?.value.trim();
    if (!draftText && !currentAttachment) {
        alert(dashboardMode === 'es' 
            ? 'Por favor redacte un mensaje en el campo de texto antes de programar su envío.' 
            : 'Please draft a message in the composer before scheduling delivery.');
        return;
    }
    
    const customInput = document.getElementById('customScheduleInput');
    if (customInput) {
        const d = new Date(Date.now() + 60 * 60 * 1000);
        d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
        customInput.value = d.toISOString().slice(0, 16);
    }
    
    const modal = document.getElementById('scheduleModal');
    if (modal) modal.classList.remove('hidden');
}

function closeScheduleModal() {
    const modal = document.getElementById('scheduleModal');
    if (modal) modal.classList.add('hidden');
}

function applySchedulePreset(preset) {
    let targetTime;
    const now = new Date();
    
    if (typeof preset === 'number') {
        targetTime = Date.now() + preset * 60 * 1000;
    } else if (preset === 'tomorrow-morning') {
        const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 8, 0, 0);
        targetTime = tomorrow.getTime();
    } else if (preset === 'tomorrow-afternoon') {
        const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 13, 0, 0);
        targetTime = tomorrow.getTime();
    } else {
        targetTime = Date.now() + 60 * 60 * 1000;
    }
    
    commitSchedule(targetTime);
}

function applyCustomSchedule() {
    const customInput = document.getElementById('customScheduleInput');
    if (!customInput || !customInput.value) {
        alert(dashboardMode === 'es' ? 'Por favor elija una fecha y hora válida.' : 'Please select a valid date and time.');
        return;
    }
    const targetTime = new Date(customInput.value).getTime();
    if (isNaN(targetTime) || targetTime <= Date.now()) {
        alert(dashboardMode === 'es' ? 'La hora de entrega programada debe ser en el futuro.' : 'Scheduled delivery time must be in the future.');
        return;
    }
    commitSchedule(targetTime);
}

function commitSchedule(scheduledTime) {
    if (!currentTicket) return;
    const inputEl = document.getElementById('agent-input');
    const draftText = inputEl?.value.trim() || '';
    
    const scheduledItem = {
        id: 'sched_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
        ticketId: currentTicket.id,
        customerPhone: currentTicket.customer_phone,
        agentDraft: draftText,
        scheduledTime: scheduledTime,
        attachment: currentAttachment ? { ...currentAttachment, file: null } : null,
        createdAt: Date.now(),
        dashboardMode: dashboardMode
    };
    
    const list = getScheduledMessages();
    list.push(scheduledItem);
    saveScheduledMessages(list);
    
    if (inputEl) inputEl.value = '';
    removeAttachment();
    closeScheduleModal();
    
    fetchMessages(currentTicket.id, true);
    
    const timeFormatted = new Date(scheduledTime).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    alert(dashboardMode === 'es' 
        ? `✓ Mensaje programado con éxito para: ${timeFormatted}` 
        : `✓ Message successfully scheduled for: ${timeFormatted}`);
}

function cancelScheduledMessage(schedId) {
    let list = getScheduledMessages();
    list = list.filter(item => item.id !== schedId);
    saveScheduledMessages(list);
    if (currentTicket) {
        fetchMessages(currentTicket.id, false);
    }
}

async function dispatchScheduledMessageNow(schedId) {
    let list = getScheduledMessages();
    const item = list.find(s => s.id === schedId);
    if (!item) return;
    
    list = list.filter(s => s.id !== schedId);
    saveScheduledMessages(list);
    
    try {
        let translatedText = item.agentDraft;
        let polishedDraft = item.agentDraft;
        
        if (item.agentDraft) {
            const transRes = await fetch('/api/translate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    text: item.agentDraft,
                    targetLang: (item.dashboardMode === 'es') ? 'English' : 'Spanish'
                })
            });
            const data = await transRes.json();
            if (transRes.ok && data.translated) {
                translatedText = data.translated;
                if (data.correctedDraft) polishedDraft = data.correctedDraft;
            }
        }
        
        const isEnglishAgent = (item.dashboardMode !== 'es');
        const englishText = isEnglishAgent ? (polishedDraft || '') : (translatedText || '');
        const spanishText = isEnglishAgent ? (translatedText || '') : (polishedDraft || '');
        const smsBody = isEnglishAgent ? translatedText : polishedDraft;
        
        await fetch('/api/send-sms', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                to: item.customerPhone,
                body: smsBody,
                mediaUrl: item.attachment?.uploadedUrl || null,
                ticketId: item.ticketId,
                englishText: englishText,
                spanishText: spanishText
            })
        });
        
        if (currentTicket && currentTicket.id === item.ticketId) {
            await fetchMessages(currentTicket.id, true);
        }
    } catch (err) {
        console.error('Failed to dispatch scheduled message:', err);
    }
}

async function checkScheduledMessages() {
    const list = getScheduledMessages();
    if (!list.length) return;
    const now = Date.now();
    const due = list.filter(item => item.scheduledTime <= now);
    for (const item of due) {
        await dispatchScheduledMessageNow(item.id);
    }
}

// After-Hours Bilingual Auto-Responder
function getAutoResponderSettings() {
    const defaultSettings = {
        enabled: false,
        messageEs: 'Gracias por contactarnos. Nuestro equipo se encuentra fuera de horario de atención en este momento. Hemos recibido su mensaje y le responderemos a la primera hora hábil.',
        messageEn: 'Thank you for contacting us. Our team is currently outside operational hours. We have received your message and will respond as soon as business hours resume.'
    };
    try {
        const stored = localStorage.getItem('abrevia_auto_responder_config');
        return stored ? { ...defaultSettings, ...JSON.parse(stored) } : defaultSettings;
    } catch {
        return defaultSettings;
    }
}

function openAutoResponderModal() {
    if (!requireProFeature(dashboardMode === 'es' ? 'Respuesta Automática Fuera de Horario' : 'After-Hours Auto-Responder')) {
        return;
    }
    const settings = getAutoResponderSettings();
    const toggle = document.getElementById('autoResponderToggle');
    const msgEs = document.getElementById('autoResponderMsgEs');
    const msgEn = document.getElementById('autoResponderMsgEn');
    
    if (toggle) toggle.checked = Boolean(settings.enabled);
    if (msgEs) msgEs.value = settings.messageEs;
    if (msgEn) msgEn.value = settings.messageEn;
    
    const indicator = document.getElementById('autoRespSavedIndicator');
    if (indicator) indicator.classList.add('hidden');
    
    const modal = document.getElementById('autoResponderModal');
    if (modal) modal.classList.remove('hidden');
}

function closeAutoResponderModal() {
    const modal = document.getElementById('autoResponderModal');
    if (modal) modal.classList.add('hidden');
}

function toggleAutoResponderState(checked) {
    const settings = getAutoResponderSettings();
    settings.enabled = Boolean(checked);
    localStorage.setItem('abrevia_auto_responder_config', JSON.stringify(settings));
    updateAutoResponderNavUI();
}

function saveAutoResponderSettings() {
    const toggle = document.getElementById('autoResponderToggle');
    const msgEs = document.getElementById('autoResponderMsgEs');
    const msgEn = document.getElementById('autoResponderMsgEn');
    
    const settings = {
        enabled: toggle ? toggle.checked : false,
        messageEs: msgEs?.value.trim() || '',
        messageEn: msgEn?.value.trim() || ''
    };
    
    localStorage.setItem('abrevia_auto_responder_config', JSON.stringify(settings));
    updateAutoResponderNavUI();
    
    const indicator = document.getElementById('autoRespSavedIndicator');
    if (indicator) {
        indicator.classList.remove('hidden');
        setTimeout(() => indicator.classList.add('hidden'), 2000);
    }
    setTimeout(closeAutoResponderModal, 500);
}

function updateAutoResponderNavUI() {
    const settings = getAutoResponderSettings();
    const btn = document.getElementById('autoResponderNavBtn');
    const textEl = document.getElementById('autoResponderNavText');
    const t = I18N[dashboardMode];
    
    if (textEl) textEl.textContent = t.autoResponderBtn || 'Auto-Reply';
    if (!btn) return;
    
    if (settings.enabled) {
        btn.className = 'text-xs text-amber-300 px-2 py-1 rounded-lg border border-amber-500/40 bg-amber-500/10 transition flex items-center space-x-1 shadow-sm';
        btn.title = dashboardMode === 'es' ? 'Auto-Respuesta Activa (Fuera de horario)' : 'Auto-Responder Active (After hours)';
    } else {
        btn.className = 'text-xs text-slate-400 hover:text-amber-300 px-2 py-1 rounded-lg border border-slate-800 hover:border-slate-700 bg-slate-900 transition flex items-center space-x-1';
        btn.title = dashboardMode === 'es' ? 'Configurar Auto-Respuesta Fuera de Horario' : 'Configure After-Hours Auto-Responder';
    }
}


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

    // Load contacts from cache and background fetch
    loadContactsFromLocalStorage();
    fetchContacts();
    checkScheduledMessages();

    applyDashboardLocalization();
    refreshTickets();

    // Keyboard shortcuts: Enter to Translate and Enter to Send Encrypted Message
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
        checkScheduledMessages();
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

    // Header language toggle buttons (compact segmented control)
    const btnEn = document.getElementById('modeBtnEn');
    const btnEs = document.getElementById('modeBtnEs');
    if (dashboardMode === 'en') {
        btnEn.className = 'px-2.5 py-1 rounded-md text-xs font-bold bg-brand-600 text-white shadow-sm transition';
        btnEs.className = 'px-2.5 py-1 rounded-md text-xs font-medium text-slate-400 hover:text-white transition';
    } else {
        btnEs.className = 'px-2.5 py-1 rounded-md text-xs font-bold bg-brand-600 text-white shadow-sm transition';
        btnEn.className = 'px-2.5 py-1 rounded-md text-xs font-medium text-slate-400 hover:text-white transition';
    }

    // Header title next to logo
    const headerTitle = document.getElementById('headerConsoleTitle');
    if (headerTitle) headerTitle.textContent = t.consoleBadge;
    const consoleStatusTextEl = document.getElementById('consoleStatusText');
    if (consoleStatusTextEl) consoleStatusTextEl.textContent = t.consoleStatus;
    const billingBtnEl = document.getElementById('billingBtnText');
    if (billingBtnEl) billingBtnEl.textContent = t.billingBtn || 'Billing';
    document.getElementById('signOutLink').textContent = t.signOut;
    document.getElementById('sidebarTitle').textContent = t.sidebarTitle;
    document.getElementById('refreshBtn').textContent = t.refresh;
    document.getElementById('newThreadBtnText').textContent = t.newThreadBtn;
    const mobileBackBtnTextEl = document.getElementById('mobileBackBtnText');
    if (mobileBackBtnTextEl) mobileBackBtnTextEl.textContent = t.mobileBackBtn;
    const closeThreadBtnTextEl = document.getElementById('closeThreadBtnText');
    if (closeThreadBtnTextEl) closeThreadBtnTextEl.textContent = t.closeThreadBtn;

    if (!currentTicket) {
        document.getElementById('activeCustomerTitle').textContent = t.selectConversation;
        document.getElementById('activeSubtitle').textContent = t.selectSubtitle;
    } else {
        updateHeaderWithContact(currentTicket.customer_phone, currentTicket.contact);
        document.getElementById('activeSubtitle').textContent = t.threadSubtitle(currentTicket.id);
    }

    const purgeBtnTextEl = document.getElementById('purgeBtnText');
    if (purgeBtnTextEl) purgeBtnTextEl.textContent = t.purgeBtn;
    const purgeBtnEl = document.getElementById('purgeBtn');
    if (purgeBtnEl && t.purgeBtnTitle) purgeBtnEl.title = t.purgeBtnTitle;

    const emptyTitle = document.getElementById('emptyFeedTitle');
    if (emptyTitle) emptyTitle.textContent = t.emptyFeedTitle;
    const emptySub = document.getElementById('emptyFeedSubtitle');
    if (emptySub) emptySub.textContent = t.emptyFeedSubtitle;

    // Composer
    const agentInputLabel = document.getElementById('agentInputLabel');
    if (agentInputLabel) agentInputLabel.textContent = t.inputLabel;
    document.getElementById('agent-input').placeholder = t.inputPlaceholder;
    document.getElementById('translate-btn').innerHTML = `<span>${t.translateBtn}</span> <span class="text-xs font-bold">↵</span>`;

    // Instant Translation Status & Mode Indicator
    const instantLabel = document.getElementById('instantModeLabel');
    if (instantLabel) instantLabel.textContent = t.instantModeLabel;
    const grammarBadgeEl = document.getElementById('grammarBadge');
    if (grammarBadgeEl) grammarBadgeEl.textContent = t.grammarBadge;
    updateHitlToggleUI();
    updateTrialUI();
    updateAutoResponderNavUI();

    const templatesBtnEl = document.getElementById('templatesBtn');
    if (templatesBtnEl) templatesBtnEl.title = t.templatesBtn;
    const scheduleBtnEl = document.getElementById('scheduleBtn');
    if (scheduleBtnEl) scheduleBtnEl.title = t.scheduleBtnTitle;

    const tplTitle = document.getElementById('templatesModalTitle');
    if (tplTitle) tplTitle.textContent = t.templatesModalTitle;
    const tplSub = document.getElementById('templatesModalSubtitle');
    if (tplSub) tplSub.textContent = t.templatesModalSubtitle;

    const schedTitle = document.getElementById('scheduleModalTitle');
    if (schedTitle) schedTitle.textContent = t.scheduleModalTitle;
    const schedSub = document.getElementById('scheduleModalSubtitle');
    if (schedSub) schedSub.textContent = t.scheduleModalSubtitle;

    // HITL
    document.getElementById('hitlTitleText').textContent = t.hitlTitle;
    document.getElementById('hitlSubtitle').textContent = t.hitlSubtitle;
    document.getElementById('cancelHitlBtn').textContent = t.cancelHitl;
    document.getElementById('sendBtnText').textContent = t.sendBtn;
    updateHitlAttachmentPreview();

    // Contacts & New Thread Modal Localization
    const contactsBtnEl = document.getElementById('contactsBtnText');
    if (contactsBtnEl) contactsBtnEl.textContent = t.contactsBtn;
    const autoSaveNoteEl = document.getElementById('modalAutoSaveNote');
    if (autoSaveNoteEl) autoSaveNoteEl.textContent = t.modalAutoSaveNote;
    const nameLabelEl = document.getElementById('modalNameLabel');
    if (nameLabelEl) nameLabelEl.innerHTML = `${t.modalNameLabel}`;
    const compLabelEl = document.getElementById('modalCompanyLabel');
    if (compLabelEl) compLabelEl.innerHTML = `${t.modalCompanyLabel}`;
    const notesLabelEl = document.getElementById('modalNotesLabel');
    if (notesLabelEl) notesLabelEl.innerHTML = `${t.modalNotesLabel}`;
    const editModalTitle = document.getElementById('editContactModalTitle');
    if (editModalTitle) editModalTitle.textContent = t.editContactModalTitle;
    const editModalSub = document.getElementById('editContactModalSubtitle');
    if (editModalSub) editModalSub.textContent = t.editContactModalSubtitle;
    const dirModalTitle = document.getElementById('contactsModalTitle');
    if (dirModalTitle) dirModalTitle.textContent = t.contactsModalTitle;
    const dirModalSub = document.getElementById('contactsModalSubtitle');
    if (dirModalSub) dirModalSub.textContent = t.contactsModalSubtitle;
    const searchInput = document.getElementById('contactSearchInput');
    if (searchInput) searchInput.placeholder = t.contactsSearchPlaceholder;
    const syncDeviceBtnEl = document.getElementById('syncDeviceBtnText');
    if (syncDeviceBtnEl) syncDeviceBtnEl.textContent = t.syncDeviceBtn.replace('📱 ', '');
    const pullDeviceBtnEl = document.getElementById('pullDeviceBtnText');
    if (pullDeviceBtnEl) pullDeviceBtnEl.textContent = t.pullDeviceBtnText;

    // Modal
    document.getElementById('modalTitle').textContent = t.modalTitle;
    document.getElementById('modalSubtitle').textContent = t.modalSubtitle;
    document.getElementById('modalPhoneLabel').innerHTML = `${t.modalPhoneLabel} <span class="text-red-400">*</span>`;
    document.getElementById('modalCancelBtn').textContent = t.modalCancel;
    document.getElementById('modalSubmitBtn').textContent = t.modalSubmit;
}

// Toggle Proofread Translated Message Mode (Human-In-The-Loop) — Paid Tier feature
function toggleHitlMode() {
    if (!hitlModeEnabled) {
        if (!requireProFeature(dashboardMode === 'es' ? 'Revisión Previa (HITL)' : 'Proofread (HITL)')) {
            return;
        }
    }

    hitlModeEnabled = !hitlModeEnabled;
    if (!hitlModeEnabled) {
        cancelHITL();
    }
    updateHitlToggleUI();
}

function updateHitlToggleUI() {
    const t = I18N[dashboardMode];
    
    // Dedicated composer HITL button
    const hitlModeBtn = document.getElementById('hitlModeBtn');
    const hitlBtnBadge = document.getElementById('hitlBtnBadge');
    const hitlBtnLabel = document.getElementById('hitlBtnLabel');
    if (hitlBtnLabel) hitlBtnLabel.textContent = t.hitlBtnLabel || 'Proofread (HITL)';
    if (hitlModeBtn && hitlBtnBadge) {
        if (hitlModeEnabled) {
            hitlModeBtn.className = 'inline-flex items-center space-x-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition border border-emerald-500/50 bg-emerald-500/15 text-emerald-300 shadow-sm';
            hitlBtnBadge.textContent = t.hitlBtnOn || 'ON';
            hitlBtnBadge.className = 'text-[9px] uppercase font-bold px-1.5 py-0.5 rounded bg-emerald-500/30 text-emerald-200 border border-emerald-500/50';
        } else {
            hitlModeBtn.className = 'inline-flex items-center space-x-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition border border-slate-700 bg-slate-900 text-slate-400 hover:text-white hover:border-slate-600 shadow-sm';
            hitlBtnBadge.textContent = t.hitlBtnOff || 'OFF';
            hitlBtnBadge.className = 'text-[9px] uppercase font-bold px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700';
        }
    }

    const toggleBtn = document.getElementById('toggleHitlBtn');
    const hitlToggleText = document.getElementById('hitlToggleText');
    if (toggleBtn && hitlToggleText) {
        if (hitlModeEnabled) {
            toggleBtn.className = 'inline-flex items-center space-x-1 text-emerald-300 font-semibold px-2 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/30';
            hitlToggleText.textContent = t.hitlToggleActive;
        } else {
            toggleBtn.className = 'inline-flex items-center space-x-1 text-slate-400 hover:text-brand-300 transition px-2 py-0.5 rounded-md hover:bg-slate-900 border border-transparent hover:border-slate-800';
            hitlToggleText.textContent = t.hitlTogglePremium;
        }
    }
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
            const norm = normalizeClientPhone(item.customer_phone);
            const contact = item.contact || contactsMap[norm] || null;
            if (contact && !contactsMap[norm]) {
                contactsMap[norm] = contact;
            }

            const hasName = contact && contact.name && contact.name.trim();
            const displayName = hasName ? escapeHtml(contact.name) : escapeHtml(item.customer_phone);
            const subDetail = hasName 
                ? `${escapeHtml(item.customer_phone)}${contact.company ? ' • ' + escapeHtml(contact.company) : ''}`
                : `<span class="text-brand-400 font-normal hover:underline">${t.addContactBtn}</span>`;

            return `
                <div onclick="selectTicket('${item.id}', '${item.customer_phone}')" 
                     class="w-full text-left p-3 rounded-xl cursor-pointer transition border ${
                         isSelected 
                         ? 'bg-brand-600/15 border-brand-500/40 text-white shadow-sm' 
                         : 'bg-slate-900/60 border-slate-800 text-slate-300 hover:bg-slate-800/60 hover:border-slate-700'
                     }">
                    <div class="flex justify-between items-center mb-1">
                        <span class="font-semibold text-xs text-white truncate max-w-[170px]">${displayName}</span>
                        <span class="text-[10px] text-slate-500 shrink-0">${dateStr}</span>
                    </div>
                    <div class="flex justify-between items-center text-[11px] text-slate-400">
                        <span class="truncate max-w-[175px]">${subDetail}</span>
                        <span class="text-[10px] ${item.status === 'active' ? 'text-emerald-400' : 'text-slate-500'} font-medium uppercase shrink-0">
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
async function selectTicket(ticketId, customerPhone, contactData = null) {
    const norm = normalizeClientPhone(customerPhone);
    const contact = contactData || contactsMap[norm] || { phone: customerPhone, name: '' };
    currentTicket = { id: ticketId, customer_phone: customerPhone, contact };
    const t = I18N[dashboardMode];
    
    // Update Header with Contact details
    updateHeaderWithContact(customerPhone, contact);

    document.getElementById('activeSubtitle').textContent = t.threadSubtitle(ticketId);
    const purgeBtnEl = document.getElementById('purgeBtn');
    if (purgeBtnEl) purgeBtnEl.classList.remove('hidden');
    const editContactBtn = document.getElementById('editContactBtn');
    if (editContactBtn) editContactBtn.classList.remove('hidden');
    const closeThreadBtn = document.getElementById('closeThreadBtn');
    if (closeThreadBtn) closeThreadBtn.classList.remove('hidden');
    document.getElementById('inputArea').classList.remove('hidden');

    // Responsive view management:
    // On mobile (< 768px): collapse sidebar and display chat workspace full screen
    // On desktop (>= 768px): keep BOTH sidebar and chat workspace visible side-by-side
    const sidebar = document.getElementById('conversationsSidebar');
    const workspace = document.getElementById('chatWorkspace');
    if (sidebar && workspace) {
        if (window.innerWidth < 768) {
            sidebar.classList.add('hidden');
            sidebar.classList.remove('flex');
            workspace.classList.remove('hidden');
            workspace.classList.add('flex');
        } else {
            sidebar.classList.remove('hidden');
            sidebar.classList.add('flex');
            workspace.classList.remove('hidden');
            workspace.classList.add('flex');
        }
    }

    cancelHITL();
    removeAttachment();
    refreshTickets(false);
    await fetchMessages(ticketId, true);
}

// Update Active Conversation Header with Contact Info
function updateHeaderWithContact(customerPhone, contact = null) {
    const norm = normalizeClientPhone(customerPhone);
    const c = contact || contactsMap[norm] || { phone: customerPhone, name: '' };
    const t = I18N[dashboardMode];

    const avatarEl = document.getElementById('contactAvatar');
    const titleEl = document.getElementById('activeCustomerTitle');
    const compEl = document.getElementById('activeContactCompany');
    const phoneSep = document.getElementById('activePhoneSeparator');
    const phoneDisplay = document.getElementById('activeCustomerPhoneDisplay');
    const editContactBtn = document.getElementById('editContactBtn');
    const editBtnIcon = document.getElementById('editContactBtnIcon');
    const editBtnText = document.getElementById('editContactBtnText');

    if (c && c.name && c.name.trim()) {
        if (avatarEl) {
            avatarEl.textContent = getInitials(c.name);
            avatarEl.className = 'w-9 h-9 rounded-xl bg-brand-600 text-white font-bold text-xs flex items-center justify-center shadow-sm shrink-0';
        }
        if (titleEl) titleEl.textContent = c.name;
        if (compEl) {
            if (c.company) {
                compEl.textContent = c.company;
                compEl.classList.remove('hidden');
            } else {
                compEl.classList.add('hidden');
            }
        }
        if (phoneSep) phoneSep.classList.remove('hidden');
        if (phoneDisplay) {
            phoneDisplay.textContent = customerPhone;
            phoneDisplay.classList.remove('hidden');
        }
        if (editBtnIcon) editBtnIcon.textContent = '👤';
        if (editBtnText) editBtnText.textContent = t.editContactBtn;
        if (editContactBtn) {
            editContactBtn.className = 'bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700 hover:border-slate-600 text-xs px-2 sm:px-2.5 py-1.5 rounded-lg transition flex items-center space-x-1.5 shadow-sm';
            editContactBtn.title = t.editContactBtn;
        }
    } else {
        if (avatarEl) {
            avatarEl.textContent = '👤';
            avatarEl.className = 'w-9 h-9 rounded-xl bg-slate-800 text-slate-400 font-bold text-xs flex items-center justify-center shadow-sm border border-slate-700 shrink-0';
        }
        if (titleEl) titleEl.textContent = `${dashboardMode === 'en' ? 'Recipient' : 'Destinatario'}: ${customerPhone}`;
        if (compEl) compEl.classList.add('hidden');
        if (phoneSep) phoneSep.classList.add('hidden');
        if (phoneDisplay) phoneDisplay.classList.add('hidden');
        if (editBtnIcon) editBtnIcon.textContent = '➕';
        if (editBtnText) editBtnText.textContent = t.addContactBtn;
        if (editContactBtn) {
            editContactBtn.className = 'bg-brand-500/15 hover:bg-brand-500/25 text-brand-300 hover:text-white border border-brand-500/40 hover:border-brand-500 text-xs font-semibold px-2 sm:px-2.5 py-1.5 rounded-lg transition flex items-center space-x-1.5 shadow-sm';
            editContactBtn.title = t.addContactBtn;
        }
    }

    // Opt-Out Compliance (STOP/ALTO) handling
    const optOutBadge = document.getElementById('optOutHeaderBadge');
    const optOutBanner = document.getElementById('optOutAlertBanner');
    const agentInput = document.getElementById('agent-input');
    const translateBtn = document.getElementById('translate-btn');
    const templatesBtn = document.getElementById('templatesBtn');
    const scheduleBtn = document.getElementById('scheduleBtn');

    if (c && c.opted_out) {
        if (optOutBadge) {
            optOutBadge.textContent = t.optOutBadge || '🚫 Opted Out (STOP)';
            optOutBadge.classList.remove('hidden');
        }
        if (optOutBanner) {
            const bannerText = document.getElementById('optOutAlertText');
            if (bannerText) bannerText.textContent = t.optOutBanner || 'Recipient has opted out of automated messaging (STOP). Messaging is paused.';
            optOutBanner.classList.remove('hidden');
        }
        if (agentInput) {
            agentInput.disabled = true;
            agentInput.placeholder = dashboardMode === 'es' 
                ? 'Mensajería en pausa - Destinatario envió ALTO' 
                : 'Messaging paused - Recipient opted out via STOP';
        }
        if (translateBtn) translateBtn.disabled = true;
        if (templatesBtn) templatesBtn.disabled = true;
        if (scheduleBtn) scheduleBtn.disabled = true;
    } else {
        if (optOutBadge) optOutBadge.classList.add('hidden');
        if (optOutBanner) optOutBanner.classList.add('hidden');
        if (agentInput) {
            agentInput.disabled = false;
            agentInput.placeholder = t.inputPlaceholder;
        }
        if (translateBtn) translateBtn.disabled = false;
        if (templatesBtn) templatesBtn.disabled = false;
        if (scheduleBtn) scheduleBtn.disabled = false;
    }
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

// Clean message text by stripping raw internal Supabase attachment URLs that are already rendered by the media preview
function formatMessageContent(rawText) {
    if (!rawText) return '';
    let cleaned = rawText
        .replace(/\n*📎 (Attachment|Adjunto):\s*https?:\/\/[^\s]+/gi, '')
        .trim();

    if (!cleaned) {
        cleaned = dashboardMode === 'es' ? '📎 Archivo adjunto' : '📎 Attached file';
    }

    return escapeHtml(cleaned);
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
            <div class="mt-2 pt-2 border-t border-white/10 max-w-full overflow-hidden">
                <a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" class="block max-w-full">
                    <img src="${escapeHtml(url)}" alt="Attachment" class="max-h-48 max-w-full rounded-lg border border-white/20 hover:opacity-90 transition object-cover" />
                </a>
            </div>
        `;
    } else {
        return `
            <div class="mt-2 pt-2 border-t border-white/10 max-w-full overflow-hidden">
                <a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-black/30 hover:bg-black/50 border border-white/20 text-xs text-white transition max-w-full truncate">
                    <span>📎</span>
                    <span class="underline truncate">${t.viewAttachment}</span>
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
                <div class="flex flex-col items-end space-y-1 max-w-xl sm:max-w-2xl ml-auto min-w-0 w-full">
                    <span class="text-[10px] text-slate-500 font-medium mr-1">${dashboardMode === 'en' ? 'Agent (You)' : 'Agente (Usted)'} &bull; ${time}</span>
                    <div class="bg-brand-600 text-white rounded-2xl rounded-tr-sm p-3.5 shadow-md text-sm space-y-1.5 max-w-full sm:max-w-xl w-fit ml-auto min-w-0 break-words [overflow-wrap:anywhere] overflow-hidden">
                        <div class="text-xs text-blue-100 pb-1.5 border-b border-blue-400/30 min-w-0 break-words [overflow-wrap:anywhere]">
                            <span class="font-bold uppercase tracking-wider text-[10px] text-blue-200 block mb-0.5">${topLabel}</span>
                            <div class="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">${formatMessageContent(topText)}</div>
                        </div>
                        <div class="text-xs text-blue-200 min-w-0 break-words [overflow-wrap:anywhere]">
                            <span class="font-bold uppercase tracking-wider text-[10px] text-blue-300 block mb-0.5">${bottomLabel}</span>
                            <div class="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">${formatMessageContent(bottomText)}</div>
                        </div>
                        ${attachmentHtml}
                        <div class="flex items-center justify-end space-x-1 text-[10px] text-blue-200/90 pt-1 border-t border-blue-400/20 font-medium">
                            <span>✓✓</span>
                            <span>${t.deliveredReceipt || 'Delivered'}</span>
                        </div>
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
                <div class="flex flex-col items-start space-y-1 max-w-xl sm:max-w-2xl mr-auto min-w-0 w-full">
                    <span class="text-[10px] text-slate-500 font-medium ml-1">${dashboardMode === 'en' ? 'Recipient' : 'Destinatario'} (${escapeHtml(currentTicket.customer_phone)}) &bull; ${time}</span>
                    <div class="bg-slate-800 border border-slate-700 text-slate-100 rounded-2xl rounded-tl-sm p-3.5 shadow-md text-sm space-y-1.5 max-w-full sm:max-w-xl w-fit mr-auto min-w-0 break-words [overflow-wrap:anywhere] overflow-hidden">
                        <div class="text-sm font-medium text-emerald-300 pb-1.5 border-b border-slate-700 min-w-0 break-words [overflow-wrap:anywhere]">
                            <span class="font-bold uppercase tracking-wider text-[10px] text-emerald-400 block mb-0.5">${topLabel}</span>
                            <div class="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">${formatMessageContent(topText)}</div>
                        </div>
                        <div class="text-xs text-slate-400 min-w-0 break-words [overflow-wrap:anywhere]">
                            <span class="font-bold uppercase tracking-wider text-[10px] text-slate-500 block mb-0.5">${bottomLabel}</span>
                            <div class="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">${formatMessageContent(bottomText)}</div>
                        </div>
                        ${attachmentHtml}
                    </div>
                </div>
            `;
        }
    }).join('');

    // Append pending scheduled messages for active ticket
    if (currentTicket) {
        const scheduledList = getScheduledMessages().filter(s => s.ticketId === currentTicket.id);
        if (scheduledList.length > 0) {
            const scheduledCards = scheduledList.map(s => {
                const timeStr = new Date(s.scheduledTime).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
                return `
                    <div class="flex flex-col items-end space-y-1 max-w-xl sm:max-w-2xl ml-auto min-w-0 w-full opacity-95">
                        <span class="text-[10px] text-amber-400 font-semibold mr-1">${t.scheduledBadge(timeStr)}</span>
                        <div class="bg-slate-900 border border-amber-500/40 rounded-2xl rounded-tr-sm p-3.5 shadow-md text-xs text-slate-200 max-w-full space-y-2">
                            <div class="text-amber-300 font-bold text-[10px] uppercase tracking-wider flex items-center justify-between border-b border-amber-500/20 pb-1.5 gap-4">
                                <span>${dashboardMode === 'es' ? 'En cola para entrega diferida' : 'Queued for Delayed Dispatch'}</span>
                                <div class="flex space-x-2">
                                    <button onclick="dispatchScheduledMessageNow('${s.id}')" class="text-brand-400 hover:text-brand-300 font-semibold underline text-[10px]">${dashboardMode === 'es' ? 'Enviar Ahora' : 'Send Now'}</button>
                                    <button onclick="cancelScheduledMessage('${s.id}')" class="text-red-400 hover:text-red-300 font-semibold underline text-[10px]">${dashboardMode === 'es' ? 'Cancelar' : 'Cancel'}</button>
                                </div>
                            </div>
                            <div class="italic text-slate-300 whitespace-pre-wrap">${escapeHtml(s.agentDraft)}</div>
                        </div>
                    </div>
                `;
            }).join('');
            feed.innerHTML += scheduledCards;
        }
    }

    if (scrollToBottom) {
        feed.scrollTop = feed.scrollHeight;
    }
}

// Abrevia 1 Composer: Auto-translates & dispatches messages directly with real-time translating technology (Instant Mode).
// Pre-send review is reserved for Premium Tier.
async function handleTranslateAndSend() {
    if (!currentTicket) {
        alert(dashboardMode === 'es' ? 'Por favor seleccione o cree una conversación primero.' : 'Please select or create a conversation first.');
        return;
    }
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
        let polishedDraft = draftText;
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
            if (data.correctedDraft) {
                polishedDraft = data.correctedDraft;
            }
        }

        clearInterval(progressTimer);

        if (!hitlModeEnabled) {
            // Abrevia 1 Instant Mode: Auto-dispatch translated message directly without human-in-the-loop review
            if (progressStatusText) progressStatusText.textContent = t.sendingSms;
            if (progressBarFill) progressBarFill.style.width = '94%';
            if (progressPercentage) progressPercentage.textContent = '94%';

            // 1. Upload attachment if present and not yet uploaded
            let mediaUrl = currentAttachment?.uploadedUrl || null;
            if (currentAttachment && !mediaUrl) {
                if (progressStatusText) progressStatusText.textContent = t.uploadingFile;
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
                    throw new Error('Attachment upload error: ' + upErr.message);
                }
            }

            // 2. Dispatch message directly via /api/send-sms with self-corrected text
            const englishText = (dashboardMode === 'en') ? (polishedDraft || (mediaUrl ? 'Attachment sent' : '')) : (translatedText || (mediaUrl ? 'Attachment sent' : ''));
            const spanishText = (dashboardMode === 'en') ? (translatedText || (mediaUrl ? 'Adjunto enviado' : '')) : (polishedDraft || (mediaUrl ? 'Adjunto enviado' : ''));
            const smsBody = (dashboardMode === 'en' ? translatedText : polishedDraft) || (dashboardMode === 'en' ? 'Adjunto recibido:' : 'Attachment:');

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
            if (!res.ok) throw new Error(data.error || 'Failed to send encrypted message');

            // 3. Clear inputs and flash sent notification
            inputEl.value = '';
            removeAttachment();

            if (progressBarFill) progressBarFill.style.width = '100%';
            if (progressPercentage) progressPercentage.textContent = '100%';
            if (progressStatusText) progressStatusText.textContent = t.progressSent || '✓ Self-Corrected & Sent!';

            await new Promise(r => setTimeout(r, 450));
            if (progressContainer) progressContainer.classList.add('hidden');

            // Refresh message feed
            await fetchMessages(currentTicket.id, true);
            return;
        }

        // Premium Tier HITL Review Box (Only when pre-send review is enabled)
        if (progressBarFill) progressBarFill.style.width = '100%';
        if (progressPercentage) progressPercentage.textContent = '100%';
        if (progressStatusText) progressStatusText.textContent = t.progressComplete;

        await new Promise(r => setTimeout(r, 260));
        if (progressContainer) progressContainer.classList.add('hidden');

        const hitlContainer = document.getElementById('hitlContainer');
        const reviewBox = document.getElementById('target-review-box');
        reviewBox.value = translatedText;
        if (polishedDraft && polishedDraft !== draftText) {
            inputEl.value = polishedDraft;
        }
        hitlContainer.classList.remove('hidden');
        updateHitlAttachmentPreview();
        reviewBox.focus();
    } catch (err) {
        clearInterval(progressTimer);
        if (progressContainer) progressContainer.classList.add('hidden');
        alert('Translation error: ' + (err.name === 'TimeoutError' ? 'Translation request timed out. Please try again.' : err.message));
    } finally {
        translateBtn.disabled = false;
        translateBtn.innerHTML = `<span>${t.translateBtn}</span> <span class="text-xs font-bold">↵</span>`;
    }
}

// HITL Step 2: Confirm reviewed translation, upload attachment if any, and dispatch message via httpSMS
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
        if (!res.ok) throw new Error(data.error || 'Failed to send encrypted message');

        // Clear inputs and reset HITL box and attachment
        document.getElementById('agent-input').value = '';
        removeAttachment();
        cancelHITL();

        // Refresh feed
        await fetchMessages(currentTicket.id, true);
    } catch (err) {
        alert((dashboardMode === 'es' ? 'Error al enviar mensaje: ' : 'Send message error: ') + err.message);
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
        if (window.innerWidth < 768) {
            closeMobileConversation();
        }
    } catch (err) {
        alert('Purge error: ' + err.message);
    }
}

// Navigation handler: return to conversations list on mobile, or deselect active conversation on desktop
function closeMobileConversation() {
    const sidebar = document.getElementById('conversationsSidebar');
    const workspace = document.getElementById('chatWorkspace');
    if (sidebar && workspace) {
        if (window.innerWidth < 768) {
            workspace.classList.add('hidden');
            workspace.classList.remove('flex');
            sidebar.classList.remove('hidden');
            sidebar.classList.add('flex');
        } else {
            sidebar.classList.remove('hidden');
            sidebar.classList.add('flex');
            workspace.classList.remove('hidden');
            workspace.classList.add('flex');
        }
    }
    currentTicket = null;
    const t = I18N[dashboardMode];
    const titleEl = document.getElementById('activeCustomerTitle');
    if (titleEl) titleEl.textContent = t.selectConversation;
    const subEl = document.getElementById('activeSubtitle');
    if (subEl) subEl.textContent = t.selectSubtitle;
    const purgeBtnEl = document.getElementById('purgeBtn');
    if (purgeBtnEl) purgeBtnEl.classList.add('hidden');
    const editContactBtn = document.getElementById('editContactBtn');
    if (editContactBtn) editContactBtn.classList.add('hidden');
    const closeThreadBtn = document.getElementById('closeThreadBtn');
    if (closeThreadBtn) closeThreadBtn.classList.add('hidden');
    const inputArea = document.getElementById('inputArea');
    if (inputArea) inputArea.classList.add('hidden');

    const contactAvatar = document.getElementById('contactAvatar');
    if (contactAvatar) {
        contactAvatar.textContent = '👤';
        contactAvatar.className = 'w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300 font-bold text-xs uppercase shadow-sm shrink-0';
    }
    const compEl = document.getElementById('activeContactCompany');
    if (compEl) compEl.classList.add('hidden');
    const phoneSep = document.getElementById('activePhoneSeparator');
    if (phoneSep) phoneSep.classList.add('hidden');
    const phoneDisplay = document.getElementById('activeCustomerPhoneDisplay');
    if (phoneDisplay) phoneDisplay.classList.add('hidden');

    const feed = document.getElementById('chatFeed');
    if (feed) {
        feed.innerHTML = `
            <div class="text-center py-12">
                <div class="w-12 h-12 rounded-2xl bg-slate-800/60 border border-slate-700/60 flex items-center justify-center mx-auto mb-3">
                    <img src="/assets/logo.png" alt="" class="h-6 w-6 opacity-60">
                </div>
                <p id="emptyFeedTitle" class="text-xs text-slate-400 font-medium">${t.emptyFeedTitle}</p>
                <p id="emptyFeedSubtitle" class="text-[11px] text-slate-600 mt-1">${t.emptyFeedSubtitle}</p>
            </div>
        `;
    }

    cancelHITL();
    removeAttachment();
    refreshTickets(false);
}

// Modal handling for New Ticket
function openNewTicketModal() {
    document.getElementById('newTicketModal').classList.remove('hidden');
    document.getElementById('newCustomerPhone').focus();
}

function closeNewTicketModal() {
    document.getElementById('newTicketModal').classList.add('hidden');
    document.getElementById('newCustomerPhone').value = '';
    const nameEl = document.getElementById('newCustomerName');
    if (nameEl) nameEl.value = '';
    const compEl = document.getElementById('newCustomerCompany');
    if (compEl) compEl.value = '';
    const notesEl = document.getElementById('newCustomerNotes');
    if (notesEl) notesEl.value = '';
}

// Auto-lookup contact as user enters phone number in the modal
function checkExistingContactLookup(phoneVal) {
    if (!phoneVal) return;
    const norm = normalizeClientPhone(phoneVal);
    const existing = contactsMap[norm];
    if (existing) {
        const nameInput = document.getElementById('newCustomerName');
        const companyInput = document.getElementById('newCustomerCompany');
        const notesInput = document.getElementById('newCustomerNotes');
        if (nameInput && !nameInput.value && existing.name) {
            nameInput.value = existing.name;
        }
        if (companyInput && !companyInput.value && existing.company) {
            companyInput.value = existing.company;
        }
        if (notesInput && !notesInput.value && existing.notes) {
            notesInput.value = existing.notes;
        }
    }
}

async function handleCreateTicket(e) {
    e.preventDefault();
    const phone = document.getElementById('newCustomerPhone').value.trim();
    const name = document.getElementById('newCustomerName')?.value.trim() || '';
    const company = document.getElementById('newCustomerCompany')?.value.trim() || '';
    const notes = document.getElementById('newCustomerNotes')?.value.trim() || '';
    if (!phone) return;

    try {
        const res = await fetch('/api/tickets', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                customerPhone: phone,
                customerName: name,
                company: company,
                notes: notes
            })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to create thread');

        // Immediately register in local contact directory
        const norm = normalizeClientPhone(phone);
        const contactObj = data.ticket?.contact || {
            phone: norm,
            name: name,
            company: company,
            notes: notes,
            updatedAt: new Date().toISOString()
        };
        contactsMap[norm] = contactObj;
        saveContactsToLocalStorage();

        closeNewTicketModal();
        await refreshTickets(true);
        if (data.ticket) {
            selectTicket(data.ticket.id, data.ticket.customer_phone, contactObj);
        }
    } catch (err) {
        alert('Create thread error: ' + err.message);
    }
}

// --- Contact Management Modals & Operations ---

// Open Edit Contact Details Modal for the active conversation
function openCurrentContactModal() {
    if (!currentTicket) return;
    openEditContactForPhone(currentTicket.customer_phone);
}

function openEditContactForPhone(phone) {
    const norm = normalizeClientPhone(phone);
    const contact = contactsMap[norm] || (currentTicket?.contact) || { phone: phone };

    document.getElementById('editContactPhone').value = phone;
    document.getElementById('editContactName').value = contact.name || '';
    document.getElementById('editContactCompany').value = contact.company || '';
    document.getElementById('editContactEmail').value = contact.email || '';
    document.getElementById('editContactNotes').value = contact.notes || '';

    document.getElementById('editContactModal')?.classList.remove('hidden');
    document.getElementById('editContactName')?.focus();
}

function closeEditContactModal() {
    document.getElementById('editContactModal')?.classList.add('hidden');
}

async function handleSaveContactDetails(e) {
    e.preventDefault();
    const phone = document.getElementById('editContactPhone').value.trim();
    const name = document.getElementById('editContactName').value.trim();
    const company = document.getElementById('editContactCompany').value.trim();
    const email = document.getElementById('editContactEmail').value.trim();
    const notes = document.getElementById('editContactNotes').value.trim();
    if (!phone) return;

    const norm = normalizeClientPhone(phone);
    const updated = {
        phone: norm,
        name,
        company,
        email,
        notes,
        updatedAt: new Date().toISOString()
    };

    // Instant local state update
    contactsMap[norm] = updated;
    saveContactsToLocalStorage();
    closeEditContactModal();

    // Update active conversation header if current
    if (currentTicket && normalizeClientPhone(currentTicket.customer_phone) === norm) {
        currentTicket.contact = updated;
        updateHeaderWithContact(currentTicket.customer_phone, updated);
    }

    // Refresh tickets sidebar to reflect name
    await refreshTickets(false);

    // If contacts directory is open, re-render
    const dirModal = document.getElementById('contactsModal');
    if (dirModal && !dirModal.classList.contains('hidden')) {
        renderContactsDirectory(document.getElementById('contactSearchInput')?.value || '');
    }

    // Sync to backend storage
    try {
        await fetch('/api/contacts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updated)
        });
    } catch (err) {
        console.warn('Background contact save error:', err);
    }
}

// Contacts Directory Modal
async function openContactsModal() {
    await fetchContacts();
    renderContactsDirectory();
    document.getElementById('contactsModal')?.classList.remove('hidden');
    document.getElementById('contactSearchInput')?.focus();
}

function closeContactsModal() {
    document.getElementById('contactsModal')?.classList.add('hidden');
    const input = document.getElementById('contactSearchInput');
    if (input) input.value = '';
}

function filterContactsList(searchQuery) {
    renderContactsDirectory(searchQuery);
}

function renderContactsDirectory(filter = '') {
    const listEl = document.getElementById('contactsDirectoryList');
    const countEl = document.getElementById('contactsCountText');
    if (!listEl) return;
    const t = I18N[dashboardMode];

    const cleanFilter = filter.trim().toLowerCase();
    const allContacts = Object.values(contactsMap).sort((a, b) => {
        const nameA = (a.name || a.phone || '').toLowerCase();
        const nameB = (b.name || b.phone || '').toLowerCase();
        return nameA.localeCompare(nameB);
    });

    const filtered = allContacts.filter(c => {
        if (!cleanFilter) return true;
        const n = (c.name || '').toLowerCase();
        const p = (c.phone || '').toLowerCase();
        const comp = (c.company || '').toLowerCase();
        const nt = (c.notes || '').toLowerCase();
        return n.includes(cleanFilter) || p.includes(cleanFilter) || comp.includes(cleanFilter) || nt.includes(cleanFilter);
    });

    if (countEl) {
        countEl.textContent = `${filtered.length} ${filtered.length === 1 ? 'contact' : 'contacts'} saved`;
    }

    if (filtered.length === 0) {
        listEl.innerHTML = `
            <div class="text-center py-10 text-slate-500 text-xs">
                ${t.noContactsFound}
            </div>
        `;
        return;
    }

    listEl.innerHTML = filtered.map(c => {
        const initials = getInitials(c.name || c.phone);
        const displayName = (c.name && c.name.trim()) ? escapeHtml(c.name) : escapeHtml(c.phone);
        const hasCompany = Boolean(c.company && c.company.trim());
        const hasNotes = Boolean(c.notes && c.notes.trim());

        return `
            <div class="p-3 bg-slate-900/90 border border-slate-800 rounded-xl flex items-center justify-between hover:border-slate-700 transition">
                <div class="flex items-center space-x-3 overflow-hidden">
                    <div class="w-8 h-8 rounded-lg ${c.name ? 'bg-brand-600 text-white' : 'bg-slate-800 text-slate-400 border border-slate-700'} flex items-center justify-center font-bold text-xs shrink-0 shadow-sm">
                        ${initials}
                    </div>
                    <div class="overflow-hidden">
                        <div class="flex items-center space-x-2">
                            <span class="text-xs font-bold text-white truncate">${displayName}</span>
                            ${hasCompany ? `<span class="text-[10px] bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded border border-slate-700 truncate">${escapeHtml(c.company)}</span>` : ''}
                        </div>
                        <div class="text-[11px] text-slate-400 font-mono flex items-center space-x-2">
                            <span>${escapeHtml(c.phone)}</span>
                            ${hasNotes ? `<span class="text-slate-500 text-[10px] truncate max-w-xs">&bull; ${escapeHtml(c.notes)}</span>` : ''}
                        </div>
                    </div>
                </div>
                <div class="flex items-center space-x-1.5 shrink-0 ml-2">
                    <button onclick="startThreadWithContact('${escapeHtml(c.phone)}')" class="bg-brand-600 hover:bg-brand-500 text-white text-xs px-2.5 py-1 rounded-lg transition font-medium shadow-sm">
                        ${dashboardMode === 'es' ? 'Mensaje' : 'Message'}
                    </button>
                    <button onclick="openEditContactForPhone('${escapeHtml(c.phone)}')" title="Edit Contact" class="bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs px-2 py-1 rounded-lg transition">
                        ✏️
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

async function startThreadWithContact(phone) {
    closeContactsModal();
    try {
        const res = await fetch('/api/tickets', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ customerPhone: phone })
        });
        const data = await res.json();
        await refreshTickets(true);
        if (data.ticket) {
            selectTicket(data.ticket.id, data.ticket.customer_phone, data.ticket.contact);
        }
    } catch (err) {
        alert('Error opening thread: ' + err.message);
    }
}

// Contacts Client Storage Helpers
function normalizeClientPhone(phone) {
    if (!phone) return '';
    let clean = phone.trim().replace(/[^\d+]/g, '');
    if (!clean.startsWith('+')) clean = '+' + clean;
    return clean;
}

function getInitials(text) {
    if (!text) return '👤';
    const clean = text.replace(/^\+/, '').trim();
    const parts = clean.split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
}

function saveContactsToLocalStorage() {
    try {
        localStorage.setItem('abrevia_contacts', JSON.stringify(contactsMap));
    } catch (e) {}
}

function loadContactsFromLocalStorage() {
    try {
        const cached = localStorage.getItem('abrevia_contacts');
        if (cached) {
            contactsMap = Object.assign({}, JSON.parse(cached), contactsMap);
        }
    } catch (e) {}
}

async function fetchContacts() {
    try {
        const res = await fetch('/api/contacts');
        if (res.ok) {
            const data = await res.json();
            if (data.contacts) {
                contactsMap = Object.assign({}, contactsMap, data.contacts);
                saveContactsToLocalStorage();
            }
        }
    } catch (err) {
        console.warn('Error fetching contacts:', err);
    }
}

// --- Device Contacts Synchronization & Address Book Import ---

// Pull contacts from device (Contact Picker API on supported mobile browsers, fallback to vCard / CSV import)
async function syncContactsFromDevice() {
    const t = I18N[dashboardMode];

    if ('contacts' in navigator && 'ContactsManager' in window && 'select' in navigator.contacts) {
        try {
            const props = ['name', 'tel', 'email'];
            const opts = { multiple: true };
            const contacts = await navigator.contacts.select(props, opts);
            if (contacts && contacts.length > 0) {
                const batch = [];
                for (const item of contacts) {
                    const name = (item.name && item.name[0]) ? item.name[0] : '';
                    const email = (item.email && item.email[0]) ? item.email[0] : '';
                    const phones = item.tel || [];
                    for (const p of phones) {
                        if (p && p.trim()) {
                            batch.push({
                                name: name.trim(),
                                email: email.trim(),
                                phone: p.trim()
                            });
                            break; // primary phone
                        }
                    }
                }

                if (batch.length > 0) {
                    await saveBatchContactsAndNotify(batch);
                    return;
                }
            }
        } catch (err) {
            console.warn('Native contact picker dismissed or unsupported:', err);
            if (err.name === 'AbortError') return; // User closed picker
        }
    }

    // Fallback: trigger file picker for .vcf / .csv address book
    const fileInput = document.getElementById('contactsFileInput');
    if (fileInput) {
        fileInput.click();
    }
}

// Pull a single contact from device to autofill the active contact modal
async function pullDeviceContactForCurrent() {
    if ('contacts' in navigator && 'ContactsManager' in window && 'select' in navigator.contacts) {
        try {
            const props = ['name', 'tel', 'email'];
            const opts = { multiple: false };
            const contacts = await navigator.contacts.select(props, opts);
            if (contacts && contacts.length > 0) {
                const item = contacts[0];
                const name = (item.name && item.name[0]) ? item.name[0].trim() : '';
                const email = (item.email && item.email[0]) ? item.email[0].trim() : '';
                if (name) {
                    const nameInput = document.getElementById('editContactName');
                    if (nameInput) nameInput.value = name;
                }
                if (email) {
                    const emailInput = document.getElementById('editContactEmail');
                    if (emailInput) emailInput.value = email;
                }
                return;
            }
        } catch (err) {
            console.warn('Native contact picker dismissed or error:', err);
            if (err.name === 'AbortError') return;
        }
    }

    // Fallback: trigger address book file picker
    const fileInput = document.getElementById('contactsFileInput');
    if (fileInput) {
        fileInput.click();
    }
}

// Handle .vcf / .csv file selection
function handleContactsFileSelected(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const text = e.target.result;
            const contacts = parseContactsFile(text, file.name);

            if (contacts && contacts.length > 0) {
                // If edit contact modal is open and 1 contact was selected, autofill it
                const editModal = document.getElementById('editContactModal');
                if (editModal && !editModal.classList.contains('hidden') && contacts.length === 1) {
                    if (contacts[0].name) document.getElementById('editContactName').value = contacts[0].name;
                    if (contacts[0].company) document.getElementById('editContactCompany').value = contacts[0].company;
                    if (contacts[0].email) document.getElementById('editContactEmail').value = contacts[0].email;
                }

                await saveBatchContactsAndNotify(contacts);
            } else {
                const t = I18N[dashboardMode];
                alert(t.contactsSyncFailed);
            }
        } catch (err) {
            console.error('Error importing contacts file:', err);
            alert('File import error: ' + err.message);
        } finally {
            event.target.value = '';
        }
    };
    reader.readAsText(file);
}

// Parse vCard (.vcf) or CSV text into contacts list
function parseContactsFile(text, filename = '') {
    if (!text || typeof text !== 'string') return [];
    const isVcf = filename.toLowerCase().endsWith('.vcf') || filename.toLowerCase().endsWith('.vcard') || text.includes('BEGIN:VCARD');
    if (isVcf) {
        return parseVCF(text);
    }
    return parseCSV(text);
}

function parseVCF(vcfText) {
    const contacts = [];
    const cards = vcfText.split(/BEGIN:VCARD/i).slice(1);

    for (const card of cards) {
        const fnMatch = card.match(/FN(?:;[^:]*)?:([^\r\n]+)/i);
        const orgMatch = card.match(/ORG(?:;[^:]*)?:([^\r\n]+)/i);
        const telMatches = card.matchAll(/TEL(?:;[^:]*)?:([^\r\n]+)/gi);
        const emailMatch = card.match(/EMAIL(?:;[^:]*)?:([^\r\n]+)/i);

        const name = fnMatch ? fnMatch[1].trim() : '';
        const company = orgMatch ? orgMatch[1].replace(/;/g, ' ').trim() : '';
        const email = emailMatch ? emailMatch[1].trim() : '';

        for (const tel of telMatches) {
            const rawPhone = tel[1].trim();
            if (rawPhone) {
                contacts.push({ name, company, email, phone: rawPhone });
                break; // primary phone
            }
        }
    }
    return contacts;
}

function parseCSV(csvText) {
    const lines = csvText.split(/\r?\n/).filter(l => l.trim().length > 0);
    if (lines.length < 2) return [];

    const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/['"]/g, ''));
    const nameIdx = headers.findIndex(h => h.includes('name') || h === 'full name' || h === 'contact');
    const firstIdx = headers.findIndex(h => h.includes('first'));
    const lastIdx = headers.findIndex(h => h.includes('last'));
    const phoneIdx = headers.findIndex(h => h.includes('phone') || h.includes('mobile') || h.includes('tel') || h.includes('cell'));
    const compIdx = headers.findIndex(h => h.includes('company') || h.includes('org'));
    const emailIdx = headers.findIndex(h => h.includes('email') || h.includes('e-mail'));

    if (phoneIdx === -1 && nameIdx === -1) return [];

    const contacts = [];
    for (let i = 1; i < lines.length; i++) {
        const row = lines[i].split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(v => v.trim().replace(/^["']|["']$/g, ''));
        const rawPhone = phoneIdx >= 0 ? row[phoneIdx] : '';
        if (!rawPhone) continue;

        let name = nameIdx >= 0 ? row[nameIdx] : '';
        if (!name && firstIdx >= 0) {
            name = `${row[firstIdx] || ''} ${lastIdx >= 0 ? row[lastIdx] || '' : ''}`.trim();
        }
        const company = compIdx >= 0 ? row[compIdx] : '';
        const email = emailIdx >= 0 ? row[emailIdx] : '';

        contacts.push({ name, phone: rawPhone, company, email });
    }
    return contacts;
}

async function saveBatchContactsAndNotify(contactsList) {
    const t = I18N[dashboardMode];
    let addedCount = 0;

    for (const c of contactsList) {
        if (!c.phone) continue;
        const norm = normalizeClientPhone(c.phone);
        if (!norm || norm.length < 5) continue;

        const existing = contactsMap[norm] || { phone: norm };
        contactsMap[norm] = {
            ...existing,
            phone: norm,
            name: c.name || existing.name || '',
            company: c.company || existing.company || '',
            email: c.email || existing.email || '',
            notes: c.notes || existing.notes || '',
            updatedAt: new Date().toISOString()
        };
        addedCount++;
    }

    saveContactsToLocalStorage();

    // Update active thread header if open and matching
    if (currentTicket) {
        const activeNorm = normalizeClientPhone(currentTicket.customer_phone);
        if (contactsMap[activeNorm]) {
            currentTicket.contact = contactsMap[activeNorm];
            updateHeaderWithContact(currentTicket.customer_phone, contactsMap[activeNorm]);
        }
    }

    // Refresh tickets sidebar
    refreshTickets(false);

    // Refresh directory modal if open
    const dirModal = document.getElementById('contactsModal');
    if (dirModal && !dirModal.classList.contains('hidden')) {
        renderContactsDirectory(document.getElementById('contactSearchInput')?.value || '');
    }

    // Send batch to backend
    try {
        await fetch('/api/contacts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ batch: contactsList })
        });
    } catch (err) {
        console.warn('Backend batch sync error:', err);
    }

    alert(t.contactsSyncedNotice(addedCount));
}

// Utility: escape HTML
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// --- Console Status Modal ---
function showConsoleStatusModal() {
    document.getElementById('consoleStatusModal')?.classList.remove('hidden');
}

function closeConsoleStatusModal() {
    document.getElementById('consoleStatusModal')?.classList.add('hidden');
}

// --- Stripe Billing Integration ---
function openBillingModal() {
    document.getElementById('billingModal')?.classList.remove('hidden');
}

function closeBillingModal() {
    document.getElementById('billingModal')?.classList.add('hidden');
}

async function triggerCheckout(plan) {
    const btn = event?.currentTarget;
    const orig = btn ? btn.textContent : '';
    if (btn) {
        btn.disabled = true;
        btn.textContent = dashboardMode === 'es' ? 'Conectando...' : 'Connecting...';
    }

    try {
        const res = await fetch('/api/checkout', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                plan: plan,
                successUrl: window.location.origin + '/dashboard.html?billing=success',
                cancelUrl: window.location.origin + '/dashboard.html?billing=canceled'
            })
        });

        const data = await res.json();
        if (data.url) {
            window.location.href = data.url;
        } else if (data.requiresKey) {
            alert(dashboardMode === 'es'
                ? 'Stripe Test Mode: Configure STRIPE_SECRET_KEY en las variables de entorno para procesar pagos.'
                : 'Stripe Test Mode: Configure STRIPE_SECRET_KEY in environment variables to process checkouts.');
        } else {
            alert(data.error || 'Failed to start Stripe checkout session.');
        }
    } catch (err) {
        alert('Checkout error: ' + err.message);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = orig;
        }
    }
}

async function openStripeCustomerPortal() {
    try {
        const res = await fetch('/api/customer-portal', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                returnUrl: window.location.origin + '/dashboard.html'
            })
        });

        const data = await res.json();
        if (data.url) {
            window.location.href = data.url;
        } else {
            alert(data.error || 'No active Stripe customer found. Subscribe to a plan first.');
        }
    } catch (err) {
        alert('Portal error: ' + err.message);
    }
}

// Check for Billing redirect notices & update tier
(function checkBillingStatus() {
    const params = new URLSearchParams(window.location.search);
    if (params.get('billing') === 'success') {
        localStorage.setItem('abrevia_tier', 'paid');
        alert(dashboardMode === 'es' 
            ? '✓ ¡Pago completado con éxito! Su cuenta de operaciones ha sido actualizada a Operaciones Pro con revisión previa.'
            : '✓ Payment completed successfully! Your operations workspace has been upgraded to Operations Pro with pre-send review.');
        window.history.replaceState({}, document.title, window.location.pathname);
    } else if (params.get('billing') === 'canceled') {
        window.history.replaceState({}, document.title, window.location.pathname);
    }

    // Update billing modal badge if on paid tier
    const billingPlanBadge = document.getElementById('billingModalPlan');
    const isPaid = localStorage.getItem('abrevia_tier') === 'paid' || localStorage.getItem('abrevia_tier') === 'pro' || localStorage.getItem('abrevia_tier') === 'premium';
    if (billingPlanBadge && isPaid) {
        billingPlanBadge.textContent = 'Operations Pro';
        billingPlanBadge.className = 'text-[10px] text-emerald-400 font-bold uppercase tracking-wider';
    }
})();

// Window resize handler: Keep sidebar and chat layout coherent across device rotations and window resizes
window.addEventListener('resize', () => {
    const sidebar = document.getElementById('conversationsSidebar');
    const workspace = document.getElementById('chatWorkspace');
    if (!sidebar || !workspace) return;
    if (window.innerWidth >= 768) {
        // Desktop (>= 768px): always display both sidebar and workspace side-by-side
        sidebar.classList.remove('hidden');
        sidebar.classList.add('flex');
        workspace.classList.remove('hidden');
        workspace.classList.add('flex');
    } else {
        // Mobile (< 768px): if a ticket is open, show workspace; otherwise show sidebar
        if (currentTicket) {
            sidebar.classList.add('hidden');
            sidebar.classList.remove('flex');
            workspace.classList.remove('hidden');
            workspace.classList.add('flex');
        } else {
            workspace.classList.add('hidden');
            workspace.classList.remove('flex');
            sidebar.classList.remove('hidden');
            sidebar.classList.add('flex');
        }
    }
});
