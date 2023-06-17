import type { FederatedKeyboardEvent } from './federated-keyboard-event'
import type { FederatedFocusEvent } from './federated-focus-event'

export interface KeyboardFederatedEventMap {
  keydown: FederatedKeyboardEvent
  keyup: FederatedKeyboardEvent
}

export interface FocusFederatedEventMap {
  focus: FederatedFocusEvent
  blur: FederatedFocusEvent
  focusin: FederatedFocusEvent
  focusout: FederatedFocusEvent
}

export type FocusEvents = {
  [K in keyof FocusFederatedEventMap]: [FocusFederatedEventMap[K]]
}

export type KeyboardEvents = {
  [K in keyof KeyboardFederatedEventMap]: [KeyboardFederatedEventMap[K]]
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace GlobalMixins {
    interface DisplayObjectEvents extends FocusEvents, KeyboardEvents {}
  }
}
