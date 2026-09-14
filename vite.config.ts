import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [vue()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    watch: {
      /**
       * 有些编辑器/工具在保存文件时会先写一个 `.<文件名>.<pid>.<uuid>.tmpdir/` 临时目录再原子替换。
       * chokidar 在 Windows 上对这种"出现即消失"的目录调用 watch 会抛 EBUSY，
       * 而 Vite 的 FSWatcher 会把这个错误直接抛到进程上，导致 dev server 崩掉。
       * 这里把它忽略掉（Vite 会把该项追加到自己的默认忽略列表之后，不影响 .git / node_modules）。
       */
      ignored: [(path: string) => path.includes('.tmpdir')],
    },
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1200,
  },
  test: {
    // 纯逻辑测试跑在 node 环境；需要 DOM 的测试用文件头 `// @vitest-environment jsdom` 单独声明。
    environment: 'node',
    include: ['src/**/*.spec.ts'],
  },
})
