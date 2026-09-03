/**
 * Batch Operations Composable
 *
 * Provides batch operation mutations for groups (activate, deactivate, lock, unlock).
 * Uses TanStack Query for consistent state management.
 */

import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { rpcClient } from '@/utils/rpc-client'
import { ElMessage } from 'element-plus'
import type { ApiResponse } from '@/types'
import { getErrorMessage } from '@/utils/errorHandler'

