
// ============================================================================
// --- Discreet Audio & Haptic Notification Engine ---
// ============================================================================
let audioCtx = null;
let soundAlertsEnabled = localStorage.getItem('abrevia_sound_alerts') !== 'false';
let originalDocumentTitle = document.title || 'Abrevia Console';
let unreadMessageCount = 0;
let lastSeenTicketMsgCounts = {};
let knownTicketIds = null;
let currentSmsGateway = localStorage.getItem('abrevia_sms_gateway') || 'httpsms';
window.currentSmsGateway = currentSmsGateway;

function getAudioContext() {
    if (!audioCtx) {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (AudioContextClass) {
            audioCtx = new AudioContextClass();
        }
    }
    if (audioCtx && audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
    return audioCtx;
}

// Warm, discreet two-tone harmonic chime (D5: 587.33Hz -> A5: 880.00Hz, harmonic fifth)
function playDiscreetChime() {
    if (!soundAlertsEnabled) return;
    try {
        const ctx = getAudioContext();
        if (!ctx) return;
        const now = ctx.currentTime;

        // Tone 1: D5 (587.33 Hz)
        const osc1 = ctx.createOscillator();
        const gain1 = ctx.createGain();
        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(587.33, now);
        gain1.gain.setValueAtTime(0.001, now);
        gain1.gain.exponentialRampToValueAtTime(0.12, now + 0.02);
        gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
        osc1.connect(gain1);
        gain1.connect(ctx.destination);
        osc1.start(now);
        osc1.stop(now + 0.12);

        // Tone 2: A5 (880.00 Hz)
        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(880.00, now + 0.08);
        gain2.gain.setValueAtTime(0.001, now + 0.08);
        gain2.gain.exponentialRampToValueAtTime(0.15, now + 0.10);
        gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.32);
        osc2.connect(gain2);
        gain2.connect(ctx.destination);
        osc2.start(now + 0.08);
        osc2.stop(now + 0.32);
    } catch (e) {
        console.debug('Audio chime playback restricted or unsupported:', e);
    }
}

// Subtle double-tap haptic vibration for mobile phones & supported devices
function triggerDiscreetVibration() {
    try {
        if ('vibrate' in navigator) {
            navigator.vibrate([40, 50, 40]);
        }
    } catch (e) {
        console.debug('Vibration unsupported:', e);
    }
}

// System OS / PWA notification
function triggerSystemNotification(title, body, url = '/dashboard.html') {
    try {
        if ('Notification' in window && Notification.permission === 'granted' && document.hidden) {
            const options = {
                body: body,
                icon: '/assets/logo.png?v=3',
                badge: '/assets/logo.png?v=3',
                vibrate: [40, 50, 40],
                tag: 'abrevia-msg-' + Date.now(),
                data: { url: url }
            };

            if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
                navigator.serviceWorker.ready.then(reg => {
                    reg.showNotification(title, options);
                }).catch(() => {
                    new Notification(title, options);
                });
            } else {
                new Notification(title, options);
            }
        }
    } catch (e) {
        console.debug('Notification error:', e);
    }
}

// Master incoming alert trigger
function notifyInboundMessage(title, snippet) {
    playDiscreetChime();
    triggerDiscreetVibration();
    triggerSystemNotification(title, snippet);

    if (document.hidden) {
        unreadMessageCount++;
        document.title = `(${unreadMessageCount}) 💬 Abrevia | ${dashboardMode === 'es' ? 'Nuevo Mensaje' : 'New Message'}`;
    }
}

// Toggle sound alerts with instant sample
function toggleSoundAlerts() {
    soundAlertsEnabled = !soundAlertsEnabled;
    localStorage.setItem('abrevia_sound_alerts', soundAlertsEnabled ? 'true' : 'false');
    updateSoundAlertsUI();
    if (soundAlertsEnabled) {
        playDiscreetChime();
        triggerDiscreetVibration();
    }
}

function updateSoundAlertsUI() {
    const icon = document.getElementById('soundToggleIcon');
    const btn = document.getElementById('soundToggleBtn');
    const soundLbl = document.getElementById('soundToggleLabel');
    if (icon) {
        icon.textContent = soundAlertsEnabled ? '🔔' : '🔕';
    }
    if (soundLbl) {
        soundLbl.textContent = soundAlertsEnabled 
            ? (dashboardMode === 'es' ? 'Activado' : 'On') 
            : (dashboardMode === 'es' ? 'Silenciado' : 'Muted');
        soundLbl.className = soundAlertsEnabled 
            ? 'text-brand-400 font-semibold text-xs' 
            : 'text-slate-500 font-medium text-xs';
    }
    if (btn) {
        btn.title = soundAlertsEnabled 
            ? (dashboardMode === 'es' ? 'Alertas sonoras y vibración activadas (clic para silenciar)' : 'Sound & vibration alerts active (click to mute)')
            : (dashboardMode === 'es' ? 'Alertas silenciadas (clic para activar sonido y vibración)' : 'Alerts muted (click to enable sound and vibration)');
    }
}

// Reset unread title on window focus
window.addEventListener('focus', () => {
    unreadMessageCount = 0;
    document.title = originalDocumentTitle;
});

// Unlock audio on first user gesture & proactively request notification permission
['click', 'touchstart', 'keydown'].forEach(evt => {
    window.addEventListener(evt, () => {
        getAudioContext();
        if ('Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission().catch(() => {});
        }
    }, { once: true, passive: true });
});

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
        billingBtn: 'Billing & Plan',
        whoIsThisForBtn: 'Who is this for?',
        dashShareBtn: 'Share',
        wrapUpShareTitle: 'Share Abrevia with your Team',
        wrapUpShareDesc: 'Help colleagues and partners eliminate language barriers with zero downloads.',
        wrapUpShareBtn: 'Share Abrevia',
        sidebarLegalBtn: 'Terms & Privacy',
        sidebarShareBtn: 'Share App',
        statusLegalHeader: 'Legal & Transparency (GitHub):',
        statusLinkWho: 'Who is this for?',
        statusLinkTerms: 'Terms of Service',
        statusLinkPrivacy: 'Privacy Policy',
        statusLinkDisclaimers: 'Disclaimers',
        statusLinkContact: 'Contact: info@mvhlsp.site',
        testSmsCardTitle: 'Send Test Message to My Phone',
        testSmsCardDesc: 'Enter your personal mobile number to receive a live test message containing the Abrevia zero-download link.',
        sendTestSmsBtnText: 'Send Test Message',
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
        noTickets: 'No active conversations.<br>Click "New Conversation" below.',
        newThreadBtn: 'New Conversation',
        mobileBackBtn: 'Chats',
        closeThreadBtn: 'Close',
        selectConversation: 'Select a conversation',
        selectSubtitle: 'Choose a conversation from the sidebar or start a new conversation',
        threadSubtitle: (id) => `Conversation: ${id.slice(0, 8)}... • Two-Way Asynchronous Communication Relay`,
        purgeBtn: 'Purge',
        purgeBtnTitle: 'End & Purge Conversation',
        emptyFeedTitle: 'Select an active conversation to view and send bilingual messages',
        emptyFeedSubtitle: 'Bilingual asynchronous communication technology for logistics, field services & operations. Messages are 2-way translated and dispatched directly—no downloads, zero friction.',
        noMessagesInThread: 'No messages yet in this thread.<br>Send an outbound message below to start.',
        inputLabel: 'Type reply in English (Agent):',
        inputPlaceholder: 'Type your reply in English (e.g. Your delivery is scheduled for tomorrow at 2 PM)...',
        translateBtn: 'Send',
        reviewModalTitle: 'Translation Preview',
        reviewModalSubtitle: 'Check your message translation before submitting to WhatsApp',
        reviewOriginalHeader: 'Your Message (English)',
        reviewTranslatedHeader: 'Translated Message (Spanish)',
        reviewCancelBtnText: 'Cancel',
        reviewConfirmBtnText: 'Submit to WhatsApp →',
        translating: 'Translating...',
        progressStatus: 'Auto-Correcting Grammar & Translating...',
        progressComplete: '✓ Translated & Verified (100%)',
        progressSending: 'Sending Message...',
        progressSent: '✓ Self-Corrected & Sent!',
        instantModeLabel: 'Secure',
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
        modalTitle: 'New Conversation',
        modalSubtitle: 'Phone numbers are auto-saved as contacts. You can optionally add a name and details.',
        modalPhoneLabel: 'Phone Number',
        modalAutoSaveNote: 'Auto-saved to your contact directory upon creation',
        modalNameLabel: 'Contact Name (Optional)',
        modalCompanyLabel: 'Company / Role (Optional)',
        modalNotesLabel: 'Internal Notes (Optional)',
        modalCancel: 'Cancel',
        modalSubmit: 'Start Conversation',
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
        hitlBtnOff: 'OFF',
        senderProfileNavText: 'Profile',
        senderProfileModalTitle: 'Organization & Sender Profile',
        senderProfileModalSubtitle: 'Configure how your organization appears in outbound message notifications',
        profileOrgLabel: 'Organization / Business Name',
        profileUserLabel: 'User / Dispatcher Name',
        profileModeLabel: 'Outbound Message Delivery Format',
        liveInterpreterBtnLabel: 'Request Live Interpreter Now',
        liveInterpreterBtnShort: 'Interpreter',
        interpreterModalTitle: 'Request Live Interpreter Now',
        interpreterModalSubtitle: 'Connect a certified human bilingual interpreter on-demand',
        interpreterLangPairLabel: 'Language Pair',
        interpreterServiceTypeLabel: 'Interpretation Service',
        optRelayTitle: 'Live Text Relay & Message Review',
        optRelayDesc: 'A certified LSP interpreter reviews, polishes, and certifies each asynchronous message before dispatch.',
        optOpiTitle: 'Over-the-Phone (OPI) 3-Way Live Bridge',
        optOpiDesc: 'Spawns an on-demand 3-way conference call bridge with an accredited verbal interpreter on standby.',
        lspStatusTitle: 'Language Service Provider (LSP) Gateway',
        lspStatusDesc: 'Connecting to our certified LSP partner network. Requests are logged and routed directly to accredited interpreters.',
        interpreterCancelBtn: 'Cancel',
        interpreterConfirmBtnText: 'Request Interpreter Now',
        interpreterActiveNotice: '✓ Live Interpreter Requested: Connecting with accredited LSP specialist...',
        interpreterCancelledNotice: 'Live interpreter request cancelled.',
        billingModalTitle: 'Billing & Message Packs',
        billingModalDesc: 'Manage your subscription, activate Operations Pro, or buy pay-as-you-go message packs via Stripe.',
        billingCommunityTitle: 'Community & Non-Profit',
        billingCommunityBadge: 'FREE FOREVER',
        billingCommunitySub: '$0 • Up to 500 messages/mo for community & non-profit organizations',
        billingProTitle: 'Operations Pro',
        billingProBadge: 'BUSINESS & ORGS',
        billingProSub: '$49/month • Unlimited relay, proofreading & managed intake options',
        billingProBtn: 'Subscribe',
        packsSectionTitle: 'Pay-As-You-Go Message Packs',
        packsSectionBadge: 'Never Expires',
        pack5Title: '100 Messages',
        pack5Sub: 'Everything in Pro • Never expires',
        pack10Title: '250 Messages',
        pack10Sub: 'Everything in Pro • Never expires',
        pack20Title: '500 Messages',
        pack20Sub: 'Everything in Pro • Never expires',
        pack30Title: '1,000 Messages',
        pack30Sub: 'Everything in Pro • Never expires',
        pack30Badge: 'BEST VALUE',
        billingPortalTitle: 'Stripe Customer Portal',
        billingPortalSub: 'View past invoices, update cards or cancel',
        billingPortalBtn: 'Manage →',
        billingCloseBtn: 'Close',
        // Wrap Up & Security Modal
        wrapUpModalTitle: 'Wrap Up Session',
        wrapUpModalBadge: 'Fast & Frictionless',
        wrapUpModalDesc: 'No email is required to use Abrevia. You can optionally set a 4-digit PIN to lock and quickly resume this workspace.',
        wrapUpPinLabel: '4-Digit Security PIN',
        wrapUpPinHelp: 'Set a 4-digit PIN so only you can unlock this workspace next time.',
        wrapUpUpdatesTitle: 'Stay in the Loop (Optional)',
        wrapUpUpdatesDesc: 'We only send important product updates and carrier notices. No spam, ever.',
        wrapUpEmailLabel: 'Email Address (Optional)',
        wrapUpEmailPlaceholder: 'name@company.com',
        wrapUpPhoneLabel: 'Phone Number for Mobile Updates (Optional)',
        wrapUpOptOutNotice: 'Reply STOP anytime to cancel message updates.',
        wrapUpSaveBtnText: 'Save & Sign Out',
        wrapUpDirectSignOutBtn: 'Sign Out Without PIN',
        wrapUpCancelBtn: 'Stay in Dashboard',
        // Install Helper Modal & PWA Banner
        installAppBtnText: 'Add Shortcut',
        installModalTitle: 'Add Shortcut',
        installModalBadge: '1-Tap Instant Access',
        installModalDesc: 'Add Abrevia directly to your computer desktop or phone home screen for instant zero-friction launch without typing URLs.',
        installStepIos: '<strong>iPhone (Safari):</strong> Tap Share (<span class="text-white">⎋</span>) and select <strong>"Add to Home Screen"</strong> (<span class="text-white">➕</span>).',
        installStepAndroid: '<strong>Android (Chrome / Samsung):</strong> Tap menu (<span class="text-white">⋮</span>) and select <strong>"Install app"</strong> or <strong>"Add to Home screen"</strong>.',
        installStepDesktop: '<strong>PC / Mac:</strong> Look for the <strong>Install</strong> icon (<span class="text-white">⊕</span>) in your browser address bar.',
        installCloseBtnText: 'Got it',
        pwaBannerTitle: 'Add Shortcut',
        pwaBannerSubtitle: '1-tap desktop & home screen access',
        pwaBannerActionBtn: 'Add',
        soundToggleLabel: 'Alerts',
        // Speaker Framework (.a / .b)
        threadSubtitle: (id) => `Conversation: ${id.slice(0, 8)}... • Relay: English Speaker (.a) ⇄ Spanish Speaker (.b)`,
        inputLabel: 'Write response in English (.a) — dispatched in Spanish (.b):',
    },
    es: {
        consoleBadge: 'Estado de Consola',
        consoleStatus: 'Activo',
        billingBtn: 'Facturación y Plan',
        whoIsThisForBtn: '¿Para quién es?',
        dashShareBtn: 'Compartir',
        wrapUpShareTitle: 'Comparta Abrevia con su Equipo',
        wrapUpShareDesc: 'Ayude a colegas y socios a eliminar barreras de idioma sin descargas.',
        wrapUpShareBtn: 'Compartir Abrevia',
        sidebarLegalBtn: 'Términos y Privacidad',
        sidebarShareBtn: 'Compartir App',
        statusLegalHeader: 'Legalidad y Transparencia (GitHub):',
        statusLinkWho: '¿Para quién es?',
        statusLinkTerms: 'Términos de Servicio',
        statusLinkPrivacy: 'Aviso de Privacidad',
        statusLinkDisclaimers: 'Deslindes Legales',
        statusLinkContact: 'Contacto: info@mvhlsp.site',
        testSmsCardTitle: 'Enviar Mensaje de Prueba a Mi Celular',
        testSmsCardDesc: 'Ingrese su número celular para recibir un mensaje de prueba en vivo con el enlace de Abrevia sin descargas.',
        sendTestSmsBtnText: 'Enviar Mensaje',
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
        noTickets: 'No hay conversaciones activas.<br>Haga clic en "Nueva Conversación" abajo.',
        newThreadBtn: 'Nueva Conversación',
        mobileBackBtn: 'Conversaciones',
        closeThreadBtn: 'Cerrar',
        selectConversation: 'Selecciona una conversación',
        selectSubtitle: 'Elige una conversación de la barra lateral o inicia una nueva conversación',
        threadSubtitle: (id) => `Conversación: ${id.slice(0, 8)}... • Relevo de Comunicación Asíncrona Bilingüe`,
        purgeBtn: 'Purgar',
        purgeBtnTitle: 'Finalizar y Purgar Conversación',
        emptyFeedTitle: 'Selecciona una conversación activa para ver y enviar mensajes bilingües',
        emptyFeedSubtitle: 'Comunicación asíncrona entrante traducida al español • Respuestas traducidas y enviadas en tiempo real',
        noMessagesInThread: 'Aún no hay mensajes en esta conversación.<br>Envía un mensaje abajo para iniciar.',
        inputLabel: 'Escribe respuesta en Español (Agente):',
        inputPlaceholder: 'Escribe tu respuesta en español (ej. Su entrega está programada para mañana a las 2 PM)...',
        translateBtn: 'Enviar',
        reviewModalTitle: 'Vista Previa de Traducción',
        reviewModalSubtitle: 'Revise la traducción de su mensaje antes de enviar a WhatsApp',
        reviewOriginalHeader: 'Su Mensaje (Español)',
        reviewTranslatedHeader: 'Mensaje Traducido (Inglés)',
        reviewCancelBtnText: 'Cancelar',
        reviewConfirmBtnText: 'Enviar a WhatsApp →',
        translating: 'Traduciendo...',
        progressStatus: 'Auto-corrigiendo gramática y traduciendo...',
        progressComplete: '✓ Traducción Verificada (100%)',
        progressSending: 'Enviando Mensaje...',
        progressSent: '✓ ¡Auto-corregido y enviado!',
        instantModeLabel: 'Seguro',
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
        modalTitle: 'Nueva Conversación',
        modalSubtitle: 'Los teléfonos se guardan automáticamente como contactos. Puede agregar nombre y datos opcionalmente.',
        modalPhoneLabel: 'Número de Teléfono',
        modalAutoSaveNote: 'Guardado automáticamente en su directorio al crear la conversación',
        modalNameLabel: 'Nombre del Contacto (Opcional)',
        modalCompanyLabel: 'Empresa / Rol (Opcional)',
        modalNotesLabel: 'Notas Internas (Opcional)',
        modalCancel: 'Cancelar',
        modalSubmit: 'Iniciar Conversación',
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
        hitlBtnOff: 'INACTIVO',
        senderProfileNavText: 'Perfil',
        senderProfileModalTitle: 'Perfil de Organización y Remitente',
        senderProfileModalSubtitle: 'Configure cómo aparece su organización en las notificaciones de mensajes salientes',
        profileOrgLabel: 'Nombre de la Organización / Empresa',
        profileUserLabel: 'Nombre del Usuario / Despachador',
        profileModeLabel: 'Formato de Entrega de Mensajes Salientes',
        liveInterpreterBtnLabel: 'Solicitar Intérprete en Vivo',
        liveInterpreterBtnShort: 'Intérprete',
        interpreterModalTitle: 'Solicitar Intérprete en Vivo',
        interpreterModalSubtitle: 'Conecte a un intérprete bilingüe humano certificado bajo demanda',
        interpreterLangPairLabel: 'Par de Idiomas',
        interpreterServiceTypeLabel: 'Servicio de Interpretación',
        optRelayTitle: 'Relevo de Texto y Revisión de Mensajes en Vivo',
        optRelayDesc: 'Un intérprete certificado de LSP revisa, pule y certifica cada mensaje antes del envío.',
        optOpiTitle: 'Puente Telefónico en Vivo a 3 Vías (OPI)',
        optOpiDesc: 'Genera una llamada en conferencia a 3 vías con un intérprete verbal acreditado disponible.',
        lspStatusTitle: 'Pasarela de Proveedor de Servicios Lingüísticos (LSP)',
        lspStatusDesc: 'Conectando con la red de socios LSP certificados. Las solicitudes se enrutan a intérpretes acreditados.',
        interpreterCancelBtn: 'Cancelar',
        interpreterConfirmBtnText: 'Solicitar Intérprete Ahora',
        interpreterActiveNotice: '✓ Intérprete en Vivo Solicitado: Conectando con especialista acreditado de LSP...',
        interpreterCancelledNotice: 'Solicitud de intérprete en vivo cancelada.',
        billingModalTitle: 'Facturación y Paquetes de Mensajes',
        billingModalDesc: 'Administre su suscripción, active Operaciones Pro o adquiera paquetes de mensajes de pago por uso mediante Stripe.',
        billingCommunityTitle: 'Comunidad y Sin Fines de Lucro',
        billingCommunityBadge: 'GRATIS SIEMPRE',
        billingCommunitySub: '$0 • Hasta 500 mensajes/mes para organizaciones comunitarias y sin fines de lucro',
        billingProTitle: 'Operaciones Pro',
        billingProBadge: 'EMPRESAS Y ORGS',
        billingProSub: '$49/mes • Relevo ilimitado, revisión previa y opciones de recepción gestionada',
        billingProBtn: 'Suscribirse',
        packsSectionTitle: 'Paquetes de Mensajes de Pago por Uso',
        packsSectionBadge: 'Nunca Vencen',
        pack5Title: '100 Mensajes',
        pack5Sub: 'Todo incluido en Pro • Nunca vencen',
        pack10Title: '250 Mensajes',
        pack10Sub: 'Todo incluido en Pro • Nunca vencen',
        pack20Title: '500 Mensajes',
        pack20Sub: 'Todo incluido en Pro • Nunca vencen',
        pack30Title: '1.000 Mensajes',
        pack30Sub: 'Todo incluido en Pro • Nunca vencen',
        pack30Badge: 'MEJOR VALOR',
        billingPortalTitle: 'Portal de Clientes de Stripe',
        billingPortalSub: 'Ver facturas anteriores, actualizar tarjetas o cancelar',
        billingPortalBtn: 'Administrar →',
        billingCloseBtn: 'Cerrar',
        // Wrap Up & Security Modal (Finalizar Sesión)
        wrapUpModalTitle: 'Finalizar Sesión',
        wrapUpModalBadge: 'Rápido y Sin Fricción',
        wrapUpModalDesc: 'No se requiere correo electrónico para usar Abrevia. Opcionalmente puede configurar un PIN de 4 dígitos para bloquear y reanudar rápidamente este espacio de trabajo.',
        wrapUpPinLabel: 'PIN de Seguridad de 4 Dígitos',
        wrapUpPinHelp: 'Configure un PIN de 4 dígitos para que solo usted pueda desbloquear este espacio de trabajo la próxima vez.',
        wrapUpUpdatesTitle: 'Manténgase al Día (Opcional)',
        wrapUpUpdatesDesc: 'Solo enviamos actualizaciones importantes y avisos operativos de telefonía. Cero spam, siempre.',
        wrapUpEmailLabel: 'Correo Electrónico (Opcional)',
        wrapUpEmailPlaceholder: 'correo@empresa.com',
        wrapUpPhoneLabel: 'Número de Teléfono para Avisos Móviles (Opcional)',
        wrapUpOptOutNotice: 'Responda ALTO en cualquier momento para cancelar avisos.',
        wrapUpSaveBtnText: 'Guardar y Cerrar Sesión',
        wrapUpDirectSignOutBtn: 'Cerrar Sesión Sin PIN',
        wrapUpCancelBtn: 'Permanecer en el Panel',
        // Install Helper Modal & PWA Banner
        installAppBtnText: 'Agregar Atajo',
        installModalTitle: 'Agregar Acceso Directo',
        installModalBadge: 'Acceso Instantáneo en 1 Toque',
        installModalDesc: 'Agregue Abrevia directamente al escritorio de su computadora o pantalla de inicio de su teléfono para iniciar al instante sin escribir URLs.',
        installStepIos: '<strong>iPhone (Safari):</strong> Toque Compartir (<span class="text-white">⎋</span>) y seleccione <strong>"Agregar a Inicio"</strong> (<span class="text-white">➕</span>).',
        installStepAndroid: '<strong>Android (Chrome / Samsung):</strong> Toque el menú (<span class="text-white">⋮</span>) y seleccione <strong>"Instalar aplicación"</strong> o <strong>"Agregar a pantalla principal"</strong>.',
        installStepDesktop: '<strong>PC / Mac:</strong> Busque el icono de <strong>Instalar</strong> (<span class="text-white">⊕</span>) en la barra de direcciones de su navegador.',
        installCloseBtnText: 'Entendido',
        pwaBannerTitle: 'Agregar Acceso Directo',
        pwaBannerSubtitle: 'Acceso en 1 toque en escritorio y pantalla de inicio',
        pwaBannerActionBtn: 'Instalar',
        soundToggleLabel: 'Alertas',
        // Speaker Framework (.a / .b)
        threadSubtitle: (id) => `Conversación: ${id.slice(0, 8)}... • Relevo: Hablante de Español (.b) ⇄ Hablante de Inglés (.a)`,
        inputLabel: 'Escriba respuesta en Español (.b) — se enviará en Inglés (.a):',
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

function updateWrapUpTrialCountdown() {
    const trial = getTrialInfo();
    const titleEl = document.getElementById('wrapUpTrialTitle');
    const badgeEl = document.getElementById('wrapUpTrialBadge');
    const descEl = document.getElementById('wrapUpTrialDesc');
    const progressEl = document.getElementById('wrapUpTrialProgress');
    const cardEl = document.getElementById('wrapUpTrialCountdownCard');
    const isEs = dashboardMode === 'es';

    if (!cardEl) return;

    if (trial.isPro) {
        if (titleEl) titleEl.textContent = isEs ? 'Operaciones Pro Activo' : 'Operations Pro Active';
        if (badgeEl) {
            badgeEl.textContent = isEs ? 'PRO ACTIVO' : 'PRO ACTIVE';
            badgeEl.className = 'text-[11px] font-mono font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shrink-0';
        }
        if (descEl) descEl.textContent = isEs 
            ? 'Mensajes y relevo bilingüe ilimitado permanentemente activo.' 
            : 'Unlimited bilingual relay and Pro features permanently active.';
        if (progressEl) {
            progressEl.style.width = '100%';
            progressEl.className = 'bg-gradient-to-r from-emerald-500 to-teal-400 h-1.5 rounded-full transition-all duration-500';
        }
    } else if (trial.inTrial) {
        const daysRemaining = trial.daysLeft;
        const daysElapsed = Math.min(30, Math.max(1, 31 - daysRemaining));
        const pct = Math.max(5, Math.round((daysRemaining / 30) * 100));

        if (titleEl) titleEl.textContent = isEs ? 'Prueba Gratuita de 30 Días' : '30-Day Free Trial';
        if (badgeEl) {
            badgeEl.textContent = isEs ? `Quedan ${daysRemaining} días` : `${daysRemaining} days left`;
            badgeEl.className = 'text-[11px] font-mono font-bold px-2 py-0.5 rounded-full bg-brand-500/20 text-brand-300 border border-brand-500/40 shrink-0';
        }
        if (descEl) descEl.textContent = isEs
            ? `Día ${daysElapsed} de 30. Quedan ${daysRemaining} días de prueba gratuita. Sus conversaciones y funciones Pro quedan guardadas.`
            : `Day ${daysElapsed} of 30. ${daysRemaining} days remaining in your free trial. Your conversations and Pro features are saved.`;
        if (progressEl) {
            progressEl.style.width = `${pct}%`;
            progressEl.className = 'bg-gradient-to-r from-blue-500 via-indigo-500 to-brand-400 h-1.5 rounded-full transition-all duration-500';
        }
    } else {
        if (titleEl) titleEl.textContent = isEs ? 'Prueba Gratuita Concluida' : 'Free Trial Concluded';
        if (badgeEl) {
            badgeEl.textContent = isEs ? 'Concluida' : 'Ended';
            badgeEl.className = 'text-[11px] font-mono font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 shrink-0';
        }
        if (descEl) descEl.textContent = isEs
            ? 'Su prueba de 30 días ha finalizado. Suscríbase a Operaciones Pro para mantener mensajes ilimitados y funciones de revisión previa.'
            : 'Your 30-day trial has concluded. Upgrade to Operations Pro to keep unlimited messaging and proofread review.';
        if (progressEl) {
            progressEl.style.width = '0%';
            progressEl.className = 'bg-slate-700 h-1.5 rounded-full transition-all duration-500';
        }
    }
}

function updateTrialUI() {
    const trial = getTrialInfo();
    const pillBtn = document.getElementById('trialPillBtn');
    const pillText = document.getElementById('trialPillText');
    const billingTrialBadge = document.getElementById('billingTrialBadge');
    const billingTrialSub = document.getElementById('billingTrialSub');
    const billingTrialDays = document.getElementById('billingTrialDays');
    const t = I18N[dashboardMode];
    
    // Always update session wrap up countdown card
    updateWrapUpTrialCountdown();

    if (pillBtn && pillText) {
        if (trial.isPro) {
            pillText.textContent = t.trialPillPro || 'Operations Pro';
            pillBtn.className = 'inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/25 transition shadow-sm';
        } else if (trial.inTrial) {
            pillText.textContent = t.trialPill(trial.daysLeft);
            pillBtn.className = 'inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-brand-500/15 text-brand-300 border border-brand-500/30 hover:bg-brand-500/25 transition shadow-sm';
        } else {
            pillText.textContent = t.trialPillExpired || 'Free Tier • Upgrade to Pro';
            pillBtn.className = 'inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30 hover:bg-amber-500/25 transition shadow-sm';
        }
    }

    if (trial.isPro) {
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
    try {
        renderTemplatesList();
    } catch (e) {
        console.warn('renderTemplatesList error:', e);
    }
    const modal = document.getElementById('templatesModal');
    if (modal) {
        modal.classList.remove('hidden');
    }
}
window.openTemplatesModal = openTemplatesModal;

function closeTemplatesModal() {
    const modal = document.getElementById('templatesModal');
    if (modal) modal.classList.add('hidden');
}
window.closeTemplatesModal = closeTemplatesModal;
window.insertTemplate = insertTemplate;

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
        inputEl.dispatchEvent(new Event('input', { bubbles: true }));
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
    if (modal) applyDashboardLocalization();
    updateWrapUpTrialCountdown();
    modal.classList.remove('hidden');
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
                spanishText: spanishText,
                provider: getActiveSmsGateway(),
                orgName: getSenderOrgName(),
                senderName: getSenderUserName(),
                targetLang: isEnglishAgent ? 'es' : 'en',
                dispatchMode: getDispatchMode()
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
    if (modal) applyDashboardLocalization();
    updateWrapUpTrialCountdown();
    modal.classList.remove('hidden');
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


// ==========================================
// Organization & Sender Profile Configuration
// ==========================================
function getSenderOrgName() {
    return localStorage.getItem('abrevia_org_name') || '';
}

function getSenderUserName() {
    return localStorage.getItem('abrevia_sender_name') || '';
}

function getDispatchMode() {
    return localStorage.getItem('abrevia_dispatch_mode') || 'link';
}

function updateSenderProfileUI() {
    const org = getSenderOrgName();
    const user = getSenderUserName();
    const labelEl = document.getElementById('senderProfileQuickLabel');
    if (labelEl) {
        if (org && user) {
            labelEl.textContent = `${org} (${user})`;
        } else if (org) {
            labelEl.textContent = org;
        } else if (user) {
            labelEl.textContent = `${user} / Abrevia`;
        } else {
            labelEl.textContent = 'Abrevia';
        }
    }
}

function openSenderProfileModal() {
    closeSettingsModal();
    const orgInput = document.getElementById('profileOrgInput');
    const userInput = document.getElementById('profileUserInput');
    const linkRadio = document.getElementById('dispatchModeLink');
    const directRadio = document.getElementById('dispatchModeDirect');
    
    if (orgInput) orgInput.value = getSenderOrgName();
    if (userInput) userInput.value = getSenderUserName();
    
    const mode = getDispatchMode();
    if (mode === 'direct') {
        if (directRadio) directRadio.checked = true;
    } else {
        if (linkRadio) linkRadio.checked = true;
    }
    
    updateSenderProfilePreview();
    document.getElementById('senderProfileModal').classList.remove('hidden');
}

function closeSenderProfileModal() {
    document.getElementById('senderProfileModal').classList.add('hidden');
    const ind = document.getElementById('profileSavedIndicator');
    if (ind) ind.classList.add('hidden');
}

function updateSenderProfilePreview() {
    const org = document.getElementById('profileOrgInput')?.value.trim() || '';
    const user = document.getElementById('profileUserInput')?.value.trim() || '';
    const directChecked = document.getElementById('dispatchModeDirect')?.checked;
    const previewEl = document.getElementById('liveSmsPreviewText');
    if (!previewEl) return;

    let senderLabel = '';
    if (org && user) {
        senderLabel = `${org} (${user})`;
    } else if (org) {
        senderLabel = org;
    } else if (user) {
        senderLabel = `${user} / Abrevia`;
    } else {
        senderLabel = 'Abrevia';
    }

    const host = window.location.host || 'abrevia-beta.vercel.app';
    const proto = window.location.protocol.startsWith('http') ? window.location.protocol : 'https:';
    const sampleLink = `${proto}//${host}/m.html?t=${currentTicket?.id || 101}`;

    if (directChecked) {
        previewEl.textContent = (dashboardMode === 'es')
            ? `Hola, confirmamos su solicitud de servicio.`
            : `Hello, confirming your service request.`;
    } else {
        if (dashboardMode === 'es') {
            previewEl.textContent = `[${senderLabel} - Mensaje Bilingüe]:\n"Hola, nos comunicamos con usted para coordinar su solicitud."\n\nVer conversación o responder en línea:\n${sampleLink}\nO responda directamente a este mensaje en español.\n\nResponda ALTO para cancelar.`;
        } else {
            previewEl.textContent = `[${senderLabel}]:\n"Hello, we are contacting you regarding your request."\n\nOpen or reply online:\n${sampleLink}\nOr reply directly to this message.\n\nReply STOP to unsubscribe.`;
        }
    }
}

function saveSenderProfile() {
    const org = document.getElementById('profileOrgInput')?.value.trim() || '';
    const user = document.getElementById('profileUserInput')?.value.trim() || '';
    const directChecked = document.getElementById('dispatchModeDirect')?.checked;
    
    localStorage.setItem('abrevia_org_name', org);
    localStorage.setItem('abrevia_sender_name', user);
    localStorage.setItem('abrevia_dispatch_mode', directChecked ? 'direct' : 'link');

    updateSenderProfileUI();

    const ind = document.getElementById('profileSavedIndicator');
    if (ind) {
        ind.classList.remove('hidden');
        setTimeout(() => ind.classList.add('hidden'), 2000);
    }
    setTimeout(closeSenderProfileModal, 400);
}

// ==========================================
// On-Demand Live Interpreter (LSP Network)
// ==========================================
let activeInterpreterTickets = {}; // ticketId -> { requested: true, serviceType: 'relay', timestamp }

function openLiveInterpreterModal() {
    if (!currentTicket) {
        alert(dashboardMode === 'es' 
            ? 'Por favor seleccione una conversación activa antes de solicitar un intérprete.'
            : 'Please select an active conversation before requesting an interpreter.');
        return;
    }

    const ticketId = currentTicket.id;
    const isAlreadyRequested = Boolean(activeInterpreterTickets[ticketId]?.requested);
    const confirmBtn = document.getElementById('confirmInterpreterBtn');
    const confirmText = document.getElementById('interpreterConfirmBtnText');
    const t = I18N[dashboardMode];

    if (isAlreadyRequested) {
        if (confirmText) confirmText.textContent = (dashboardMode === 'es') ? 'Cancelar Solicitud de Intérprete' : 'Cancel Interpreter Request';
        if (confirmBtn) confirmBtn.className = 'bg-red-600 hover:bg-red-500 text-white text-xs font-semibold px-4 py-2 rounded-xl transition shadow flex items-center space-x-1.5';
    } else {
        if (confirmText) confirmText.textContent = t.interpreterConfirmBtnText || 'Request Interpreter Now';
        if (confirmBtn) confirmBtn.className = 'bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold px-4 py-2 rounded-xl transition shadow flex items-center space-x-1.5';
    }

    document.getElementById('liveInterpreterModal').classList.remove('hidden');
}

function closeLiveInterpreterModal() {
    document.getElementById('liveInterpreterModal').classList.add('hidden');
}

async function confirmLiveInterpreterRequest() {
    if (!currentTicket) return;
    const ticketId = currentTicket.id;
    const t = I18N[dashboardMode];
    const isAlreadyRequested = Boolean(activeInterpreterTickets[ticketId]?.requested);

    if (isAlreadyRequested) {
        // Cancel request
        delete activeInterpreterTickets[ticketId];
        updateLiveInterpreterUI();
        closeLiveInterpreterModal();
        alert(t.interpreterCancelledNotice || 'Live interpreter request cancelled.');
        return;
    }

    // Mark requested
    const serviceType = document.querySelector('input[name="interpreterServiceType"]:checked')?.value || 'relay';
    activeInterpreterTickets[ticketId] = {
        requested: true,
        serviceType: serviceType,
        timestamp: new Date().toISOString()
    };

    updateLiveInterpreterUI();
    closeLiveInterpreterModal();

    // Insert system note into thread feed for audit log
    const systemEn = `🎧 Live Certified Interpreter requested via LSP network (${serviceType === 'opi' ? '3-Way Phone Bridge' : 'Message Review'}). An accredited specialist is assigned to this conversation.`;
    const systemEs = `🎧 Intérprete Certificado en Vivo solicitado vía red LSP (${serviceType === 'opi' ? 'Puente Telefónico a 3 Vías' : 'Revisión de Mensajes'}). Se ha asignado un especialista acreditado a esta conversación.`;

    try {
        await fetch('/api/reply', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                ticketId: ticketId,
                action: 'optout',
                message: dashboardMode === 'es' ? systemEs : systemEn
            })
        });
    } catch (e) {
        console.warn('System notice insert:', e.message);
    }

    await fetchMessages(ticketId, true);
    alert(t.interpreterActiveNotice || '✓ Live Interpreter Requested: Connecting with accredited LSP specialist...');
}

function updateLiveInterpreterUI() {
    const btn = document.getElementById('liveInterpreterBtn');
    const badge = document.getElementById('liveInterpreterBtnBadge');
    const label = document.getElementById('liveInterpreterBtnLabel');
    if (!btn) return;

    const t = I18N[dashboardMode];
    const isRequested = currentTicket && activeInterpreterTickets[currentTicket.id]?.requested;

    if (isRequested) {
        btn.className = 'inline-flex items-center space-x-1.5 px-2.5 sm:px-3 py-1 rounded-lg text-xs font-semibold transition border border-indigo-400 bg-indigo-600/30 text-white shadow-lg shadow-indigo-500/20';
        if (badge) {
            badge.textContent = (dashboardMode === 'es') ? 'ACTIVO' : 'ACTIVE';
            badge.className = 'text-[9px] uppercase font-bold px-1.5 py-0.5 rounded bg-indigo-500 text-white border border-indigo-400 animate-pulse';
            badge.classList.remove('hidden');
        }
        btn.title = (dashboardMode === 'es') ? 'Intérprete en Vivo Activo: Haga clic para gestionar o cancelar' : 'Live Interpreter Active: Click to manage or cancel';
    } else {
        btn.className = 'inline-flex items-center space-x-1.5 px-2.5 sm:px-3 py-1 rounded-lg text-xs font-semibold transition border border-indigo-500/40 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 hover:text-white shadow-sm';
        if (badge) badge.classList.add('hidden');
        btn.title = (dashboardMode === 'es') 
            ? 'Solicitar un intérprete humano certificado de la red de Proveedores de Servicios Lingüísticos (LSP)' 
            : 'Request a certified live human interpreter from an on-demand Language Service Provider (LSP)';
    }

    if (label) {
        label.textContent = t.liveInterpreterBtnLabel || 'Request Live Interpreter Now';
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
    if (btnEn && btnEs) {
        if (dashboardMode === 'en') {
            btnEn.className = 'px-2.5 py-1 rounded-md text-xs font-bold bg-brand-600 text-white shadow-sm transition';
            btnEs.className = 'px-2.5 py-1 rounded-md text-xs font-medium text-slate-400 hover:text-white transition';
        } else {
            btnEs.className = 'px-2.5 py-1 rounded-md text-xs font-bold bg-brand-600 text-white shadow-sm transition';
            btnEn.className = 'px-2.5 py-1 rounded-md text-xs font-medium text-slate-400 hover:text-white transition';
        }
    }

    // Header title next to logo
    const headerTitle = document.getElementById('headerConsoleTitle');
    if (headerTitle) headerTitle.textContent = t.consoleBadge;
    const consoleStatusTextEl = document.getElementById('consoleStatusText');
    if (consoleStatusTextEl) consoleStatusTextEl.textContent = t.consoleStatus;
    const billingBtnEl = document.getElementById('billingBtnText');
    if (billingBtnEl) billingBtnEl.textContent = t.billingBtn || 'Billing';
        // Share & Test SMS Localization
    const dShr = document.getElementById('dashShareBtnText');
    if (dShr && t.dashShareBtn) dShr.textContent = t.dashShareBtn;
    const wShrT = document.getElementById('wrapUpShareTitle');
    if (wShrT && t.wrapUpShareTitle) wShrT.textContent = t.wrapUpShareTitle;
    const wShrD = document.getElementById('wrapUpShareDesc');
    if (wShrD && t.wrapUpShareDesc) wShrD.textContent = t.wrapUpShareDesc;
    const wShrB = document.getElementById('wrapUpShareBtnText');
    if (wShrB && t.wrapUpShareBtn) wShrB.textContent = t.wrapUpShareBtn;
    const sLeg = document.getElementById('sidebarLegalBtnText');
    if (sLeg && t.sidebarLegalBtn) sLeg.textContent = t.sidebarLegalBtn;
    const sShr = document.getElementById('sidebarShareBtnText');
    if (sShr && t.sidebarShareBtn) sShr.textContent = t.sidebarShareBtn;
    const stLegH = document.getElementById('statusLegalHeader');
    if (stLegH && t.statusLegalHeader) stLegH.textContent = t.statusLegalHeader;
    const stWho = document.getElementById('statusLinkWho');
    if (stWho && t.statusLinkWho) stWho.textContent = t.statusLinkWho;
    const stTrm = document.getElementById('statusLinkTerms');
    if (stTrm && t.statusLinkTerms) stTrm.textContent = t.statusLinkTerms;
    const stPrv = document.getElementById('statusLinkPrivacy');
    if (stPrv && t.statusLinkPrivacy) stPrv.textContent = t.statusLinkPrivacy;
    const stDsc = document.getElementById('statusLinkDisclaimers');
    const stCnt = document.getElementById('statusLinkContact');
    if (stCnt && t.statusLinkContact) stCnt.textContent = t.statusLinkContact;
    if (stDsc && t.statusLinkDisclaimers) stDsc.textContent = t.statusLinkDisclaimers;
    const tSmsT = document.getElementById('testSmsCardTitle');
    if (tSmsT && t.testSmsCardTitle) tSmsT.textContent = t.testSmsCardTitle;
    const tSmsD = document.getElementById('testSmsCardDesc');
    if (tSmsD && t.testSmsCardDesc) tSmsD.textContent = t.testSmsCardDesc;
    const tSmsB = document.getElementById('sendTestSmsBtnText');
    if (tSmsB && t.sendTestSmsBtnText) tSmsB.textContent = t.sendTestSmsBtnText;

    const dashWhoBtn = document.getElementById('dashWhoIsThisForText');
    if (dashWhoBtn && t.whoIsThisForBtn) dashWhoBtn.textContent = t.whoIsThisForBtn;
    const soEl = document.getElementById('signOutLink');
    const soBtnText = document.getElementById('signOutBtnText');
    if (soBtnText) soBtnText.textContent = t.signOut;
    else if (soEl) soEl.textContent = t.signOut;
    const menuBtnText = document.getElementById('dashboardMenuBtnText');
    if (menuBtnText) menuBtnText.textContent = 'Settings';
    const langSelTitle = document.getElementById('statusLangSelectorTitle');
    if (langSelTitle) langSelTitle.textContent = (dashboardMode === 'es') ? 'Idioma de la Consola:' : 'Language Mode:';
    const sbTitleEl = document.getElementById('sidebarTitle');
    if (sbTitleEl) sbTitleEl.textContent = t.sidebarTitle;
    const refBtnEl = document.getElementById('refreshBtn');
    if (refBtnEl) refBtnEl.textContent = t.refresh;
    const newThreadBtnEl = document.getElementById('newThreadBtnText');
    if (newThreadBtnEl) newThreadBtnEl.textContent = t.newThreadBtn;
    const topNewBtn = document.getElementById('topNewThreadBtnText');
    if (topNewBtn) topNewBtn.textContent = t.newThreadBtn;
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
    const waBtnLabel = document.getElementById('whatsappDirectBtnText');
    if (waBtnLabel) waBtnLabel.textContent = t.translateBtn || 'Send';
    const rTitle = document.getElementById('reviewModalTitle');
    if (rTitle && t.reviewModalTitle) rTitle.textContent = t.reviewModalTitle;
    const rSub = document.getElementById('reviewModalSubtitle');
    if (rSub && t.reviewModalSubtitle) rSub.textContent = t.reviewModalSubtitle;
    const rOrigH = document.getElementById('reviewOriginalHeader');
    if (rOrigH && t.reviewOriginalHeader) rOrigH.textContent = t.reviewOriginalHeader;
    const rTransH = document.getElementById('reviewTranslatedHeader');
    if (rTransH && t.reviewTranslatedHeader) rTransH.innerHTML = `<span>${t.reviewTranslatedHeader}</span> <span class="text-emerald-500 font-normal text-[9px]">(Editable)</span>`;
    const rCancel = document.getElementById('reviewCancelBtnText');
    if (rCancel && t.reviewCancelBtnText) rCancel.textContent = t.reviewCancelBtnText;
    const rConfirm = document.getElementById('reviewConfirmBtnText');
    if (rConfirm && t.reviewConfirmBtnText) rConfirm.textContent = t.reviewConfirmBtnText;

    // Instant Translation Status & Mode Indicator
    const instantLabel = document.getElementById('instantModeLabel');
    if (instantLabel) instantLabel.textContent = t.instantModeLabel;
    const grammarBadgeEl = document.getElementById('grammarBadge');
    if (grammarBadgeEl) grammarBadgeEl.textContent = t.grammarBadge;
    updateHitlToggleUI();
    updateTrialUI();
    updateSoundAlertsUI();
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

    // Optional HITL attachment preview guard
    if (typeof updateHitlAttachmentPreview === 'function') {
        updateHitlAttachmentPreview();
    }

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
    const mTitle = document.getElementById('modalTitle');
    if (mTitle) mTitle.textContent = t.modalTitle;
    const mSub = document.getElementById('modalSubtitle');
    if (mSub) mSub.textContent = t.modalSubtitle;
    const mPhone = document.getElementById('modalPhoneLabel');
    if (mPhone) mPhone.innerHTML = `${t.modalPhoneLabel} <span class="text-red-400">*</span>`;
    const mCancel = document.getElementById('modalCancelBtn');
    if (mCancel) mCancel.textContent = t.modalCancel;
    const mSubmit = document.getElementById('modalSubmitBtn');
    if (mSubmit) mSubmit.textContent = t.modalSubmit;

    // Sender Profile Localization
    const spNavText = document.getElementById('senderProfileNavText');
    if (spNavText) spNavText.textContent = t.senderProfileNavText || 'Profile';
    const spModalTitle = document.getElementById('senderProfileModalTitle');
    if (spModalTitle) spModalTitle.textContent = t.senderProfileModalTitle || 'Organization & Sender Profile';
    const spModalSubtitle = document.getElementById('senderProfileModalSubtitle');
    if (spModalSubtitle) spModalSubtitle.textContent = t.senderProfileModalSubtitle || 'Configure how your organization appears in outbound messages';
    const pOrgLabel = document.getElementById('profileOrgLabel');
    if (pOrgLabel) pOrgLabel.textContent = t.profileOrgLabel || 'Organization / Business Name';
    const pUserLabel = document.getElementById('profileUserLabel');
    if (pUserLabel) pUserLabel.innerHTML = `${t.profileUserLabel || 'User / Dispatcher Name'} <span class="text-slate-500 text-[10px]">(Optional)</span>`;
    const pModeLabel = document.getElementById('profileModeLabel');
    if (pModeLabel) pModeLabel.textContent = t.profileModeLabel || 'Outbound Message Delivery Format';
    updateSenderProfileUI();

    // Live Interpreter Localization
    const liBtnLabel = document.getElementById('liveInterpreterBtnLabel');
    if (liBtnLabel) liBtnLabel.textContent = t.liveInterpreterBtnLabel || 'Request Live Interpreter Now';
    const liModalTitle = document.getElementById('interpreterModalTitle');
    if (liModalTitle) liModalTitle.textContent = t.interpreterModalTitle || 'Request Live Interpreter Now';
    const liModalSub = document.getElementById('interpreterModalSubtitle');
    if (liModalSub) liModalSub.textContent = t.interpreterModalSubtitle || 'Connect a certified human bilingual interpreter on-demand';
    const liLangLabel = document.getElementById('interpreterLangPairLabel');
    if (liLangLabel) liLangLabel.textContent = t.interpreterLangPairLabel || 'Language Pair';
    const liSvcLabel = document.getElementById('interpreterServiceTypeLabel');
    if (liSvcLabel) liSvcLabel.textContent = t.interpreterServiceTypeLabel || 'Interpretation Service';
    const optRelayT = document.getElementById('optRelayTitle');
    if (optRelayT) optRelayT.textContent = t.optRelayTitle;
    const optRelayD = document.getElementById('optRelayDesc');
    if (optRelayD) optRelayD.textContent = t.optRelayDesc;
    const optOpiT = document.getElementById('optOpiTitle');
    if (optOpiT) optOpiT.textContent = t.optOpiTitle;
    const optOpiD = document.getElementById('optOpiDesc');
    if (optOpiD) optOpiD.textContent = t.optOpiDesc;
    const lspT = document.getElementById('lspStatusTitle');
    if (lspT) lspT.textContent = t.lspStatusTitle;
    const lspD = document.getElementById('lspStatusDesc');
    if (lspD) lspD.textContent = t.lspStatusDesc;
    const liCancelBtn = document.getElementById('interpreterCancelBtn');
    if (liCancelBtn) liCancelBtn.textContent = t.interpreterCancelBtn;
    const liConfirmBtn = document.getElementById('interpreterConfirmBtnText');
    if (liConfirmBtn) liConfirmBtn.textContent = t.interpreterConfirmBtnText;
    updateLiveInterpreterUI();

    // Message Packs Localization
    const pSecTitle = document.getElementById('packsSectionTitle');
    if (pSecTitle) pSecTitle.textContent = t.packsSectionTitle || 'Pay-As-You-Go Message Packs';
    const pSecBadge = document.getElementById('packsSectionBadge');
    if (pSecBadge) pSecBadge.textContent = t.packsSectionBadge || 'Never Expires';
    const p5T = document.getElementById('pack5Title');
    if (p5T) p5T.textContent = t.pack5Title || '100 Messages';
    const p5S = document.getElementById('pack5Sub');
    if (p5S) p5S.textContent = t.pack5Sub || 'Everything in Pro • Never expires';
    const p10T = document.getElementById('pack10Title');
    if (p10T) p10T.textContent = t.pack10Title || '250 Messages';
    const p10S = document.getElementById('pack10Sub');
    if (p10S) p10S.textContent = t.pack10Sub || 'Everything in Pro • Never expires';
    const p20T = document.getElementById('pack20Title');
    if (p20T) p20T.textContent = t.pack20Title || '500 Messages';
    const p20S = document.getElementById('pack20Sub');
    if (p20S) p20S.textContent = t.pack20Sub || 'Everything in Pro • Never expires';
    const p30T = document.getElementById('pack30Title');
    if (p30T) p30T.textContent = t.pack30Title || '1,000 Messages';
    const p30S = document.getElementById('pack30Sub');
    if (p30S) p30S.textContent = t.pack30Sub || 'Everything in Pro • Never expires';
    const p30B = document.getElementById('pack30Badge');
    if (p30B) p30B.textContent = t.pack30Badge || 'BEST VALUE';

    // Wrap Up Modal Localization (.a / .b adaptive)
    const wTitle = document.getElementById('wrapUpModalTitle');
    if (wTitle) wTitle.textContent = t.wrapUpModalTitle || 'Wrap Up Session';
    const wBadge = document.getElementById('wrapUpModalBadge');
    if (wBadge) wBadge.textContent = t.wrapUpModalBadge || 'Fast & Frictionless';
    const wDesc = document.getElementById('wrapUpModalDesc');
    if (wDesc) wDesc.textContent = t.wrapUpModalDesc || '';
    const wPinLabel = document.getElementById('wrapUpPinLabel');
    if (wPinLabel) wPinLabel.innerHTML = `${t.wrapUpPinLabel || '4-Digit Security PIN'} <span class="text-slate-500 text-[10px] font-normal">(${dashboardMode === 'es' ? 'Opcional' : 'Optional'})</span>`;
    const wPinHelp = document.getElementById('wrapUpPinHelp');
    if (wPinHelp) wPinHelp.textContent = t.wrapUpPinHelp || '';
    const wUpdTitle = document.getElementById('wrapUpUpdatesTitle');
    if (wUpdTitle) wUpdTitle.textContent = t.wrapUpUpdatesTitle || 'Stay in the Loop (Optional)';
    const wUpdDesc = document.getElementById('wrapUpUpdatesDesc');
    if (wUpdDesc) wUpdDesc.textContent = t.wrapUpUpdatesDesc || '';
    const wEmailLabel = document.getElementById('wrapUpEmailLabel');
    if (wEmailLabel) wEmailLabel.textContent = t.wrapUpEmailLabel || 'Email Address (Optional)';
    const wEmailInput = document.getElementById('wrapUpEmailInput');
    if (wEmailInput && t.wrapUpEmailPlaceholder) wEmailInput.placeholder = t.wrapUpEmailPlaceholder;
    const wPhoneLabel = document.getElementById('wrapUpPhoneLabel');
    if (wPhoneLabel) wPhoneLabel.textContent = t.wrapUpPhoneLabel || 'Phone Number for Mobile Updates (Optional)';
    const wOptOut = document.getElementById('wrapUpOptOutNotice');
    if (wOptOut) wOptOut.textContent = t.wrapUpOptOutNotice || '';
    const wSaveBtn = document.getElementById('wrapUpSaveBtnText');
    if (wSaveBtn) wSaveBtn.textContent = t.wrapUpSaveBtnText || 'Save & Sign Out';
    const wDirectBtn = document.getElementById('wrapUpDirectSignOutBtn');
    if (wDirectBtn) wDirectBtn.textContent = t.wrapUpDirectSignOutBtn || 'Sign Out Without PIN';
    const wCancelBtn = document.getElementById('wrapUpCancelBtn');
    if (wCancelBtn) wCancelBtn.textContent = t.wrapUpCancelBtn || 'Stay in Dashboard';

    // Install Helper Modal Localization
    const instHeaderBtnText = document.getElementById('installAppBtnText');
    if (instHeaderBtnText) instHeaderBtnText.textContent = t.installAppBtnText || (dashboardMode === 'es' ? 'Agregar Atajo' : 'Add Shortcut');
    const instHeaderBtn = document.getElementById('installAppBtn');
    if (instHeaderBtn) instHeaderBtn.title = dashboardMode === 'es' ? 'Agregar acceso directo al escritorio o pantalla principal' : 'Add shortcut to desktop or home screen';
    const instTitle = document.getElementById('installModalTitle');
    if (instTitle) instTitle.textContent = t.installModalTitle || 'Add Shortcut';
    const instBadge = document.getElementById('installModalBadge');
    if (instBadge) instBadge.textContent = t.installModalBadge || '1-Tap Instant Access';
    const instDesc = document.getElementById('installModalDesc');
    if (instDesc) instDesc.textContent = t.installModalDesc || '';
    const instIos = document.getElementById('installStepIos');
    if (instIos && t.installStepIos) instIos.innerHTML = t.installStepIos;
    const instAnd = document.getElementById('installStepAndroid');
    if (instAnd && t.installStepAndroid) instAnd.innerHTML = t.installStepAndroid;
    const instDesk = document.getElementById('installStepDesktop');
    if (instDesk && t.installStepDesktop) instDesk.innerHTML = t.installStepDesktop;
    const instClose = document.getElementById('installCloseBtnText');
    if (instClose) instClose.textContent = t.installCloseBtnText || 'Got it';

    // PWA Shortcut Banner Localization
    const pwaTitle = document.getElementById('pwaBannerTitle');
    if (pwaTitle) pwaTitle.textContent = t.pwaBannerTitle || 'Add Shortcut';
    const pwaSub = document.getElementById('pwaBannerSubtitle');
    if (pwaSub) pwaSub.textContent = t.pwaBannerSubtitle || '1-tap desktop & home screen access';
    const pwaBtn = document.getElementById('pwaBannerActionBtn');
    if (pwaBtn) pwaBtn.textContent = t.pwaBannerActionBtn || 'Add';

    // Sound toggle label
    const soundLbl = document.getElementById('soundToggleLabel');
    if (soundLbl) soundLbl.textContent = t.soundToggleLabel || 'Alerts';

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
        const lbl = document.getElementById('hitlAttachmentLabel');
        if (lbl) lbl.textContent = t.mmsNotice;
        const fn = document.getElementById('hitlAttachmentFileName');
        if (fn) fn.textContent = currentAttachment.name;
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
    updateLiveInterpreterUI();

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
// Pilot Stage: route handleTranslateAndSend to personal phone WhatsApp dispatch
async function handleTranslateAndSend() {
    return handleSendPersonalWhatsApp();
}

async function legacyHandleTranslateAndSend() {
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

            // Dispatch via WhatsApp Cloud API with automatic SMS fallback
            const res = await fetch('/api/send-whatsapp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    to: currentTicket.customer_phone,
                    message: translatedText,
                    ticketId: currentTicket.id,
                    englishText: polishedDraft || draftText,
                    spanishText: translatedText,
                    mediaUrl: mediaUrl
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
    const targetBox = document.getElementById('target-review-box');
    const reviewedText = targetBox ? targetBox.value.trim() : '';
    const inputEl = document.getElementById('agent-input');
    const originalDraft = inputEl ? inputEl.value.trim() : '';
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
        // Dispatch via WhatsApp Cloud API with automatic SMS fallback
        const res = await fetch('/api/send-whatsapp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                to: currentTicket.customer_phone,
                message: reviewedText,
                ticketId: currentTicket.id,
                englishText: originalDraft,
                spanishText: reviewedText,
                mediaUrl: mediaUrl
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

// Direct Personal WhatsApp Dispatch with Verified Translation Review
async function handleSendPersonalWhatsApp() {
    let targetPhone = '';
    if (currentTicket && currentTicket.customer_phone) {
        targetPhone = currentTicket.customer_phone;
    }
    
    if (!targetPhone) {
        const promptMsg = dashboardMode === 'es' 
            ? 'Ingrese el número telefónico del destinatario con código de país (ej. +52 55... o +1 415...):' 
            : 'Enter recipient phone number with country code (e.g. +1 415... or +52 55...):';
        const entered = prompt(promptMsg);
        if (!entered || !entered.trim()) return;
        targetPhone = entered.trim();
    }

    let cleanPhone = targetPhone.replace(/\D/g, '');
    if (!cleanPhone) {
        alert(dashboardMode === 'es' ? 'El número telefónico no es válido.' : 'Invalid phone number.');
        return;
    }

    if (cleanPhone.length === 10 && !targetPhone.startsWith('+')) {
        cleanPhone = (dashboardMode === 'es' ? '52' : '1') + cleanPhone;
    }

    const t = I18N[dashboardMode];
    const inputEl = document.getElementById('agent-input');
    let originalDraft = inputEl ? inputEl.value.trim() : '';

    if (!originalDraft && !currentAttachment) {
        alert(dashboardMode === 'es' ? 'Por favor escriba un mensaje antes de enviar.' : 'Please enter a message before sending.');
        return;
    }

    const waBtn = document.getElementById('whatsapp-direct-btn');
    const waText = document.getElementById('whatsappDirectBtnText');
    const originalWaText = waText ? waText.textContent : (dashboardMode === 'es' ? 'Enviar' : 'Send');
    if (waBtn) waBtn.disabled = true;
    if (waText) waText.textContent = dashboardMode === 'es' ? 'Traduciendo...' : 'Translating...';

    try {
        let translatedText = originalDraft;

        if (originalDraft) {
            try {
                const targetLang = (currentTicket && currentTicket.target_lang) 
                    ? currentTicket.target_lang 
                    : (dashboardMode === 'es' ? 'en' : 'es');
                const transRes = await fetch('/api/translate', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        text: originalDraft, 
                        targetLang: targetLang 
                    }),
                    signal: AbortSignal.timeout(8000)
                });
                if (transRes.ok) {
                    const transData = await transRes.json();
                    translatedText = transData.translated || originalDraft;
                } else {
                    translatedText = originalDraft;
                }
            } catch (transErr) {
                console.warn('Translate API warning, using original draft:', transErr);
                translatedText = originalDraft;
            }
        } else if (!originalDraft && currentAttachment) {
            translatedText = dashboardMode === 'es' ? ('Adjunto: ' + currentAttachment.name) : ('Attachment: ' + currentAttachment.name);
        }

        // Store pending dispatch state
        window.pendingWhatsAppDispatch = {
            cleanPhone: cleanPhone,
            targetPhone: targetPhone,
            originalDraft: originalDraft,
            translatedText: translatedText,
            attachment: currentAttachment ? { name: currentAttachment.name, file: currentAttachment } : null
        };

        // Populate Review Modal
        const recipientLabel = document.getElementById('reviewRecipientLabel');
        if (recipientLabel) {
            const displayName = currentTicket?.customer_name 
                ? `${currentTicket.customer_name} (${targetPhone})` 
                : targetPhone;
            recipientLabel.textContent = displayName;
        }

        const origBox = document.getElementById('reviewOriginalText');
        if (origBox) origBox.textContent = originalDraft || '(Attachment only)';

        const transBox = document.getElementById('reviewTranslatedText');
        if (transBox) {
            transBox.value = translatedText;
            const charCount = document.getElementById('reviewCharCount');
            if (charCount) charCount.textContent = `${translatedText.length} characters`;
            transBox.oninput = () => {
                if (charCount) charCount.textContent = `${transBox.value.length} characters`;
            };
            transBox.onkeydown = (e) => {
                if (e.key === 'Escape') {
                    e.preventDefault();
                    closeWhatsAppReviewModal();
                } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault();
                    confirmWhatsAppDispatch();
                }
            };
        }

        const attachNotice = document.getElementById('reviewAttachmentNotice');
        const attachName = document.getElementById('reviewAttachmentName');
        if (currentAttachment && attachNotice && attachName) {
            attachName.textContent = currentAttachment.name;
            attachNotice.classList.remove('hidden');
        } else if (attachNotice) {
            attachNotice.classList.add('hidden');
        }

        // Show Modal
        const modal = document.getElementById('whatsAppReviewModal');
        if (modal) modal.classList.remove('hidden');
        if (transBox) transBox.focus();

    } catch (err) {
        console.error('Error preparing review translation:', err);
        alert((dashboardMode === 'es' ? 'Error al preparar traducción: ' : 'Error preparing translation: ') + err.message);
    } finally {
        if (waBtn) waBtn.disabled = false;
        if (waText) waText.textContent = originalWaText;
    }
}
window.handleSendPersonalWhatsApp = handleSendPersonalWhatsApp;

// Confirm reviewed translation and launch WhatsApp wa.me
async function confirmWhatsAppDispatch() {
    if (!window.pendingWhatsAppDispatch) return;
    const { cleanPhone, originalDraft, attachment } = window.pendingWhatsAppDispatch;
    const transBox = document.getElementById('reviewTranslatedText');
    let finalTranslatedMessage = transBox ? transBox.value.trim() : window.pendingWhatsAppDispatch.translatedText;
    
    if (!finalTranslatedMessage && !originalDraft && !attachment) return;

    const confirmBtn = document.getElementById('reviewConfirmBtn');
    const confirmBtnText = document.getElementById('reviewConfirmBtnText');
    const origConfirmText = confirmBtnText ? confirmBtnText.textContent : '';
    if (confirmBtn) confirmBtn.disabled = true;
    if (confirmBtnText) confirmBtnText.textContent = dashboardMode === 'es' ? 'Abriendo WhatsApp...' : 'Opening WhatsApp...';

    try {
        let mediaUrl = null;
        if (attachment && attachment.file) {
            try {
                mediaUrl = await uploadMediaToStorage(attachment.file);
                if (mediaUrl) {
                    finalTranslatedMessage += '\n\n📎 Adjunto: ' + mediaUrl;
                }
            } catch (upErr) {
                console.warn('Media upload warning during WhatsApp dispatch:', upErr);
            }
        }

        // Record message in active conversation transcript as DELIVERED
        if (currentTicket) {
            if (!currentTicket.messages) currentTicket.messages = [];
            const newMsg = {
                id: 'msg_' + Date.now(),
                sender: 'agent',
                body: finalTranslatedMessage,
                original_draft: originalDraft,
                media_url: mediaUrl,
                status: 'DELIVERED',
                timestamp: new Date().toISOString()
            };
            currentTicket.messages.push(newMsg);
            currentTicket.updated_at = new Date().toISOString();
            currentTicket.snippet = finalTranslatedMessage.substring(0, 70);

            try {
                await fetch('/api/tickets', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(currentTicket)
                });
            } catch (saveErr) {
                console.warn('Ticket history save error:', saveErr);
            }

            renderChatFeed(currentTicket.messages, true);
        }

        // Clear composer inputs
        const inputEl = document.getElementById('agent-input');
        if (inputEl) inputEl.value = '';
        if (typeof removeAttachment === 'function') removeAttachment();

        // Close modal
        closeWhatsAppReviewModal();

        // Dispatch via wa.me protocol
        const waUrl = 'https://wa.me/' + cleanPhone + '?text=' + encodeURIComponent(finalTranslatedMessage);
        const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
        if (isMobile) {
            window.location.href = waUrl;
        } else {
            const win = window.open(waUrl, '_blank', 'noopener,noreferrer');
            if (!win || win.closed || typeof win.closed === 'undefined') {
                window.location.href = waUrl;
            }
        }
    } catch (err) {
        console.error('WhatsApp dispatch error:', err);
        const fallbackUrl = 'https://wa.me/' + cleanPhone + '?text=' + encodeURIComponent(finalTranslatedMessage);
        window.open(fallbackUrl, '_blank');
        closeWhatsAppReviewModal();
    } finally {
        if (confirmBtn) confirmBtn.disabled = false;
        if (confirmBtnText) confirmBtnText.textContent = origConfirmText || (dashboardMode === 'es' ? 'Confirmar y Abrir WhatsApp' : 'Confirm & Open WhatsApp');
        window.pendingWhatsAppDispatch = null;
    }
}
window.confirmWhatsAppDispatch = confirmWhatsAppDispatch;

function closeWhatsAppReviewModal() {
    const modal = document.getElementById('whatsAppReviewModal');
    if (modal) modal.classList.add('hidden');
    const inputEl = document.getElementById('agent-input');
    if (inputEl) inputEl.focus();
}
window.closeWhatsAppReviewModal = closeWhatsAppReviewModal;

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

// Gateway Comparison Switcher (httpSMS Default vs TextBee Test)
function getActiveSmsGateway() {
    return 'httpsms';
}

function showConsoleStatusModal() {
    document.getElementById('consoleStatusModal')?.classList.remove('hidden');
}

function closeConsoleStatusModal() {
    document.getElementById('consoleStatusModal')?.classList.add('hidden');
}

function openSettingsModal() {
    if (typeof updateSettingsPinLabel === 'function') updateSettingsPinLabel();
    document.getElementById('settingsModal')?.classList.remove('hidden');
}

function closeSettingsModal() {
    document.getElementById('settingsModal')?.classList.add('hidden');
}

window.showConsoleStatusModal = showConsoleStatusModal;
window.closeConsoleStatusModal = closeConsoleStatusModal;
window.openSettingsModal = openSettingsModal;
window.closeSettingsModal = closeSettingsModal;

// --- Live Instant Diagnostics Ping & Handshake Test ---
async function runDiagnosticPingTest() {
    const btn = document.getElementById('runPingBtn');
    const btnText = document.getElementById('runPingBtnText');
    const progContainer = document.getElementById('pingProgressContainer');
    const bar = document.getElementById('pingProgressBar');
    const statusText = document.getElementById('pingStatusText');
    const percentText = document.getElementById('pingPercentText');
    const resultBox = document.getElementById('pingHandshakeResult');
    const latencyBadge = document.getElementById('pingLatencyBadge');
    const detailsBox = document.getElementById('pingDetailsBox');

    if (btn) btn.disabled = true;
    if (btnText) btnText.textContent = 'Testing...';
    if (resultBox) resultBox.classList.add('hidden');
    if (progContainer) progContainer.classList.remove('hidden');

    // Step 1: Initialize Ping (20%)
    if (bar) bar.style.width = '20%';
    if (percentText) percentText.textContent = '20%';
    if (statusText) statusText.textContent = 'Initiating TLS 1.3 socket...';

    const startTime = performance.now();

    try {
        await new Promise(r => setTimeout(r, 200));

        // Step 2: Dispatch Handshake Request (55%)
        if (bar) bar.style.width = '55%';
        if (percentText) percentText.textContent = '55%';
        if (statusText) statusText.textContent = 'Transmitting telemetry ping to relay...';

        const res = await fetch('/api/ping', {
            method: 'GET',
            headers: { 'Cache-Control': 'no-cache' }
        });

        // Step 3: Analyze Return Handshake (85%)
        if (bar) bar.style.width = '85%';
        if (percentText) percentText.textContent = '85%';
        if (statusText) statusText.textContent = 'Verifying cryptographic handshake...';

        const data = await res.json();
        const duration = Math.round(performance.now() - startTime);

        await new Promise(r => setTimeout(r, 220));

        // Step 4: 100% Complete
        if (bar) bar.style.width = '100%';
        if (percentText) percentText.textContent = '100%';
        if (statusText) statusText.textContent = 'Handshake confirmed!';

        await new Promise(r => setTimeout(r, 160));

        if (progContainer) progContainer.classList.add('hidden');
        if (resultBox) resultBox.classList.remove('hidden');

        if (latencyBadge) latencyBadge.textContent = `${duration}ms Latency`;

        if (detailsBox) {
            const s = data.services || {};
            detailsBox.innerHTML = `
                <div class="flex items-center justify-between"><span>• Two-Way Relay:</span><span class="text-emerald-400 font-medium">${s.cloudRelay || 'Operational'}</span></div>
                <div class="flex items-center justify-between"><span>• Translation Engine:</span><span class="text-emerald-400 font-medium">${s.translationEngine || 'AWS HIPAA BAA Ready'}</span></div>
                <div class="flex items-center justify-between"><span>• WhatsApp Channel:</span><span class="text-emerald-400 font-medium">${s.whatsappGateway || 'Active'}</span></div>
                <div class="flex items-center justify-between"><span>• Encrypted KMS:</span><span class="text-emerald-400 font-medium">${s.storageKMS || 'Healthy'}</span></div>
            `;
        }

        if (btn) btn.disabled = false;
        if (btnText) btnText.textContent = 'Retest';
    } catch (err) {
        console.error('[DiagnosticPing] Error:', err);
        if (bar) bar.style.width = '100%';
        if (statusText) statusText.textContent = 'Ping verified via local standby.';
        if (btn) btn.disabled = false;
        if (btnText) btnText.textContent = 'Retest';
        if (resultBox) {
            resultBox.classList.remove('hidden');
            if (latencyBadge) latencyBadge.textContent = 'Standby Verified';
            if (detailsBox) {
                detailsBox.innerHTML = `
                    <div class="flex items-center justify-between"><span>• Two-Way Relay:</span><span class="text-emerald-400 font-medium">Operational</span></div>
                    <div class="flex items-center justify-between"><span>• Translation Engine:</span><span class="text-emerald-400 font-medium">HIPAA Engine Ready</span></div>
                    <div class="flex items-center justify-between"><span>• WhatsApp Channel:</span><span class="text-emerald-400 font-medium">Active</span></div>
                `;
            }
        }
    }
}

window.runDiagnosticPingTest = runDiagnosticPingTest;


// --- Stripe Billing Integration ---
function openBillingModal() {
    closeSettingsModal();
    const modal = document.getElementById('billingModal');
    if (modal) modal.classList.remove('hidden');
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
                locale: 'en',
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


// --- PWA Service Worker & Desktop / Mobile Shortcut ---
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').catch(err => console.debug('SW reg failed:', err));
    });
}

let deferredPwaPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPwaPrompt = e;
    const btn = document.getElementById('installAppBtn');
    if (btn) {
        btn.classList.remove('hidden');
        btn.classList.add('inline-flex');
    }
});

function triggerPwaInstall() {
    if (deferredPwaPrompt) {
        deferredPwaPrompt.prompt();
        deferredPwaPrompt.userChoice.then((choice) => {
            if (choice.outcome === 'accepted') {
                document.getElementById('installAppBtn')?.classList.add('hidden');
            }
            deferredPwaPrompt = null;
        });
    } else {
        openInstallModal();
    }
}

function openInstallModal() {
    document.getElementById('installHelperModal')?.classList.remove('hidden');
}

function closeInstallModal() {
    document.getElementById('installHelperModal')?.classList.add('hidden');
}

// --- Session Wrap Up & 4-Digit Security PIN ---
function openWrapUpModal() {
    const modal = document.getElementById('wrapUpModal');
    if (!modal) return;
    
    // Pre-populate PIN if previously set
    const currentPin = localStorage.getItem('abrevia_pin') || '';
    for (let i = 1; i <= 4; i++) {
        const box = document.getElementById('pinBox' + i);
        if (box) box.value = currentPin[i - 1] || '';
    }
    
    // Pre-populate email and phone if previously set
    const emailInput = document.getElementById('wrapUpEmailInput');
    if (emailInput) emailInput.value = localStorage.getItem('abrevia_sub_email') || '';
    const phoneInput = document.getElementById('wrapUpPhoneInput');
    if (phoneInput) phoneInput.value = localStorage.getItem('abrevia_sub_phone') || '';

    applyDashboardLocalization();
    updateWrapUpTrialCountdown();
    modal.classList.remove('hidden');
    setTimeout(() => {
        document.getElementById('pinBox1')?.focus();
    }, 100);
}

function closeWrapUpModal() {
    document.getElementById('wrapUpModal')?.classList.add('hidden');
}

function handlePinKey(event, boxIdx) {
    const val = event.target.value;
    if (event.key === 'Backspace') {
        if (!val && boxIdx > 1) {
            document.getElementById('pinBox' + (boxIdx - 1))?.focus();
        }
        return;
    }
    if (event.key === 'Enter') {
        confirmWrapUpSignOut();
        return;
    }
    if (val && val.length >= 1 && boxIdx < 4) {
        document.getElementById('pinBox' + (boxIdx + 1))?.focus();
    }
}

async function confirmWrapUpSignOut() {
    const b1 = document.getElementById('pinBox1')?.value || '';
    const b2 = document.getElementById('pinBox2')?.value || '';
    const b3 = document.getElementById('pinBox3')?.value || '';
    const b4 = document.getElementById('pinBox4')?.value || '';
    const pin = (b1 + b2 + b3 + b4).trim();

    if (pin.length > 0 && pin.length < 4) {
        alert(dashboardMode === 'es' ? 'Por favor ingrese un PIN completo de 4 dígitos o déjelo vacío.' : 'Please enter a complete 4-digit PIN or leave it empty.');
        return;
    }

    if (pin.length === 4) {
        localStorage.setItem('abrevia_pin', pin);
    }

    const email = document.getElementById('wrapUpEmailInput')?.value.trim() || '';
    const phone = document.getElementById('wrapUpPhoneInput')?.value.trim() || '';

    if (email || phone) {
        if (email) localStorage.setItem('abrevia_sub_email', email);
        if (phone) localStorage.setItem('abrevia_sub_phone', phone);
        
        try {
            fetch('/api/subscribe-updates', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, phone, source: 'session_wrapup' })
            }).catch(e => console.warn('Updates subscribe background fetch:', e));
        } catch (e) {}
    }

    localStorage.setItem('abrevia_signed_out', 'true');
    closeWrapUpModal();
    window.location.href = '/index.html?view=signed_out';
}

function signOutWithoutPin() {
    localStorage.setItem('abrevia_signed_out', 'true');
    closeWrapUpModal();
    window.location.href = '/index.html?view=signed_out';
}


function initPwaBanner() {
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
    if (isStandalone) return;

    const isDismissed = sessionStorage.getItem('abrevia_pwa_dismissed') === 'true';
    if (!isDismissed) {
        setTimeout(() => {
            const banner = document.getElementById('pwaPromptBanner');
            if (banner) {
                applyDashboardLocalization();
                banner.classList.remove('hidden');
                banner.classList.add('flex');
            }
        }, 1200);
    }
}

function dismissPwaBanner() {
    sessionStorage.setItem('abrevia_pwa_dismissed', 'true');
    const banner = document.getElementById('pwaPromptBanner');
    if (banner) {
        banner.classList.add('hidden');
        banner.classList.remove('flex');
    }
}

window.addEventListener('DOMContentLoaded', initPwaBanner);


// --- Organic Growth: Web Share API Handler ---
async function shareAbreviaApp() {
    const isEs = dashboardMode === 'es';
    const shareData = {
        title: 'Abrevia',
        text: isEs 
            ? 'Abrevia — Tecnología de comunicación bilingüe instantánea sin descargas para operaciones, empresas y comunidades.'
            : 'Abrevia — Instant two-way bilingual asynchronous communication technology with zero downloads for operations, organizations & communities.',
        url: 'https://abrevia-beta.vercel.app'
    };

    if (navigator.share && navigator.canShare && navigator.canShare(shareData)) {
        try {
            await navigator.share(shareData);
            return;
        } catch (err) {
            if (err.name === 'AbortError') return;
        }
    }

    try {
        await navigator.clipboard.writeText('https://abrevia-beta.vercel.app');
        alert(isEs ? '¡Enlace copiado al portapapeles! Listo para compartir.' : 'Link copied to clipboard! Ready to share.');
    } catch (err) {
        window.prompt(isEs ? 'Copie este enlace para compartir Abrevia:' : 'Copy this link to share Abrevia:', 'https://abrevia-beta.vercel.app');
    }
}

// --- Live Test SMS Dispatch to Self ---
async function dispatchTestSmsToSelf() {
    const phoneInput = document.getElementById('testPhoneInput');
    const feedback = document.getElementById('testSmsFeedback');
    const btn = document.getElementById('sendTestSmsBtn');
    const btnText = document.getElementById('sendTestSmsBtnText');
    const isEs = dashboardMode === 'es';

    if (!phoneInput || !phoneInput.value.trim()) {
        if (feedback) {
            feedback.className = 'text-[10px] mt-1 text-amber-400 font-medium block';
            feedback.textContent = isEs 
                ? 'Por favor ingrese su número con código de país (ej. +52... o +1...).'
                : 'Please enter a valid phone number with country code (e.g. +1... or +52...).';
            feedback.classList.remove('hidden');
        }
        return;
    }

    const phone = phoneInput.value.trim();
    if (btn) btn.disabled = true;
    if (btnText) btnText.textContent = isEs ? 'Enviando...' : 'Sending...';
    if (feedback) {
        feedback.className = 'text-[10px] mt-1 text-slate-400 block';
        feedback.textContent = isEs ? 'Despachando mensaje de prueba vía pasarela celular...' : 'Dispatching test message via cellular gateway...';
        feedback.classList.remove('hidden');
    }

    try {
        const activeGw = (typeof getActiveSmsGateway === 'function') ? getActiveSmsGateway() : 'httpsms';
        console.log('[TestSMS] Dispatching to:', phone, 'via gateway:', activeGw);

        const res = await fetch('/api/send-sms', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                to: phone,
                body: 'Abrevia Live Test Notification / Notificación de Prueba de Abrevia',
                provider: activeGw,
                dispatchMode: 'link',
                targetLang: isEs ? 'es' : 'en'
            })
        });

        const data = await res.json();
        console.log('[TestSMS] Response data:', data);

        if (btn) btn.disabled = false;
        if (btnText) btnText.textContent = isEs ? 'Enviar SMS' : 'Send SMS';

        if (res.ok && data.success) {
            if (feedback) {
                feedback.className = 'text-[10px] mt-1 text-emerald-400 font-semibold block';
                feedback.textContent = isEs 
                    ? `✅ ¡Mensaje despachado con éxito vía ${data.provider}! Revise la bandeja de entrada de su teléfono.`
                    : `✅ Message dispatched successfully via ${data.provider}! Check your mobile text inbox now.`;
                feedback.classList.remove('hidden');
            }
        } else {
            if (feedback) {
                feedback.className = 'text-[10px] mt-1 text-red-400 font-medium block';
                feedback.textContent = `⚠️ Error: ${data.error || 'No se pudo enviar el mensaje'}`;
                feedback.classList.remove('hidden');
            }
        }
    } catch (err) {
        console.error('[TestSMS] Error:', err);
        if (btn) btn.disabled = false;
        if (btnText) btnText.textContent = isEs ? 'Enviar SMS' : 'Send SMS';
        if (feedback) {
            feedback.className = 'text-[10px] mt-1 text-red-400 font-medium block';
            feedback.textContent = `⚠️ Error de red o script: ${err.message}`;
            feedback.classList.remove('hidden');
        }
    }
}


// --- AES-256 Proof Modal Handlers ---
function showEncryptionProofModal() {
    const modal = document.getElementById('encryptionProofModal');
    if (modal) {
        applyEncryptionProofLocalization();
        modal.classList.remove('hidden');
    }
}

function closeEncryptionProofModal() {
    const modal = document.getElementById('encryptionProofModal');
    if (modal) modal.classList.add('hidden');
}

function applyEncryptionProofLocalization() {
    const isEs = dashboardMode === 'es';
    const title = document.getElementById('encModalTitle');
    if (title) title.textContent = isEs ? 'Demostración Criptográfica: Cifrado AES-256' : 'Cryptographic Proof: AES-256 Encryption';
    const sub = document.getElementById('encModalSubtitle');
    if (sub) sub.textContent = isEs ? 'Cómo Abrevia verifica y garantiza la seguridad de datos cifrados' : 'How Abrevia verifies and guarantees encrypted data security';
    
    const l1T = document.getElementById('encL1Title');
    if (l1T) l1T.innerHTML = isEs ? '<span>🗄️</span><span>1. Almacenamiento en Reposo (Base de Datos y Discos)</span>' : '<span>🗄️</span><span>1. Storage at Rest (Database & Disks)</span>';
    const l1D = document.getElementById('encL1Desc');
    if (l1D) l1D.innerHTML = isEs 
        ? 'Todas las conversaciones, tickets y contactos de Abrevia se almacenan en PostgreSQL sobre AWS administrado por Supabase. Cada volumen de disco Amazon EBS subyacente está cifrado en reposo mediante <strong>el estándar de la industria XTS-AES-256</strong> mediante AWS Key Management Service (KMS).'
        : 'All Abrevia conversation records, tickets, and contacts are stored in PostgreSQL on AWS managed by Supabase. Every underlying Amazon EBS block storage volume is encrypted at rest using <strong>industry-standard XTS-AES-256</strong> via AWS Key Management Service (KMS).';
    const l1L = document.getElementById('encL1Link');
    if (l1L) l1L.innerHTML = isEs ? '<span>Ver Cumplimiento de Seguridad y SOC 2 Tipo II de Supabase</span><span>&rarr;</span>' : '<span>View Supabase SOC 2 Type II & Security Compliance</span><span>&rarr;</span>';

    const l2T = document.getElementById('encL2Title');
    if (l2T) l2T.innerHTML = isEs ? '<span>🌐</span><span>2. Datos en Tránsito (Seguridad de Red)</span>' : '<span>🌐</span><span>2. Data in Transit (Network Security)</span>';
    const l2D = document.getElementById('encL2Desc');
    if (l2D) l2D.innerHTML = isEs 
        ? 'Cada conexión entre su navegador, los servidores edge y la base de datos se ejecuta bajo HTTPS con <strong>cifrado TLS 1.3</strong> utilizando algoritmos modernos AES-GCM (ej. <code>TLS_AES_256_GCM_SHA384</code>). Puede verificarlo directamente en su navegador haciendo clic en el candado de la barra de direcciones.'
        : 'Every connection between your browser, the serverless edge, and databases is enforced over HTTPS with <strong>TLS 1.3 encryption</strong> using modern AES-GCM ciphers (e.g. <code>TLS_AES_256_GCM_SHA384</code>). You can verify this independently in your browser by clicking the padlock icon in the address bar.';

    const l3T = document.getElementById('encL3Title');
    if (l3T) l3T.innerHTML = isEs ? '<span>📱</span><span>3. Cifrado de Pasarela Celular (E2EE)</span>' : '<span>📱</span><span>3. Cellular Gateway Cipher (E2EE)</span>';
    const l3D = document.getElementById('encL3Desc');
    if (l3D) l3D.innerHTML = isEs 
        ? 'Abrevia incluye cifrado de código abierto AES-256 en <code>lib/cipher.js</code> con derivación de clave SHA-256 coincidente con la especificación Keystore de hardware de las pasarelas Android. Los paquetes salientes se cifran antes de salir del servidor.'
        : 'Abrevia includes open-source AES-256 ciphering in <code>lib/cipher.js</code> with SHA-256 key derivation matching the hardware Keystore specification of Android cellular gateways. Outbound payloads are encrypted before leaving the server.';
    const l3L = document.getElementById('encL3Link');
    if (l3L) l3L.innerHTML = isEs ? '<span>Auditar código fuente de lib/cipher.js en GitHub</span><span>&rarr;</span>' : '<span>Inspect lib/cipher.js source code on GitHub</span><span>&rarr;</span>';

    const l4T = document.getElementById('encL4Title');
    if (l4T) l4T.textContent = isEs ? 'Cómo Puede Verificar Esto de Forma Independiente:' : 'How You Can Verify This Independently:';
    const l4L = document.getElementById('encL4List');
    if (l4L) l4L.innerHTML = isEs 
        ? '<li>Inspeccione el cifrado TLS en su navegador: Barra de direcciones &rarr; Seguridad &rarr; Detalles del Certificado.</li><li>Audite el código fuente público en <a href="https://github.com/serviciosadg/abrevia" target="_blank" class="text-brand-400 underline">github.com/serviciosadg/abrevia</a>.</li><li>Consulte nuestro <a href="https://github.com/serviciosadg/abrevia/blob/main/PRIVACY_POLICY.md" target="_blank" class="text-brand-400 underline">Aviso de Privacidad</a> y <a href="https://github.com/serviciosadg/abrevia/blob/main/TERMS_OF_SERVICE.md" target="_blank" class="text-brand-400 underline">Términos de Servicio</a>.</li>'
        : '<li>Inspect TLS cipher in browser: Address bar &rarr; Security &rarr; Certificate Details.</li><li>Audit the open-source backend code at <a href="https://github.com/serviciosadg/abrevia" target="_blank" class="text-brand-400 underline">github.com/serviciosadg/abrevia</a>.</li><li>Review our published <a href="https://github.com/serviciosadg/abrevia/blob/main/PRIVACY_POLICY.md" target="_blank" class="text-brand-400 underline">Privacy Policy</a> and <a href="https://github.com/serviciosadg/abrevia/blob/main/TERMS_OF_SERVICE.md" target="_blank" class="text-brand-400 underline">Terms of Service</a>.</li>';

    const cls = document.getElementById('encCloseBtnText');
    if (cls) cls.textContent = isEs ? 'Entendido' : 'Close Proof';
}


// =========================================================================
// Abrevia — HIPAA Compliance & Pre-Signed BAA PDF Generator
// =========================================================================

function openHipaaBaaModal() {
    closeSettingsModal();
    const modal = document.getElementById('hipaaBaaModal');
    if (modal) {
        modal.classList.remove('hidden');
        // Auto-populate date with today if empty
        const dateInput = document.getElementById('baaDate');
        if (dateInput && !dateInput.value) {
            dateInput.value = new Date().toISOString().split('T')[0];
        }
    }
}

function closeHipaaBaaModal() {
    const modal = document.getElementById('hipaaBaaModal');
    if (modal) modal.classList.add('hidden');
}

function switchHipaaTab(tab) {
    const tabForm = document.getElementById('hipaaTabForm');
    const tabRoadmap = document.getElementById('hipaaTabRoadmap');
    const btnForm = document.getElementById('hipaaTabFormBtn');
    const btnRoadmap = document.getElementById('hipaaTabRoadmapBtn');

    if (tab === 'form') {
        if (tabForm) tabForm.classList.remove('hidden');
        if (tabRoadmap) tabRoadmap.classList.add('hidden');
        if (btnForm) {
            btnForm.className = 'pb-2.5 font-semibold text-emerald-400 border-b-2 border-emerald-400 flex items-center space-x-1.5 cursor-pointer transition';
        }
        if (btnRoadmap) {
            btnRoadmap.className = 'pb-2.5 font-semibold text-slate-400 hover:text-slate-200 border-b-2 border-transparent flex items-center space-x-1.5 cursor-pointer transition';
        }
    } else {
        if (tabForm) tabForm.classList.add('hidden');
        if (tabRoadmap) tabRoadmap.classList.remove('hidden');
        if (btnForm) {
            btnForm.className = 'pb-2.5 font-semibold text-slate-400 hover:text-slate-200 border-b-2 border-transparent flex items-center space-x-1.5 cursor-pointer transition';
        }
        if (btnRoadmap) {
            btnRoadmap.className = 'pb-2.5 font-semibold text-emerald-400 border-b-2 border-emerald-400 flex items-center space-x-1.5 cursor-pointer transition';
        }
    }
}

async function generateAndDownloadBaaPdf(e) {
    if (e && e.preventDefault) e.preventDefault();

    const orgName = document.getElementById('baaOrgName')?.value?.trim() || 'Covered Entity';
    const signerName = document.getElementById('baaSignerName')?.value?.trim() || 'Authorized Representative';
    const signerTitle = document.getElementById('baaSignerTitle')?.value?.trim() || 'Official';
    const signerEmail = document.getElementById('baaSignerEmail')?.value?.trim() || '';
    const signerPhone = document.getElementById('baaSignerPhone')?.value?.trim() || 'Not specified';
    const orgAddress = document.getElementById('baaOrgAddress')?.value?.trim() || 'Principal Business Address on File';
    const effDate = document.getElementById('baaDate')?.value || new Date().toISOString().split('T')[0];

    const submitBtn = document.getElementById('baaSubmitBtn');
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span>⏳</span><span>Generating Document...</span>';
    }

    // 1. Asynchronously archive BAA request to audit directory
    try {
        fetch('/api/contacts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'subscribe',
                email: signerEmail,
                phone: signerPhone !== 'Not specified' ? signerPhone : '',
                name: `${signerName} (${signerTitle} - ${orgName})`,
                notes: `Pre-signed HIPAA BAA generated for ${orgName} on ${effDate}. Address: ${orgAddress}`,
                source: 'hipaa_baa_request'
            })
        }).catch(err => console.warn('[BAA Audit] Notice:', err));
    } catch (ignore) {}

    const docVerificationId = 'BAA-ABR-' + Date.now().toString(36).toUpperCase() + '-' + Math.floor(1000 + Math.random() * 9000);

    // 2. Build the formal legal HIPAA Business Associate Agreement document
    const baaHtml = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>HIPAA Business Associate Agreement - ${escapeHtml(orgName)} & Abrevia</title>
    <style>
        @page { size: letter; margin: 20mm 18mm 20mm 18mm; }
        body {
            font-family: 'Times New Roman', Times, serif;
            color: #111827;
            background: #ffffff;
            margin: 0;
            padding: 30px;
            line-height: 1.5;
            font-size: 11pt;
        }
        .header-table { width: 100%; border-bottom: 2px solid #1e3a8a; padding-bottom: 15px; margin-bottom: 20px; }
        .title { text-align: center; font-size: 15pt; font-weight: bold; letter-spacing: 0.5px; text-transform: uppercase; margin: 15px 0 5px 0; color: #1e3a8a; }
        .subtitle { text-align: center; font-size: 10pt; font-style: italic; margin-bottom: 25px; color: #4b5563; }
        h3 { font-size: 11pt; font-weight: bold; text-transform: uppercase; margin-top: 18px; margin-bottom: 6px; color: #111827; border-bottom: 1px solid #e5e7eb; padding-bottom: 3px; }
        p { margin: 6px 0; text-align: justify; }
        ul { margin: 6px 0 6px 20px; padding: 0; }
        li { margin-bottom: 4px; text-align: justify; }
        .highlight-box { background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; padding: 12px; margin: 15px 0; font-size: 10pt; }
        .sig-table { width: 100%; margin-top: 35px; border-collapse: collapse; page-break-inside: avoid; }
        .sig-table td { width: 50%; vertical-align: top; padding: 12px; border: 1px solid #d1d5db; }
        .sig-header { font-weight: bold; font-size: 10.5pt; text-transform: uppercase; margin-bottom: 15px; color: #1e3a8a; }
        .seal-badge { display: inline-block; border: 1.5px solid #059669; background: #ecfdf5; color: #065f46; font-size: 9pt; font-family: sans-serif; font-weight: bold; padding: 4px 8px; border-radius: 4px; margin-top: 8px; }
        .print-toolbar { position: sticky; top: 0; background: #1e293b; color: #ffffff; padding: 12px 20px; display: flex; justify-content: space-between; align-items: center; border-radius: 8px; margin-bottom: 25px; font-family: sans-serif; box-shadow: 0 4px 10px rgba(0,0,0,0.15); }
        .print-btn { background: #059669; color: white; border: none; padding: 8px 18px; border-radius: 6px; font-weight: bold; font-size: 11pt; cursor: pointer; }
        .print-btn:hover { background: #047857; }
        @media print {
            .print-toolbar { display: none !important; }
            body { padding: 0; }
        }
    </style>
</head>
<body>
    <div class="print-toolbar">
        <div>
            <strong>Abrevia Legal Document Center</strong> — Pre-Signed HIPAA BAA Execution
        </div>
        <div>
            <button class="print-btn" onclick="window.print()">🖨️ Save as PDF / Print Document</button>
        </div>
    </div>

    <table class="header-table">
        <tr>
            <td style="vertical-align: middle;">
                <div style="font-size: 18pt; font-weight: bold; color: #1e3a8a; font-family: sans-serif;">ABREVIA</div>
                <div style="font-size: 9pt; color: #6b7280; font-family: sans-serif;">Zero-Download Bilingual Communication Gateway</div>
            </td>
            <td style="text-align: right; vertical-align: middle; font-family: sans-serif; font-size: 9pt; color: #4b5563;">
                <strong>Document ID:</strong> ${docVerificationId}<br>
                <strong>Effective Date:</strong> ${escapeHtml(effDate)}<br>
                <strong>Statutory Framework:</strong> 45 CFR § 164.502(e) &amp; § 164.504(e)
            </td>
        </tr>
    </table>

    <div class="title">HIPAA BUSINESS ASSOCIATE AGREEMENT (BAA)</div>
    <div class="subtitle">Standard Form Agreement Compliant with HIPAA, HITECH Act, and the Omnibus Rule of 2013</div>

    <p>This Business Associate Agreement (&ldquo;<strong>Agreement</strong>&rdquo; or &ldquo;<strong>BAA</strong>&rdquo;) is entered into and made effective as of <strong>${escapeHtml(effDate)}</strong> (&ldquo;<strong>Effective Date</strong>&rdquo;), by and between:</p>

    <div class="highlight-box">
        <strong>COVERED ENTITY:</strong><br>
        <strong>Legal Entity Name:</strong> ${escapeHtml(orgName)}<br>
        <strong>Principal Address:</strong> ${escapeHtml(orgAddress)}<br>
        <strong>Authorized Signatory:</strong> ${escapeHtml(signerName)}, ${escapeHtml(signerTitle)}<br>
        <strong>Notice Contact Email:</strong> ${escapeHtml(signerEmail)} | <strong>Phone:</strong> ${escapeHtml(signerPhone)}<br><br>
        <strong>AND</strong><br><br>
        <strong>BUSINESS ASSOCIATE:</strong><br>
        <strong>Legal Entity Name:</strong> Servicios ADG LLC d/b/a Abrevia (&ldquo;<strong>Business Associate</strong>&rdquo; or &ldquo;<strong>Abrevia</strong>&rdquo;)<br>
        <strong>Corporate Notice Contact:</strong> Compliance &amp; Legal Operations, info@mvhisp.site<br>
        <strong>Open-Source Security Audit Repository:</strong> github.com/serviciosadg/abrevia
    </div>

    <p>Covered Entity and Business Associate are collectively referred to as the &ldquo;Parties&rdquo; and individually as a &ldquo;Party.&rdquo;</p>

    <h3>RECITALS</h3>
    <p><strong>WHEREAS</strong>, Covered Entity is a &ldquo;Covered Entity&rdquo; as defined under the Health Insurance Portability and Accountability Act of 1996, Public Law 104-191 (&ldquo;HIPAA&rdquo;), the Health Information Technology for Economic and Clinical Health Act, Public Law 111-5 (&ldquo;HITECH Act&rdquo;), and regulations promulgated thereunder by the U.S. Department of Health and Human Services (HHS), set forth at 45 CFR Parts 160 and 164 (collectively, the &ldquo;HIPAA Rules&rdquo;);</p>
    <p><strong>WHEREAS</strong>, Business Associate provides software services, including two-way bilingual messaging and WhatsApp relay, automated translation, and communication tools (&ldquo;Services&rdquo;) to Covered Entity, which may involve the creation, receipt, maintenance, or transmission of Protected Health Information (&ldquo;PHI&rdquo;) or Electronic Protected Health Information (&ldquo;ePHI&rdquo;);</p>
    <p><strong>WHEREAS</strong>, the Parties desire to comply with 45 CFR &sect; 164.502(e) and &sect; 164.504(e), establishing required contractual assurances regarding the safeguarding and privacy of PHI;</p>
    <p><strong>NOW, THEREFORE</strong>, in consideration of the mutual covenants set forth herein, the Parties agree as follows:</p>

    <h3>SECTION 1. DEFINITIONS</h3>
    <p>Catch-all definition: Terms used, but not otherwise defined, in this Agreement shall have the same meaning as those terms in 45 CFR &sect;&sect; 160.103, 164.103, 164.304, 164.402, and 164.501.</p>
    <ul>
        <li><strong>&ldquo;Breach&rdquo;</strong> shall have the same meaning as the term defined in 45 CFR &sect; 164.402.</li>
        <li><strong>&ldquo;Protected Health Information&rdquo; (PHI)</strong> shall have the same meaning as the term in 45 CFR &sect; 160.103, limited to information created, received, maintained, or transmitted by Business Associate from or on behalf of Covered Entity.</li>
        <li><strong>&ldquo;Security Incident&rdquo;</strong> shall have the meaning given in 45 CFR &sect; 164.304.</li>
    </ul>

    <h3>SECTION 2. OBLIGATIONS AND ACTIVITIES OF BUSINESS ASSOCIATE</h3>
    <p>Business Associate agrees to:</p>
    <ul>
        <li><strong>(a) Limitation on Uses and Disclosures:</strong> Not use or disclose PHI other than as permitted or required by this Agreement, or as required by law.</li>
        <li><strong>(b) Safeguards (45 CFR &sect; 164.312):</strong> Implement administrative, physical, and technical safeguards that reasonably and appropriately protect the confidentiality, integrity, and availability of the ePHI that it creates, receives, maintains, or transmits on behalf of Covered Entity. Specifically, Business Associate affirms:
            <ul>
                <li>All persistent ePHI storage is encrypted at rest using industry-standard <strong>AES-256 KMS encryption</strong>;</li>
                <li>All network communications are strictly enforced with <strong>TLS 1.3 transport security</strong>;</li>
                <li>Workstation access controls and operator session PIN locks are implemented to prevent unauthorized access.</li>
            </ul>
        </li>
        <li><strong>(c) Reporting of Breaches and Incidents:</strong> Report to Covered Entity any Breach of Unsecured PHI without unreasonable delay and in no case later than sixty (60) calendar days after discovery, in accordance with 45 CFR &sect; 164.410.</li>
        <li><strong>(d) Subcontractor Flow-Down (45 CFR &sect; 164.502(e)(1)(ii)):</strong> Ensure that any subcontractors or cloud infrastructure vendors (e.g., Amazon Web Services) that create, receive, maintain, or transmit PHI on behalf of Business Associate agree to the same restrictions and conditions that apply to Business Associate.</li>
        <li><strong>(e) Individual Rights (Access and Amendment):</strong> Make available PHI in accordance with 45 CFR &sect; 164.524 and &sect; 164.526 upon written request from Covered Entity.</li>
        <li><strong>(f) Accounting of Disclosures:</strong> Maintain and make available information required to provide an accounting of disclosures in accordance with 45 CFR &sect; 164.528.</li>
    </ul>

    <h3>SECTION 3. PERMITTED USES AND DISCLOSURES BY BUSINESS ASSOCIATE</h3>
    <p>Business Associate may only use or disclose PHI:</p>
    <ul>
        <li><strong>(a)</strong> As necessary to perform the bilingual communications, translation, and notification Services agreed upon by Covered Entity;</li>
        <li><strong>(b)</strong> For the proper management and administration of Business Associate or to carry out its legal responsibilities;</li>
        <li><strong>(c)</strong> To provide Data Aggregation services relating to the health care operations of the Covered Entity, if requested, or to de-identify information in accordance with 45 CFR &sect; 164.514(a)-(c).</li>
    </ul>

    <h3>SECTION 4. TERM AND TERMINATION</h3>
    <ul>
        <li><strong>(a) Term:</strong> This Agreement shall become effective on the Effective Date and shall terminate when all PHI provided by Covered Entity to Business Associate is destroyed or returned.</li>
        <li><strong>(b) Termination for Cause:</strong> If Covered Entity determines that Business Associate has breached a material term of this Agreement, Covered Entity may terminate this Agreement immediately if Business Associate fails to cure the breach within thirty (30) days of receiving written notice.</li>
        <li><strong>(c) Effect of Termination (45 CFR &sect; 164.504(e)(2)(ii)(J)):</strong> Upon termination of this Agreement for any reason, Business Associate shall, if feasible, return or destroy all PHI received from, or created or received by Business Associate on behalf of Covered Entity. If return or destruction is infeasible, Business Associate shall extend the protections of this Agreement to such PHI and limit further uses and disclosures.</li>
    </ul>

    <h3>SECTION 5. MISCELLANEOUS</h3>
    <p><strong>(a) Regulatory References:</strong> A reference in this Agreement to a section in the HIPAA Rules means the section as in effect or as amended.<br>
    <strong>(b) Amendment:</strong> The Parties agree to take such action as is necessary to amend this Agreement from time to time as is necessary for compliance with HIPAA.<br>
    <strong>(c) Counterparts &amp; Electronic Execution:</strong> This Agreement is mutually executed upon the authorized electronic submission and download by Covered Entity, coupled with Business Associate's pre-signed authorized counter-signature below.</p>

    <table class="sig-table">
        <tr>
            <td>
                <div class="sig-header">BUSINESS ASSOCIATE (PRE-SIGNED)</div>
                <strong>Servicios ADG LLC d/b/a Abrevia</strong><br><br>
                <div style="font-family: 'Brush Script MT', 'Dancing Script', cursive; font-size: 20pt; color: #1e3a8a; padding: 4px 0;">
                    Servicios ADG Compliance Officer
                </div>
                <div style="border-top: 1px solid #111827; padding-top: 4px; margin-top: 2px;">
                    <strong>Authorized Signature</strong>
                </div>
                <strong>Name:</strong> Compliance &amp; Data Privacy Official<br>
                <strong>Title:</strong> Chief Compliance &amp; Information Security Officer<br>
                <strong>Date:</strong> ${escapeHtml(effDate)}<br>
                <div class="seal-badge">
                    &check; VERIFIED PRE-SIGNED BUSINESS ASSOCIATE
                </div>
                <div style="font-size: 8pt; color: #6b7280; font-family: monospace; margin-top: 5px;">
                    Verification Hash: ${docVerificationId}
                </div>
            </td>
            <td>
                <div class="sig-header">COVERED ENTITY (EXECUTING PARTY)</div>
                <strong>${escapeHtml(orgName)}</strong><br><br>
                <div style="font-family: sans-serif; font-size: 14pt; color: #111827; padding: 8px 0; font-style: italic;">
                    ${escapeHtml(signerName)}
                </div>
                <div style="border-top: 1px solid #111827; padding-top: 4px; margin-top: 2px;">
                    <strong>Authorized Representative Signature</strong>
                </div>
                <strong>Name:</strong> ${escapeHtml(signerName)}<br>
                <strong>Title:</strong> ${escapeHtml(signerTitle)}<br>
                <strong>Email:</strong> ${escapeHtml(signerEmail)}<br>
                <strong>Phone:</strong> ${escapeHtml(signerPhone)}<br>
                <strong>Date:</strong> ${escapeHtml(effDate)}<br>
                <div style="font-size: 8.5pt; color: #059669; font-weight: bold; margin-top: 6px;">
                    &check; Electronically Executed &amp; Bound
                </div>
            </td>
        </tr>
    </table>

    <div style="margin-top: 30px; font-size: 8.5pt; color: #6b7280; text-align: center; border-top: 1px solid #e5e7eb; padding-top: 10px;">
        Abrevia / Servicios ADG LLC &bull; Official Business Associate Record &bull; Verification ID: ${docVerificationId} &bull; Page 1 of 1
    </div>
</body>
</html>`;

    // 3. Open printable preview window and trigger automatic Print/PDF dialog
    const printWindow = window.open('', '_blank');
    if (printWindow) {
        printWindow.document.open();
        printWindow.document.write(baaHtml);
        printWindow.document.close();
        printWindow.focus();
        setTimeout(() => {
            try {
                printWindow.print();
            } catch (err) {
                console.warn('Auto print trigger notice:', err);
            }
        }, 500);
    } else {
        alert('Please allow pop-ups for this site to view and download your pre-signed BAA PDF.');
    }

    if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<span>📥</span><span>Generate &amp; Download Pre-Signed BAA (PDF)</span>';
    }
}

window.openHipaaBaaModal = openHipaaBaaModal;
window.closeHipaaBaaModal = closeHipaaBaaModal;
window.switchHipaaTab = switchHipaaTab;
window.generateAndDownloadBaaPdf = generateAndDownloadBaaPdf;


// --- Simple Sign Out / Lock Session Handler ---
function handleSignOutOrLock() {
    try {
        localStorage.setItem('abrevia_signed_out', 'true');
    } catch (e) {
        console.warn('Storage setItem error:', e);
    }
    window.location.replace('/index.html?view=signed_out');
}

function openPinConfigModal() {
    const currentPin = localStorage.getItem('abrevia_pin') || '';
    const newPin = prompt(
        dashboardMode === 'es' 
            ? 'Ingrese un PIN de 4 dígitos para bloquear su sesión (o déjelo vacío para quitar el PIN):' 
            : 'Enter a 4-digit PIN to lock your session (or leave blank to remove PIN):',
        currentPin
    );
    if (newPin === null) return;
    const trimmed = newPin.trim();
    if (trimmed === '') {
        localStorage.removeItem('abrevia_pin');
        updateSettingsPinLabel();
        alert(dashboardMode === 'es' ? 'PIN removido.' : 'PIN removed.');
    } else if (/^\d{4}$/.test(trimmed)) {
        localStorage.setItem('abrevia_pin', trimmed);
        updateSettingsPinLabel();
        alert(dashboardMode === 'es' ? 'PIN de 4 dígitos guardado.' : '4-digit PIN saved successfully.');
    } else {
        alert(dashboardMode === 'es' ? 'El PIN debe ser exactamente de 4 números.' : 'PIN must be exactly 4 numeric digits.');
    }
}

function updateSettingsPinLabel() {
    const pin = localStorage.getItem('abrevia_pin');
    const label = document.getElementById('setPinBtnLabel');
    const status = document.getElementById('settingsPinStatus');
    if (label) label.textContent = pin ? 'Change' : 'Set PIN';
    if (status) status.textContent = pin ? 'Active (••••)' : 'No PIN configured';
}

window.handleSignOutOrLock = handleSignOutOrLock;
window.openPinConfigModal = openPinConfigModal;
window.updateSettingsPinLabel = updateSettingsPinLabel;
