import assert from 'node:assert/strict'
import test from 'node:test'
import { BoxGeometry, Matrix4, Mesh, MeshBasicMaterial, PerspectiveCamera, Scene, Vector3 } from 'three'
import { createArchiveBookStyles } from '../lib/archive-scene-books.ts'
import { caseDepth, caseHeight, caseWidth, shelfZ } from '../lib/archive-scene-constants.ts'
import { createArchiveSceneInteraction } from '../lib/archive-scene-interaction.ts'
import { createArchiveSceneLayout } from '../lib/archive-scene-layout.ts'
import { createArchiveShelves } from '../lib/archive-scene-shelves.ts'

const createScene = (booksPerYear = 80) => {
  const articles = Array.from({ length: booksPerYear * 5 }, (_, index) => ({
    title: `Book ${index}`, date: `${2026 - Math.floor(index / booksPerYear)}-03-14`,
  }))
  const geometry = new BoxGeometry(caseWidth, caseHeight, caseDepth)
  const material = new MeshBasicMaterial()
  const layout = createArchiveSceneLayout(articles)
  const spineLabelOffset = new Matrix4().makeRotationY(-Math.PI / 2)
  spineLabelOffset.setPosition(-caseWidth / 2 - 0.009, 0, 0)
  const shelves = createArchiveShelves({
    geometry, material, layout, styles: createArchiveBookStyles(articles), spineLabelOffset,
    spineRects: articles.map(() => ({ u0: 0, v0: 0, u1: 1, v1: 1 })),
    spineMaterial: material,
  })
  const scene = new Scene()
  shelves.batches.forEach(({ group }) => scene.add(group))
  const camera = new PerspectiveCamera(40, 1280 / 720, 0.1, 64)
  const lookAt = (x, y, distance = 10) => {
    camera.position.set(x, y, shelfZ + distance)
    camera.lookAt(x, y, shelfZ)
    shelves.updateVisibility(camera)
    scene.updateMatrixWorld(true)
  }
  const destroy = () => {
    shelves.destroy()
    geometry.dispose()
    material.dispose()
  }
  return { geometry, material, layout, shelves, camera, lookAt, destroy }
}

test('long year rows outside the camera view are skipped and return when the camera moves', () => {
  const { layout, shelves, lookAt, destroy } = createScene()
  try {
    for (const row of [0, 2, 4, 1, 0]) {
      lookAt(8, layout.shelfCenterYPositions[row])
      assert.deepEqual(
        shelves.batches.flatMap(({ group }, index) => group.visible ? [index] : []), [row],
        'only the year intersecting the camera view should be submitted',
      )
    }
    lookAt(500, layout.shelfCenterYPositions[0])
    assert.ok(shelves.batches.every(({ group }) => !group.visible),
      'rows entirely beyond the horizontal field of view should also be skipped')
  } finally {
    destroy()
  }
})

test('partially visible books remain drawn throughout year transitions and viewport changes', () => {
  const { geometry, layout, shelves, camera, lookAt, destroy } = createScene(12)
  try {
    const vertices = geometry.getAttribute('position')
    let checkedVisibleBooks = 0
    let overlappingRows = 0
    for (const aspect of [393 / 690, 1280 / 720, 932 / 430]) {
      camera.aspect = aspect
      camera.updateProjectionMatrix()
      for (let step = 0; step <= 100; step++) {
        const y = layout.shelfCenterYPositions[0]
          + (layout.shelfCenterYPositions[4] - layout.shelfCenterYPositions[0]) * step / 100
        lookAt(3, y, 12)
        if (shelves.batches.filter(({ group }) => group.visible).length > 1) {
          overlappingRows++
        }
        for (let article = 0; article < layout.restMatrices.length; article++) {
          const matrix = layout.restMatrices[article]
          const intersectsScreen = Array.from({ length: vertices.count }, (_, vertex) =>
            new Vector3().fromBufferAttribute(vertices, vertex).applyMatrix4(matrix).project(camera),
          ).some(({ x, y, z }) => Math.abs(x) <= 1 && Math.abs(y) <= 1 && Math.abs(z) <= 1)
          if (intersectsScreen) {
            checkedVisibleBooks++
            assert.equal(shelves.batches[layout.shelfIndexByArticle[article]].group.visible, true,
              `visible book ${article} disappeared at aspect ${aspect}, step ${step}`)
          }
        }
      }
    }
    assert.ok(checkedVisibleBooks > 100, 'exercise real geometry inside the view')
    assert.ok(overlappingRows > 0, 'transitions must preserve multiple visible rows')
  } finally {
    destroy()
  }
})

test('picking retains article identities across rows, extraction, return and independently animated books', () => {
  const { geometry, material, layout, shelves, camera, lookAt, destroy } = createScene(4)
  const activeCase = new Mesh(geometry, material)
  activeCase.visible = false
  const interaction = createArchiveSceneInteraction({
    activeCases: [activeCase], camera, shelves: shelves.batches,
    host: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 1280, height: 720 }) },
    labels: [], getFrame: () => ({}), getSize: () => ({ width: 1280, height: 720 }),
    motion: {},
  })
  try {
    for (const article of [1, 6, 19, 6]) {
      const row = layout.shelfIndexByArticle[article]
      lookAt(layout.shelfXPositions[article], layout.shelfYPositions[article])
      assert.equal(interaction.pickArticleAt(640, 360), article)
      shelves.syncActiveArticles(article, article)
      assert.equal(interaction.pickArticleAt(640, 360), null,
        'an extracted book must leave its static slot empty')
      shelves.syncActiveArticles(-1, -1)
      assert.equal(interaction.pickArticleAt(640, 360), article,
        `returning to row ${row} must restore its original article`)
    }
    shelves.syncActiveArticles(1, 6)
    shelves.syncActiveArticles(6, 19)
    lookAt(layout.shelfXPositions[1], layout.shelfYPositions[1])
    assert.equal(interaction.pickArticleAt(640, 360), 1, 'handoff restores the outgoing slot')

    lookAt(500, 0)
    activeCase.position.set(500, 0, shelfZ)
    activeCase.userData.articleIndex = 19
    activeCase.visible = true
    activeCase.updateMatrixWorld(true)
    assert.equal(interaction.pickArticleAt(640, 360), 19,
      'an animated book remains interactive after its resting row leaves the view')
  } finally {
    destroy()
  }
})
