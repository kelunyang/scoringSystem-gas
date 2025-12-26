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
 * @param userCustomPrompt - Optional user-provided custom prompt (max 30 chars)
 * @returns Complete system prompt with JSON instruction
 */
export async function buildSystemPrompt(
  kv: KVNamespace,
  rankingType: 'submission' | 'comment',
  userCustomPrompt?: string
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
 * @returns User prompt string
 */
export function buildUserPrompt(
  items: AIRankingItem[],
  rankingType: 'submission' | 'comment'
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

    return `
---
ID: ${item.id}
${metaParts.join('\n')}
內容:
${item.content}
---`;
  }).join('\n');

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
 * Call OpenAI-compatible API
 *
 * @param baseUrl - API base URL
 * @param apiKey - API key
 * @param model - Model name
 * @param systemPrompt - System prompt
 * @param userPrompt - User prompt
 * @param timeoutMs - Timeout in milliseconds (default 60000)
 * @returns Parsed AI ranking response
 */
export async function callAIProvider(
  baseUrl: string,
  apiKey: string,
  model: string,
  systemPrompt: string,
  userPrompt: string,
  timeoutMs: number = DEFAULT_AI_TIMEOUT_MS
): Promise<AIRankingJsonResponse> {
  // Ensure baseUrl ends properly for chat completions endpoint
  const url = baseUrl.endsWith('/')
    ? `${baseUrl}chat/completions`
    : `${baseUrl}/chat/completions`;

  // Build request body with conditional response_format
  const requestBody: OpenAIChatCompletionRequest = {
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    temperature: 0.3,
    // Only include response_format for providers that support it
    ...(supportsJsonMode(baseUrl) && {
      response_format: { type: 'json_object' }
    })
  };

  // Setup timeout using AbortController
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
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

      // Include thinkingProcess from DeepSeek if available
      return {
        ...parsed,
        thinkingProcess: thinkingProcess || parsed.thinkingProcess
      };
    } catch (parseError) {
      console.error('Failed to parse AI response:', content);
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
 * Generate a unique query ID
 *
 * @returns Query ID string
 */
export function generateQueryId(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `${timestamp}_${random}`;
}
