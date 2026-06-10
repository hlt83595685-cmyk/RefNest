// RefNest Connector — service worker
const API = 'http://127.0.0.1:23120'

async function ping() {
  try {
    const r = await fetch(`${API}/ping`, { signal: AbortSignal.timeout(2000) })
    return r.ok
  } catch {
    return false
  }
}

async function getCollections() {
  try {
    const r = await fetch(`${API}/collections`, { signal: AbortSignal.timeout(3000) })
    if (!r.ok) return []
    const data = await r.json()
    return data.collections ?? []
  } catch {
    return []
  }
}

async function lookupDoi(doi) {
  try {
    const r = await fetch(`${API}/lookup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ doi }),
      signal: AbortSignal.timeout(10000),
    })
    if (!r.ok) return null
    const data = await r.json()
    return data.metadata ?? null
  } catch {
    return null
  }
}

async function saveItem(payload) {
  const r = await fetch(`${API}/save`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(8000),
  })
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return r.json()
}

// Message bridge between popup and content script / server
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  ;(async () => {
    try {
      if (msg.type === 'PING') {
        sendResponse({ online: await ping() })
      }
      else if (msg.type === 'GET_COLLECTIONS') {
        sendResponse({ collections: await getCollections() })
      }
      else if (msg.type === 'LOOKUP_DOI') {
        sendResponse({ metadata: await lookupDoi(msg.doi) })
      }
      else if (msg.type === 'SAVE_ITEM') {
        const result = await saveItem(msg.payload)
        sendResponse({ success: true, item: result.item })
      }
      else if (msg.type === 'EXTRACT_FROM_TAB') {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
        if (!tab?.id) return sendResponse({ success: false, error: 'No active tab' })
        const results = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['content.js'],
        })
        // content.js sets up listener; now ask it
        chrome.tabs.sendMessage(tab.id, { type: 'EXTRACT_METADATA' }, (resp) => {
          sendResponse(resp ?? { success: false, error: 'No response from page' })
        })
      }
    } catch (err) {
      sendResponse({ success: false, error: err.message })
    }
  })()
  return true // keep channel open for async
})
