// RefNest Connector — content script
// Extracts metadata from the current page and sends it to the background worker

;(function () {
  'use strict'

  // ── Utility ─────────────────────────────────────────────────────────────────

  function getMeta(name) {
    const el =
      document.querySelector(`meta[name="${name}"]`) ||
      document.querySelector(`meta[property="${name}"]`) ||
      document.querySelector(`meta[property="og:${name}"]`)
    return el?.getAttribute('content')?.trim() ?? null
  }

  function getMetaAll(name) {
    return [...document.querySelectorAll(`meta[name="${name}"]`)]
      .map((el) => el.getAttribute('content')?.trim())
      .filter(Boolean)
  }

  function extractDoi(text) {
    if (!text) return null
    const m = text.match(/\b(10\.\d{4,9}\/[^\s"'<>[\]{}|\\^`]+)/i)
    return m ? m[1].replace(/[.)]+$/, '') : null
  }

  // ── Site-specific extractors ─────────────────────────────────────────────────

  function extractHighwire() {
    // Used by most academic publishers (SpringerLink, Nature, ACS, etc.)
    const doi = getMeta('citation_doi')
    if (!doi) return null
    const authors = getMetaAll('citation_author').map((a) => {
      const parts = a.split(',').map((s) => s.trim())
      return { last_name: parts[0] ?? a, first_name: parts[1] ?? null }
    })
    return {
      title:     getMeta('citation_title'),
      doi:       extractDoi(doi),
      year:      getMeta('citation_publication_date')?.slice(0, 4) ?? getMeta('citation_year'),
      journal:   getMeta('citation_journal_title') ?? getMeta('citation_conference_title'),
      volume:    getMeta('citation_volume'),
      issue:     getMeta('citation_issue'),
      pages:     getMeta('citation_firstpage') && getMeta('citation_lastpage')
                   ? `${getMeta('citation_firstpage')}–${getMeta('citation_lastpage')}`
                   : getMeta('citation_firstpage'),
      publisher: getMeta('citation_publisher'),
      abstract:  getMeta('citation_abstract') ?? getMeta('description'),
      pdf_url:   getMeta('citation_pdf_url'),
      authors,
      source: 'highwire',
    }
  }

  function extractDublinCore() {
    const title = getMeta('DC.title') ?? getMeta('dc.title')
    if (!title) return null
    return {
      title,
      doi:       extractDoi(getMeta('DC.identifier') ?? getMeta('dc.identifier') ?? ''),
      year:      (getMeta('DC.date') ?? getMeta('dc.date'))?.slice(0, 4),
      publisher: getMeta('DC.publisher') ?? getMeta('dc.publisher'),
      abstract:  getMeta('DC.description') ?? getMeta('dc.description'),
      authors:   getMetaAll('DC.creator').map((a) => {
        const parts = a.split(',').map((s) => s.trim())
        return { last_name: parts[0] ?? a, first_name: parts[1] ?? null }
      }),
      source: 'dublincore',
    }
  }

  function extractOpenGraph() {
    const title = getMeta('og:title') ?? document.title
    const doi = extractDoi(document.URL + document.body.innerText.slice(0, 2000))
    return {
      title,
      doi,
      url:      window.location.href,
      abstract: getMeta('og:description') ?? getMeta('description'),
      authors:  [],
      source:   'opengraph',
    }
  }

  function extractArXiv() {
    if (!location.host.includes('arxiv.org')) return null
    const title   = document.querySelector('.title')?.textContent?.replace('Title:', '').trim()
    const abs     = document.querySelector('.abstract')?.textContent?.replace('Abstract:', '').trim()
    const doi     = extractDoi(document.body.innerText)
    const authors = [...document.querySelectorAll('.authors a')].map((a) => {
      const parts = a.textContent.trim().split(' ')
      return { last_name: parts[parts.length - 1], first_name: parts.slice(0, -1).join(' ') || null }
    })
    const year = document.querySelector('.submission-history')?.textContent?.match(/\b(20\d{2})\b/)?.[1]
    if (!title) return null
    return { title, abstract: abs, doi, year, authors, url: location.href, type: 'preprint', source: 'arxiv' }
  }

  function extractPubMed() {
    if (!location.host.includes('pubmed')) return null
    const title    = document.querySelector('h1.heading-title')?.textContent?.trim()
    const abstract = document.querySelector('#abstract-1 p, .abstract-content p')?.textContent?.trim()
    const doi      = extractDoi([...document.querySelectorAll('.identifier.doi')]
                       .map((el) => el.textContent).join(' '))
    const journal  = document.querySelector('.journal-actions button')?.textContent?.trim()
    const year     = document.querySelector('.cit')?.textContent?.match(/\b(20\d{2}|19\d{2})\b/)?.[1]
    const authors  = [...document.querySelectorAll('.authors-list .full-name')].map((el) => {
      const parts = el.textContent.trim().split(' ')
      return { last_name: parts[parts.length - 1], first_name: parts.slice(0, -1).join(' ') || null }
    })
    if (!title) return null
    return { title, abstract, doi, journal, year, authors, url: location.href, source: 'pubmed' }
  }

  // ── Main extraction ──────────────────────────────────────────────────────────

  function extract() {
    const meta =
      extractArXiv()   ||
      extractPubMed()  ||
      extractHighwire()||
      extractDublinCore() ||
      extractOpenGraph()

    if (!meta) return null

    return {
      type:      meta.type ?? 'journalArticle',
      title:     meta.title ?? document.title,
      abstract:  meta.abstract ?? null,
      doi:       meta.doi ?? null,
      url:       meta.url ?? window.location.href,
      year:      meta.year ? parseInt(meta.year, 10) : null,
      journal:   meta.journal ?? null,
      volume:    meta.volume ?? null,
      issue:     meta.issue ?? null,
      pages:     meta.pages ?? null,
      publisher: meta.publisher ?? null,
      authors:   meta.authors ?? [],
      pdf_url:   meta.pdf_url ?? null,
      page_url:  window.location.href,
      source:    meta.source,
    }
  }

  // ── Message listener ─────────────────────────────────────────────────────────

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type === 'EXTRACT_METADATA') {
      sendResponse({ success: true, data: extract() })
    }
    return true
  })
})()
