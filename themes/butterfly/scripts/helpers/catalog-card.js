'use strict'

const { parseDocument } = require('htmlparser2')

const providers = {
  baidu: '百度网盘',
  uc: 'UC网盘',
  xunlei: '迅雷网盘',
  quark: '夸克网盘'
}

function hasClass (node, className) {
  return Boolean(node && node.attribs && typeof node.attribs.class === 'string' && node.attribs.class.split(/\s+/).includes(className))
}

function * walk (root, skipNestedPan = false) {
  const stack = [root]
  while (stack.length) {
    const node = stack.pop()
    if (!node || (skipNestedPan && node !== root && hasClass(node, 'post-pan-download'))) continue
    yield node
    if (!Array.isArray(node.children)) continue
    for (let index = node.children.length - 1; index >= 0; index--) stack.push(node.children[index])
  }
}

function findFirst (root, predicate) {
  for (const node of walk(root)) {
    if (predicate(node)) return node
  }
  return null
}

function nodeText (root) {
  const parts = []
  const stack = [root]
  while (stack.length) {
    const node = stack.pop()
    if (!node || node.type === 'comment' || node.name === 'script' || node.name === 'style') continue
    if (node.type === 'text') parts.push(node.data || '')
    if (!Array.isArray(node.children)) continue
    for (let index = node.children.length - 1; index >= 0; index--) stack.push(node.children[index])
  }
  return parts.join('').replace(/\s+/g, ' ').trim()
}

function plainText (value) {
  if (typeof value !== 'string' || !value.trim()) return ''
  try {
    return nodeText(parseDocument(value, { decodeEntities: true }))
  } catch (error) {
    return ''
  }
}

function normalizeTags (values) {
  if (!Array.isArray(values)) return []
  return [...new Set(values.map(plainText).filter(Boolean))].slice(0, 8)
}

function normalizePlatforms (values) {
  const entries = typeof values === 'string' ? [values] : values
  if (!Array.isArray(entries)) return []
  const aliases = {
    windows: 'Windows',
    win: 'Windows',
    android: '安卓',
    ios: 'iOS',
    macos: 'macOS',
    linux: 'Linux',
    web: 'Web'
  }
  const names = entries.map(plainText).filter(Boolean).map(name => {
    const alias = name.toLowerCase()
    return Object.prototype.hasOwnProperty.call(aliases, alias) ? aliases[alias] : name
  })
  return [...new Set(names)]
}

function cardField (source, name) {
  const value = source[`card_${name}`]
  return value === undefined ? source[`game_${name}`] : value
}

function metaText (value) {
  return value == null ? '' : String(value).trim()
}

function cardMeta (article) {
  const source = article && typeof article === 'object' ? article : {}
  return {
    status: metaText(cardField(source, 'status')),
    size: metaText(cardField(source, 'size')),
    review: metaText(cardField(source, 'review')),
    tags: normalizeTags(cardField(source, 'tags')),
    platforms: normalizePlatforms(cardField(source, 'platforms'))
  }
}

function articleDownloads (content) {
  if (typeof content !== 'string' || !content.trim()) return []
  try {
    const document = parseDocument(content, { decodeEntities: true })
    const block = findFirst(document, node => hasClass(node, 'post-pan-download'))
    if (!block) return []

    const downloads = []
    for (const button of walk(block, true)) {
      if (button.name !== 'button' || !hasClass(button, 'post-pan-download__item')) continue
      const type = Object.keys(providers).find(provider => hasClass(button, `is-${provider}`))
      if (!type) continue
      const attributes = button.attribs
      const label = findFirst(button, node => hasClass(node, 'post-pan-download__name'))
      const mark = findFirst(button, node => hasClass(node, 'post-pan-download__mark'))
      const image = findFirst(mark || button, node => node.name === 'img')
      downloads.push({
        type,
        label: nodeText(label) || providers[type],
        image: image && image.attribs ? (image.attribs.src || '').trim() : '',
        payload: attributes['data-pan-p'] || '',
        iv: attributes['data-pan-s'] || '',
        key: attributes['data-pan-k'] || '',
        disabled: Object.prototype.hasOwnProperty.call(attributes, 'disabled') || attributes['aria-disabled'] === 'true' || hasClass(button, 'is-unavailable')
      })
    }
    return downloads
  } catch (error) {
    return []
  }
}

hexo.extend.helper.register('catalog_card_settings', function (categoryName) {
  if (typeof categoryName !== 'string' || !categoryName.trim()) return null
  const settings = this.site && this.site.data && this.site.data.card
  if (!Array.isArray(settings)) return null
  const matched = settings.find(item => item && typeof item === 'object' && !Array.isArray(item) && typeof item.card === 'string' && item.card.trim() === categoryName.trim())
  if (!matched) return null
  const orientation = typeof matched.orientation === 'string' ? matched.orientation.trim().toLowerCase() : ''
  return Object.assign({}, matched, {
    orientation: orientation === 'portrait' || orientation === '竖屏' ? 'portrait' : 'landscape',
    popup: matched.popup !== false
  })
})

hexo.extend.helper.register('catalog_card_meta', cardMeta)

hexo.extend.helper.register('catalog_portrait_data', function (article) {
  const source = article && typeof article === 'object' ? article : {}
  // 平台已在封面顶部显示；底部仅使用显式卡片标签，避免重复生成“电脑”等文章标签。
  const tags = cardMeta(source).tags
  return { tags, downloads: articleDownloads(source.content) }
})
