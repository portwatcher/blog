import assert from 'node:assert/strict'
import test from 'node:test'
import { paintArchiveLabel } from '../lib/archive-scene-assets.ts'
import { createArchiveBookStyles } from '../lib/archive-scene-books.ts'

const renderTitle = (title, variant) => {
  const drawn = []
  const context = {
    font: '',
    fillRect() {},
    strokeRect() {},
    beginPath() {},
    moveTo() {},
    lineTo() {},
    stroke() {},
    createLinearGradient: () => ({ addColorStop() {} }),
    // An independent proportional ruler: Latin glyphs are narrower than CJK.
    measureText(text) {
      const size = Number(this.font.match(/([\d.]+)px/)[1])
      const width = Array.from(text).reduce((sum, character) =>
        sum + size * (/\s/.test(character) ? 0.3 : /[\x00-\xff]/.test(character) ? 0.55 : 1), 0)
      return { width }
    },
    fillText(text) {
      if (this.textBaseline === 'middle') {
        drawn.push({ text, width: this.measureText(text).width })
      }
    },
  }
  const article = { title, date: '2024-05-18', categoryTitle: 'Technology' }
  const style = { ...createArchiveBookStyles([article])[0], variant }
  const label = {
    context, logicalWidth: 380, logicalHeight: 560,
    paintKey: '', texture: {},
  }
  paintArchiveLabel(label, article, 0, 'zh', 'serif', 26, 'center', style)
  return drawn
}

test('cover titles keep English words whole in mixed CJK text and within every cover layout', () => {
  const cases = [
    ['在Kubernetes中部署Perforce服务器', ['Kubernetes', 'Perforce']],
    ['在 Kubernetes 中部署Perforce服务器', ['Kubernetes', 'Perforce']],
    ['KubernetesでPerforceサーバーを運用', ['Kubernetes', 'Perforce']],
    ["Don't break real-time English words", ["Don't", 'real-time', 'English']],
    ['超长Supercalifragilisticexpialidocious标题', ['Supercalifragilisticexpialidocious']],
    ['纯中文标题也应该继续正常换行', []],
  ]
  for (const [title, words] of cases) {
    for (let variant = 0; variant < 5; variant++) {
      const drawn = renderTitle(title, variant)
      const lines = drawn.map(({ text }) => text)
      for (const word of words) {
        assert.ok(lines.some((line) => line.includes(word)), `${word} split in ${JSON.stringify(lines)}`)
      }
      assert.equal(lines.join('').replace(/\s/g, ''), title.replace(/\s/g, ''))
      assert.ok(drawn.every(({ width }) => width <= (variant === 1 ? 274 : 304) + 0.01))
    }
  }
})

test('a clamped cover title ends with an ellipsis without leaving a partial English word', () => {
  const title = '在Kubernetes中部署Perforce服务器'.repeat(20)
  for (let variant = 0; variant < 5; variant++) {
    const drawn = renderTitle(title, variant)
    assert.equal(drawn.length, 6)
    assert.ok(drawn.at(-1).text.endsWith('…'))
    for (const { text, width } of drawn) {
      for (const word of text.match(/[A-Za-z]+/g) || []) {
        assert.ok(['Kubernetes', 'Perforce'].includes(word), `Partial word: ${word}`)
      }
      assert.ok(width <= (variant === 1 ? 274 : 304) + 0.01)
    }
  }
})
