<template>
  <div class="markdown-editor">
    <div class="editor-toolbar">
      <button @click="addBold" title="粗體 (Ctrl+B)" class="toolbar-btn">
        <i class="fas fa-bold"></i>
      </button>
      <button @click="addItalic" title="斜體 (Ctrl+I)" class="toolbar-btn">
        <i class="fas fa-italic"></i>
      </button>
      <button @click="addUnderline" title="底線 (Ctrl+U)" class="toolbar-btn">
        <i class="fas fa-underline"></i>
      </button>
      <div class="toolbar-separator"></div>
      <button @click="addBulletList" title="無序列表" class="toolbar-btn">
        <i class="fas fa-list-ul"></i>
      </button>
      <button @click="addNumberedList" title="有序列表" class="toolbar-btn">
        <i class="fas fa-list-ol"></i>
      </button>
      <div class="toolbar-separator"></div>
      <button @click="addLink" title="插入連結 (Ctrl+K)" class="toolbar-btn">
        <i class="fas fa-link"></i>
      </button>
      <button @click="addImage" title="插入圖片" class="toolbar-btn">
        <i class="fas fa-image"></i>
      </button>
      <div class="toolbar-separator"></div>
      <button @click="togglePreview" title="預覽/編輯" class="toolbar-btn" :class="{ active: showPreview }">
        <i :class="showPreview ? 'fas fa-edit' : 'fas fa-eye'"></i>
        {{ showPreview ? '編輯' : '預覽' }}
      </button>
    </div>
    
    <div class="editor-content">
      <textarea 
        v-if="!showPreview"
        ref="textarea"
        v-model="content"
        @input="handleInput"
        @keydown="handleKeydown"
        class="markdown-textarea"
        :placeholder="placeholder"
      ></textarea>
      
      <div v-else class="markdown-preview">
        <div v-html="renderedMarkdown"></div>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, computed, watch } from 'vue'

export default {
  name: 'MarkdownEditor',
  props: {
    modelValue: {
      type: String,
      default: ''
    },
    placeholder: {
      type: String,
      default: '請輸入內容...'
    }
  },
  emits: ['update:modelValue'],
  setup(props, { emit }) {
    const content = ref(props.modelValue)
    const showPreview = ref(false)
    const textarea = ref(null)
    
    watch(() => props.modelValue, (newVal) => {
      content.value = newVal
    })
    
    const handleInput = () => {
      emit('update:modelValue', content.value)
    }
    
    const renderedMarkdown = computed(() => {
      return parseMarkdown(content.value)
    })
    
    const parseMarkdown = (text) => {
      if (!text) return ''
      
      // 安全的markdown解析，只支援特定標籤
      let html = text
        // 底線 (必須在斜體之前處理)
        .replace(/<u>(.*?)<\/u>/gim, '<u>$1</u>')
        
        // 粗體
        .replace(/\*\*(.*?)\*\*/gim, '<strong>$1</strong>')
        
        // 斜體
        .replace(/\*(.*?)\*/gim, '<em>$1</em>')
        
        // 連結
        .replace(/\[([^\]]*)\]\(([^\)]*)\)/gim, '<a href="$2" target="_blank" rel="noopener">$1</a>')
        
        // 圖片
        .replace(/!\[([^\]]*)\]\(([^\)]*)\)/gim, '<img src="$2" alt="$1" style="max-width: 100%;">')
        
        // 無序列表
        .replace(/^\* (.+)$/gim, '<li>$1</li>')
        .replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>')
        
        // 有序列表
        .replace(/^\d+\. (.+)$/gim, '<li>$1</li>')
        
        // 段落
        .replace(/\n\n/gim, '</p><p>')
        .replace(/\n/gim, '<br>')
      
      return `<p>${html}</p>`
    }
    
    const insertText = (before, after = '') => {
      const start = textarea.value.selectionStart
      const end = textarea.value.selectionEnd
      const selectedText = content.value.substring(start, end)
      const replacement = before + selectedText + after
      
      content.value = content.value.substring(0, start) + replacement + content.value.substring(end)
      
      // 設置游標位置
      setTimeout(() => {
        textarea.value.focus()
        const newCursorPos = selectedText ? start + replacement.length : start + before.length
        textarea.value.setSelectionRange(newCursorPos, newCursorPos)
      }, 0)
      
      handleInput()
    }
    
    const addBold = () => {
      insertText('**', '**')
    }
    
    const addItalic = () => {
      insertText('*', '*')
    }
    
    const addUnderline = () => {
      insertText('<u>', '</u>')
    }
    
    const addBulletList = () => {
      const start = textarea.value.selectionStart
      const lineStart = content.value.lastIndexOf('\n', start - 1) + 1
      content.value = content.value.substring(0, lineStart) + '* ' + content.value.substring(lineStart)
      handleInput()
    }
    
    const addNumberedList = () => {
      const start = textarea.value.selectionStart
      const lineStart = content.value.lastIndexOf('\n', start - 1) + 1
      content.value = content.value.substring(0, lineStart) + '1. ' + content.value.substring(lineStart)
      handleInput()
    }
    
    const addLink = () => {
      const url = prompt('請輸入連結網址:')
      if (url) {
        const text = prompt('請輸入連結文字:') || url
        insertText(`[${text}](${url})`)
      }
    }
    
    const addImage = () => {
      const url = prompt('請輸入圖片網址:')
      if (url) {
        const alt = prompt('請輸入圖片描述:') || '圖片'
        insertText(`![${alt}](${url})`)
      }
    }
    
    const togglePreview = () => {
      showPreview.value = !showPreview.value
    }
    
    const handleKeydown = (e) => {
      // 快捷鍵
      if (e.ctrlKey || e.metaKey) {
        switch(e.key.toLowerCase()) {
          case 'b':
            e.preventDefault()
            addBold()
            break
          case 'i':
            e.preventDefault()
            addItalic()
            break
          case 'u':
            e.preventDefault()
            addUnderline()
            break
          case 'k':
            e.preventDefault()
            addLink()
            break
        }
      }
    }
    
    return {
      content,
      showPreview,
      textarea,
      renderedMarkdown,
      handleInput,
      handleKeydown,
      addBold,
      addItalic,
      addUnderline,
      addBulletList,
      addNumberedList,
      addLink,
      addImage,
      togglePreview
    }
  }
}
</script>

<style scoped>
.markdown-editor {
  border: 1px solid #ddd;
  border-radius: 8px;
  overflow: hidden;
  background: white;
}

.editor-toolbar {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 8px 12px;
  background: #f8f9fa;
  border-bottom: 1px solid #ddd;
}

.toolbar-btn {
  padding: 6px 10px;
  border: none;
  background: none;
  color: #666;
  cursor: pointer;
  border-radius: 4px;
  transition: all 0.2s;
  font-size: 14px;
  display: flex;
  align-items: center;
  gap: 4px;
}

.toolbar-btn:hover {
  background: #e9ecef;
  color: #333;
}

.toolbar-btn.active {
  background: #007bff;
  color: white;
}

.toolbar-separator {
  width: 1px;
  height: 20px;
  background: #ddd;
  margin: 0 4px;
}

.editor-content {
  min-height: 200px;
}

.markdown-textarea {
  width: 100%;
  min-height: 200px;
  padding: 12px;
  border: none;
  resize: vertical;
  font-family: 'Monaco', 'Menlo', 'Courier New', monospace;
  font-size: 14px;
  line-height: 1.6;
  color: #333;
}

.markdown-textarea:focus {
  outline: none;
}

.markdown-preview {
  padding: 12px;
  min-height: 200px;
  line-height: 1.6;
  color: #333;
}

.markdown-preview :deep(strong) {
  font-weight: 600;
}

.markdown-preview :deep(em) {
  font-style: italic;
}

.markdown-preview :deep(u) {
  text-decoration: underline;
}

.markdown-preview :deep(ul),
.markdown-preview :deep(ol) {
  padding-left: 20px;
  margin: 10px 0;
}

.markdown-preview :deep(li) {
  margin: 4px 0;
}

.markdown-preview :deep(a) {
  color: #007bff;
  text-decoration: none;
}

.markdown-preview :deep(a:hover) {
  text-decoration: underline;
}

.markdown-preview :deep(img) {
  max-width: 100%;
  height: auto;
  margin: 10px 0;
  border-radius: 4px;
}

.markdown-preview :deep(p) {
  margin: 10px 0;
}

.markdown-preview :deep(p:first-child) {
  margin-top: 0;
}

.markdown-preview :deep(p:last-child) {
  margin-bottom: 0;
}
</style>