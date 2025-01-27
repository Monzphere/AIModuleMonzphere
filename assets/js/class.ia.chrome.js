document.addEventListener('DOMContentLoaded', () => {
    class IAChrome {
        constructor() {
            this.CSRF_TOKEN_NAME = '_csrf_token';
            this.form = this.findFormWithCsrfToken();
            this.init();
            this.initAISession();
        }

        findFormWithCsrfToken() {
            
            const tokenInput = document.querySelector(`input[name="${this.CSRF_TOKEN_NAME}"]`);
            if (tokenInput) {
                
                this.csrfToken = tokenInput.value;
                return tokenInput.closest('form');
            }

            
            for (let form of document.forms) {
                if (form[this.CSRF_TOKEN_NAME]) {
                    this.csrfToken = form[this.CSRF_TOKEN_NAME].value;
                    return form;
                }
            }

            
            const cookies = document.cookie.split(';');
            for (let cookie of cookies) {
                const [name, value] = cookie.trim().split('=');
                if (name === this.CSRF_TOKEN_NAME) {
                    this.csrfToken = value;
                    return null;
                }
            }

            return null;
        }

        init() {
            
            this.addAISuggestionButtons();
            
            
            const observer = new MutationObserver((mutations) => {
                mutations.forEach((mutation) => {
                    if (mutation.target.classList && 
                        (mutation.target.classList.contains('flickerfreescreen') ||
                         mutation.target.classList.contains('list-table') ||
                         mutation.target.tagName === 'TBODY')) {
                        this.addAISuggestionButtons();
                    }
                });
            });

            
            observer.observe(document.body, {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: ['class', 'style']
            });

            
            document.addEventListener('zbx_reload', () => {
                this.addAISuggestionButtons();
            });
        }

        async initAISession() {
            try {
          
                
                if (typeof ai === 'undefined') {
                    console.error('AI API not available');
                    return;
                }

                this.aiSession = await ai.languageModel.create({
                    systemPrompt: "You are a highly efficient IT support assistant. " +
                                "Always provide extremely brief, technical responses. " +
                                "Use minimal words, focus on key points only. " +
                                "Never elaborate or add unnecessary details.",
                    language: "en-US"
                });
                
         
            } catch (error) {
                console.error('Failed to initialize AI session:', error);
            }
        }

        addAISuggestionButtons() {
            const flickerfreescreen = document.querySelector('.flickerfreescreen');
            if (!flickerfreescreen) return;

            const tables = flickerfreescreen.querySelectorAll('table.list-table');
            tables.forEach(table => {
                const tbody = table.querySelector('tbody');
                if (!tbody) return;

                const rows = tbody.querySelectorAll('tr:not(.timeline-axis):not(.timeline-td)');
                rows.forEach(row => {
                    
                    const problemLink = row.querySelector('a[data-menu-popup*="triggerid"]');
                    if (!problemLink || problemLink.nextElementSibling?.classList?.contains('js-ai-suggest')) {
                        return;
                    }

                    
                    const hostElement = row.querySelector('[data-menu-popup*="hostid"]');
                    const triggerElement = problemLink;
                    
                    let hostid = null;
                    let triggerid = null;

                    if (hostElement) {
                        try {
                            const hostData = JSON.parse(hostElement.getAttribute('data-menu-popup'));
                            hostid = hostData.data.hostid;
                        } catch (e) {
                            console.warn('Erro ao parsear hostid:', e);
                        }
                    }

                    if (triggerElement) {
                        try {
                            const triggerData = JSON.parse(triggerElement.getAttribute('data-menu-popup'));
                            triggerid = triggerData.data.triggerid;
                        } catch (e) {
                            console.warn('Erro ao parsear triggerid:', e);
                        }
                    }

                    
                    const button = document.createElement('button');
                    button.type = 'button';
                    button.className = 'btn-alt js-ai-suggest';
                    button.innerHTML = '<i class="fas fa-robot"></i> AI';
                    button.style.marginLeft = '8px';
                    button.style.padding = '1px 3px';
                    button.style.fontSize = '0.85em';
                    
                    
                    problemLink.parentNode.insertBefore(button, problemLink.nextSibling);

                    button.addEventListener('click', () => {
                        if (hostid && triggerid) {
                            this.showAISuggestionModal(triggerElement, hostid, triggerid);
                        } else {
                            this.showMessage(t('Could not find host or trigger information'), false);
                        }
                    });
                });
            });
        }

        async showAISuggestionModal(problemLink, hostid, triggerid) {
           
            const problemText = problemLink.textContent.trim();
            
            try {
                
                const modalContent = `
                    <div class="iachrome-modal" style="
                        width: 800px;
                        height: calc(90vh - 100px); /* 90% da altura da viewport menos espaço para o cabeçalho */
                        display: flex;
                        flex-direction: column;
                    ">
                        <div class="iachrome-content" style="
                            display: flex;
                            flex-direction: column;
                            height: 100%; /* Ocupa toda a altura disponível */
                        ">
                            <div class="iachrome-problem" style="
                                padding: 8px 12px;
                                border-bottom: 1px solid #ddd;
                                background: #f8f9fa;
                                display: flex;
                                justify-content: space-between;
                                align-items: center;
                                flex-shrink: 0; /* Impede que este elemento encolha */
                            ">
                                <div>
                                    <strong style="color: #1e4c82;">Problem:</strong> ${problemText}
                                </div>
                                <button type="button" class="btn-alt js-export-pdf" style="
                                    padding: 4px 8px;
                                    font-size: 12px;
                                    margin-left: 10px;
                                    visibility: hidden;
                                ">
                                    <i class="fas fa-file-pdf"></i> PDF
                                </button>
                            </div>
                            <div class="iachrome-result" style="
                                padding: 12px;
                                flex-grow: 1; /* Ocupa o espaço restante */
                                overflow-y: auto; /* Adiciona scroll vertical quando necessário */
                                height: 100%; /* Usa toda a altura disponível */
                            ">
                                <div class="iachrome-text" style="
                                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                                    line-height: 1.5;
                                ">
                                    <div class="iachrome-loading">
                                        <i class="fas fa-circle-notch fa-spin"></i> Analyzing problem...
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                `;

                
                overlayDialogue({
                    'title': 'AI Analysis',
                    'content': modalContent,
                    'class': 'modal-popup iachrome-dialogue',
                    'buttons': [{
                        'title': t('Export as Post-Mortem'),
                        'class': 'btn-alt js-export-pdf',
                        'action': async () => {
                            try {

                                
                                
                                const dialogueBody = document.querySelector('.overlay-dialogue-body');

                                
                                const modalElements = {
                                    modal: document.querySelector('[data-dialogueid="aiSuggestionModal"]'),
                                    content: document.querySelector('.iachrome-content'),
                                    response: document.querySelector('.iachrome-response'),
                                    stats: document.querySelector('.iachrome-stats'),
                                    result: document.querySelector('.iachrome-result')
                                };


                                const content = modalElements.response;
                                if (!content) {
                                    throw new Error('Content not found - Missing iachrome-response element');
                                }

                                
                                const pdfContent = document.createElement('div');
                                pdfContent.innerHTML = `
                                    <div style="padding: 20px; font-family: Arial, sans-serif;">
                                        <h2 style="color: #1e4c82; margin-bottom: 20px;">Post-Mortem Report</h2>
                                        
                                        <div style="margin-bottom: 20px;">
                                            <strong>Device:</strong> ${this.lastAnalysisData.host} (${this.lastAnalysisData.hostip})<br>
                                            <strong>Problem:</strong> ${problemText}<br>
                                            <strong>Date:</strong> ${new Date().toLocaleString()}
                                        </div>

                                        ${content.innerHTML}

                                        <div style="
                                            margin-top: 30px;
                                            padding-top: 15px;
                                            border-top: 1px solid #dee2e6;
                                            text-align: center;
                                            color: #666;
                                            font-size: 12px;
                                        ">
                                            Developed by Monzphere.com
                                        </div>
                                    </div>
                                `;

                                
                                document.body.appendChild(pdfContent);

                                
                                if (typeof html2pdf === 'undefined') {
                                    await this.loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js');
                                }

                                
                                const opt = {
                                    margin: [0.5, 0.5],
                                    filename: `postmortem_${this.lastAnalysisData.host}_${new Date().toISOString().slice(0,10)}.pdf`,
                                    image: { type: 'jpeg', quality: 0.98 },
                                    html2canvas: { 
                                        scale: 2,
                                        useCORS: true,
                                        logging: true
                                    },
                                    jsPDF: { 
                                        unit: 'in', 
                                        format: 'letter', 
                                        orientation: 'portrait'
                                    },
                                    enableLinks: false,
                                    pagebreak: { mode: 'avoid-all' },
                                    autoPaging: true,
                                    html2canvas: {
                                        allowTaint: true,
                                        useCORS: true,
                                        logging: false 
                                    }
                                };

                                
                                await html2pdf()
                                    .set(opt)
                                    .from(pdfContent)
                                    .save()
                                    .then(() => {
                                        document.body.removeChild(pdfContent);
                                        this.showMessage('PDF generated successfully', true);
                                    });
                            } catch (error) {
                                console.error('PDF generation failed:', error);
                                console.error('Error details:', {
                                    message: error.message,
                                    stack: error.stack,
                                    type: error.constructor.name
                                });
                                this.showMessage('Failed to generate PDF: ' + error.message, false);
                            }
                        }
                    }, {
                        'title': t('Close'),
                        'class': 'btn-alt js-close',
                        'action': function() {}
                    }],
                    'dialogueid': 'aiSuggestionModal'
                });

                const modalElement = document.querySelector('[data-dialogueid="aiSuggestionModal"]');
                if (modalElement) {
                    modalElement.classList.add('iachrome-modal-wrapper');
                    modalElement.style.position = 'fixed';
                    modalElement.style.top = '50%';
                    modalElement.style.left = '50%';
                    modalElement.style.transform = 'translate(-50%, -50%)';

                    
                    const exportBtn = modalElement.querySelector('.js-export-pdf');
                    if (exportBtn) {
                        exportBtn.onclick = () => {
                            if (this.lastAnalysisData) {
                                this.exportToPDF(problemText, this.lastAnalysisData);
                            } else {
                                this.showMessage('No data available for PDF export', false);
                            }
                        };
                    }
                }

                try {
                    const formData = new URLSearchParams();
                    formData.append('hostid', hostid.toString());
                    formData.append('triggerid', triggerid.toString());
                    const response = await fetch('zabbix.php?action=iachrome.list', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/x-www-form-urlencoded',
                            'Accept': 'application/json'
                        },
                        body: formData.toString()
                    });



                    const responseText = await response.text();


                    
                    if (!responseText.trim()) {
                        throw new Error('Empty response from server');
                    }

                    let data;
                    try {
                        data = JSON.parse(responseText);

                    } catch (parseError) {
                        console.error('JSON Parse Error:', parseError);
                        console.error('Failed to parse response text:', responseText);
                        throw new Error(`Server returned invalid JSON: ${responseText.substring(0, 100)}...`);
                    }
                    
                    if (data.success) {

                        
                        this.lastAnalysisData = data.data;
                        
                        
                        await this.getAISuggestion(problemText, data.data);

                        
                        const exportBtn = modalElement.querySelector('.js-export-pdf');
                        if (exportBtn) {
                            exportBtn.style.visibility = 'visible';
                        }
                    } else {
                        console.error('API returned error:', data.error);
                        throw new Error(data.error?.messages?.[0] || 'Failed to get Zabbix data');
                    }
                } catch (error) {
                    console.error('API error details:', {
                        error,
                        message: error.message,
                        stack: error.stack,
                        type: error.constructor.name
                    });
                    this.showMessage(`Failed to get AI suggestions: ${error.message}`, false);
                }
            } catch (error) {
                console.error('Modal error details:', {
                    error,
                    message: error.message,
                    stack: error.stack,
                    type: error.constructor.name
                });
                this.showMessage('Failed to analyze problem. Please try again.', false);
            }
        }

        async getAISuggestion(problemText, zabbixData) {
            try {
                if (!this.aiSession) {
                    await this.initAISession();
                }

                if (!this.aiSession) {
                    throw new Error('AI session is not available');
                }

                const resultDiv = document.querySelector('.iachrome-text');
                const currentStats = zabbixData.current_month.stats;
                const prevStats = zabbixData.previous_month.stats;

                
                resultDiv.innerHTML = `
                    <div class="iachrome-response">
                        <!-- Estatísticas -->
                        <div class="iachrome-stats" style="
                            margin-bottom: 15px;
                            padding: 10px;
                            background: #f8f9fa;
                            border-radius: 4px;
                            border-left: 3px solid #1e4c82;
                        ">
                            <div style="margin-bottom: 10px;">
                                <strong style="color: #1e4c82;">Current Month (${zabbixData.current_month.period}):</strong>
                                <div style="margin-left: 10px;">
                                    • Total Problems: ${currentStats.total_problems}<br>
                                    • Average Resolution: ${currentStats.avg_resolution_time}h<br>
                                    • Acknowledgment Rate: ${currentStats.ack_percentage}%
                                </div>
                            </div>
                            <div>
                                <strong style="color: #1e4c82;">Previous Month (${zabbixData.previous_month.period}):</strong>
                                <div style="margin-left: 10px;">
                                    • Total Problems: ${prevStats.total_problems}<br>
                                    • Average Resolution: ${prevStats.avg_resolution_time}h<br>
                                    • Acknowledgment Rate: ${prevStats.ack_percentage}%
                                </div>
                            </div>
                        </div>

                        <!-- Gráfico -->
                        <div class="iachrome-chart" style="
                            margin: 15px 0;
                            padding: 10px;
                            background: white;
                            border-radius: 4px;
                            border: 1px solid #dee2e6;
                        ">
                            <div id="trigger-chart" style="width: 100%; height: 300px;">
                                <img src="chart.php?itemids%5B0%5D=${zabbixData.itemid}&from=now-24h&to=now&type=0&width=750&height=300&_=${new Date().getTime()}" 
                                style="width: 100%; height: 100%; object-fit: contain;"
                                alt="Trigger Chart">
                            </div>
                        </div>

                        <!-- Loading para a análise da IA -->
                        <div class="iachrome-loading">
                            <i class="fas fa-circle-notch fa-spin"></i> Analyzing problem...
                        </div>
                    </div>`;

                
                const formatAcks = (stats) => {
                    if (stats.acks && stats.acks.length > 0) {
                        return stats.acks.map(ack => 
                            `• ${new Date(ack.event_time * 1000).toLocaleString()}: ${ack.username} - "${ack.message}"`
                        ).join('\n');
                    }
                    return 'No acknowledgments';
                };

                const prompt = `[SYSTEM: RESPOND ONLY IN ENGLISH. DO NOT USE ANY OTHER LANGUAGE UNDER ANY CIRCUMSTANCES]
[CONTEXT: You are an IT infrastructure specialist analyzing a network/system alert]

INCIDENT DETAILS
---------------
Host: ${zabbixData.host}
IP: ${zabbixData.hostip}
Alert: ${problemText}

STATISTICS
----------
Current Month (${zabbixData.current_month.period}):
• Problems: ${currentStats.total_problems}
• Avg Resolution: ${currentStats.avg_resolution_time}h
• Ack Rate: ${currentStats.ack_percentage}%
${formatAcks(currentStats)}

Previous Month (${zabbixData.previous_month.period}):
• Problems: ${prevStats.total_problems}
• Avg Resolution: ${prevStats.avg_resolution_time}h
• Ack Rate: ${prevStats.ack_percentage}%
${formatAcks(prevStats)}

[REQUIRED FORMAT - USE ENGLISH ONLY]

Issue Summary:
[Brief technical description]

Impact Assessment:
• Severity: [High/Medium/Low]
• Affected Services
• Business Impact

Debug Commands:
[Suggest network/system diagnostic commands like ping, traceroute, netstat, tcpdump, etc. 
Focus on troubleshooting commands that help identify the root cause. 
Do not include Zabbix-specific commands.]

Resolution Steps:
[Step-by-step technical solution focusing on network/system fixes]

Prevention:
• [Short-term action]
• [Long-term improvement]

[END INSTRUCTION]
Keep response technical and concise. Use English only.Focus on network/system diagnostic commands.`;

                const stream = this.aiSession.promptStreaming(prompt);
                let fullResponse = '';
                let previousChunk = '';

                for await (const chunk of stream) {
                    if (chunk.includes(previousChunk)) {
                        fullResponse = chunk;
                    } else {
                        fullResponse += chunk;
                    }
                    previousChunk = chunk;
                    
                    const formattedResponse = fullResponse
                        .replace(/\*\*/g, '')
                        .replace(/\n/g, '<br>')
                        .replace(/\s+/g, ' ')
                        
                        .replace(/^\d+\.\s*/gm, '')
                        
                        .replace(/Issue Summary:|Impact Assessment:|Debug Commands:|Resolution Steps:|Prevention:/gi, 
                            (match) => `<strong style="color: #1e4c82; display: block; margin-top: 12px; margin-bottom: 8px;">${match}</strong>`)
                        .replace(/•/g, '◆')
                        
                        .replace(/\d+\.\s+([^\n<]+)/g, '<div style="margin: 4px 0;">$1</div>')
                        
                        .replace(/\$ (.*?)(?=<br|$)/g, 
                            '<code style="display: block; background: #f5f7f9; padding: 6px 10px; border-radius: 4px; margin: 4px 0; font-family: monospace; border-left: 3px solid #1e4c82;">$1</code>')
                        .trim();

                    resultDiv.innerHTML = `
                        <div class="iachrome-response">
                            <div class="iachrome-stats" style="
                                margin-bottom: 15px;
                                padding: 10px;
                                background: #f8f9fa;
                                border-radius: 4px;
                                border-left: 3px solid #1e4c82;
                            ">
                                <div style="margin-bottom: 10px;">
                                    <strong style="color: #1e4c82;">Current Month (${zabbixData.current_month.period}):</strong>
                                    <div style="margin-left: 10px;">
                                        • Total Problems: ${currentStats.total_problems}<br>
                                        • Average Resolution: ${currentStats.avg_resolution_time}h<br>
                                        • Acknowledgment Rate: ${currentStats.ack_percentage}%
                                        ${currentStats.acks.length > 0 ? `
                                            <div style="margin-top: 5px; padding-top: 5px; border-top: 1px solid #dee2e6;">
                                                <strong>Acknowledgments:</strong><br>
                                                ${currentStats.acks.map(ack => `
                                                    <div style="margin-left: 10px; margin-top: 3px;">
                                                        • ${new Date(ack.event_time * 1000).toLocaleString()}<br>
                                                        <span style="margin-left: 15px;">By: ${ack.username}</span><br>
                                                        <span style="margin-left: 15px;">Message: ${ack.message}</span>
                                                    </div>
                                                `).join('')}
                                            </div>
                                        ` : ''}
                                    </div>
                                </div>
                                <div>
                                    <strong style="color: #1e4c82;">Previous Month (${zabbixData.previous_month.period}):</strong>
                                    <div style="margin-left: 10px;">
                                        • Total Problems: ${prevStats.total_problems}<br>
                                        • Average Resolution: ${prevStats.avg_resolution_time}h<br>
                                        • Acknowledgment Rate: ${prevStats.ack_percentage}%
                                        ${prevStats.acks.length > 0 ? `
                                            <div style="margin-top: 5px; padding-top: 5px; border-top: 1px solid #dee2e6;">
                                                <strong>Acknowledgments:</strong><br>
                                                ${prevStats.acks.map(ack => `
                                                    <div style="margin-left: 10px; margin-top: 3px;">
                                                        • ${new Date(ack.event_time * 1000).toLocaleString()}<br>
                                                        <span style="margin-left: 15px;">By: ${ack.username}</span><br>
                                                        <span style="margin-left: 15px;">Message: ${ack.message}</span>
                                                    </div>
                                                `).join('')}
                                            </div>
                                        ` : ''}
                                    </div>
                                </div>
                            </div>
                            <div class="iachrome-chart" style="
                                margin: 15px 0;
                                padding: 10px;
                                background: white;
                                border-radius: 4px;
                                border: 1px solid #dee2e6;
                            ">
                                <div id="trigger-chart" style="width: 100%; height: 300px;">
                                    <img src="chart.php?itemids%5B0%5D=${zabbixData.itemid}&from=now-24h&to=now&type=0&width=750&height=300&_=${new Date().getTime()}" 
                                    style="width: 100%; height: 100%; object-fit: contain;"
                                    alt="Trigger Chart">
                                </div>
                            </div>
                            <div style="padding: 0 4px;">
                                ${formattedResponse}
                            </div>
                        </div>`;
                }
            } catch (error) {
                console.error('AI error:', error);
                const resultDiv = document.querySelector('.iachrome-text');
                resultDiv.innerHTML = `
                    <div class="iachrome-error" style="
                        padding: 15px;
                        background: #fff3f3;
                        border-radius: 4px;
                        color: #666;
                    ">
                        <div style="margin-bottom: 15px;">
                            <strong style="color: #e53e3e; font-size: 1.1em;">Chrome AI is not available</strong>
                        </div>
                        
                        <div style="margin-bottom: 15px; line-height: 1.5;">
                            To use this feature, you need:
                            <ol style="margin-top: 10px; padding-left: 20px;">
                                <li style="margin-bottom: 8px;">Chrome Canary version 128.0.6545.0 or above</li>
                                <li style="margin-bottom: 8px;">Enable these flags in chrome:
                                    <ul style="margin-top: 5px; padding-left: 20px;">
                                        <li style="margin-bottom: 5px;">
                                            <code style="background: #f0f0f0; padding: 2px 5px; border-radius: 3px;">
                                                #optimization-guide-on-device-model
                                            </code> → Select "Enabled BypassPerfRequirement"
                                        </li>
                                        <li style="margin-bottom: 5px;">
                                            <code style="background: #f0f0f0; padding: 2px 5px; border-radius: 3px;">
                                                #prompt-api-for-gemini-nano
                                            </code> → Select "Enabled"
                                        </li>
                                    </ul>
                                </li>
                                <li style="margin-bottom: 8px;">
                                    <strong>Important:</strong> Relaunch Chrome after enabling each flag
                                </li>
                            </ol>
                        </div>

                        <div style="
                            margin-top: 15px;
                            padding-top: 10px;
                            border-top: 1px solid #ffcdd2;
                            font-size: 0.9em;
                            color: #999;
                        ">
                            Error details: ${error.message}
                        </div>
                    </div>`;
            }
        }

        async exportToPDF(problemText, zabbixData) {
            try {

                
                
                if (typeof html2pdf === 'undefined') {
 
                    try {
                        await this.loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js');

                        
                        if (typeof html2pdf === 'undefined') {
                            console.error('html2pdf not found after loading script');
                            throw new Error('Failed to load html2pdf.js library');
                        }
                    } catch (loadError) {
                        console.error('Error loading html2pdf.js:', loadError);
                        throw loadError;
                    }
                } else {

                }
                
                
                const modalElement = document.body.querySelector('[data-dialogueid="aiSuggestionModal"]');

                
                if (!modalElement) {
                    throw new Error('Modal not found. Please ensure the modal is open.');
                }

                const content = modalElement.querySelector('.iachrome-response');

                
                if (!content) {
                    throw new Error('Content not found in modal');
                }


                
                const pdfContent = document.createElement('div');
                pdfContent.innerHTML = `
                    <div style="padding: 20px; font-family: Arial, sans-serif;">
                        <h2 style="color: #1e4c82; margin-bottom: 20px;">Post-Mortem Report</h2>
                        
                        <div style="margin-bottom: 20px;">
                            <strong>Device:</strong> ${zabbixData.host} (${zabbixData.hostip})<br>
                            <strong>Problem:</strong> ${problemText}<br>
                            <strong>Date:</strong> ${new Date().toLocaleString()}
                        </div>

                        ${content.innerHTML}

                        <div style="
                            margin-top: 30px;
                            padding-top: 15px;
                            border-top: 1px solid #dee2e6;
                            text-align: center;
                            color: #666;
                            font-size: 12px;
                        ">
                            Developed by Monzphere.com
                        </div>
                    </div>
                `;

                
                document.body.appendChild(pdfContent);


                const opt = {
                    margin: [0.5, 0.5],
                    filename: `postmortem_${zabbixData.host}_${new Date().toISOString().slice(0,10)}.pdf`,
                    image: { type: 'jpeg', quality: 0.98 },
                    html2canvas: { 
                        scale: 2,
                        useCORS: true,
                        logging: true
                    },
                    jsPDF: { 
                        unit: 'in', 
                        format: 'letter', 
                        orientation: 'portrait'
                    },
                    enableLinks: false,
                    pagebreak: { mode: 'avoid-all' },
                    autoPaging: true,
                    html2canvas: {
                        allowTaint: true,
                        useCORS: true,
                        logging: false 
                    }
                };

                try {

                    const pdfInstance = html2pdf().set(opt);

                    
                    await pdfInstance.from(pdfContent).save();

                    this.showMessage('PDF generated successfully', true);
                } catch (pdfError) {
                    console.error('PDF generation error:', pdfError);
                    throw pdfError;
                } finally {

                    document.body.removeChild(pdfContent);
                }

            } catch (error) {
                console.error('Export error:', error);
                this.showMessage('Failed to export PDF: ' + error.message, false);
            }
        }

        
        loadScript(url) {
            return new Promise((resolve, reject) => {

                
                if (document.querySelector(`script[src="${url}"]`)) {

                    resolve();
                    return;
                }

                const script = document.createElement('script');
                script.type = 'text/javascript';
                script.src = url;
                
                script.onload = () => {

                    resolve();
                };
                
                script.onerror = (err) => {
                    console.error('Script load error:', err);
                    reject(new Error(`Failed to load script: ${url}`));
                };
                

                document.head.appendChild(script);
            });
        }

        showMessage(message, success = true) {
            if (typeof window.messages !== 'undefined') {
                if (success) {
                    window.messages.addSuccess(message);
                } else {
                    window.messages.addError(message);
                }
            } else {
                alert(message);
            }
        }
    }

    new IAChrome();
}); 