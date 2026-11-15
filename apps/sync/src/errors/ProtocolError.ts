import { DomainError } from './DomainError'

export class ProtocolError extends DomainError {
  readonly kind = 'protocol'
  readonly httpStatus = 400
}
