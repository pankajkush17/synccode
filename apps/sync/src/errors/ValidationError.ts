import { DomainError } from './DomainError'

export class ValidationError extends DomainError {
  readonly kind = 'validation'
  readonly httpStatus = 400
}
