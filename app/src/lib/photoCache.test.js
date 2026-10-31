import { describe, it, expect } from 'vitest'
import { createThumbCache } from './photoCache.js'

/** A cache over pretend storage that counts reads and which URLs are still in use. */
function setup(limit, have = () => true) {
  const reads = []
  const live = new Set()
  let n = 0
  const cache = createThumbCache({
    limit,
    load: async (upcs) => { reads.push([...upcs]); return new Map(upcs.filter(have).map((u) => [u, `blob-of-${u}`])) },
    createUrl: (b) => { const u = `blob:${++n}:${b}`; live.add(u); return u },
    revokeUrl: (u) => live.delete(u),
  })
  return { cache, reads, live }
}

describe('small photos in memory', () => {
  it('reads every missing photo in one go, and only once', async () => {
    const { cache, reads } = setup(10)
    await cache.ensure(['a', 'b', 'c'])
    await cache.ensure(['a', 'b', 'c', 'd'])
    expect(reads).toEqual([['a', 'b', 'c'], ['d']])
    expect(cache.peek('a')).toMatch(/blob-of-a$/)
  })
  it('two parts of the screen asking at the same time share one read', async () => {
    const { cache, reads } = setup(10)
    await Promise.all([cache.ensure(['a', 'b']), cache.ensure(['b'])])
    expect(reads).toEqual([['a', 'b']])
  })
  it('keeps at most `limit`, dropping the least recently asked-for and letting go of their URLs', async () => {
    const { cache, live } = setup(3)
    await cache.ensure(['a', 'b', 'c'])
    await cache.ensure(['a']) // a was asked for again
    await cache.ensure(['d'])
    expect(cache.size).toBe(3)
    expect(cache.peek('b')).toBeUndefined() // b was the oldest
    expect(cache.peek('a')).toBeDefined()
    expect(live.size).toBe(3)
  })
  it('never drops a photo that is on screen', async () => {
    const { cache } = setup(2)
    cache.pin('drawing', ['a', 'b', 'c'])
    await cache.ensure(['a', 'b', 'c'])
    expect(cache.size).toBe(3) // over the limit while all three are shown
    cache.unpin('drawing')
    expect(cache.size).toBe(2)
  })
  it('a changed photo is read again, and the old URL let go', async () => {
    const { cache, reads, live } = setup(10)
    await cache.ensure(['a'])
    const old = cache.peek('a')
    cache.forget('a')
    expect(live.has(old)).toBe(false)
    await cache.ensure(['a'])
    expect(reads).toEqual([['a'], ['a']])
  })
  it('lets go of everything on clear', async () => {
    const { cache, live } = setup(10)
    await cache.ensure(['a', 'b'])
    cache.clear()
    expect(live.size).toBe(0)
    expect(cache.size).toBe(0)
  })
  it('products without a photo in storage are simply left out', async () => {
    const { cache } = setup(10, (u) => u !== 'b')
    await cache.ensure(['a', 'b'])
    expect(cache.peek('b')).toBeUndefined()
  })
})
