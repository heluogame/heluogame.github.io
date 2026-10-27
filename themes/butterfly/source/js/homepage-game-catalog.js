(function () {
  if (window.__homepageGameCatalogReady) return
  window.__homepageGameCatalogReady = true

  var articleCache = new Map()
  var activeRequest = null
  var returnFocus = null

  function getDialog () {
    return document.getElementById('game-quickview')
  }

  function query (dialog, selector) {
    return dialog ? dialog.querySelector(selector) : null
  }

  function setText (dialog, selector, value) {
    var element = query(dialog, selector)
    if (element) element.textContent = value || '--'
  }

  function setReviewText (dialog, value) {
    var box = query(dialog, '[data-game-quickview-review]')
    if (!box) return
    box.classList.remove('is-markdown')
    box.replaceChildren()
    box.textContent = value
  }

  function isReviewReference (value) {
    return /^#[^\r\n]+$/.test(String(value || '').trim())
  }

  function decodeReviewTarget (value) {
    try {
      return decodeURIComponent(value).trim()
    } catch (error) {
      return value.trim()
    }
  }

  function headingText (heading) {
    var clone = heading.cloneNode(true)
    clone.querySelectorAll('.headerlink, [hidden], [aria-hidden="true"], script, style').forEach(function (node) {
      node.remove()
    })
    return clone.textContent.replace(/\s+/g, ' ').trim()
  }

  function safeReviewUrl (value, isLink) {
    var compact = String(value || '').replace(/[\u0000-\u0020\u007f-\u009f]/g, '')
    if (!compact) return false
    if (compact.charAt(0) === '#') return isLink
    if (!isLink && /^(?:blob:|data:image\/(?:png|gif|jpe?g|webp|avif|bmp);)/i.test(compact)) return true
    try {
      var protocol = new URL(compact, window.location.href).protocol
      return /^https?:$/.test(protocol) || (isLink && /^(?:mailto|tel):$/.test(protocol))
    } catch (error) {
      return false
    }
  }

  function sanitizeReviewFragment (fragment) {
    fragment.querySelectorAll('script, style, link, iframe, object, embed, base, meta, template, svg, math, input, textarea, select').forEach(function (node) {
      node.remove()
    })
    fragment.querySelectorAll('form').forEach(function (form) {
      form.replaceWith.apply(form, Array.from(form.childNodes))
    })
    fragment.querySelectorAll('*').forEach(function (element) {
      Array.from(element.attributes).forEach(function (attribute) {
        var name = attribute.name.toLowerCase()
        if (/^on/.test(name) || /^(?:style|srcdoc|srcset|autofocus|form|action|formaction)$/.test(name)) {
          element.removeAttribute(attribute.name)
        } else if (/^(?:href|src|poster|xlink:href|background|cite)$/.test(name) && !safeReviewUrl(attribute.value, name === 'href' && element.tagName === 'A')) {
          element.removeAttribute(attribute.name)
        }
      })
      if (element.tagName === 'BUTTON') element.setAttribute('type', 'button')
      if (element.tagName === 'A' && element.getAttribute('target') === '_blank') {
        element.setAttribute('rel', ((element.getAttribute('rel') || '') + ' noopener noreferrer').trim())
      }
    })
  }

  function hasReviewContent (root) {
    return Boolean(root.textContent.replace(/\u00a0/g, ' ').trim() || root.querySelector('img[src], video, audio, pre, code, table, hr'))
  }

  function renderReviewReference (dialog, value, article, pageUrl) {
    if (!isReviewReference(value)) return
    var target = decodeReviewTarget(value.trim().slice(1))
    if (!target) {
      setReviewText(dialog, '请在 # 后填写要引用的正文标题。')
      return
    }
    var headings = Array.from(article.querySelectorAll('h1, h2, h3, h4, h5, h6'))
    var heading = headings.find(function (node) {
      return node.id && decodeReviewTarget(node.id) === target
    }) || headings.find(function (node) {
      return headingText(node) === target.replace(/\s+/g, ' ')
    })
    if (!heading) {
      setReviewText(dialog, '未找到正文标题“' + target + '”，请检查引用名称。')
      return
    }
    var level = Number(heading.tagName.slice(1))
    var nextHeading = headings.slice(headings.indexOf(heading) + 1).find(function (node) {
      return Number(node.tagName.slice(1)) <= level
    })
    var range = article.ownerDocument.createRange()
    range.selectNodeContents(article)
    range.setStartAfter(heading)
    if (nextHeading) range.setEndBefore(nextHeading)
    var fragment = prepareArticle(range.cloneContents(), pageUrl)
    sanitizeReviewFragment(fragment)
    Array.from(fragment.querySelectorAll('div, section, article, main, header, footer, aside, nav, span, p, ul, ol, li, blockquote, figure, figcaption')).reverse().forEach(function (node) {
      if (!hasReviewContent(node)) node.remove()
    })
    if (!hasReviewContent(fragment)) {
      setReviewText(dialog, '正文标题“' + target + '”下暂无内容。')
      return
    }
    var box = query(dialog, '[data-game-quickview-review]')
    if (!box) return
    box.replaceChildren(fragment)
    box.classList.add('is-markdown')
  }

  function readCardTags (card) {
    try {
      var tags = JSON.parse(card.dataset.gameTags || '[]')
      if (!Array.isArray(tags)) return []
      return tags.map(function (tag) {
        return String(tag || '').trim()
      }).filter(function (tag, index, list) {
        return tag && list.indexOf(tag) === index
      }).slice(0, 8)
    } catch (error) {
      return []
    }
  }

  function setQuickviewTab (dialog, tabName) {
    var isReview = tabName === 'review'
    dialog.querySelectorAll('[data-game-quickview-tab]').forEach(function (tab) {
      var active = tab.dataset.gameQuickviewTab === tabName
      tab.classList.toggle('is-active', active)
      tab.setAttribute('aria-selected', active ? 'true' : 'false')
    })
    var article = query(dialog, '[data-game-quickview-article]')
    var review = query(dialog, '[data-game-quickview-review-panel]')
    if (article) article.hidden = isReview
    if (review) review.hidden = !isReview
  }

  function renderChips (dialog, chips) {
    var box = query(dialog, '[data-game-quickview-chips]')
    if (!box) return
    box.replaceChildren()
    box.hidden = !chips.length
    chips.forEach(function (label) {
      var chip = document.createElement('span')
      chip.textContent = label
      box.appendChild(chip)
    })
  }

  function setImage (element, source, alt) {
    if (!element) return
    element.src = source || ''
    element.alt = alt || ''
  }

  function resolveUrl (value, pageUrl) {
    if (!value || /^(data:|blob:|javascript:|#)/i.test(value)) return value
    try {
      return new URL(value, pageUrl).href
    } catch (error) {
      return value
    }
  }

  function importPageStyles (scope, pageUrl) {
    scope.querySelectorAll('link[rel="stylesheet"][href]').forEach(function (link) {
      var href = resolveUrl(link.getAttribute('href'), pageUrl)
      var isLoaded = Array.from(document.querySelectorAll('link[rel="stylesheet"][href]')).some(function (existing) {
        return existing.href === href
      })
      if (!href || isLoaded) return
      var style = document.createElement('link')
      style.rel = 'stylesheet'
      style.href = href
      style.dataset.gameQuickviewStyle = href
      document.head.appendChild(style)
    })

    // Older posts include their download dialog CSS beside the download button.
    scope.querySelectorAll('style').forEach(function (inlineStyle) {
      var css = inlineStyle.textContent || ''
      if (!/\.download-button-wrap\b|\.download-password-dialog\b/.test(css)) return
      css = css.replace(/#article-container\b/g, '.game-quickview__article')
      var isLoaded = Array.from(document.head.querySelectorAll('style[data-game-quickview-inline-style]')).some(function (existing) {
        return existing.textContent === css
      })
      if (isLoaded) return
      var style = document.createElement('style')
      style.dataset.gameQuickviewInlineStyle = 'download'
      style.textContent = css
      document.head.appendChild(style)
    })
  }

  function findDownloadTarget (article) {
    if (!article) return null
    var button = article.querySelector('.download-button-trigger, .download-button-wrap, [class*="pan-download"]')
    if (button) return button
    return Array.from(article.querySelectorAll('h1, h2, h3, h4')).find(function (heading) {
      return /^(get\s+resource|资源下载|获取资源|下载地址|下载链接)$/i.test(heading.textContent.trim())
    }) || null
  }

  function prepareArticle (article, pageUrl) {
    var clone = article.cloneNode(true)

    clone.querySelectorAll('script, style, link[rel="stylesheet"]').forEach(function (element) {
      element.remove()
    })

    clone.querySelectorAll('img').forEach(function (image) {
      var source = image.getAttribute('data-lazy-src') || image.getAttribute('src')
      if (!source) {
        var emptyLink = image.closest('a')
        var emptyParagraph = image.closest('p')
        if (emptyLink && !emptyLink.getAttribute('href')) emptyLink.remove()
        if (emptyParagraph && !emptyParagraph.textContent.trim() && !emptyParagraph.querySelector('img[src]')) emptyParagraph.remove()
        return
      }
      image.src = resolveUrl(source, pageUrl)
      image.removeAttribute('data-lazy-src')
      image.loading = 'lazy'
      image.decoding = 'async'
    })

    clone.querySelectorAll('a[href]').forEach(function (link) {
      link.href = resolveUrl(link.getAttribute('href'), pageUrl)
    })

    return clone
  }

  async function fetchArticle (pageUrl, signal) {
    if (articleCache.has(pageUrl)) return articleCache.get(pageUrl).cloneNode(true)

    var response = await fetch(pageUrl, {
      credentials: 'same-origin',
      signal: signal,
      headers: { 'X-Requested-With': 'game-quickview' }
    })
    if (!response.ok) throw new Error('HTTP ' + response.status)

    var html = await response.text()
    var doc = new DOMParser().parseFromString(html, 'text/html')
    var sourceArticle = doc.querySelector('#article-container')
    if (!sourceArticle) throw new Error('未找到文章正文')

    importPageStyles(sourceArticle, pageUrl)
    var prepared = prepareArticle(sourceArticle, pageUrl)
    articleCache.set(pageUrl, prepared.cloneNode(true))
    return prepared
  }

  function openNativeDialog (dialog) {
    if (dialog.showModal && !dialog.open) dialog.showModal()
    else dialog.setAttribute('open', '')
  }

  function closeQuickview (dialog) {
    if (!dialog) return
    if (activeRequest) {
      activeRequest.abort()
      activeRequest = null
    }
    if (dialog.open && dialog.close) dialog.close()
    else dialog.removeAttribute('open')
    document.body.classList.remove('game-quickview-open')
    if (returnFocus && document.contains(returnFocus)) returnFocus.focus({ preventScroll: true })
    returnFocus = null
  }

  function fillInitialState (dialog, card, pageUrl) {
    var popupConfig = {
      icon: 'fa-solid fa-gamepad',
      date_icon: 'fa-regular fa-calendar',
      platform_icon: 'fa-solid fa-desktop',
      status_icon: 'fa-regular fa-circle-check',
      size_icon: 'fa-solid fa-box-archive',
      title: '游戏详情',
      detail: '详情',
      review: '游戏评价'
    }
    var defaultConfig = Object.assign({}, popupConfig)
    try {
      var config = JSON.parse(card.dataset.quickviewConfig || '{}')
      if (config && typeof config === 'object' && !Array.isArray(config)) {
        Object.keys(popupConfig).forEach(function (key) {
          if (typeof config[key] === 'string' && config[key].trim()) popupConfig[key] = config[key].trim()
        })
      }
    } catch (error) {}

    var iconTargets = { icon: 'type', date_icon: 'date', platform_icon: 'platform', status_icon: 'status', size_icon: 'size' }
    Object.keys(iconTargets).forEach(function (key) {
      var icon = query(dialog, '[data-game-quickview-' + iconTargets[key] + '-icon]')
      var iconTokens = popupConfig[key].split(/\s+/).filter(function (token) {
        return /^(?:fas|far|fab|fa-solid|fa-regular|fa-brands|fa-[a-z0-9]+(?:-[a-z0-9]+)*)$/.test(token)
      }).slice(0, 3)
      if (icon) icon.className = iconTokens.join(' ') || defaultConfig[key]
    })
    setText(dialog, '[data-game-quickview-type-title]', popupConfig.title)
    setText(dialog, '[data-game-quickview-tab="details"]', popupConfig.detail)
    setText(dialog, '[data-game-quickview-tab="review"]', popupConfig.review)
    setText(dialog, '[data-game-quickview-loading-text]', '正在载入' + popupConfig.title)
    var closeButton = query(dialog, '[data-game-quickview-close]')
    if (closeButton) closeButton.setAttribute('aria-label', '关闭' + popupConfig.title)

    var titleLink = query(card, '.article-title')
    var title = card.dataset.gameTitle || (titleLink ? titleLink.textContent.trim() : '游戏详情')
    var cover = card.dataset.gameCover || ''
    var cardImage = query(card, '.post_cover img')
    var date = query(card, '.post-meta-date-created time, .post-meta-date time, time')
    var review = card.dataset.gameReview || ''

    if (!cover && cardImage) cover = cardImage.currentSrc || cardImage.src
    setText(dialog, '[data-game-quickview-title]', title)
    setText(dialog, '[data-game-quickview-date]', date ? date.textContent.trim() : '--')
    setText(dialog, '[data-game-quickview-platform]', card.dataset.gamePlatforms || '未填写')
    setText(dialog, '[data-game-quickview-status]', card.dataset.gameStatus || '未填写')
    setText(dialog, '[data-game-quickview-size]', card.dataset.gameSize || '未填写')
    renderChips(dialog, readCardTags(card))
    setReviewText(dialog, isReviewReference(review) ? '正在载入引用内容…' : review.trim() || '暂无评价内容')
    setQuickviewTab(dialog, 'details')
    setImage(query(dialog, '[data-game-quickview-cover]'), cover, title)
    setImage(query(dialog, '[data-game-quickview-thumb]'), cover, title)

    dialog.querySelectorAll('[data-game-quickview-page-link]').forEach(function (link) {
      link.href = pageUrl
    })
    return review
  }

  async function openQuickview (card, sourceLink) {
    var dialog = getDialog()
    if (!dialog) return

    var pageUrl = new URL(card.dataset.gameUrl || sourceLink.href, window.location.href).href
    var loading = query(dialog, '[data-game-quickview-loading]')
    var body = query(dialog, '[data-game-quickview-body]')
    var articleBox = query(dialog, '[data-game-quickview-article]')
    var downloadButton = query(dialog, '[data-game-quickview-download]')

    returnFocus = sourceLink
    if (activeRequest) activeRequest.abort()
    var request = new AbortController()
    activeRequest = request

    var review = fillInitialState(dialog, card, pageUrl)
    if (articleBox) articleBox.replaceChildren()
    if (downloadButton) downloadButton.hidden = true
    if (loading) loading.hidden = false
    if (body) body.hidden = true
    openNativeDialog(dialog)
    document.body.classList.add('game-quickview-open')

    try {
      var article = await fetchArticle(pageUrl, request.signal)
      if (activeRequest !== request) return
      renderReviewReference(dialog, review, article, pageUrl)
      if (articleBox) articleBox.replaceChildren.apply(articleBox, Array.from(article.childNodes))
      var downloadTarget = findDownloadTarget(articleBox)
      if (downloadButton) downloadButton.hidden = !downloadTarget
      if (loading) loading.hidden = true
      if (body) body.hidden = false
      var main = query(dialog, '.game-quickview__main')
      var summary = query(dialog, '.game-quickview__summary')
      if (main) main.scrollTop = 0
      if (summary) summary.scrollTop = 0
    } catch (error) {
      if (error.name === 'AbortError' || activeRequest !== request) return
      if (isReviewReference(review)) setReviewText(dialog, '引用内容暂时无法载入，请打开完整文章查看。')
      if (loading) loading.hidden = true
      if (body) body.hidden = false
      if (articleBox) {
        articleBox.innerHTML = '<div class="game-quickview__error"><p>详情暂时没有载入成功，请打开独立文章查看。</p></div>'
      }
    } finally {
      if (activeRequest === request) activeRequest = null
    }
  }

  document.addEventListener('click', function (event) {
    var target = event.target
    if (!target || !target.closest) return

    var closeButton = target.closest('[data-game-quickview-close]')
    if (closeButton) {
      event.preventDefault()
      closeQuickview(closeButton.closest('.game-quickview'))
      return
    }

    var tab = target.closest('[data-game-quickview-tab]')
    if (tab) {
      event.preventDefault()
      setQuickviewTab(tab.closest('.game-quickview'), tab.dataset.gameQuickviewTab)
      return
    }

    var downloadButton = target.closest('[data-game-quickview-download]')
    if (downloadButton) {
      var dialog = downloadButton.closest('.game-quickview')
      var downloadTarget = findDownloadTarget(query(dialog, '[data-game-quickview-article]'))
      if (downloadTarget) {
        setQuickviewTab(dialog, 'details')
        downloadTarget.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
      return
    }

    var link = target.closest('.home-section-grid .home-section-card.has-game-quickview a[href]')
    if (!link) return
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || link.target === '_blank') return

    var card = link.closest('.home-section-card.has-game-quickview')
    if (!card) return
    event.preventDefault()
    event.stopImmediatePropagation()
    openQuickview(card, link)
  }, true)

  document.addEventListener('click', function (event) {
    if (!event.target.matches || !event.target.matches('dialog.game-quickview')) return
    var dialog = event.target
    var rect = dialog.getBoundingClientRect()
    var inside = event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom
    if (!inside) closeQuickview(dialog)
  })

  document.addEventListener('cancel', function (event) {
    if (!event.target.classList || !event.target.classList.contains('game-quickview')) return
    event.preventDefault()
    closeQuickview(event.target)
  }, true)

  document.addEventListener('pjax:send', function () {
    closeQuickview(getDialog())
  })
})()
