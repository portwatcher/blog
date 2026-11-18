import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createMat4,
  mat4LookAt,
  mat4Multiply,
  mat4Perspective,
  transformPoint,
} from '../lib/archive-math.ts'
import { createArchiveBookStyles } from '../lib/archive-scene-books.ts'
import { caseDepth, caseHeight, caseWidth, shelfZ } from '../lib/archive-scene-constants.ts'
import { createArchiveSceneInteraction } from '../lib/archive-scene-interaction.ts'
import { createArchiveSceneLayout } from '../lib/archive-scene-layout.ts'
import { createArchiveShelves } from '../lib/archive-scene-shelves.ts'

// The shelves only talk to WebGL to store and draw; everything decided here
// (what is in view, what is hidden, what a click lands on) is plain geometry.
const createGl = () => {
  const writes = []
  const gl = new Proxy({ writes }, {
    get(target, property) {
      if (property in target) {
        return target[property]
      }
      if (property === 'bufferSubData') {
        return (...args) => writes.push(args)
      }
      return typeof property === 'string' && property.startsWith('create') ? () => ({}) : () => {}
    },
  })
  return gl
}

const createScene = (booksPerYear = 80, aspect = 1280 / 720) => {
  const articles = Array.from({ length: booksPerYear * 5 }, (_, index) => ({
    title: `Book ${index}`, date: `${2026 - Math.floor(index / booksPerYear)}-03-14`,
  }))
  const layout = createArchiveSceneLayout(articles)
  const gl = createGl()
  const shelves = createArchiveShelves({
    gl, box: { createVertexArray: () => ({}) }, layout, articles,
    styles: createArchiveBookStyles(articles), lowPower: false, maxTextureSize: 4096,
    anisotropy: 1, titleFontFamily: () => 'serif',
  })
  const camera = {
    fieldOfView: 40 * Math.PI / 180, aspect, position: [0, 0, 0],
    view: createMat4(), projection: createMat4(), viewProjection: createMat4(),
  }
  const lookAt = (x, y, distance = 10) => {
    camera.position = [x, y, shelfZ + distance]
    mat4Perspective(camera.projection, camera.fieldOfView, camera.aspect, 0.1, 64)
    mat4LookAt(camera.view, camera.position, [x, y, shelfZ])
    mat4Multiply(camera.viewProjection, camera.projection, camera.view)
    shelves.updateVisibility(camera.viewProjection)
  }
  return { articles, layout, gl, shelves, camera, lookAt }
}

const visibleRows = (shelves) =>
  shelves.shelves.flatMap((shelf, index) => shelf.visible ? [index] : [])

test('long year rows outside the camera view are skipped and return when the camera moves', () => {
  const { layout, shelves, lookAt } = createScene()
  for (const row of [0, 2, 4, 1, 0]) {
    lookAt(8, layout.shelfCenterYPositions[row])
    assert.deepEqual(visibleRows(shelves), [row],
      'only the year intersecting the camera view should be submitted')
  }
  lookAt(500, layout.shelfCenterYPositions[0])
  assert.deepEqual(visibleRows(shelves), [],
    'rows entirely beyond the horizontal field of view should also be skipped')
})

test('partially visible books remain drawn throughout year transitions and viewport changes', () => {
  const { layout, shelves, camera, lookAt } = createScene(12)
  let checkedVisibleBooks = 0
  let overlappingRows = 0
  const corner = [0, 0, 0]
  for (const aspect of [393 / 690, 1280 / 720, 932 / 430]) {
    camera.aspect = aspect
    for (let step = 0; step <= 100; step++) {
      const y = layout.shelfCenterYPositions[0]
        + (layout.shelfCenterYPositions[4] - layout.shelfCenterYPositions[0]) * step / 100
      lookAt(3, y, 12)
      if (visibleRows(shelves).length > 1) {
        overlappingRows++
      }
      for (let article = 0; article < layout.restMatrices.length; article++) {
        let onScreen = false
        for (let index = 0; index < 8 && !onScreen; index++) {
          corner[0] = (index & 1 ? 0.5 : -0.5) * caseWidth
          corner[1] = (index & 2 ? 0.5 : -0.5) * caseHeight
          corner[2] = (index & 4 ? 0.5 : -0.5) * caseDepth
          transformPoint(corner, layout.restMatrices[article], corner)
          transformPoint(corner, camera.viewProjection, corner)
          onScreen = corner.every((value) => Math.abs(value) <= 1)
        }
        if (onScreen) {
          checkedVisibleBooks++
          assert.equal(shelves.shelves[layout.shelfIndexByArticle[article]].visible, true,
            `visible book ${article} disappeared at aspect ${aspect}, step ${step}`)
        }
      }
    }
  }
  assert.ok(checkedVisibleBooks > 100, 'exercise real geometry inside the view')
  assert.ok(overlappingRows > 0, 'transitions must preserve multiple visible rows')
})

test('a book taken out of its row leaves the slot empty and the row in view, and goes back intact', () => {
  const { layout, gl, shelves, lookAt } = createScene(4)
  lookAt(layout.shelfXPositions[1], layout.shelfYPositions[1])
  shelves.syncActiveArticles([1, 1, 6])
  assert.equal(shelves.isActive(1) && shelves.isActive(6), true)
  assert.equal(gl.writes.length, 2, 'each book is written once, however often it is named')
  assert.ok(Array.from(gl.writes[0][2]).every((value) => value === 0),
    'the slot is collapsed rather than left drawing a second copy')
  lookAt(layout.shelfXPositions[1], layout.shelfYPositions[1])
  assert.equal(shelves.shelves[0].visible, true, 'hiding a book must not shrink its row')
  shelves.syncActiveArticles([6])
  assert.equal(shelves.isActive(1), false)
  assert.deepEqual(Array.from(gl.writes.at(-1)[2]), Array.from(layout.restMatrices[1]),
    'the book returns to exactly where it stood')
})

test('a click lands on the nearest book under it, in the row or out of it', () => {
  const { layout, shelves, camera, lookAt } = createScene(4)
  const pulled = createMat4()
  const interaction = createArchiveSceneInteraction({
    camera, shelves, layout,
    getActive: () => shelves.shelves.flatMap((shelf) => shelf.articleIndices)
      .filter((index) => shelves.isActive(index)),
    getFrame: () => ({}),
    getSize: () => ({ width: 1280, height: 720 }),
    host: { getBoundingClientRect: () => ({ left: 0, top: 0, right: 1280, bottom: 720, width: 1280, height: 720 }) },
    labelFor: () => null,
    // An animated book stands a little in front of its slot.
    motion: {
      getPose: (index) => {
        pulled.set(layout.restMatrices[index])
        pulled[14] += 2
        return { matrix: pulled, swing: 0, center: [0, 0, 0] }
      },
    },
  })
  for (const article of [1, 6, 19, 6]) {
    lookAt(layout.shelfXPositions[article], layout.shelfYPositions[article])
    assert.equal(interaction.pickArticleAt(640, 360), article)
    shelves.syncActiveArticles([article])
    assert.equal(interaction.pickArticleAt(640, 360), article,
      'a book out of its row is still the one under the pointer')
    shelves.syncActiveArticles([])
    assert.equal(interaction.pickArticleAt(640, 360), article)
  }
  // Books further along the row are hit where they stand, not where the
  // camera is centred.
  lookAt(layout.shelfXPositions[1], layout.shelfYPositions[1])
  const neighbour = transformPoint([0, 0, 0], camera.viewProjection,
    [layout.shelfXPositions[2], layout.shelfYPositions[2], shelfZ + caseWidth / 2])
  assert.equal(interaction.pickArticleAt((neighbour[0] + 1) * 640, (1 - neighbour[1]) * 360), 2)
  assert.equal(interaction.pickArticleAt(640, 5), null, 'empty space above the row picks nothing')
  assert.equal(interaction.pickArticleAt(-10, 360), null)
})
