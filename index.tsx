/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { GoogleGenAI } from '@google/genai';

interface HistoryItem {
  id: string;
  prompt: string;
  response: string;
  timestamp: number;
}

function initApp() {
  const outputElement = document.getElementById('output');
  const statusElement = document.getElementById('status');
  const promptForm = document.getElementById('prompt-form') as HTMLFormElement;
  const promptInput = document.getElementById('prompt-input') as HTMLTextAreaElement;
  const sendBtn = document.getElementById('send-btn') as HTMLButtonElement;
  const historyListElement = document.getElementById('history-list');
  const newChatBtn = document.getElementById('new-chat-btn');

  if (!outputElement || !statusElement || !promptForm || !promptInput || !sendBtn || !historyListElement || !newChatBtn) return;

  let history: HistoryItem[] = JSON.parse(localStorage.getItem('gemini_chat_history') || '[]');
  let currentViewedId: string | null = null;

  // Renderiza o histórico inicial
  renderHistoryList();

  function renderHistoryList() {
    if (!historyListElement) return;

    if (history.length === 0) {
      historyListElement.innerHTML = '<p class="history-empty">Nenhum chat anterior</p>';
      return;
    }

    historyListElement.innerHTML = '';
    
    // Ordena por data decrescente
    const sortedHistory = [...history].sort((a, b) => b.timestamp - a.timestamp);

    sortedHistory.forEach(item => {
      const btn = document.createElement('button');
      btn.className = `history-item ${currentViewedId === item.id ? 'active' : ''}`;
      btn.textContent = item.prompt.length > 30 ? item.prompt.substring(0, 30) + '...' : item.prompt;
      btn.title = item.prompt;
      btn.onclick = () => viewHistoryItem(item.id);
      historyListElement.appendChild(btn);
    });
  }

  function viewHistoryItem(id: string) {
    const item = history.find(h => h.id === id);
    if (item && outputElement) {
      currentViewedId = id;
      outputElement.innerHTML = `<div style="margin-bottom: 24px; padding-bottom: 12px; border-bottom: 1px solid var(--border-color); opacity: 0.8;"><small>Pergunta:</small><br/><strong>${item.prompt}</strong></div>${item.response}`;
      statusElement!.textContent = 'Visualizando Arquivo';
      renderHistoryList();
    }
  }

  function saveToHistory(prompt: string, response: string) {
    const newItem: HistoryItem = {
      id: Date.now().toString(),
      prompt,
      response,
      timestamp: Date.now()
    };
    history.push(newItem);
    localStorage.setItem('gemini_chat_history', JSON.stringify(history));
    renderHistoryList();
  }

  newChatBtn.onclick = () => {
    currentViewedId = null;
    outputElement.innerHTML = '<p class="placeholder">Digite um comando abaixo para iniciar uma conversa...</p>';
    promptInput.value = '';
    promptInput.focus();
    statusElement.textContent = 'Pronto';
    renderHistoryList();
  };

  // Redimensionamento automático do textarea
  promptInput.addEventListener('input', () => {
    promptInput.style.height = 'auto';
    promptInput.style.height = Math.min(promptInput.scrollHeight, 150) + 'px';
  });

  // Atalho de teclado (Enter para enviar)
  promptInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      promptForm.requestSubmit();
    }
  });

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault();
    const prompt = promptInput.value.trim();
    if (!prompt) return;

    currentViewedId = null;
    promptInput.value = '';
    promptInput.style.height = 'auto';
    outputElement.textContent = '';
    statusElement.textContent = 'Pensando...';
    sendBtn.disabled = true;

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

      const streamResponse = await ai.models.generateContentStream({
        model: 'gemini-3-flash-preview',
        contents: prompt,
      });

      statusElement.textContent = 'Gerando...';

      let fullText = '';
      for await (const chunk of streamResponse) {
        if (chunk.text) {
          fullText += chunk.text;
          outputElement.textContent = fullText;
          outputElement.scrollTop = outputElement.scrollHeight;
        }
      }

      statusElement.textContent = 'Concluído';
      saveToHistory(prompt, fullText);
    } catch (error) {
      console.error('Erro na API Gemini:', error);
      outputElement.innerHTML = `<span style="color: #ef4444;">Erro: ${error instanceof Error ? error.message : 'Erro desconhecido'}</span>`;
      statusElement.textContent = 'Falhou';
    } finally {
      sendBtn.disabled = false;
    }
  }

  promptForm.addEventListener('submit', handleSubmit);
}

initApp();