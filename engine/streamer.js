import { EventEmitter } from 'events';
import winston from 'winston';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'logs/streamer-error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/streamer-combined.log' })
  ]
});

if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.simple()
  }));
}

/**
 * STREAM ENGINE - Real-time code streaming for XOVA AI ENGINE
 * Streams generated code file-by-file, line-by-line with backpressure handling
 * Supports WebSocket and SSE transport protocols
 */

class CodeStreamer extends EventEmitter {
  constructor(options = {}) {
    super();
    this.chunkSize = options.chunkSize || 256; // Characters per chunk
    this.lineDelay = options.lineDelay || 10; // ms between lines
    this.fileDelay = options.fileDelay || 50; // ms between files
    this.activeStreams = new Map();
    this.maxConcurrentStreams = options.maxConcurrentStreams || 10;
  }

  /**
   * Stream code files to client in real-time
   * @param {Map<string, string>} files - Map of filePath -> content
   * @param {object} transport - Transport interface (ws, sse, or callback)
   * @param {string} streamId - Unique stream identifier
   * @returns {Promise<void>}
   */
  async stream(files, transport, streamId) {
    if (!files || !(files instanceof Map) || files.size === 0) {
      throw new Error('Files map is required and must contain at least one file');
    }

    if (!transport || typeof transport.send !== 'function') {
      throw new Error('Transport must implement a send(message) method');
    }

    if (this.activeStreams.size >= this.maxConcurrentStreams) {
      throw new Error(`Maximum concurrent streams (${this.maxConcurrentStreams}) reached`);
    }

    const stream = {
      id: streamId,
      files: Array.from(files.entries()),
      currentIndex: 0,
      currentLine: 0,
      startTime: Date.now(),
      transport,
      paused: false,
      cancelled: false
    };

    this.activeStreams.set(streamId, stream);
    logger.info('Stream started', { streamId, fileCount: files.size });

    // Send stream initialization
    await transport.send({
      type: 'stream:init',
      streamId,
      fileCount: files.size,
      timestamp: Date.now()
    });

    try {
      // Process each file
      for (const [filePath, content] of files) {
        if (stream.cancelled) break;
        
        await this._streamFile(stream, filePath, content);
        
        // Small delay between files for smooth UX
        await this._delay(this.fileDelay);
      }

      // Send completion
      if (!stream.cancelled) {
        const duration = Date.now() - stream.startTime;
        await transport.send({
          type: 'stream:complete',
          streamId,
          duration,
          filesProcessed: stream.currentIndex,
          timestamp: Date.now()
        });
        
        logger.info('Stream completed', { streamId, duration });
      }

    } catch (error) {
      logger.error('Stream error', { streamId, error: error.message });
      
      await transport.send({
        type: 'stream:error',
        streamId,
        error: error.message,
        timestamp: Date.now()
      });
      
      throw error;
      
    } finally {
      this.activeStreams.delete(streamId);
      this.emit('stream:end', streamId);
    }
  }

  async _streamFile(stream, filePath, content) {
    const { transport } = stream;
    
    // Send file header
    await transport.send({
      type: 'file:start',
      streamId: stream.id,
      filePath,
      fileSize: content.length,
      timestamp: Date.now()
    });

    // Split content into lines for realistic streaming
    const lines = content.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
      if (stream.cancelled || stream.paused) {
        if (stream.cancelled) break;
        
        // Wait while paused
        while (stream.paused && !stream.cancelled) {
          await this._delay(100);
        }
        if (stream.cancelled) break;
      }
      
      const line = lines[i];
      const progress = (i + 1) / lines.length;
      
      // Send line chunk
      await transport.send({
        type: 'code:line',
        streamId: stream.id,
        filePath,
        line,
        lineNumber: i + 1,
        progress,
        timestamp: Date.now()
      });
      
      // Emit progress event
      this.emit('stream:progress', {
        streamId: stream.id,
        filePath,
        progress,
        linesProcessed: i + 1,
        totalLines: lines.length
      });
      
      // Realistic typing delay
      await this._delay(this.lineDelay);
    }
    
    // Send file complete
    await transport.send({
      type: 'file:complete',
      streamId: stream.id,
      filePath,
      timestamp: Date.now()
    });
    
    stream.currentIndex++;
  }

  /**
   * Pause an active stream
   * @param {string} streamId 
   */
  pause(streamId) {
    const stream = this.activeStreams.get(streamId);
    if (stream) {
      stream.paused = true;
      logger.debug('Stream paused', { streamId });
      this.emit('stream:paused', streamId);
    }
  }

  /**
   * Resume a paused stream
   * @param {string} streamId 
   */
  resume(streamId) {
    const stream = this.activeStreams.get(streamId);
    if (stream) {
      stream.paused = false;
      logger.debug('Stream resumed', { streamId });
      this.emit('stream:resumed', streamId);
    }
  }

  /**
   * Cancel and clean up a stream
   * @param {string} streamId 
   */
  cancel(streamId) {
    const stream = this.activeStreams.get(streamId);
    if (stream) {
      stream.cancelled = true;
      stream.paused = false;
      this.activeStreams.delete(streamId);
      logger.info('Stream cancelled', { streamId });
      this.emit('stream:cancelled', streamId);
    }
  }

  /**
   * Get stream statistics
   * @param {string} streamId 
   * @returns {object|null}
   */
  getStats(streamId) {
    const stream = this.activeStreams.get(streamId);
    if (!stream) return null;
    
    return {
      id: stream.id,
      fileCount: stream.files.length,
      filesProcessed: stream.currentIndex,
      startTime: stream.startTime,
      elapsed: Date.now() - stream.startTime,
      paused: stream.paused,
      cancelled: stream.cancelled
    };
  }

  /**
   * Create WebSocket transport adapter
   * @param {WebSocket} ws 
   * @returns {object}
   */
  static createWSTransport(ws) {
    return {
      send: (message) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify(message));
          return Promise.resolve();
        }
        return Promise.reject(new Error('WebSocket not open'));
      },
      close: () => ws.close(),
      on: (event, handler) => ws.addEventListener(event, handler)
    };
  }

  /**
   * Create SSE transport adapter
   * @param {Response} res - Express response
   * @returns {object}
   */
  static createSSETransport(res) {
    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
    
    return {
      send: (message) => {
        return new Promise((resolve, reject) => {
          const data = `data: ${JSON.stringify(message)}\n\n`;
          const written = res.write(data);
          if (written) {
            resolve();
          } else {
            res.once('drain', resolve);
          }
        });
      },
      close: () => res.end(),
      on: () => {} // SSE doesn't support bidirectional events easily
    };
  }

  _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export default CodeStreamer;
