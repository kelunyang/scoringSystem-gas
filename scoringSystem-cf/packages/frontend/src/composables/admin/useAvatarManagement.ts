/**
 * Avatar Management Composable
 * Handles avatar style selection, preview, and updates
 */

import { ref, computed } from 'vue'
import { ElMessage } from 'element-plus'
import {
  generateDicebearUrl,
  generateAvatarSeed,
  parseAvatarOptions
} from '@/utils/avatar'

export interface AvatarStyle {
  id: string
  name: string
  description: string
  category: 'human' | 'fun' | 'abstract'
}

