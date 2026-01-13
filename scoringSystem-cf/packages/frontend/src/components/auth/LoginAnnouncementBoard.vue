<template>
  <div v-if="sortedAnnouncements.length > 0" class="login-announcement-board">
    <!-- Primary announcement (expandable) -->
    <ExpandableRow
      :is-expanded="expandedId === primaryAnnouncement.announcementId"
      @toggle="toggleExpansion(primaryAnnouncement.announcementId)"
    >
      <template #trigger>
        <div class="announcement-trigger" :class="`announcement-trigger--${primaryAnnouncement.type}`">
          <i :class="getTypeIcon(primaryAnnouncement.type)" class="type-icon"></i>
          <span class="announcement-title">{{ primaryAnnouncement.title }}</span>
          <span class="announcement-expiry">
            <i class="fas fa-clock"></i>
            {{ formatExpiry(primaryAnnouncement.endTime) }}
          </span>
        </div>
      </template>

      <template #content>
        <div class="announcement-content" :class="`announcement-content--${primaryAnnouncement.type}`">
          <MdPreviewWrapper :content="primaryAnnouncement.content" />
        </div>
      </template>
    </ExpandableRow>

    <!-- Show more announcements badge/button -->
    <div v-if="sortedAnnouncements.length > 1" class="more-announcements">
      <el-badge :value="sortedAnnouncements.length - 1" :max="99">
        <el-button
          size="small"
          type="info"
          plain
          @click="showAllDrawer = true"
        >
          <i class="fas fa-list"></i>
          查看全部公告
        </el-button>
      </el-badge>
    </div>

    <!-- All announcements drawer -->
    <el-drawer
      v-model="showAllDrawer"
      title="系統公告"
      direction="btt"
      size="80%"
    >
      <div class="all-announcements">
        <div
          v-for="announcement in sortedAnnouncements"
          :key="announcement.announcementId"
          class="announcement-item"
        >
          <ExpandableRow
            :is-expanded="expandedInDrawer === announcement.announcementId"
            @toggle="toggleDrawerExpansion(announcement.announcementId)"
          >
            <template #trigger>
              <div class="announcement-trigger" :class="`announcement-trigger--${announcement.type}`">
                <i :class="getTypeIcon(announcement.type)" class="type-icon"></i>
                <span class="announcement-title">{{ announcement.title }}</span>
                <span class="announcement-expiry">
                  <i class="fas fa-clock"></i>
                  {{ formatExpiry(announcement.endTime) }}
                </span>
              </div>
            </template>

            <template #content>
              <div class="announcement-content" :class="`announcement-content--${announcement.type}`">
                <MdPreviewWrapper :content="announcement.content" />
              </div>
            </template>
          </ExpandableRow>
        </div>
      </div>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import ExpandableRow from '@/components/common/ExpandableRow.vue'
import MdPreviewWrapper from '@/components/MdPreviewWrapper.vue'
import { useActiveAnnouncements, type PublicAnnouncement } from '@/composables/useAnnouncements'
import type { AnnouncementType } from '@repo/shared'

// ===== Fetch announcements =====
const { data: announcements } = useActiveAnnouncements()

// ===== Constants =====

/**
 * Alert priority (lower number = higher priority)
 * Matches DrawerAlertZone priority order
 */
const TYPE_PRIORITY: Record<AnnouncementType, number> = {
  error: 0,    // Highest priority
  warning: 1,
  info: 2,
  success: 3   // Lowest priority
}

/**
 * Type icons (matches DrawerAlertZone icons)
 */
const TYPE_ICONS: Record<AnnouncementType, string> = {
  error: 'fas fa-times-circle',
  warning: 'fas fa-exclamation-triangle',
  info: 'fas fa-info-circle',
  success: 'fas fa-check-circle'
}

// ===== State =====

const expandedId = ref<string | null>(null)
const showAllDrawer = ref(false)
const expandedInDrawer = ref<string | null>(null)

// ===== Computed =====

/**
 * Sort announcements by priority, then by closest to expiring
 */
const sortedAnnouncements = computed<PublicAnnouncement[]>(() => {
  if (!announcements.value) return []

  return [...announcements.value].sort((a, b) => {
    // First sort by priority
    const priorityDiff = TYPE_PRIORITY[a.type] - TYPE_PRIORITY[b.type]
    if (priorityDiff !== 0) return priorityDiff

    // Same priority: sort by closest to expiring (endTime)
    return a.endTime - b.endTime
  })
})

/**
 * Primary announcement (most important + soonest to expire)
 */
const primaryAnnouncement = computed<PublicAnnouncement>(() => {
  return sortedAnnouncements.value[0]
})

// ===== Methods =====

const getTypeIcon = (type: AnnouncementType): string => {
  return TYPE_ICONS[type] || 'fas fa-info-circle'
}

const toggleExpansion = (id: string) => {
  expandedId.value = expandedId.value === id ? null : id
}

const toggleDrawerExpansion = (id: string) => {
  expandedInDrawer.value = expandedInDrawer.value === id ? null : id
}

/**
 * Format expiry time relative to now
 */
const formatExpiry = (endTime: number): string => {
  const now = Date.now()
  const diff = endTime - now

  if (diff < 0) return '已過期'

  const hours = Math.floor(diff / (1000 * 60 * 60))
  const days = Math.floor(hours / 24)

  if (days > 0) {
    return `${days} 天後結束`
  } else if (hours > 0) {
    return `${hours} 小時後結束`
  } else {
    const minutes = Math.floor(diff / (1000 * 60))
    return minutes > 0 ? `${minutes} 分鐘後結束` : '即將結束'
  }
}
</script>

<style scoped>
.login-announcement-board {
  margin: 16px 0;
}

/* Trigger styles - clean look without background */
.announcement-trigger {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 0;
  cursor: pointer;
  transition: opacity 0.2s;
}

.announcement-trigger:hover {
  opacity: 0.8;
}

.announcement-trigger .type-icon {
  font-size: 16px;
  flex-shrink: 0;
}

.announcement-trigger .announcement-title {
  flex: 1;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #2c3e50;
}

.announcement-trigger .announcement-expiry {
  font-size: 11px;
  color: #909399;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 4px;
}

/* Type-specific icon colors only */
.announcement-trigger--error .type-icon {
  color: #F56C6C;
}

.announcement-trigger--warning .type-icon {
  color: #E6A23C;
}

.announcement-trigger--info .type-icon {
  color: #409EFF;
}

.announcement-trigger--success .type-icon {
  color: #67C23A;
}

/* Content styles - minimal */
.announcement-content {
  padding: 12px 0 12px 26px;
  border-left: 2px solid #e0e0e0;
  margin-left: 7px;
}

.announcement-content--error {
  border-left-color: #F56C6C;
}

.announcement-content--warning {
  border-left-color: #E6A23C;
}

.announcement-content--info {
  border-left-color: #409EFF;
}

.announcement-content--success {
  border-left-color: #67C23A;
}

/* More announcements button */
.more-announcements {
  display: flex;
  justify-content: center;
  padding: 8px 0;
}

/* All announcements drawer */
.all-announcements {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
}

.announcement-item {
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid #eee;
  padding: 12px;
}
</style>
