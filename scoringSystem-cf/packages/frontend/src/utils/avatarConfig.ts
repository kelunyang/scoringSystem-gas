/**
 * DiceBear Avatar Customization Configuration
 * Shared configuration for UserInfoStep and UserSettings components
 */

export interface AvatarOption {
  value: string
  label: string
}

export interface AvatarOptions {
  backgroundColor?: string
  skinColor?: string
  hairColor?: string
  clothesColor?: string
  clothingColor?: string
  baseColor?: string
  textColor?: string
  rowColor?: string
  eyes?: string
  mouth?: string
  top?: string
  clothing?: string
  hair?: string
  texture?: string
}

// Avatar Styles
export const AVATAR_STYLES: AvatarOption[] = [
  { value: 'avataaars', label: '卡通人物' },
  { value: 'bottts', label: '機器人' },
  { value: 'pixel-art', label: '像素風格' },
  { value: 'initials', label: '文字縮寫' },
  { value: 'identicon', label: '抽象圖案' },
  { value: 'personas', label: '簡約人物' }
]

// ===== AVATAAARS STYLE =====
export const AVATAAARS_SKIN_COLORS: AvatarOption[] = [
  { value: 'ffdbb4', label: '淺膚色' },
  { value: 'edb98a', label: '中等膚色' },
  { value: 'd08b5b', label: '棕色膚色' },
  { value: 'ae5d29', label: '深棕色' },
  { value: '614335', label: '深色膚色' }
]

export const AVATAAARS_HAIR_COLORS: AvatarOption[] = [
  { value: '2c1b18', label: '黑色' },
  { value: '4a312c', label: '深棕色' },
  { value: '724133', label: '棕色' },
  { value: 'a55728', label: '淺棕色' },
  { value: 'b58143', label: '金棕色' },
  { value: 'd6b370', label: '金色' },
  { value: 'c93305', label: '紅棕色' },
  { value: 'e8e1e1', label: '銀灰色' }
]

export const AVATAAARS_BACKGROUND_COLORS: AvatarOption[] = [
  { value: 'b6e3f4', label: '淺藍色' },
  { value: 'c0392b', label: '紅色' },
  { value: '27ae60', label: '綠色' },
  { value: 'f39c12', label: '橙色' },
  { value: '8e44ad', label: '紫色' },
  { value: '34495e', label: '深灰色' }
]

export const AVATAAARS_CLOTHES_COLORS: AvatarOption[] = [
  { value: '3c4858', label: '深藍色' },
  { value: 'e74c3c', label: '紅色' },
  { value: '2ecc71', label: '綠色' },
  { value: 'f1c40f', label: '黃色' },
  { value: '9b59b6', label: '紫色' },
  { value: 'ecf0f1', label: '白色' }
]

export const AVATAAARS_EYES: AvatarOption[] = [
  { value: 'default', label: '預設' },
  { value: 'happy', label: '開心' },
  { value: 'wink', label: '眨眼' },
  { value: 'surprised', label: '驚訝' },
  { value: 'hearts', label: '愛心眼' },
  { value: 'squint', label: '瞇眼' },
  { value: 'cry', label: '哭泣' },
  { value: 'side', label: '側看' }
]

export const AVATAAARS_MOUTH: AvatarOption[] = [
  { value: 'default', label: '預設' },
  { value: 'smile', label: '微笑' },
  { value: 'serious', label: '嚴肅' },
  { value: 'twinkle', label: '閃亮笑容' },
  { value: 'tongue', label: '吐舌' },
  { value: 'grimace', label: '苦笑' },
  { value: 'sad', label: '難過' },
  { value: 'eating', label: '吃東西' }
]

export const AVATAAARS_TOP: AvatarOption[] = [
  { value: 'straight01', label: '長直髮' },
  { value: 'curly', label: '長捲髮' },
  { value: 'shortFlat', label: '短平頭' },
  { value: 'shortCurly', label: '短捲髮' },
  { value: 'dreads01', label: '雷鬼頭' },
  { value: 'hat', label: '帽子' },
  { value: 'hijab', label: '頭巾' },
  { value: 'turban', label: '包頭巾' },
  { value: 'winterHat1', label: '冬季帽1' },
  { value: 'winterHat02', label: '冬季帽2' },
  { value: 'bob', label: '波波頭' },
  { value: 'bun', label: '髮髻' },
  { value: 'froBand', label: '爆炸頭髮帶' },
  { value: 'fro', label: '爆炸頭' },
  { value: 'shortWaved', label: '短波浪' }
]

export const AVATAAARS_CLOTHING: AvatarOption[] = [
  { value: 'hoodie', label: '連帽衫' },
  { value: 'shirtCrewNeck', label: '圓領T恤' },
  { value: 'shirtVNeck', label: 'V領T恤' },
  { value: 'blazerAndShirt', label: '西裝外套' },
  { value: 'blazerAndSweater', label: '西裝毛衣' },
  { value: 'collarAndSweater', label: '領毛衣' },
  { value: 'overall', label: '連身服' },
  { value: 'graphicShirt', label: '印花T恤' },
  { value: 'shirtScoopNeck', label: '大領T恤' }
]

// ===== PIXEL-ART STYLE =====
export const PIXELART_SKIN_COLORS: AvatarOption[] = [
  { value: 'ffdbb4', label: '淺膚色' },
  { value: 'edb98a', label: '中等膚色' },
  { value: 'd08b5b', label: '棕色膚色' },
  { value: 'ae5d29', label: '深棕色' },
  { value: '614335', label: '深色膚色' }
]

export const PIXELART_HAIR_COLORS: AvatarOption[] = [
  { value: '2c1b18', label: '黑色' },
  { value: '4a312c', label: '深棕色' },
  { value: '724133', label: '棕色' },
  { value: 'a55728', label: '淺棕色' },
  { value: 'b58143', label: '金棕色' },
  { value: 'd6b370', label: '金色' },
  { value: 'c93305', label: '紅棕色' },
  { value: 'e8e1e1', label: '銀灰色' }
]

export const PIXELART_CLOTHING_COLORS: AvatarOption[] = [
  { value: '3c4858', label: '深藍色' },
  { value: 'e74c3c', label: '紅色' },
  { value: '2ecc71', label: '綠色' },
  { value: 'f1c40f', label: '黃色' },
  { value: '9b59b6', label: '紫色' },
  { value: 'ecf0f1', label: '白色' }
]

// ===== PERSONAS STYLE =====
export const PERSONAS_SKIN_COLORS: AvatarOption[] = [
  { value: 'eeb4a4', label: '淺膚色' },
  { value: 'e7a391', label: '粉膚色' },
  { value: 'e5a07e', label: '中等膚色' },
  { value: 'd78774', label: '棕色膚色' },
  { value: 'b16a5b', label: '深棕色' },
  { value: '92594b', label: '深色膚色' },
  { value: '623d36', label: '最深色' }
]

export const PERSONAS_HAIR_COLORS: AvatarOption[] = [
  { value: '362c47', label: '黑色' },
  { value: '6c4545', label: '深棕色' },
  { value: 'e15c66', label: '紅色' },
  { value: 'e16381', label: '粉紅色' },
  { value: 'f27d65', label: '橘色' },
  { value: 'f29c65', label: '淺橘色' },
  { value: 'dee1f5', label: '銀灰色' }
]

export const PERSONAS_CLOTHING_COLORS: AvatarOption[] = [
  { value: '456dff', label: '藍色' },
  { value: '54d7c7', label: '青色' },
  { value: '7555ca', label: '紫色' },
  { value: '6dbb58', label: '綠色' },
  { value: 'e24553', label: '紅色' },
  { value: 'f3b63a', label: '黃色' },
  { value: 'f55d81', label: '粉色' }
]

export const PERSONAS_EYES: AvatarOption[] = [
  { value: 'open', label: '睜眼' },
  { value: 'happy', label: '開心' },
  { value: 'wink', label: '眨眼' },
  { value: 'sleep', label: '閉眼' },
  { value: 'glasses', label: '眼鏡' },
  { value: 'sunglasses', label: '墨鏡' }
]

export const PERSONAS_MOUTH: AvatarOption[] = [
  { value: 'smile', label: '微笑' },
  { value: 'bigSmile', label: '大笑' },
  { value: 'smirk', label: '壞笑' },
  { value: 'frown', label: '皺眉' },
  { value: 'surprise', label: '驚訝' },
  { value: 'lips', label: '嘟嘴' },
  { value: 'pacifier', label: '奶嘴' }
]

export const PERSONAS_HAIR: AvatarOption[] = [
  { value: 'long', label: '長髮' },
  { value: 'curly', label: '捲髮' },
  { value: 'curlyBun', label: '捲髮髮髻' },
  { value: 'bobCut', label: '波波頭' },
  { value: 'bobBangs', label: '齊瀏海波波頭' },
  { value: 'pigtails', label: '雙馬尾' },
  { value: 'straightBun', label: '髮髻' },
  { value: 'bunUndercut', label: '削邊髮髻' },
  { value: 'shortCombover', label: '側分短髮' },
  { value: 'curlyHighTop', label: '高捲髮' },
  { value: 'fade', label: '漸層頭' },
  { value: 'buzzcut', label: '平頭' },
  { value: 'mohawk', label: '龐克頭' },
  { value: 'cap', label: '帽子' },
  { value: 'beanie', label: '針織帽' }
]

// ===== BOTTTS STYLE =====
export const BOTTTS_BASE_COLORS: AvatarOption[] = [
  { value: '1e88e5', label: '藍色' },
  { value: '43a047', label: '綠色' },
  { value: 'e53935', label: '紅色' },
  { value: 'fb8c00', label: '橙色' },
  { value: 'ffb300', label: '黃色' },
  { value: '8e24aa', label: '紫色' },
  { value: '00acc1', label: '青色' },
  { value: 'f4511e', label: '深橙色' },
  { value: '5e35b1', label: '深紫色' },
  { value: '757575', label: '灰色' },
  { value: '546e7a', label: '藍灰色' },
  { value: '6d4c41', label: '棕色' }
]

export const BOTTTS_EYES: AvatarOption[] = [
  { value: 'happy', label: '開心' },
  { value: 'hearts', label: '愛心' },
  { value: 'round', label: '圓眼' },
  { value: 'roundFrame01', label: '圓框1' },
  { value: 'roundFrame02', label: '圓框2' },
  { value: 'eva', label: '機械眼' },
  { value: 'frame1', label: '框架1' },
  { value: 'frame2', label: '框架2' },
  { value: 'glow', label: '發光眼' },
  { value: 'sensor', label: '感應器' },
  { value: 'shade01', label: '遮罩' }
]

export const BOTTTS_MOUTH: AvatarOption[] = [
  { value: 'smile01', label: '微笑1' },
  { value: 'smile02', label: '微笑2' },
  { value: 'grill01', label: '格柵1' },
  { value: 'grill02', label: '格柵2' },
  { value: 'grill03', label: '格柵3' },
  { value: 'diagram', label: '圖表嘴' },
  { value: 'bite', label: '咬嘴' },
  { value: 'square01', label: '方嘴1' },
  { value: 'square02', label: '方嘴2' }
]

export const BOTTTS_TEXTURE: AvatarOption[] = [
  { value: 'camo01', label: '迷彩1' },
  { value: 'camo02', label: '迷彩2' },
  { value: 'circuits', label: '電路' },
  { value: 'dirty01', label: '髒污1' },
  { value: 'dirty02', label: '髒污2' },
  { value: 'dots', label: '點狀' },
  { value: 'grunge01', label: '粗糙1' },
  { value: 'grunge02', label: '粗糙2' }
]

// ===== INITIALS STYLE =====
export const INITIALS_BACKGROUND_COLORS: AvatarOption[] = [
  { value: 'b6e3f4', label: '淺藍色' },
  { value: 'c0392b', label: '紅色' },
  { value: '27ae60', label: '綠色' },
  { value: 'f39c12', label: '橙色' },
  { value: '8e44ad', label: '紫色' },
  { value: '34495e', label: '深灰色' },
  { value: '3498db', label: '藍色' },
  { value: 'e74c3c', label: '亮紅色' },
  { value: '2ecc71', label: '亮綠色' }
]

export const INITIALS_TEXT_COLORS: AvatarOption[] = [
  { value: 'ffffff', label: '白色' },
  { value: '000000', label: '黑色' },
  { value: '2c3e50', label: '深藍灰' },
  { value: 'ecf0f1', label: '淺灰' }
]

// ===== IDENTICON STYLE =====
export const IDENTICON_ROW_COLORS: AvatarOption[] = [
  { value: 'e53935', label: '紅色' },
  { value: 'ffb300', label: '黃色' },
  { value: '1e88e5', label: '藍色' },
  { value: '546e7a', label: '藍灰色' },
  { value: '6d4c41', label: '棕色' },
  { value: '00acc1', label: '青色' },
  { value: 'f4511e', label: '橙色' },
  { value: '5e35b1', label: '紫色' },
  { value: '43a047', label: '綠色' },
  { value: '757575', label: '灰色' },
  { value: '3949ab', label: '深藍色' },
  { value: '039be5', label: '亮藍色' }
]

// ===== DEFAULT AVATAR OPTIONS =====
export const DEFAULT_AVATAR_OPTIONS: Record<string, AvatarOptions> = {
  avataaars: {
    backgroundColor: 'b6e3f4',
    skinColor: 'ae5d29',
    hairColor: '2c1b18',
    clothesColor: '3c4858',
    eyes: 'default',
    mouth: 'smile',
    top: 'straight01',
    clothing: 'hoodie'
  },
  'pixel-art': {
    skinColor: 'ffdbb4',
    hairColor: '2c1b18',
    clothingColor: '3c4858'
  },
  personas: {
    skinColor: 'eeb4a4',
    hairColor: '362c47',
    clothingColor: '456dff',
    eyes: 'open',
    mouth: 'smile',
    hair: 'long'
  },
  bottts: {
    baseColor: '1e88e5',
    eyes: 'happy',
    mouth: 'smile01',
    texture: 'camo01'
  },
  initials: {
    backgroundColor: 'b6e3f4',
    textColor: 'ffffff'
  },
  identicon: {
    rowColor: 'e53935'
  }
}

/**
 * Get random option from array
 */
export function getRandomOption(optionsArray: AvatarOption[]): string {
  return optionsArray[Math.floor(Math.random() * optionsArray.length)].value
}

/**
 * Generate random avatar options for a given style
 */
export function getRandomAvatarOptions(style: string): AvatarOptions {
  switch (style) {
    case 'avataaars':
      return {
        backgroundColor: getRandomOption(AVATAAARS_BACKGROUND_COLORS),
        skinColor: getRandomOption(AVATAAARS_SKIN_COLORS),
        hairColor: getRandomOption(AVATAAARS_HAIR_COLORS),
        clothesColor: getRandomOption(AVATAAARS_CLOTHES_COLORS),
        eyes: getRandomOption(AVATAAARS_EYES),
        mouth: getRandomOption(AVATAAARS_MOUTH),
        top: getRandomOption(AVATAAARS_TOP),
        clothing: getRandomOption(AVATAAARS_CLOTHING)
      }

    case 'pixel-art':
      return {
        skinColor: getRandomOption(PIXELART_SKIN_COLORS),
        hairColor: getRandomOption(PIXELART_HAIR_COLORS),
        clothingColor: getRandomOption(PIXELART_CLOTHING_COLORS)
      }

    case 'personas':
      return {
        skinColor: getRandomOption(PERSONAS_SKIN_COLORS),
        hairColor: getRandomOption(PERSONAS_HAIR_COLORS),
        clothingColor: getRandomOption(PERSONAS_CLOTHING_COLORS),
        eyes: getRandomOption(PERSONAS_EYES),
        mouth: getRandomOption(PERSONAS_MOUTH),
        hair: getRandomOption(PERSONAS_HAIR)
      }

    case 'bottts':
      return {
        baseColor: getRandomOption(BOTTTS_BASE_COLORS),
        eyes: getRandomOption(BOTTTS_EYES),
        mouth: getRandomOption(BOTTTS_MOUTH),
        texture: getRandomOption(BOTTTS_TEXTURE)
      }

    case 'initials':
      return {
        backgroundColor: getRandomOption(INITIALS_BACKGROUND_COLORS),
        textColor: getRandomOption(INITIALS_TEXT_COLORS)
      }

    case 'identicon':
      return {
        rowColor: getRandomOption(IDENTICON_ROW_COLORS)
      }

    default:
      return {}
  }
}
