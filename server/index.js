const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const iterm = require('./iterm');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

process.on('uncaughtException', (err) => {
    console.error('CRITICAL: Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('CRITICAL: Unhandled Rejection at:', promise, 'reason:', reason);
});

let clients = new Set();
let activeSessionId = null;
let cachedScreenSize = null;

// Colors assigned per window index — written to Mac iTerm tab on focus
const TAB_COLORS = [
    { r: 16, g: 185, b: 129 },   // emerald
    { r: 59, g: 130, b: 246 },   // blue
    { r: 245, g: 158, b: 11 },   // amber
    { r: 168, g: 85, b: 247 },   // purple
    { r: 244, g: 63, b: 94 },    // rose
    { r: 6, g: 182, b: 212 },    // cyan
];

// Fetch screen size once at startup
(async () => {
    cachedScreenSize = await iterm.getScreenSize();
    console.log('Screen size:', cachedScreenSize);
})();

// Extract active session from state
function updateActiveSession(state) {
    for (const win of state) {
        if (win.isFront) {
            for (const tab of win.tabs) {
                if (tab.isSelected && tab.sessions[0]) {
                    activeSessionId = tab.sessions[0].id;
                    return;
                }
            }
            break;
        }
    }
}

io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);
    clients.add(socket.id);

    const syncState = async () => {
        try {
            const state = await iterm.getState();
            socket.emit('state', state);
            updateActiveSession(state);
            return state;
        } catch (err) {
            console.error('Sync state error:', err);
            return null;
        }
    };

    syncState();
    if (cachedScreenSize) socket.emit('screenSize', cachedScreenSize);

    socket.on('execute', async ({ sessionId, command }) => {
        console.log(`Executing command on session ${sessionId}: ${command}`);
        try {
            await iterm.executeCommand(sessionId, command);
            setTimeout(async () => {
                await Promise.all([syncState(), streamContent()]);
            }, 50);
        } catch (err) {
            console.error('Execute error:', err);
        }
    });

    socket.on('switchTab', async (direction) => {
        console.log(`Switching tab: ${direction}`);
        try {
            await iterm.switchTab(direction);
            setTimeout(async () => {
                await Promise.all([syncState(), streamContent()]);
            }, 100);
        } catch (err) {
            console.error('Switch tab error:', err);
        }
    });

    socket.on('newTab', async () => {
        console.log('Creating new tab');
        try {
            await iterm.newTab();
            setTimeout(syncState, 200);
        } catch (err) {
            console.error('New tab error:', err);
        }
    });

    socket.on('closeTab', async () => {
        console.log('Closing current tab');
        try {
            await iterm.closeTab();
            setTimeout(syncState, 200);
        } catch (err) {
            console.error('Close tab error:', err);
        }
    });

    socket.on('sendKeys', async ({ sessionId, keys }) => {
        try {
            await iterm.sendKeys(sessionId, keys);
            setTimeout(streamContent, 50);
        } catch (err) {
            console.error('SendKeys error:', err);
        }
    });

    socket.on('getContent', async ({ sessionId }) => {
        try {
            const content = await iterm.getContent(sessionId);
            if (content) socket.emit('content', { sessionId, content });
        } catch (err) {
            console.error('GetContent error:', err);
        }
    });

    socket.on('getAllContent', async ({ sessionIds }) => {
        try {
            const results = await Promise.all(sessionIds.map(async (sid) => {
                const content = await iterm.getContent(sid);
                return { sessionId: sid, content };
            }));
            for (const r of results) {
                if (r.content) socket.emit('content', { sessionId: r.sessionId, content: r.content });
            }
        } catch (err) {
            console.error('GetAllContent error:', err);
        }
    });

    socket.on('broadcast', async ({ command, sessionIds }) => {
        console.log(`Broadcasting command to ${sessionIds.length} sessions: ${command}`);
        try {
            await Promise.all(sessionIds.map(sid => iterm.executeCommand(sid, command)));
            setTimeout(async () => {
                await Promise.all([syncState(), streamContent()]);
            }, 50);
        } catch (err) {
            console.error('Broadcast error:', err);
        }
    });

    socket.on('focus', async ({ windowId, tabIndex }) => {
        console.log(`Focusing window ${windowId}, tab ${tabIndex}`);
        try {
            await iterm.focus(windowId, tabIndex);
            setTimeout(async () => {
                const state = await syncState();
                if (state) {
                    const winIdx = state.findIndex(w => w.id === String(windowId));
                    if (winIdx >= 0) {
                        const win = state[winIdx];
                        const tab = win.tabs.find(t => t.index === tabIndex) || win.tabs.find(t => t.isSelected);
                        const sessionId = tab?.sessions[0]?.id;
                        if (sessionId) {
                            const color = TAB_COLORS[winIdx % TAB_COLORS.length];
                            await iterm.setTabColor(sessionId, color.r, color.g, color.b);
                        }
                    }
                }
            }, 150);
        } catch (err) {
            console.error('Focus error:', err);
        }
    });

    socket.on('renameSession', async ({ sessionId, name }) => {
        console.log(`Renaming session ${sessionId} to: ${name}`);
        try {
            await iterm.renameSession(sessionId, name);
            setTimeout(syncState, 200);
        } catch (err) {
            console.error('Rename error:', err);
        }
    });

    socket.on('ping', (cb) => cb());

    socket.on('disconnect', () => {
        clients.delete(socket.id);
        console.log('Client disconnected:', socket.id);
    });
});

let lastContent = '';

const streamContent = async () => {
    if (clients.size > 0) {
        try {
            const content = await iterm.getContent(activeSessionId);
            if (content && content !== lastContent) {
                lastContent = content;
                io.emit('content', { sessionId: activeSessionId, content });
            }
        } catch (err) {}
    }
};

// Stream terminal content — setTimeout chain prevents overlap
const pollContent = async () => {
    await streamContent();
    setTimeout(pollContent, 150);
};
pollContent();

// Periodically sync tabs/windows and track active session — setTimeout chain prevents overlap
const pollState = async () => {
    if (clients.size > 0) {
        try {
            const state = await iterm.getState();
            io.emit('state', state);
            updateActiveSession(state);
        } catch (err) {}
    }
    setTimeout(pollState, 1000);
};
pollState();

const PORT = 7291;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
});
