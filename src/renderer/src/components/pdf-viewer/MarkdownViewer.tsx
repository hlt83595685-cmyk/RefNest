import { useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { dirname, join, isAbsolute } from 'path-browserify'

interface Props {
  filePath: string
}

// Convert a src attribute (possibly relative) to a file:// URL the renderer can load.
function resolveImageSrc(src: string, mdDir: string): string {
  if (src.startsWith('data:') || src.startsWith('http://') || src.startsWith('https://')) {
    return src
  }
  // Absolute path
  if (isAbsolute(src)) {
    return `file:///${src.replace(/\\/g, '/')}`
  }
  // Relative path — join with .md file directory
  const abs = join(mdDir, src).replace(/\\/g, '/')
  return `file:///${abs}`
}

export function MarkdownViewer({ filePath }: Props): JSX.Element {
  const [content, setContent] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const mdDir = dirname(filePath).replace(/\\/g, '/')

  useEffect(() => {
    setContent(null)
    setError(null)
    window.refnest.fs.readTextFile(filePath)
      .then(setContent)
      .catch((e: unknown) => setError(String(e)))
  }, [filePath])

  if (error) {
    return (
      <div style={{ padding: 32, color: 'var(--accent)', fontSize: 13 }}>
        读取失败：{error}
      </div>
    )
  }

  if (content === null) {
    return (
      <div style={{ padding: 32, color: 'var(--muted)', fontSize: 13 }}>
        加载中…
      </div>
    )
  }

  return (
    <div style={{
      padding: '24px 32px',
      maxWidth: 860,
      margin: '0 auto',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      fontSize: 14,
      lineHeight: 1.75,
      color: 'var(--foreground)',
    }}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Resolve local image paths to file:// URLs
          img({ src, alt, ...rest }) {
            const resolved = src ? resolveImageSrc(src, mdDir) : undefined
            return (
              <img
                {...rest}
                src={resolved}
                alt={alt ?? ''}
                style={{ maxWidth: '100%', borderRadius: 6, margin: '8px 0' }}
              />
            )
          },
          // Open links externally
          a({ href, children, ...rest }) {
            return (
              <a
                {...rest}
                href={href}
                onClick={(e) => {
                  e.preventDefault()
                  if (href) window.refnest.tools.openExternal(href)
                }}
                style={{ color: 'var(--primary)', textDecoration: 'underline', cursor: 'pointer' }}
              >
                {children}
              </a>
            )
          },
          // Code blocks
          code({ children, className, ...rest }) {
            const isBlock = className?.startsWith('language-')
            if (isBlock) {
              return (
                <pre style={{
                  background: 'var(--surface-2)', borderRadius: 8,
                  padding: '12px 16px', overflowX: 'auto',
                  fontSize: 12, lineHeight: 1.6,
                  border: '1px solid var(--border)',
                }}>
                  <code {...rest} className={className}>{children}</code>
                </pre>
              )
            }
            return (
              <code
                {...rest}
                style={{
                  background: 'var(--surface-2)', borderRadius: 4,
                  padding: '1px 5px', fontSize: '0.88em',
                  fontFamily: 'ui-monospace, monospace',
                }}
              >
                {children}
              </code>
            )
          },
          // Tables
          table({ children, ...rest }) {
            return (
              <div style={{ overflowX: 'auto', margin: '16px 0' }}>
                <table
                  {...rest}
                  style={{
                    borderCollapse: 'collapse', width: '100%',
                    fontSize: 13,
                  }}
                >
                  {children}
                </table>
              </div>
            )
          },
          th({ children, ...rest }) {
            return (
              <th
                {...rest}
                style={{
                  border: '1px solid var(--border)',
                  padding: '8px 12px',
                  background: 'var(--surface-2)',
                  fontWeight: 600, textAlign: 'left',
                }}
              >
                {children}
              </th>
            )
          },
          td({ children, ...rest }) {
            return (
              <td
                {...rest}
                style={{ border: '1px solid var(--border)', padding: '7px 12px' }}
              >
                {children}
              </td>
            )
          },
          // Headings
          h1({ children, ...rest }) {
            return <h1 {...rest} style={{ fontSize: 22, fontWeight: 700, margin: '28px 0 12px', borderBottom: '1px solid var(--separator)', paddingBottom: 8 }}>{children}</h1>
          },
          h2({ children, ...rest }) {
            return <h2 {...rest} style={{ fontSize: 18, fontWeight: 600, margin: '24px 0 10px' }}>{children}</h2>
          },
          h3({ children, ...rest }) {
            return <h3 {...rest} style={{ fontSize: 15, fontWeight: 600, margin: '20px 0 8px' }}>{children}</h3>
          },
          // Blockquote
          blockquote({ children, ...rest }) {
            return (
              <blockquote
                {...rest}
                style={{
                  borderLeft: '3px solid var(--primary)',
                  paddingLeft: 16, margin: '16px 0',
                  color: 'var(--muted)', fontStyle: 'italic',
                }}
              >
                {children}
              </blockquote>
            )
          },
          // Horizontal rule
          hr(rest) {
            return <hr {...rest} style={{ border: 'none', borderTop: '1px solid var(--separator)', margin: '24px 0' }} />
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
