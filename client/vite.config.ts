import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // Listen on all addresses, including LAN and public IPs
    port: 7292
  },
  optimizeDeps: {
    // remote-iterm is run from its global install location, which lives inside
    // a node_modules directory. Vite's default dep scanner discovers entries
    // via the glob "**/*.html" with a hardcoded ignore of "**/node_modules/**".
    // Since the project's own path contains /node_modules/, its index.html is
    // excluded, the scan finds nothing, and CJS-only deps reached through
    // socket.io-client (notably `debug`) are served as raw source with no ESM
    // default export -> "does not provide an export named 'default'".
    // A literal (non-glob) entry is resolved directly, bypassing that ignore.
    entries: 'index.html',
  },
})
