/**
 * Tag color generation utility
 * Uses randomcolor.js to generate consistent colors for tags
 */

import randomColor from 'randomcolor'

/**
 * Generate a color for a tag based on its ID or name
 * Uses seed to ensure the same tag always gets the same color
 *
 * @param seed - Tag ID or name to use as seed
 * @returns Hex color code
 */
export function getTagColor(seed: string | null | undefined): string {
  if (!seed) return '#3498db' // Default blue

  // Generate a numeric seed from string
  let numericSeed = 0
  for (let i = 0; i < seed.length; i++) {
    numericSeed = ((numericSeed << 5) - numericSeed) + seed.charCodeAt(i)
    numericSeed = numericSeed & numericSeed // Convert to 32bit integer
  }

  return randomColor({
    seed: Math.abs(numericSeed),
    luminosity: 'bright',
    format: 'hex'
  })
}

/**
 * Generate multiple colors at once
 *
 * @param seeds - Array of tag IDs or names
 * @returns Map of seed to color
 */
export function getTagColors(seeds: string[]): Record<string, string> {
  const colorMap: Record<string, string> = {}
  seeds.forEach(seed => {
    colorMap[seed] = getTagColor(seed)
  })
  return colorMap
}
