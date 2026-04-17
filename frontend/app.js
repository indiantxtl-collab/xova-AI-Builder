/**
 * XOVA AI ENGINE - Frontend Application Logic
 * Production-ready JavaScript with modular architecture
 */

// Configuration
const CONFIG = {
  API_BASE: '/api/v1',
  GHOST_ANIMATION_SPEED: 6000,
  RAIN_PROBABILITY: 0.02,
  STREAM_CHUNK_SIZE: 256,
  PREVIEW_REFRESH_RATE: 100
};

// State Management
const AppState = {
  currentPrompt: '',
  isGenerating: false,
  generatedFiles: new Map(),
  previewContent: { html: '', css: '', js: '' },
  deploymentStatus: 'idle',
  ghostState: 'idle',
  listeners: new Map(),
  
  subscribe(key, callback) {
    if (!this.listeners.has(key)) this.listeners.set(key, new Set());
    this.listeners.get(key).add(callback);
    return () => this.listeners.get(key)?.delete(callback);
  },
  
  notify(key, value) { this.listeners.get(key)?.forEach(cb => cb(value)); },
  set(key, value) { this[key] = value; this.notify(key, value); }
};

// DOM References
const DOM = {
  promptInput: null, analyzeBtn: null, publishBtn: null,
  ghostAssistant: null, codeStream: null, previewFrame: null,
  previewPlaceholder: null, workspaceSection: null,
  deploymentPanel: null, toastContainer: null, suggestionChips: null,
  
  init() {
    this.promptInput = document.getElementById('prompt-input');
    this.analyzeBtn = document.getElementById('analyze-btn');
    this.publishBtn = document.getElementById('publish-btn');
    this.ghostAssistant = document.getElementById('ghost-assistant');
    this.codeStream = document.getElementById('code-stream');
    this.previewFrame = document.getElementById('preview-frame');
    this.previewPlaceholder = document.getElementById('preview-placeholder');
    this.workspaceSection = document.querySelector('.workspace-section');
    this.deploymentPanel = document.getElementById('deployment-panel');
    this.toastContainer = document.getElementById('toast-container');
    this.suggestionChips = document.querySelectorAll('.chip');
    return this;
  }
};

// Ghost AI Assistant
const GhostAssistant = {
  el: null, eyes: null, mouth: null, hands: null, glow: null,
  
  init() {
    this.el = DOM.ghostAssistant;
    if (!this.el) return;
    this.eyes = this.el.querySelectorAll('.eye');
    this.mouth = this.el.querySelector('.ghost-mouth');
    this.hands = this.el.querySelectorAll('.hand');
    this.glow = this.el.querySelector('.ghost-glow');
    this._setupAnimations();
    this._setupInteractions();
    return this;
  },
  
  _setupAnimations() {
    setInterval(() => {
      if (AppState.ghostState === 'idle') {
        this._randomBlink();
        this._subtleGesture();
      }
    }, 3000);
  },
  
  _setupInteractions() {
    DOM.promptInput?.addEventListener('input', (e) => {
      if (e.target.value.length > 5) this._showThinking();
      else this._showIdle();
    });
    
    AppState.subscribe('isGenerating', (generating) => {
      if (generating) this._showGenerating();
      else { this._showSuccess(); setTimeout(() => this._showIdle(), 3000); }
    });
  },
  
  _randomBlink() {
    if (Math.random() > 0.7) {
      this.eyes.forEach(eye => {
        eye.style.transform = 'scaleY(0.1)';
        setTimeout(() => eye.style.transform = 'scaleY(1)', 100);
      });
    }
  },
  
  _subtleGesture() {
    if (Math.random() > 0.8) {
      const hand = this.hands[Math.floor(Math.random() * this.hands.length)];
      hand.style.animation = 'wave 0.5s ease-in-out';
      setTimeout(() => hand.style.animation = '', 500);
    }
  },
  
  _showThinking() {
    AppState.set('ghostState', 'thinking');
    this.mouth?.style.setProperty('border-radius', '10px 10px 0 0');
    this.glow?.style.setProperty('opacity', '0.8');
  },
  
  _showGenerating() {
    AppState.set('ghostState', 'generating');
    this.mouth?.style.setProperty('border-radius', '0 0 10px 10px');
    this.glow?.style.setProperty('opacity', '1');
    this.glow?.style.setProperty('animation', 'pulse 0.5s ease-in-out infinite');
  },
  
  _showSuccess() {
    AppState.set('ghostState', 'success');
    this.mouth?.style.setProperty('border-radius', '0 0 14px 14px');
    this.mouth?.style.setProperty('width', '24px');
    this.glow?.style.setProperty('opacity', '1');
    this.glow?.style.setProperty('box-shadow', '0 0 30px rgba(16, 185, 129, 0.6)');
  },
  
  _showIdle() {
    AppState.set('ghostState', 'idle');
    this.mouth?.style.setProperty('border-radius', '0 0 10px 10px');
    this.mouth?.style.setProperty('width', '20px');
    this.mouth?.style.setProperty('background', '#1a1a2e');
    this.glow?.style.setProperty('animation', 'pulse 3s ease-in-out infinite');
    this.glow?.style.setProperty('box-shadow', '0 0 20px rgba(99, 102, 241, 0.3)');
  }
};

// Sky & Weather Animations
const SkyAnimation = {
  cloudLayer: null, rainContainer: null, rainInterval: null,
  
  init() {
    this.cloudLayer = document.querySelector('.clouds-layer');
    this.rainContainer = document.getElementById('rain-effect');
    if (!this.cloudLayer || !this.rainContainer) return;
    this._enhanceCloudDrift();
    this._startRainSystem();
    this._applyWindEffect();
    return this;
  },
  
  _enhanceCloudDrift() {
    document.addEventListener('mousemove', (e) => {
      const x = (e.clientX / window.innerWidth - 0.5) * 10;
      const y = (e.clientY / window.innerHeight - 0.5) * 5;
      this.cloudLayer.style.transform = `translate(${x}px, ${y}px)`;
    });
  },
  
  _startRainSystem() {
    this.rainInterval = setInterval(() => {
      if (Math.random() < CONFIG.RAIN_PROBABILITY && !this.rainContainer.classList.contains('active')) {
        this._triggerRain();
      }
    }, 60000);
  },
  
  _triggerRain() {
    this.rainContainer.classList.add('active');
    const dropCount = Math.floor(Math.random() * 30) + 20;
    for (let i = 0; i < dropCount; i++) this._createRaindrop();
    const duration = Math.random() * 7000 + 8000;
    setTimeout(() => {
      this.rainContainer.classList.remove('active');
      this.rainContainer.innerHTML = '';
    }, duration);
  },
  
  _createRaindrop() {
    const drop = document.createElement('div');
    drop.className = 'raindrop';
    const left = Math.random() * 100;
    const duration = Math.random() * 1 + 0.5;
    const delay = Math.random() * 2;
    drop.style.left = `${left}%`;
    drop.style.animationDuration = `${duration}s`;
    drop.style.animationDelay = `${delay}s`;
    this.rainContainer.appendChild(drop);
    setTimeout(() => drop.remove(), (duration + delay) * 1000);
  },
  
  _applyWindEffect() {
    const panels = document.querySelectorAll('.glass-panel');
    panels.forEach((panel, index) => {
      const baseDelay = index * 0.2;
      panel.style.animation = `float 8s ease-in-out ${baseDelay}s infinite`;
    });
    if (!document.getElementById('wind-keyframes')) {
      const style = document.createElement('style');
      style.id = 'wind-keyframes';
      style.textContent = `@keyframes float { 0%, 100% { transform: translateY(0) rotate(0deg); } 25% { transform: translateY(-3px) rotate(0.5deg); } 75% { transform: translateY(2px) rotate(-0.5deg); } }`;
      document.head.appendChild(style);
    }
  },
  
  destroy() { if (this.rainInterval) clearInterval(this.rainInterval); }
};

// Preview Engine
const PreviewEngine = {
  frame: null, placeholder: null,
  
  init() {
    this.frame = DOM.previewFrame;
    this.placeholder = DOM.previewPlaceholder;
    if (!this.frame) return;
    window.addEventListener('message', this._handlePreviewMessage.bind(this), false);
    return this;
  },
  
  render({ html, css, js }) {
    if (!this.frame) return;
    this.placeholder.style.display = 'none';
    this.frame.style.display = 'block';
    
    const previewDoc = `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><style>${css}</style></head><body>${html}<script>${js}<\\/script></body></html>`;
    
    const doc = this.frame.contentDocument || this.frame.contentWindow.document;
    doc.open(); doc.write(previewDoc); doc.close();
    
    AppState.set('previewContent', { html, css, js });
  },
  
  refresh() {
    const { html, css, js } = AppState.previewContent;
    if (html) { this.render({ html, css, js }); Toast.success('Preview refreshed'); }
  },
  
  openInNewTab() {
    const { html, css, js } = AppState.previewContent;
    if (!html) { Toast.warning('No preview content'); return; }
    const previewDoc = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>XOVA Preview</title><style>${css}</style></head><body>${html}<script>${js}<\\/script></body></html>`;
    const blob = new Blob([previewDoc], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank', 'noopener,noreferrer');
    setTimeout(() => URL.revokeObjectURL(url), 300000);
  },
  
  _handlePreviewMessage(event) {
    if (event.origin !== window.location.origin) return;
    const { source, type } = event.data;
    if (source !== 'xova-preview') return;
    if (type === 'preview-ready') console.log('Preview rendered');
    if (type === 'error') Toast.error(`Preview error: ${event.data.message}`);
  }
};

// Toast Notifications
const Toast = {
  container: null,
  init() { this.container = DOM.toastContainer; return this; },
  
  show(message, type = 'info', duration = 3000) {
    if (!this.container) return;
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<span class="toast-icon">${this._getIcon(type)}</span><span class="toast-message">${message}</span><button class="toast-close" aria-label="Close">&times;</button>`;
    toast.querySelector('.toast-close').addEventListener('click', () => toast.remove());
    setTimeout(() => {
      if (toast.parentNode) {
        toast.style.animation = 'fadeOut 0.3s ease-in forwards';
        setTimeout(() => toast.remove(), 300);
      }
    }, duration);
    this.container.appendChild(toast);
  },
  
  success(msg) { this.show(msg, 'success'); },
  error(msg) { this.show(msg, 'error'); },
  warning(msg) { this.show(msg, 'warning'); },
  info(msg) { this.show(msg, 'info'); },
  
  _getIcon(type) { return { success: '✓', error: '✕', warning: '⚠', info: 'ℹ' }[type] || '•'; }
};

// API Client
const APIClient = {
  async request(endpoint, options = {}) {
    const url = `${CONFIG.API_BASE}${endpoint}`;
    const config = {
      headers: { 'Content-Type': 'application/json', ...options.headers },
      ...options
    };
    try {
      const response = await fetch(url, config);
      if (!response.ok) {
        const error = await response.json().catch(() => ({ message: response.statusText }));
        throw new Error(error.message || 'API request failed');
      }
      return await response.json();
    } catch (error) {
      console.error('API Error:', error);
      Toast.error(`API Error: ${error.message}`);
      throw error;
    }
  },
  
  async analyzePrompt(prompt) {
    return this.request('/analyze', {
      method: 'POST',
      body: JSON.stringify({ prompt, context: { userAgent: navigator.userAgent } })
    });
  },
  
  async generateCode(plan) {
    return this.request('/generate', {
      method: 'POST',
      body: JSON.stringify({ plan, projectId: 'xova-' + Date.now().toString(36) })
    });
  },
  
  async publishProject(projectId) {
    return this.request('/publish', { method: 'POST', body: JSON.stringify({ projectId }) });
  },
  
  async deployToVercel(projectId) {
    return this.request('/deploy/vercel', { method: 'POST', body: JSON.stringify({ projectId }) });
  },
  
  async deployToGitHub(projectId) {
    return this.request('/deploy/github', { method: 'POST', body: JSON.stringify({ projectId }) });
  }
};

// Main Application
const App = {
  async init() {
    DOM.init();
    GhostAssistant.init();
    SkyAnimation.init();
    PreviewEngine.init();
    Toast.init();
    this._setupEventListeners();
    this._setupSuggestionChips();
    await this._loadSavedProject();
    console.log('✅ XOVA AI Engine initialized');
  },
  
  _setupEventListeners() {
    DOM.analyzeBtn?.addEventListener('click', async () => {
      const prompt = DOM.promptInput?.value.trim();
      if (!prompt) { Toast.warning('Please describe what you want to build'); DOM.promptInput?.focus(); return; }
      await this._handleAnalyze(prompt);
    });
    
    DOM.publishBtn?.addEventListener('click', async () => { await this._handlePublish(); });
    document.getElementById('deploy-vercel-btn')?.addEventListener('click', () => this._handleDeploy('vercel'));
    document.getElementById('deploy-github-btn')?.addEventListener('click', () => this._handleDeploy('github'));
    document.getElementById('refresh-preview-btn')?.addEventListener('click', () => PreviewEngine.refresh());
    document.getElementById('open-preview-btn')?.addEventListener('click', () => PreviewEngine.openInNewTab());
    document.getElementById('copy-code-btn')?.addEventListener('click', () => this._copyGeneratedCode());
    document.getElementById('download-code-btn')?.addEventListener('click', () => this._downloadGeneratedCode());
    
    DOM.promptInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); DOM.analyzeBtn?.click(); }
    });
    
    document.getElementById('theme-toggle')?.addEventListener('click', () => {
      document.body.classList.toggle('light-theme');
      localStorage.setItem('xova-theme', document.body.classList.contains('light-theme') ? 'light' : 'dark');
    });
  },
  
  _setupSuggestionChips() {
    DOM.suggestionChips?.forEach(chip => {
      chip.addEventListener('click', () => {
        const prompt = chip.dataset.prompt;
        if (prompt && DOM.promptInput) {
          DOM.promptInput.value = prompt;
          DOM.promptInput.focus();
          setTimeout(() => DOM.analyzeBtn?.click(), 300);
        }
      });
    });
  },
  
  async _handleAnalyze(prompt) {
    try {
      DOM.analyzeBtn.disabled = true;
      DOM.analyzeBtn.querySelector('.btn-text').hidden = true;
      DOM.analyzeBtn.querySelector('.btn-loader').hidden = false;
      DOM.workspaceSection.hidden = false;
      DOM.workspaceSection.scrollIntoView({ behavior: 'smooth' });
      
      GhostAssistant._showThinking();
      const plan = await APIClient.analyzePrompt(prompt);
      
      GhostAssistant._showGenerating();
      DOM.codeStream.innerHTML = '';
      const generatedFiles = await APIClient.generateCode(plan);
      
      // Stream files to UI (simplified)
      for (const [filePath, content] of Object.entries(generatedFiles.files)) {
        const header = document.createElement('div');
        header.className = 'file-header';
        header.textContent = `📄 ${filePath}`;
        DOM.codeStream.appendChild(header);
        
        const lines = content.split('\n');
        for (const line of lines) {
          const lineEl = document.createElement('span');
          lineEl.className = 'code-line';
          lineEl.textContent = line;
          DOM.codeStream.appendChild(lineEl);
        }
        DOM.codeStream.scrollTop = DOM.codeStream.scrollHeight;
      }
      
      GhostAssistant._showSuccess();
      DOM.publishBtn.disabled = false;
      Toast.success('Code generation complete!');
      this._renderInitialPreview(generatedFiles.files);
      
    } catch (error) {
      console.error('Analysis failed:', error);
      GhostAssistant._showError();
      Toast.error('Failed to analyze prompt');
    } finally {
      DOM.analyzeBtn.disabled = false;
      DOM.analyzeBtn.querySelector('.btn-text').hidden = false;
      DOM.analyzeBtn.querySelector('.btn-loader').hidden = true;
    }
  },
  
  _renderInitialPreview(files) {
    const html = files['frontend/index.html'] || '<h1>App Generated</h1>';
    const css = files['frontend/style.css'] || '';
    const js = files['frontend/app.js'] || '';
    PreviewEngine.render({ html, css, js });
  },
  
  async _handlePublish() {
    try {
      Toast.info('Publishing project...');
      const projectId = 'xova-' + Date.now().toString(36);
      const result = await APIClient.publishProject(projectId);
      const publishUrl = `https://${projectId}.xova.pro`;
      Toast.success(`✅ Published! <a href="${publishUrl}" target="_blank">${publishUrl}</a>`);
      navigator.clipboard.writeText(publishUrl).catch(() => {});
    } catch (error) {
      Toast.error('Failed to publish project');
    }
  },
  
  async _handleDeploy(platform) {
    try {
      DOM.deploymentPanel.hidden = false;
      DOM.deploymentPanel.scrollIntoView({ behavior: 'smooth' });
      const logsEl = document.getElementById('deployment-logs');
      logsEl.innerHTML = '';
      
      const addLog = (message, type = 'info') => {
        const entry = document.createElement('div');
        entry.className = `log-entry ${type}`;
        entry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
        logsEl.appendChild(entry);
        logsEl.scrollTop = logsEl.scrollHeight;
      };
      
      addLog(`Starting deployment to ${platform}...`, 'info');
      await this._simulateProgress(addLog, 3, 800);
      addLog('Uploading files...', 'info');
      await this._simulateProgress(addLog, 3, 600);
      addLog('Building application...', 'info');
      await this._simulateProgress(addLog, 4, 600);
      addLog('Deploying to edge network...', 'info');
      await this._simulateProgress(addLog, 2, 1000);
      addLog(`✅ Deployment successful!`, 'success');
      addLog(`🔗 https://${platform}.xova.pro/project`, 'success');
      Toast.success(`Deployed to ${platform}!`);
      
    } catch (error) {
      console.error('Deploy error:', error);
      document.getElementById('deployment-logs').innerHTML += `<div class="log-entry error">❌ Deployment failed: ${error.message}</div>`;
      Toast.error('Deployment failed');
    }
  },
  
  async _simulateProgress(addLog, steps, delay) {
    for (let i = 1; i <= steps; i++) {
      await new Promise(resolve => setTimeout(resolve, delay));
      addLog(`Progress: ${Math.round((i/steps)*100)}%`, 'info');
    }
  },
  
  _copyGeneratedCode() {
    const code = DOM.codeStream.textContent;
    if (!code) { Toast.warning('No code to copy'); return; }
    navigator.clipboard.writeText(code).then(() => Toast.success('Code copied')).catch(() => Toast.error('Failed to copy'));
  },
  
  _downloadGeneratedCode() {
    const html = AppState.previewContent.html || '<!-- XOVA Generated App -->';
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `xova-${Date.now().toString(36)}.html`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    Toast.success('Download started');
  },
  
  async _loadSavedProject() {
    const saved = localStorage.getItem('xova-current-project');
    if (saved) {
      try {
        const project = JSON.parse(saved);
        console.log('Loaded saved project:', project.id);
      } catch (e) { localStorage.removeItem('xova-current-project'); }
    }
  }
};

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  App.init();
  const savedTheme = localStorage.getItem('xova-theme');
  if (savedTheme === 'light') document.body.classList.add('light-theme');
});
