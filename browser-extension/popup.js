// RefNest Connector — popup script
;(async () => {
  'use strict'

  const body        = document.getElementById('mainBody')
  const statusDot   = document.getElementById('statusDot')
  const statusLabel = document.getElementById('statusLabel')

  // ── Helpers ────────────────────────────────────────────────────────────────

  function msg(type, payload = {}) {
    return new Promise((resolve) =>
      chrome.runtime.sendMessage({ type, ...payload }, resolve)
    )
  }

  function el(tag, props = {}, ...children) {
    const e = document.createElement(tag)
    Object.assign(e, props)
    for (const c of children) {
      if (typeof c === 'string') e.appendChild(document.createTextNode(c))
      else if (c) e.appendChild(c)
    }
    return e
  }

  function row(label, value, cls = '') {
    if (!value) return null
    const r = document.createElement('div')
    r.className = 'meta-row'
    r.innerHTML = `<span class="meta-label">${label}</span>
                   <span class="meta-value ${cls}">${escHtml(String(value))}</span>`
    return r
  }

  function escHtml(s) {
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
  }

  // ── Check RefNest is running ───────────────────────────────────────────────

  const pingResp = await msg('PING')
  const online   = pingResp?.online ?? false

  if (online) {
    statusDot.className   = 'status-dot online'
    statusLabel.textContent = 'RefNest 已连接'
  } else {
    statusDot.className   = 'status-dot offline'
    statusLabel.textContent = 'RefNest 未运行'
    body.innerHTML = `
      <div class="empty-state">
        <span class="icon">⚠️</span>
        <p>请先启动 RefNest 桌面应用</p>
        <p style="font-size:11px;margin-top:6px;color:#aeaeb2">端口 127.0.0.1:23119</p>
      </div>`
    return
  }

  // ── Extract metadata from page ─────────────────────────────────────────────

  const extractResp = await msg('EXTRACT_FROM_TAB')
  let meta = extractResp?.data ?? null

  // If DOI found, enrich via CrossRef through RefNest server
  if (meta?.doi) {
    const lookup = await msg('LOOKUP_DOI', { doi: meta.doi })
    if (lookup?.metadata) {
      const cr = lookup.metadata
      const dateObj =
        cr.published?.['date-parts'] ??
        cr['published-print']?.['date-parts'] ??
        cr['published-online']?.['date-parts']
      meta = {
        ...meta,
        title:     cr.title?.[0] ?? meta.title,
        abstract:  cr.abstract?.replace(/<[^>]+>/g,'').trim() ?? meta.abstract,
        year:      dateObj?.[0]?.[0] ?? meta.year,
        journal:   cr['container-title']?.[0] ?? meta.journal,
        publisher: cr.publisher ?? meta.publisher,
        volume:    cr.volume ?? meta.volume,
        issue:     cr.issue ?? meta.issue,
        pages:     cr.page ?? meta.pages,
        doi:       cr.DOI ?? meta.doi,
        authors:   (cr.author ?? []).filter(a => a.family).map(a => ({
          last_name: a.family, first_name: a.given ?? null,
        })),
        source:    'crossref',
      }
    }
  }

  // ── Load collections ───────────────────────────────────────────────────────

  const colResp     = await msg('GET_COLLECTIONS')
  const collections = colResp?.collections ?? []

  // ── Render UI ──────────────────────────────────────────────────────────────

  if (!meta || !meta.title) {
    body.innerHTML = `
      <div class="empty-state">
        <span class="icon">📄</span>
        <p>未能识别该页面的文献信息</p>
        <p style="font-size:11px;margin-top:6px;color:#aeaeb2">
          支持：Google Scholar · PubMed · arXiv · Springer · Nature 等
        </p>
      </div>`
    return
  }

  // Metadata card
  const card = document.createElement('div')
  card.className = 'card'

  const titleDiv = document.createElement('div')
  titleDiv.className = 'meta-title'
  titleDiv.textContent = meta.title
  card.appendChild(titleDiv)

  const rows = document.createElement('div')
  rows.className = 'meta-rows'

  const typeMap = {
    journalArticle: '期刊论文', book: '书籍', thesis: '学位论文',
    conferencePaper: '会议论文', preprint: '预印本', report: '报告',
    bookSection: '书章节', webpage: '网页',
  }
  ;[
    row('类型', typeMap[meta.type] ?? meta.type),
    row('年份', meta.year),
    row('期刊', meta.journal),
    row('卷期', [meta.volume, meta.issue].filter(Boolean).join(' / ') || null),
    row('页码', meta.pages),
    row('DOI',  meta.doi, 'doi'),
  ].filter(Boolean).forEach((r) => rows.appendChild(r))
  card.appendChild(rows)

  if (meta.authors?.length) {
    const authorDiv = document.createElement('div')
    authorDiv.className = 'authors'
    authorDiv.textContent = meta.authors.slice(0, 5)
      .map(a => [a.first_name, a.last_name].filter(Boolean).join(' '))
      .join('; ') + (meta.authors.length > 5 ? ` 等 ${meta.authors.length} 人` : '')
    card.appendChild(authorDiv)
  }

  body.innerHTML = ''
  body.appendChild(card)

  // Collection picker
  if (collections.length > 0) {
    const colWrap = document.createElement('div')
    const colLabel = document.createElement('p')
    colLabel.className = 'section-label'
    colLabel.textContent = '保存到分类'
    const colSelect = document.createElement('select')
    colSelect.id = 'colSelect'
    colSelect.innerHTML = `<option value="">📚 全部文献（默认）</option>` +
      collections.map(c => `<option value="${c.id}">📁 ${escHtml(c.name)}</option>`).join('')
    colWrap.appendChild(colLabel)
    colWrap.appendChild(colSelect)
    body.appendChild(colWrap)
  }

  // Error area
  const errDiv = document.createElement('div')
  errDiv.className = 'error-msg'
  errDiv.style.display = 'none'
  body.appendChild(errDiv)

  // Save button
  const saveBtn = document.createElement('button')
  saveBtn.className = 'btn btn-primary'
  saveBtn.textContent = '保存到 RefNest'
  body.appendChild(saveBtn)

  // ── Save handler ───────────────────────────────────────────────────────────

  saveBtn.addEventListener('click', async () => {
    saveBtn.disabled = true
    saveBtn.innerHTML = '<span class="spinner"></span>保存中...'
    errDiv.style.display = 'none'

    const collectionId = document.getElementById('colSelect')?.value
      ? parseInt(document.getElementById('colSelect').value, 10)
      : null

    const resp = await msg('SAVE_ITEM', {
      payload: {
        type:       meta.type,
        title:      meta.title,
        abstract:   meta.abstract,
        year:       meta.year,
        doi:        meta.doi,
        url:        meta.page_url ?? meta.url,
        journal:    meta.journal,
        publisher:  meta.publisher,
        volume:     meta.volume,
        issue:      meta.issue,
        pages:      meta.pages,
        authors:    meta.authors ?? [],
        pdf_url:    meta.pdf_url ?? null,
        collectionId,
      }
    })

    if (resp?.success) {
      body.innerHTML = `
        <div class="success-state">
          <span class="icon">✅</span>
          <p>已成功保存到 RefNest</p>
          <p style="font-size:12px;font-weight:400;color:#34c759;margin-top:4px">
            ${escHtml(meta.title?.slice(0, 60) ?? '')}
          </p>
        </div>`
    } else {
      saveBtn.disabled = false
      saveBtn.textContent = '保存到 RefNest'
      errDiv.textContent = resp?.error ?? '保存失败，请重试'
      errDiv.style.display = 'block'
    }
  })
})()
