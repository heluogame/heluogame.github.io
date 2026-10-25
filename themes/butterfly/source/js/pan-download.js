(() => {
  if (window.__postPanDownloadReady) return
  window.__postPanDownloadReady = true

  const penaltyKey = 'post-pan-captcha-penalty-v1'
  let modal = null
  let targetUrl = ''
  let answer = ''
  let returnFocus = null
  let pendingButton = null
  let requestVersion = 0
  let failCount = 0
  let lockedUntil = 0

  const readPenalty = () => {
    try {
      const saved = JSON.parse(window.sessionStorage.getItem(penaltyKey) || 'null')
      if (saved && typeof saved === 'object') {
        failCount = Number.isInteger(saved.failCount) && saved.failCount >= 0 && saved.failCount < 5 ? saved.failCount : 0
        lockedUntil = Number.isFinite(saved.lockedUntil) ? saved.lockedUntil : 0
      }
    } catch (error) {}
    if (lockedUntil <= Date.now()) lockedUntil = 0
  }

  const savePenalty = () => {
    try {
      window.sessionStorage.setItem(penaltyKey, JSON.stringify({ failCount, lockedUntil }))
    } catch (error) {}
  }

  const resetTarget = () => {
    targetUrl = ''
    answer = ''
    if (modal) {
      modal.querySelector('.post-pan-captcha__input').value = ''
      modal.querySelector('.post-pan-captcha__target').textContent = ''
      modal.querySelector('.post-pan-captcha__message').textContent = ''
      modal.querySelector('.post-pan-captcha__logo').removeAttribute('src')
    }
    const previous = returnFocus
    returnFocus = null
    if (previous && document.contains(previous)) previous.focus({ preventScroll: true })
  }

  const closeCaptcha = () => {
    if (modal && modal.open) modal.close()
    resetTarget()
  }

  const setMessage = value => {
    modal.querySelector('.post-pan-captcha__message').textContent = value
  }

  const drawCaptcha = () => {
    const canvas = modal.querySelector('.post-pan-captcha__canvas')
    const context = canvas.getContext('2d')
    if (!context) throw new Error('canvas unavailable')
    const width = 180
    const height = 56
    const dpr = Math.max(1, window.devicePixelRatio || 1)
    canvas.width = Math.round(width * dpr)
    canvas.height = Math.round(height * dpr)
    context.setTransform(dpr, 0, 0, dpr, 0, 0)
    context.fillStyle = '#edf8ff'
    context.fillRect(0, 0, width, height)
    for (let index = 0; index < 7; index++) {
      context.strokeStyle = `rgba(0, 122, 243, ${.16 + Math.random() * .24})`
      context.lineWidth = 1 + Math.random() * 1.4
      context.beginPath()
      context.moveTo(Math.random() * width, Math.random() * height)
      context.bezierCurveTo(Math.random() * width, Math.random() * height, Math.random() * width, Math.random() * height, Math.random() * width, Math.random() * height)
      context.stroke()
    }
    answer.split('').forEach((character, index) => {
      context.save()
      context.translate(23 + index * 27, 34 + Math.random() * 7 - 3.5)
      context.rotate((Math.random() * 20 - 10) * Math.PI / 180)
      context.font = '700 26px Arial, sans-serif'
      context.fillStyle = '#1765a4'
      context.fillText(character, 0, 0)
      context.restore()
    })
  }

  const refreshCaptcha = () => {
    const characters = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'
    const random = window.crypto.getRandomValues(new Uint8Array(5))
    answer = Array.from(random, value => characters[value % characters.length]).join('')
    modal.querySelector('.post-pan-captcha__input').value = ''
    drawCaptcha()
    readPenalty()
    setMessage(lockedUntil > Date.now() ? '尝试次数过多，请稍后再试' : '')
    if (modal.open) modal.querySelector('.post-pan-captcha__input').focus()
  }

  const verifyCaptcha = () => {
    if (!targetUrl) return
    readPenalty()
    if (lockedUntil > Date.now()) {
      setMessage('尝试次数过多，请稍后再试')
      return
    }
    const input = modal.querySelector('.post-pan-captcha__input')
    const value = input.value.trim().toUpperCase()
    if (!value) {
      setMessage('请先输入验证码')
      input.focus()
      return
    }
    if (value !== answer) {
      failCount += 1
      if (failCount >= 5) {
        failCount = 0
        lockedUntil = Date.now() + 15000
      }
      savePenalty()
      try {
        refreshCaptcha()
        setMessage(lockedUntil > Date.now() ? '尝试次数过多，请稍后再试' : '验证码不对，请重试')
      } catch (error) {
        showFailure(returnFocus, '当前浏览器无法显示验证码，请更换浏览器后重试。')
      }
      return
    }
    failCount = 0
    lockedUntil = 0
    savePenalty()
    const url = targetUrl
    closeCaptcha()
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  const ensureModal = () => {
    if (modal) return modal
    modal = document.createElement('dialog')
    modal.className = 'post-pan-captcha'
    modal.setAttribute('aria-labelledby', 'post-pan-captcha-title')
    modal.setAttribute('aria-describedby', 'post-pan-captcha-description')
    modal.innerHTML = `
      <form class="post-pan-captcha__panel">
        <button class="post-pan-captcha__close" type="button" data-pan-captcha-close aria-label="关闭下载验证">&times;</button>
        <div class="post-pan-captcha__heading">
          <span class="post-pan-captcha__icon"><img class="post-pan-captcha__logo" alt="" hidden><i class="fa-solid fa-download" aria-hidden="true"></i></span>
          <div><h3 id="post-pan-captcha-title">下载验证</h3><p id="post-pan-captcha-description">请输入图形验证码后继续访问网盘</p></div>
        </div>
        <div class="post-pan-captcha__target"></div>
        <div class="post-pan-captcha__verification">
          <div class="post-pan-captcha__code">
            <canvas class="post-pan-captcha__canvas" width="180" height="56" role="img" aria-label="五位图形验证码"></canvas>
            <button class="post-pan-captcha__refresh" type="button">换一张</button>
          </div>
          <label class="post-pan-captcha__label" for="post-pan-captcha-input">输入验证码</label>
          <input id="post-pan-captcha-input" class="post-pan-captcha__input" type="text" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="5" aria-describedby="post-pan-captcha-message" placeholder="输入验证码">
          <div id="post-pan-captcha-message" class="post-pan-captcha__message" role="status" aria-live="polite"></div>
        </div>
        <p class="post-pan-captcha__error" role="alert" hidden></p>
        <div class="post-pan-captcha__actions">
          <button class="post-pan-captcha__button is-ghost" type="button" data-pan-captcha-close>取消</button>
          <button class="post-pan-captcha__button is-primary" type="submit">继续访问</button>
        </div>
      </form>`
    document.body.appendChild(modal)
    modal.addEventListener('submit', event => {
      event.preventDefault()
      verifyCaptcha()
    })
    modal.addEventListener('click', event => {
      const target = event.target
      if (target.closest && target.closest('[data-pan-captcha-close]')) closeCaptcha()
      else if (target === modal) {
        const rect = modal.getBoundingClientRect()
        if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) closeCaptcha()
      }
    })
    modal.querySelector('.post-pan-captcha__refresh').addEventListener('click', () => {
      try {
        refreshCaptcha()
      } catch (error) {
        showFailure(returnFocus, '当前浏览器无法显示验证码，请更换浏览器后重试。')
      }
    })
    modal.addEventListener('cancel', event => {
      event.preventDefault()
      event.stopPropagation()
      closeCaptcha()
    })
    modal.addEventListener('close', () => {
      if (!modal.open) resetTarget()
    })
    return modal
  }

  const setIdentity = button => {
    returnFocus = button
    const label = button.querySelector('.post-pan-download__name')
    const name = label && label.textContent.trim() ? label.textContent.trim() : '网盘下载'
    modal.querySelector('.post-pan-captcha__target').textContent = name
    const logo = modal.querySelector('.post-pan-captcha__logo')
    const fallback = modal.querySelector('.post-pan-captcha__icon i')
    const source = button.querySelector('img')
    logo.removeAttribute('src')
    logo.hidden = true
    fallback.hidden = false
    try {
      const imageSource = source && (source.currentSrc || source.getAttribute('src'))
      const url = imageSource ? new URL(imageSource, window.location.href) : null
      if (url && url.origin === window.location.origin && /^https?:$/.test(url.protocol)) {
        logo.src = url.href
        logo.alt = name
        logo.hidden = false
        fallback.hidden = true
      }
    } catch (error) {}
  }

  const showFailure = (button, message) => {
    ensureModal()
    targetUrl = ''
    answer = ''
    if (button) setIdentity(button)
    modal.dataset.mode = 'error'
    modal.querySelector('#post-pan-captcha-title').textContent = '暂时无法下载'
    modal.querySelector('#post-pan-captcha-description').textContent = '请关闭提示后重试'
    modal.querySelector('.post-pan-captcha__verification').hidden = true
    modal.querySelector('.post-pan-captcha__button.is-primary').hidden = true
    modal.querySelector('.post-pan-captcha__button.is-ghost').textContent = '关闭'
    const error = modal.querySelector('.post-pan-captcha__error')
    error.textContent = message
    error.hidden = false
    if (typeof modal.showModal === 'function') {
      if (!modal.open) modal.showModal()
      modal.querySelector('.post-pan-captcha__close').focus()
    } else if (button) {
      let notice = button.parentNode.querySelector('.post-pan-captcha__fallback')
      if (!notice) {
        notice = document.createElement('span')
        notice.className = 'post-pan-captcha__fallback'
        notice.setAttribute('role', 'status')
        button.parentNode.appendChild(notice)
      }
      notice.textContent = message
    }
  }

  const openCaptcha = (button, url) => {
    ensureModal()
    if (typeof modal.showModal !== 'function') {
      showFailure(button, '当前浏览器不支持下载验证窗口，请更换浏览器后重试。')
      return
    }
    setIdentity(button)
    targetUrl = url
    modal.dataset.mode = 'verify'
    modal.querySelector('#post-pan-captcha-title').textContent = '下载验证'
    modal.querySelector('#post-pan-captcha-description').textContent = '请输入图形验证码后继续访问网盘'
    modal.querySelector('.post-pan-captcha__verification').hidden = false
    modal.querySelector('.post-pan-captcha__button.is-primary').hidden = false
    modal.querySelector('.post-pan-captcha__button.is-ghost').textContent = '取消'
    modal.querySelector('.post-pan-captcha__error').hidden = true
    try {
      refreshCaptcha()
    } catch (error) {
      showFailure(button, '当前浏览器无法显示验证码，请更换浏览器后重试。')
      return
    }
    if (!modal.open) modal.showModal()
    modal.querySelector('.post-pan-captcha__input').focus()
  }

  const bytesFromBase64 = value => {
    const binary = window.atob(value || '')
    return Uint8Array.from(binary, character => character.charCodeAt(0))
  }

  const decryptTarget = async button => {
    const crypto = window.crypto
    if (!crypto || !crypto.subtle || typeof TextDecoder === 'undefined') throw new Error('unsupported crypto')
    const ciphertext = bytesFromBase64(button.getAttribute('data-pan-p'))
    const iv = bytesFromBase64(button.getAttribute('data-pan-s'))
    const rawKey = bytesFromBase64(button.getAttribute('data-pan-k'))
    if (iv.length !== 12 || rawKey.length !== 32 || ciphertext.length <= 16) throw new Error('invalid data')
    const key = await crypto.subtle.importKey('raw', rawKey, { name: 'AES-GCM' }, false, ['decrypt'])
    const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv, tagLength: 128 }, key, ciphertext)
    const url = new TextDecoder('utf-8', { fatal: true }).decode(plaintext).trim()
    const parsed = new URL(url)
    if (!/^https?:$/.test(parsed.protocol) || !parsed.hostname) throw new Error('invalid URL')
    return url
  }

  document.addEventListener('click', async event => {
    const target = event.target
    const button = target && target.closest ? target.closest('button.post-pan-download__item[data-pan-p]') : null
    if (!button) return
    event.preventDefault()
    if (pendingButton || button.disabled || (modal && modal.open)) return
    pendingButton = button
    const version = ++requestVersion
    const previousBusy = button.getAttribute('aria-busy')
    const wasBusy = button.classList.contains('is-busy')
    button.disabled = true
    button.setAttribute('aria-busy', 'true')
    button.classList.add('is-busy')
    const hostDialog = button.closest('dialog.game-quickview')
    try {
      const url = await decryptTarget(button)
      if (version === requestVersion && document.contains(button) && (!hostDialog || hostDialog.open)) openCaptcha(button, url)
    } catch (error) {
      if (version === requestVersion && document.contains(button) && (!hostDialog || hostDialog.open)) {
        showFailure(button, error.message === 'unsupported crypto'
          ? '当前浏览器不支持安全解密，请更换现代浏览器后重试。'
          : '下载信息无法验证，请刷新页面后重试。')
      }
    } finally {
      if (pendingButton === button) pendingButton = null
      button.disabled = false
      if (previousBusy === null) button.removeAttribute('aria-busy')
      else button.setAttribute('aria-busy', previousBusy)
      if (!wasBusy) button.classList.remove('is-busy')
    }
  })

  document.addEventListener('pjax:send', () => {
    requestVersion += 1
    closeCaptcha()
  })
})()
