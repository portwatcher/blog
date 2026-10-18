import { Mesh, MeshStandardMaterial, PlaneGeometry } from 'three'
import { createSpineAtlas, paintSpineAtlas } from './archive-scene-assets'
import type { ArchiveBookStyle } from './archive-scene-books'
import { spineLabelHeight, spineLabelWidth } from './archive-scene-constants'
import type { ArchiveSceneArticle } from './archive-scene-types'

interface ArchiveActiveSpineOptions {
  articles: ArchiveSceneArticle[]
  styles: ArchiveBookStyle[]
  titleFontFamily: string
  lowPower: boolean
  maxTextureSize: number
  anisotropy: number
}

// Only the two books near the camera need a close-up texture. This keeps the
// shelf atlas bounded while avoiding enlarged, blurry titles during extraction.
export const createArchiveActiveSpine = (options: ArchiveActiveSpineOptions) => {
  const { articles, styles, titleFontFamily, lowPower, maxTextureSize, anisotropy } = options
  const atlas = createSpineAtlas(1, lowPower, maxTextureSize, lowPower ? 3 : 4.5)
  atlas.texture.anisotropy = anisotropy
  const geometry = new PlaneGeometry(spineLabelWidth, spineLabelHeight)
  const rect = atlas.rects[0]
  const uv = geometry.getAttribute('uv')
  uv.setXY(0, rect.u0, rect.v1)
  uv.setXY(1, rect.u1, rect.v1)
  uv.setXY(2, rect.u0, rect.v0)
  uv.setXY(3, rect.u1, rect.v0)
  const material = new MeshStandardMaterial({
    map: atlas.texture,
    color: 0xffffff,
    roughness: 0.84,
    metalness: 0,
  })
  const mesh = new Mesh(geometry, material)
  mesh.matrixAutoUpdate = false
  mesh.visible = false
  mesh.frustumCulled = false
  let paintedIndex = -1

  return {
    mesh,
    setArticle(index: number) {
      if (paintedIndex === index) {
        return
      }
      atlas.paintKey = ''
      paintSpineAtlas(atlas, [articles[index]], titleFontFamily, [styles[index]])
      paintedIndex = index
    },
    refreshTypography() {
      paintedIndex = -1
    },
    destroy() {
      geometry.dispose()
      material.dispose()
      atlas.texture.dispose()
    },
  }
}

export type ArchiveActiveSpine = ReturnType<typeof createArchiveActiveSpine>
