import { onBeforeUnmount, onMounted } from 'vue'
import { gameLoop, type TickHandler } from '../game/loop'

/** 把组件的逐帧逻辑挂到全局唯一 rAF 循环上（自动在卸载时解绑）。 */
export function useGameTick(handler: TickHandler): void {
  let off: (() => void) | null = null

  onMounted(() => {
    off = gameLoop.subscribe(handler)
  })

  onBeforeUnmount(() => {
    off?.()
    off = null
  })
}
