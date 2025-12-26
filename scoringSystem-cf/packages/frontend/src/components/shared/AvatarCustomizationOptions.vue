<template>
  <div class="avatar-customization-options" :class="`layout-${layout}`">

    <!-- Avatar Style Selection -->
    <div class="param-group">
      <label>頭像風格：</label>
      <div class="style-options">
        <div
          v-for="avatarStyle in avatarStyles"
          :key="avatarStyle.value"
          class="style-option"
          :class="{ selected: style === avatarStyle.value }"
          @click="$emit('update:style', avatarStyle.value)"
        >
          {{ avatarStyle.label }}
        </div>
      </div>
    </div>

    <!-- Avataaars Style Options -->
    <template v-if="style === 'avataaars'">
      <div class="param-group">
        <label>膚色：</label>
        <div class="color-options">
          <div
            v-for="color in skinColors"
            :key="color.value"
            class="color-option"
            :style="{ backgroundColor: '#' + color.value }"
            :class="{ selected: options.skinColor === color.value }"
            @click="$emit('update:option', 'skinColor', color.value)"
            :title="color.label"
          ></div>
        </div>
      </div>

      <div class="param-group">
        <label>髮色：</label>
        <div class="color-options">
          <div
            v-for="color in hairColors"
            :key="color.value"
            class="color-option"
            :style="{ backgroundColor: '#' + color.value }"
            :class="{ selected: options.hairColor === color.value }"
            @click="$emit('update:option', 'hairColor', color.value)"
            :title="color.label"
          ></div>
        </div>
      </div>

      <div class="param-group">
        <label>背景顏色：</label>
        <div class="color-options">
          <div
            v-for="color in backgroundColors"
            :key="color.value"
            class="color-option"
            :style="{ backgroundColor: '#' + color.value }"
            :class="{ selected: options.backgroundColor === color.value }"
            @click="$emit('update:option', 'backgroundColor', color.value)"
            :title="color.label"
          ></div>
        </div>
      </div>

      <div class="param-group">
        <label>衣服顏色：</label>
        <div class="color-options">
          <div
            v-for="color in clothesColors"
            :key="color.value"
            class="color-option"
            :style="{ backgroundColor: '#' + color.value }"
            :class="{ selected: options.clothesColor === color.value }"
            @click="$emit('update:option', 'clothesColor', color.value)"
            :title="color.label"
          ></div>
        </div>
      </div>

      <div class="param-group">
        <label>眼睛：</label>
        <el-select :model-value="options.eyes" size="small" @change="(val) => $emit('update:option', 'eyes', val)">
          <el-option v-for="opt in eyesOptions" :key="opt.value" :label="opt.label" :value="opt.value" />
        </el-select>
      </div>

      <div class="param-group">
        <label>嘴巴：</label>
        <el-select :model-value="options.mouth" size="small" @change="(val) => $emit('update:option', 'mouth', val)">
          <el-option v-for="opt in mouthOptions" :key="opt.value" :label="opt.label" :value="opt.value" />
        </el-select>
      </div>

      <div class="param-group">
        <label>髮型：</label>
        <el-select :model-value="options.top" size="small" @change="(val) => $emit('update:option', 'top', val)">
          <el-option v-for="opt in topOptions" :key="opt.value" :label="opt.label" :value="opt.value" />
        </el-select>
      </div>

      <div class="param-group">
        <label>衣服：</label>
        <el-select :model-value="options.clothing" size="small" @change="(val) => $emit('update:option', 'clothing', val)">
          <el-option v-for="opt in clothingOptions" :key="opt.value" :label="opt.label" :value="opt.value" />
        </el-select>
      </div>
    </template>

    <!-- Pixel-Art Style Options -->
    <template v-else-if="style === 'pixel-art'">
      <div class="param-group">
        <label>膚色：</label>
        <div class="color-options">
          <div
            v-for="color in pixelartSkinColors"
            :key="color.value"
            class="color-option"
            :style="{ backgroundColor: '#' + color.value }"
            :class="{ selected: options.skinColor === color.value }"
            @click="$emit('update:option', 'skinColor', color.value)"
            :title="color.label"
          ></div>
        </div>
      </div>

      <div class="param-group">
        <label>髮色：</label>
        <div class="color-options">
          <div
            v-for="color in pixelartHairColors"
            :key="color.value"
            class="color-option"
            :style="{ backgroundColor: '#' + color.value }"
            :class="{ selected: options.hairColor === color.value }"
            @click="$emit('update:option', 'hairColor', color.value)"
            :title="color.label"
          ></div>
        </div>
      </div>

      <div class="param-group">
        <label>衣服顏色：</label>
        <div class="color-options">
          <div
            v-for="color in pixelartClothingColors"
            :key="color.value"
            class="color-option"
            :style="{ backgroundColor: '#' + color.value }"
            :class="{ selected: options.clothingColor === color.value }"
            @click="$emit('update:option', 'clothingColor', color.value)"
            :title="color.label"
          ></div>
        </div>
      </div>
    </template>

    <!-- Personas Style Options -->
    <template v-else-if="style === 'personas'">
      <div class="param-group">
        <label>膚色：</label>
        <div class="color-options">
          <div
            v-for="color in personasSkinColors"
            :key="color.value"
            class="color-option"
            :style="{ backgroundColor: '#' + color.value }"
            :class="{ selected: options.skinColor === color.value }"
            @click="$emit('update:option', 'skinColor', color.value)"
            :title="color.label"
          ></div>
        </div>
      </div>

      <div class="param-group">
        <label>髮色：</label>
        <div class="color-options">
          <div
            v-for="color in personasHairColors"
            :key="color.value"
            class="color-option"
            :style="{ backgroundColor: '#' + color.value }"
            :class="{ selected: options.hairColor === color.value }"
            @click="$emit('update:option', 'hairColor', color.value)"
            :title="color.label"
          ></div>
        </div>
      </div>

      <div class="param-group">
        <label>衣服顏色：</label>
        <div class="color-options">
          <div
            v-for="color in personasClothingColors"
            :key="color.value"
            class="color-option"
            :style="{ backgroundColor: '#' + color.value }"
            :class="{ selected: options.clothingColor === color.value }"
            @click="$emit('update:option', 'clothingColor', color.value)"
            :title="color.label"
          ></div>
        </div>
      </div>

      <div class="param-group">
        <label>眼睛：</label>
        <el-select :model-value="options.eyes" size="small" @change="(val) => $emit('update:option', 'eyes', val)">
          <el-option v-for="opt in personasEyesOptions" :key="opt.value" :label="opt.label" :value="opt.value" />
        </el-select>
      </div>

      <div class="param-group">
        <label>嘴巴：</label>
        <el-select :model-value="options.mouth" size="small" @change="(val) => $emit('update:option', 'mouth', val)">
          <el-option v-for="opt in personasMouthOptions" :key="opt.value" :label="opt.label" :value="opt.value" />
        </el-select>
      </div>

      <div class="param-group">
        <label>髮型：</label>
        <el-select :model-value="options.hair" size="small" @change="(val) => $emit('update:option', 'hair', val)">
          <el-option v-for="opt in personasHairOptions" :key="opt.value" :label="opt.label" :value="opt.value" />
        </el-select>
      </div>
    </template>

    <!-- Bottts Style Options -->
    <template v-else-if="style === 'bottts'">
      <div class="param-group">
        <label>機器人顏色：</label>
        <div class="color-options">
          <div
            v-for="color in botttsBaseColors"
            :key="color.value"
            class="color-option"
            :style="{ backgroundColor: '#' + color.value }"
            :class="{ selected: options.baseColor === color.value }"
            @click="$emit('update:option', 'baseColor', color.value)"
            :title="color.label"
          ></div>
        </div>
      </div>

      <div class="param-group">
        <label>眼睛：</label>
        <el-select :model-value="options.eyes" size="small" @change="(val) => $emit('update:option', 'eyes', val)">
          <el-option v-for="opt in botttsEyesOptions" :key="opt.value" :label="opt.label" :value="opt.value" />
        </el-select>
      </div>

      <div class="param-group">
        <label>嘴巴：</label>
        <el-select :model-value="options.mouth" size="small" @change="(val) => $emit('update:option', 'mouth', val)">
          <el-option v-for="opt in botttsMouthOptions" :key="opt.value" :label="opt.label" :value="opt.value" />
        </el-select>
      </div>

      <div class="param-group">
        <label>紋理：</label>
        <el-select :model-value="options.texture" size="small" @change="(val) => $emit('update:option', 'texture', val)">
          <el-option v-for="opt in botttsTextureOptions" :key="opt.value" :label="opt.label" :value="opt.value" />
        </el-select>
      </div>
    </template>

    <!-- Initials Style Options -->
    <template v-else-if="style === 'initials'">
      <div class="param-group">
        <label>背景顏色：</label>
        <div class="color-options">
          <div
            v-for="color in initialsBackgroundColors"
            :key="color.value"
            class="color-option"
            :style="{ backgroundColor: '#' + color.value }"
            :class="{ selected: options.backgroundColor === color.value }"
            @click="$emit('update:option', 'backgroundColor', color.value)"
            :title="color.label"
          ></div>
        </div>
      </div>

      <div class="param-group">
        <label>文字顏色：</label>
        <div class="color-options">
          <div
            v-for="color in initialsTextColors"
            :key="color.value"
            class="color-option"
            :style="{ backgroundColor: '#' + color.value }"
            :class="{ selected: options.textColor === color.value }"
            @click="$emit('update:option', 'textColor', color.value)"
            :title="color.label"
          ></div>
        </div>
      </div>
    </template>

    <!-- Identicon Style Options -->
    <template v-else-if="style === 'identicon'">
      <div class="param-group">
        <label>圖案顏色：</label>
        <div class="color-options">
          <div
            v-for="color in identiconRowColors"
            :key="color.value"
            class="color-option"
            :style="{ backgroundColor: '#' + color.value }"
            :class="{ selected: options.rowColor === color.value }"
            @click="$emit('update:option', 'rowColor', color.value)"
            :title="color.label"
          ></div>
        </div>
      </div>
    </template>

  </div>
</template>

<script setup lang="ts">
import * as AvatarConfig from '@/utils/avatarConfig'

interface Props {
  style: string
  options: Record<string, any>
  layout?: 'dropdown' | 'inline'
}

withDefaults(defineProps<Props>(), {
  layout: 'dropdown'
})

defineEmits<{
  'update:style': [value: string]
  'update:option': [key: string, value: any]
}>()

// Import all avatar configuration options
const avatarStyles = AvatarConfig.AVATAR_STYLES

// Avataaars options
const skinColors = AvatarConfig.AVATAAARS_SKIN_COLORS
const hairColors = AvatarConfig.AVATAAARS_HAIR_COLORS
const backgroundColors = AvatarConfig.AVATAAARS_BACKGROUND_COLORS
const clothesColors = AvatarConfig.AVATAAARS_CLOTHES_COLORS
const eyesOptions = AvatarConfig.AVATAAARS_EYES
const mouthOptions = AvatarConfig.AVATAAARS_MOUTH
const topOptions = AvatarConfig.AVATAAARS_TOP
const clothingOptions = AvatarConfig.AVATAAARS_CLOTHING

// Pixel-art options
const pixelartSkinColors = AvatarConfig.PIXELART_SKIN_COLORS
const pixelartHairColors = AvatarConfig.PIXELART_HAIR_COLORS
const pixelartClothingColors = AvatarConfig.PIXELART_CLOTHING_COLORS

// Personas options
const personasSkinColors = AvatarConfig.PERSONAS_SKIN_COLORS
const personasHairColors = AvatarConfig.PERSONAS_HAIR_COLORS
const personasClothingColors = AvatarConfig.PERSONAS_CLOTHING_COLORS
const personasEyesOptions = AvatarConfig.PERSONAS_EYES
const personasMouthOptions = AvatarConfig.PERSONAS_MOUTH
const personasHairOptions = AvatarConfig.PERSONAS_HAIR

// Bottts options
const botttsBaseColors = AvatarConfig.BOTTTS_BASE_COLORS
const botttsEyesOptions = AvatarConfig.BOTTTS_EYES
const botttsMouthOptions = AvatarConfig.BOTTTS_MOUTH
const botttsTextureOptions = AvatarConfig.BOTTTS_TEXTURE

// Initials options
const initialsBackgroundColors = AvatarConfig.INITIALS_BACKGROUND_COLORS
const initialsTextColors = AvatarConfig.INITIALS_TEXT_COLORS

// Identicon options
const identiconRowColors = AvatarConfig.IDENTICON_ROW_COLORS
</script>

<style scoped>
.avatar-customization-options {
  display: flex;
  flex-direction: column;
  gap: 15px;
}

.avatar-customization-options.layout-inline {
  gap: 12px;
}

.param-group {
  margin-bottom: 15px;
}

.param-group:last-child {
  margin-bottom: 0;
}

.param-group label {
  display: block;
  font-weight: 600;
  color: #2c3e50;
  margin-bottom: 10px;
  font-size: 14px;
}

/* Style Options */
.style-options {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.style-option {
  padding: 6px 12px;
  border: 1px solid #e4e7ed;
  border-radius: 16px;
  cursor: pointer;
  font-size: 12px;
  color: #606266;
  transition: all 0.3s;
  background: white;
}

.style-option:hover {
  border-color: #409eff;
  color: #409eff;
}

.style-option.selected {
  background: #409eff;
  color: white;
  border-color: #409eff;
}

/* Color Options */
.color-options {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 8px;
}

.color-option {
  width: 32px;
  height: 32px;
  border-radius: 6px;
  cursor: pointer;
  border: 2px solid #e4e7ed;
  transition: all 0.2s;
  position: relative;
}

.color-option:hover {
  transform: scale(1.1);
  border-color: #409eff;
}

.color-option.selected {
  border-color: #409eff;
  box-shadow: 0 0 0 2px rgba(64, 158, 255, 0.3);
}

.color-option.selected::after {
  content: '✓';
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  color: white;
  font-weight: bold;
  font-size: 14px;
  text-shadow: 1px 1px 2px rgba(0,0,0,0.5);
}

/* El-select full width */
.param-group .el-select {
  width: 100%;
}
</style>
