<template>
  <div class="stage-view-toggle">
    <span 
      class="toggle-label" 
      :class="{ active: !showComments }"
      @click="setView(false)"
    >
      查看報告
    </span>
    <div 
      class="toggle-switch" 
      :class="{ active: showComments }"
      @click="toggleView"
    >
      <div class="toggle-slider"></div>
    </div>
    <span 
      class="toggle-label" 
      :class="{ active: showComments }"
      @click="setView(true)"
    >
      查看評論
    </span>
  </div>
</template>

<script>
export default {
  name: 'StageViewToggle',
  props: {
    modelValue: {
      type: Boolean,
      default: false // false = 查看報告, true = 查看評論
    }
  },
  computed: {
    showComments: {
      get() {
        return this.modelValue
      },
      set(value) {
        this.$emit('update:modelValue', value)
      }
    }
  },
  methods: {
    toggleView() {
      this.showComments = !this.showComments
    },
    setView(isComments) {
      this.showComments = isComments
    }
  }
}
</script>

<style scoped>
.stage-view-toggle {
  display: flex;
  align-items: center;
  gap: 12px;
  user-select: none;
}

.toggle-label {
  font-size: 14px;
  color: #7f8c8d;
  cursor: pointer;
  transition: color 0.3s;
  font-weight: 500;
}

.toggle-label.active {
  color: #2c3e50;
  font-weight: 600;
}

.toggle-switch {
  position: relative;
  width: 44px;
  height: 22px;
  background: #ddd;
  border-radius: 11px;
  cursor: pointer;
  transition: background-color 0.3s;
}

.toggle-switch.active {
  background: #2c3e50;
}

.toggle-slider {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 18px;
  height: 18px;
  background: white;
  border-radius: 50%;
  transition: transform 0.3s;
  box-shadow: 0 2px 4px rgba(0,0,0,0.2);
}

.toggle-switch.active .toggle-slider {
  transform: translateX(22px);
}

.toggle-label:hover {
  color: #2c3e50;
}
</style>