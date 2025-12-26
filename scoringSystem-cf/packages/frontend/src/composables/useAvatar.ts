/**
 * @fileoverview Avatar 生成邏輯 Composable
 *
 * 提供統一的 Avatar URL 生成方法，支援：
 * 1. DiceBear API 生成動態 Avatar
 * 2. Initials Avatar (fallback)
 * 3. 錯誤處理與降級機制
 */

import { reactive } from 'vue'

interface Member {
  email: string
  displayName?: string
  avatarSeed?: string
  avatarStyle?: string
  avatarOptions?: string | Record<string, any>
}

interface Vote {
  voterEmail: string
  voterDisplayName?: string
  voterAvatarSeed?: string
  voterAvatarStyle?: string
  voterAvatarOptions?: string | Record<string, any>
}

interface AvatarErrors {
  [email: string]: boolean
}

interface AvatarReturn {
  generateDicebearUrl: (seed: string, style: string, options?: Record<string, any>) => string
  generateMemberAvatarUrl: (member: Member) => string
  generateMemberInitialsAvatar: (member: Member | null) => string
  generateMemberInitials: (member: Member | null) => string
  handleMemberAvatarError: (memberEmail: string) => void
  clearAvatarErrors: () => void
  avatarErrors: AvatarErrors
  getMemberAvatarUrlFromEmail: (email: string, members?: Member[]) => string
  getMemberInitialsFromEmail: (email: string, members?: Member[]) => string
  getVoterAvatarUrl: (vote: Vote | null) => string
  getVoterDisplayName: (vote: Vote | null) => string
  getVoterInitials: (vote: Vote | null) => string
}

/**
 * Avatar 生成 Composable
 * @returns Avatar 相關方法
 */
export function useAvatar(): AvatarReturn {
  // 追蹤每個成員的 avatar 錯誤狀態
  const avatarErrors = reactive<AvatarErrors>({})

  /**
   * 生成 DiceBear URL（基礎函數）
   * @param seed - 種子值（通常是 email 或 avatarSeed）
   * @param style - Avatar 風格（如 'avataaars', 'initials' 等）
   * @param options - 額外選項
   * @returns DiceBear Avatar URL
   */
  function generateDicebearUrl(seed: string, style: string, options: Record<string, any> = {}): string {
    const baseUrl = `https://api.dicebear.com/7.x/${style}/svg`
    const params = new URLSearchParams({
      seed: seed,
      size: '32',
      ...options
    })
    return `${baseUrl}?${params.toString()}`
  }

  /**
   * 生成成員的 Avatar URL（帶錯誤處理）
   * @param member - 成員資料
   * @returns Avatar URL
   */
  function generateMemberAvatarUrl(member: Member): string {
    // 檢查是否已發生錯誤，或成員資料無效
    if (!member || avatarErrors[member.email]) {
      return generateMemberInitialsAvatar(member)
    }

    const seed = member.avatarSeed || member.email
    const style = member.avatarStyle || 'avataaars'

    // 解析 avatarOptions（可能是 JSON 字串或物件）
    let options: Record<string, any> = {}
    if (member.avatarOptions) {
      if (typeof member.avatarOptions === 'string') {
        try {
          options = JSON.parse(member.avatarOptions)
        } catch (e) {
          console.warn('Failed to parse avatarOptions:', member.avatarOptions)
          options = {}
        }
      } else {
        options = member.avatarOptions
      }
    }

    return generateDicebearUrl(seed, style, options)
  }

  /**
   * 生成 Initials Avatar（fallback）
   * @param member - 成員資料
   * @returns Initials Avatar URL
   */
  function generateMemberInitialsAvatar(member: Member | null): string {
    const name = member?.displayName || 'U'
    const initials = name
      .split(' ')
      .map(word => word.charAt(0))
      .join('')
      .substring(0, 2)
      .toUpperCase()

    return `https://api.dicebear.com/7.x/initials/svg?seed=${initials}&size=32&backgroundColor=b6e3f4`
  }

  /**
   * 生成 Initials 文字（用於 el-avatar fallback 顯示）
   * @param member - 成員資料
   * @returns Initials 文字（最多2個字元）
   */
  function generateMemberInitials(member: Member | null): string {
    const name = member?.displayName || 'U'
    return name
      .split(' ')
      .map(word => word.charAt(0))
      .join('')
      .substring(0, 2)
      .toUpperCase()
  }

  /**
   * 處理 Avatar 載入錯誤
   * @param memberEmail - 成員 email
   */
  function handleMemberAvatarError(memberEmail: string): void {
    if (memberEmail) {
      avatarErrors[memberEmail] = true
    }
  }

  /**
   * 從 email 取得成員 Avatar URL
   * @param email - 成員 email
   * @param members - 成員列表
   * @returns Avatar URL
   */
  function getMemberAvatarUrlFromEmail(email: string, members: Member[] = []): string {
    const member = members.find(m => (m as any).userEmail === email || m.email === email)
    if (!member) {
      return generateMemberInitialsAvatar({ email, displayName: email?.split('@')[0] || 'U' })
    }
    return generateMemberAvatarUrl(member)
  }

  /**
   * 從 email 取得成員 Initials
   * @param email - 成員 email
   * @param members - 成員列表
   * @returns Initials 文字
   */
  function getMemberInitialsFromEmail(email: string, members: Member[] = []): string {
    const member = members.find(m => (m as any).userEmail === email || m.email === email)
    if (!member) {
      const name = email?.split('@')[0] || 'U'
      return name.substring(0, 2).toUpperCase()
    }
    return generateMemberInitials(member)
  }

  /**
   * 生成投票者的 Avatar URL
   * @param vote - 投票資料
   * @returns Avatar URL
   */
  function getVoterAvatarUrl(vote: Vote | null): string {
    if (!vote) {
      return generateMemberInitialsAvatar({ email: '', displayName: 'U' })
    }

    const seed = vote.voterAvatarSeed || vote.voterEmail
    const style = vote.voterAvatarStyle || 'avataaars'

    let options: Record<string, any> = {}
    if (vote.voterAvatarOptions) {
      if (typeof vote.voterAvatarOptions === 'string') {
        try {
          options = JSON.parse(vote.voterAvatarOptions)
        } catch (e) {
          console.warn('Failed to parse voterAvatarOptions:', vote.voterAvatarOptions)
          options = {}
        }
      } else {
        options = vote.voterAvatarOptions
      }
    }

    return generateDicebearUrl(seed, style, options)
  }

  /**
   * 取得投票者的顯示名稱
   * @param vote - 投票資料
   * @returns 顯示名稱
   */
  function getVoterDisplayName(vote: Vote | null): string {
    if (!vote) return '未知用戶'
    return vote.voterDisplayName || vote.voterEmail?.split('@')[0] || '未知用戶'
  }

  /**
   * 取得投票者的 Initials
   * @param vote - 投票資料
   * @returns Initials 文字
   */
  function getVoterInitials(vote: Vote | null): string {
    const name = getVoterDisplayName(vote)
    return name
      .split(' ')
      .map(word => word.charAt(0))
      .join('')
      .substring(0, 2)
      .toUpperCase()
  }

  /**
   * 清除所有 Avatar 錯誤記錄
   */
  function clearAvatarErrors(): void {
    Object.keys(avatarErrors).forEach(key => {
      delete avatarErrors[key]
    })
  }

  return {
    // 基礎方法
    generateDicebearUrl,
    generateMemberAvatarUrl,
    generateMemberInitialsAvatar,
    generateMemberInitials,

    // 錯誤處理
    handleMemberAvatarError,
    clearAvatarErrors,
    avatarErrors,

    // Email 查找方法
    getMemberAvatarUrlFromEmail,
    getMemberInitialsFromEmail,

    // 投票者相關方法
    getVoterAvatarUrl,
    getVoterDisplayName,
    getVoterInitials
  }
}
