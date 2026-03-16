/** Standard API response wrapper */
export interface ApiResponse<T> {
  data?: T;
  error?: string;
  message?: string;
}

/** Paginated response */
export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/** API error response */
export interface ApiError {
  error: string;
  message: string;
  details?: Record<string, string[]>;
}
