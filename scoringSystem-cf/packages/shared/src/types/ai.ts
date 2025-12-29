/**
 * @fileoverview AI service type definitions
 * Types for AI-powered ranking suggestions
 */

/**
 * AI Provider configuration stored in KV
 */
export interface AIProvider {
  /** Unique identifier (e.g., "deepseek-v3", "qwen-max") */
  id: string;
  /** Display name (e.g., "DeepSeek V3", "通義千問") */
  name: string;
  /** API Base URL (e.g., "https://api.deepseek.com") */
  baseUrl: string;
  /** Model name (e.g., "deepseek-chat", "qwen-max") */
  model: string;
  /** API Key (only stored in KV, never exposed to frontend) */
  apiKey: string;
  /** Whether this provider is enabled */
  enabled: boolean;
  /** Creation timestamp */
  createdAt: number;
  /** Last update timestamp */
  updatedAt: number;
}

/**
 * AI Provider info exposed to frontend (without apiKey)
 */
export interface AIProviderPublic {
  id: string;
  name: string;
  baseUrl: string;
  model: string;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
}

/**
 * AI Ranking Prompt configuration stored in KV
 */
export interface AIRankingPromptConfig {
  /** System prompt for submission ranking */
  submissionPrompt: string;
  /** System prompt for comment ranking */
  commentPrompt: string;
}

/**
 * AI Suggestion request item
 */
export interface AIRankingItem {
  /** Item ID (submissionId or commentId) */
  id: string;
  /** Item content (reportContent or comment content) */
  content: string;
  /** Item metadata */
  metadata: {
    groupName?: string;
    authorName?: string;
    memberNames?: string[];
  };
}

/**
 * AI Suggestion API request
 */
export interface AIRankingSuggestionRequest {
  projectId: string;
  stageId: string;
  rankingType: 'submission' | 'comment';
  providerId: string;
  items: AIRankingItem[];
  /** Custom prompt from user (max 30 chars) */
  customPrompt?: string;
}

/**
 * AI Suggestion API response data
 */
export interface AIRankingSuggestionResult {
  /** Unique query identifier */
  queryId: string;
  /** AI provider ID */
  providerId: string;
  /** AI provider display name */
  providerName: string;
  /** Model used */
  model: string;
  /** AI's ranking reason */
  reason: string;
  /** Ranked item IDs (best to worst) */
  ranking: string[];
  /** Query timestamp */
  createdAt: number;
  /** DeepSeek Thinking mode reasoning process (optional) */
  thinkingProcess?: string;
  /** Custom prompt used in this query */
  customPrompt?: string;
  /** Full prompt sent to AI (system + user prompt) */
  fullPrompt?: string;
}

/**
 * AI Query result stored in localStorage
 */
export interface AIQueryHistoryItem {
  /** Unique query identifier */
  queryId: string;
  /** Provider ID */
  providerId: string;
  /** Provider display name */
  providerName: string;
  /** Model used */
  model: string;
  /** AI's ranking reason */
  reason: string;
  /** Ranked item IDs */
  ranking: string[];
  /** Query timestamp */
  createdAt: number;
  /** Number of items queried */
  itemCount: number;
  /** DeepSeek Thinking mode reasoning process (optional) */
  thinkingProcess?: string;
  /** Custom prompt used in this query */
  customPrompt?: string;
  /** Full prompt sent to AI (system + user prompt) */
  fullPrompt?: string;
}

/**
 * AI Query history storage structure (localStorage)
 */
export interface AIQueryHistoryStorage {
  [userId: string]: {
    [stageId: string]: {
      submission: AIQueryHistoryItem[];
      comment: AIQueryHistoryItem[];
    };
  };
}

/**
 * OpenAI-compatible chat message format
 */
export interface OpenAIChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * OpenAI-compatible chat completion request
 */
export interface OpenAIChatCompletionRequest {
  model: string;
  messages: OpenAIChatMessage[];
  temperature?: number;
  max_tokens?: number;
  response_format?: {
    type: 'json_object' | 'text';
  };
}

/**
 * OpenAI-compatible chat completion response
 */
export interface OpenAIChatCompletionResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * AI ranking JSON response format
 */
export interface AIRankingJsonResponse {
  reason: string;
  ranking: string[];
  /** DeepSeek Thinking mode reasoning process (extracted from response) */
  thinkingProcess?: string;
}
