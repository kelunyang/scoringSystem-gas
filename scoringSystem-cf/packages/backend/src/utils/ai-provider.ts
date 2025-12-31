/**
 * @fileoverview AI Provider utility functions
 * Handles AI provider configuration and OpenAI-compatible API calls
 */

import type {
  AIProvider,
  AIProviderPublic,
  AIRankingPromptConfig,
  AIRankingItem,
  OpenAIChatCompletionRequest,
  OpenAIChatCompletionResponse,
  AIRankingJsonResponse
} from '@repo/shared';

/** KV key for AI providers configuration */
export const KV_KEY_AI_PROVIDERS = 'config:ai_providers';

/** KV key for AI ranking prompts */
export const KV_KEY_AI_RANKING_PROMPT = 'config:ai_ranking_prompt';

/** Default submission ranking prompt */
export const DEFAULT_SUBMISSION_PROMPT = `你是一個教育評分助手。請根據提供的成果內容進行質量排名。

評分標準：
1. 內容完整性和深度
2. 邏輯清晰度
3. 創新性和獨特見解
4. 表達質量`;

/** Default comment ranking prompt */
export const DEFAULT_COMMENT_PROMPT = `你是一個教育評分助手。請根據提供的評論內容進行質量排名。

評分標準：
1. 評論的建設性和深度
2. 對被評論內容的理解程度
3. 提出的改進建議是否具體可行
4. 表達的專業性和禮貌程度`;

/** Fixed JSON response instruction (not configurable) */
const JSON_INSTRUCTION = `

請以 JSON 格式回覆：
{
  "reason": "簡述你的排名理由（100字內）",
  "ranking": ["id1", "id2", "id3", ...]  // 從最好到最差排序
}`;

/** Default AI API timeout in milliseconds */
const DEFAULT_AI_TIMEOUT_MS = 60000; // 60 seconds

/** Extended timeout for reasoner models (5 minutes) */
const REASONER_TIMEOUT_MS = 300000; // 5 minutes

/** Providers that don't support response_format: { type: 'json_object' } */
const PROVIDERS_WITHOUT_JSON_MODE = ['gemini', 'google', 'generativelanguage'];

/**
 * Check if provider supports JSON response format
 * Gemini's OpenAI-compatible mode doesn't fully support response_format
 *
 * @param baseUrl - Provider's base URL
 * @returns true if provider supports json_object response format
 */
function supportsJsonMode(baseUrl: string): boolean {
  const lowerUrl = baseUrl.toLowerCase();
  return !PROVIDERS_WITHOUT_JSON_MODE.some(p => lowerUrl.includes(p));
}

/**
 * Check if provider is DeepSeek (supports reasoning_content)
 *
 * @param baseUrl - Provider's base URL
 * @returns true if provider is DeepSeek
 */
function isDeepSeekProvider(baseUrl: string): boolean {
  return baseUrl.toLowerCase().includes('deepseek');
}

/**
 * Check if model is a reasoner model (requires streaming and extended timeout)
 * DeepSeek Reasoner models include deepseek-reasoner, deepseek-r1, etc.
 *
 * @param model - Model name
 * @returns true if model is a reasoner model
 */
function isReasonerModel(model: string): boolean {
  const lowerModel = model.toLowerCase();
  return lowerModel.includes('reasoner') || lowerModel.includes('-r1');
}

/**
 * Check if provider is Azure OpenAI (requires different auth header)
 * Azure uses 'api-key' header instead of 'Authorization: Bearer'
 *
 * @param baseUrl - Provider's base URL
 * @returns true if provider is Azure OpenAI
 */
function isAzureOpenAI(baseUrl: string): boolean {
  const lower = baseUrl.toLowerCase();
  return lower.includes('.openai.azure.com') ||
         lower.includes('.cognitiveservices.azure.com');
}

/**
 * Parse Azure OpenAI URL to extract host and api-version
 * User provides full Azure URL like: https://xxx.cognitiveservices.azure.com/openai/responses?api-version=2025-04-01-preview
 * We extract the host and api-version to construct the correct chat/completions endpoint
 *
 * @param baseUrl - User-provided Azure URL
 * @returns Object with host and apiVersion
 */
function parseAzureUrl(baseUrl: string): { host: string; apiVersion: string } {
  try {
    const url = new URL(baseUrl);
    const host = `${url.protocol}//${url.host}`;
    const apiVersion = url.searchParams.get('api-version') || '2024-12-01-preview';
    return { host, apiVersion };
  } catch {
    // If URL parsing fails, return as-is with default api-version
    const hostPart = baseUrl.split('?')[0].replace(/\/+$/, '');
    return { host: hostPart, apiVersion: '2024-12-01-preview' };
  }
}

/**
 * Build authentication headers based on provider type
 *
 * @param baseUrl - Provider's base URL
 * @param apiKey - API key
 * @returns Headers object with appropriate auth header
 */
function buildAuthHeaders(baseUrl: string, apiKey: string): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (isAzureOpenAI(baseUrl)) {
    headers['api-key'] = apiKey;
  } else {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  return headers;
}

/**
 * Build API endpoint URL based on provider type
 * Azure: parse user's full URL to extract host and api-version, then construct chat/completions endpoint
 * Standard: append /chat/completions to baseUrl
 *
 * @param baseUrl - Provider's base URL (for Azure: full URL with api-version param)
 * @param model - Model name (used as deployment name for Azure)
 * @returns Full API endpoint URL
 */
function buildApiUrl(baseUrl: string, model?: string): string {
  if (isAzureOpenAI(baseUrl)) {
    // If user already included /chat/completions, use as-is (backwards compatibility)
    if (baseUrl.includes('/chat/completions')) {
      return baseUrl;
    }

    // Parse user's Azure URL to extract host and api-version
    // User provides: https://xxx.cognitiveservices.azure.com/openai/responses?api-version=2025-04-01-preview
    // We construct: https://xxx.cognitiveservices.azure.com/openai/deployments/{model}/chat/completions?api-version=2025-04-01-preview
    const { host, apiVersion } = parseAzureUrl(baseUrl);
    return `${host}/openai/deployments/${model}/chat/completions?api-version=${apiVersion}`;
  }

  // Standard OpenAI-compatible: append /chat/completions
  return baseUrl.endsWith('/')
    ? `${baseUrl}chat/completions`
    : `${baseUrl}/chat/completions`;
}

/**
 * Get all AI providers from KV
 *
 * @param kv - KVNamespace instance
 * @returns Array of AI providers
 */
export async function getAIProviders(kv: KVNamespace): Promise<AIProvider[]> {
  const providersJson = await kv.get(KV_KEY_AI_PROVIDERS);
  if (!providersJson) {
    return [];
  }

  try {
    return JSON.parse(providersJson) as AIProvider[];
  } catch {
    console.error('Failed to parse AI providers from KV');
    return [];
  }
}

/**
 * Get AI providers without sensitive apiKey (for frontend)
 *
 * @param kv - KVNamespace instance
 * @returns Array of public AI provider info
 */
export async function getAIProvidersPublic(kv: KVNamespace): Promise<AIProviderPublic[]> {
  const providers = await getAIProviders(kv);
  return providers.map(({ apiKey, ...rest }) => rest);
}

/**
 * Get enabled AI providers for frontend
 *
 * @param kv - KVNamespace instance
 * @returns Array of enabled public AI provider info
 */
export async function getEnabledAIProviders(kv: KVNamespace): Promise<AIProviderPublic[]> {
  const providers = await getAIProvidersPublic(kv);
  return providers.filter(p => p.enabled);
}

/**
 * Get a specific AI provider by ID
 *
 * @param kv - KVNamespace instance
 * @param providerId - Provider ID
 * @returns AI provider or null if not found
 */
export async function getAIProviderById(kv: KVNamespace, providerId: string): Promise<AIProvider | null> {
  const providers = await getAIProviders(kv);
  return providers.find(p => p.id === providerId) || null;
}

/**
 * Save AI providers to KV
 *
 * @param kv - KVNamespace instance
 * @param providers - Array of AI providers
 */
export async function saveAIProviders(kv: KVNamespace, providers: AIProvider[]): Promise<void> {
  await kv.put(KV_KEY_AI_PROVIDERS, JSON.stringify(providers));
}

/**
 * Add a new AI provider
 *
 * @param kv - KVNamespace instance
 * @param provider - Provider data (without id, createdAt, updatedAt)
 * @returns The created provider
 */
export async function addAIProvider(
  kv: KVNamespace,
  provider: Omit<AIProvider, 'id' | 'createdAt' | 'updatedAt'>
): Promise<AIProvider> {
  const providers = await getAIProviders(kv);

  // Generate unique ID from name
  const baseId = provider.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  // Ensure unique ID
  let id = baseId;
  let counter = 1;
  while (providers.some(p => p.id === id)) {
    id = `${baseId}-${counter}`;
    counter++;
  }

  const now = Date.now();
  const newProvider: AIProvider = {
    ...provider,
    id,
    createdAt: now,
    updatedAt: now
  };

  providers.push(newProvider);
  await saveAIProviders(kv, providers);

  return newProvider;
}

/**
 * Update an existing AI provider
 *
 * @param kv - KVNamespace instance
 * @param providerId - Provider ID to update
 * @param updates - Fields to update
 * @returns Updated provider or null if not found
 */
export async function updateAIProvider(
  kv: KVNamespace,
  providerId: string,
  updates: Partial<Omit<AIProvider, 'id' | 'createdAt' | 'updatedAt'>>
): Promise<AIProvider | null> {
  const providers = await getAIProviders(kv);
  const index = providers.findIndex(p => p.id === providerId);

  if (index === -1) {
    return null;
  }

  // Don't update apiKey if empty string is provided
  const cleanUpdates = { ...updates };
  if (cleanUpdates.apiKey === '') {
    delete cleanUpdates.apiKey;
  }

  providers[index] = {
    ...providers[index],
    ...cleanUpdates,
    updatedAt: Date.now()
  };

  await saveAIProviders(kv, providers);
  return providers[index];
}

/**
 * Delete an AI provider
 *
 * @param kv - KVNamespace instance
 * @param providerId - Provider ID to delete
 * @returns true if deleted, false if not found
 */
export async function deleteAIProvider(kv: KVNamespace, providerId: string): Promise<boolean> {
  const providers = await getAIProviders(kv);
  const index = providers.findIndex(p => p.id === providerId);

  if (index === -1) {
    return false;
  }

  providers.splice(index, 1);
  await saveAIProviders(kv, providers);
  return true;
}

/**
 * Get AI ranking prompt configuration from KV
 *
 * @param kv - KVNamespace instance
 * @returns Prompt configuration or null
 */
export async function getAIRankingPromptConfig(kv: KVNamespace): Promise<AIRankingPromptConfig | null> {
  const configJson = await kv.get(KV_KEY_AI_RANKING_PROMPT);
  if (!configJson) {
    return null;
  }

  try {
    return JSON.parse(configJson) as AIRankingPromptConfig;
  } catch {
    console.error('Failed to parse AI ranking prompt config from KV');
    return null;
  }
}

/**
 * Save AI ranking prompt configuration to KV
 *
 * @param kv - KVNamespace instance
 * @param config - Prompt configuration
 */
export async function saveAIRankingPromptConfig(
  kv: KVNamespace,
  config: AIRankingPromptConfig
): Promise<void> {
  await kv.put(KV_KEY_AI_RANKING_PROMPT, JSON.stringify(config));
}

/**
 * Build system prompt for AI ranking
 *
 * @param kv - KVNamespace instance
 * @param rankingType - 'submission' or 'comment'
 * @param userCustomPrompt - Optional user-provided custom prompt (max 100 chars)
 * @param stageDescription - Optional stage description to provide context
 * @returns Complete system prompt with JSON instruction
 */
export async function buildSystemPrompt(
  kv: KVNamespace,
  rankingType: 'submission' | 'comment',
  userCustomPrompt?: string,
  stageDescription?: string
): Promise<string> {
  const config = await getAIRankingPromptConfig(kv);

  let configPrompt: string | null = null;
  if (config) {
    configPrompt = rankingType === 'submission'
      ? config.submissionPrompt
      : config.commentPrompt;

    // Treat empty string as null
    if (configPrompt && configPrompt.trim() === '') {
      configPrompt = null;
    }
  }

  // Use config prompt or default
  const basePrompt = configPrompt ||
    (rankingType === 'submission' ? DEFAULT_SUBMISSION_PROMPT : DEFAULT_COMMENT_PROMPT);

  let finalPrompt = basePrompt;

  // Append stage description if provided
  if (stageDescription && stageDescription.trim()) {
    finalPrompt += `\n\n本階段中，所有學生拿到的指示為：\n---\n${stageDescription.trim()}\n---`;
  }

  // Append user's custom prompt if provided
  if (userCustomPrompt && userCustomPrompt.trim()) {
    finalPrompt += `\n\n額外評分要求：${userCustomPrompt.trim()}`;
  }

  // Append fixed JSON instruction
  return finalPrompt + JSON_INSTRUCTION;
}

/**
 * Build user prompt for AI ranking
 *
 * @param items - Items to rank
 * @param rankingType - 'submission' or 'comment'
 * @param maxCommentSelections - For comment mode: how many comments AI should select and rank
 * @returns User prompt string
 */
export function buildUserPrompt(
  items: AIRankingItem[],
  rankingType: 'submission' | 'comment',
  maxCommentSelections?: number
): string {
  const typeLabel = rankingType === 'submission' ? '成果' : '評論';

  const itemsText = items.map((item) => {
    const metaParts: string[] = [];
    if (item.metadata.groupName) {
      metaParts.push(`組別: ${item.metadata.groupName}`);
    }
    if (item.metadata.authorName) {
      metaParts.push(`作者: ${item.metadata.authorName}`);
    }
    if (item.metadata.memberNames && item.metadata.memberNames.length > 0) {
      metaParts.push(`成員: ${item.metadata.memberNames.join(', ')}`);
    }

    // Add comment-specific metadata (replies and reactions)
    if (rankingType === 'comment') {
      // Add reactions summary
      if (item.metadata.reactions) {
        const helpfulCount = item.metadata.reactions.helpful?.length || 0;
        const disagreedCount = item.metadata.reactions.disagreed?.length || 0;
        if (helpfulCount > 0 || disagreedCount > 0) {
          const reactionParts: string[] = [];
          if (helpfulCount > 0) {
            reactionParts.push(`${helpfulCount} 人認為有幫助`);
          }
          if (disagreedCount > 0) {
            reactionParts.push(`${disagreedCount} 人不同意`);
          }
          metaParts.push(`反應: ${reactionParts.join(', ')}`);
        }
      }

      // Add replies content
      if (item.metadata.replies && item.metadata.replies.length > 0) {
        metaParts.push(`回覆討論串 (${item.metadata.replies.length} 則):`);
        item.metadata.replies.forEach((reply, idx) => {
          metaParts.push(`  ${idx + 1}. ${reply}`);
        });
      }
    }

    return `
---
ID: ${item.id}
${metaParts.join('\n')}
內容:
${item.content}
---`;
  }).join('\n');

  // For comment mode with selection: AI needs to pick top N comments
  if (rankingType === 'comment' && maxCommentSelections && maxCommentSelections < items.length) {
    return `請從以下 ${items.length} 個評論中，挑選出最優秀的 ${maxCommentSelections} 個評論並排名。

評論資料包含：
- 評論內容
- 回覆討論串（如有）
- 反應（哪些用戶認為有幫助/不同意）

請根據評論的建設性、深度、討論互動情況等因素，選出最值得獎勵的評論。

${itemsText}`;
  }

  return `請分析以下 ${items.length} 個${typeLabel}並排名：
${itemsText}`;
}

/**
 * DeepSeek response message with reasoning_content
 */
interface DeepSeekMessage {
  role: string;
  content: string;
  reasoning_content?: string;
}

/**
 * DeepSeek streaming delta with reasoning_content
 */
interface DeepSeekStreamDelta {
  role?: string;
  content?: string;
  reasoning_content?: string;
}

/**
 * SSE stream chunk structure
 */
interface SSEStreamChunk {
  choices?: Array<{
    delta?: DeepSeekStreamDelta;
    finish_reason?: string | null;
  }>;
}

/**
 * Call OpenAI-compatible API with streaming for reasoner models
 * Uses SSE to handle long-running reasoning tasks with keep-alive support
 *
 * @param baseUrl - API base URL
 * @param apiKey - API key
 * @param model - Model name
 * @param systemPrompt - System prompt
 * @param userPrompt - User prompt
 * @param timeoutMs - Timeout in milliseconds
 * @returns Parsed AI ranking response
 */
async function callAIProviderStreaming(
  baseUrl: string,
  apiKey: string,
  model: string,
  systemPrompt: string,
  userPrompt: string,
  timeoutMs: number
): Promise<AIRankingJsonResponse> {
  // Build URL (Azure vs Standard) - pass model for Azure deployment name
  const url = buildApiUrl(baseUrl, model);

  // Build request body for streaming (no response_format for reasoner)
  const requestBody = {
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    stream: true
  };

  // Setup timeout using AbortController
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: buildAuthHeaders(baseUrl, apiKey),
      body: JSON.stringify(requestBody),
      signal: controller.signal
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI API streaming error:', response.status, errorText);
      throw new Error(`AI API error: ${response.status} - ${errorText}`);
    }

    if (!response.body) {
      throw new Error('AI API returned no response body for streaming');
    }

    // Parse SSE stream
    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    let reasoningContent = '';
    let content = '';
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');

      // Keep the last incomplete line in buffer
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmedLine = line.trim();

        // Skip empty lines and keep-alive comments
        if (trimmedLine === '' || trimmedLine.startsWith(': keep-alive') || trimmedLine === ':') {
          continue;
        }

        // End of stream
        if (trimmedLine === 'data: [DONE]') {
          break;
        }

        // Parse data line
        if (trimmedLine.startsWith('data: ')) {
          try {
            const jsonStr = trimmedLine.slice(6);
            const data = JSON.parse(jsonStr) as SSEStreamChunk;
            const delta = data.choices?.[0]?.delta;

            if (delta?.reasoning_content) {
              reasoningContent += delta.reasoning_content;
            }
            if (delta?.content) {
              content += delta.content;
            }
          } catch (parseError) {
            // Skip malformed JSON chunks (can happen with partial data)
            console.warn('Failed to parse SSE chunk:', trimmedLine);
          }
        }
      }
    }

    // Parse the accumulated content as JSON
    try {
      const parsed = JSON.parse(content) as AIRankingJsonResponse;

      // Validate response structure
      if (!parsed.reason || !Array.isArray(parsed.ranking)) {
        throw new Error('Invalid AI response structure');
      }

      // Include thinkingProcess from streaming
      return {
        ...parsed,
        thinkingProcess: reasoningContent || parsed.thinkingProcess
      };
    } catch (parseError) {
      console.error('Failed to parse AI streaming response:', content);
      throw new Error(`Failed to parse AI response: ${parseError}`);
    }
  } catch (error) {
    // Handle abort/timeout
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`AI API timeout after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Call OpenAI-compatible API
 *
 * @param baseUrl - API base URL
 * @param apiKey - API key
 * @param model - Model name
 * @param systemPrompt - System prompt
 * @param userPrompt - User prompt
 * @param timeoutMs - Timeout in milliseconds (default 60000, or 300000 for reasoner models)
 * @returns Parsed AI ranking response
 */
export async function callAIProvider(
  baseUrl: string,
  apiKey: string,
  model: string,
  systemPrompt: string,
  userPrompt: string,
  timeoutMs?: number
): Promise<AIRankingJsonResponse> {
  // Use extended timeout for reasoner models
  const effectiveTimeout = timeoutMs ?? (isReasonerModel(model) ? REASONER_TIMEOUT_MS : DEFAULT_AI_TIMEOUT_MS);

  // Use streaming for reasoner models to handle long-running reasoning tasks
  if (isReasonerModel(model)) {
    return callAIProviderStreaming(baseUrl, apiKey, model, systemPrompt, userPrompt, effectiveTimeout);
  }

  // Build URL (Azure vs Standard) - pass model for Azure deployment name
  const url = buildApiUrl(baseUrl, model);

  // Build request body with conditional response_format
  const requestBody: OpenAIChatCompletionRequest = {
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    // Azure reasoning models (o1, o3-mini, gpt-5-mini) don't support temperature
    ...(!isAzureOpenAI(baseUrl) && { temperature: 0.3 }),
    // Only include response_format for providers that support it (not Azure or Gemini)
    ...(!isAzureOpenAI(baseUrl) && supportsJsonMode(baseUrl) && {
      response_format: { type: 'json_object' }
    })
  };

  // Setup timeout using AbortController
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), effectiveTimeout);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: buildAuthHeaders(baseUrl, apiKey),
      body: JSON.stringify(requestBody),
      signal: controller.signal
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI API error:', response.status, errorText);
      throw new Error(`AI API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json() as OpenAIChatCompletionResponse;

    if (!data.choices || data.choices.length === 0) {
      throw new Error('AI API returned no choices');
    }

    const message = data.choices[0].message as DeepSeekMessage;
    const content = message.content;

    // Extract DeepSeek reasoning_content if available
    let thinkingProcess: string | undefined;
    if (isDeepSeekProvider(baseUrl) && message.reasoning_content) {
      thinkingProcess = message.reasoning_content;
    }

    // Parse JSON response
    try {
      const parsed = JSON.parse(content) as AIRankingJsonResponse;

      // Validate response structure
      if (!parsed.reason || !Array.isArray(parsed.ranking)) {
        throw new Error('Invalid AI response structure');
      }

      // Include thinkingProcess from DeepSeek and usage if available
      return {
        ...parsed,
        thinkingProcess: thinkingProcess || parsed.thinkingProcess,
        usage: data.usage ? {
          prompt_tokens: data.usage.prompt_tokens,
          completion_tokens: data.usage.completion_tokens,
          total_tokens: data.usage.total_tokens
        } : undefined
      };
    } catch (parseError) {
      console.error('Failed to parse AI response:', content);
      throw new Error(`Failed to parse AI response: ${parseError}`);
    }
  } catch (error) {
    // Handle abort/timeout
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`AI API timeout after ${effectiveTimeout}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Generate a unique query ID
 *
 * @returns Query ID string
 */
export function generateQueryId(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `${timestamp}_${random}`;
}

/** Test connection timeout in milliseconds */
const TEST_CONNECTION_TIMEOUT_MS = 15000; // 15 seconds

/**
 * Test AI provider connection result
 */
export interface TestConnectionResult {
  success: boolean;
  responseTimeMs: number;
  message: string;
  error?: string;
}

/**
 * Test AI provider connection with a simple prompt
 * Uses shorter timeout since we just want to verify connectivity
 *
 * @param baseUrl - API base URL
 * @param apiKey - API key
 * @param model - Model name
 * @returns Test result with response time or error
 */
export async function testAIProviderConnection(
  baseUrl: string,
  apiKey: string,
  model: string
): Promise<TestConnectionResult> {
  const startTime = Date.now();
  const url = buildApiUrl(baseUrl, model);

  // Simple test prompt - just verify we can get any response
  const requestBody: Record<string, unknown> = {
    model,
    messages: [
      { role: 'system', content: 'You are a test assistant. Respond with exactly: OK' },
      { role: 'user', content: 'Test' }
    ]
  };

  // Azure reasoning models (o1, o3-mini, gpt-5-mini) don't support temperature
  // They also require max_completion_tokens instead of max_tokens
  if (isAzureOpenAI(baseUrl)) {
    requestBody.max_completion_tokens = 10;
  } else {
    requestBody.max_tokens = 10;
    requestBody.temperature = 0;
  }

  // Setup timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TEST_CONNECTION_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: buildAuthHeaders(baseUrl, apiKey),
      body: JSON.stringify(requestBody),
      signal: controller.signal
    });

    const responseTimeMs = Date.now() - startTime;

    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        responseTimeMs,
        message: 'Connection failed',
        error: `HTTP ${response.status}: ${errorText.substring(0, 200)}`
      };
    }

    // Just verify we got a valid JSON response
    const data = await response.json() as { choices?: Array<unknown> };

    if (!data.choices || data.choices.length === 0) {
      return {
        success: false,
        responseTimeMs,
        message: 'Invalid response',
        error: 'API returned no choices'
      };
    }

    return {
      success: true,
      responseTimeMs,
      message: 'Connection successful'
    };
  } catch (error) {
    const responseTimeMs = Date.now() - startTime;

    if (error instanceof Error && error.name === 'AbortError') {
      return {
        success: false,
        responseTimeMs,
        message: 'Connection timeout',
        error: `Request timed out after ${TEST_CONNECTION_TIMEOUT_MS}ms`
      };
    }

    return {
      success: false,
      responseTimeMs,
      message: 'Connection error',
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  } finally {
    clearTimeout(timeoutId);
  }
}
