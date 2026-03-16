/** Bitrix24 API response wrapper */
export interface BitrixResponse<T> {
  result: T;
  total?: number;
  next?: number;
  time?: {
    start: number;
    finish: number;
    duration: number;
  };
}

/** Bitrix24 task from API */
export interface BitrixTask {
  ID: string;
  TITLE: string;
  DESCRIPTION: string;
  DESCRIPTION_IN_BBCODE: string;
  STATUS: string;
  PRIORITY: string;
  MARK: string;
  RESPONSIBLE_ID: string;
  RESPONSIBLE_NAME?: string;
  CREATED_BY: string;
  CREATED_BY_NAME?: string;
  GROUP_ID: string;
  STAGE_ID: string;
  DEADLINE: string | null;
  START_DATE_PLAN: string | null;
  END_DATE_PLAN: string | null;
  CREATED_DATE: string;
  CHANGED_DATE: string;
  CLOSED_DATE: string | null;
  TIME_ESTIMATE: string;
  TIME_SPENT_IN_LOGS: string;
  TAGS: Record<string, string>;
  ACCOMPLICES: string[];
  AUDITORS: string[];
  UF_TASK_WEBDAV_FILES: string[];
}

/** Bitrix24 task stage */
export interface BitrixStage {
  ID: string;
  TITLE: string;
  SORT: string;
  COLOR: string;
  SYSTEM_TYPE: string;
  ENTITY_ID: string;
  ENTITY_TYPE: string;
  STATUS_ID?: string;
}

/** Bitrix24 comment */
export interface BitrixComment {
  ID: string;
  AUTHOR_ID: string;
  AUTHOR_NAME: string;
  POST_MESSAGE: string;
  POST_DATE: string;
}

/** Bitrix24 checklist item */
export interface BitrixChecklistItem {
  ID: string;
  TASK_ID: string;
  TITLE: string;
  SORT_INDEX: string;
  IS_COMPLETE: string;
}

/** Bitrix24 file */
export interface BitrixFile {
  ID: string;
  NAME: string;
  SIZE: string;
  DOWNLOAD_URL: string;
  CONTENT_TYPE: string;
}

/** Bitrix24 user from user.get API */
export interface BitrixUser {
  ID: string;
  NAME: string;
  LAST_NAME: string;
  SECOND_NAME: string;
  EMAIL: string;
  PERSONAL_PHOTO: string;
  WORK_POSITION: string;
  ACTIVE: boolean;
}

/** Bitrix24 OAuth token response */
export interface BitrixTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  domain: string;
  member_id: string;
  client_endpoint: string;
  server_endpoint: string;
  scope: string;
  status: string;
  user_id: number;
}

/** Bitrix24 webhook event payload */
export interface BitrixWebhookEvent {
  event: string;
  data: {
    FIELDS_BEFORE?: Record<string, string>;
    FIELDS_AFTER?: Record<string, string>;
  };
  ts: string;
  auth: {
    access_token: string;
    expires_in: number;
    scope: string;
    domain: string;
    member_id: string;
    application_token: string;
  };
}
