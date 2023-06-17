import { DisplayObject } from '@pixi/display'
import type { FederatedEventHandler } from '@pixi/events'
import type { FocusFederatedEventMap, KeyboardFederatedEventMap } from './federated-event-map'

type FocusFederatedEventTarget = {
  [K in keyof FocusFederatedEventMap as `on${K}`]: FederatedEventHandler<FocusFederatedEventMap[K]> | null
}

type KeyboardFederatedEventTarget = {
  [K in keyof KeyboardFederatedEventMap as `on${K}`]: FederatedEventHandler<KeyboardFederatedEventMap[K]> | null
}

declare module '@pixi/events' {
  interface FederatedEventTarget extends FocusFederatedEventTarget, KeyboardFederatedEventTarget {
    tabIndex?: number
  }

  interface IFederatedDisplayObject {
    addEventListener<K extends keyof FocusFederatedEventMap>(
      type: K,
      listener: (event: FocusFederatedEventMap[K]) => any,
      options?: boolean | AddEventListenerOptions
    ): void

    addEventListener<K extends keyof KeyboardFederatedEventMap>(
      type: K,
      listener: (event: KeyboardFederatedEventMap[K]) => any,
      options?: boolean | AddEventListenerOptions
    ): void

    removeEventListener<K extends keyof FocusFederatedEventMap>(
      type: K,
      listener: (event: FocusFederatedEventMap[K]) => any,
      options?: boolean | EventListenerOptions
    ): void

    removeEventListener<K extends keyof KeyboardFederatedEventMap>(
      type: K,
      listener: (event: KeyboardFederatedEventMap[K]) => any,
      options?: boolean | EventListenerOptions
    ): void
  }
}

DisplayObject.mixin({
  tabIndex: undefined,

  onfocus: null,
  onblur: null,
  onfocusin: null,
  onfocusout: null,
  onkeydown: null,
  onkeyup: null,
} as FocusFederatedEventTarget & KeyboardFederatedEventTarget)
