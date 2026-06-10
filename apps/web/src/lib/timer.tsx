import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { api } from './api'

export interface TimerState {
  active: { taskId: string; taskTitle: string; projectId: string; startedAt: number } | null
  todayMinutes: number
  capMinutes: number
  capReached: boolean
}

interface TimerCtx extends TimerState {
  /** วินาทีที่เดินแล้วของ session ปัจจุบัน (tick ทุกวินาที) */
  runningSeconds: number
  start: (taskId: string) => Promise<{ error?: string; message?: string }>
  stop: () => Promise<void>
  refresh: () => Promise<void>
  /** banner ชนเพดาน (จาก start ที่ถูกบล็อก / stop ที่โดน clamp) */
  capMessage: string | null
  dismissCap: () => void
}

const Ctx = createContext<TimerCtx | null>(null)
export const TIMER_CHANGED_EVENT = 'so:timer-changed'

export function TimerProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<TimerState>({ active: null, todayMinutes: 0, capMinutes: 480, capReached: false })
  const [runningSeconds, setRunningSeconds] = useState(0)
  const [capMessage, setCapMessage] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    const s = await api.get<TimerState>('/api/timer')
    setState(s)
    window.dispatchEvent(new CustomEvent(TIMER_CHANGED_EVENT))
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  // เดินนาฬิกาฝั่ง client (SPEC §4.5: UI เดินตัวเลขเอง) + auto-stop เมื่อ session ครบเพดาน
  useEffect(() => {
    if (!state.active) {
      setRunningSeconds(0)
      return
    }
    const startedAt = state.active.startedAt
    const tick = () => {
      const secs = Math.floor((Date.now() - startedAt) / 1000)
      setRunningSeconds(secs)
      const sessionCapSecs = state.capMinutes * 60
      if (secs >= sessionCapSecs) {
        void api.post('/api/timer/stop').then(() => {
          setCapMessage('ครบเพดานชั่วโมงของวันแล้ว — timer หยุดให้อัตโนมัติ พักได้แล้ว 🌱')
          void refresh()
        })
      }
    }
    tick()
    const iv = setInterval(tick, 1000)
    return () => clearInterval(iv)
  }, [state.active, state.capMinutes, refresh])

  const start = useCallback(
    async (taskId: string) => {
      try {
        await api.post(`/api/tasks/${taskId}/timer/start`)
        await refresh()
        return {}
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'ผิดพลาด'
        if (msg === 'cap_reached' || msg.includes('เพดาน'))
          setCapMessage('ครบเพดานชั่วโมงของวันนี้แล้ว — พักก่อนนะ (ทำเกินจริงค่อยลง manual ย้อนหลัง)')
        return { error: msg }
      }
    },
    [refresh],
  )

  const stop = useCallback(async () => {
    const res = await api.post<{ capped: boolean }>('/api/timer/stop')
    if (res.capped) setCapMessage('เวลาส่วนที่เกินเพดานถูกตัดออก — ทำเกินจริงลง manual ย้อนหลังได้')
    await refresh()
  }, [refresh])

  return (
    <Ctx.Provider value={{ ...state, runningSeconds, start, stop, refresh, capMessage, dismissCap: () => setCapMessage(null) }}>
      {children}
    </Ctx.Provider>
  )
}

export function useTimer(): TimerCtx {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useTimer ต้องอยู่ใต้ TimerProvider')
  return ctx
}
