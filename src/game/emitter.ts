/**
 * 类型化事件总线。
 * 状态机只管推进数值，表现层（音效/浮字/播报/闪电）通过事件解耦订阅。
 */

export type Listener<T> = (payload: T) => void

export class Emitter<Events> {
  private listeners = new Map<keyof Events, Set<Listener<never>>>()

  on<K extends keyof Events>(event: K, listener: Listener<Events[K]>): () => void {
    let bucket = this.listeners.get(event)
    if (!bucket) {
      bucket = new Set()
      this.listeners.set(event, bucket)
    }
    const wrapped = listener as Listener<never>
    bucket.add(wrapped)
    return () => {
      bucket.delete(wrapped)
    }
  }

  emit<K extends keyof Events>(event: K, payload: Events[K]): void {
    const bucket = this.listeners.get(event)
    if (!bucket) return
    for (const listener of bucket) {
      listener(payload as never)
    }
  }

  clear(): void {
    this.listeners.clear()
  }
}
