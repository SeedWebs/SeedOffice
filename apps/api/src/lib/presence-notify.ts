/** บอก PresenceHub ว่า timer ขยับ (start/stop) — best-effort ห้ามทำให้ request หลักล้ม */
export async function notifyPresence(env: Env, type: 'changed'): Promise<void> {
  try {
    const stub = env.PRESENCE.get(env.PRESENCE.idFromName('global'))
    await stub.notify({ type })
  } catch (e) {
    console.log(JSON.stringify({ event: 'presence_notify_failed', error: String(e) }))
  }
}
