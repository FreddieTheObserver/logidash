// The DTO fields the New delivery form renders inputs for. The API's default
// class-validator 400 response is a flat string[] whose messages each begin
// with the offending property name (e.g. "pickupAddress should not be empty"),
// so we route each message to its field by that leading token; anything
// unmatched surfaces form-level.
const FIELD_NAMES = [
  'reference',
  'pickupAddress',
  'dropoffAddress',
  'zoneId',
  'packageType',
  'packageWeight',
  'packageSize',
  'priority',
  'deadlineAt',
] as const;

export function mapDetailMessages(details: string[]): {
  fields: Record<string, string>;
  rest: string[];
} {
  const fields: Record<string, string> = {};
  const rest: string[] = [];
  for (const msg of details) {
    const token = msg.split(/\s+/, 1)[0];
    if (token && (FIELD_NAMES as readonly string[]).includes(token)) {
      if (!(token in fields)) fields[token] = msg; // first message wins per field
    } else {
      rest.push(msg);
    }
  }
  return { fields, rest };
}
