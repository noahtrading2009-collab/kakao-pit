// ===== KAKAO PIT – Online-Verbindung mit Raumcode (WebRTC über PeerJS) =====
// Der Host meldet sich unter «kakaopit-<CODE>» beim öffentlichen PeerJS-Vermittler an.
// Spieler verbinden sich direkt (Peer-to-Peer) mit dem Host. Der Vermittler dient nur zum Finden.

const Net = (() => {
    const PREFIX = 'kakaopit-v1-';
    const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    // STUN + TURN: TURN leitet Daten weiter, wenn ein Netz (Schule, Mobilfunk) direkte Verbindungen blockiert.
    const ICE = {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun.cloudflare.com:3478' },
            { urls: ['turn:eu-0.turn.peerjs.com:3478', 'turn:us-0.turn.peerjs.com:3478'], username: 'peerjs', credential: 'peerjsp' },
        ],
        sdpSemantics: 'unified-plan',
    };
    const OPTS = { debug: 1, config: ICE, pingInterval: 4000 };

    function makeCode() {
        let c = '';
        for (let i = 0; i < 5; i++) c += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
        return c;
    }

    function available() {
        return typeof Peer !== 'undefined';
    }

    // Host: hält den Raum offen und meldet sich nach Unterbrüchen (WLAN-Wechsel, Standby) selbst wieder an.
    function host(code, h) {
        let peer = null;
        let wasOpen = false;
        let stopped = false;
        let retryTimer = null;

        const status = s => h.onStatus && h.onStatus(s);

        function retry(ms) {
            if (stopped || retryTimer) return;
            status('reconnect');
            retryTimer = setTimeout(() => {
                retryTimer = null;
                if (stopped) return;
                if (peer && !peer.destroyed && peer.disconnected) {
                    try { peer.reconnect(); } catch (e) { fresh(); }
                } else if (!peer || peer.destroyed) {
                    fresh();
                }
            }, ms);
        }

        function kill(p) {
            if (!p) return;
            p.kpDead = true;
            try { p.destroy(); } catch (e) { /* egal */ }
        }

        function fresh() {
            kill(peer);
            const p = new Peer(PREFIX + code, OPTS);
            peer = p;
            p.on('open', () => { if (p.kpDead) return; wasOpen = true; status('open'); h.onOpen && h.onOpen(); });
            p.on('connection', conn => {
                conn.on('open', () => h.onConn && h.onConn(conn));
                conn.on('data', d => h.onData && h.onData(conn, d));
                conn.on('close', () => h.onClose && h.onClose(conn));
                conn.on('error', () => h.onClose && h.onClose(conn));
            });
            p.on('disconnected', () => { if (!p.kpDead) retry(1500); });
            p.on('error', e => {
                if (p.kpDead) return;
                const t = e.type || 'error';
                if (t === 'unavailable-id') {
                    // Vor dem ersten Öffnen: Code ist vergeben → neuer Code. Danach: unser alter Eintrag
                    // hängt noch beim Vermittler → gleichen Code nochmals versuchen.
                    if (!wasOpen) return h.onError && h.onError('taken');
                    kill(p);
                    return retry(4000);
                }
                if (t === 'peer-unavailable') return; // betrifft nur eine einzelne Verbindung
                if (['network', 'server-error', 'socket-error', 'socket-closed', 'disconnected'].includes(t)) {
                    return retry(3000);
                }
                h.onError && h.onError(t);
            });
        }

        // Laptop wacht auf / Internet ist zurück → sofort neu anmelden.
        const wake = () => { if (peer && (peer.disconnected || peer.destroyed)) retry(200); };
        window.addEventListener('online', wake);
        document.addEventListener('visibilitychange', () => { if (!document.hidden) wake(); });

        fresh();
        return {
            destroy() { stopped = true; clearTimeout(retryTimer); kill(peer); },
            get open() { return !!peer && !peer.disconnected && !peer.destroyed; },
        };
    }

    // Spieler: verbindet sich mit dem Host. Bleibt es zu lange still, wird automatisch neu versucht.
    function join(code, h) {
        const target = PREFIX + code.toUpperCase().trim();
        let peer = null;
        let attempt = 0;
        let done = false;
        let timer = null;
        const MAX = 3;

        function fail(msg) {
            clearTimeout(timer);
            if (done) return;
            done = true;
            h.onError && h.onError(msg);
        }

        function tryOnce() {
            attempt++;
            clearTimeout(timer);
            if (peer) { try { peer.destroy(); } catch (e) { /* egal */ } }
            if (attempt > 1) h.onStatus && h.onStatus(`Verbinde … (Versuch ${attempt} von ${MAX})`);
            let opened = false;
            const p = new Peer(undefined, OPTS);
            peer = p;
            timer = setTimeout(() => {
                if (opened) return;
                if (attempt < MAX) tryOnce();
                else fail('Keine Verbindung zum Beamer. Ist der Beamer-Tab noch offen? Im Schul-WLAN hilft oft ein Handy-Hotspot oder mobile Daten.');
            }, 12000);
            p.on('open', () => {
                if (p !== peer) return;
                const conn = p.connect(target, { reliable: true, serialization: 'json' });
                conn.on('open', () => {
                    opened = true;
                    clearTimeout(timer);
                    h.onOpen && h.onOpen(conn);
                });
                conn.on('data', d => h.onData && h.onData(d));
                conn.on('close', () => opened && h.onClose && h.onClose());
                conn.on('error', () => opened && h.onClose && h.onClose());
            });
            p.on('error', e => {
                if (p !== peer || done) return;
                if (opened) return h.onClose && h.onClose();
                if (e.type === 'peer-unavailable') {
                    // Raum (noch) nicht gefunden – der Host meldet sich evtl. gerade neu an.
                    if (attempt < MAX) { clearTimeout(timer); timer = setTimeout(tryOnce, 2500); return; }
                    return fail(`Raum ${code.toUpperCase()} nicht gefunden. Stimmt der Code? Ist der Beamer-Tab noch offen?`);
                }
                if (attempt < MAX) { clearTimeout(timer); timer = setTimeout(tryOnce, 2000); return; }
                fail(`Verbindungsfehler (${e.type}). Prüft das Internet – im Schul-WLAN hilft oft ein Handy-Hotspot.`);
            });
        }

        tryOnce();
        return { destroy() { done = true; clearTimeout(timer); if (peer) peer.destroy(); } };
    }

    return { makeCode, host, join, available };
})();
