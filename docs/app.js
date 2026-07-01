if ('serviceWorker' in navigator) { navigator.serviceWorker.register('sw.js').catch(console.error); }

const getRegisterPayload = (clientKey) => ({
    type: "register", id: "register_0",
    payload: {
        forcePairing: false, pairingType: "PROMPT", "client-key": clientKey || null,
        manifest: {
            manifestVersion: 1, appVersion: "1.1",
            signed: {
                created: "20140509", appId: "com.auraremote.app", vendorId: "com.auraremote",
                localizedAppNames: { "": "AuraRemote" }, localizedVendorNames: { "": "AuraRemote" },
                permissions: ["CONTROL_POWER", "CONTROL_AUDIO", "CONTROL_INPUT_JOYSTICK", "READ_CURRENT_CHANNEL", "READ_INSTALLED_APPS"],
                serial: "2f930e2d2ce08e60241a54bf0722df14"
            },
            signatures: [{ signatureVersion: 1, signature: "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJtYW5pZmVzdFRleHQiOiJ7XG5cIm1hbmlmZXN0VmVyc2lvblwiOiAxLFxuXCJhcHBWZXJzaW9uXCI6IFwiMS4xXCIsXG5cInNpZ25lZFwiOiB7XG5cImNyZWF0ZWRcIjogXCIyMDE0MDUwOVwiLFxuXCJhcHBJZFwiOiBcImNvbS5hdXJhcmVtb3RlLmFwcFwiLFxuXCJ2ZW5kb3JJZFwiOiBcImNvbS5hdXJhcmVtb3RlXCIsXG5cImxvY2FsaXplZEFwcE5hbWVzXCI6IHtcblwiXCI6IFwiQXVyYVJlbW90ZVwiXG59LFxuXCJsb2NhbGl6ZWRWZW5kb3JOYW1lc1wiOiB7XG5cIlwiOiBcIkF1cmFSZW1vdGVcIlxufSxcblwicGVybWlzc2lvbnNcIjogW1xuXCJDT05UUk9MX1BPV0VSXCIsXG5cIkNPTlRST0xfQVVESU9cIixcblwiQ09OVERPTF9JTlBVVF9KT1lTVElDS1wiLFxuXCJSRUFEX0NVUlJFTlRfQ0hBTk5FTFwiLFxuXCJSRUFEX0lOU1RBTExFRF9BUFBTXCJcbl0sXG5cInNlcmlhbFwiOiBcIjJmOTMwZTJkMmNlMDhlNjAyNDFhNTRiZjA3MjJkZjE0XCJcbn0sXG5cInNpZ25hdHVyZXNcIjogW1xue1xuXCJzaWduYXR1cmVWZXJzaW9uXCI6IDEsXG5cInNpZ25hdHVyZVwiOiBcIlwiXG59XG5dXG59In0.b3B0aW9uYWw=" }]
        }
    }
});

let ws = null;
let pointerWs = null; // Secondary websocket needed for D-Pad / OK / Back
let commandCount = 0;

const tvIpInput = document.getElementById('tv-ip');
const useSecure = document.getElementById('use-secure');
const connectBtn = document.getElementById('connect-btn');
const statusText = document.getElementById('status');
const remotePanel = document.querySelector('.remote-panel');

// Recent TVs "Discovery" Array
let savedTVs = JSON.parse(localStorage.getItem('saved_tvs') || '[]');

function updateSavedTVsUI() {
    const container = document.getElementById('saved-tvs-container');
    const list = document.getElementById('saved-tvs-list');
    list.innerHTML = '';
    
    if (savedTVs.length > 0) {
        container.style.display = 'block';
        savedTVs.forEach(ip => {
            const btn = document.createElement('button');
            btn.className = 'saved-tv-btn';
            btn.textContent = ip;
            btn.onclick = () => { tvIpInput.value = ip; updateTrustLink(); };
            list.appendChild(btn);
        });
    }
}
updateSavedTVsUI();

function saveTV(ip) {
    if (!savedTVs.includes(ip)) {
        savedTVs.push(ip);
        localStorage.setItem('saved_tvs', JSON.stringify(savedTVs));
        updateSavedTVsUI();
    }
}

// Modal Logic
const modal = document.getElementById('instructions-modal');
const trustLink = document.getElementById('trust-link');

document.getElementById('help-btn').addEventListener('click', () => modal.classList.add('show'));
document.getElementById('close-modal').addEventListener('click', () => modal.classList.remove('show'));
tvIpInput.addEventListener('input', updateTrustLink);

function updateTrustLink() {
    const ip = tvIpInput.value.trim();
    if (ip) {
        trustLink.href = `https://${ip}:3001`;
        trustLink.textContent = `Tap here to open: https://${ip}:3001`;
        trustLink.classList.add('ready');
    }
}
updateTrustLink();

connectBtn.addEventListener('click', () => {
    const ip = tvIpInput.value.trim();
    if (!ip) return alert('Enter TV IP Address');
    localStorage.setItem('tv_ip', ip);
    connectTV(ip, useSecure.checked);
});

function connectTV(ip, secure) {
    if (ws) ws.close();
    if (pointerWs) pointerWs.close();
    
    statusText.textContent = "Connecting...";
    statusText.className = "status";

    ws = new WebSocket(`${secure ? 'wss' : 'ws'}://${ip}:${secure ? '3001' : '3000'}`);

    ws.onopen = () => {
        statusText.textContent = "Pairing... Check TV Screen";
        ws.send(JSON.stringify(getRegisterPayload(localStorage.getItem(`tv_key_${ip}`))));
    };

    ws.onmessage = (event) => {
        const res = JSON.parse(event.data);
        if (res.type === 'registered') {
            statusText.textContent = "Connected";
            statusText.className = "status connected";
            remotePanel.classList.add('active');
            saveTV(ip);
            
            if (res.payload && res.payload['client-key']) {
                localStorage.setItem(`tv_key_${ip}`, res.payload['client-key']);
            }
            
            // LG requires us to request a special "Pointer Input Socket" for directional keys and OK/Back
            sendCommand("ssap://com.webos.service.networkinput/getPointerInputSocket", {}, "req_pointer");
        } 
        else if (res.id === "req_pointer" && res.payload && res.payload.socketPath) {
            // Connect to the secondary websocket for button strokes
            pointerWs = new WebSocket(res.payload.socketPath);
        }
    };

    ws.onerror = (err) => {
        handleDisconnect("Connection Failed");
        if (secure) modal.classList.add('show');
    };

    ws.onclose = () => handleDisconnect("Disconnected");
}

function handleDisconnect(msg) {
    statusText.textContent = msg;
    statusText.className = "status disconnected";
    remotePanel.classList.remove('active');
    ws = null;
    if (pointerWs) { pointerWs.close(); pointerWs = null; }
}

function sendCommand(uri, payload = {}, id = null) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    commandCount++;
    ws.send(JSON.stringify({ type: "request", id: id || `cmd_${commandCount}`, uri: uri, payload: payload }));
}

function sendKey(keyName) {
    if (pointerWs && pointerWs.readyState === WebSocket.OPEN) {
        pointerWs.send(`type:button\nname:${keyName}\n\n`);
    } else {
        console.warn("Pointer socket not ready for key:", keyName);
    }
}

// Bind standard SSAP URI Buttons (Power, Home, Vol, Media)
document.querySelectorAll('.remote-panel .btn[data-uri]').forEach(btn => {
    btn.addEventListener('click', () => {
        const payloadStr = btn.getAttribute('data-payload');
        sendCommand(btn.getAttribute('data-uri'), payloadStr ? JSON.parse(payloadStr) : {});
    });
});

// Bind D-Pad, OK, and Back buttons
document.querySelectorAll('.remote-panel .btn[data-key]').forEach(btn => {
    btn.addEventListener('click', () => {
        sendKey(btn.getAttribute('data-key'));
    });
});
