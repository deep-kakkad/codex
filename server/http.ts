import express, { type NextFunction, type Request, type RequestHandler, type Response } from 'express';

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** JSON body parser that always leaves `req.body` as a plain object. */
// `any` params: each route types its own params; a stricter type here would widen them.
export function jsonBody(limit: string): RequestHandler<any> {
  const parse = express.json({ limit });
  return (req, res, next) =>
    parse(req, res, (error?: unknown) => {
      if (error) return next(error);
      if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) req.body = {};
      next();
    });
}

export const badRequest = (message: string) => new HttpError(400, message);
export const notFound = (message = 'Not found') => new HttpError(404, message);
export const conflict = (message: string) => new HttpError(409, message);

/** Turns errors into JSON. Unexpected ones (500s) also go to `report`, e.g. the error log. */
export function errorHandler(report?: (error: unknown, req: Request) => void) {
  return (error: unknown, req: Request, res: Response, next: NextFunction) =>
    handleError(error, req, res, next, report);
}

function handleError(
  error: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
  report?: (error: unknown, req: Request) => void,
) {
  if (error instanceof HttpError) {
    res.status(error.status).json({ error: error.message });
    return;
  }
  const status =
    (error as { status?: number; statusCode?: number })?.status ?? (error as { statusCode?: number })?.statusCode;
  if (typeof status === 'number' && status >= 400 && status < 500) {
    // Body-parser errors (payload too large, malformed JSON) carry a status.
    res.status(status).json({ error: (error as Error).message });
    return;
  }
  console.error(error);
  report?.(error, req);
  res.status(500).json({ error: 'Something went wrong' });
}

// Input helpers ----------------------------------------------------------

export function str(value: unknown, field: string, { max = 200, min = 1 } = {}): string {
  if (typeof value !== 'string') throw badRequest(`${field} is required`);
  const trimmed = value.trim();
  if (trimmed.length < min)
    throw badRequest(min <= 1 ? `${field} is required` : `${field} must be at least ${min} characters`);
  if (trimmed.length > max) throw badRequest(`${field} must be at most ${max} characters`);
  return trimmed;
}

export function optionalText(value: unknown, field: string, max: number): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') throw badRequest(`${field} must be text`);
  if (value.length > max) throw badRequest(`${field} must be at most ${max} characters`);
  return value;
}

export function email(value: unknown, field = 'Email'): string {
  const result = str(value, field, { max: 254 }).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result)) throw badRequest(`${field} is not a valid email address`);
  return result;
}

export function oneOf<T extends string>(value: unknown, field: string, options: readonly T[]): T {
  if (typeof value !== 'string' || !options.includes(value as T)) {
    throw badRequest(`${field} must be one of: ${options.join(', ')}`);
  }
  return value as T;
}
