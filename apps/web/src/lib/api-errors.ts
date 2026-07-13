import type { ErrorResponseDto } from '@logidash/api-client';

/** Axios error shape for API calls (response body is the global filter's DTO). */
export type ApiError = {
  response?: {
    status?: number;
    data?: ErrorResponseDto;
  };
};

/**
 * Route a 400's flat `details: string[]` to form fields. The API's default
 * class-validator messages each begin with the offending property name
 * (e.g. "pickupAddress should not be empty"), so each message goes to its
 * field by that leading token; anything unmatched surfaces form-level.
 */
export function mapDetailMessages(
  details: string[],
  fieldNames: readonly string[],
): {
  fields: Record<string, string>;
  rest: string[];
} {
  const fields: Record<string, string> = {};
  const rest: string[] = [];
  for (const msg of details) {
    const token = msg.split(/\s+/, 1)[0];
    if (token && fieldNames.includes(token)) {
      if (!(token in fields)) fields[token] = msg; // first message wins per field
    } else {
      rest.push(msg);
    }
  }
  return { fields, rest };
}
