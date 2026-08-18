const express = require('express');
const { makeWASocket, useMultiFileAuthState, delay } = require('@whiskeysockets/baileys');
const pino = require('pino');
const path = require('path');
const fs = require('fs');
const app = express();

function writeLog(level, message, data = null) {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [${level.toUpperCase()}] ${message}`);
    if (data) console.log(JSON.stringify(data, null, 2));
}

writeLog('info', '🚀 DannPair Server Starting...');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.post('/api/pair', async (req, res) => {
    const { target, loop } = req.body;
    if (!target) return res.json({ status: 'error', message: 'Nomor kosong' });

    const cleanTarget = target.replace(/[^0-9]/g, '');
    if (!cleanTarget.match(/^62[0-9]{9,13}$/)) {
        return res.json({ status: 'error', message: 'Format nomor salah (62xxx)' });
    }

    try {
        const results = [];
        const maxLoop = Math.min(loop || 1, 20);

        for (let i = 1; i <= maxLoop; i++) {
            try {
                const sessionId = `session_${cleanTarget}_${Date.now()}_${i}`;
                const { state, saveCreds } = await useMultiFileAuthState(sessionId);
                const sock = makeWASocket({
                    auth: state,
                    printQRInTerminal: false,
                    logger: pino({ level: 'silent' }),
                    browser: ['Chrome', 'Windows', '120.0.0.0']
                });

                sock.ev.on('creds.update', saveCreds);
                const code = await sock.requestPairingCode(cleanTarget);
                
                results.push({
                    attempt: i,
                    success: true,
                    pairingCode: code,
                    message: `Kode ${code} dikirim ke ${cleanTarget}`
                });

                await delay(2000);
                sock.end(() => {});
                setTimeout(() => {
                    try { fs.rmSync(sessionId, { recursive: true, force: true }); } catch(e) {}
                }, 5000);
                if (i < maxLoop) await delay(3000);

            } catch (e) {
                results.push({ attempt: i, success: false, error: e.message });
            }
        }

        return res.json({ 
            status: 'ok', 
            results,
            summary: {
                total: maxLoop,
                success: results.filter(r => r.success).length,
                failed: results.filter(r => !r.success).length
            }
        });

    } catch (e) {
        return res.json({ status: 'error', message: e.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ DannPair running on port ${PORT}`);
});
