/**
 * @fileoverview AI Providers management handlers
 * CRUD operations for AI service configurations
 */

import type { Env } from '../../types';
import type { AIProvider, AIRankingPromptConfig } from '@repo/shared';
import { successResponse, errorResponse, ERROR_CODES } from '../../utils/response';
import {
  getAIProvidersPublic,
  getAIProviders,
  getAIProviderById,
  addAIProvider,
  updateAIProvider,
  deleteAIProvider,
  getAIRankingPromptConfig,
  saveAIRankingPromptConfig,
  testAIProviderConnection,
  DEFAULT_SUBMISSION_PROMPT,
  DEFAULT_COMMENT_PROMPT
} from '../../utils/ai-provider';

/**
 * List all AI providers (without apiKey)
 *
 * @param env - Cloudflare Workers environment
 * @returns List of AI providers
 */
export async function listAIProviders(env: Env): Promise<Response> {
  try {
    const providers = await getAIProvidersPublic(env.KV);

    return successResponse({
      providers
    });
  } catch (error) {
    console.error('List AI providers error:', error);
    return errorResponse(
      ERROR_CODES.INTERNAL_ERROR,
      'Failed to list AI providers'
    );
  }
}

/**
 * Create a new AI provider
 *
 * @param env - Cloudflare Workers environment
 * @param data - Provider data
 * @returns Created provider (without apiKey)
 */
export async function createAIProvider(
  env: Env,
  data: {
    name: string;
    baseUrl: string;
    model: string;
    apiKey: string;
    enabled: boolean;
  }
): Promise<Response> {
  try {
    // Validate required fields
    if (!data.name || !data.baseUrl || !data.model || !data.apiKey) {
      return errorResponse(
        ERROR_CODES.VALIDATION_ERROR,
        'Missing required fields: name, baseUrl, model, apiKey'
      );
    }

    // Check for duplicate name
    const existingProviders = await getAIProviders(env.KV);
    if (existingProviders.some(p => p.name === data.name)) {
      return errorResponse(
        ERROR_CODES.VALIDATION_ERROR,
        'AI provider with this name already exists'
      );
    }

    const newProvider = await addAIProvider(env.KV, {
      name: data.name,
      baseUrl: data.baseUrl,
      model: data.model,
      apiKey: data.apiKey,
      enabled: data.enabled ?? true
    });

    // Return without apiKey
    const { apiKey, ...publicProvider } = newProvider;

    return successResponse({
      provider: publicProvider,
      message: 'AI provider created successfully'
    });
  } catch (error) {
    console.error('Create AI provider error:', error);
    return errorResponse(
      ERROR_CODES.INTERNAL_ERROR,
      'Failed to create AI provider'
    );
  }
}

/**
 * Update an existing AI provider
 *
 * @param env - Cloudflare Workers environment
 * @param providerId - Provider ID
 * @param data - Fields to update
 * @returns Updated provider (without apiKey)
 */
export async function updateAIProviderHandler(
  env: Env,
  providerId: string,
  data: Partial<{
    name: string;
    baseUrl: string;
    model: string;
    apiKey: string;
    enabled: boolean;
  }>
): Promise<Response> {
  try {
    if (!providerId) {
      return errorResponse(
        ERROR_CODES.VALIDATION_ERROR,
        'Provider ID is required'
      );
    }

    // Check if changing to a duplicate name
    if (data.name) {
      const existingProviders = await getAIProviders(env.KV);
      const duplicate = existingProviders.find(
        p => p.name === data.name && p.id !== providerId
      );
      if (duplicate) {
        return errorResponse(
          ERROR_CODES.VALIDATION_ERROR,
          'AI provider with this name already exists'
        );
      }
    }

    const updatedProvider = await updateAIProvider(env.KV, providerId, data);

    if (!updatedProvider) {
      return errorResponse(
        ERROR_CODES.NOT_FOUND,
        'AI provider not found'
      );
    }

    // Return without apiKey
    const { apiKey, ...publicProvider } = updatedProvider;

    return successResponse({
      provider: publicProvider,
      message: 'AI provider updated successfully'
    });
  } catch (error) {
    console.error('Update AI provider error:', error);
    return errorResponse(
      ERROR_CODES.INTERNAL_ERROR,
      'Failed to update AI provider'
    );
  }
}

/**
 * Delete an AI provider
 *
 * @param env - Cloudflare Workers environment
 * @param providerId - Provider ID
 * @returns Success/error response
 */
export async function deleteAIProviderHandler(
  env: Env,
  providerId: string
): Promise<Response> {
  try {
    if (!providerId) {
      return errorResponse(
        ERROR_CODES.VALIDATION_ERROR,
        'Provider ID is required'
      );
    }

    const deleted = await deleteAIProvider(env.KV, providerId);

    if (!deleted) {
      return errorResponse(
        ERROR_CODES.NOT_FOUND,
        'AI provider not found'
      );
    }

    return successResponse({
      message: 'AI provider deleted successfully'
    });
  } catch (error) {
    console.error('Delete AI provider error:', error);
    return errorResponse(
      ERROR_CODES.INTERNAL_ERROR,
      'Failed to delete AI provider'
    );
  }
}

/**
 * Get AI ranking prompt configuration
 *
 * @param env - Cloudflare Workers environment
 * @returns Prompt configuration with defaults
 */
export async function getAIPromptConfig(env: Env): Promise<Response> {
  try {
    const config = await getAIRankingPromptConfig(env.KV);

    return successResponse({
      submissionPrompt: config?.submissionPrompt || '',
      commentPrompt: config?.commentPrompt || '',
      defaults: {
        submissionPrompt: DEFAULT_SUBMISSION_PROMPT,
        commentPrompt: DEFAULT_COMMENT_PROMPT
      }
    });
  } catch (error) {
    console.error('Get AI prompt config error:', error);
    return errorResponse(
      ERROR_CODES.INTERNAL_ERROR,
      'Failed to get AI prompt configuration'
    );
  }
}

/**
 * Update AI ranking prompt configuration
 *
 * @param env - Cloudflare Workers environment
 * @param data - Prompt configuration
 * @returns Updated configuration
 */
export async function updateAIPromptConfig(
  env: Env,
  data: Partial<AIRankingPromptConfig>
): Promise<Response> {
  try {
    // Get existing config
    const existingConfig = await getAIRankingPromptConfig(env.KV);

    const newConfig: AIRankingPromptConfig = {
      submissionPrompt: data.submissionPrompt ?? existingConfig?.submissionPrompt ?? '',
      commentPrompt: data.commentPrompt ?? existingConfig?.commentPrompt ?? ''
    };

    await saveAIRankingPromptConfig(env.KV, newConfig);

    return successResponse({
      submissionPrompt: newConfig.submissionPrompt,
      commentPrompt: newConfig.commentPrompt,
      message: 'AI prompt configuration updated successfully'
    });
  } catch (error) {
    console.error('Update AI prompt config error:', error);
    return errorResponse(
      ERROR_CODES.INTERNAL_ERROR,
      'Failed to update AI prompt configuration'
    );
  }
}

/**
 * Test AI provider connection
 *
 * @param env - Cloudflare Workers environment
 * @param providerId - Provider ID to test
 * @returns Test result with response time or error
 */
export async function testAIProviderHandler(
  env: Env,
  providerId: string
): Promise<Response> {
  try {
    if (!providerId) {
      return errorResponse(
        ERROR_CODES.VALIDATION_ERROR,
        'Provider ID is required'
      );
    }

    // Get provider with apiKey
    const provider = await getAIProviderById(env.KV, providerId);

    if (!provider) {
      return errorResponse(
        ERROR_CODES.NOT_FOUND,
        'AI provider not found'
      );
    }

    if (!provider.enabled) {
      return errorResponse(
        ERROR_CODES.VALIDATION_ERROR,
        'AI provider is disabled'
      );
    }

    // Test connection
    const result = await testAIProviderConnection(
      provider.baseUrl,
      provider.apiKey,
      provider.model
    );

    if (result.success) {
      return successResponse({
        providerId: provider.id,
        providerName: provider.name,
        model: provider.model,
        responseTimeMs: result.responseTimeMs,
        message: result.message
      });
    } else {
      return errorResponse(
        'AI_CONNECTION_FAILED',
        result.error || result.message
      );
    }
  } catch (error) {
    console.error('Test AI provider error:', error);
    return errorResponse(
      ERROR_CODES.INTERNAL_ERROR,
      'Failed to test AI provider connection'
    );
  }
}
