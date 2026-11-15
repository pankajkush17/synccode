import { DomainError } from './DomainError'

export class NotFoundError extends DomainError {
  readonly kind = 'not_found'
  readonly httpStatus = 404
}
