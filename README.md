# PixiJS Events X
Extended Federated Events API. Backwards compatible replacement for PixiJS Event System that supports focus and
keyboard events.

Feature highlight:
- focus system with `focus`, `blur`, `focusin` and `focusout` events
- `keyup` and `keydown` event propagation to focused graph path
- tab/shift+tab navigation
- tab order by `tabIndex`
- disconnected scene graphs support

## Getting started
Install package:
```sh
npm install pixi-events-x
```

Make your PixiJS html mount point focusable (set `tabindex` attribute).
If you also want tab/shift+tab navigation support, make it tabbable (set non-negative `tabindex` attribute).
```html
<canvas ... tabindex="0" />
```

Then import module:
```ts
import 'pixi-events-x'
```

Now you can use it like this:
```ts
import type { FederatedFocusEvent, FederatedKeyboardEvent } from 'pixi-events-x'

// you can use any descendant of DisplayObject
const someObject = new Container()

// it has to be interactive
someObject.eventMode = 'static'
// make it just focusable (negative values) or also tabbable (zero and positive values)
// it works same as dom `tabindex` attribute
someObject.tabIndex = 0

// subscribe to events
// events work same as their analogs in dom
someObject.on('focus', (event: FederatedFocusEvent) => {})
someObject.on('keydown', (event: FederatedKeyboardEvent) => {})
```

## Disconnected scene graphs
Original PixiJS Event System is meant to provide user ability to manage disconnected scene graphs by nested
`EventBoundary`. You can read more about it [here](https://www.shukantpal.com/blog/pixijs/federated-events-api/).

`pixi-events-x` supports this feature too. It provides its own `EventBoundary` with `bindNestedBoundary` method that
binds two boundaries to propagate events down to disconnected scene graph and manage focus transition.
There is also `unbindNestedBoundary` method to undo binding.

```ts
// root of disconnected scene graph
const nestedBoundaryRoot = new Container()
// EventBoundary that will be manage disconnected scene graph
const nestedBoundary = new EventBoundary(nestedBoundaryRoot)

// renderer.eventsX is the same renderer.events, but with proper type
const rootBoundary = renderer.eventsX.rootBoundary
// and yes, they are really the same
console.log(renderer.events === renderer.eventsX) // true

// connection point
const host = rootBoundary.rootTarget.addChild(new Container())
// it should be interactive
host.eventMode = 'static'

rootBoundary.bindNestedBoundary(nestedBoundary, host)
```

There is an official [example](https://pixijs.io/examples/#/events/nested-boundary-with-projection.js) of nested boundary.
Let's modify it for `pixi-events-x` compatibility.

```ts
import { EventBoundary } from 'pixi-events-x'

class Projector extends DisplayObject {
  constructor(rootBoundary: EventBoundary) {
    this.content = new Container()

    this.rootBoundary = rootBoundary
    this.boundary = new EventBoundary(this.content)

    // same code as in example
    this.originalTransform = new Matrix()
    this.boundary.copyMouseData = (from, to) => { /* ... */ }

    this.evenMode = 'static'

    this.rootBoundary.bindNestedBoundary(this.boundary, this)
  }

  override destroy(options?: boolean | IDestroyOptions | undefined): void {
    this.rootBoundary.unbindNestedBoundary(this.boundary, this)
    this.rootBoundary = null

    super.destroy(options)
  }

  /* ... */
}

const projector = new Projector(renderer.eventsX.rootBoundary)

/* ... */
```

You can think about disconnected scene graph as shadow dom. Focus behavior will be pretty much the same.

## Programmatic focus management
Unlike dom, `pixi-events-x` doesn't provide `focus`/`blur` methods directly on `DisplayObject`.
You should use `EventBoundary` instead.

```ts
const focusableTarget = new Container()
focusableTarget.eventMode = 'static'
focusableTarget.tabindex = -1

const boundary = renderer.eventsX.rootBoundary
boundary.rootTarget.addChild(focusableTarget)

// set focus on target
boundary.focus(focusableTarget)
// current focus target
boundary.activeElement // focusableTarget
// remove focus from current focus target
boundary.blur()
boundary.activeElement // null

// you can set activeElement directly
boundary.activeElement = focusableTarget

// but setting value directly is different from using focus method
// it doesn't care about focusability or interactivity

const nonFocusableTarget = new EventTarget()
focusableTarget.addChild(nonFocusableTarget)

boundary.activeElement = nonFocusableTarget
boundary.activeElement // nonFocusableTarget

boundary.focus(nonFocusableTarget)
boundary.activeElement // null

// instead of setting null value
// focus method also can find first focusable target
// among all parents of non-focusable target
boundary.focus(nonFocusableTarget, false)
boundary.activeElement // focusableTarget
```

## Caveats
Like in dom, the focused target will lose focus if it becomes disconnected from the scene graph.
You can disable this feature per `EventBoundary` by `autoBlurDisconnectedTarget` property.
```ts
renderer.eventsX.rootBoundary.autoBlurDisconnectedTarget = false
```

Unlike in dom, the focused target will NOT lose focus if it becomes non-focusable or non-interactive.
