import { Check, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useDialogStore, type DialogReq } from '../lib/dialog'
import { iconPropsSm } from '../lib/lucideProps'

function defaultTitle(req: DialogReq): string {
  if (req.title) return req.title
  if (req.kind === 'alert') return 'Notice'
  if (req.kind === 'confirm') return 'Confirm'
  return 'Enter a value'
}

function DialogPanel({ req, onDone }: { req: DialogReq; onDone: () => void }) {
  const [value, setValue] = useState(req.kind === 'prompt' ? req.defaultValue : '')
  const inputRef = useRef<HTMLInputElement>(null)
  const okRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (req.kind === 'prompt') {
      inputRef.current?.focus()
      inputRef.current?.select()
    } else {
      okRef.current?.focus()
    }
  }, [req.kind])

  function ok() {
    if (req.kind === 'alert') {
      req.resolve()
    } else if (req.kind === 'confirm') {
      req.resolve(true)
    } else {
      req.resolve(value.trim() || null)
    }
    onDone()
  }

  function cancel() {
    if (req.kind === 'confirm') {
      req.resolve(false)
    } else if (req.kind === 'prompt') {
      req.resolve(null)
    }
    onDone()
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      e.stopPropagation()
      if (req.kind === 'alert') {
        req.resolve()
        onDone()
      } else {
        cancel()
      }
    }
    if (e.key === 'Enter' && req.kind !== 'prompt') {
      e.preventDefault()
      ok()
    }
  }

  return (
    <div
      className="dialog-overlay"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) {
          if (req.kind === 'alert') { req.resolve(); onDone() }
          else cancel()
        }
      }}
    >
      <div
        className="dialog-panel"
        role="alertdialog"
        aria-modal
        aria-labelledby="dialog-title"
        aria-describedby="dialog-message"
        onKeyDown={onKeyDown}
      >
        <p id="dialog-title" className="dialog-title">
          {defaultTitle(req)}
        </p>
        <p id="dialog-message" className="dialog-message">
          {req.message}
        </p>
        {req.kind === 'prompt' && (
          <input
            ref={inputRef}
            type="text"
            className="dialog-input"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); ok() }
              if (e.key === 'Escape') { e.preventDefault(); cancel() }
            }}
            autoComplete="off"
          />
        )}
        <div className="dialog-actions">
          {req.kind !== 'alert' && (
            <button type="button" className="btn dialog-btn-cancel btn-with-icon" onClick={cancel}>
              <X {...iconPropsSm} aria-hidden />
              Cancel
            </button>
          )}
          <button ref={okRef} type="button" className="btn dialog-btn-ok btn-with-icon" onClick={ok}>
            <Check {...iconPropsSm} aria-hidden />
            {req.kind === 'alert' ? 'OK' : req.kind === 'confirm' ? 'Confirm' : 'OK'}
          </button>
        </div>
      </div>
    </div>
  )
}

/** Mount once at the app root. Renders the front-most pending dialog. */
export function DialogHost() {
  const queue = useDialogStore((s) => s.queue)
  const shift = useDialogStore((s) => s.shift)

  const req = queue[0]
  if (!req) return null

  return <DialogPanel key={queue.length} req={req} onDone={shift} />
}
