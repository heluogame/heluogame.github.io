'use strict'

const { escapeHTML, url_for } = require('hexo-util')
const crypto = require('node:crypto')
const urlFor = url_for.bind(hexo)
const downloadTypes = {
  baidu: { label: '百度网盘', image: '/img/download/baidu.png' },
  uc: { label: 'UC网盘', image: '/img/download/uc.png' },
  xunlei: { label: '迅雷网盘', image: '/img/download/xunlei.png' },
  quark: { label: '夸克网盘', image: '/img/download/quark.png' }
}

// Static-site protection: hide plain URLs from HTML; browser-held keys are not access control.
function encryptDownloadUrl (url) {
  const key = crypto.randomBytes(32)
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const payload = Buffer.concat([cipher.update(url, 'utf8'), cipher.final(), cipher.getAuthTag()])
  return { payload: payload.toString('base64'), iv: iv.toString('base64'), key: key.toString('base64') }
}

function isHttpUrl (value) {
  if (!/^https?:\/\//i.test(value)) return false
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch (error) {
    return false
  }
}

function panDownload (args, content) {
  const links = []
  const textLines = []

  String(content || '').split(/\r?\n/).forEach(line => {
    const match = line.trim().match(/^([^:：]+)[:：]\s*(.*)$/)
    const key = match ? match[1].trim().toLowerCase() : ''
    if (match && Object.prototype.hasOwnProperty.call(downloadTypes, key)) {
      const value = match[2].trim()
      if ((!value || isHttpUrl(value)) && !links.some(link => link.type === key)) links.push({ type: key, url: value })
    } else {
      textLines.push(line)
    }
  })

  const buttons = links.map(link => {
    const type = downloadTypes[link.type]
    const icon = `<img src="${escapeHTML(urlFor(type.image))}" alt="" loading="lazy">`
    if (!link.url) {
      return `<button type="button" class="post-pan-download__item is-${link.type} is-unavailable" disabled aria-disabled="true" title="下载链接待补充"><span class="post-pan-download__mark">${icon}</span><span class="post-pan-download__name">${type.label}</span></button>`
    }
    const encrypted = encryptDownloadUrl(link.url)
    return `<button type="button" class="post-pan-download__item is-${link.type}" data-pan-p="${escapeHTML(encrypted.payload)}" data-pan-s="${escapeHTML(encrypted.iv)}" data-pan-k="${escapeHTML(encrypted.key)}" aria-haspopup="dialog"><span class="post-pan-download__mark">${icon}</span><span class="post-pan-download__name">${type.label}</span></button>`
  }).join('')
  const body = buttons
    ? `<div class="post-pan-download__body"><span class="post-pan-download__icon" aria-hidden="true"><i class="fa-solid fa-download"></i></span><div class="post-pan-download__links">${buttons}</div></div>`
    : ''
  const text = textLines.join('\n').trim()
  const plainText = text ? `<p>${escapeHTML(text).replace(/\n/g, '<br>')}</p>` : ''

  return body
    ? `<blockquote class="post-pan-download-quote"><div class="post-pan-download">${body}${plainText}</div></blockquote>`
    : plainText
}

hexo.extend.tag.register('panDownload', panDownload, { ends: true })
