import { BadRequestException } from '@nestjs/common';
import { Types } from 'mongoose';

/** A well-formed 24-hex ObjectId string (or ObjectId instance). Plain 12-char strings are NOT accepted. */
export function isWellFormedObjectId(id: any): boolean {
  if (id instanceof Types.ObjectId) return true;
  return typeof id === 'string' && /^[0-9a-fA-F]{24}$/.test(id);
}

/** Throws 400 `Invalid <label> id` for a malformed id (instead of a Mongoose CastError -> bare 500). */
export function assertValidObjectId(id: any, label: string): void {
  if (!isWellFormedObjectId(id)) throw new BadRequestException(`Invalid ${label} id`);
}

/** Throws 400 `<label> must be a valid date` for an unparsable date (instead of a Mongoose CastError / Invalid Date -> bare 500). `required` also rejects absent/empty. */
export function assertValidDate(value: any, label: string, required = false): void {
  if (value === undefined || value === null || value === '') {
    if (required) throw new BadRequestException(`${label} is required`);
    return;
  }
  const d = value instanceof Date ? value : new Date(value);
  if (typeof value === 'object' && !(value instanceof Date)) throw new BadRequestException(`${label} must be a valid date`);
  if (Number.isNaN(d.getTime())) throw new BadRequestException(`${label} must be a valid date`);
}
