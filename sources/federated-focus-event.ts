import { FederatedEvent } from '@pixi/events'

export class FederatedFocusEvent extends FederatedEvent implements FocusEvent {
  /** This is currently not implemented in the Federated Events API. */
  relatedTarget: EventTarget | null = null
}
