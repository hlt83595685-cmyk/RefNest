// RefNest — Zotero Connector interceptor
// Runs at document_start, patches fetch/XHR to mirror /connector/saveItems → RefNest
;(function () {
  'use strict'

  const ZOTERO_PORT = 23120
  const REFNEST_PORT = 23119
  const SAVE_ENDPOINT = '/connector/saveItems'

  // ── Zotero item → RefNest item format ──────────────────────────────────────

  const TYPE_MAP = {
    journalArticle:   'journalArticle',
    'journal-article':'journalArticle',
    book:             'book',
    bookSection:      'bookSection',
    conferencePaper:  'conferencePaper',
    thesis:           'thesis',
    report:           'report',
    webpage:          'webpage',
    preprint:         'preprint',
    manuscript:       'manuscript',
    patent:           'patent',
    newspaperArticle: 'newspaperArticle',
    magazineArticle:  'magazineArticle',
  }

  function parseDate(dateStr) {
    if (!dateStr) return null
    const m = String(dateStr).match(/\b(1[89]\d{2}|20\d{2})\b/)
    return m ? parseInt(m[1], 10) : null
  }

  function convertItem(z) {
    const authors = (z.creators ?? [])
      .filter(c => !c.creatorType || c.creatorType === 'author')
      .map(c => ({
        last_name:  c.lastName  ?? c.last_name  ?? (c.name ?? '').split(' ').pop() ?? '',
        first_name: c.firstName ?? c.first_name ?? null,
      }))
      .filter(a => a.last_name)

    // best attachment url: prefer PDF
    const pdfAtt = (z.attachments ?? []).find(a =>
      a.mimeType === 'application/pdf' || (a.url ?? '').match(/\.pdf(\?|$)/i))
    const pdf_url = pdfAtt?.url ?? null

    return {
      type:      TYPE_MAP[z.itemType] ?? z.itemType ?? 'journalArticle',
      title:     z.title ?? null,
      abstract:  z.abstractNote ?? z.abstract ?? null,
      year:      parseDate(z.date),
      doi:       z.DOI ?? z.doi ?? null,
      url:       z.url ?? null,
      journal:   z.publicationTitle ?? z.journalAbbreviation ?? null,
      publisher: z.publisher ?? null,
      volume:    z.volume ?? null,
      issue:     z.issue ?? null,
      pages:     z.pages ?? null,
      isbn:      (z.ISBN ?? z.isbn ?? null),
      language:  z.language ?? null,
      authors,
      pdf_url,
    }
  }

  // ── Mirror to RefNest ──────────────────────────────────────────────────────

  async function mirrorToRefNest(zoteroPayload) {
    try {
      const zItems = zoteroPayload?.items ?? []
      for (const z of zItems) {
        const item = convertItem(z)
        if (!item.title) continue
        await fetch(`http://127.0.0.1:${REFNEST_PORT}/save`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(item),
        })
      }
    } catch (e) {
      // RefNest not running — silent fail
    }
  }

  // ── Patch fetch ────────────────────────────────────────────────────────────

  const _origFetch = window.fetch
  window.fetch = async function (input, init) {
    const url = typeof input === 'string' ? input : input?.url ?? ''
    if (url.includes(`:${ZOTERO_PORT}`) && url.includes(SAVE_ENDPOINT)) {
      try {
        const bodyText = init?.body
        if (typeof bodyText === 'string') {
          mirrorToRefNest(JSON.parse(bodyText))
        }
      } catch { /* parse error — ignore */ }
    }
    return _origFetch.apply(this, arguments)
  }

  // ── Patch XMLHttpRequest ───────────────────────────────────────────────────

  const _origOpen = XMLHttpRequest.prototype.open
  const _origSend = XMLHttpRequest.prototype.send

  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this._refnestUrl = url ?? ''
    return _origOpen.apply(this, [method, url, ...rest])
  }

  XMLHttpRequest.prototype.send = function (body) {
    if (this._refnestUrl.includes(`:${ZOTERO_PORT}`) &&
        this._refnestUrl.includes(SAVE_ENDPOINT)) {
      try {
        if (typeof body === 'string') {
          mirrorToRefNest(JSON.parse(body))
        }
      } catch { /* ignore */ }
    }
    return _origSend.apply(this, arguments)
  }
})()
