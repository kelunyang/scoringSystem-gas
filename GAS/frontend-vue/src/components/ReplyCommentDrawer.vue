<template>
  <div class="reply-comment-drawer" v-if="visible" @click="handleClose">
    <div class="drawer-content" @click.stop>
      <!-- 標題欄 -->
      <div class="drawer-header">
        <h2 class="drawer-title">回覆評論</h2>
        <button class="close-btn" @click="handleClose">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
      </div>

      <!-- 原評論顯示 -->
      <div class="original-comment-section" v-if="originalComment">
        <div class="section-label">回覆給：</div>
        <div class="original-comment-card">
          <div class="comment-author">{{ originalComment.authorName }}</div>
          <div class="comment-content">{{ originalComment.content }}</div>
          <div class="comment-meta">
            <span v-for="group in originalComment.mentionedGroups" :key="group" class="mentioned-tag">
              @{{ group }}
            </span>
          </div>
        </div>
      </div>

      <!-- Markdown 編輯區 -->
      <div class="editor-section">
        <div class="section-label">您的回覆</div>
        
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
            placeholder="輸入您的回覆..."
            @input="handleInput"
            @keydown="handleKeydown"
            @keyup="handleKeyup"
          ></textarea>
          
          <div v-if="showPreview" class="markdown-preview">
            <div v-html="renderedMarkdown" class="preview-content"></div>
          </div>
          
        </div>
      </div>

      <!-- 操作按鈕 -->
      <div class="drawer-actions">
        <button class="btn btn-primary" @click="submitReply" :disabled="!canSubmit">
          <i v-if="submitting" class="fas fa-spinner fa-spin"></i>
          {{ submitting ? '送出中...' : '送出' }}
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
  name: 'ReplyCommentDrawer',
  props: {
    visible: {
      type: Boolean,
      default: false
    },
    originalComment: {
      type: Object,
      default: null
    },
    projectId: {
      type: String,
      required: true
    },
    stageId: {
      type: String,
      required: true
    },
    projectGroups: {
      type: Array,
      default: () => []
    },
    projectUsers: {
      type: Array,
      default: () => []
    },
    stageSubmissions: {
      type: Array,
      default: () => []
    },
    currentUser: {
      type: Object,
      default: null
    }
  },
  emits: ['update:visible', 'reply-submitted'],
  data() {
    return {
      content: '',
      submitting: false,
      markdownTools: [
        { name: 'B', title: '粗體 (Ctrl+B)', icon: '<i class="fas fa-bold"></i>', action: 'bold' },
        { name: 'I', title: '斜體 (Ctrl+I)', icon: '<i class="fas fa-italic"></i>', action: 'italic' },
        { name: '連結', title: '插入連結', icon: '<i class="fas fa-link"></i>', action: 'link' }
      ],
      showPreview: false
    }
  },
  computed: {
    canSubmit() {
      return this.content.trim().length > 0 && !this.submitting
    },
    
    renderedMarkdown() {
      return this.parseMarkdown(this.content)
    }
  },
  watch: {
    visible(newVal) {
      if (newVal) {
        this.content = ''
        this.submitting = false
        this.$nextTick(() => {
          this.$refs.editor?.focus()
        })
      }
    }
  },
  methods: {
    handleClose() {
      if (!this.submitting) {
        this.$emit('update:visible', false)
      }
    },

    clearContent() {
      this.content = ''
      this.showPreview = false
      this.$refs.editor?.focus()
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
        
        // Italic
        .replace(/\*(.*)\*/gim, '<em>$1</em>')
        
        // Links
        .replace(/\[([^\]]+)\]\(([^)]+)\)/gim, '<a href="$2" target="_blank">$1</a>')
        
        // Line breaks
        .replace(/\n/gim, '<br>')
      
      return html
    },

    insertMarkdown(tool) {
      const editor = this.$refs.editor
      const start = editor.selectionStart
      const end = editor.selectionEnd
      const selectedText = this.content.substring(start, end)
      let insertion = ''
      
      switch(tool.action) {
        case 'bold':
          insertion = `**${selectedText || '粗體文字'}**`
          break
        case 'italic':
          insertion = `*${selectedText || '斜體文字'}*`
          break
        case 'heading':
          insertion = `\n### ${selectedText || '標題'}\n`
          break
        case 'link':
          insertion = `[${selectedText || '連結文字'}](url)`
          break
        case 'list':
          insertion = `\n- ${selectedText || '列表項目'}`
          break
        case 'orderedList':
          insertion = `\n1. ${selectedText || '列表項目'}`
          break
        case 'quote':
          insertion = `\n> ${selectedText || '引用文字'}`
          break
        case 'code':
          if (selectedText.includes('\n')) {
            insertion = `\n\`\`\`\n${selectedText}\n\`\`\`\n`
          } else {
            insertion = `\`${selectedText || '程式碼'}\``
          }
          break
        case 'hr':
          insertion = '\n---\n'
          break
      }
      
      this.content = this.content.substring(0, start) + insertion + this.content.substring(end)
      
      // 重新聚焦並選擇插入的文字
      this.$nextTick(() => {
        editor.focus()
        const newEnd = start + insertion.length
        editor.setSelectionRange(newEnd, newEnd)
      })
    },

    handleInput() {
      // No mention handling needed for replies
    },

    handleKeydown(e) {
      // Markdown 快捷鍵
      if (e.ctrlKey || e.metaKey) {
        if (e.key === 'b') {
          e.preventDefault()
          this.insertMarkdown({ action: 'bold' })
        } else if (e.key === 'i') {
          e.preventDefault()
          this.insertMarkdown({ action: 'italic' })
        }
      }
    },

    handleKeyup() {
      // No mention handling needed for replies
    },

    async submitReply() {
      if (!this.canSubmit) return

      try {
        this.submitting = true

        const response = await this.$apiClient.createReply(
          this.projectId,
          this.stageId,
          this.content.trim(),
          this.originalComment.commentId
        )

        if (response.success) {
          this.$emit('reply-submitted', {
            success: true,
            data: response.data
          })
          // 延遲關閉drawer，確保父組件有時間處理
          setTimeout(() => {
            this.handleClose()
          }, 100)
        } else {
          this.$emit('reply-submitted', {
            success: false,
            error: response.error
          })
          throw new Error(response.error?.message || '回覆失敗')
        }
      } catch (error) {
        console.error('提交回覆失敗:', error)
        this.$message.error(`回覆失敗: ${error.message}`)
      } finally {
        this.submitting = false
      }
    }
  }
}
</script>

<style scoped>
.reply-comment-drawer {
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

.drawer-content {
  background: white;
  width: 100%;
  height: 100%;
  border-radius: 0;
  overflow-y: auto;
  animation: slideUp 0.4s ease-out;
  display: flex;
  flex-direction: column;
}

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

.drawer-header {
  background: #2c3e50;
  color: white;
  padding: 20px 25px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-shrink: 0;
}

.drawer-title {
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

/* 原評論區域 */
.original-comment-section {
  padding: 20px 25px;
  background: #f8f9fa;
  border-bottom: 1px solid #e1e8ed;
}

.section-label {
  font-size: 14px;
  font-weight: 600;
  color: #666;
  margin-bottom: 12px;
}

.original-comment-card {
  background: white;
  padding: 15px;
  border-radius: 8px;
  border: 1px solid #e1e8ed;
}

.comment-author {
  font-weight: 600;
  color: #2c3e50;
  margin-bottom: 8px;
}

.comment-content {
  color: #333;
  line-height: 1.5;
  margin-bottom: 10px;
}

.comment-meta {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.mentioned-tag {
  background: #e3f2fd;
  color: #1976d2;
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 500;
}

/* 編輯器區域 */
.editor-section {
  flex: 1;
  padding: 20px 25px;
  display: flex;
  flex-direction: column;
}

.editor-toolbar {
  display: flex;
  gap: 4px;
  padding: 10px;
  background: #f5f5f5;
  border: 1px solid #e1e8ed;
  border-bottom: none;
  border-radius: 4px 4px 0 0;
  flex-wrap: wrap;
}

.tool-btn {
  padding: 6px 12px;
  background: white;
  border: 1px solid #ddd;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  color: #333;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 36px;
  height: 32px;
}

.tool-btn:hover {
  background: #e8e8e8;
  border-color: #999;
}

.tool-btn b, .tool-btn i {
  font-size: 14px;
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
  flex: 1;
}

.editor-container {
  position: relative;
  flex: 1;
}

.markdown-editor {
  width: 100%;
  height: 100%;
  min-height: 300px;
  padding: 15px;
  border: 1px solid #e1e8ed;
  border-radius: 0 0 4px 4px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, monospace;
  font-size: 14px;
  line-height: 1.6;
  resize: none;
  outline: none;
}

.markdown-editor:focus {
  border-color: #409EFF;
}

.markdown-preview {
  min-height: 300px;
  border: 1px solid #e1e8ed;
  border-radius: 0 0 4px 4px;
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

.preview-content a {
  color: #007bff;
  text-decoration: none;
}

.preview-content a:hover {
  text-decoration: underline;
}


/* 操作按鈕 */
.drawer-actions {
  padding: 20px 25px;
  display: flex;
  gap: 12px;
  justify-content: flex-start;
  border-top: 1px solid #e1e8ed;
  background: white;
  flex-shrink: 0;
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
}

.btn-primary {
  background: #409EFF;
  color: white;
}

.btn-primary:hover:not(:disabled) {
  background: #66b1ff;
}

.btn-secondary {
  background: #909399;
  color: white;
}

.btn-secondary:hover:not(:disabled) {
  background: #a6a9ad;
}

@media (max-width: 768px) {
  .editor-section {
    padding: 15px;
  }
  
  .drawer-actions {
    flex-direction: column;
    padding: 15px;
  }
  
  .btn {
    width: 100%;
  }
}
</style>