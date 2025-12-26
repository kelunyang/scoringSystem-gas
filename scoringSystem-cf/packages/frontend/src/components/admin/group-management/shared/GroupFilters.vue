<template>
  <div class="group-filters">
    <el-input
      v-model="localSearch"
      :placeholder="searchPlaceholder"
      class="search-input"
      style="width: 200px;"
      clearable
    >
      <template #prefix>
        <i class="fas fa-search"></i>
      </template>
    </el-input>

    <el-select
      :model-value="status"
      @update:model-value="$emit('update:status', $event)"
      placeholder="全部狀態"
      style="width: 120px;"
    >
      <el-option label="全部狀態" value="" />
      <el-option label="活躍" value="active" />
      <el-option label="停用" value="inactive" />
    </el-select>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { debounce } from '@/utils/debounce'
import { SEARCH_DEBOUNCE_MS } from '@/constants/group-management-constants'

defineOptions({
  name: 'GroupFilters'
})

const props = withDefaults(
  defineProps<{
    search: string
    status: string
    searchPlaceholder?: string
  }>(),
  {
    searchPlaceholder: '搜尋群組名稱'
  }
)

const emit = defineEmits<{
  'update:search': [value: string]
  'update:status': [value: string]
}>()

// Local search state for immediate UI feedback
const localSearch = ref(props.search)

// Debounced emit to avoid excessive filtering
const debouncedEmit = debounce((value: string) => {
  emit('update:search', value)
}, SEARCH_DEBOUNCE_MS)

// Watch local search and emit with debounce
watch(localSearch, (newValue) => {
  debouncedEmit(newValue)
})

// Sync external changes to local state
watch(() => props.search, (newValue) => {
  if (newValue !== localSearch.value) {
    localSearch.value = newValue
  }
})
</script>

<style scoped>
.group-filters {
  display: flex;
  gap: 12px;
  align-items: center;
}
</style>
