export interface PaginationParams {
  page?: number;
  limit?: number;
}

export interface PaginatedResponse<T> {
  items: T[];
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export function parsePaginationParams(
  query: Record<string, unknown>,
  defaultLimit = 20,
  maxLimit = 100
) {
  const hasPage = query.page !== undefined && query.page !== null && query.page !== '';
  const hasLimit = query.limit !== undefined && query.limit !== null && query.limit !== '';
  const hasPaginateFlag = query.paginate === '1' || query.paginate === 'true';

  const isPaginated = hasPage || hasLimit || hasPaginateFlag;

  const page = Math.max(1, hasPage ? parseInt(String(query.page), 10) || 1 : 1);
  const limit = Math.min(
    maxLimit,
    Math.max(1, hasLimit ? parseInt(String(query.limit), 10) || defaultLimit : defaultLimit)
  );
  const offset = (page - 1) * limit;

  return { isPaginated, page, limit, offset };
}

export function formatPaginatedResponse<T>(
  items: T[],
  total: number,
  page: number,
  limit: number
): PaginatedResponse<T> {
  return {
    items,
    data: items,
    total,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
}

