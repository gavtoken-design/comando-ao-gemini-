/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { GoogleGenAI } from '@google/genai';
import hljs from 'highlight.js';

interface Source {
  uri: string;
  title: string;
}

interface HistoryItem {
  id: string;
  prompt: string;
  response: string;
  sources?: Source[];
  timestamp: number;
}

function initApp() {
  const elements = {
    output: document.getElementById('output'),
    status: document.getElementById('status'),
    form: document.getElementById('prompt-form') as HTMLFormElement,
    input: document.getElementById('prompt-input') as HTMLTextAreaElement,
    sendBtn: document.getElementById('send-btn') as HTMLButtonElement,
    historyList: document.getElementById('history-list'),
    newChatBtn: document.getElementById('new-chat-btn'),
    clearAllBtn: document.getElementById('clear-all-btn'),
    mobileMenuBtn: document.getElementById('mobile-menu-btn'),
    sidebar: document.getElementById('sidebar'),
    overlay: document.getElementById('sidebar-overlay'),
    sourcesContainer: document.getElementById('sources-container'),
    sourcesList: document.getElementById('sources-list'),
    modelSelect: document.getElementById('model-select') as HTMLSelectElement,
  };

  if (Object.values(elements).some(el => !el)) return;

  let history: HistoryItem[] = JSON.parse(localStorage.getItem('gemini_chat_history') || '[]');
  let currentViewedId: string | null = null;

  // Renderização e Navegação
  function renderHistoryList() {
    if (!elements.historyList) return;
    if (history.length === 0) {
      elements.historyList.innerHTML = '<p class="history-empty">Nenhum chat anterior</p>';
      return;
    }

    elements.historyList.innerHTML = '';
    const sorted = [...history].sort((a, b) => b.timestamp - a.timestamp);

    sorted.forEach(item => {
      const container = document.createElement('div');
      container.className = `history-item-container ${currentViewedId === item.id ? 'active' : ''}`;
      
      const btn = document.createElement('button');
      btn.className = 'history-item';
      btn.textContent = item.prompt;
      btn.onclick = () => viewHistoryItem(item.id);

      const delBtn = document.createElement('button');
      delBtn.className = 'delete-btn';
      delBtn.innerHTML = '✕';
      delBtn.onclick = (e) => {
        e.stopPropagation();
        deleteHistoryItem(item.id);
      };

      container.appendChild(btn);
      container.appendChild(delBtn);
      elements.historyList!.appendChild(container);
    });
  }

  function applyHighlighting() {
    elements.output?.querySelectorAll('pre code').forEach((block) => {
      hljs.highlightElement(block as HTMLElement);
    });
  }

  function viewHistoryItem(id: string) {
    const item = history.find(h => h.id === id);
    if (item && elements.output) {
      currentViewedId = id;
      elements.output.innerHTML = `<div style="margin-bottom: 20px; opacity: 0.6; font-size: 0.9rem;"><strong>Pergunta:</strong> ${item.prompt}</div>${formatMarkdown(item.response)}`;
      
      applyHighlighting();

      if (item.sources && item.sources.length > 0) {
        showSources(item.sources);
      } else {
        elements.sourcesContainer!.classList.add('hidden');
      }

      elements.status!.textContent = 'Visualizando Arquivo';
      closeSidebar();
      renderHistoryList();
    }
  }

  function deleteHistoryItem(id: string) {
    history = history.filter(h => h.id !== id);
    localStorage.setItem('gemini_chat_history', JSON.stringify(history));
    if (currentViewedId === id) resetUI();
    renderHistoryList();
  }

  function clearAllHistory() {
    if (confirm('Tem certeza que deseja apagar todo o histórico?')) {
      history = [];
      localStorage.removeItem('gemini_chat_history');
      resetUI();
      renderHistoryList();
    }
  }

  function resetUI() {
    currentViewedId = null;
    elements.output!.innerHTML = '<p class="placeholder">Olá! Como posso ajudar você hoje?</p>';
    elements.sourcesContainer!.classList.add('hidden');
    elements.status!.textContent = 'Pronto';
  }

  // Markdown básico (negrito e blocos de código com linguagem)
  function formatMarkdown(text: string): string {
    return text
      .replace(/```(\w+)?\n?([\s\S]*?)```/g, (_, lang, code) => {
        const languageClass = lang ? ` class="language-${lang}"` : '';
        return `<pre><code${languageClass}>${code.trim()}</code></pre>`;
      })
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\n/g, '<br>');
  }

  function showSources(sources: Source[]) {
    elements.sourcesList!.innerHTML = '';
    sources.forEach(s => {
      const li = document.createElement('li');
      const a = document.createElement('a');
      a.href = s.uri;
      a.target = '_blank';
      a.textContent = s.title || 'Ver Fonte';
      li.appendChild(a);
      elements.sourcesList!.appendChild(li);
    });
    elements.sourcesContainer!.classList.remove('hidden');
  }

  // Sidebar Mobile
  function toggleSidebar() {
    elements.sidebar!.classList.toggle('open');
    elements.overlay!.classList.toggle('hidden');
  }

  function closeSidebar() {
    elements.sidebar!.classList.remove('open');
    elements.overlay!.classList.add('hidden');
  }

  // Event Listeners
  elements.mobileMenuBtn!.onclick = toggleSidebar;
  elements.overlay!.onclick = closeSidebar;
  elements.clearAllBtn!.onclick = clearAllHistory;
  elements.newChatBtn!.onclick = resetUI;

  elements.input!.oninput = () => {
    elements.input!.style.height = 'auto';
    elements.input!.style.height = Math.min(elements.input!.scrollHeight, 250) + 'px';
  };

  elements.form.onsubmit = async (e) => {
    e.preventDefault();
    const prompt = elements.input!.value.trim();
    if (!prompt) return;

    const selectedModel = elements.modelSelect.value;

    currentViewedId = null;
    elements.input!.value = '';
    elements.input!.style.height = 'auto';
    elements.output!.textContent = '';
    elements.sourcesContainer!.classList.add('hidden');
    elements.status!.textContent = 'Processando...';
    elements.sendBtn!.disabled = true;

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: selectedModel,
        contents: prompt,
        config: {
          tools: [{ googleSearch: {} }]
        }
      });

      const text = response.text || '';
      elements.output!.innerHTML = formatMarkdown(text);
      
      applyHighlighting();
      
      // Extrair fontes se houver busca do Google
      const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
      const sources: Source[] = [];
      if (chunks) {
        chunks.forEach((chunk: any) => {
          if (chunk.web) {
            sources.push({ uri: chunk.web.uri, title: chunk.web.title });
          }
        });
      }

      if (sources.length > 0) showSources(sources);

      // Salvar
      const newItem: HistoryItem = {
        id: Date.now().toString(),
        prompt,
        response: text,
        sources: sources.length > 0 ? sources : undefined,
        timestamp: Date.now()
      };
      history.push(newItem);
      localStorage.setItem('gemini_chat_history', JSON.stringify(history));
      
      elements.status!.textContent = 'Concluído';
      renderHistoryList();
    } catch (error) {
      console.error(error);
      elements.output!.innerHTML = `<span style="color: var(--danger-color);">Erro ao processar com o modelo selecionado. Tente novamente.</span>`;
      elements.status!.textContent = 'Falha';
    } finally {
      elements.sendBtn!.disabled = false;
    }
  };

  renderHistoryList();
}

initApp();