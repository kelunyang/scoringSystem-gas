<template>
  <div class="submit-comment-modal" v-if="visible" @click="handleClose">
    <div class="modal-content" @click.stop>
      <!-- 標題欄 -->
      <div class="modal-header">
        <h2 class="modal-title">張貼評論</h2>
        <button class="close-btn" @click="handleClose">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
      </div>

      <!-- Breadcrumb導航 -->
      <div class="breadcrumb-section">
        <el-breadcrumb separator="/">
          <el-breadcrumb-item>{{ projectTitle || '專案' }}</el-breadcrumb-item>
          <el-breadcrumb-item>{{ stageTitle || `階段${stageId}` }}</el-breadcrumb-item>
          <el-breadcrumb-item>張貼評論</el-breadcrumb-item>
        </el-breadcrumb>
      </div>

      <!-- 獎金顯示 -->
      <div class="reward-info">
        <label class="reward-label">階段評論獎金</label>
        <div class="reward-amount">{{ commentReward || 500 }}</div>
      </div>

      <!-- Markdown 編輯區 -->
      <div class="editor-section">
        <!-- 工具列 -->
        <div class="editor-toolbar">
          <button 
            v-for="tool in markdownTools" 
            :key="tool.name"
            class="tool-btn"
            :title="tool.title"
            @click="insertMarkdown(tool)"
          >
            <span v-if="tool.icon" v-html="tool.icon"></span>
            <span v-else>{{ tool.name }}</span>
          </button>
          <div class="toolbar-divider"></div>
          <button 
            class="tool-btn preview-btn"
            :class="{ active: showPreview }"
            @click="togglePreview"
            title="預覽Markdown"
          >
            <i class="fas fa-eye"></i> 預覽
          </button>
        </div>

        <!-- 編輯/預覽區域 -->
        <div class="editor-content" :class="{ preview: showPreview }">
          <textarea
            v-if="!showPreview"
            ref="editor"
            v-model="content"
            class="markdown-editor"
            :placeholder="placeholder"
            @input="handleInput"
            @keydown="handleKeydown"
            @keyup="handleKeyup"
          ></textarea>
          
          <div v-if="showPreview" class="markdown-preview">
            <div v-html="renderedMarkdown" class="preview-content"></div>
          </div>
          
          <!-- @mention 下拉選單 -->
          <div 
            v-if="showMentionDropdown" 
            class="mention-dropdown"
            :style="mentionDropdownStyle"
          >
            <div 
              v-for="(option, index) in filteredUsers" 
              :key="option.name"
              class="mention-item"
              :class="{ 
                active: index === selectedMentionIndex
              }"
              @click="selectMention(option)"
            >
              <span class="mention-name">
                @{{ option.name }}
                <span v-if="option.groupInfo" class="group-badge">{{ option.groupInfo.groupName }}</span>
              </span>
              <span class="mention-group">{{ option.groupNames.join('、') }}</span>
              <span v-if="option.groupInfo" class="voting-tip">@用戶將自動標記所屬群組</span>
            </div>
          </div>
        </div>
      </div>


      <!-- 操作按鈕 -->
      <div class="modal-actions">
        <button class="btn btn-primary" @click="submitComment" :disabled="!canSubmit">
          <i v-if="submitting" class="fas fa-spinner fa-spin"></i>
          {{ submitting ? '提交中...' : '送出' }}
        </button>
        <button class="btn btn-secondary" @click="clearContent">
          清除重填
        </button>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  name: 'SubmitCommentModal',
  props: {
    visible: {
      type: Boolean,
      default: false
    },
    projectId: {
      type: String,
      required: true
    },
    stageId: {
      type: String,
      required: true
    },
    commentReward: {
      type: Number,
      default: 500
    },
    projectTitle: {
      type: String,
      default: ''
    },
    stageTitle: {
      type: String,
      default: ''
    },
    availableGroups: {
      type: Array,
      default: () => []
    },
    availableUsers: {
      type: Array,
      default: () => []
    }
  },
  data() {
    return {
      content: '',
      selectedGroup: '',
      submitting: false, // 提交中狀態
      placeholder: '我覺得做得很讚的就是@第一組，他們的成果和 [Google](www.google.com) 上能找到的一模一樣！\n\n💡 提示：必須在評論中@提及至少一組才能參與投票！',
      markdownTools: [
        {
          name: 'B',
          title: '粗體文字',
          icon: '<i class="fas fa-bold"></i>',
          prefix: '**',
          suffix: '**',
          placeholder: '粗體文字'
        },
        {
          name: 'I',
          title: '斜體文字',
          icon: '<i class="fas fa-italic"></i>',
          prefix: '*',
          suffix: '*',
          placeholder: '斜體文字'
        },
        {
          name: '@',
          title: '@提及 (tag其他組)',
          icon: '<i class="fas fa-at"></i>',
          prefix: '@',
          suffix: '',
          placeholder: '用戶名'
        },
        {
          name: '🔗',
          title: '插入連結',
          icon: '<i class="fas fa-link"></i>',
          prefix: '[',
          suffix: '](url)',
          placeholder: '連結文字'
        },
        {
          name: 'CODE',
          title: '程式碼區塊',
          icon: '<i class="fas fa-code"></i>',
          prefix: '```\n',
          suffix: '\n```',
          placeholder: '程式碼'
        }
      ],
      showPreview: false,
      // @mention 功能相關
      showMentionDropdown: false,
      mentionQuery: '',
      mentionStartPos: 0,
      selectedMentionIndex: 0,
      mentionDropdownStyle: {}
    }
  },
  computed: {
    canSubmit() {
      return this.content.trim().length > 0 && !this.submitting
    },
    
    renderedMarkdown() {
      return this.parseMarkdown(this.content)
    },
    
    filteredUsers() {
      // 只顯示個別用戶，不顯示群組（自動檢測用戶所屬群組）
      // 只顯示有提交submission的群組的用戶，排除自己和同組成員
      const projectUsers = []
      if (this.$parent && this.$parent.projectData && this.$parent.projectData.userGroups) {
        // 獲取當前用戶的email和所屬群組
        const currentUserEmail = this.$parent.user?.userEmail
        const currentUserGroupInfo = currentUserEmail ? this.getUserGroupInfo(currentUserEmail) : null
        const currentUserGroupId = currentUserGroupInfo?.groupId
        
        // 獲取有效的群組ID列表（由於ProjectDetail.vue已經過濾了groups，這裡的groups應該都是有submission的）
        const validGroupIds = (this.$parent.projectData.groups || []).map(g => g.groupId)
        
        const activeUserEmails = [...new Set(
          this.$parent.projectData.userGroups
            .filter(ug => ug.isActive)
            .map(ug => ug.userEmail)
        )]
        
        // 從 availableUsers 中找到對應的用戶資料，或創建基本用戶資料
        activeUserEmails.forEach(email => {
          // 過濾掉當前用戶自己
          if (email === currentUserEmail) {
            return
          }
          
          // 獲取用戶所屬的群組資訊
          const userGroupInfo = this.getUserGroupInfo(email)
          
          // 過濾掉同組成員
          if (currentUserGroupId && userGroupInfo?.groupId === currentUserGroupId) {
            return
          }
          
          // 只包含有效群組（有submission的群組）的成員
          if (!userGroupInfo || !validGroupIds.includes(userGroupInfo.groupId)) {
            return
          }
          
          const userFromAvailable = this.availableUsers.find(u => 
            (u.userEmail || u.email) === email
          )
          
          if (userFromAvailable) {
            projectUsers.push({
              name: userFromAvailable.displayName || userFromAvailable.username || email.split('@')[0], // 顯示名稱
              displayName: userFromAvailable.displayName,
              username: userFromAvailable.username,
              userEmail: email, // 這是實際用於 @mention 的值
              groupInfo: userGroupInfo, // 包含群組ID和群組名稱
              groupNames: userGroupInfo ? [userGroupInfo.groupName] : [],
              isGroup: false
            })
          } else {
            // 如果在 availableUsers 中找不到，使用 email 前綴作為顯示名稱
            const fallbackDisplayName = email.split('@')[0]
            projectUsers.push({
              name: fallbackDisplayName,
              displayName: fallbackDisplayName,
              username: fallbackDisplayName,
              userEmail: email, // 這是實際用於 @mention 的值
              groupInfo: userGroupInfo,
              groupNames: userGroupInfo ? [userGroupInfo.groupName] : [],
              isGroup: false
            })
          }
        })
      }
      
      if (!this.mentionQuery) return projectUsers.slice(0, 10)
      return projectUsers
        .filter(option => {
          const name = option.name || option.displayName || option.username || ''
          return name.toLowerCase().includes(this.mentionQuery.toLowerCase())
        })
        .slice(0, 10)
    }
  },
  watch: {
    visible(newVal) {
      if (newVal) {
        this.$nextTick(() => {
          if (this.$refs.editor) {
            this.$refs.editor.focus()
          }
        })
      } else {
        // 清空內容當關閉時
        this.content = ''
        this.showPreview = false
        this.submitting = false
        this.hideMentionDropdown()
      }
    }
  },
  methods: {
    handleClose() {
      this.$emit('update:visible', false)
    },
    
    handleInput(event) {
      this.handleMentionTyping(event.target)
    },
    
    handleKeydown(event) {
      // 處理 @mention 下拉選單導航
      if (this.showMentionDropdown) {
        switch (event.key) {
          case 'ArrowDown':
            event.preventDefault()
            this.selectedMentionIndex = Math.min(
              this.selectedMentionIndex + 1, 
              this.filteredUsers.length - 1
            )
            break
          case 'ArrowUp':
            event.preventDefault()
            this.selectedMentionIndex = Math.max(this.selectedMentionIndex - 1, 0)
            break
          case 'Enter':
          case 'Tab':
            event.preventDefault()
            if (this.filteredUsers[this.selectedMentionIndex]) {
              this.selectMention(this.filteredUsers[this.selectedMentionIndex])
            }
            break
          case 'Escape':
            this.hideMentionDropdown()
            break
        }
        return
      }
      
      // Ctrl/Cmd + B for bold
      if ((event.ctrlKey || event.metaKey) && event.key === 'b') {
        event.preventDefault()
        this.insertMarkdown(this.markdownTools[0])
      }
      
      // Ctrl/Cmd + I for italic
      if ((event.ctrlKey || event.metaKey) && event.key === 'i') {
        event.preventDefault()
        this.insertMarkdown(this.markdownTools[1])
      }
      
      // Tab 縮排
      if (event.key === 'Tab') {
        event.preventDefault()
        const start = event.target.selectionStart
        const end = event.target.selectionEnd
        
        const beforeText = this.content.substring(0, start)
        const afterText = this.content.substring(end)
        this.content = beforeText + '  ' + afterText
        
        this.$nextTick(() => {
          event.target.setSelectionRange(start + 2, start + 2)
        })
      }
    },
    
    handleKeyup(event) {
      this.handleMentionTyping(event.target)
    },
    
    handleMentionTyping(editor) {
      const cursorPos = editor.selectionStart
      const textBeforeCursor = this.content.substring(0, cursorPos)
      const lastAtIndex = textBeforeCursor.lastIndexOf('@')
      
      if (lastAtIndex === -1) {
        this.hideMentionDropdown()
        return
      }
      
      // 檢查 @ 後面是否有空格
      const textAfterAt = textBeforeCursor.substring(lastAtIndex + 1)
      if (textAfterAt.includes(' ')) {
        this.hideMentionDropdown()
        return
      }
      
      // 更新 mention 查詢和顯示下拉選單
      this.mentionQuery = textAfterAt
      this.mentionStartPos = lastAtIndex
      this.selectedMentionIndex = 0
      this.showMentionDropdown = true
      
      // 計算下拉選單位置
      this.updateMentionDropdownPosition(editor, lastAtIndex)
    },
    
    updateMentionDropdownPosition(editor, atIndex) {
      // 簡化的位置計算，實際項目中可能需要更精確的位置計算
      const rect = editor.getBoundingClientRect()
      const lineHeight = 20 // 假設行高
      
      this.mentionDropdownStyle = {
        top: `${rect.top - 120}px`,
        left: `${rect.left + 20}px`
      }
    },
    
    selectMention(user) {
      const beforeText = this.content.substring(0, this.mentionStartPos)
      const afterText = this.content.substring(this.$refs.editor.selectionStart)
      
      // 檢查是否為自己或同組成員
      const currentUserEmail = this.$parent.user?.userEmail
      const currentUserGroupInfo = currentUserEmail ? this.getUserGroupInfo(currentUserEmail) : null
      const currentUserGroupId = currentUserGroupInfo?.groupId
      
      let mentionText
      
      // 防止@自己
      if (user.userEmail === currentUserEmail) {
        mentionText = '禁止自肥'
      }
      // 防止@同組成員  
      else if (currentUserGroupId && user.groupInfo?.groupId === currentUserGroupId) {
        mentionText = '禁止自肥'
      }
      // 正常情況
      else {
        mentionText = user.userEmail
      }
      
      this.content = beforeText + `@${mentionText} ` + afterText
      
      this.$nextTick(() => {
        const newPos = this.mentionStartPos + mentionText.length + 2
        this.$refs.editor.setSelectionRange(newPos, newPos)
        this.$refs.editor.focus()
      })
      
      this.hideMentionDropdown()
    },
    
    hideMentionDropdown() {
      this.showMentionDropdown = false
      this.mentionQuery = ''
      this.selectedMentionIndex = 0
    },
    
    insertMarkdown(tool) {
      const editor = this.$refs.editor
      if (!editor) return
      
      const start = editor.selectionStart
      const end = editor.selectionEnd
      const selectedText = this.content.substring(start, end)
      
      let newText = ''
      
      if (tool.name === '@') {
        // @ mention 功能 - 觸發下拉選單
        newText = '@'
        const beforeText = this.content.substring(0, start)
        const afterText = this.content.substring(end)
        this.content = beforeText + newText + afterText
        
        this.$nextTick(() => {
          const newPosition = start + 1
          editor.setSelectionRange(newPosition, newPosition)
          editor.focus()
          this.handleMentionTyping(editor)
        })
        return
      } else if (tool.name === '🔗') {
        // 連結功能
        if (selectedText) {
          newText = `[${selectedText}](url)`
        } else {
          newText = `[${tool.placeholder}](url)`
        }
      } else {
        // 一般 markdown 標記
        if (selectedText) {
          newText = `${tool.prefix}${selectedText}${tool.suffix}`
        } else {
          newText = `${tool.prefix}${tool.placeholder}${tool.suffix}`
        }
      }
      
      // 替換選中的文字
      const beforeText = this.content.substring(0, start)
      const afterText = this.content.substring(end)
      this.content = beforeText + newText + afterText
      
      // 重新設定游標位置
      this.$nextTick(() => {
        const newPosition = start + newText.length
        editor.setSelectionRange(newPosition, newPosition)
        editor.focus()
      })
    },
    
    async submitComment() {
      if (!this.canSubmit) return
      
      this.submitting = true
      try {
        if (!this.projectId) {
          alert('缺少專案ID')
          return
        }
        
        const response = await this.$apiClient.createComment(
          this.projectId,
          this.stageId,
          this.content
        )
        
        if (response.success) {
          // 成功後通知父組件並關閉彈窗
          this.$emit('submit', { 
            success: true, 
            commentId: response.data.commentId,
            content: this.content 
          })
          this.handleClose()
        } else {
          alert(`評論提交失敗：${response.error?.message || '未知錯誤'}`)
        }
      } catch (error) {
        console.error('提交評論錯誤:', error)
        alert('網路錯誤，請重試')
      } finally {
        this.submitting = false
      }
    },
    
    getGroupMemberCount(group) {
      // 從父組件傳入的 availableGroups 中獲取成員數量
      if (!group) return 0
      
      const groupId = group.groupId || group.id
      
      // 首先嘗試從 group 本身獲取成員數量
      if (group.memberCount) return group.memberCount
      if (group.memberNames && group.memberNames.length) return group.memberNames.length
      
      // 如果沒有直接的成員數量，嘗試從 availableGroups 中找到對應的群組
      const fullGroupData = this.availableGroups.find(g => 
        (g.groupId || g.id) === groupId
      )
      
      if (fullGroupData) {
        if (fullGroupData.memberCount) return fullGroupData.memberCount
        if (fullGroupData.memberNames && fullGroupData.memberNames.length) return fullGroupData.memberNames.length
      }
      
      // 最後嘗試從 userGroups 關聯表計算（如果 parent 有傳遞 userGroups 數據）
      if (this.$parent && this.$parent.projectData && this.$parent.projectData.userGroups) {
        const memberCount = this.$parent.projectData.userGroups.filter(ug => 
          ug.groupId === groupId && ug.isActive
        ).length
        if (memberCount > 0) return memberCount
      }
      
      return 0
    },
    
    getUserGroupInfo(userEmail) {
      // 獲取用戶所屬的群組完整資訊
      if (!userEmail || !this.$parent?.projectData?.userGroups || !this.$parent?.projectData?.groups) {
        return null
      }
      
      // 從 userGroups 中找到用戶的群組記錄
      const userGroupRecord = this.$parent.projectData.userGroups.find(ug => 
        ug.userEmail === userEmail && ug.isActive
      )
      
      if (!userGroupRecord) return null
      
      // 從 groups 中找到對應的群組資訊
      const group = this.$parent.projectData.groups.find(g => 
        g.groupId === userGroupRecord.groupId && g.status === 'active'
      )
      
      if (!group) return null
      
      return {
        groupId: group.groupId,
        groupName: group.groupName || group.name
      }
    },
    
    getUserGroups(userEmail) {
      // 獲取用戶所屬的群組名稱列表
      const groupInfo = this.getUserGroupInfo(userEmail)
      return groupInfo ? [groupInfo.groupName] : []
    },
    
    async loadTeamMembers() {
      // 不再需要單獨載入團隊成員，因為現在通過 props 傳遞
      // 這個方法保留用於向後兼容，但實際上不會使用
      console.log('loadTeamMembers: 使用 props 傳遞的數據，不需要單獨載入')
    },
    
    clearContent() {
      this.content = ''
      this.showPreview = false
      this.hideMentionDropdown()
      if (this.$refs.editor) {
        this.$refs.editor.focus()
      }
    },
    
    togglePreview() {
      this.showPreview = !this.showPreview
    },
    
    parseMarkdown(text) {
      if (!text) return ''
      
      let html = text
        // Headers
        .replace(/^### (.*$)/gim, '<h3>$1</h3>')
        .replace(/^## (.*$)/gim, '<h2>$1</h2>')
        .replace(/^# (.*$)/gim, '<h1>$1</h1>')
        
        // Bold
        .replace(/\*\*(.*)\*\*/gim, '<strong>$1</strong>')
        .replace(/__(.*?)__/gim, '<strong>$1</strong>')
        
        // Italic
        .replace(/\*(.*)\*/gim, '<em>$1</em>')
        .replace(/_(.*?)_/gim, '<em>$1</em>')
        
        // Code blocks
        .replace(/```([\s\S]*?)```/gim, '<pre><code>$1</code></pre>')
        .replace(/`([^`]*)`/gim, '<code>$1</code>')
        
        // Links
        .replace(/\[([^\]]*)\]\(([^\)]*)\)/gim, '<a href="$2" target="_blank">$1</a>')
        
        // Line breaks
        .replace(/\n/gim, '<br>')
      
      return html
    }
  },
  mounted() {
    this.loadTeamMembers()
  }
}
</script>

<style scoped>
.submit-comment-modal {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  z-index: 1000;
  animation: fadeIn 0.3s ease-out;
}

.modal-content {
  background: white;
  width: 100%;
  height: 100%;
  border-radius: 0;
  overflow-y: auto;
  animation: slideUp 0.4s ease-out;
}

/* 桌面端也使用100%全屏 */

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes slideUp {
  from { 
    transform: translateY(100%);
    opacity: 0;
  }
  to { 
    transform: translateY(0);
    opacity: 1;
  }
}

.modal-header {
  background: #2c3e50;
  color: white;
  padding: 20px 25px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-radius: 12px 12px 0 0;
}

.modal-title {
  font-size: 20px;
  font-weight: 600;
  margin: 0;
}

.close-btn {
  background: none;
  border: none;
  color: white;
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  transition: background-color 0.2s;
}

.close-btn:hover {
  background: rgba(255, 255, 255, 0.1);
}

.breadcrumb-section {
  padding: 15px 25px;
  background: #f8f9fa;
  border-bottom: 1px solid #e1e8ed;
}

.breadcrumb-section :deep(.el-breadcrumb) {
  font-size: 14px;
}

.breadcrumb-section :deep(.el-breadcrumb__item) {
  color: #7f8c8d;
}

.breadcrumb-section :deep(.el-breadcrumb__item:last-child) {
  color: #2c3e50;
  font-weight: 500;
}

.reward-info {
  padding: 20px 25px;
  display: flex;
  align-items: center;
  gap: 15px;
  border-bottom: 1px solid #e1e8ed;
}

.reward-label {
  background: #2c3e50;
  color: white;
  padding: 8px 16px;
  border-radius: 4px;
  font-size: 14px;
  font-weight: 500;
}

.reward-amount {
  font-size: 18px;
  font-weight: 600;
  color: #2c3e50;
}

.editor-section {
  padding: 0 25px 20px;
}

.editor-toolbar {
  display: flex;
  gap: 8px;
  padding: 15px 0;
  border-bottom: 1px solid #e1e8ed;
  margin-bottom: 15px;
}

.tool-btn {
  background: #f8f9fa;
  border: 1px solid #e1e8ed;
  padding: 8px 12px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  color: #2c3e50;
  transition: all 0.2s;
  min-width: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.tool-btn:hover {
  background: #e9ecef;
  border-color: #999;
  transform: translateY(-1px);
}

.tool-btn:active {
  transform: translateY(0);
}

.toolbar-divider {
  width: 1px;
  height: 24px;
  background: #ddd;
  margin: 0 8px;
}

.preview-btn.active {
  background: #007bff !important;
  color: white !important;
}

.editor-content {
  position: relative;
}

.editor-container {
  position: relative;
}

.markdown-editor {
  width: 100%;
  min-height: 200px;
  padding: 15px;
  border: 2px solid #e1e8ed;
  border-radius: 6px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
  font-size: 14px;
  line-height: 1.5;
  resize: vertical;
  transition: border-color 0.3s;
}

.markdown-editor:focus {
  outline: none;
  border-color: #3498db;
  box-shadow: 0 0 0 3px rgba(52, 152, 219, 0.1);
}

.markdown-editor::placeholder {
  color: #7f8c8d;
}

.markdown-preview {
  min-height: 200px;
  border: 2px solid #e1e8ed;
  border-radius: 6px;
  background: white;
}

.preview-content {
  padding: 15px;
  line-height: 1.6;
  color: #2c3e50;
}

.preview-content h1,
.preview-content h2,
.preview-content h3 {
  margin: 16px 0 8px 0;
  color: #2c3e50;
}

.preview-content h1 {
  font-size: 24px;
  border-bottom: 2px solid #e1e8ed;
  padding-bottom: 8px;
}

.preview-content h2 {
  font-size: 20px;
  border-bottom: 1px solid #e1e8ed;
  padding-bottom: 6px;
}

.preview-content h3 {
  font-size: 16px;
}

.preview-content strong {
  font-weight: 600;
}

.preview-content em {
  font-style: italic;
}

.preview-content code {
  background: #f5f5f5;
  padding: 2px 4px;
  border-radius: 3px;
  font-family: 'Courier New', monospace;
  font-size: 13px;
}

.preview-content pre {
  background: #f5f5f5;
  padding: 12px;
  border-radius: 6px;
  overflow-x: auto;
  margin: 12px 0;
}

.preview-content pre code {
  background: none;
  padding: 0;
  border-radius: 0;
}

.preview-content a {
  color: #007bff;
  text-decoration: none;
}

.preview-content a:hover {
  text-decoration: underline;
}

.mention-dropdown {
  position: fixed;
  background: white;
  border: 1px solid #e1e8ed;
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  z-index: 1001;
  min-width: 200px;
  max-height: 200px;
  overflow-y: auto;
}

.mention-item {
  padding: 12px 16px;
  cursor: pointer;
  border-bottom: 1px solid #f1f2f6;
  transition: background-color 0.2s;
  display: flex;
  flex-direction: column;
  gap: 4px;
  position: relative;
}

.mention-item:last-child {
  border-bottom: none;
}

.mention-item:hover,
.mention-item.active {
  background: #f8f9fa;
}

.mention-item.is-group {
  background: linear-gradient(135deg, #fff8e7, #fff);
  border-left: 3px solid #f39c12;
}

.mention-item.is-group:hover,
.mention-item.is-group.active {
  background: linear-gradient(135deg, #fff3d9, #f8f9fa);
}

.mention-name {
  font-weight: 600;
  color: #3498db;
  font-size: 14px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.group-badge {
  background: #f39c12;
  color: white;
  padding: 2px 6px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 500;
}

.mention-group {
  font-size: 12px;
  color: #7f8c8d;
}

.voting-tip {
  font-size: 11px;
  color: #e67e22;
  font-weight: 500;
  margin-top: 2px;
}

.target-group-section {
  padding: 20px 25px;
  border-top: 1px solid #e1e8ed;
}

.section-label {
  display: block;
  background: #6c757d;
  color: white;
  padding: 8px 16px;
  border-radius: 4px;
  font-size: 14px;
  font-weight: 500;
  margin-bottom: 15px;
  width: fit-content;
}

.group-selector {
  width: 100%;
  padding: 12px 15px;
  border: 2px solid #e1e8ed;
  border-radius: 6px;
  font-size: 14px;
  background: white;
  color: #2c3e50;
  transition: border-color 0.3s;
}

.group-selector:focus {
  outline: none;
  border-color: #3498db;
  box-shadow: 0 0 0 3px rgba(52, 152, 219, 0.1);
}

.modal-actions {
  padding: 25px;
  display: flex;
  gap: 12px;
  justify-content: center;
  border-top: 1px solid #e1e8ed;
}

.btn {
  padding: 12px 24px;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s;
  min-width: 100px;
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  transform: none !important;
}

.btn-primary {
  background: #28a745;
  color: white;
}

.btn-primary:hover:not(:disabled) {
  background: #218838;
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(40, 167, 69, 0.3);
}

.btn-secondary {
  background: #dc3545;
  color: white;
}

.btn-secondary:hover {
  background: #c82333;
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(220, 53, 69, 0.3);
}

@media (max-width: 768px) {
  .modal-content {
    width: 100%;
    max-height: 90vh;
  }
  
  .editor-toolbar {
    flex-wrap: wrap;
  }
  
  .modal-actions {
    flex-direction: column;
  }
  
  .btn {
    width: 100%;
  }
  
  .reward-info {
    flex-direction: column;
    align-items: flex-start;
    gap: 10px;
  }
  
  .mention-dropdown {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
  }
}
</style>