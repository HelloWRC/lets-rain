import { onBeforeUnmount, onMounted, ref, type Ref } from 'vue'

/** 监听系统"减弱动态效果"偏好；不支持 matchMedia 的环境恒为 false。 */
export function useReducedMotion(): Ref<boolean> {
  const reduced = ref(false)
  let media: MediaQueryList | null = null
  let onChange: ((event: MediaQueryListEvent) => void) | null = null

  onMounted(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    media = window.matchMedia('(prefers-reduced-motion: reduce)')
    reduced.value = media.matches
    onChange = (event: MediaQueryListEvent): void => {
      reduced.value = event.matches
    }
    media.addEventListener('change', onChange)
  })

  onBeforeUnmount(() => {
    if (media && onChange) media.removeEventListener('change', onChange)
    media = null
    onChange = null
  })

  return reduced
}
