/**
 * @fileoverview 认证事件总线 (Authentication Event Bus)
 *
 * 独立于 Vue 的事件系统，使用原生 EventTarget
 * 用于处理 JWT token 续约、会话过期等认证相关事件
 *
 * 特点：
 * - 不依赖 Vue 或任何框架
 * - 基于浏览器原生 EventTarget API
 * - 类型安全（TypeScript）
 * - 支持取消订阅（cleanup）
 * - 零外部依赖
 */

// ==================== 类型定义 ====================

/**
 * Token 续约事件数据
 */
export interface TokenRenewalDetail {
  newToken: string
  renewedAt: number
}

/**
 * 会话警告事件数据
 * 当会话时间低于某个阈值时触发
 */
export interface SessionWarningDetail {
  remainingSeconds: number
  percentage: number
}

/**
 * 会话过期事件数据
 */
export interface SessionExpiredDetail {
  expiredAt: number
  reason?: string
}

// ==================== 事件总线类 ====================

/**
 * 认证事件总线
 *
 * 基于原生 EventTarget，不依赖任何框架
 * 用于在应用的各个部分之间传递认证相关事件
 *
 * @example
 * ```typescript
 * // 发送事件
 * authEventBus.emitTokenRenewal('new-token-string')
 *
 * // 订阅事件
 * const unsubscribe = authEventBus.onTokenRenewal(({ newToken }) => {
 *   console.log('Token renewed:', newToken)
 * })
 *
 * // 取消订阅
 * unsubscribe()
 * ```
 */
class AuthEventBus extends EventTarget {
  /**
   * 发送 token 续约事件
   * 当从服务器收到新 token 时调用
   *
   * @param newToken - 新的 JWT token
   */
  emitTokenRenewal(newToken: string) {
    this.dispatchEvent(new CustomEvent('token-renewal', {
      detail: { newToken, renewedAt: Date.now() }
    }))
  }

  /**
   * 发送会话警告事件
   * 当会话时间低于某个阈值时调用（例如 <50%）
   *
   * @param remainingSeconds - 剩余秒数
   * @param percentage - 剩余百分比（0-100）
   */
  emitSessionWarning(remainingSeconds: number, percentage: number) {
    this.dispatchEvent(new CustomEvent('session-warning', {
      detail: { remainingSeconds, percentage }
    }))
  }

  /**
   * 发送会话过期事件
   * 当会话完全过期时调用
   *
   * @param reason - 过期原因（可选）
   */
  emitSessionExpired(reason?: string) {
    this.dispatchEvent(new CustomEvent('session-expired', {
      detail: { expiredAt: Date.now(), reason }
    }))
  }

  /**
   * 订阅 token 续约事件
   *
   * @param callback - 事件回调函数
   * @returns 取消订阅函数
   *
   * @example
   * ```typescript
   * const unsubscribe = authEventBus.onTokenRenewal(({ newToken, renewedAt }) => {
   *   console.log('Token renewed at', new Date(renewedAt))
   *   sessionStorage.setItem('sessionId', newToken)
   * })
   *
   * // 清理时调用
   * unsubscribe()
   * ```
   */
  onTokenRenewal(callback: (detail: TokenRenewalDetail) => void) {
    const handler = ((e: CustomEvent) => callback(e.detail)) as EventListener
    this.addEventListener('token-renewal', handler)
    return () => this.removeEventListener('token-renewal', handler)
  }

  /**
   * 订阅会话警告事件
   *
   * @param callback - 事件回调函数
   * @returns 取消订阅函数
   *
   * @example
   * ```typescript
   * const unsubscribe = authEventBus.onSessionWarning(({ remainingSeconds, percentage }) => {
   *   if (percentage < 20) {
   *     alert(`Session expiring in ${remainingSeconds} seconds!`)
   *   }
   * })
   * ```
   */
  onSessionWarning(callback: (detail: SessionWarningDetail) => void) {
    const handler = ((e: CustomEvent) => callback(e.detail)) as EventListener
    this.addEventListener('session-warning', handler)
    return () => this.removeEventListener('session-warning', handler)
  }

  /**
   * 订阅会话过期事件
   *
   * @param callback - 事件回调函数
   * @returns 取消订阅函数
   *
   * @example
   * ```typescript
   * const unsubscribe = authEventBus.onSessionExpired(({ expiredAt, reason }) => {
   *   console.log('Session expired:', reason)
   *   router.push('/login')
   * })
   * ```
   */
  onSessionExpired(callback: (detail: SessionExpiredDetail) => void) {
    const handler = ((e: CustomEvent) => callback(e.detail)) as EventListener
    this.addEventListener('session-expired', handler)
    return () => this.removeEventListener('session-expired', handler)
  }
}

// ==================== 导出单例 ====================

/**
 * 认证事件总线单例
 *
 * 在整个应用中共享同一个事件总线实例
 * 确保事件可以在不同模块之间传递
 */
export const authEventBus = new AuthEventBus()

// ==================== Window 事件监听器 ====================

/**
 * 监听 window 上的 auth:token-renewed 事件
 * 并转发到事件总线
 *
 * 这允许非 TypeScript 代码也能触发事件
 */
if (typeof window !== 'undefined') {
  window.addEventListener('auth:token-renewed', ((e: CustomEvent) => {
    authEventBus.emitTokenRenewal(e.detail.newToken)
  }) as EventListener)
}
