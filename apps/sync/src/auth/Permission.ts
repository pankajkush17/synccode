import type { PermissionName } from '@synccode/shared'

export enum Permission {
  READ = 'read',
  WRITE = 'write',
}

export function permissionName(permission: Permission): PermissionName {
  return permission
}
