class ChatApp {
    constructor() {
        this.responseContainer = document.getElementById('responseContainer');
        this.form = document.getElementById('promptForm');
        this.sendBtn = document.getElementById('sendBtn');
        this.cancelBtn = document.getElementById('cancelBtn');
        this.resetBtn = document.getElementById('resetBtn');
        this.promptInput = document.getElementById('prompt');
        this.themeSwitch = document.querySelector('.theme-switch');
        
        this.controller = null;
        this.messageHistory = JSON.parse(localStorage.getItem('messageHistory')) || [];
        
        this.initializeTheme();
        this.initializeEventListeners();
        this.renderHistory();
    }

    initializeTheme() {
        // Check for saved theme preference or system preference
        const savedTheme = localStorage.getItem('theme');
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        
        // Set initial theme
        const initialTheme = savedTheme || (prefersDark ? 'dark' : 'light');
        this.applyTheme(initialTheme);

        // Listen for system theme changes
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
            if (!localStorage.getItem('theme')) {
                this.applyTheme(e.matches ? 'dark' : 'light');
            }
        });
    }

    applyTheme(theme) {
        // Update data-theme attributes
        document.documentElement.setAttribute('data-theme', theme);
        this.themeSwitch.setAttribute('data-theme', theme);
        
        // Switch syntax highlighting theme
        document.querySelectorAll('link[data-theme]').forEach(stylesheet => {
            stylesheet.disabled = stylesheet.getAttribute('data-theme') !== theme;
        });
        
        // Reapply syntax highlighting to all code blocks
        document.querySelectorAll('pre code').forEach(block => {
            hljs.highlightElement(block);
        });
    }

    initializeEventListeners() {
        this.form.addEventListener('submit', this.handleSubmit.bind(this));
        this.cancelBtn.addEventListener('click', this.handleCancel.bind(this));
        this.resetBtn.addEventListener('click', this.clearHistory.bind(this));
        this.promptInput.addEventListener('keydown', this.handleKeydown.bind(this));
        this.themeSwitch.addEventListener('click', this.toggleTheme.bind(this));
    }

    toggleTheme() {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        
        this.applyTheme(newTheme);
        localStorage.setItem('theme', newTheme);
    }

    saveHistory() {
        localStorage.setItem('messageHistory', JSON.stringify(this.messageHistory));
    }

    clearHistory() {
        this.messageHistory = [];
        localStorage.removeItem('messageHistory');
        this.responseContainer.innerHTML = '<em>🧼 Conversation reset.</em>';
    }

    escapeHtml(text) {
        return text
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    convertMarkdownToHTML(text) {
        if (!text) return '';
        
        let html = text;

        // First handle code blocks
        html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (match, lang, code) => {
            return `<pre><code class="language-${lang}">${this.escapeHtml(code)}</code></pre>`;
        });

        // Split into lines while preserving code blocks
        const lines = html.split('\n');
        let inCodeBlock = false;
        let listItems = [];
        let formattedLines = [];

        for (let line of lines) {
            // Skip processing if we're in a code block
            if (line.includes('<pre><code')) {
                inCodeBlock = true;
                formattedLines.push(line);
                continue;
            }
            if (line.includes('</code></pre>')) {
                inCodeBlock = false;
                formattedLines.push(line);
                continue;
            }
            if (inCodeBlock) {
                formattedLines.push(line);
                continue;
            }

            // Handle lists
            if (line.match(/^\d+\.\s+/) || line.match(/^[-*]\s+/)) {
                listItems.push(line);
            } else {
                // If we have list items, format them before adding non-list content
                if (listItems.length > 0) {
                    const isOrdered = listItems[0].match(/^\d+\.\s+/);
                    const listHtml = listItems
                        .map(item => {
                            const content = item.replace(/(?:\d+\.|[-*])\s+/, '');
                            return `<li>${content}</li>`;
                        })
                        .join('');
                    formattedLines.push(`<${isOrdered ? 'ol' : 'ul'}>${listHtml}</${isOrdered ? 'ol' : 'ul'}>`);
                    listItems = [];
                }

                // Handle regular lines
                if (line.trim()) {
                    formattedLines.push(`<p>${line}</p>`);
                }
            }
        }

        // Handle any remaining list items
        if (listItems.length > 0) {
            const isOrdered = listItems[0].match(/^\d+\.\s+/);
            const listHtml = listItems
                .map(item => {
                    const content = item.replace(/(?:\d+\.|[-*])\s+/, '');
                    return `<li>${content}</li>`;
                })
                .join('');
            formattedLines.push(`<${isOrdered ? 'ol' : 'ul'}>${listHtml}</${isOrdered ? 'ol' : 'ul'}>`);
        }

        return formattedLines.join('\n');
    }

    addMessage(role, content) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${role}`;
        messageDiv.innerHTML = this.convertMarkdownToHTML(content);
        this.responseContainer.appendChild(messageDiv);

        messageDiv.querySelectorAll('pre code').forEach((block) => {
            hljs.highlightElement(block);
        });

        this.responseContainer.scrollTop = this.responseContainer.scrollHeight;
    }

    renderHistory() {
        this.responseContainer.innerHTML = '';
        this.messageHistory.forEach(msg => {
            this.addMessage(msg.role, msg.content);
        });
    }

    async handleSubmit(e) {
        e.preventDefault();
        if (this.controller) return;

        const userInput = this.promptInput.value.trim();
        if (!userInput) return;

        this.messageHistory.push({ role: 'user', content: userInput });
        this.saveHistory();
        this.addMessage('user', userInput);

        const maxHistory = 6;
        const recentHistory = this.messageHistory.slice(-maxHistory);
        const systemPrompt = `You are a helpful assistant. When you respond, do NOT include "Assistant:" or "User:" labels, just provide the answer.\n\n`;
        const compiledPrompt = systemPrompt + recentHistory
            .map(msg => msg.content)
            .join('\n\n') + '\n';

        this.controller = new AbortController();
        const signal = this.controller.signal;

        this.sendBtn.disabled = true;
        this.cancelBtn.style.display = 'inline-block';
        this.promptInput.value = '';

        let assistantMessageDiv = null;
        let buffer = '';
        let fullAssistantResponse = '';

        try {
            const res = await fetch('/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt: compiledPrompt }),
                signal,
            });

            if (!res.ok) {
                throw new Error(`HTTP error! status: ${res.status}`);
            }

            const reader = res.body.getReader();
            const decoder = new TextDecoder();

            while (true) {
                const { value, done } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });
                const lines = chunk.split('\n').filter(line => line.trim());
                
                for (const line of lines) {
                    try {
                        const jsonResponse = JSON.parse(line);
                        if (jsonResponse.response) {
                            buffer += jsonResponse.response;
                            fullAssistantResponse += jsonResponse.response;

                            if (!assistantMessageDiv) {
                                assistantMessageDiv = document.createElement('div');
                                assistantMessageDiv.className = 'message assistant';
                                this.responseContainer.appendChild(assistantMessageDiv);
                            }

                            assistantMessageDiv.innerHTML = this.convertMarkdownToHTML(buffer);
                            assistantMessageDiv.querySelectorAll('pre code').forEach((block) => {
                                hljs.highlightElement(block);
                            });

                            this.responseContainer.scrollTop = this.responseContainer.scrollHeight;
                        }
                    } catch (e) {
                        console.error('Error parsing line:', e);
                        continue;
                    }
                }
            }

            if (fullAssistantResponse) {
                this.messageHistory.push({
                    role: 'assistant',
                    content: fullAssistantResponse.trim()
                });
                this.saveHistory();
            }

        } catch (err) {
            const errorMsg = err.name === 'AbortError'
                ? '⛔️ Generation canceled.'
                : 'Error: ' + this.escapeHtml(err.message);
            this.addMessage('assistant', errorMsg);
        } finally {
            this.controller = null;
            this.sendBtn.disabled = false;
            this.cancelBtn.style.display = 'none';
        }
    }

    handleCancel() {
        if (this.controller) {
            this.controller.abort();
        }
    }

    handleKeydown(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            this.form.dispatchEvent(new Event('submit'));
        }
    }
}

// Initialize the app when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new ChatApp();
});
