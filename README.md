# remote-iterm

Control your macOS iTerm2 from your phone over local network.

## Install

```bash
npm install -g remote-iterm
```

## Usage

```bash
iterm-server          # start
iterm-server stop     # stop
iterm-server restart  # restart
```

Open the printed URL on your phone (same Wi-Fi network).

## Features

- Real-time terminal output with syntax coloring
- Tab management (create, close, rename via long-press)
- Multi-window support with spatial map
- Broadcast commands to multiple windows
- Command history with arrow navigation
- Virtual keyboard with terminal keys
- Quick action buttons (Ctrl+C, ESC, etc.)
- Clipboard paste/copy
- Landscape mode optimized for iPhone
- Dynamic Island / notch safe area handling
- Connection latency indicator
- Screen wake lock
- Long-running command alert
- Scroll lock
- PWA — add to home screen

## Requirements

- macOS with iTerm2
- Node.js >= 18
- Phone on the same Wi-Fi

## Manual Setup

```bash
git clone https://github.com/zmmmdf/remote-iterm.git
cd remote-iterm
cd server && npm install && cd ../client && npm install
./iterm-server
```

## Ports

- `7291` — WebSocket server
- `7292` — Vite dev server (UI)

## License

MIT
