import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'

/**
 * Dialog กลางแทน confirm()/prompt() ของ browser — เรียบหรู มี fade+pop animation
 * ใช้: const { confirmDialog, promptDialog } = useDialog()
 *   if (await confirmDialog({ title: 'ลบงาน?', danger: true })) ...
 *   const name = await promptDialog({ title: 'หน้าใหม่' }) // null = ยกเลิก
 */

export interface ConfirmOptions {
  title: string
  message?: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
}
export interface PromptOptions {
  title: string
  message?: string
  placeholder?: string
  initialValue?: string
  inputType?: 'text' | 'date'
  confirmLabel?: string
}

type Pending =
  | { kind: 'confirm'; opts: ConfirmOptions; resolve: (v: boolean) => void }
  | { kind: 'prompt'; opts: PromptOptions; resolve: (v: string | null) => void }

interface DialogApi {
  confirmDialog: (opts: ConfirmOptions) => Promise<boolean>
  promptDialog: (opts: PromptOptions) => Promise<string | null>
}

const Ctx = createContext<DialogApi | null>(null)

const CLOSE_MS = 130

export function DialogProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null)
  const [closing, setClosing] = useState(false)
  const [value, setValue] = useState('')
  const pendingRef = useRef<Pending | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const okRef = useRef<HTMLButtonElement>(null)

  const open = useCallback((p: Pending) => {
    pendingRef.current = p
    setClosing(false)
    setPending(p)
  }, [])

  const confirmDialog = useCallback(
    (opts: ConfirmOptions) =>
      new Promise<boolean>((resolve) => open({ kind: 'confirm', opts, resolve })),
    [open],
  )
  const promptDialog = useCallback(
    (opts: PromptOptions) =>
      new Promise<string | null>((resolve) => {
        setValue(opts.initialValue ?? '')
        open({ kind: 'prompt', opts, resolve })
      }),
    [open],
  )

  /** ปิดพร้อม animation แล้วค่อย resolve */
  const finish = useCallback((result: boolean | string | null) => {
    setClosing(true)
    setTimeout(() => {
      const p = pendingRef.current
      pendingRef.current = null
      setPending(null)
      setClosing(false)
      if (!p) return
      if (p.kind === 'confirm') p.resolve(result as boolean)
      else p.resolve(result as string | null)
    }, CLOSE_MS)
  }, [])

  const cancel = useCallback(
    () => finish(pendingRef.current?.kind === 'confirm' ? false : null),
    [finish],
  )
  const ok = useCallback(() => {
    const p = pendingRef.current
    if (!p) return
    finish(p.kind === 'confirm' ? true : value)
  }, [finish, value])

  // โฟกัส + คีย์ลัด Enter/Esc
  useEffect(() => {
    if (!pending || closing) return
    const t = setTimeout(() => {
      if (pending.kind === 'prompt') inputRef.current?.focus()
      else okRef.current?.focus()
    }, 30)
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Escape') {
        e.stopPropagation()
        cancel()
      } else if (e.code === 'Enter' || e.code === 'NumpadEnter') {
        e.preventDefault()
        ok()
      }
    }
    window.addEventListener('keydown', onKey, true) // capture — กันชนกับ Esc handler อื่น
    return () => {
      clearTimeout(t)
      window.removeEventListener('keydown', onKey, true)
    }
  }, [pending, closing, cancel, ok])

  const opts = pending?.opts
  const danger = pending?.kind === 'confirm' && pending.opts.danger

  return (
    <Ctx.Provider value={{ confirmDialog, promptDialog }}>
      {children}
      {pending && opts && (
        <div className="fixed inset-0 z-[70]" role="dialog" aria-modal="true" aria-label={opts.title}>
          <div
            onClick={cancel}
            className={`absolute inset-0 bg-ink/40 backdrop-blur-[1.5px] ${closing ? 'so-fade-out' : 'so-fade-in'}`}
          />
          <div className="absolute inset-0 grid place-items-center p-4 pointer-events-none">
            <div
              className={`pointer-events-auto w-full max-w-sm bg-white rounded-2xl shadow-2xl p-5 ${closing ? 'so-pop-out' : 'so-pop-in'}`}
            >
              <div className="font-semibold text-ink">{opts.title}</div>
              {opts.message && (
                <p className="text-sm text-dim mt-1.5 whitespace-pre-line leading-relaxed">
                  {opts.message}
                </p>
              )}
              {pending.kind === 'prompt' && (
                <input
                  ref={inputRef}
                  type={pending.opts.inputType ?? 'text'}
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder={pending.opts.placeholder}
                  className="w-full mt-3 text-sm bg-white shadow-xs rounded-lg px-3 py-2.5 focus:outline-hidden focus:ring-2 focus:ring-brand-200"
                />
              )}
              <div className="flex justify-end gap-2 mt-5">
                <button
                  onClick={cancel}
                  className="text-sm px-3.5 py-2 rounded-lg text-soft hover:bg-hover"
                >
                  {(pending.kind === 'confirm' && pending.opts.cancelLabel) || 'ยกเลิก'}
                </button>
                <button
                  ref={okRef}
                  onClick={ok}
                  className={`text-sm font-medium text-white px-4 py-2 rounded-lg ${
                    danger ? 'bg-danger-600 hover:bg-danger-700' : 'bg-brand-600 hover:bg-brand-700'
                  }`}
                >
                  {opts.confirmLabel ?? 'ตกลง'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </Ctx.Provider>
  )
}

export function useDialog(): DialogApi {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useDialog ต้องอยู่ใต้ DialogProvider')
  return ctx
}
