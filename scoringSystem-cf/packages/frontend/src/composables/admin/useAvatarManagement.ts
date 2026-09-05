/**
 * Avatar Management Composable
 * Handles avatar style selection, preview, and updates
 */


export interface AvatarStyle {
  id: string
  name: string
  description: string
  category: 'human' | 'fun' | 'abstract'
}

