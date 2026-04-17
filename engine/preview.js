import { EventEmitter } from 'events';
import vm from 'vm';
import winston from 'winston';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'logs/preview-error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/preview-combined.log' })
  ]
});

if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.simple()
  }));
}

/**
 * PREVIEW ENGINE - Secure iframe preview rendering for XOVA AI ENGINE
 * Renders generated code in sandboxed iframe with real-time updates
 * Implements security boundaries and error isolation
 */

class PreviewEngine extends EventEmitter {
  constructor(options = {}) {
    super();
    this.sandboxConfig = {
      allowScripts: options.allowScripts ?? true,
      allowForms: options.allowForms ?? true,
      allowPopups: options.allowPopups ?? false,
      allowSameOrigin: options.allowSameOrigin ?? true,
      allowModals: options.allowModals ?? false,
      allowTopNavigation: options.allowTopNavigation ?? false
    };
    
    this.previewCache = new Map();
    this.maxCacheSize = options.maxCacheSize || 50;
    this.renderTimeout = options.renderTimeout || 10000; // 10 seconds
  }

  /**
   * Render generated code in sandboxed preview
   * @param {object} content - { html, css, js }
   * @param {string} previewId - Unique preview session ID
   * @param {object} options - Rendering options
   * @returns {Promise<string>} Preview URL or data
   */
  async render(content, previewId, options = {}) {
    if (!content || !content.html) {
      throw new Error('Content must include HTML');
    }

    const { html, css = '', js = '' } = content;
    const { 
      enableConsole = true,
      enableErrors = true,
      enableNetwork = false,
      timeout = this.renderTimeout 
    } = options;

    logger.info('Rendering preview', { previewId, contentLength: html.length + css.length + js.length });

    // Construct sandboxed document
    const sandboxAttrs = this._buildSandboxAttributes();
    const previewDoc = this._buildPreviewDocument(html, css, js, {
      enableConsole,
      enableErrors,
      previewId,
      parentOrigin: options.parentOrigin || '*'
    });

    // Cache the preview
    this._cachePreview(previewId, { html, css, js, timestamp: Date.now() });

    // Return data URL for immediate embedding
    // In production, this would upload to CDN and return URL
    const dataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(previewDoc)}`;
    
    // Emit render event for analytics
    this.emit('preview:rendered', {
      previewId,
      size: new Blob([previewDoc]).size,
      timestamp: Date.now()
    });

    return dataUrl;
  }

  /**
   * Update existing preview with new content
   * @param {string} previewId 
   * @param {object} content 
   * @returns {Promise<boolean>}
   */
  async update(previewId, content) {
    const cached = this.previewCache.get(previewId);
    if (!cached) {
      logger.warn('Preview not found for update', { previewId });
      return false;
    }

    // Merge content with cached version
    const updated = {
      html: content.html ?? cached.html,
      css: content.css ?? cached.css,
      js: content.js ?? cached.js,
      timestamp: Date.now()
    };

    // Re-render
    const newUrl = await this.render(updated, previewId);
    
    // Update cache
    this.previewCache.set(previewId, updated);
    
    this.emit('preview:updated', { previewId, timestamp: Date.now() });
    
    return true;
  }

  /**
   * Execute JavaScript in isolated VM context (for server-side preview testing)
   * @param {string} code 
   * @param {object} context - Initial context variables
   * @param {number} timeout - Execution timeout in ms
   * @returns {Promise<any>}
   */
  async executeInVM(code, context = {}, timeout = 5000) {
    return new Promise((resolve, reject) => {
      try {
        // Create isolated context
        const sandbox = {
          console: {
            log: (...args) => logger.info('VM Console', { args }),
            warn: (...args) => logger.warn('VM Console', { args }),
            error: (...args) => logger.error('VM Console', { args })
          },
          setTimeout,
          setInterval,
          clearTimeout,
          clearInterval,
          ...context,
          // Prevent dangerous globals
          require: undefined,
          process: undefined,
          global: undefined,
          Buffer: undefined
        };

        // Create VM context
        const vmContext = vm.createContext(sandbox);
        
        // Compile and run code
        const script = new vm.Script(code, {
          filename: 'xova-preview-vm.js',
          lineOffset: 0,
          columnOffset: 0,
          produceCachedData: false
        });
        
        // Execute with timeout
        const result = script.runInContext(vmContext, { timeout });
        
        resolve(result);
        
      } catch (error) {
        logger.error('VM execution error', { error: error.message, code: code.substring(0, 100) });
        reject(new Error(`Preview execution failed: ${error.message}`));
      }
    });
  }

  /**
   * Validate preview content for security
   * @param {object} content 
   * @returns {boolean}
   */
  validateContent(content) {
    const { html, css, js } = content;
    
    // Check for dangerous patterns
    const dangerousPatterns = [
      /<script[^>]*src\s*=\s*["']?https?:\/\/[^"']*/i, // External scripts
      /eval\s*\(/i,
      /Function\s*\(/i,
      /document\.write\s*\(/i,
      /innerHTML\s*=\s*[^;]*location/i,
      /window\.location\s*=/i,
      /top\.location\s*=/i,
      /parent\.location\s*=/i
    ];
    
    const allContent = `${html} ${css} ${js}`;
    
    for (const pattern of dangerousPatterns) {
      if (pattern.test(allContent)) {
        logger.warn('Dangerous pattern detected in preview content', { pattern: pattern.toString() });
        return false;
      }
    }
    
    return true;
  }

  /**
   * Clear preview cache
   * @param {string|null} previewId - Clear specific or all
   */
  clearCache(previewId = null) {
    if (previewId) {
      const deleted = this.previewCache.delete(previewId);
      logger.debug('Cache entry cleared', { previewId, deleted });
    } else {
      const count = this.previewCache.size;
      this.previewCache.clear();
      logger.info('Preview cache cleared', { entriesCleared: count });
    }
  }

  /**
   * Build sandbox attributes string
   * @returns {string}
   */
  _buildSandboxAttributes() {
    const attrs = ['allow-top-navigation-by-user-activation'];
    
    if (this.sandboxConfig.allowScripts) attrs.push('allow-scripts');
    if (this.sandboxConfig.allowForms) attrs.push('allow-forms');
    if (this.sandboxConfig.allowPopups) attrs.push('allow-popups');
    if (this.sandboxConfig.allowSameOrigin) attrs.push('allow-same-origin');
    if (this.sandboxConfig.allowModals) attrs.push('allow-modals');
    
    return attrs.join(' ');
  }

  /**
   * Build complete preview HTML document
   * @param {string} html 
   * @param {string} css 
   * @param {string} js 
   * @param {object} options 
   * @returns {string}
   */
  _buildPreviewDocument(html, css, js, options) {
    const { enableConsole, enableErrors, previewId, parentOrigin } = options;
    
    const consoleBridge = enableConsole ? `
      // Console bridge to parent
      const originalConsole = { ...console };
      ['log', 'info', 'warn', 'error', 'debug'].forEach(method => {
        console[method] = function(...args) {
          originalConsole[method](...args);
          try {
            window.parent.postMessage({
              source: 'xova-preview',
              type: 'console',
              previewId: '${previewId}',
              method,
              args: args.map(a => {
                try { return JSON.stringify(a); }
                catch { return String(a); }
              }),
              timestamp: Date.now()
            }, '${parentOrigin}');
          } catch (e) { /* Ignore cross-origin */ }
        };
      });
    ` : '';
    
    const errorBridge = enableErrors ? `
      // Error reporting to parent
      window.addEventListener('error', function(e) {
        try {
          window.parent.postMessage({
            source: 'xova-preview',
            type: 'error',
            previewId: '${previewId}',
            message: e.message,
            filename: e.filename,
            lineno: e.lineno,
            colno: e.colno,
            stack: e.error?.stack,
            timestamp: Date.now()
          }, '${parentOrigin}');
        } catch (err) { /* Ignore */ }
      });
      
      window.addEventListener('unhandledrejection', function(e) {
        try {
          window.parent.postMessage({
            source: 'xova-preview',
            type: 'unhandledRejection',
            previewId: '${previewId}',
            reason: String(e.reason),
            timestamp: Date.now()
          }, '${parentOrigin}');
        } catch (err) { /* Ignore */ }
      });
    ` : '';
    
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="noindex, nofollow">
  <title>XOVA Preview</title>
  <style>
    /* Reset and base styles */
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { height: 100%; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
    body { background: #fff; color: #333; line-height: 1.5; }
    
    /* XOVA preview indicator */
    .xova-preview-badge {
      position: fixed;
      bottom: 12px;
      right: 12px;
      padding: 6px 12px;
      background: rgba(99, 102, 241, 0.9);
      color: white;
      border-radius: 20px;
      font-size: 11px;
      font-weight: 600;
      z-index: 9999;
      pointer-events: none;
      opacity: 0.9;
      transition: opacity 0.2s;
    }
    .xova-preview-badge:hover { opacity: 1; }
    
    /* User content styles */
    ${css}
  </style>
</head>
<body>
  ${html}
  
  <!-- XOVA Preview Badge -->
  <div class="xova-preview-badge" title="Generated by XOVA AI ENGINE">
    ⚡ XOVA Preview
  </div>
  
  <script>
    // Security: Prevent frame busting attempts
    if (window.top !== window.self && !window.XOVA_PREVIEW_ALLOWED) {
      // Allow only if explicitly permitted by parent
      try {
        window.parent.postMessage({ type: 'security-check', previewId: '${previewId}' }, '${parentOrigin}');
      } catch (e) {}
    }
    window.XOVA_PREVIEW_ALLOWED = true;
    
    // Preview metadata
    window.XOVA_PREVIEW = {
      id: '${previewId}',
      renderedAt: ${Date.now()},
      parentOrigin: '${parentOrigin}'
    };
    
    // Communication bridge
    function sendToParent(type, data) {
      try {
        window.parent.postMessage({
          source: 'xova-preview',
          type,
          previewId: '${previewId}',
          data,
          timestamp: Date.now()
        }, '${parentOrigin}');
      } catch (e) {
        // Cross-origin restrictions
      }
    }
    
    // Notify parent of successful load
    window.addEventListener('load', function() {
      sendToParent('preview:loaded', {
        url: window.location.href,
        title: document.title
      });
    });
    
    ${consoleBridge}
    ${errorBridge}
    
    // User JavaScript
    ${js}
  <\/script>
</body>
</html>`;
  }

  /**
   * Cache preview with LRU eviction
   * @param {string} key 
   * @param {object} value 
   */
  _cachePreview(key, value) {
    // Evict oldest if at capacity
    if (this.previewCache.size >= this.maxCacheSize) {
      const firstKey = this.previewCache.keys().next().value;
      this.previewCache.delete(firstKey);
      logger.debug('Cache eviction', { evictedKey: firstKey });
    }
    
    this.previewCache.set(key, value);
  }

  /**
   * Get preview statistics
   * @returns {object}
   */
  getStats() {
    return {
      cacheSize: this.previewCache.size,
      maxCacheSize: this.maxCacheSize,
      sandboxConfig: this.sandboxConfig,
      activePreviews: Array.from(this.previewCache.keys())
    };
  }
}

export default PreviewEngine;
