/* ==========================================================================
   APP STATE
   ========================================================================== */
let state = {
  conversations: [],
  currentId: null,
  isGenerating: false,
  ollamaStatus: { online: false, modelExists: false }
};

// DOM Elements
const sidebarPanel = document.getElementById('sidebar-panel');
const newChatBtn = document.getElementById('new-chat-btn');
const statusCard = document.getElementById('status-card');
const statusDot = document.getElementById('status-dot');
const statusText = document.getElementById('status-text');
const statusDetails = document.getElementById('status-details');
const ollamaHelp = document.getElementById('ollama-help');

const languageSelect = document.getElementById('language-select');
const difficultySelect = document.getElementById('difficulty-select');
const modelSelect = document.getElementById('model-select');
const cpModeCheckbox = document.getElementById('cp-mode');
const dpModeCheckbox = document.getElementById('dp-mode');
const graphModeCheckbox = document.getElementById('graph-mode');
const bsModeCheckbox = document.getElementById('bs-mode');

const badgeLang = document.getElementById('badge-lang');
const badgeDiff = document.getElementById('badge-diff');
const badgeCp = document.getElementById('badge-cp');
const badgeDp = document.getElementById('badge-dp');
const badgeGraph = document.getElementById('badge-graph');
const badgeBs = document.getElementById('badge-bs');

const historyList = document.getElementById('history-list');
const historyEmpty = document.getElementById('history-empty');
const clearHistoryBtn = document.getElementById('clear-history-btn');

const messagesContainer = document.getElementById('messages-container');
const welcomeScreen = document.getElementById('welcome-screen');
const typingIndicator = document.getElementById('typing-indicator');

const chatTextarea = document.getElementById('chat-textarea');
const sendBtn = document.getElementById('send-btn');
const exportChatBtn = document.getElementById('export-chat-btn');
const clearChatBtn = document.getElementById('clear-chat-btn');
const charCounter = document.getElementById('char-counter');

/* ==========================================================================
   INIT & CONFIGURATION
   ========================================================================== */
document.addEventListener('DOMContentLoaded', () => {
  setupMarked();
  loadStateFromStorage();
  checkOllamaStatus();
  registerEventListeners();
  updateUIForCurrentConversation();
});

// Configure Marked.js Options
function setupMarked() {
  if (typeof marked !== 'undefined') {
    const renderer = new marked.Renderer();
    
    // Custom renderer for code blocks to add copy buttons and formatting wrappers
    renderer.code = function(code, language) {
      const validLang = language || 'txt';
      const escapedCode = code
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
        
      return `
        <div class="code-block-wrapper">
          <button class="code-copy-btn" onclick="copyCodeBlock(this)">
            <i data-lucide="copy" style="width: 12px; height: 12px;"></i> Copy
          </button>
          <pre class="line-numbers"><code class="language-${validLang}">${escapedCode}</code></pre>
        </div>
      `;
    };

    marked.setOptions({
      renderer: renderer,
      highlight: function(code, lang) {
        if (typeof Prism !== 'undefined' && Prism.languages[lang]) {
          return Prism.highlight(code, Prism.languages[lang], lang);
        }
        return code;
      },
      pedantic: false,
      gfm: true,
      breaks: true,
      sanitize: false,
      smartypants: false,
      xhtml: false
    });
  }
}

// Check if Ollama is online and model exists
async function checkOllamaStatus() {
  try {
    const res = await fetch('/api/status');
    const data = await res.json();
    state.ollamaStatus = data;

    if (data.online) {
      populateModelSelect(data.availableModels);
      
      // Update details to show current selected model
      const currentModel = modelSelect ? modelSelect.value : 'gemma3:4b';
      const selectedModelExists = data.availableModels && data.availableModels.includes(currentModel);

      if (selectedModelExists) {
        statusDot.className = 'status-dot online';
        statusText.innerText = 'Tutor Online';
        statusDetails.innerText = `Connected to Ollama (${currentModel})`;
        ollamaHelp.classList.add('hidden');
      } else {
        statusDot.className = 'status-dot warning';
        statusText.innerText = 'Model Missing';
        statusDetails.innerText = `Connected, but model "${currentModel}" not found.`;
        ollamaHelp.classList.remove('hidden');
      }
    } else {
      statusDot.className = 'status-dot offline';
      statusText.innerText = 'Tutor Offline';
      statusDetails.innerText = data.error || 'Ollama service is unreachable.';
      ollamaHelp.classList.remove('hidden');
    }
  } catch (err) {
    statusDot.className = 'status-dot offline';
    statusText.innerText = 'Connection Error';
    statusDetails.innerText = 'Could not contact server API.';
    ollamaHelp.classList.remove('hidden');
  }
  lucide.createIcons();
}

function populateModelSelect(availableModels) {
  if (!modelSelect) return;
  
  // Save currently selected model value to restore if possible
  const prevVal = modelSelect.value || localStorage.getItem('dsa_tutor_last_selected_model');
  
  modelSelect.innerHTML = '';
  
  if (!availableModels || availableModels.length === 0) {
    const opt = document.createElement('option');
    opt.value = 'gemma3:4b';
    opt.innerText = 'gemma3:4b (Default)';
    modelSelect.appendChild(opt);
    return;
  }
  
  availableModels.forEach(modelName => {
    const opt = document.createElement('option');
    opt.value = modelName;
    opt.innerText = modelName;
    if (modelName === prevVal) {
      opt.selected = true;
    } else if (!prevVal && (modelName === 'gemma3:4b' || modelName.startsWith('gemma3:4b:'))) {
      opt.selected = true;
    }
    modelSelect.appendChild(opt);
  });
  
  if (modelSelect.selectedIndex === -1 && modelSelect.options.length > 0) {
    modelSelect.selectedIndex = 0;
  }
  
  updateBadges();
}

/* ==========================================================================
   STATE & PERSISTENCE
   ========================================================================== */
function loadStateFromStorage() {
  const storedConversations = localStorage.getItem('dsa_tutor_conversations');
  const storedCurrentId = localStorage.getItem('dsa_tutor_current_id');
  
  if (storedConversations) {
    state.conversations = JSON.parse(storedConversations);
  }
  if (storedCurrentId) {
    state.currentId = storedCurrentId;
  }
  
  // Load settings from currently active conversation, or apply defaults
  const active = getActiveConversation();
  if (active && active.settings) {
    applySettingsToUI(active.settings);
  } else {
    // Default system state load
    const savedDefaults = localStorage.getItem('dsa_tutor_default_settings');
    if (savedDefaults) {
      applySettingsToUI(JSON.parse(savedDefaults));
    }
  }
  
  renderHistory();
}

function saveStateToStorage() {
  localStorage.setItem('dsa_tutor_conversations', JSON.stringify(state.conversations));
  localStorage.setItem('dsa_tutor_current_id', state.currentId || '');
  
  // Also save active settings as default for future new chats
  const activeSettings = getActiveSettingsFromUI();
  localStorage.setItem('dsa_tutor_default_settings', JSON.stringify(activeSettings));
}

function getActiveConversation() {
  return state.conversations.find(c => c.id === state.currentId) || null;
}

function getActiveSettingsFromUI() {
  return {
    language: languageSelect.value,
    difficulty: difficultySelect.value,
    model: modelSelect ? modelSelect.value : 'gemma3:4b',
    competitive: cpModeCheckbox.checked,
    dp: dpModeCheckbox.checked,
    graph: graphModeCheckbox.checked,
    binarySearch: bsModeCheckbox.checked
  };
}

function applySettingsToUI(settings) {
  languageSelect.value = settings.language || 'C++';
  difficultySelect.value = settings.difficulty || 'Intermediate';
  
  if (modelSelect && settings.model) {
    // Add to option list if not there
    let optionExists = Array.from(modelSelect.options).some(opt => opt.value === settings.model);
    if (!optionExists) {
      const opt = document.createElement('option');
      opt.value = settings.model;
      opt.innerText = settings.model;
      modelSelect.appendChild(opt);
    }
    modelSelect.value = settings.model;
    localStorage.setItem('dsa_tutor_last_selected_model', settings.model);
  }
  
  cpModeCheckbox.checked = !!settings.competitive;
  dpModeCheckbox.checked = !!settings.dp;
  graphModeCheckbox.checked = !!settings.graph;
  bsModeCheckbox.checked = !!settings.binarySearch;
  
  updateBadges();
}

/* ==========================================================================
   UI RENDERING
   ========================================================================== */
function updateBadges() {
  badgeLang.innerText = languageSelect.value;
  badgeDiff.innerText = difficultySelect.value;
  
  badgeCp.classList.toggle('hidden', !cpModeCheckbox.checked);
  badgeDp.classList.toggle('hidden', !dpModeCheckbox.checked);
  badgeGraph.classList.toggle('hidden', !graphModeCheckbox.checked);
  badgeBs.classList.toggle('hidden', !bsModeCheckbox.checked);
  
  const footerModelName = document.getElementById('footer-model-name');
  if (footerModelName && modelSelect) {
    footerModelName.innerText = modelSelect.value;
  }
}

function renderHistory() {
  historyList.innerHTML = '';
  
  if (state.conversations.length === 0) {
    historyEmpty.classList.remove('hidden');
    return;
  }
  
  historyEmpty.classList.add('hidden');
  
  state.conversations.forEach(conv => {
    const item = document.createElement('div');
    item.className = `history-item ${conv.id === state.currentId ? 'active' : ''}`;
    item.setAttribute('data-id', conv.id);
    
    item.innerHTML = `
      <div class="history-item-content">
        <i data-lucide="message-square"></i>
        <div class="history-item-title">${escapeHTML(conv.title)}</div>
      </div>
      <button class="history-item-delete" title="Delete conversation">
        <i data-lucide="x"></i>
      </button>
    `;
    
    // Switch chat listener
    item.addEventListener('click', (e) => {
      if (e.target.closest('.history-item-delete')) {
        e.stopPropagation();
        deleteConversation(conv.id);
      } else {
        selectConversation(conv.id);
      }
    });
    
    historyList.appendChild(item);
  });
  
  lucide.createIcons();
}

function updateUIForCurrentConversation() {
  const active = getActiveConversation();
  
  // Toggle welcome screen
  if (!active || active.messages.length === 0) {
    welcomeScreen.classList.remove('hidden');
    messagesContainer.innerHTML = '';
    // Let messages container be blank but ensure the welcome screen is appended
    messagesContainer.appendChild(welcomeScreen);
    
    exportChatBtn.disabled = true;
    clearChatBtn.disabled = true;
  } else {
    welcomeScreen.classList.add('hidden');
    messagesContainer.innerHTML = '';
    
    active.messages.forEach(msg => {
      appendMessageToDOM(msg.role, msg.content);
    });
    
    exportChatBtn.disabled = false;
    clearChatBtn.disabled = false;
    
    // Apply conversation settings to UI settings
    if (active.settings) {
      applySettingsToUI(active.settings);
    }
  }
  
  // Highlight code blocks
  if (typeof Prism !== 'undefined') {
    Prism.highlightAllUnder(messagesContainer);
  }
  
  scrollToBottom();
  renderHistory();
}

function appendMessageToDOM(role, content) {
  const wrapper = document.createElement('div');
  wrapper.className = `message-wrapper ${role}`;
  
  const avatar = document.createElement('div');
  avatar.className = 'msg-avatar';
  avatar.innerHTML = role === 'user' 
    ? '<i data-lucide="user"></i>' 
    : '<i data-lucide="bot"></i>';
    
  const bubble = document.createElement('div');
  bubble.className = 'msg-bubble';
  
  if (role === 'user') {
    bubble.innerText = content;
  } else {
    bubble.innerHTML = marked.parse(content);
  }
  
  const meta = document.createElement('div');
  meta.className = 'msg-meta';
  
  const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  meta.innerHTML = `<span>${time}</span>`;
  
  if (role === 'assistant') {
    const copyTextBtn = document.createElement('button');
    copyTextBtn.className = 'msg-action-btn';
    copyTextBtn.innerHTML = '<i data-lucide="copy" style="width: 11px; height: 11px;"></i> Copy Markdown';
    copyTextBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(content).then(() => {
        copyTextBtn.innerHTML = '<i data-lucide="check" style="width: 11px; height: 11px;"></i> Copied!';
        setTimeout(() => {
          copyTextBtn.innerHTML = '<i data-lucide="copy" style="width: 11px; height: 11px;"></i> Copy Markdown';
          lucide.createIcons();
        }, 2000);
        lucide.createIcons();
      });
    });
    meta.appendChild(copyTextBtn);
  }
  
  wrapper.appendChild(avatar);
  wrapper.appendChild(bubble);
  bubble.appendChild(meta);
  
  messagesContainer.appendChild(wrapper);
  lucide.createIcons();
}

function scrollToBottom() {
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

/* ==========================================================================
   CONVERSATION ACTIONS
   ========================================================================== */
function createNewConversation(initialMessageText = '') {
  const id = 'conv_' + Date.now();
  const title = initialMessageText 
    ? (initialMessageText.length > 28 ? initialMessageText.substring(0, 28) + '...' : initialMessageText)
    : 'New Algorithmic Query';
    
  const newConv = {
    id,
    title,
    messages: [],
    settings: getActiveSettingsFromUI()
  };
  
  state.conversations.unshift(newConv);
  state.currentId = id;
  saveStateToStorage();
  updateUIForCurrentConversation();
  return newConv;
}

function selectConversation(id) {
  state.currentId = id;
  saveStateToStorage();
  updateUIForCurrentConversation();
}

function deleteConversation(id) {
  state.conversations = state.conversations.filter(c => c.id !== id);
  if (state.currentId === id) {
    state.currentId = state.conversations.length > 0 ? state.conversations[0].id : null;
  }
  saveStateToStorage();
  updateUIForCurrentConversation();
}

function clearActiveChat() {
  const active = getActiveConversation();
  if (active) {
    active.messages = [];
    saveStateToStorage();
    updateUIForCurrentConversation();
  }
}

function clearAllHistory() {
  if (confirm('Are you sure you want to clear all chat history?')) {
    state.conversations = [];
    state.currentId = null;
    saveStateToStorage();
    updateUIForCurrentConversation();
  }
}

function exportCurrentChat() {
  const active = getActiveConversation();
  if (!active || active.messages.length === 0) return;
  
  let mdContent = `# DSA Tutor Session: ${active.title}\n\n`;
  mdContent += `*Language: ${active.settings.language} | Difficulty: ${active.settings.difficulty}*\n`;
  mdContent += `*Date: ${new Date().toLocaleDateString()}*\n\n---\n\n`;
  
  active.messages.forEach(msg => {
    const roleTitle = msg.role === 'user' ? '### User' : '### Master DSA Tutor';
    mdContent += `${roleTitle}\n\n${msg.content}\n\n---\n\n`;
  });
  
  const blob = new Blob([mdContent], { type: 'text/markdown;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', `dsa_session_${active.id}.md`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/* ==========================================================================
   STREAM CHAT SUBMISSION
   ========================================================================== */
async function submitUserMessage() {
  const text = chatTextarea.value.trim();
  if (!text || state.isGenerating) return;
  
  // Reset input fields
  chatTextarea.value = '';
  chatTextarea.style.height = 'auto';
  charCounter.innerText = '0 characters';
  
  let active = getActiveConversation();
  
  // If no active session, create a new one
  if (!active || active.messages.length === 0) {
    active = createNewConversation(text);
  }
  
  // Save active settings to the current conversation context
  active.settings = getActiveSettingsFromUI();
  
  // Add message
  active.messages.push({ role: 'user', content: text });
  saveStateToStorage();
  
  // Render
  appendMessageToDOM('user', text);
  scrollToBottom();
  
  // Initialize response container for streaming
  state.isGenerating = true;
  toggleInputState(true);
  typingIndicator.classList.remove('hidden');
  scrollToBottom();
  
  // Create assistant message block in DOM
  const aiWrapper = document.createElement('div');
  aiWrapper.className = 'message-wrapper assistant';
  
  const aiAvatar = document.createElement('div');
  aiAvatar.className = 'msg-avatar';
  aiAvatar.innerHTML = '<i data-lucide="bot"></i>';
  
  const aiBubble = document.createElement('div');
  aiBubble.className = 'msg-bubble';
  aiBubble.innerHTML = '<p class="typing-placeholder">Generating pedagogical guide...</p>';
  
  const aiMeta = document.createElement('div');
  aiMeta.className = 'msg-meta';
  const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  aiMeta.innerHTML = `<span>${time}</span>`;
  
  aiWrapper.appendChild(aiAvatar);
  aiWrapper.appendChild(aiBubble);
  aiBubble.appendChild(aiMeta);
  
  messagesContainer.appendChild(aiWrapper);
  lucide.createIcons();
  scrollToBottom();
  
  let fullResponseText = '';
  
  try {
    const chatPayload = {
      messages: active.messages,
      settings: active.settings
    };
    
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(chatPayload)
    });
    
    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error || `HTTP error! Status: ${response.status}`);
    }
    
    typingIndicator.classList.add('hidden');
    
    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    
    let buffer = '';
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      
      // Keep the last incomplete line in the buffer
      buffer = lines.pop();
      
      for (const line of lines) {
        if (!line.trim()) continue;
        
        try {
          const parsed = JSON.parse(line);
          if (parsed.message && parsed.message.content) {
            fullResponseText += parsed.message.content;
            
            // Format and update innerHTML using marked
            aiBubble.innerHTML = marked.parse(fullResponseText);
            
            // Re-append meta tag
            aiBubble.appendChild(aiMeta);
            
            // Scroll along
            scrollToBottom();
          }
        } catch (e) {
          // JSON parse error on incomplete streams - ignore and wait
        }
      }
    }
    
    // Process remaining buffer
    if (buffer.trim()) {
      try {
        const parsed = JSON.parse(buffer);
        if (parsed.message && parsed.message.content) {
          fullResponseText += parsed.message.content;
          aiBubble.innerHTML = marked.parse(fullResponseText);
          aiBubble.appendChild(aiMeta);
        }
      } catch (e) {}
    }
    
    // Final render triggers Prism highlighting
    aiBubble.innerHTML = marked.parse(fullResponseText);
    
    // Create Copy Markdown Button
    const copyTextBtn = document.createElement('button');
    copyTextBtn.className = 'msg-action-btn';
    copyTextBtn.innerHTML = '<i data-lucide="copy" style="width: 11px; height: 11px;"></i> Copy Markdown';
    copyTextBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(fullResponseText).then(() => {
        copyTextBtn.innerHTML = '<i data-lucide="check" style="width: 11px; height: 11px;"></i> Copied!';
        setTimeout(() => {
          copyTextBtn.innerHTML = '<i data-lucide="copy" style="width: 11px; height: 11px;"></i> Copy Markdown';
          lucide.createIcons();
        }, 2000);
        lucide.createIcons();
      });
    });
    aiMeta.appendChild(copyTextBtn);
    aiBubble.appendChild(aiMeta);
    
    if (typeof Prism !== 'undefined') {
      Prism.highlightAllUnder(aiBubble);
    }
    lucide.createIcons();
    scrollToBottom();
    
    // Save generated response in history
    active.messages.push({ role: 'assistant', content: fullResponseText });
    
    // Rename chat title if it's default to match the context
    if (active.title === 'New Algorithmic Query' && active.messages[0]) {
      const promptText = active.messages[0].content;
      active.title = promptText.length > 28 ? promptText.substring(0, 28) + '...' : promptText;
    }
    
    saveStateToStorage();
    renderHistory();
    
  } catch (error) {
    console.error(error);
    typingIndicator.classList.add('hidden');
    
    const errorMsg = document.createElement('p');
    errorMsg.className = 'error-text';
    errorMsg.style.color = 'hsl(var(--accent-error))';
    errorMsg.innerHTML = `<i data-lucide="alert-triangle" style="display:inline-block; vertical-align:middle; margin-right:6px; width:16px;"></i> Failed to get response: ${error.message}`;
    aiBubble.appendChild(errorMsg);
    lucide.createIcons();
    scrollToBottom();
  } finally {
    state.isGenerating = false;
    toggleInputState(false);
    exportChatBtn.disabled = active.messages.length === 0;
    clearChatBtn.disabled = active.messages.length === 0;
  }
}

function toggleInputState(disabled) {
  chatTextarea.disabled = disabled;
  sendBtn.disabled = disabled;
  newChatBtn.disabled = disabled;
  languageSelect.disabled = disabled;
  difficultySelect.disabled = disabled;
  if (modelSelect) modelSelect.disabled = disabled;
  cpModeCheckbox.disabled = disabled;
  dpModeCheckbox.disabled = disabled;
  graphModeCheckbox.disabled = disabled;
  bsModeCheckbox.disabled = disabled;
  
  if (disabled) {
    sendBtn.style.opacity = '0.5';
    sendBtn.style.cursor = 'not-allowed';
  } else {
    sendBtn.style.opacity = '1';
    sendBtn.style.cursor = 'pointer';
  }
}

/* ==========================================================================
   EVENT LISTENERS & HELPERS
   ========================================================================== */
function registerEventListeners() {
  // Input triggers
  chatTextarea.addEventListener('input', () => {
    // Auto-grow textarea height
    chatTextarea.style.height = 'auto';
    chatTextarea.style.height = (chatTextarea.scrollHeight - 16) + 'px';
    
    const charLen = chatTextarea.value.length;
    charCounter.innerText = `${charLen} character${charLen !== 1 ? 's' : ''}`;
  });
  
  chatTextarea.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submitUserMessage();
    }
  });
  
  sendBtn.addEventListener('click', submitUserMessage);
  
  // Configurations update badges immediately
  languageSelect.addEventListener('change', () => {
    updateBadges();
    updateActiveConversationSettings();
  });
  difficultySelect.addEventListener('change', () => {
    updateBadges();
    updateActiveConversationSettings();
  });
  if (modelSelect) {
    modelSelect.addEventListener('change', () => {
      localStorage.setItem('dsa_tutor_last_selected_model', modelSelect.value);
      
      // Update the status indicator details and online/warning state dynamically based on newly selected model
      if (state.ollamaStatus && state.ollamaStatus.online) {
        const selectedModelExists = state.ollamaStatus.availableModels && state.ollamaStatus.availableModels.includes(modelSelect.value);
        if (selectedModelExists) {
          statusDot.className = 'status-dot online';
          statusText.innerText = 'Tutor Online';
          statusDetails.innerText = `Connected to Ollama (${modelSelect.value})`;
          ollamaHelp.classList.add('hidden');
        } else {
          statusDot.className = 'status-dot warning';
          statusText.innerText = 'Model Missing';
          statusDetails.innerText = `Connected, but model "${modelSelect.value}" not found.`;
          ollamaHelp.classList.remove('hidden');
        }
      }
      
      updateBadges();
      updateActiveConversationSettings();
    });
  }
  [cpModeCheckbox, dpModeCheckbox, graphModeCheckbox, bsModeCheckbox].forEach(cb => {
    cb.addEventListener('change', () => {
      updateBadges();
      updateActiveConversationSettings();
    });
  });
  
  // Action buttons
  newChatBtn.addEventListener('click', () => {
    // Create new blank chat
    createNewConversation();
  });
  
  clearChatBtn.addEventListener('click', clearActiveChat);
  clearHistoryBtn.addEventListener('click', clearAllHistory);
  exportChatBtn.addEventListener('click', exportCurrentChat);
  
  // Quick starts event delegation
  document.querySelectorAll('.quick-start-card').forEach(card => {
    card.addEventListener('click', () => {
      const prompt = card.getAttribute('data-prompt');
      chatTextarea.value = prompt;
      chatTextarea.dispatchEvent(new Event('input'));
      submitUserMessage();
    });
  });
}

function updateActiveConversationSettings() {
  const active = getActiveConversation();
  if (active && !state.isGenerating) {
    active.settings = getActiveSettingsFromUI();
    saveStateToStorage();
  }
}

// Global Copy Helper for Fenced Code Blocks
window.copyCodeBlock = function(btn) {
  const wrapper = btn.closest('.code-block-wrapper');
  const code = wrapper.querySelector('code').innerText;
  
  navigator.clipboard.writeText(code).then(() => {
    btn.innerHTML = '<i data-lucide="check" style="width: 12px; height: 12px;"></i> Copied!';
    btn.classList.add('copied');
    
    setTimeout(() => {
      btn.innerHTML = '<i data-lucide="copy" style="width: 12px; height: 12px;"></i> Copy';
      btn.classList.remove('copied');
      lucide.createIcons();
    }, 2000);
    
    lucide.createIcons();
  });
};

function escapeHTML(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
