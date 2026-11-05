import { describe, expect, it } from 'vitest'

import type { MouseTouchEvent } from '../common/EventHandler'
import Eventful from '../common/Eventful'

class Node extends Eventful {
  constructor(readonly label: string) {
    super()
  }

  checkEventOn(_: MouseTouchEvent): boolean {
    return false
  }
}

/** The order children are hit-tested in: last added first. */
function order(node: Node): string[] {
  const children = (node as unknown as { getChildren: () => readonly Eventful[] }).getChildren()
  return children.map((c) => (c as Node).label)
}

/** `raiseChildren` and `getChildren` are protected; a test needs them anyway. */
class Collection extends Node {
  add(...labels: string[]): this {
    labels.forEach((label) => this.addChild(new Node(label)))
    return this
  }

  raise(raised: ReadonlySet<Eventful>): void {
    this.raiseChildren(raised)
  }

  children(): readonly Eventful[] {
    return this.getChildren()
  }
}

function collection(...labels: string[]): Collection {
  return new Collection('root').add(...labels)
}

describe('raiseChildren', () => {
  it('keeps the order while nothing is raised', () => {
    const node = collection('a', 'b', 'c')
    node.raise(new Set())
    expect(order(node as unknown as Node)).toEqual(['a', 'b', 'c'])
  })

  it('moves the raised one to the end, where it is hit first', () => {
    const node = collection('a', 'b', 'c')
    const [, b] = node.children()
    node.raise(new Set([b]))
    expect(order(node as unknown as Node)).toEqual(['a', 'c', 'b'])
  })

  it('keeps the raised ones in their own order', () => {
    const node = collection('a', 'b', 'c', 'd')
    const [a, , c] = node.children()
    node.raise(new Set([c, a]))
    expect(order(node as unknown as Node)).toEqual(['b', 'd', 'a', 'c'])
  })

  it('ignores a raised child that is not there', () => {
    const node = collection('a', 'b')
    node.raise(new Set([new Node('ghost')]))
    expect(order(node as unknown as Node)).toEqual(['a', 'b'])
  })
})
