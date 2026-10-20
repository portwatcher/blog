import {
  Box3,
  DynamicDrawUsage,
  Frustum,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
} from 'three'
import type { BufferGeometry, Material, PerspectiveCamera } from 'three'
import { createShelfSpineGeometry } from './archive-scene-assets'
import type { ArchiveSpineAtlasRect } from './archive-scene-assets'
import type { ArchiveBookStyle } from './archive-scene-books'
import type { ArchiveSceneLayout } from './archive-scene-layout'

interface ArchiveShelfOptions {
  geometry: BufferGeometry
  material: Material
  layout: ArchiveSceneLayout
  styles: ArchiveBookStyle[]
  spineLabelOffset: Matrix4
  spineRects: ArchiveSpineAtlasRect[]
  spineMaterial: Material
}

export const createArchiveShelves = (options: ArchiveShelfOptions) => {
  const {
    geometry, material, layout, styles,
    spineLabelOffset, spineRects, spineMaterial,
  } = options
  const articleSlots = new Map<number, { shelfIndex: number; instanceIndex: number }>()
  const batches = layout.shelfGroups.map(({ articleIndices }, shelfIndex) => {
    const cases = new InstancedMesh(geometry, material, articleIndices.length)
    cases.instanceMatrix.setUsage(DynamicDrawUsage)
    // A long row's bounding sphere overlaps distant rows. Cull its tight box
    // below instead, before either batch reaches the renderer.
    cases.frustumCulled = false
    articleIndices.forEach((articleIndex, instanceIndex) => {
      cases.setMatrixAt(instanceIndex, layout.restMatrices[articleIndex])
      cases.setColorAt(instanceIndex, styles[articleIndex].color)
      articleSlots.set(articleIndex, { shelfIndex, instanceIndex })
    })
    cases.computeBoundingBox()
    cases.computeBoundingSphere()
    const { geometry: spineGeometry, restPositions } = createShelfSpineGeometry(
      articleIndices.map((index) => layout.restMatrices[index]),
      spineLabelOffset,
      articleIndices.map((index) => spineRects[index]),
    )
    const spines = new Mesh(spineGeometry, spineMaterial)
    spines.frustumCulled = false
    spineGeometry.computeBoundingBox()
    const bounds = new Box3()
    if (cases.boundingBox) {
      bounds.union(cases.boundingBox)
    }
    if (spineGeometry.boundingBox) {
      bounds.union(spineGeometry.boundingBox)
    }
    const group = new Group()
    group.add(cases, spines)
    return { group, cases, articleIndices, spineGeometry, restPositions, bounds }
  })
  const hiddenMatrix = new Matrix4().makeScale(0, 0, 0)
  const projection = new Matrix4()
  const frustum = new Frustum()
  let activeArticles: number[] = []

  const setArticleVisible = (articleIndex: number, visible: boolean) => {
    const slot = articleSlots.get(articleIndex)
    if (!slot) {
      return
    }
    const { instanceIndex, shelfIndex } = slot
    const { cases, spineGeometry, restPositions } = batches[shelfIndex]
    cases.setMatrixAt(instanceIndex, visible ? layout.restMatrices[articleIndex] : hiddenMatrix)
    cases.instanceMatrix.needsUpdate = true
    const position = spineGeometry.getAttribute('position')
    const offset = instanceIndex * 12
    if (visible) {
      for (let component = 0; component < 12; component++) {
        position.array[offset + component] = restPositions[offset + component]
      }
    } else {
      for (let vertex = 0; vertex < 4; vertex++) {
        position.setXYZ(
          instanceIndex * 4 + vertex,
          restPositions[offset], restPositions[offset + 1], restPositions[offset + 2],
        )
      }
    }
    position.needsUpdate = true
    // Keep the original bounds: hiding an extracted book must not shrink its
    // row or move its bounds to the zero-scale instance at the world origin.
  }

  return {
    batches,
    syncActiveArticles(indexA: number, indexB: number) {
      const next = [indexA, indexB].filter(
        (index, slot, indices) => articleSlots.has(index) && indices.indexOf(index) === slot,
      )
      for (const index of activeArticles) {
        if (!next.includes(index)) {
          setArticleVisible(index, true)
        }
      }
      for (const index of next) {
        if (!activeArticles.includes(index)) {
          setArticleVisible(index, false)
        }
      }
      activeArticles = next
    },
    updateVisibility(camera: PerspectiveCamera) {
      camera.updateMatrixWorld()
      projection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
      frustum.setFromProjectionMatrix(projection, camera.coordinateSystem, camera.reversedDepth)
      for (const { group, bounds } of batches) {
        group.visible = frustum.intersectsBox(bounds)
      }
    },
    destroy() {
      for (const { cases, spineGeometry } of batches) {
        cases.dispose()
        spineGeometry.dispose()
      }
    },
  }
}

export type ArchiveShelfBatch = ReturnType<typeof createArchiveShelves>['batches'][number]
