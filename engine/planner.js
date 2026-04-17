import { z } from 'zod';
import { OpenAI } from 'openai';
import winston from 'winston';
import metadata from '../config/metadata.json' assert { type: 'json' };

/**
 * PROMPT ANALYSIS ENGINE - Semantic understanding for XOVA AI ENGINE
 * Extracts app architecture, features, and complexity from natural language prompts
 * Uses advanced NLP with fallback to rule-based parsing for reliability
 */

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'logs/planner-error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/planner-combined.log' })
  ]
});

if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.simple()
  }));
}

// Zod schemas for structured output validation
const ArchitectureSchema = z.object({
  appType: z.enum(['web', 'mobile', 'desktop', 'api', 'microservice', 'fullstack']),
  complexity: z.enum(['low', 'medium', 'high', 'enterprise']),
  estimatedFiles: z.number().min(1).max(metadata.system.maxFilesPerProject),
  estimatedComplexityScore: z.number().min(0).max(100)
});

const FeatureSchema = z.object({
  name: z.string().min(1),
  type: z.enum(['frontend', 'backend', 'database', 'integration', 'utility']),
  priority: z.enum(['critical', 'high', 'medium', 'low']),
  dependencies: z.array(z.string()).optional(),
  estimatedEffort: z.enum(['xs', 's', 'm', 'l', 'xl'])
});

const PageSchema = z.object({
  path: z.string().regex(/^\/[a-zA-Z0-9\-_/]*$/),
  name: z.string().min(1),
  components: z.array(z.string()),
  requiresAuth: z.boolean().default(false),
  dataRequirements: z.array(z.string()).optional()
});

const ComponentSchema = z.object({
  name: z.string().min(1),
  type: z.enum(['ui', 'logic', 'hook', 'utility', 'service']),
  props: z.record(z.any()).optional(),
  stateManagement: z.enum(['local', 'context', 'redux', 'zustand', 'none']).default('local'),
  reusable: z.boolean().default(true)
});

const BackendSchema = z.object({
  framework: z.enum(['express', 'fastify', 'nestjs', 'koa', 'hapi']),
  authStrategy: z.enum(['jwt', 'session', 'oauth', 'api-key', 'none']).default('jwt'),
  rateLimiting: z.boolean().default(true),
  cors: z.object({
    enabled: z.boolean().default(true),
    origins: z.array(z.string()).optional()
  }).optional(),
  middleware: z.array(z.string()).optional()
});

const DatabaseSchema = z.object({
  type: z.enum(['postgresql', 'mysql', 'mongodb', 'sqlite', 'redis', 'none']),
  schema: z.array(z.object({
    tableName: z.string(),
    columns: z.array(z.object({
      name: z.string(),
      type: z.string(),
      constraints: z.array(z.string()).optional()
    }))
  })).optional(),
  migrations: z.boolean().default(true),
  seeding: z.boolean().default(false)
});

const APISchema = z.object({
  version: z.string().regex(/^v\d+$/).default('v1'),
  baseUrl: z.string().optional(),
  endpoints: z.array(z.object({
    method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']),
    path: z.string(),
    description: z.string(),
    authRequired: z.boolean().default(false),
    rateLimit: z.number().optional()
  }))
});

const IntegrationSchema = z.object({
  service: z.string(),
  type: z.enum(['api', 'webhook', 'sdk', 'oauth']),
  config: z.record(z.any()).optional(),
  secrets: z.array(z.string()).optional()
});

const PlanOutputSchema = z.object({
  architecture: ArchitectureSchema,
  features: z.array(FeatureSchema),
  pages: z.array(PageSchema),
  components: z.array(ComponentSchema),
  backend: BackendSchema,
  database: DatabaseSchema,
  apis: APISchema,
  integrations: z.array(IntegrationSchema).optional(),
  deployment: z.object({
    platform: z.enum(['vercel', 'github', 'netlify', 'aws', 'custom']),
    environment: z.enum(['development', 'staging', 'production']),
    buildCommand: z.string().optional(),
    outputDirectory: z.string().optional()
  }),
  metadata: z.object({
    promptHash: z.string(),
    analysisTimestamp: z.number(),
    confidenceScore: z.number().min(0).max(1),
    warnings: z.array(z.string()).optional()
  })
});

class PromptPlanner {
  constructor(options = {}) {
    this.openai = options.openaiClient || (process.env.OPENAI_API_KEY ? new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      timeout: 30000,
      maxRetries: 3
    }) : null);
    
    this.semanticCache = new Map();
    this.complexityWeights = {
      authentication: 15,
      database: 20,
      realTime: 25,
      fileHandling: 18,
      thirdPartyAPIs: 22,
      adminPanel: 12,
      testing: 8,
      documentation: 5
    };
  }

  /**
   * Analyze prompt using semantic understanding (not keyword matching)
   * @param {string} prompt - User's natural language prompt
   * @param {object} context - Additional context (user preferences, history, etc.)
   * @returns {Promise<object>} Structured architecture plan
   */
  async analyze(prompt, context = {}) {
    if (!prompt || typeof prompt !== 'string' || prompt.trim().length < 10) {
      throw new Error('Prompt must be a meaningful string of at least 10 characters');
    }

    const promptHash = this._hashPrompt(prompt);
    
    // Check semantic cache for identical prompts
    if (this.semanticCache.has(promptHash)) {
      logger.info('Cache hit for prompt analysis', { promptHash });
      return this.semanticCache.get(promptHash);
    }

    try {
      // Step 1: Extract semantic entities and intent
      const semanticAnalysis = await this._performSemanticAnalysis(prompt, context);
      
      // Step 2: Determine complexity level with scoring
      const complexity = this._calculateComplexity(semanticAnalysis);
      
      // Step 3: Generate architecture blueprint
      const architecture = await this._generateArchitecture(semanticAnalysis, complexity);
      
      // Step 4: Validate and enrich plan
      const validatedPlan = await this._validateAndEnrich(architecture, promptHash);
      
      // Cache result with TTL
      this.semanticCache.set(promptHash, {
        ...validatedPlan,
        cachedAt: Date.now()
      });
      
      // Auto-expire cache after 1 hour to allow for model updates
      setTimeout(() => this.semanticCache.delete(promptHash), 3600000);
      
      logger.info('Prompt analysis completed', {
        promptHash,
        complexity: validatedPlan.architecture.complexity,
        estimatedFiles: validatedPlan.architecture.estimatedFiles
      });
      
      return validatedPlan;
      
    } catch (error) {
      logger.error('Prompt analysis failed', { error: error.message, stack: error.stack });
      
      // Fallback to rule-based analysis if AI fails
      if (error.name !== 'ZodError') {
        logger.warn('Falling back to rule-based analysis');
        return this._ruleBasedFallback(prompt, context);
      }
      
      throw error;
    }
  }

  async _performSemanticAnalysis(prompt, context) {
    if (!this.openai) {
      logger.warn('OpenAI client not configured, using rule-based analysis');
      return this._ruleBasedExtraction(prompt);
    }

    try {
      const response = await this.openai.chat.completions.create({
        model: metadata.ai.model,
        messages: [
          {
            role: 'system',
            content: `You are XOVA AI ENGINE's architecture planner. Analyze prompts to extract:
            - App type (web/mobile/desktop/api/microservice/fullstack)
            - Core features with priority levels
            - Required pages and their components
            - Backend requirements (framework, auth, middleware)
            - Database schema needs
            - API endpoints structure
            - Third-party integrations
            - Deployment preferences
            
            Output MUST be valid JSON matching the XOVA architecture schema.
            Be precise, avoid assumptions, flag uncertainties in warnings.`
          },
          {
            role: 'user',
            content: `Analyze this application request: "${prompt}"
            
            Context: ${JSON.stringify(context)}
            
            Provide structured architecture plan.`
          }
        ],
        temperature: metadata.ai.temperature,
        max_tokens: metadata.ai.maxTokens,
        response_format: { type: 'json_object' }
      });

      const content = response.choices[0].message.content;
      return JSON.parse(content);
      
    } catch (error) {
      logger.error('Semantic analysis API call failed', { error: error.message });
      throw new Error(`AI analysis failed: ${error.message}. Using fallback.`);
    }
  }

  _ruleBasedExtraction(prompt) {
    // Fallback NLP using regex and keyword analysis
    const lower = prompt.toLowerCase();
    
    const appType = this._detectAppType(lower);
    const features = this._extractFeatures(lower);
    const pages = this._extractPages(lower);
    
    return {
      appType,
      features,
      pages,
      hasAuth: /auth|login|signup|user|account/.test(lower),
      hasDatabase: /database|store|save|persist|user|product|order/.test(lower),
      hasAPI: /api|endpoint|fetch|http|rest|graphql/.test(lower),
      integrations: this._detectIntegrations(lower)
    };
  }

  _detectAppType(prompt) {
    if (/mobile|react native|flutter|ios|android/.test(prompt)) return 'mobile';
    if (/desktop|electron|tauri|native/.test(prompt)) return 'desktop';
    if (/^api|^backend|microservice|webhook|server-only/.test(prompt)) return 'api';
    if (/fullstack|full-stack|complete app|end-to-end/.test(prompt)) return 'fullstack';
    return 'web'; // Default
  }

  _extractFeatures(prompt) {
    const features = [];
    
    // Authentication
    if (/auth|login|signup|register|user|account|profile/.test(prompt)) {
      features.push({
        name: 'Authentication System',
        type: 'backend',
        priority: 'critical',
        estimatedEffort: 'm'
      });
    }
    
    // Database operations
    if (/database|store|save|persist|crud|create.*read.*update.*delete/.test(prompt)) {
      features.push({
        name: 'Data Persistence Layer',
        type: 'database',
        priority: 'high',
        estimatedEffort: 'l'
      });
    }
    
    // Real-time features
    if (/real.?time|websocket|live|chat|notification|stream/.test(prompt)) {
      features.push({
        name: 'Real-time Communication',
        type: 'backend',
        priority: 'medium',
        dependencies: ['websocket-server'],
        estimatedEffort: 'l'
      });
    }
    
    // File handling
    if (/upload|download|file|image|video|media|storage/.test(prompt)) {
      features.push({
        name: 'File Management System',
        type: 'backend',
        priority: 'medium',
        estimatedEffort: 'm'
      });
    }
    
    // Third-party APIs
    if (/payment|stripe|paypal|map|google|analytics|email|sendgrid/.test(prompt)) {
      features.push({
        name: 'Third-party API Integrations',
        type: 'integration',
        priority: 'medium',
        estimatedEffort: 's'
      });
    }
    
    // Admin panel
    if (/admin|dashboard|management|control.?panel/.test(prompt)) {
      features.push({
        name: 'Admin Dashboard',
        type: 'frontend',
        priority: 'medium',
        estimatedEffort: 'l'
      });
    }
    
    return features.length > 0 ? features : [{
      name: 'Core Application Logic',
      type: 'frontend',
      priority: 'critical',
      estimatedEffort: 'm'
    }];
  }

  _extractPages(prompt) {
    const pages = [];
    const pagePatterns = [
      { pattern: /home|main|landing|index/, path: '/', name: 'Home' },
      { pattern: /about|info/, path: '/about', name: 'About' },
      { pattern: /contact|support|help/, path: '/contact', name: 'Contact' },
      { pattern: /login|signin|auth/, path: '/login', name: 'Login', requiresAuth: false },
      { pattern: /signup|register|create.?account/, path: '/signup', name: 'Sign Up', requiresAuth: false },
      { pattern: /dashboard|panel|overview/, path: '/dashboard', name: 'Dashboard', requiresAuth: true },
      { pattern: /profile|account|settings/, path: '/profile', name: 'Profile', requiresAuth: true },
      { pattern: /product|item|detail/, path: '/product/:id', name: 'Product Detail' },
      { pattern: /list|catalog|browse/, path: '/products', name: 'Product List' },
      { pattern: /cart|basket|checkout/, path: '/cart', name: 'Shopping Cart' }
    ];
    
    for (const { pattern, path, name, requiresAuth = false } of pagePatterns) {
      if (pattern.test(prompt)) {
        pages.push({
          path,
          name,
          components: [`${name.replace(/\s+/g, '')}Component`],
          requiresAuth,
          dataRequirements: requiresAuth ? ['userData'] : []
        });
      }
    }
    
    return pages.length > 0 ? pages : [{
      path: '/',
      name: 'Home',
      components: ['HomeComponent'],
      requiresAuth: false
    }];
  }

  _detectIntegrations(prompt) {
    const integrations = [];
    const services = {
      stripe: { type: 'api', config: { mode: 'test' }, secrets: ['STRIPE_SECRET_KEY'] },
      paypal: { type: 'api', config: { sandbox: true }, secrets: ['PAYPAL_CLIENT_ID', 'PAYPAL_SECRET'] },
      google: { type: 'oauth', config: { scopes: ['profile', 'email'] }, secrets: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'] },
      sendgrid: { type: 'api', secrets: ['SENDGRID_API_KEY'] },
      aws: { type: 'sdk', config: { region: 'us-east-1' }, secrets: ['AWS_ACCESS_KEY', 'AWS_SECRET_KEY'] }
    };
    
    for (const [service, config] of Object.entries(services)) {
      if (prompt.includes(service)) {
        integrations.push({ service, ...config });
      }
    }
    
    return integrations;
  }

  _calculateComplexity(semanticAnalysis) {
    let score = 0;
    
    // Base complexity from features
    for (const feature of semanticAnalysis.features || []) {
      const weight = this.complexityWeights[feature.type] || 10;
      const effortMultiplier = { xs: 0.5, s: 1, m: 2, l: 3, xl: 5 }[feature.estimatedEffort] || 1;
      score += weight * effortMultiplier;
    }
    
    // Add complexity from integrations
    if (semanticAnalysis.integrations) {
      score += semanticAnalysis.integrations.length * this.complexityWeights.thirdPartyAPIs;
    }
    
    // Add complexity from database schema
    if (semanticAnalysis.database?.schema?.length > 0) {
      score += semanticAnalysis.database.schema.length * 5;
    }
    
    // Normalize to 0-100 scale
    const normalizedScore = Math.min(100, Math.max(0, score));
    
    // Determine complexity level
    let complexity;
    if (normalizedScore < 25) complexity = 'low';
    else if (normalizedScore < 50) complexity = 'medium';
    else if (normalizedScore < 75) complexity = 'high';
    else complexity = 'enterprise';
    
    // Estimate file count based on complexity
    const baseFiles = { low: 15, medium: 45, high: 120, enterprise: 350 }[complexity];
    const featureMultiplier = 1 + ((semanticAnalysis.features?.length || 1) * 0.3);
    const estimatedFiles = Math.min(
      metadata.system.maxFilesPerProject,
      Math.floor(baseFiles * featureMultiplier)
    );
    
    return {
      level: complexity,
      score: normalizedScore,
      estimatedFiles,
      breakdown: {
        features: semanticAnalysis.features?.length || 0,
        pages: semanticAnalysis.pages?.length || 1,
        integrations: semanticAnalysis.integrations?.length || 0,
        databaseTables: semanticAnalysis.database?.schema?.length || 0
      }
    };
  }

  async _generateArchitecture(semanticAnalysis, complexity) {
    const { appType, features, pages, components = [], backend, database, apis, integrations } = semanticAnalysis;
    
    // Generate backend config
    const backendConfig = {
      framework: backend?.framework || (appType === 'api' ? 'fastify' : 'express'),
      authStrategy: backend?.authStrategy || (features.some(f => f.name.includes('Auth')) ? 'jwt' : 'none'),
      rateLimiting: backend?.rateLimiting ?? true,
      cors: backend?.cors || { enabled: true, origins: ['https://*.xova.pro'] },
      middleware: backend?.middleware || ['helmet', 'compression', 'cors', 'rateLimit']
    };
    
    // Generate database config
    const dbConfig = {
      type: database?.type || (complexity.level === 'enterprise' ? 'postgresql' : 'sqlite'),
      schema: database?.schema || [],
      migrations: database?.migrations ?? true,
      seeding: database?.seeding ?? false
    };
    
    // Generate API spec
    const apiSpec = {
      version: apis?.version || 'v1',
      baseUrl: `/api/${apis?.version || 'v1'}`,
      endpoints: apis?.endpoints || this._generateDefaultEndpoints(features, pages)
    };
    
    // Generate component architecture
    const componentArch = components.length > 0 ? components : this._generateDefaultComponents(pages, features);
    
    // Generate deployment config
    const deployment = {
      platform: 'vercel', // Default, can be overridden
      environment: 'production',
      buildCommand: complexity.level === 'enterprise' ? 'npm run build:enterprise' : 'npm run build',
      outputDirectory: complexity.level === 'mobile' ? 'dist/mobile' : 'dist'
    };
    
    return {
      architecture: {
        appType,
        complexity: complexity.level,
        estimatedFiles: complexity.estimatedFiles,
        estimatedComplexityScore: complexity.score
      },
      features: features || [],
      pages: pages || [],
      components: componentArch,
      backend: backendConfig,
      database: dbConfig,
      apis: apiSpec,
      integrations: integrations || [],
      deployment
    };
  }

  _generateDefaultEndpoints(features, pages) {
    const endpoints = [];
    
    // Auth endpoints if needed
    if (features.some(f => f.name.includes('Auth'))) {
      endpoints.push(
        { method: 'POST', path: '/auth/register', description: 'User registration', authRequired: false },
        { method: 'POST', path: '/auth/login', description: 'User authentication', authRequired: false },
        { method: 'GET', path: '/auth/me', description: 'Get current user', authRequired: true }
      );
    }
    
    // CRUD endpoints for common resources
    const resources = ['user', 'product', 'order', 'post'].filter(r => 
      JSON.stringify(features).toLowerCase().includes(r)
    );
    
    for (const resource of resources) {
      endpoints.push(
        { method: 'GET', path: `/${resource}s`, description: `List ${resource}s`, authRequired: false },
        { method: 'GET', path: `/${resource}s/:id`, description: `Get ${resource} by ID`, authRequired: false },
        { method: 'POST', path: `/${resource}s`, description: `Create new ${resource}`, authRequired: true },
        { method: 'PUT', path: `/${resource}s/:id`, description: `Update ${resource}`, authRequired: true },
        { method: 'DELETE', path: `/${resource}s/:id`, description: `Delete ${resource}`, authRequired: true }
      );
    }
    
    return endpoints.length > 0 ? endpoints : [
      { method: 'GET', path: '/health', description: 'Health check endpoint', authRequired: false }
    ];
  }

  _generateDefaultComponents(pages, features) {
    const components = [];
    
    // Base UI components
    components.push(
      { name: 'Button', type: 'ui', reusable: true, stateManagement: 'none' },
      { name: 'Input', type: 'ui', reusable: true, stateManagement: 'local' },
      { name: 'Card', type: 'ui', reusable: true, stateManagement: 'none' },
      { name: 'Modal', type: 'ui', reusable: true, stateManagement: 'context' }
    );
    
    // Page-specific components
    for (const page of pages) {
      components.push({
        name: `${page.name.replace(/\s+/g, '')}Component`,
        type: 'ui',
        reusable: false,
        stateManagement: page.requiresAuth ? 'context' : 'local'
      });
    }
    
    // Feature-specific components
    if (features.some(f => f.name.includes('Auth'))) {
      components.push(
        { name: 'AuthProvider', type: 'logic', stateManagement: 'context', reusable: true },
        { name: 'useAuth', type: 'hook', reusable: true }
      );
    }
    
    if (features.some(f => f.name.includes('Real-time'))) {
      components.push(
        { name: 'WebSocketService', type: 'service', reusable: true },
        { name: 'useWebSocket', type: 'hook', reusable: true }
      );
    }
    
    return components;
  }

  async _validateAndEnrich(architecture, promptHash) {
    try {
      // Validate against Zod schema
      const validated = PlanOutputSchema.parse(architecture);
      
      // Enrich with metadata
      validated.metadata = {
        promptHash,
        analysisTimestamp: Date.now(),
        confidenceScore: this._calculateConfidence(architecture),
        warnings: this._generateWarnings(architecture)
      };
      
      return validated;
    } catch (error) {
      if (error instanceof z.ZodError) {
        logger.error('Plan validation failed', { errors: error.errors });
        throw new Error(`Architecture plan validation failed: ${error.errors.map(e => e.message).join(', ')}`);
      }
      throw error;
    }
  }

  _calculateConfidence(architecture) {
    // Simple confidence scoring based on completeness
    let score = 1.0;
    
    if (!architecture.architecture?.complexity) score -= 0.2;
    if (!architecture.features?.length) score -= 0.15;
    if (!architecture.pages?.length) score -= 0.15;
    if (!architecture.backend?.framework) score -= 0.1;
    if (!architecture.database?.type) score -= 0.1;
    
    return Math.max(0, Math.min(1, score));
  }

  _generateWarnings(architecture) {
    const warnings = [];
    
    if (architecture.architecture.estimatedFiles > 500) {
      warnings.push('Large project size may impact generation time');
    }
    
    if (architecture.integrations?.some(i => !i.secrets)) {
      warnings.push('Some integrations may require manual API key configuration');
    }
    
    if (architecture.database.type === 'none' && architecture.features.some(f => f.type === 'database')) {
      warnings.push('Database features detected but no database configured');
    }
    
    if (architecture.backend.authStrategy === 'none' && architecture.pages.some(p => p.requiresAuth)) {
      warnings.push('Protected pages detected but authentication not configured');
    }
    
    return warnings;
  }

  _ruleBasedFallback(prompt, context) {
    // Comprehensive fallback when AI is unavailable
    const lower = prompt.toLowerCase();
    const appType = this._detectAppType(lower);
    const complexity = this._calculateComplexity({ 
      features: this._extractFeatures(lower),
      integrations: this._detectIntegrations(lower)
    });
    
    const plan = {
      architecture: {
        appType,
        complexity: complexity.level,
        estimatedFiles: complexity.estimatedFiles,
        estimatedComplexityScore: complexity.score
      },
      features: this._extractFeatures(lower),
      pages: this._extractPages(lower),
      components: this._generateDefaultComponents(this._extractPages(lower), this._extractFeatures(lower)),
      backend: {
        framework: appType === 'api' ? 'fastify' : 'express',
        authStrategy: /auth|login|user/.test(lower) ? 'jwt' : 'none',
        rateLimiting: true,
        cors: { enabled: true, origins: ['*'] },
        middleware: ['helmet', 'compression', 'cors']
      },
      database: {
        type: /database|store|persist/.test(lower) ? 'postgresql' : 'none',
        schema: [],
        migrations: true
      },
      apis: {
        version: 'v1',
        baseUrl: '/api/v1',
        endpoints: this._generateDefaultEndpoints(this._extractFeatures(lower), this._extractPages(lower))
      },
      integrations: this._detectIntegrations(lower),
      deployment: {
        platform: 'vercel',
        environment: 'production',
        buildCommand: 'npm run build',
        outputDirectory: 'dist'
      },
      metadata: {
        promptHash: this._hashPrompt(prompt),
        analysisTimestamp: Date.now(),
        confidenceScore: 0.75, // Lower confidence for fallback
        warnings: ['Using rule-based analysis - consider enabling AI for better results']
      }
    };
    
    return PlanOutputSchema.parse(plan);
  }

  _hashPrompt(prompt) {
    return crypto.createHash('sha256').update(prompt.trim().toLowerCase()).digest('hex').slice(0, 16);
  }
}

export default PromptPlanner;
