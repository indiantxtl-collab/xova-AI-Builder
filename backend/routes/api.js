import { Router } from 'express';
import asyncHandler from 'express-async-handler';
import { z } from 'zod';
import { generateID, ID_TYPES } from '../../utils/id.js';

/**
 * API Routes - Core XOVA AI Engine endpoints
 * Handles prompt analysis, code generation, streaming, and preview
 */

export default function apiRoutes({ planner, generator, streamer, preview }) {
  const router = Router();

  // ===== PROMPT ANALYSIS =====
  router.post('/analyze', asyncHandler(async (req, res) => {
    const { prompt, context = {} } = req.body;
    
    // Validate input
    const schema = z.object({
      prompt: z.string().min(10).max(10000),
      context: z.record(z.any()).optional()
    });
    
    const validated = schema.parse({ prompt, context });
    
    // Analyze prompt
    const plan = await planner.analyze(validated.prompt, validated.context);
    
    res.json({
      success: true,
      plan,
      metadata: {
        analysisTime: Date.now(),
        complexity: plan.architecture.complexity,
        estimatedFiles: plan.architecture.estimatedFiles
      }
    });
  }));

  // ===== CODE GENERATION =====
  router.post('/generate', asyncHandler(async (req, res) => {
    const { plan, projectId } = req.body;
    
    // Validate input
    const schema = z.object({
      plan: z.object({ architecture: z.object({ complexity: z.string() }) }),
      projectId: z.string().min(1)
    });
    
    const validated = schema.parse({ plan, projectId });
    
    // Generate code
    const generatedFiles = await generator.generate(validated.plan, validated.projectId);
    
    // Convert Map to plain object for JSON
    const filesObject = Object.fromEntries(generatedFiles);
    
    res.json({
      success: true,
      files: filesObject,
      metadata: {
        fileCount: generatedFiles.size,
        generatedAt: Date.now(),
        projectId: validated.projectId
      }
    });
  }));

  // ===== CODE STREAMING (WebSocket endpoint handled separately) =====
  router.post('/stream/init', asyncHandler(async (req, res) => {
    const { plan, projectId, transport = 'sse' } = req.body;
    
    // Generate stream ID
    const streamId = generateID(ID_TYPES.SESSION);
    
    // Generate files (in background for streaming)
    const generatedFiles = await generator.generate(plan, projectId);
    
    // Return stream initialization data
    res.json({
      success: true,
      streamId,
      fileCount: generatedFiles.size,
      transport,
      endpoint: transport === 'sse' ? `/api/stream/${streamId}` : null
    });
  }));

  // ===== SSE STREAMING ENDPOINT =====
  router.get('/stream/:streamId', asyncHandler(async (req, res) => {
    const { streamId } = req.params;
    
    // This would connect to the streaming engine
    // For demo, we'll send a completion message
    const transport = CodeStreamer.createSSETransport(res);
    
    await transport.send({
      type: 'stream:init',
      streamId,
      timestamp: Date.now()
    });
    
    // In production: streamer.stream(files, transport, streamId)
    
    await transport.send({
      type: 'stream:complete',
      streamId,
      timestamp: Date.now()
    });
    
    transport.close();
  }));

  // ===== PREVIEW RENDERING =====
  router.post('/preview/render', asyncHandler(async (req, res) => {
    const { content, previewId = generateID(ID_TYPES.SESSION), options = {} } = req.body;
    
    // Validate content
    if (!content || !content.html) {
      return res.status(400).json({ error: 'Content must include HTML' });
    }
    
    // Render preview
    const previewUrl = await preview.render(content, previewId, {
      ...options,
      parentOrigin: req.get('Origin') || '*'
    });
    
    res.json({
      success: true,
      previewId,
      url: previewUrl,
      metadata: {
        renderedAt: Date.now(),
        sandboxConfig: preview.sandboxConfig
      }
    });
  }));

  // ===== PREVIEW UPDATE =====
  router.post('/preview/:previewId/update', asyncHandler(async (req, res) => {
    const { previewId } = req.params;
    const { content } = req.body;
    
    const updated = await preview.update(previewId, content);
    
    res.json({
      success: updated,
      previewId,
      timestamp: Date.now()
    });
  }));

  // ===== PROJECT PUBLISHING =====
  router.post('/publish', asyncHandler(async (req, res) => {
    const { projectId } = req.body;
    
    if (!projectId) {
      return res.status(400).json({ error: 'Project ID is required' });
    }
    
    // Generate publish URL
    const publishUrl = `https://${projectId}.xova.pro`;
    
    // In production: upload to CDN, configure DNS, etc.
    
    res.json({
      success: true,
      projectId,
      url: publishUrl,
      publishedAt: Date.now(),
      message: 'Project published successfully'
    });
  }));

  return router;
}
