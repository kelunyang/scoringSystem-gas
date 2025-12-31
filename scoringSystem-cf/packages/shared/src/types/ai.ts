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
    /** Group name (for submissions) */
    groupName?: string;
    /** Author name (for comments) */
    authorName?: string;
    /** Team member names (for submissions) */
    memberNames?: string[];
    /** Full reply content array (for comments) */
    replies?: string[];
    /** Reaction user lists (for comments) */
    reactions?: {
      /** Array of user emails who marked helpful */
      helpful?: string[];
      /** Array of user emails who disagreed */
      disagreed?: string[];
    };
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
  /** Token usage from AI API (if available) */
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

// ============================================
// Bradley-Terry Model Types
// ============================================

/**
 * BT strength parameters (ability values)
 * Key: item ID, Value: strength parameter (log-scale)
 */
export type BTStrengthParams = Record<string, number>;

/**
 * BT ranking progress data (for WebSocket updates)
 * Note: BTComparison is defined in schemas/rankings.ts
 */
export interface BTRankingProgressData {
  /** Task ID for tracking */
  taskId: string;
  /** Project ID */
  projectId: string;
  /** Stage ID */
  stageId: string;
  /** Task status */
  status: 'pending' | 'processing' | 'completed' | 'failed';
  /** Progress percentage (0-100) */
  progress: number;
  /** Current comparison number */
  currentComparison: number;
  /** Total comparisons needed */
  totalComparisons: number;
  /** Progress message for UI display */
  message: string;
  /** Current comparison being processed (optional) */
  currentPair?: { itemA: string; itemB: string };
}

/**
 * AI ranking progress data (for WebSocket updates - direct mode)
 */
export interface AIRankingProgressData {
  /** Task ID for tracking */
  taskId: string;
  /** Project ID */
  projectId: string;
  /** Stage ID */
  stageId: string;
  /** Task status */
  status: 'pending' | 'processing' | 'completed' | 'failed';
  /** Progress message for UI display */
  message: string;
  /** Streaming content (optional, for real-time AI response display) */
  streamContent?: string;
}

// ============================================
// Multi-Agent Free-MAD Types
// ============================================

/**
 * Individual provider result in Multi-Agent mode
 */
export interface MultiAgentProviderResult {
  /** Provider ID */
  providerId: string;
  /** Provider display name */
  providerName: string;
  /** Round 1 result (independent ranking) */
  round1?: {
    ranking: string[];
    reason: string;
  };
  /** Round 2 result (after debate) */
  round2?: {
    ranking: string[];
    reason: string;
    changed: boolean;
    critique?: string;
  };
  /** Provider status */
  status: 'pending' | 'processing' | 'completed' | 'failed';
  /** Error message if failed */
  errorMessage?: string;
}

/**
 * Multi-Agent debate details for final result
 */
export interface MultiAgentDebateDetail {
  /** Provider ID */
  providerId: string;
  /** Provider display name */
  providerName: string;
  /** Round 1 ranking */
  round1Ranking: string[];
  /** Round 1 reason */
  round1Reason: string;
  /** Round 2 ranking */
  round2Ranking: string[];
  /** Round 2 reason */
  round2Reason: string;
  /** Whether position changed in Round 2 */
  changed: boolean;
  /** Critique of other rankings */
  critique?: string;
}

/**
 * Multi-Agent progress data (for WebSocket updates)
 */
export interface MultiAgentProgressData {
  /** Task ID for tracking */
  taskId: string;
  /** Main call ID (parent) */
  callId: string;
  /** Project ID */
  projectId: string;
  /** Stage ID */
  stageId: string;
  /** Task status */
  status: 'pending' | 'round1' | 'round2' | 'aggregating' | 'completed' | 'failed';
  /** Progress percentage (0-100) */
  progress: number;
  /** Current debate round (1 or 2) */
  currentRound?: 1 | 2;
  /** Progress message for UI display */
  message: string;
  /** Results from each provider */
  providerResults?: MultiAgentProviderResult[];
  /** Final aggregated result */
  result?: {
    /** Final ranking */
    ranking: string[];
    /** Combined reason */
    reason: string;
    /** Score for each item */
    scores?: Record<string, number>;
    /** Detailed debate results from each provider */
    debateDetails: MultiAgentDebateDetail[];
  };
}

/**
 * Free-MAD scoring weights configuration
 */
export interface FreeMadWeights {
  /** Initial Borda score weight for Round 1 */
  W_INITIAL: number;
  /** Bonus for persisting with original ranking in Round 2 */
  W_PERSIST: number;
  /** Penalty for changing position in Round 2 */
  W_CHANGE: number;
  /** Bonus when other agents adopt your ranking */
  W_ADOPTED: number;
}

// ============================================
// AI Service Database Record Types
// Note: AIServiceType, AIServiceCallStatus, AIServiceCallRecord,
// BTComparison, BTRankingSuggestionRequest, AIRankingHistoryQuery
// are defined in schemas/rankings.ts to avoid duplication
// ============================================

/**
 * AI service call record with parsed JSON fields (for frontend display)
 * Imports types from schemas/rankings.ts
 */
export interface AIServiceCallRecordParsed {
  /** Unique call ID (e.g., "aisc_xxx") */
  callId: string;
  /** Project ID */
  projectId: string;
  /** Stage ID (optional for project-level services) */
  stageId?: string;
  /** Requester email */
  userEmail: string;
  /** Service type */
  serviceType: 'ranking_direct' | 'ranking_bt' | 'ranking_multi_agent' | 'summary' | 'translation' | 'feedback';
  /** Ranking type (only for ranking services) */
  rankingType?: 'submission' | 'comment';
  /** Provider ID */
  providerId: string;
  /** Provider display name */
  providerName: string;
  /** Model used */
  model: string;
  /** Number of items processed */
  itemCount?: number;
  /** User-provided custom prompt */
  customPrompt?: string;
  /** Call status */
  status: 'pending' | 'processing' | 'success' | 'failed' | 'timeout';
  /** Parsed ranking result */
  result?: string[];
  /** AI explanation/reasoning */
  reason?: string;
  /** AI thinking process (for DeepSeek reasoning mode) */
  thinkingProcess?: string;
  /** Error message if failed */
  errorMessage?: string;
  /** Parsed BT comparisons */
  btComparisons?: Array<{
    index: number;
    itemA: string;
    itemB: string;
    winner?: string;
    reason?: string;
  }>;
  /** Parsed BT strength parameters */
  btStrengthParams?: BTStrengthParams;
  /** Request tokens used */
  requestTokens?: number;
  /** Response tokens used */
  responseTokens?: number;
  /** Total tokens used */
  totalTokens?: number;
  /** Response time in milliseconds */
  responseTimeMs?: number;
  /** Creation timestamp (UNIX ms) */
  createdAt: number;
  /** Completion timestamp (UNIX ms) */
  completedAt?: number;
}
