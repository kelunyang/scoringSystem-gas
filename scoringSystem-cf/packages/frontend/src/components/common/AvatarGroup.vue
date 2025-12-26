<template>
  <div class="avatar-group">
    <!-- Leader avatar with star badge -->
    <div
      v-if="leader"
      class="avatar-wrapper"
      @click="toggleExpand(leader.userEmail)"
    >
      <el-badge class="leader-badge">
        <template #content>
          <i class="fas fa-star"></i>
        </template>
        <img
          :src="getAvatarUrl(leader)"
          :alt="leader.displayName || leader.userEmail"
          class="avatar leader"
          :style="{ width: size, height: size }"
        />
      </el-badge>
      <transition name="slide-name">
        <div v-if="isExpanded(leader.userEmail)" class="name-card">
          {{ leader.displayName || leader.userEmail.split('@')[0] }} ({{ leader.userEmail }})
        </div>
      </transition>
    </div>

    <span v-if="leader && members.length > 0" class="separator">|</span>

    <!-- Member avatars stacked -->
    <div class="member-avatars">
      <div
        v-for="(member, idx) in members"
        :key="(member as any).userEmail"
        class="avatar-wrapper"
        :style="{
          marginLeft: idx > 0 ? '-10px' : '0',
          zIndex: isExpanded((member as any).userEmail) ? 100 : members.length - idx
        }"
        @click="toggleExpand((member as any).userEmail)"
      >
        <img
          :src="getAvatarUrl(member)"
          :alt="(member as any).displayName || (member as any).userEmail"
          class="avatar member"
          :style="{ width: size, height: size }"
        />
        <transition name="slide-name">
          <div v-if="isExpanded((member as any).userEmail)" class="name-card">
            {{ (member as any).displayName || (member as any).userEmail.split('@')[0] }} ({{ (member as any).userEmail }})
          </div>
        </transition>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onUnmounted } from 'vue'
import { generateAvatarUrl } from '@/utils/walletHelpers'
import type { Member } from '@/types'

const props = defineProps({
  groupMembers: {
    type: Array,
    required: true,
    default: () => []
  },
  size: {
    type: String,
    default: '40px'
  },
  autoHideDelay: {
    type: Number,
    default: 3000
  }
})

// Map to store userEmail -> timeout ID
const expandedAvatars = ref(new Map())

const leader = computed(() => {
  return (props.groupMembers as any[]).find((m: any) => m.role === 'leader')
})

const members = computed(() => {
  return (props.groupMembers as any[]).filter((m: any) => m.role === 'member')
})

const toggleExpand = (userEmail: string) => {
  if (expandedAvatars.value.has(userEmail)) {
    // Already expanded - collapse immediately
    clearTimeout(expandedAvatars.value.get(userEmail))
    expandedAvatars.value.delete(userEmail)
  } else {
    // Expand and set auto-hide timer
    const timeoutId = setTimeout(() => {
      expandedAvatars.value.delete(userEmail)
      expandedAvatars.value = new Map(expandedAvatars.value) // Trigger reactivity
    }, props.autoHideDelay)

    expandedAvatars.value.set(userEmail, timeoutId)
  }

  // Trigger reactivity
  expandedAvatars.value = new Map(expandedAvatars.value)
}

const isExpanded = (userEmail: string) => {
  return expandedAvatars.value.has(userEmail)
}

const getAvatarUrl = (member: Member) => {
  // Try to use the generateAvatarUrl helper if avatar data exists
  if (member.avatarSeed || member.avatarStyle) {
    return generateAvatarUrl(member)
  }

  // Fallback to email-based avatar
  return `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(member.userEmail)}`
}

// Cleanup timers on component unmount
onUnmounted(() => {
  expandedAvatars.value.forEach(timeoutId => clearTimeout(timeoutId))
})
</script>

<style scoped>
.avatar-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.member-avatars {
  display: flex;
  align-items: center;
}

.avatar-wrapper {
  cursor: pointer;
  display: flex;
  align-items: center;
  transition: all 0.3s ease;
}

.name-card {
  background: white;
  padding: 6px 12px;
  border-radius: 4px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  white-space: nowrap;
  font-size: 13px;
  color: #2c3e50;
  border: 1px solid #e1e8ed;
  margin-left: 8px;
  overflow: hidden;
}

.slide-name-enter-active,
.slide-name-leave-active {
  transition: all 0.3s ease;
}

.slide-name-enter-from,
.slide-name-leave-to {
  opacity: 0;
  max-width: 0;
  margin-left: 0;
  padding-left: 0;
  padding-right: 0;
}

.slide-name-enter-to,
.slide-name-leave-from {
  opacity: 1;
  max-width: 300px;
}

.avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: 2px solid #e1e8ed;
  transition: transform 0.2s, box-shadow 0.2s;
  background: white;
  object-fit: cover;
}

.avatar:hover {
  transform: scale(1.05);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
}

.avatar.leader {
  border-color: #000;
  border-width: 2px;
}

/* Leader 星星徽章樣式 */
.leader-badge :deep(.el-badge__content) {
  background: linear-gradient(135deg, #ffd700 0%, #ffa500 100%);
  color: white;
  border: 2px solid white;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
  font-size: 10px;
  padding: 2px 4px;
  top: -4px;
  right: -4px;
}

.leader-badge :deep(.el-badge__content) i {
  font-size: 10px;
}

.separator {
  color: #bdc3c7;
  font-size: 18px;
  margin: 0 4px;
  user-select: none;
}
</style>
