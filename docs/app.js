// Register Service Worker for Offline PWA support
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(console.error);
}

// LG WebOS Protocol Registration Payload
const getRegisterPayload = (clientKey) => ({
    type: "register",
    id: "register_0",
    payload: {
        forcePairing: false,
        pairingType: "PROMPT",
        "client-key": clientKey || null,
        manifest: {
            manifestVersion: 1,
            appVersion: "1.1",
            signed: {
                created: "20140509",
                appId: "com.auraremote.app",
                vendorId: "com.auraremote",
                localizedAppNames: { "": "AuraRemote" },
                localizedVendorNames: { "": "AuraRemote" },
                permissions: ["CONTROL_POWER", "CONTROL_AUDIO", "CONTROL_INPUT_JOYSTICK", "READ_CURRENT_CHANNEL", "READ_INSTALLED_APPS"],
                serial: "2f930e2d2ce08e60241a54bf0722df14"
            },
            signatures: [{
                signatureVersion: 1,
                signature: "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJtYW5pZmVzdFRleHQiOiJ7XG5cIm1hbmlmZXN0VmVyc2lvblwiOiAxLFxuXCJhcHBWZXJzaW9uXCI6IFwiMS4xXCIsXG5cInNpZ25lZFwiOiB7XG5cImNyZWF0ZWRcIjogXCIyMDE0MDUwOVwiLFxuXCJhcHBJZFwiOiBcImNvbS5hdXJhcmVtb3RlLmFwcFwiLFxuXCJ2ZW5kb3JJZFwiOiBcImNvbS5hdXJhcmVtb3RlXCIsXG5cImxvY2FsaXplZEFwcE5hbWVzXCI6IHtcblwiXCI6IFwiQXVyYVJlbW90ZVwiXG59LFxuXCJsb2NhbGl6ZWRWZW5kb3JOYW1lc1wiOiB7XG5cIlwiOiBcIkF1cmFSZW1vdGVcIlxufSxcblwicGVybWlzc2lvbnNcIjogW1xuXCJDT05UUk9MX1BPV0VSXCIsXG5cIkNPTlRST0xfQVVESU9cIixcblwiQ09OVERPTF9JTlBVVF9KT1lTVElDS1wiLFxuXCJSRUFEX0NVUlJFTlRfQ0hBTk5FTFwiLFxuXCJSRUFEX0lOU1RBTExFRF9BUFBTXCJcbl0sXG5cInNlcmlhbFwiOiBcIjJmOTMwZTJkMmNlMDhlNjAyNDFhNTRiZjA3MjJkZjE0XCJcbn0sXG5cInNpZ25hdHVyZXNcIjogW1xue1xuXCJzaWduYXR1cmVWZXJzaW9uXCI6IDEsXG5cInNpZ25hdHVyZVwiOiBcIlwiXG59XG5dXG59In0.b3B0aW9uYWw="
            }]
        }
    }
});

let ws = null;
let commandCount = 0;
const tvIpInput = document.getElementById('tv-ip');
const useSecure = document.getElementById('use-secure');
const connectBtn = document.getElementById('connect-btn');
const statusText = document.getElementById('status');
const remotePanel = document.querySelector('.remote-panel');

// Modal Elements
const helpBtn = document.getElementById('help-btn');
const modal = document.getElementById('instructions-modal');
const closeModalBtn = document.getElementById('close-modal');
const trustLink = document.getElementById('trust-link');

// Load saved IP and update trust link
tvIpInput.value = localStorage.getItem('tv_ip') || '';
updateTrustLink();

// Instructions Modal Logic
helpBtn.addEventListener('click', () => modal.classList.add('show'));
closeModalBtn.addEventListener('click', () => modal.classList.remove('show'));
tvIpInput.addEventListener('input', updateTrustLink);

function updateTrustLink() {
    const ip = tvIpInput.value.trim();
    if (ip) {
        trustLink.href = `https://${ip}:3001`;
        trustLink.textContent = `Tap here to open: https://${ip}:3001`;
        trustLink.classList.add('ready');
    } else {
        trustLink.href = "#";
        trustLink.textContent = "Enter an IP address first...";
        trustLink.classList.remove('ready');
    }
}

connectBtn.addEventListener('click', () => {
    const ip = tvIpInput.value.trim();
    if (!ip) return alert('Enter TV IP Address');
    localStorage.setItem('tv_ip', ip);
    connectTV(ip, useSecure.checked);
});

function connectTV(ip, secure) {
    if (ws) ws.close();
    
    statusText.textContent = "Connecting...";
    statusText.className = "status";

    const port = secure ? '3001' : '3000';
    const protocol = secure ? 'wss' : 'ws';
    const url = `${protocol}://${ip}:${port}`;

    try {
        ws = new WebSocket(url);
    } catch (e) {
        handleDisconnect("Error connecting.");
        return;
    }

    ws.onopen = () => {
        statusText.textContent = "Pairing... Check TV Screen";
        const savedKey = localStorage.getItem(`tv_key_${ip}`);
        ws.send(JSON.stringify(getRegisterPayload(savedKey)));
    };

    ws.onmessage = (event) => {
        const res = JSON.parse(event.data);
        if (res.type === 'registered') {
            statusText.textContent = "Connected";
            statusText.className = "status connected";
            remotePanel.classList.add('active');
            
            if (res.payload && res.payload['client-key']) {
                localStorage.setItem(`tv_key_${ip}`, res.payload['client-key']);
            }
        } else if (res.type === 'error') {
            console.error("TV Error:", res.error);
        }
    };

    ws.onerror = (err) => {
        console.error('WebSocket Error', err);
        handleDisconnect("Connection Failed");
        if (secure) {
            // Automatically pop up the instructions if WSS fails
            modal.classList.add('show');
        }
    };

    ws.onclose = () => handleDisconnect("Disconnected");
}

function handleDisconnect(msg) {
    statusText.textContent = msg;
    statusText.className = "status disconnected";
    remotePanel.classList.remove('active');
    ws = null;
}

function sendCommand(uri, payload = {}) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    commandCount++;
    ws.send(JSON.stringify({
        type: "request",
        id: `cmd_${commandCount}`,
        uri: uri,
        payload: payload
    }));
}

// Bind Remote Buttons
document.querySelectorAll('.remote-panel .btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const uri = btn.getAttribute('data-uri');
        const payloadStr = btn.getAttribute('data-payload');
        const payload = payloadStr ? JSON.parse(payloadStr) : {};
        if (uri) sendCommand(uri, payload);
    });
});
