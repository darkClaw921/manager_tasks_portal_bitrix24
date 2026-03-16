export interface User {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  isAdmin: boolean;
  language: string;
  timezone: string;
  digestTime: string;
  notifyTaskAdd: boolean;
  notifyTaskUpdate: boolean;
  notifyTaskDelete: boolean;
  notifyCommentAdd: boolean;
  notifyMention: boolean;
  notifyOverdue: boolean;
  notifyDigest: boolean;
  pushSubscription: string | null;
  createdAt: string;
  updatedAt: string;
}

export type UserWithoutPassword = Omit<User, 'passwordHash'>;

export interface CreateUserInput {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  isAdmin?: boolean;
}

export interface UpdateUserInput {
  firstName?: string;
  lastName?: string;
  language?: string;
  timezone?: string;
  digestTime?: string;
  notifyTaskAdd?: boolean;
  notifyTaskUpdate?: boolean;
  notifyTaskDelete?: boolean;
  notifyCommentAdd?: boolean;
  notifyMention?: boolean;
  notifyOverdue?: boolean;
  notifyDigest?: boolean;
}

export interface LoginInput {
  email: string;
  password: string;
}
