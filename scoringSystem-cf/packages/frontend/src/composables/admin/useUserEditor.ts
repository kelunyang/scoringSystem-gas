/**
 * User Editor Composable
 * Handles user editing drawer state and validation
 */

import { ref, computed, reactive } from 'vue'
import { ElMessage } from 'element-plus'
import type { FormInstance, FormRules } from 'element-plus'
import { adminApi } from '@/api/admin'
import type { User } from '@repo/shared'

export interface UserEditForm {
  userEmail: string
  displayName: string
  role: 'admin' | 'pm' | 'reviewer' | 'user'
  status: 'active' | 'inactive' | 'disabled'
  avatarStyle: string
  avatarSeed: string
  avatarOptions: Record<string, any>
  twoFactorEnabled: boolean
  emailVerified: boolean
}

// Factory function for default form data
const createDefaultFormData = (): UserEditForm => ({
  userEmail: '',
  displayName: '',
  role: 'user',
  status: 'active',
  avatarStyle: 'avataaars',
  avatarSeed: '',
  avatarOptions: {},
  twoFactorEnabled: false,
  emailVerified: false
})

export function useUserEditor() {
  // State
  const drawerVisible = ref(false)
  const editMode = ref<'create' | 'edit'>('edit')
  const loading = ref(false)
  const formRef = ref<FormInstance>()

  const formData = reactive<UserEditForm>(createDefaultFormData())

  // Validation rules
  const formRules: FormRules<UserEditForm> = {
    userEmail: [
      { required: true, message: '請輸入電子郵件', trigger: 'blur' },
      { type: 'email', message: '請輸入有效的電子郵件', trigger: 'blur' }
    ],
    displayName: [
      { required: true, message: '請輸入顯示名稱', trigger: 'blur' },
      { min: 2, max: 50, message: '長度應在 2-50 字元之間', trigger: 'blur' }
    ],
    role: [
      { required: true, message: '請選擇角色', trigger: 'change' }
    ],
    status: [
      { required: true, message: '請選擇狀態', trigger: 'change' }
    ]
  }

  // Computed
  const drawerTitle = computed(() => {
    return editMode.value === 'create' ? '建立新用戶' : '編輯用戶資訊'
  })

  const canSubmit = computed(() => {
    return formData.userEmail && formData.displayName && !loading.value
  })

  // Methods
  const openDrawer = (mode: 'create' | 'edit', user?: User) => {
    editMode.value = mode

    if (mode === 'edit' && user) {
      // Populate form with existing user data
      formData.userEmail = user.userEmail
      formData.displayName = user.displayName || ''
      formData.role = user.role
      formData.status = user.status
      formData.avatarStyle = user.avatarStyle || 'avataaars'
      formData.avatarSeed = user.avatarSeed || ''
      formData.avatarOptions = typeof user.avatarOptions === 'string'
        ? JSON.parse(user.avatarOptions || '{}')
        : (user.avatarOptions || {})
      formData.twoFactorEnabled = user.twoFactorEnabled || false
      formData.emailVerified = user.emailVerified || false
    } else {
      // Reset form for create mode
      resetForm()
    }

    drawerVisible.value = true
  }

  const closeDrawer = () => {
    drawerVisible.value = false
    resetForm()
  }

  const resetForm = () => {
    // Use Object.assign for cleaner, DRY reset
    Object.assign(formData, createDefaultFormData())
    formRef.value?.clearValidate()
  }

  const validateForm = async (): Promise<boolean> => {
    if (!formRef.value) return false

    try {
      await formRef.value.validate()
      return true
    } catch (error) {
      return false
    }
  }

  const submitForm = async (onSuccess?: (user: User) => void) => {
    const isValid = await validateForm()
    if (!isValid) {
      ElMessage.error('請檢查表單輸入')
      return false
    }

    // Capture mode at start to prevent race condition
    // (editMode could change during async operation)
    const mode = editMode.value

    loading.value = true
    try {
      if (mode === 'create') {
        return await createUser(onSuccess)
      } else {
        return await updateUser(onSuccess)
      }
    } finally {
      loading.value = false
    }
  }

  const createUser = async (onSuccess?: (user: User) => void) => {
    try {
      const response = await adminApi.users.create({
        userEmail: formData.userEmail,
        displayName: formData.displayName,
        role: formData.role,
        status: formData.status,
        avatarStyle: formData.avatarStyle,
        avatarSeed: formData.avatarSeed,
        avatarOptions: JSON.stringify(formData.avatarOptions)
      })

      if (response.success && response.data) {
        ElMessage.success('用戶建立成功')
        closeDrawer()
        onSuccess?.(response.data)
        return true
      } else {
        ElMessage.error(`建立失敗: ${response.error?.message || '未知錯誤'}`)
        return false
      }
    } catch (error) {
      console.error('Create user error:', error)
      ElMessage.error('建立用戶失敗，請重試')
      return false
    }
  }

  const updateUser = async (onSuccess?: (user: User) => void) => {
    try {
      const response = await adminApi.users.update({
        userEmail: formData.userEmail,
        displayName: formData.displayName,
        role: formData.role,
        status: formData.status,
        avatarStyle: formData.avatarStyle,
        avatarSeed: formData.avatarSeed,
        avatarOptions: JSON.stringify(formData.avatarOptions),
        twoFactorEnabled: formData.twoFactorEnabled,
        emailVerified: formData.emailVerified
      })

      if (response.success && response.data) {
        ElMessage.success('用戶資訊更新成功')
        closeDrawer()
        onSuccess?.(response.data)
        return true
      } else {
        ElMessage.error(`更新失敗: ${response.error?.message || '未知錯誤'}`)
        return false
      }
    } catch (error) {
      console.error('Update user error:', error)
      ElMessage.error('更新用戶失敗，請重試')
      return false
    }
  }

  // Avatar management integration
  const updateAvatarData = (avatarData: {
    avatarStyle: string
    avatarSeed: string
    avatarOptions: string | Record<string, any>
  }) => {
    formData.avatarStyle = avatarData.avatarStyle
    formData.avatarSeed = avatarData.avatarSeed
    formData.avatarOptions = typeof avatarData.avatarOptions === 'string'
      ? JSON.parse(avatarData.avatarOptions)
      : avatarData.avatarOptions
  }

  // Role helpers
  const roleOptions = [
    { value: 'user', label: '一般用戶', type: 'info' as const },
    { value: 'reviewer', label: '評審委員', type: 'success' as const },
    { value: 'pm', label: '專案經理', type: 'warning' as const },
    { value: 'admin', label: '管理員', type: 'danger' as const }
  ]

  const statusOptions = [
    { value: 'active', label: '啟用', type: 'success' as const },
    { value: 'inactive', label: '停用', type: 'warning' as const },
    { value: 'disabled', label: '永久停用', type: 'danger' as const }
  ]

  return {
    // State
    drawerVisible,
    editMode,
    loading,
    formRef,
    formData,
    formRules,

    // Computed
    drawerTitle,
    canSubmit,

    // Methods
    openDrawer,
    closeDrawer,
    resetForm,
    validateForm,
    submitForm,
    updateAvatarData,

    // Constants
    roleOptions,
    statusOptions
  }
}
