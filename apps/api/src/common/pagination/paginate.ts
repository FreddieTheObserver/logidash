import { PaginationMetaDto } from '../dto/pagination-meta.dto';

export interface Paginated<T> {
  data: T[];
  meta: PaginationMetaDto;
}

export function paginate<T>(
  data: T[],
  total: number,
  page: number,
  limit: number,
): Paginated<T> {
  return {
    data,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

export function toSkipTake(
  page: number,
  limit: number,
): {
  skip: number;
  take: number;
} {
  return { skip: (page - 1) * limit, take: limit };
}
