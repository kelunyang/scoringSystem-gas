/**
 * @fileoverview Shared code package for monorepo
 * Exports schemas, types, and constants used by both frontend and backend
 */

// Export all entity types
export * from './types/entities';

// Export AI types
export * from './types/ai';

// Export admin types (selective to avoid conflicts)
export type {
  BaseMember,
  GlobalGroupMember,
  ProjectGroupMember
} from './types/admin';

// Export admin enums
export { EmailStatus } from './types/admin';

// Export constants
export * from './constants/ui';

// Export all schemas
export * from './schemas/admin';
export * from './schemas/auth';
export * from './schemas/comments';
export * from './schemas/common';
export * from './schemas/eventlogs';
export * from './schemas/groups';
export * from './schemas/invitations';
export * from './schemas/notifications';
export * from './schemas/projects';
export * from './schemas/rankings';
export * from './schemas/scoring';
export * from './schemas/settlement';
export * from './schemas/stages';
export * from './schemas/submissions';
export * from './schemas/system';
export * from './schemas/users';
export * from './schemas/wallets';

// Export utility functions
export * from './utils/password';
export * from './utils/code-generator';
export * from './utils/secure-compare';

// Export theme configuration
export * from './theme';
