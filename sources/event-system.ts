import type { ExtensionMetadata, IRenderer } from '@pixi/core'
import { ExtensionType, extensions } from '@pixi/core'
import { EventSystem as OriginalEventSystem } from '@pixi/events'
import type { DisplayObject } from '@pixi/display'
import { EventBoundary } from './event-boundary'
import { FederatedKeyboardEvent } from './federated-keyboard-event'

// @ts-expect-error https://github.com/pixijs/pixijs/issues/9457
export class EventSystem extends OriginalEventSystem {
  static override extension: ExtensionMetadata = {
    name: 'eventsX',
    type: [
      ExtensionType.RendererSystem,
      ExtensionType.CanvasRendererSystem,
    ],
    priority: 1,
  }

  public override readonly rootBoundary: EventBoundary

  private rootKeyboardEvent: FederatedKeyboardEvent

  constructor(renderer: IRenderer) {
    super(renderer)

    this.rootBoundary = new EventBoundary()

    // why does original EventSystem use null instead of root EventBoundary?
    this.rootKeyboardEvent = new FederatedKeyboardEvent(this.rootBoundary)

    this.onKeyDownOrUp = this.onKeyDownOrUp.bind(this)
    this.onBlur = this.onBlur.bind(this)
  }

  protected override addEvents() {
    // @ts-expect-error
    if (this.eventsAdded || !this.domElement)
      return

    this.domElement.addEventListener('keydown', this.onKeyDownOrUp, true)
    this.domElement.addEventListener('keyup', this.onKeyDownOrUp, true)
    this.domElement.addEventListener('blur', this.onBlur, true)

    // @ts-expect-error
    ;(super.addEvents as EventSystem['addEvents'])()
  }

  protected override removeEvents() {
    // @ts-expect-error
    if (!this.eventsAdded || !this.domElement)
      return

    this.domElement.removeEventListener('keydown', this.onKeyDownOrUp, true)
    this.domElement.removeEventListener('keyup', this.onKeyDownOrUp, true)
    this.domElement.removeEventListener('blur', this.onBlur, true)

    // @ts-expect-error
    ;(super.removeEvents as EventSystem['removeEvents'])()
  }

  protected override onPointerDown(nativeEvent: MouseEvent | PointerEvent | TouchEvent) {
    this.domElement?.focus()

    // @ts-expect-error
    ;(super.onPointerDown as EventSystem['onPointerDown'])(nativeEvent)
  }

  protected onKeyDownOrUp(nativeEvent: KeyboardEvent): void {
    this.rootBoundary.rootTarget = this.renderer.lastObjectRendered as DisplayObject

    const federatedEvent = this.bootstrapKeyboardEvent(this.rootKeyboardEvent, nativeEvent)

    this.rootBoundary.mapEvent(federatedEvent)
  }

  protected onBlur() {
    this.rootBoundary.blur()
  }

  protected bootstrapKeyboardEvent(event: FederatedKeyboardEvent, nativeEvent: KeyboardEvent): FederatedKeyboardEvent {
    // @ts-expect-error https://github.com/pixijs/pixijs/issues/9458
    event.originalEvent = null
    event.nativeEvent = nativeEvent

    event.defaultPrevented = nativeEvent.defaultPrevented

    this.transferKeyboardData(event, nativeEvent)

    return event
  }

  protected transferKeyboardData(event: FederatedKeyboardEvent, nativeEvent: KeyboardEvent): void {
    event.isTrusted = nativeEvent.isTrusted
    // @ts-expect-error https://github.com/pixijs/pixijs/issues/9458
    event.srcElement = nativeEvent.srcElement
    event.timeStamp = performance.now()
    event.type = nativeEvent.type

    event.charCode = nativeEvent.charCode
    event.code = nativeEvent.code
    event.keyCode = nativeEvent.keyCode
    event.key = nativeEvent.key

    event.isComposing = nativeEvent.isComposing
    event.location = nativeEvent.location
    event.repeat = nativeEvent.repeat

    event.altKey = nativeEvent.altKey
    event.ctrlKey = nativeEvent.ctrlKey
    event.metaKey = nativeEvent.metaKey
    event.shiftKey = nativeEvent.shiftKey
  }
}

class FakeEventSystem {
  static extension: ExtensionMetadata = {
    name: 'events',
    type: [
      ExtensionType.RendererSystem,
      ExtensionType.CanvasRendererSystem,
    ],
    priority: 0,
  }

  constructor(renderer: IRenderer) {
    return renderer.eventsX
  }
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace GlobalMixins {
    interface IRenderer {
      readonly eventsX: EventSystem
    }

    interface Renderer {
      readonly eventsX: EventSystem
    }

    interface CanvasRenderer {
      readonly eventsX: EventSystem
    }
  }
}

extensions.remove(OriginalEventSystem)
extensions.add(EventSystem)
extensions.add(FakeEventSystem)
