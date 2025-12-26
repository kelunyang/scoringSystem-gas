/**
 * Composable for fetching user activity data with TanStack Query
 */

import { useQuery, type UseQueryReturnType } from '@tanstack/vue-query'
import { computed, type Ref, type ComputedRef } from 'vue'
import { rpcClient } from '@/utils/rpc-client'

export interface ActivityStats {
  loginSuccess: number
  loginFailed: number
  failureReasons: string[]
  hasSecurityEvent: boolean
  activities: {
    hasSubmission: boolean
    hasComment: boolean
    hasVote: boolean
    hasGroupApproval: boolean
  }
}

export interface ActivityEvent {
  timestamp: number
  eventType?: string
  action?: string
  entityType?: string
  entityId?: string
  projectId?: string
  projectName?: string
  ipAddress?: string
  reason?: string
  date?: string
  [key: string]: any
}

export interface ActivityData {
  dailyStats: Record<string, ActivityStats>
  events: ActivityEvent[]
}

export interface ActivityResponse {
  success: boolean
  data?: ActivityData
  error?: { message: string }
}

export interface UseActivityDataOptions {
  userEmail: Ref<string> | ComputedRef<string>
  startDate: Ref<string> | ComputedRef<string>
  endDate: Ref<string> | ComputedRef<string>
  enabled?: Ref<boolean> | ComputedRef<boolean>
}

export interface UseActivityDataReturn {
  data: ComputedRef<ActivityData | undefined>
  isLoading: Ref<boolean>
  error: Ref<Error | null>
  refetch: () => void
}

/**
 * Fetch user activity data with automatic caching and revalidation
 */
export function useActivityData(options: UseActivityDataOptions): UseActivityDataReturn {
  const { userEmail, startDate, endDate, enabled } = options

  const queryEnabled = computed(() => {
    const emailValue = typeof userEmail.value === 'string' ? userEmail.value : ''
    const startValue = typeof startDate.value === 'string' ? startDate.value : ''
    const endValue = typeof endDate.value === 'string' ? endDate.value : ''
    const isEnabled = enabled?.value ?? true

    // Add validation warning for debugging
    if (isEnabled && (!emailValue || !startValue || !endValue)) {
      console.warn('[useActivityData] Query enabled but missing required parameters:', {
        userEmail: emailValue || 'EMPTY',
        startDate: startValue || 'EMPTY',
        endDate: endValue || 'EMPTY',
        enabled: isEnabled
      })
      return false
    }

    return !!(emailValue && startValue && endValue && isEnabled)
  })

  const queryResult = useQuery({
    queryKey: computed(() => [
      'userActivity',
      userEmail.value,
      startDate.value,
      endDate.value
    ]),
    queryFn: async ({ queryKey }) => {
      const [, email, start, end] = queryKey as [string, string, string, string]

      const requestPayload = {
        userEmail: email,
        startDate: start,
        endDate: end
      }

      console.log('[Frontend] Activity request:', {
        ...requestPayload,
        types: {
          email: typeof requestPayload.userEmail,
          start: typeof requestPayload.startDate,
          end: typeof requestPayload.endDate
        }
      })

      const httpResponse = await rpcClient.api.admin.users.activity.$post({
        json: requestPayload
      })

      const response = (await httpResponse.json()) as ActivityResponse

      if (!response.success) {
        throw new Error(response.error?.message || '無法載入活動資料')
      }

      return response.data
    },
    enabled: queryEnabled,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes (formerly cacheTime)
    retry: 2,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000)
  }) as UseQueryReturnType<ActivityData | undefined, Error>

  return {
    data: computed(() => queryResult.data.value),
    isLoading: queryResult.isLoading,
    error: queryResult.error,
    refetch: queryResult.refetch
  }
}
