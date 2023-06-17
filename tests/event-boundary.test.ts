import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest'

import { Rectangle } from '@pixi/core'
import { FederatedPointerEvent } from '@pixi/events'
import { Container } from '@pixi/display'
import type { FocusFederatedEventMap, KeyboardFederatedEventMap } from '../build'
import { EventBoundary, FederatedKeyboardEvent } from '../build'

interface StandTreeSchema {
  [key: string]: StandTreeSchema
}

function makeStandTree(
  schema: StandTreeSchema,
  root: Container = new Container(),
  map: Record<string, Container> = {},
) {
  const queue = [[root, schema] as const]
  while (queue.length) {
    const [currentRoot, currentSchema] = queue.pop()!

    for (const [key, localSchema] of Object.entries(currentSchema)) {
      const localRoot = map[key] = map[key] ?? new Container()

      if (localRoot.parent !== currentRoot)
        currentRoot.addChild(localRoot)

      queue.push([localRoot, localSchema])
    }
  }

  return { root, map }
}

function makeStand(
  schema: StandTreeSchema,
  focusLog: Array<[keyof FocusFederatedEventMap, string]> = [],
  keyboardLog: Array<[keyof KeyboardFederatedEventMap, string]> = [],
  objectEventPrefix = '',
) {
  const tree = makeStandTree(schema)
  const boundary = new EventBoundary(tree.root)

  beforeAll(() => {
    for (const [objectName, object] of Object.entries(tree.map)) {
      // @ts-expect-error for better dx during log reading
      object.__testName = objectName

      for (const event of ['focus', 'blur', 'focusin', 'focusout'] as const)
        object.on(event, () => focusLog.push([event, objectEventPrefix + objectName]))

      for (const event of ['keyup', 'keydown'] as const)
        object.on(event, () => keyboardLog.push([event, objectEventPrefix + objectName]))
    }
  })

  afterAll(() => {
    for (const object of Object.values(tree.map))
      object.removeAllListeners()
  })

  beforeEach(() => {
    for (const object of Object.values(tree.map)) {
      object.eventMode = 'auto'
      object.tabIndex = undefined
      object.hitArea = null
    }

    makeStandTree(schema, tree.root, tree.map)

    boundary.activeElement = null

    focusLog.length = 0
    keyboardLog.length = 0
  })

  return {
    tree,
    boundary,
    focusLog,
    keyboardLog,
  }
}

describe('EventBoundary', () => {
  const { tree, boundary, focusLog, keyboardLog } = makeStand({
    root: {
      leftBranch: { leftLeaf: {} },
      rightBranch: { rightLeaf: {} },
    },
  })

  const stage = tree.root
  const {
    root,
    leftBranch,
    rightBranch,
    leftLeaf,
    rightLeaf,
  } = tree.map

  test('focusability is respected', () => {
    root.eventMode = 'static'
    leftBranch.tabIndex = 0

    boundary.focus(leftLeaf)
    expect(boundary.activeElement).toBe(null)

    expect(focusLog).toEqual([])
  })

  test('focus transition between parent and child', () => {
    root.eventMode = 'static'
    root.tabIndex = 0

    leftBranch.eventMode = 'static'
    leftBranch.tabIndex = 0

    boundary.focus(root)
    expect(boundary.activeElement).toBe(root)

    boundary.focus(leftBranch)
    expect(boundary.activeElement).toBe(leftBranch)

    boundary.focus(root)
    expect(boundary.activeElement).toBe(root)

    boundary.blur()
    expect(boundary.activeElement).toBe(null)

    expect(focusLog).toEqual([
      ['focus', 'root'],
      ['focusin', 'root'],

      ['blur', 'root'],
      ['focus', 'leftBranch'],
      ['focusin', 'leftBranch'],

      ['blur', 'leftBranch'],
      ['focusout', 'leftBranch'],
      ['focus', 'root'],

      ['blur', 'root'],
      ['focusout', 'root'],
    ])
  })

  test('focus transition between element children', () => {
    for (const object of Object.values(tree.map))
      object.eventMode = 'static'

    leftLeaf.tabIndex = 0
    rightLeaf.tabIndex = 0

    boundary.focus(leftLeaf)
    expect(boundary.activeElement).toBe(leftLeaf)

    boundary.focus(rightLeaf)
    expect(boundary.activeElement).toBe(rightLeaf)

    expect(focusLog).toEqual([
      ['focus', 'leftLeaf'],
      ['focusin', 'leftLeaf'],
      ['focusin', 'leftBranch'],
      ['focusin', 'root'],

      ['blur', 'leftLeaf'],
      ['focusout', 'leftLeaf'],
      ['focusout', 'leftBranch'],

      ['focus', 'rightLeaf'],
      ['focusin', 'rightLeaf'],
      ['focusin', 'rightBranch'],
    ])
  })

  test('active element loses focus if unmounted', () => {
    root.eventMode = 'static'
    root.tabIndex = -1

    boundary.focus(root)
    expect(boundary.activeElement).toBe(root)

    stage.removeChild(root)
    expect(boundary.activeElement).toBe(null)

    expect(focusLog).toEqual([
      ['focus', 'root'],
      ['focusin', 'root'],
      ['blur', 'root'],
      ['focusout', 'root'],
    ])
  })

  test('pointerdown may be used to control focus', () => {
    leftLeaf.eventMode = 'static'
    leftLeaf.tabIndex = 0
    leftLeaf.hitArea = new Rectangle(0, 0, 100, 100)

    const event = new FederatedPointerEvent(boundary)
    event.pointerId = 1
    event.button = 1
    event.type = 'pointerdown'
    event.global.set(50, 50)

    boundary.mapEvent(event)
    expect(boundary.activeElement).toBe(leftLeaf)

    event.global.set(200, 200)

    boundary.mapEvent(event)
    expect(boundary.activeElement).toBe(null)

    expect(focusLog).toEqual([
      ['focus', 'leftLeaf'],
      ['focusin', 'leftLeaf'],
      ['blur', 'leftLeaf'],
      ['focusout', 'leftLeaf'],
    ])
  })

  test('keyboard events fire', () => {
    root.eventMode = 'static'
    leftLeaf.eventMode = 'static'
    leftLeaf.tabIndex = -1

    const event = new FederatedKeyboardEvent(boundary)
    event.code = event.key = 'KeyA'

    event.type = 'keydown'
    boundary.mapEvent(event)
    event.type = 'keyup'
    boundary.mapEvent(event)

    boundary.focus(leftLeaf)

    event.type = 'keydown'
    boundary.mapEvent(event)
    event.type = 'keyup'
    boundary.mapEvent(event)

    expect(keyboardLog).toEqual([
      ['keydown', 'leftLeaf'],
      ['keydown', 'root'],
      ['keyup', 'leftLeaf'],
      ['keyup', 'root'],
    ])
  })

  test('tab/shift+tab navigate between tabbable', () => {
    for (const object of Object.values(tree.map))
      object.eventMode = 'static'

    root.tabIndex = 3
    leftBranch.tabIndex = 0
    rightBranch.tabIndex = -1
    leftLeaf.tabIndex = 1
    rightLeaf.tabIndex = 0

    const event = new FederatedKeyboardEvent(boundary)
    event.code = event.key = 'Tab'
    event.type = 'keydown'

    for (const element of [leftLeaf, root, leftBranch, rightLeaf, null]) {
      event.defaultPrevented = false
      boundary.mapEvent(event)
      expect(boundary.activeElement).toBe(element)
    }

    root.tabIndex = -23
    leftBranch.eventMode = 'auto'
    rightBranch.tabIndex = undefined
    leftLeaf.tabIndex = 0
    rightLeaf.tabIndex = 23

    event.shiftKey = true

    for (const element of [leftLeaf, rightLeaf, null]) {
      event.defaultPrevented = false
      boundary.mapEvent(event)
      expect(boundary.activeElement).toBe(element)
    }

    expect(focusLog).toEqual([
      ['focus', 'leftLeaf'],
      ['focusin', 'leftLeaf'],
      ['focusin', 'leftBranch'],
      ['focusin', 'root'],

      ['blur', 'leftLeaf'],
      ['focusout', 'leftLeaf'],
      ['focusout', 'leftBranch'],
      ['focus', 'root'],

      ['blur', 'root'],
      ['focus', 'leftBranch'],
      ['focusin', 'leftBranch'],

      ['blur', 'leftBranch'],
      ['focusout', 'leftBranch'],
      ['focus', 'rightLeaf'],
      ['focusin', 'rightLeaf'],
      ['focusin', 'rightBranch'],

      ['blur', 'rightLeaf'],
      ['focusout', 'rightLeaf'],
      ['focusout', 'rightBranch'],
      ['focusout', 'root'],

      ['focus', 'leftLeaf'],
      ['focusin', 'leftLeaf'],
      ['focusin', 'root'],

      ['blur', 'leftLeaf'],
      ['focusout', 'leftLeaf'],
      ['focus', 'rightLeaf'],
      ['focusin', 'rightLeaf'],
      ['focusin', 'rightBranch'],

      ['blur', 'rightLeaf'],
      ['focusout', 'rightLeaf'],
      ['focusout', 'rightBranch'],
      ['focusout', 'root'],
    ])
  })

  test('tab/shift+tab handle defaultPrevented', () => {
    root.eventMode = 'static'
    root.tabIndex = 0

    const event = new FederatedKeyboardEvent(boundary)
    event.code = event.key = 'Tab'
    event.type = 'keydown'

    boundary.mapEvent(event)
    expect(event.defaultPrevented).toBe(true)
    expect(boundary.activeElement).toBe(root)

    boundary.mapEvent(event)
    expect(boundary.activeElement).toBe(root)

    event.defaultPrevented = false
    boundary.mapEvent(event)
    expect(event.defaultPrevented).toBe(false)
    expect(boundary.activeElement).toBe(null)
  })
})

describe('nested EventBoundary', () => {
  const schema = {
    root: {
      host: {},
      branch: {},
    },
  }

  const stand = makeStand(schema)
  const { focusLog, keyboardLog } = stand
  const nestedStand = makeStand(schema, focusLog, keyboardLog, 'nested-')

  beforeEach(() => {
    stand.tree.map.host.eventMode = 'static'

    stand.boundary.unbindNestedBoundary(nestedStand.boundary, stand.tree.map.host)
    stand.boundary.bindNestedBoundary(nestedStand.boundary, stand.tree.map.host)
  })

  test('focus synchronization works', () => {
    const nestedRoot = nestedStand.tree.map.root
    nestedRoot.eventMode = 'static'
    nestedRoot.tabIndex = 0

    nestedStand.boundary.focus(nestedRoot)
    expect(stand.boundary.activeElement).toBe(stand.tree.map.host)

    stand.boundary.blur()
    expect(nestedStand.boundary.activeElement).toBe(null)

    expect(focusLog).toEqual([
      ['focus', 'nested-root'],
      ['focusin', 'nested-root'],
      ['focus', 'host'],
      ['focusin', 'host'],

      ['blur', 'host'],
      ['blur', 'nested-root'],
      ['focusout', 'nested-root'],
      ['focusout', 'host'],
    ])
  })

  test('tab/tab+shift navigate between tabbable', () => {
    const map = stand.tree.map
    map.branch.eventMode = 'static'
    map.branch.tabIndex = 0
    map.root.eventMode = 'static'
    map.root.tabIndex = 1
    map.host.tabIndex = 2

    const nestedMap = nestedStand.tree.map
    nestedMap.branch.eventMode = 'static'
    nestedMap.branch.tabIndex = 2
    nestedMap.host.eventMode = 'static'
    nestedMap.host.tabIndex = 1

    const event = new FederatedKeyboardEvent(stand.boundary)
    event.code = event.key = 'Tab'
    event.type = 'keydown'

    const order = [map.root, map.host, map.host, map.host, map.branch, null]
    const nestedOrder = [null, null, nestedMap.host, nestedMap.branch, null, null]

    for (let i = 0; i < order.length; i++) {
      event.defaultPrevented = false
      stand.boundary.mapEvent(event)

      expect(stand.boundary.activeElement).toBe(order[i])
      expect(nestedStand.boundary.activeElement).toBe(nestedOrder[i])
    }

    expect(focusLog).toEqual([
      ['focus', 'root'],
      ['focusin', 'root'],

      ['blur', 'root'],
      ['focus', 'host'],
      ['focusin', 'host'],

      ['focus', 'nested-host'],
      ['focusin', 'nested-host'],

      ['blur', 'nested-host'],
      ['focusout', 'nested-host'],
      ['focus', 'nested-branch'],
      ['focusin', 'nested-branch'],

      ['blur', 'nested-branch'],
      ['focusout', 'nested-branch'],
      ['blur', 'host'],
      ['focusout', 'host'],
      ['focus', 'branch'],
      ['focusin', 'branch'],

      ['blur', 'branch'],
      ['focusout', 'branch'],
      ['focusout', 'root'],
    ])
  })

  test.each([
    { tabIndex: undefined, isEmpty: true },
    { tabIndex: undefined, isEmpty: false },
    { tabIndex: -1, isEmpty: false },
    { tabIndex: 0, isEmpty: false },
    { tabIndex: 1, isEmpty: false },
    { tabIndex: -1, isEmpty: true },
    { tabIndex: 0, isEmpty: true },
    { tabIndex: 1, isEmpty: true },
  ])('tab/tab+shift navigation edge case { tabIndex: $tabIndex, isEmpty: $isEmpty }', ({ tabIndex, isEmpty }) => {
    const host = stand.tree.map.host
    host.tabIndex = tabIndex

    const root = nestedStand.tree.map.root
    if (!isEmpty) {
      root.eventMode = 'static'
      root.tabIndex = 1
    }

    const event = new FederatedKeyboardEvent(stand.boundary)
    event.code = event.key = 'Tab'
    event.type = 'keydown'

    let order = []

    if (typeof tabIndex === 'number' && tabIndex >= 0)
      order.push([host, null])

    if (!isEmpty)
      order.push([host, root])

    for (let i = 0; i < 2; i++) {
      order.push([null, null])

      for (const [target, nestedTarget] of order) {
        stand.boundary.mapEvent(event)
        event.defaultPrevented = false

        expect(stand.boundary.activeElement).toBe(target)
        expect(nestedStand.boundary.activeElement).toBe(nestedTarget)
      }

      event.shiftKey = true
      order.pop()
      order = order.reverse()
    }
  })

  test('pointerdown may be used to control focus', () => {
    const map = stand.tree.map
    map.host.tabIndex = -1
    map.host.hitArea = new Rectangle(0, 0, 200, 200)

    const nestedMap = nestedStand.tree.map
    nestedMap.host.eventMode = 'static'
    nestedMap.host.tabIndex = -1
    nestedMap.host.hitArea = new Rectangle(25, 25, 50, 50)
    nestedMap.branch.eventMode = 'static'
    nestedMap.branch.tabIndex = -1
    nestedMap.branch.hitArea = new Rectangle(125, 125, 50, 50)

    const event = new FederatedPointerEvent(stand.boundary)
    event.pointerId = 1
    event.button = 1
    event.type = 'pointerdown'
    event.global.set(10, 10)

    stand.boundary.mapEvent(event)
    expect(stand.boundary.activeElement).toBe(map.host)
    expect(nestedStand.boundary.activeElement).toBe(null)

    event.global.set(50, 50)

    stand.boundary.mapEvent(event)
    expect(stand.boundary.activeElement).toBe(map.host)
    expect(nestedStand.boundary.activeElement).toBe(nestedMap.host)

    event.global.set(150, 150)

    stand.boundary.mapEvent(event)
    expect(stand.boundary.activeElement).toBe(map.host)
    expect(nestedStand.boundary.activeElement).toBe(nestedMap.branch)

    event.global.set(190, 190)

    stand.boundary.mapEvent(event)
    expect(stand.boundary.activeElement).toBe(map.host)
    expect(nestedStand.boundary.activeElement).toBe(null)

    expect(focusLog).toEqual([
      ['focus', 'host'],
      ['focusin', 'host'],

      ['focus', 'nested-host'],
      ['focusin', 'nested-host'],

      ['blur', 'nested-host'],
      ['focusout', 'nested-host'],
      ['focus', 'nested-branch'],
      ['focusin', 'nested-branch'],

      ['blur', 'nested-branch'],
      ['focusout', 'nested-branch'],
    ])
  })
})
