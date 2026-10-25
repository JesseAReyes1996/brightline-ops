export type ServiceErrorCode =
  | "unauthenticated"
  | "forbidden"
  | "not_found"
  | "invalid_input"
  | "invalid_transition"
  | "conflict";

/**
 * An expected failure with a message that is safe to show the user. The HTTP
 * layer maps `code` to a status; anything that isn't a ServiceError is a 500.
 */
export class ServiceError extends Error {
  readonly code: ServiceErrorCode;

  constructor(code: ServiceErrorCode, message: string) {
    super(message);
    this.name = "ServiceError";
    this.code = code;
  }
}
