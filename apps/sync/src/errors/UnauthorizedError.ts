import { DomainError } from './DomainError'

export class UnauthorizedError extends DomainError {
  readonly kind = 'unauthorized'
  readonly httpStatus = 401
}
