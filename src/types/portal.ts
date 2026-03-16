export interface Portal {
  id: number;
  userId: number;
  domain: string;
  name: string;
  color: string;
  memberId: string;
  clientEndpoint: string;
  accessToken: string;
  refreshToken: string;
  tokenExpiresAt: string | null;
  appToken: string | null;
  isActive: boolean;
  lastSyncAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Portal data safe for client (no tokens) */
export interface PortalPublic {
  id: number;
  userId: number;
  domain: string;
  name: string;
  color: string;
  memberId: string;
  isActive: boolean;
  lastSyncAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePortalInput {
  domain: string;
  name: string;
  color?: string;
}

export interface UpdatePortalInput {
  name?: string;
  color?: string;
  isActive?: boolean;
}

// ==================== Portal Access ====================

export type PortalAccessRole = 'admin' | 'viewer';

export interface PortalAccessPermissions {
  canSeeResponsible: boolean;
  canSeeAccomplice: boolean;
  canSeeAuditor: boolean;
  canSeeCreator: boolean;
  canSeeAll: boolean;
}

export interface UserPortalAccess {
  id: number;
  userId: number;
  portalId: number;
  role: PortalAccessRole;
  canSeeResponsible: boolean;
  canSeeAccomplice: boolean;
  canSeeAuditor: boolean;
  canSeeCreator: boolean;
  canSeeAll: boolean;
  createdAt: string;
  updatedAt: string;
}

// ==================== User Bitrix Mapping ====================

export interface UserBitrixMapping {
  id: number;
  userId: number;
  portalId: number;
  bitrixUserId: string;
  bitrixName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PortalMappingCreate {
  userId: number;
  bitrixUserId: string;
  bitrixName?: string;
}

// ==================== Portal Custom Stages ====================

export interface PortalCustomStage {
  id: number;
  portalId: number;
  title: string;
  color: string | null;
  sort: number;
  createdAt: string;
  updatedAt: string;
}

// ==================== Portal Stage Mapping ====================

export interface PortalStageMapping {
  id: number;
  portalId: number;
  customStageId: number;
  bitrixStageId: number;
}
