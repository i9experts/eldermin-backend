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
