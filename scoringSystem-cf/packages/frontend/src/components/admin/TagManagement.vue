<!--
<i class="fas fa-exclamation-triangle"></i> DISABLED: Tags system has been disabled
This entire component is commented out and kept for reference only
-->

<!-- ENTIRE COMPONENT DISABLED - Tags system has been disabled

<template>
  <div class="tag-management">
    <!-- Header -->
    <div class="mgmt-header">
      <div class="header-left">
        <h2><i class="fas fa-tags"></i> 標籤管理</h2>
        <div class="tag-stats">
          <span class="stat-item">
            <i class="fas fa-tag"></i>
            總標籤數: {{ stats.totalTags }}
          </span>
          <span class="stat-item">
            <i class="fas fa-check-circle"></i>
            活躍標籤: {{ stats.activeTags }}
          </span>
          <span class="stat-item">
            <i class="fas fa-archive"></i>
            封存標籤: {{ stats.archivedTags }}
          </span>
        </div>
      </div>
      <div class="header-right">
        <button class="btn-primary" @click="showCreateModal = true">
          <i class="fas fa-plus"></i>
          新增標籤
        </button>
        <button class="btn-secondary" @click="refreshTags">
          <i class="fas fa-sync"></i>
          重新整理
        </button>
      </div>
    </div>

    <!-- Filters -->
    <div class="filters">
      <div class="filter-row">
        <input 
          type="text" 
          v-model="searchText" 
          placeholder="搜尋標籤名稱或描述"
          class="search-input"
        >
        <select v-model="statusFilter" class="filter-select">
          <option value="">全部狀態</option>
          <option value="active">活躍</option>
          <option value="archived">封存</option>
        </select>
      </div>
    </div>

    <!-- Tags Table -->
    <div class="table-container" v-loading="loading" element-loading-text="載入標籤資料中...">
      <div v-if="filteredTags.length === 0 && !loading" class="empty-state">
        <i class="fas fa-tags"></i>
        <p>沒有找到符合條件的標籤</p>
      </div>
      
      <table v-else class="tags-table">
        <thead>
          <tr>
            <th>標籤預覽</th>
            <th>使用統計</th>
            <th>建立者</th>
            <th>狀態</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr 
            v-for="tag in filteredTags" 
            :key="tag.tagId"
            :class="{ archived: !tag.isActive }"
          >
            <td class="tag-preview">
              <span
                class="tag-badge"
                :style="{ backgroundColor: getTagColor(tag.tagId) }"
              >
                {{ tag.tagName }}
              </span>
            </td>
            <td class="usage-stats">
              <div class="stats">
                <span class="stat-item">
                  <i class="fas fa-users"></i>
                  {{ getTagUserCount(tag.tagId) }}
                </span>
                <span class="stat-item">
                  <i class="fas fa-project-diagram"></i>
                  {{ getTagProjectCount(tag.tagId) }}
                </span>
              </div>
            </td>
            <td class="creator">{{ tag.createdBy }}</td>
            <td class="status">
              <span class="status-badge" :class="tag.isActive ? 'active' : 'archived'">
                <i :class="tag.isActive ? 'fas fa-check-circle' : 'fas fa-archive'"></i>
                {{ tag.isActive ? '活躍' : '封存' }}
              </span>
            </td>
            <td class="actions">
              <button class="btn-sm btn-primary" @click="editTag(tag)" title="編輯">
                <i class="fas fa-edit"></i>
              </button>
              <el-popconfirm
                v-if="tag.isActive"
                :title="`確定要封存標籤「${tag.tagName}」嗎？封存後將無法再指派給新的用戶或專案。`"
                confirm-button-text="確定"
                cancel-button-text="取消"
                @confirm="archiveTag(tag)"
              >
                <template #reference>
                  <button
                    class="btn-sm btn-warning"
                    title="封存"
                  >
                    <i class="fas fa-archive"></i>
                  </button>
                </template>
              </el-popconfirm>
              <button
                v-else
                class="btn-sm btn-success"
                @click="restoreTag(tag)"
                title="還原"
              >
                <i class="fas fa-undo"></i>
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Create/Edit Modal -->
    <div v-if="showCreateModal || showEditModal" class="modal-overlay" @click="closeModal">
      <div class="modal-content" @click.stop>
        <h3>
          <i class="fas fa-tag"></i>
          {{ showCreateModal ? '新增標籤' : '編輯標籤' }}
        </h3>
        
        <div class="form-group">
          <label>標籤名稱 <span class="required">*</span></label>
          <input
            type="text"
            v-model="tagForm.tagName"
            class="form-input"
            placeholder="輸入標籤名稱"
            maxlength="50"
          >
        </div>

        <div class="form-group">
          <label>描述</label>
          <textarea
            v-model="tagForm.description"
            class="form-textarea"
            placeholder="輸入標籤描述（選填）"
            rows="3"
            maxlength="200"
          ></textarea>
        </div>
        
        <div class="modal-actions">
          <button 
            class="btn-primary" 
            @click="saveTag"
            :disabled="saving || !tagForm.tagName.trim()"
          >
            <i class="fas fa-save"></i>
            {{ saving ? '儲存中...' : '儲存' }}
          </button>
          <button class="btn-secondary" @click="closeModal">
            取消
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { apiClient } from '@/utils/api'
import { getTagColor } from '../../utils/tagColor'

export default {
  name: 'TagManagement',
  setup() {

    const tags = ref([])
    const userTags = ref([])
    const projectTags = ref([])
    const searchText = ref('')
    const statusFilter = ref('')
    const loading = ref(false)
    const saving = ref(false)
    
    const showCreateModal = ref(false)
    const showEditModal = ref(false)
    const editingTag = ref(null)
    
    const tagForm = reactive({
      tagName: '',
      description: ''
    })
    
    const stats = computed(() => ({
      totalTags: tags.value.length,
      activeTags: tags.value.filter(t => t.isActive).length,
      archivedTags: tags.value.filter(t => !t.isActive).length
    }))
    
    const filteredTags = computed(() => {
      let filtered = [...tags.value]
      
      if (searchText.value) {
        const search = searchText.value.toLowerCase()
        filtered = filtered.filter(tag => 
          tag.tagName.toLowerCase().includes(search) ||
          (tag.description && tag.description.toLowerCase().includes(search))
        )
      }
      
      
      if (statusFilter.value) {
        filtered = filtered.filter(tag => 
          statusFilter.value === 'active' ? tag.isActive : !tag.isActive
        )
      }
      
      return filtered.sort((a, b) => b.createdTime - a.createdTime)
    })
    
    
    const getTagUserCount = (tagId) => {
      return userTags.value.filter(ut => ut.tagId === tagId && ut.isActive).length
    }
    
    const getTagProjectCount = (tagId) => {
      return projectTags.value.filter(pt => pt.tagId === tagId && pt.isActive).length
    }
    
    const loadTags = async () => {
      loading.value = true
      try {
        ElMessage.info('開始更新標籤列表')

        const response = await apiClient.callWithAuth('/tags/list', {})
        if (response.success && response.data) {
          tags.value = response.data
          ElMessage.success('標籤列表資料下載完成')
        } else {
          console.error('Failed to load tags:', response)
          ElMessage.error(`無法載入標籤資料: ${response.error?.message || '未知錯誤'}`)
        }
      } catch (error) {
        console.error('Error loading tags:', error)
        ElMessage.error('載入標籤資料失敗，請重試')
      } finally {
        loading.value = false
      }
    }
    
    const loadTagAssignments = async () => {
      try {
        // Load user tag assignments
        const userResponse = await apiClient.callWithAuth('/tags/assignments/users', {})
        if (userResponse.success && userResponse.data) {
          userTags.value = userResponse.data
        }
        
        // Load project tag assignments
        const projectResponse = await apiClient.callWithAuth('/tags/assignments/projects', {})
        if (projectResponse.success && projectResponse.data) {
          projectTags.value = projectResponse.data
        }
      } catch (error) {
        console.error('Error loading tag assignments:', error)
      }
    }
    
    const refreshTags = () => {
      loadTags()
      loadTagAssignments()
    }
    
    const editTag = (tag) => {
      editingTag.value = tag
      tagForm.tagName = tag.tagName
      tagForm.description = tag.description || ''
      showEditModal.value = true
    }
    
    const saveTag = async () => {
      if (!tagForm.tagName.trim()) return
      
      saving.value = true
      try {
        if (showCreateModal.value) {
          // Create new tag
          const response = await apiClient.callWithAuth('/tags/create', {
            tagData: {
              tagName: tagForm.tagName,
              description: tagForm.description
            }
          })

          if (response.success) {
            await refreshTags()
            closeModal()
            ElMessage.success('標籤建立成功')
          } else {
            console.error('Failed to create tag:', response.error)
            ElMessage.error('建立標籤失敗: ' + (response.error?.message || '未知錯誤'))
          }
        } else if (showEditModal.value && editingTag.value) {
          // Update existing tag
          const response = await apiClient.callWithAuth('/tags/update', {
            tagId: editingTag.value.tagId,
            updates: {
              tagName: tagForm.tagName,
              description: tagForm.description
            }
          })
          
          if (response.success) {
            await refreshTags()
            closeModal()
            ElMessage.success('標籤更新成功')
          } else {
            console.error('Failed to update tag:', response.error)
            ElMessage.error('更新標籤失敗: ' + (response.error?.message || '未知錯誤'))
          }
        }
      } catch (error) {
        console.error('Error saving tag:', error)
        ElMessage.error('儲存標籤時發生錯誤')
      } finally {
        saving.value = false
      }
    }
    
    const archiveTag = async (tag) => {
      try {
        const response = await apiClient.callWithAuth('/tags/update', {
          tagId: tag.tagId,
          updates: { isActive: false }
        })

        if (response.success) {
          await refreshTags()
          ElMessage.success('標籤已封存')
        } else {
          console.error('Failed to archive tag:', response.error)
          ElMessage.error('封存標籤失敗: ' + (response.error?.message || '未知錯誤'))
        }
      } catch (error) {
        console.error('Error archiving tag:', error)
        ElMessage.error('封存標籤時發生錯誤')
      }
    }
    
    const restoreTag = async (tag) => {
      try {
        const response = await apiClient.callWithAuth('/tags/update', {
          tagId: tag.tagId,
          updates: { isActive: true }
        })
        
        if (response.success) {
          await refreshTags()
          ElMessage.success('標籤已還原')
        } else {
          console.error('Failed to restore tag:', response.error)
          ElMessage.error('還原標籤失敗: ' + (response.error?.message || '未知錯誤'))
        }
      } catch (error) {
        console.error('Error restoring tag:', error)
        ElMessage.error('還原標籤時發生錯誤')
      }
    }
    
    const closeModal = () => {
      showCreateModal.value = false
      showEditModal.value = false
      editingTag.value = null
      tagForm.tagName = ''
      tagForm.description = ''
    }
    
    onMounted(() => {
      refreshTags()
    })

    return {
      tags,
      searchText,
      statusFilter,
      loading,
      saving,
      showCreateModal,
      showEditModal,
      tagForm,
      stats,
      filteredTags,
      getTagUserCount,
      getTagProjectCount,
      refreshTags,
      editTag,
      saveTag,
      archiveTag,
      restoreTag,
      closeModal,
      getTagColor
    }
  }
}
</script>

<style scoped>
.tag-management {
  padding: 20px;
}

.mgmt-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 30px;
}

.header-left h2 {
  margin: 0 0 10px 0;
  color: #2c3e50;
  font-size: 24px;
}

.tag-stats {
  display: flex;
  gap: 20px;
}

.stat-item {
  display: flex;
  align-items: center;
  gap: 5px;
  color: #7f8c8d;
  font-size: 14px;
}

.stat-item i {
  color: #3498db;
}

.header-right {
  display: flex;
  gap: 10px;
}

.btn-primary, .btn-secondary {
  padding: 8px 16px;
  border: none;
  border-radius: 5px;
  cursor: pointer;
  font-size: 14px;
  display: flex;
  align-items: center;
  gap: 5px;
  transition: background-color 0.3s;
}

.btn-primary {
  background: #3498db;
  color: white;
}

.btn-primary:hover {
  background: #2980b9;
}

.btn-primary:disabled {
  background: #95a5a6;
  cursor: not-allowed;
}

.btn-secondary {
  background: #ecf0f1;
  color: #2c3e50;
}

.btn-secondary:hover {
  background: #bdc3c7;
}

.filters {
  background: white;
  padding: 20px;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  margin-bottom: 30px;
}

.filter-row {
  display: flex;
  gap: 15px;
  align-items: center;
}

.search-input {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid #ddd;
  border-radius: 5px;
  font-size: 14px;
}

.filter-select {
  padding: 8px 12px;
  border: 1px solid #ddd;
  border-radius: 5px;
  font-size: 14px;
  background: white;
  cursor: pointer;
  min-width: 150px;
}

.table-container {
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  padding: 20px;
  min-height: 400px;
}

.tags-table {
  width: 100%;
  border-collapse: collapse;
  margin-top: 10px;
}

.tags-table th {
  background: #f8f9fa;
  padding: 12px 8px;
  text-align: left;
  border-bottom: 2px solid #e9ecef;
  font-weight: 600;
  color: #495057;
  font-size: 14px;
}

.tags-table td {
  padding: 12px 8px;
  border-bottom: 1px solid #e9ecef;
  vertical-align: middle;
}

.tags-table tr:hover {
  background-color: #f8f9fa;
}

.tags-table tr.archived {
  opacity: 0.6;
}

.tag-preview .tag-badge {
  padding: 4px 8px;
  border-radius: 12px;
  color: white;
  font-size: 12px;
  font-weight: 500;
  white-space: nowrap;
}

.tag-name {
  font-weight: 500;
  color: #2c3e50;
}

.description {
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #6c757d;
}

.usage-stats .stats {
  display: flex;
  gap: 15px;
}

.usage-stats .stat-item {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: #6c757d;
}

.usage-stats .stat-item i {
  font-size: 14px;
}

.creator {
  color: #6c757d;
  font-size: 13px;
}

.create-time {
  color: #6c757d;
  font-size: 13px;
  white-space: nowrap;
}

.status .status-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 500;
}

.status .status-badge.active {
  background: #d4edda;
  color: #155724;
}

.status .status-badge.archived {
  background: #f8d7da;
  color: #721c24;
}

.actions {
  white-space: nowrap;
}

.actions .btn-sm {
  padding: 6px 8px;
  margin-right: 5px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  transition: all 0.2s;
}

.actions .btn-sm:last-child {
  margin-right: 0;
}

.actions .btn-primary {
  background: #007bff;
  color: white;
}

.actions .btn-primary:hover {
  background: #0056b3;
}

.actions .btn-warning {
  background: #ffc107;
  color: #212529;
}

.actions .btn-warning:hover {
  background: #e0a800;
}

.actions .btn-success {
  background: #28a745;
  color: white;
}

.actions .btn-success:hover {
  background: #1e7e34;
}

.loading-state, .empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 300px;
  color: #7f8c8d;
}

.loading-state i, .empty-state i {
  font-size: 48px;
  margin-bottom: 15px;
  color: #bdc3c7;
}

.tags-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 20px;
}

.tag-card {
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  padding: 15px;
  background: white;
  transition: all 0.3s;
}

.tag-card:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  transform: translateY(-2px);
}

.tag-card.archived {
  opacity: 0.7;
  background: #f8f9fa;
}

.tag-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 15px;
}

.tag-preview {
  flex: 1;
}

.tag-badge {
  display: inline-block;
  padding: 6px 12px;
  border-radius: 20px;
  color: white;
  font-size: 14px;
  font-weight: 500;
}

.tag-actions {
  display: flex;
  gap: 5px;
}

.btn-sm {
  padding: 5px 8px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  transition: all 0.3s;
}

.btn-edit {
  background: #3498db;
  color: white;
}

.btn-edit:hover {
  background: #2980b9;
}

.btn-archive {
  background: #e74c3c;
  color: white;
}

.btn-archive:hover {
  background: #c0392b;
}

.btn-restore {
  background: #2ecc71;
  color: white;
}

.btn-restore:hover {
  background: #27ae60;
}

.tag-info {
  margin-bottom: 15px;
}

.info-row {
  display: flex;
  margin-bottom: 5px;
  font-size: 13px;
}

.info-row .label {
  font-weight: 600;
  color: #7f8c8d;
  min-width: 80px;
}

.info-row .value {
  color: #2c3e50;
  flex: 1;
}

.tag-usage {
  display: flex;
  gap: 15px;
  padding-top: 10px;
  border-top: 1px solid #ecf0f1;
}

.usage-item {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  color: #7f8c8d;
}

/* Modal Styles */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-content {
  background: white;
  border-radius: 8px;
  padding: 30px;
  max-width: 500px;
  width: 100%;
  max-height: 90vh;
  overflow-y: auto;
}

.modal-content h3 {
  margin: 0 0 20px 0;
  color: #2c3e50;
  display: flex;
  align-items: center;
  gap: 10px;
}

.form-group {
  margin-bottom: 20px;
}

.form-group label {
  display: block;
  margin-bottom: 5px;
  font-weight: 600;
  color: #2c3e50;
}

.required {
  color: #e74c3c;
}

.form-input, .form-select, .form-textarea {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid #ddd;
  border-radius: 5px;
  font-size: 14px;
}

.form-textarea {
  resize: vertical;
  min-height: 60px;
}

.modal-actions {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
  margin-top: 25px;
}
</style>
END OF DISABLED COMPONENT - Tags system has been disabled -->
