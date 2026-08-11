/**
 * HTTP-aware application error consumed by the Fastify error handler.
 */
export class HttpError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode: number, name = "HttpError") {
    super(message);
    this.name = name;
    this.statusCode = statusCode;
  }
}
