import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import i18n from '../../i18n'

interface Props {
  initialTab?: string
  onClose: () => void
}

type Tab = 'storage' | 'language' | 'pdf2md'

export function SettingsDialog({ initialTab = 'storage', onClose }: Props): JSX.Element {
  const { t } = useTranslation('common')
  const [tab, setTab] = useState<Tab>(initialTab as Tab)

  useEffect(() => {
    const h = (e: KeyboardEvent): void => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  const tabs: { id: Tab; label: string }[] = [
    { id: 'storage',  label: t('settings.storage.title') },
    { id: 'language', label: t('settings.language.title') },
    { id: 'pdf2md',   label: 'PDF 转换' },
  ]

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        width: 500,
        borderRadius: 14,
        background: 'var(--surface)',
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}>

        {/* Title bar */}
        <div style={{
          padding: '18px 22px 0',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--foreground)' }}>
            {t('settings.title')}
          </span>
          <button
            onClick={onClose}
            style={{
              width: 26, height: 26, borderRadius: '50%',
              border: 'none', background: 'var(--muted-bg)',
              color: 'var(--muted)', fontSize: 13, cursor: 'pointer',
            }}
          >
            ✕
          </button>
        </div>

        {/* Tab bar */}
        <div style={{
          display: 'flex', gap: 4, padding: '12px 22px 0',
          borderBottom: '1px solid var(--separator)',
        }}>
          {tabs.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              style={{
                height: 32, padding: '0 14px', borderRadius: '8px 8px 0 0',
                border: 'none',
                background: tab === id ? 'var(--surface-2)' : 'transparent',
                color: tab === id ? 'var(--foreground)' : 'var(--muted)',
                fontSize: 13, fontWeight: tab === id ? 600 : 400,
                cursor: 'pointer',
                borderBottom: tab === id ? '2px solid var(--primary)' : '2px solid transparent',
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div style={{ padding: '20px 22px 22px', flex: 1, overflow: 'auto' }}>
          {tab === 'storage'  && <StorageTab />}
          {tab === 'language' && <LanguageTab />}
          {tab === 'pdf2md'   && <Pdf2mdTab />}
        </div>

        {/* Footer */}
        <div style={{
          padding: '12px 22px',
          borderTop: '1px solid var(--separator)',
          display: 'flex', justifyContent: 'flex-end',
        }}>
          <button onClick={onClose} style={secondaryBtnStyle}>{t('settings.close')}</button>
        </div>
      </div>
    </div>
  )
}

// ── Storage tab ───────────────────────────────────────────────────────────────

function StorageTab(): JSX.Element {
  const { t } = useTranslation('common')
  const [storagePath, setStoragePath] = useState<string>('')

  useEffect(() => {
    window.refnest.settings.get('storage.path').then((v) => {
      if (typeof v === 'string') setStoragePath(v)
    })
  }, [])

  const browse = async (): Promise<void> => {
    const picked = await window.refnest.settings.pickStoragePath()
    if (picked) setStoragePath(picked)
  }

  const clear = (): void => {
    setStoragePath('')
    window.refnest.settings.set('storage.path', '')
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Section label={t('settings.storage.label')}>
        <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 10 }}>
          {t('settings.storage.desc')}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{
            flex: 1, padding: '7px 10px', borderRadius: 8,
            border: '1px solid var(--border)', background: 'var(--muted-bg)',
            fontSize: 12, color: storagePath ? 'var(--foreground)' : 'var(--muted)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {storagePath || t('settings.storage.placeholder')}
          </div>
          <button onClick={browse} style={primaryBtnStyle}>
            {t('settings.storage.browse')}
          </button>
          {storagePath && (
            <button onClick={clear} style={secondaryBtnStyle} title="Reset to default">✕</button>
          )}
        </div>
        {storagePath && (
          <div style={{ marginTop: 8, fontSize: 11, color: 'var(--muted)' }}>
            {t('settings.storage.current')}: <code style={{ fontSize: 11 }}>{storagePath}</code>
          </div>
        )}
      </Section>
    </div>
  )
}

// ── Language tab ──────────────────────────────────────────────────────────────

function LanguageTab(): JSX.Element {
  const { t, i18n: i18nInst } = useTranslation('common')
  const currentLang = i18nInst.language

  const setLang = (lang: string): void => {
    i18n.changeLanguage(lang)
    window.refnest.settings.notifyLocale(lang)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Section label={t('settings.language.label')}>
        <div style={{ display: 'flex', gap: 10 }}>
          {(['zh', 'en'] as const).map((lang) => (
            <button
              key={lang}
              onClick={() => setLang(lang)}
              style={{
                height: 36, padding: '0 20px', borderRadius: 10,
                border: currentLang === lang
                  ? '2px solid var(--primary)'
                  : '1px solid var(--border)',
                background: currentLang === lang ? 'rgba(0,122,255,0.08)' : 'var(--surface)',
                color: currentLang === lang ? 'var(--primary)' : 'var(--foreground-2)',
                fontSize: 13, fontWeight: currentLang === lang ? 700 : 400,
                cursor: 'pointer',
              }}
            >
              {lang === 'zh' ? t('settings.language.zh') : t('settings.language.en')}
            </button>
          ))}
        </div>
      </Section>
    </div>
  )
}

// ── PDF 转换 tab ──────────────────────────────────────────────────────────────

type Pdf2mdMode = 'agent' | 'precision'

function Pdf2mdTab(): JSX.Element {
  const [mode, setMode] = useState<Pdf2mdMode>('agent')
  const [token, setToken] = useState('')
  const [tokenVisible, setTokenVisible] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    window.refnest.settings.get('tool.pdf2md.mode').then((v) => {
      if (v === 'precision') setMode('precision')
    })
    window.refnest.settings.get('tool.pdf2md.apiToken').then((v) => {
      if (typeof v === 'string') setToken(v)
    })
  }, [])

  const save = async (): Promise<void> => {
    await window.refnest.settings.set('tool.pdf2md.mode', mode)
    await window.refnest.settings.set('tool.pdf2md.apiToken', token)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Section label="解析模式">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* Mode selector */}
          <div style={{ display: 'flex', gap: 10 }}>
            {([
              { id: 'agent' as Pdf2mdMode, label: '免费（Agent 轻量解析）', desc: '无需 Token，基于 IP 限速，每次最多 20 页' },
              { id: 'precision' as Pdf2mdMode, label: '精准解析 API', desc: '需要 Bearer Token，使用 VLM 模型，输出含图片的多模态 Markdown' },
            ] as { id: Pdf2mdMode; label: string; desc: string }[]).map(({ id, label, desc }) => (
              <div
                key={id}
                onClick={() => setMode(id)}
                style={{
                  flex: 1, padding: '10px 14px', borderRadius: 10, cursor: 'pointer',
                  border: mode === id ? '2px solid var(--primary)' : '1px solid var(--border)',
                  background: mode === id ? 'rgba(0,122,255,0.06)' : 'var(--surface)',
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 600, color: mode === id ? 'var(--primary)' : 'var(--foreground)', marginBottom: 4 }}>
                  {mode === id ? '● ' : '○ '}{label}
                </div>
                <div style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.5 }}>{desc}</div>
              </div>
            ))}
          </div>

          {/* Token input — only when precision mode */}
          {mode === 'precision' && (
            <div style={{ marginTop: 4 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                API Token
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  type={tokenVisible ? 'text' : 'password'}
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="请输入 MinerU API Token"
                  style={{
                    flex: 1, height: 34, padding: '0 10px',
                    borderRadius: 8, border: '1px solid var(--border)',
                    background: 'var(--surface)', color: 'var(--foreground)',
                    fontSize: 13, outline: 'none',
                    fontFamily: tokenVisible ? 'inherit' : 'monospace',
                  }}
                />
                <button
                  onClick={() => setTokenVisible((v) => !v)}
                  style={{ ...secondaryBtnStyle, padding: '0 10px', minWidth: 36 }}
                  title={tokenVisible ? '隐藏' : '显示'}
                >
                  {tokenVisible ? '🙈' : '👁'}
                </button>
              </div>
              <div style={{ marginTop: 6, fontSize: 11, color: 'var(--muted)' }}>
                在{' '}
                <span
                  onClick={() => window.refnest.tools.openExternal('https://mineru.net/apiManage/token')}
                  style={{ color: 'var(--primary)', cursor: 'pointer', textDecoration: 'underline' }}
                >
                  MinerU 控制台
                </span>
                {' '}获取 Token
              </div>
            </div>
          )}
        </div>
      </Section>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, alignItems: 'center' }}>
        {saved && <span style={{ fontSize: 12, color: '#34c759' }}>✓ 已保存</span>}
        <button onClick={save} style={primaryBtnStyle}>保存</button>
      </div>
    </div>
  )
}

// ── Shared ────────────────────────────────────────────────────────────────────

function Section({ label, children }: { label: string; children: React.ReactNode }): JSX.Element {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{
        fontSize: 11, fontWeight: 600, color: 'var(--muted)',
        textTransform: 'uppercase', letterSpacing: '0.06em',
      }}>
        {label}
      </div>
      <div style={{
        padding: '12px 14px', borderRadius: 10,
        background: 'var(--surface-2)', border: '1px solid var(--border)',
      }}>
        {children}
      </div>
    </div>
  )
}

const primaryBtnStyle: React.CSSProperties = {
  height: 32, padding: '0 16px', borderRadius: 8,
  border: 'none', background: 'var(--primary)',
  color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', flexShrink: 0,
}

const secondaryBtnStyle: React.CSSProperties = {
  height: 32, padding: '0 16px', borderRadius: 8,
  border: '1px solid var(--border)', background: 'var(--surface)',
  color: 'var(--foreground-2)', fontSize: 13, cursor: 'pointer',
}
