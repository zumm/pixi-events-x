import { FederatedEvent } from '@pixi/events'

export class FederatedKeyboardEvent extends FederatedEvent implements KeyboardEvent {
  altKey = false
  /** @deprecated */
  charCode = 0
  code = ''
  ctrlKey = false
  isComposing = false
  key = ''
  /** @deprecated */
  keyCode = 0
  location = 0
  metaKey = false
  repeat = false
  shiftKey = false

  /**
   * Whether the modifier key was pressed when this event natively occurred.
   * @param key - The modifier key.
   */
  getModifierState(key: string): boolean {
    return 'getModifierState' in this.nativeEvent && (this.nativeEvent as KeyboardEvent).getModifierState(key)
  }

  /** @deprecated */
  initKeyboardEvent(
    _typeArg: string,
    _bubblesArg?: boolean,
    _cancelableArg?: boolean,
    _viewArg?: Window | null,
    _keyArg?: string,
    _locationArg?: number,
    _ctrlKey?: boolean,
    _altKey?: boolean,
    _shiftKey?: boolean,
    _metaKey?: boolean,
  ): void {
    throw new Error('initKeyboardEvent() is a legacy DOM API. It is not implemented in the Federated Events API.')
  }

  override preventDefault(): void {
    if (this.originalEvent) {
      this.originalEvent.preventDefault()
      this.defaultPrevented = true
    }
    else {
      super.preventDefault()
    }
  }

  readonly DOM_KEY_LOCATION_STANDARD = 0x00
  readonly DOM_KEY_LOCATION_LEFT = 0x01
  readonly DOM_KEY_LOCATION_RIGHT = 0x02
  readonly DOM_KEY_LOCATION_NUMPAD = 0x03
}
