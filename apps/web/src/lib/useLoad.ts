import { useCallback, useEffect, useRef, useState } from 'react'

/** โหลดข้อมูลตอน mount + reload หลัง mutation — ตัวเดียวพอสำหรับ internal tool */
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const fnRef = useRef(fn)
  fnRef.current = fn

  const reload = useCallback(async () => {
    try {
      setError(null)
      const d = await fnRef.current()
      setData(d)
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    setLoading(true)
    void reload()
    // deps มาจากผู้เรียก (เช่น id ใน url) — reload เสถียรอยู่แล้ว
  }, deps)

  return { data, loading, error, reload }
}
