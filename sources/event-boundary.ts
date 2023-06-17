import type { FederatedEvent, FederatedEventTarget } from '@pixi/events'
import type { DisplayObject } from '@pixi/display'
import { FederatedPointerEvent, EventBoundary as OriginalEventBoundary } from '@pixi/events'
import { FederatedFocusEvent } from './federated-focus-event'
import { FederatedKeyboardEvent } from './federated-keyboard-event'
import type { FocusFederatedEventMap, KeyboardFederatedEventMap } from './federated-event-map'

export interface FocusingData {
  focusTargets: FederatedEventTarget[] | null
}

interface NestedBoundaryHost extends FederatedEventTarget {
  _nestedBoundaryContext?: {
    boundary: EventBoundary
    onfocusin: (event: FocusFederatedEventMap['focusin']) => void
    onfocusout: (event: FocusFederatedEventMap['focusout']) => void
  }
}

function isNestedBoundaryHost(target: FederatedEventTarget | null): target is NestedBoundaryHost {
  return (target as NestedBoundaryHost)?._nestedBoundaryContext != null
}

function isTabbable(target: FederatedEventTarget | null) {
  return target && typeof target.tabIndex === 'number' && target.tabIndex >= 0 && target.isInteractive()
}

export class EventBoundary extends OriginalEventBoundary {
  static PROPAGATION_LIMIT = 2048

  protected _activeElementDebouncingDeep = 0
  protected _debouncedActiveElement?: FederatedEventTarget | null

  protected _autoBlurDisconnectedTarget = true

  constructor(rootTarget?: DisplayObject) {
    super(rootTarget)

    this.mapKeyDownOrUp = this.mapKeyDownOrUp.bind(this)

    this.addEventMapping('keydown', this.mapKeyDownOrUp)
    this.addEventMapping('keyup', this.mapKeyDownOrUp)
  }

  protected focusingData() {
    if (!this.mappingState.focusingData) {
      this.mappingState.focusingData = {
        focusTargets: null,
      } as FocusingData
    }

    return this.mappingState.focusingData as FocusingData
  }

  protected override mapPointerDown(from: FederatedEvent) {
    if (!(from instanceof FederatedPointerEvent)) {
      console.warn('EventBoundary cannot map a non-pointer event as a pointer event')
      return
    }

    this.beginActiveElementDebouncing()

    try {
      super.mapPointerDown(from)

      if (this._debouncedActiveElement == null && !from.defaultPrevented) {
        const { x, y } = from.global
        this.focus(this.hitTest(x, y), false)
      }
    }
    finally {
      this.endActiveElementDebouncing()
    }
  }

  protected mapKeyDownOrUp(from: FederatedEvent) {
    if (!(from instanceof FederatedKeyboardEvent)) {
      console.warn('EventBoundary cannot map a non-keyboard event as a keyboard event')
      return
    }

    const isTabNavigation = from.type === 'keydown' && from.code === 'Tab'
    if (!isTabNavigation) {
      this.dispatchKeyboardEvent(from)
      return
    }

    const activeElement = this.activeElement
    const nestedActiveElement = isNestedBoundaryHost(activeElement)
      ? activeElement._nestedBoundaryContext?.boundary.activeElement
      : undefined

    this.beginActiveElementDebouncing()

    try {
      // prevent nested boundary from endless tab circling during backward navigation
      const isFakeDefaultPrevented = from.shiftKey && nestedActiveElement === null && isTabbable(activeElement)
      if (isFakeDefaultPrevented)
        from.defaultPrevented = true

      this.dispatchKeyboardEvent(from)

      if (isFakeDefaultPrevented && this._debouncedActiveElement === undefined)
        from.defaultPrevented = false

      if (from.defaultPrevented)
        return

      if (from.shiftKey && nestedActiveElement && isTabbable(activeElement)) {
        this.activeElement = activeElement
        from.preventDefault()
        return
      }

      const shift = from.shiftKey ? -1 : 1
      const tabbable = this.getTabbableTargets(true)

      let tabTarget = activeElement
      /* eslint no-cond-assign: ["error", "except-parens"] */
      while (
        (tabTarget = this.getTabbableTargetByShift(shift, tabTarget, tabbable))
        && isNestedBoundaryHost(tabTarget)
      ) {
        if (!from.shiftKey && isTabbable(tabTarget))
          break

        tabTarget._nestedBoundaryContext?.boundary.mapEvent(from)
        if (from.defaultPrevented)
          return

        if (from.shiftKey && isTabbable(tabTarget))
          break
      }

      this.activeElement = tabTarget

      if (tabTarget)
        from.preventDefault()
    }
    finally {
      this.endActiveElementDebouncing()
    }
  }

  protected override allocateEvent<T extends FederatedEvent<UIEvent>>(
    constructor: new (boundary: OriginalEventBoundary) => T,
  ) {
    const event = super.allocateEvent(constructor)

    event.defaultPrevented = false

    return event
  }

  protected createFocusEvent(
    type: keyof FocusFederatedEventMap,
    target: FederatedEventTarget,
    // doesn't work anyway
    bubbles = true,
  ) {
    const event = this.allocateEvent(FederatedFocusEvent)

    event.bubbles = bubbles
    event.type = type
    event.target = target
    event.isTrusted = true
    event.timeStamp = performance.now()

    return event
  }

  protected createKeyboardEvent(
    from: FederatedKeyboardEvent,
    type?: keyof KeyboardFederatedEventMap,
    target?: FederatedEventTarget,
  ) {
    const event = this.allocateEvent(FederatedKeyboardEvent)

    this.copyKeyboardData(from, event)
    this.copyData(from, event)

    event.nativeEvent = from.nativeEvent
    event.originalEvent = from

    event.type = type ?? event.type
    event.target = target ?? event.target

    return event
  }

  protected copyKeyboardData(from: FederatedEvent, to: FederatedEvent) {
    if (!(from instanceof FederatedKeyboardEvent && to instanceof FederatedKeyboardEvent))
      return

    to.charCode = from.charCode
    to.code = from.code
    to.keyCode = from.keyCode
    to.key = from.key

    to.isComposing = from.isComposing
    to.location = from.location
    to.repeat = from.repeat

    to.altKey = from.altKey
    to.ctrlKey = from.ctrlKey
    to.metaKey = from.metaKey
    to.shiftKey = from.shiftKey
  }

  protected override copyData(from: FederatedEvent, to: FederatedEvent) {
    super.copyData(from, to)

    to.defaultPrevented = from.defaultPrevented
  }

  protected getPathIntersection(
    one: FederatedEventTarget[],
    two: FederatedEventTarget[],
  ) {
    for (let i = two.length - 1; i >= 0; i--) {
      const current = two[i]
      if (one.includes(current))
        return current
    }

    return null
  }

  protected dispatchFocusEvent(type: keyof FocusFederatedEventMap, target?: FederatedEventTarget | null) {
    if (!target)
      return

    const event = this.createFocusEvent(type, target, false)
    event.currentTarget = event.target
    event.eventPhase = event.AT_TARGET
    this.notifyTarget(event, type)
    this.freeEvent(event)
  }

  protected dispatchFocusBubblingEvent(type: keyof FocusFederatedEventMap, path: FederatedEventTarget[]) {
    if (path.length === 0)
      return

    const event = this.createFocusEvent(type, path[path.length - 1], true)
    event.path = path
    this.dispatchEvent(event, type)
    this.freeEvent(event)
  }

  protected dispatchKeyboardEvent(from: FederatedKeyboardEvent) {
    const { focusTargets } = this.focusingData()
    if (!focusTargets || focusTargets.length === 0)
      return

    const event = this.createKeyboardEvent(from, undefined, focusTargets[focusTargets.length - 1])
    event.path = focusTargets
    this.dispatchEvent(event)
    this.freeEvent(event)
  }

  // todo: optimization needed, maybe cache or something
  protected getTabbableTargets(includeNonTabbableHosts = false) {
    if (!this.rootTarget)
      return []

    const queue: Array<FederatedEventTarget> = [this.rootTarget]
    const zeroTabbable: Array<FederatedEventTarget> = []
    const positiveTabbable: Array<FederatedEventTarget> = []

    while (queue.length > 0) {
      const target = queue.shift()!

      if (isTabbable(target))
        (target.tabIndex === 0 ? zeroTabbable : positiveTabbable).push(target)
      else if (includeNonTabbableHosts && isNestedBoundaryHost(target))
        zeroTabbable.push(target)

      if (!target.interactiveChildren)
        continue

      for (const child of target?.children ?? [])
        queue.push(child)
    }

    return positiveTabbable
      .sort((a, b) => a.tabIndex! - b.tabIndex!)
      .concat(zeroTabbable)
  }

  protected getTabbableTargetByShift(
    shift: number,
    current = this.activeElement,
    tabbable = this.getTabbableTargets(),
  ) {
    if (tabbable.length === 0)
      return null

    const defaultIndex = shift < 0 ? tabbable.length - 1 : 0

    if (current === null)
      return tabbable[defaultIndex]

    let index = tabbable.indexOf(current)
    if (index === -1)
      return tabbable[defaultIndex]

    index += shift

    return (index >= 0 && index < tabbable.length)
      ? tabbable[index]
      : null
  }

  getNearestFocusable(target: FederatedEventTarget | null, maxDepth = EventBoundary.PROPAGATION_LIMIT) {
    while (target && (target.tabIndex == null || !target.isInteractive()) && --maxDepth > 0)
      target = target.parent ?? null

    return maxDepth > 0 ? target : null
  }

  // respects focusability
  focus(target: FederatedEventTarget | null, exact = true) {
    this.activeElement = this.getNearestFocusable(target, exact ? 1 : undefined)
  }

  blur() {
    this.activeElement = null
  }

  bindNestedBoundary(nested: EventBoundary, host: NestedBoundaryHost) {
    if (host._nestedBoundaryContext)
      throw new Error('Host is already bound to some nested boundary')

    if (!host.isInteractive()) {
      console.warn('Host interactivity is necessary for nested boundary binding, set host\'s eventMode to static')
      host.eventMode = 'static'
    }

    for (const type of Object.keys(nested.mappingTable) as Array<keyof GlobalMixins.DisplayObjectEvents>)
      host.on(type, nested.mapEvent, nested)

    host._nestedBoundaryContext = {
      boundary: nested,
      onfocusin: ({ path }) => {
        if (path[0] === nested.rootTarget)
          this.activeElement = host
      },
      onfocusout: ({ path }) => {
        if (path[0] === nested.rootTarget && this.activeElement === host)
          this.blur()
      },
    }

    nested.dispatch
      .on('focusin', host._nestedBoundaryContext.onfocusin)
      .on('focusout', host._nestedBoundaryContext.onfocusout)

    // todo: this breaks event order, fix needed
    host.on('blur', nested.blur, nested)
  }

  unbindNestedBoundary(nested: EventBoundary, host: NestedBoundaryHost) {
    if (!host._nestedBoundaryContext)
      return

    for (const type of Object.keys(nested.mappingTable) as Array<keyof GlobalMixins.DisplayObjectEvents>)
      host.off(type, nested.mapEvent, nested)

    nested.rootTarget
      .off('focusin', host._nestedBoundaryContext.onfocusin)
      .off('focusout', host._nestedBoundaryContext.onfocusout)

    host.off('blur', nested.blur, nested)

    delete host._nestedBoundaryContext
  }

  beginActiveElementDebouncing() {
    if (this._activeElementDebouncingDeep < 0)
      this._activeElementDebouncingDeep = 0

    if (++this._activeElementDebouncingDeep === 1)
      delete this._debouncedActiveElement
  }

  endActiveElementDebouncing() {
    if (--this._activeElementDebouncingDeep !== 0)
      return

    if (this._debouncedActiveElement !== undefined) {
      this.activeElement = this._debouncedActiveElement
      delete this._debouncedActiveElement
    }
  }

  get activeElement() {
    const { focusTargets } = this.focusingData()
    return (focusTargets && focusTargets.length) ? focusTargets[focusTargets.length - 1] : null
  }

  // doesn't respect focusability
  set activeElement(value) {
    if (this._activeElementDebouncingDeep > 0) {
      this._debouncedActiveElement = value
      return
    }

    if (this.activeElement === value)
      return

    const focusingData = this.focusingData()
    const oldPath = focusingData.focusTargets
    const newPath = focusingData.focusTargets = value ? this.propagationPath(value) : null

    const commonTarget = (oldPath && newPath) ? this.getPathIntersection(oldPath, newPath) : null

    if (oldPath) {
      const path = commonTarget ? oldPath.slice(oldPath.indexOf(commonTarget) + 1) : oldPath

      this.dispatchFocusEvent('blur', path[path.length - 1] ?? commonTarget)
      this.dispatchFocusBubblingEvent('focusout', path)

      if (this.autoBlurDisconnectedTarget) {
        for (const target of path)
          target.off('removed', this.blur, this)
      }
    }

    if (newPath) {
      const path = commonTarget ? newPath.slice(newPath.indexOf(commonTarget) + 1) : newPath

      this.dispatchFocusEvent('focus', path[path.length - 1] ?? commonTarget)
      this.dispatchFocusBubblingEvent('focusin', path)

      if (this.autoBlurDisconnectedTarget) {
        for (const target of path)
          target.once('removed', this.blur, this)
      }
    }
  }

  get autoBlurDisconnectedTarget() {
    return this._autoBlurDisconnectedTarget
  }

  set autoBlurDisconnectedTarget(value) {
    if (this._autoBlurDisconnectedTarget === value)
      return

    this._autoBlurDisconnectedTarget = value

    const { focusTargets } = this.focusingData()
    if (!focusTargets)
      return

    if (!value) {
      for (const target of focusTargets)
        target.off('removed', this.blur, this)

      return
    }

    for (const target of focusTargets) {
      if (!target.parent) {
        this.blur()
        return
      }

      target.once('removed', this.blur, this)
    }
  }
}
