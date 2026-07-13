import { Object3D } from 'three'
import {
  caseDepth,
  caseHeight,
  caseWidth,
  indexVariance,
  mix,
  shelfVerticalPitch,
  shelfY,
  shelfZ,
  spinePitch,
} from './archive-scene-constants'
import type { ArchiveSceneArticle } from './archive-scene-types'

export interface ArchiveShelfGroup {
  year: string
  articleIndices: number[]
}

export interface ArchiveCaseScale {
  x: number
  y: number
  z: number
}

export const createArchiveSceneLayout = (
  articles: ArchiveSceneArticle[],
) => {
  const shelfGroups: ArchiveShelfGroup[] = []
  const shelfIndexByArticle = new Array<number>(articles.length).fill(0)
  const shelfByYear = new Map<string, number>()

  articles.forEach((article, articleIndex) => {
    const parsedYear = new Date(article.date).getFullYear()
    const year = Number.isNaN(parsedYear) ? '—' : String(parsedYear)
    let shelfIndex = shelfByYear.get(year)
    if (shelfIndex === undefined) {
      shelfIndex = shelfGroups.length
      shelfByYear.set(year, shelfIndex)
      shelfGroups.push({ year, articleIndices: [] })
    }
    shelfGroups[shelfIndex].articleIndices.push(articleIndex)
    shelfIndexByArticle[articleIndex] = shelfIndex
  })

  const shelfCenterYPositions = shelfGroups.map(
    (_, shelfIndex) => shelfY - shelfIndex * shelfVerticalPitch,
  )

  // Stable per-article variation reads as physical manufacturing/casual shelf
  // placement while preserving batching and avoiding layout shifts on return.
  const caseScales = articles.map((_, articleIndex) => ({
    x: 1 + indexVariance(articleIndex + 37) * 0.018,
    y: 1 + indexVariance(articleIndex + 73) * 0.014,
    z: 1 + indexVariance(articleIndex + 109) * 0.045,
  }))
  const caseYawAngles = articles.map(
    (_, articleIndex) => indexVariance(articleIndex) * 0.018,
  )
  const caseLeanAngles = createCaseLeanAngles(articles.length)
  const shelfXPositions = createShelfXPositions(
    articles.length,
    shelfIndexByArticle,
    caseScales,
  )
  const shelfYPositions = articles.map((_, articleIndex) => {
    const caseScale = caseScales[articleIndex]
    const yaw = caseYawAngles[articleIndex]
    const lean = caseLeanAngles[articleIndex]
    const halfHeight = caseHeight * caseScale.y / 2
    const halfShelfWidth = caseDepth * caseScale.z / 2 * Math.cos(yaw)
      + caseWidth * caseScale.x / 2 * Math.abs(Math.sin(yaw))
    const leanedHalfHeight = halfHeight * Math.cos(lean)
      + halfShelfWidth * Math.abs(Math.sin(lean))
    const shelfCenterY = shelfCenterYPositions[
      shelfIndexByArticle[articleIndex]
    ] ?? shelfY
    return shelfCenterY - caseHeight / 2 + leanedHalfHeight
  })

  const poseObject = new Object3D()
  const restMatrices = articles.map((_, articleIndex) => {
    const caseScale = caseScales[articleIndex]
    poseObject.position.set(
      shelfXPositions[articleIndex],
      shelfYPositions[articleIndex],
      shelfZ,
    )
    poseObject.rotation.set(
      0,
      Math.PI / 2 + caseYawAngles[articleIndex],
      caseLeanAngles[articleIndex],
      // ZYX applies the lean in shelf space, so neighboring tops actually
      // angle toward one another rather than merely rolling in depth.
      'ZYX',
    )
    poseObject.scale.set(caseScale.x, caseScale.y, caseScale.z)
    poseObject.updateMatrix()
    return poseObject.matrix.clone()
  })

  return {
    shelfGroups,
    shelfIndexByArticle,
    shelfCenterYPositions,
    caseScales,
    caseYawAngles,
    caseLeanAngles,
    shelfXPositions,
    shelfYPositions,
    restMatrices,
  }
}

export type ArchiveSceneLayout = ReturnType<typeof createArchiveSceneLayout>

const createCaseLeanAngles = (articleCount: number) => {
  const caseLeanAngles = new Array<number>(articleCount).fill(0)
  let leanGroupStart = 0
  let leanGroupIndex = 0

  while (leanGroupStart < articleCount) {
    const remaining = articleCount - leanGroupStart
    const groupSize = Math.min(
      remaining,
      2 + Math.floor((indexVariance(leanGroupIndex + 211) + 1) * 1.5),
    )
    const groupStrength = 0.019
      + (indexVariance(leanGroupIndex + 257) + 1) * 0.0025
    for (let offset = 0; offset < groupSize; offset++) {
      const articleIndex = leanGroupStart + offset
      const inwardLean = groupSize === 1
        ? 0
        : mix(-1, 1, offset / (groupSize - 1))
      caseLeanAngles[articleIndex] = inwardLean * groupStrength
        + indexVariance(articleIndex + 307) * 0.0015
    }
    leanGroupStart += groupSize
    leanGroupIndex++
  }

  return caseLeanAngles
}

const createShelfXPositions = (
  articleCount: number,
  shelfIndexByArticle: number[],
  caseScales: ArchiveCaseScale[],
) => {
  const shelfXPositions = new Array<number>(articleCount).fill(0)
  const baseSpineGap = spinePitch - caseDepth

  for (let articleIndex = 1; articleIndex < articleCount; articleIndex++) {
    if (
      shelfIndexByArticle[articleIndex]
      !== shelfIndexByArticle[articleIndex - 1]
    ) {
      shelfXPositions[articleIndex] = 0
      continue
    }
    const previousScale = caseScales[articleIndex - 1]
    const currentScale = caseScales[articleIndex]
    const variedGap = baseSpineGap
      * (1 + indexVariance(articleIndex + 151) * 0.18)
    shelfXPositions[articleIndex] = shelfXPositions[articleIndex - 1]
      + caseDepth * (previousScale.z + currentScale.z) / 2
      + variedGap
  }

  return shelfXPositions
}
