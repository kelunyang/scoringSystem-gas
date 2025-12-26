/**
 * @fileoverview Avatar generation composable
 * Provides random avatar generation for user registration
 */

import type { AvatarStyle, AvatarOptions } from '../../types/auth';

export interface UseAvatarGeneratorReturn {
  generateRandomOptions: (style: AvatarStyle) => Record<string, any>;
  getAvatarUrl: (seed: string, style: AvatarStyle, options: Record<string, any>) => string;
  getRandomSeed: () => string;
}

/**
 * Composable for avatar generation using DiceBear API
 *
 * @returns Avatar generation utilities
 *
 * @example
 * // In UserInfoStep.vue
 * const { generateRandomOptions, getAvatarUrl, getRandomSeed } = useAvatarGenerator();
 *
 * const avatarSeed = ref(getRandomSeed());
 * const avatarStyle = ref<AvatarStyle>('avataaars');
 * const avatarOptions = ref(generateRandomOptions(avatarStyle.value));
 *
 * const avatarUrl = computed(() =>
 *   getAvatarUrl(avatarSeed.value, avatarStyle.value, avatarOptions.value)
 * );
 */
export function useAvatarGenerator(): UseAvatarGeneratorReturn {
  /**
   * Generate a random seed for avatar
   */
  function getRandomSeed(): string {
    return Math.random().toString(36).substring(2, 15);
  }

  /**
   * Generate random options for a given avatar style
   * Note: This is a simplified version - extend based on DiceBear API options
   */
  function generateRandomOptions(style: AvatarStyle): Record<string, any> {
    const options: Record<string, any> = {};

    switch (style) {
      case 'avataaars':
        // Avataaars has many customization options
        options.accessories = ['none', 'round', 'kurt', 'prescription01', 'prescription02'][Math.floor(Math.random() * 5)];
        options.accessoriesColor = ['black', 'blue', 'gray', 'red', 'white'][Math.floor(Math.random() * 5)];
        options.clothing = ['blazerShirt', 'blazerSweater', 'collarSweater', 'graphicShirt', 'hoodie'][Math.floor(Math.random() * 5)];
        options.clothesColor = ['black', 'blue', 'gray', 'heather', 'pastel'][Math.floor(Math.random() * 5)];
        options.eyebrows = ['default', 'defaultNatural', 'flatNatural', 'raisedExcited', 'upDown'][Math.floor(Math.random() * 5)];
        options.eyes = ['default', 'happy', 'side', 'squint', 'surprised'][Math.floor(Math.random() * 5)];
        options.facialHair = ['blank', 'beardMedium', 'beardLight', 'moustacheFancy', 'moustacheMagnum'][Math.floor(Math.random() * 5)];
        options.hairColor = ['auburn', 'black', 'blonde', 'brown', 'pastel'][Math.floor(Math.random() * 5)];
        options.mouth = ['default', 'smile', 'serious', 'tongue', 'twinkle'][Math.floor(Math.random() * 5)];
        options.skinColor = ['tanned', 'yellow', 'pale', 'light', 'brown'][Math.floor(Math.random() * 5)];
        options.top = ['longHair', 'shortHair', 'eyepatch', 'hat', 'hijab'][Math.floor(Math.random() * 5)];
        break;

      case 'bottts':
        // Bottts is robot-themed
        options.colors = ['blue', 'green', 'orange', 'pink', 'purple'][Math.floor(Math.random() * 5)];
        options.eyes = ['eva', 'frame1', 'frame2', 'glow', 'happy'][Math.floor(Math.random() * 5)];
        options.mouth = ['bite', 'diagram', 'grill01', 'smile01', 'square01'][Math.floor(Math.random() * 5)];
        break;

      case 'pixel-art':
        // Pixel art style
        options.mood = ['happy', 'sad', 'surprised'][Math.floor(Math.random() * 3)];
        break;

      default:
        // Other styles use minimal options
        break;
    }

    return options;
  }

  /**
   * Get DiceBear avatar URL
   */
  function getAvatarUrl(seed: string, style: AvatarStyle, options: Record<string, any>): string {
    const baseUrl = `https://api.dicebear.com/7.x/${style}/svg`;
    const params = new URLSearchParams({
      seed,
      ...options
    });

    return `${baseUrl}?${params.toString()}`;
  }

  return {
    generateRandomOptions,
    getAvatarUrl,
    getRandomSeed
  };
}
