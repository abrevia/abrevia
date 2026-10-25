document.addEventListener("DOMContentLoaded", () => {
    const chatForm = document.getElementById("chatForm");
    const messageInput = document.getElementById("messageInput");
    const chatFeed = document.getElementById("chatFeed");
    const purgeBtn = document.getElementById("purgeBtn");

    // Función de sanitización del lado del cliente (ZDR)
    function sanitizeMessage(text) {
        // Enmascarar números de teléfono comunes
        let sanitized = text.replace(/(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g, "[TELÉFONO]");
        // Enmascarar correos electrónicos
        sanitized = sanitized.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, "[EMAIL]");
        // Enmascarar secuencias numéricas largas (IDs o cuentas)
        sanitized = sanitized.replace(/\b\d{6,12}\b/g, "[ID_PROTEGIDO]");
        return sanitized;
    }

    // Agregar mensaje al feed visual
    function appendMessage(sender, text, isIncoming = false) {
        const messageRow = document.createElement("div");
        messageRow.className = `flex flex-col ${isIncoming ? "items-start" : "items-end"} mb-4`;

        const bubble = document.createElement("div");
        bubble.className = `max-w-md px-4 py-3 rounded-2xl text-sm ${
            isIncoming
                ? "bg-slate-800 text-slate-200 border border-slate-700 rounded-bl-none"
                : "bg-blue-600 text-white rounded-br-none"
        }`;

        const senderLabel = document.createElement("span");
        senderLabel.className = "text-[10px] block opacity-75 mb-1 font-semibold uppercase tracking-wider";
        senderLabel.textContent = sender;

        const messageText = document.createElement("p");
        messageText.className = "leading-relaxed break-words";
        messageText.textContent = text;

        bubble.appendChild(senderLabel);
        bubble.appendChild(messageText);
        messageRow.appendChild(bubble);
        chatFeed.appendChild(messageRow);

        // Desplazamiento automático hacia abajo
        chatFeed.scrollTop = chatFeed.scrollHeight;
    }

    // Evento de envío del formulario
    if (chatForm) {
        chatForm.addEventListener("submit", (e) => {
            e.preventDefault();
            const rawText = messageInput.value.trim();

            if (!rawText) return;

            // Paso 1: Sanitización inmediata en memoria local
            const safeText = sanitizeMessage(rawText);

            // Paso 2: Renderizar mensaje del operador
            appendMessage("Operador", safeText, false);
            messageInput.value = "";

            // Paso 3: Simulación de respuesta bilingüe entrante (sin persistencia en disco)
            setTimeout(() => {
                appendMessage("Cliente (SMS)", "Mensaje recibido correctamente bajo protocolo ZDR.", true);
            }, 1000);
        });
    }

    // Acción para purgar la sesión
    if (purgeBtn) {
        purgeBtn.addEventListener("click", () => {
            chatFeed.innerHTML = `
                <div class="text-center">
                    <span class="bg-slate-800/80 text-slate-400 text-[11px] px-3 py-1 rounded-full border border-slate-700/50">
                        Protocolo ZDR activo: memoria purgada
                    </span>
                </div>
            `;
        });
    }
});