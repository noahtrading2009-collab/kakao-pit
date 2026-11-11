// ===== KAKAO PIT – Online-Verbindung mit Raumcode (WebRTC über PeerJS) =====
// Der Host meldet sich unter «kakaopit-<CODE>» beim öffentlichen PeerJS-Vermittler an.
// Spieler verbinden sich direkt (Peer-to-Peer) mit dem Host. Der Vermittler dient nur zum Finden.

const Net = (() => {
    const PREFIX = 'kakaopit-v1-';
    const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    // STUN für die direkte Verbindung. Blockiert ein Netz diese, übernimmt der Ausweich-Weg (MQTT, unten).
    const ICE = {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun.cloudflare.com:3478' },
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
        return typeof Peer !== 'undefined' || typeof mqtt !== 'undefined';
    }

    // ===== Ausweich-Weg: Nachrichten über einen öffentlichen MQTT-Server (WebSocket) =====
    // Funktioniert überall, wo normale Webseiten laden – auch wenn das Netz direkte Verbindungen blockiert.
    const RELAY = 'wss://broker.hivemq.com:8884/mqtt';
    const topic = code => `kakaopit/v1/${code.toUpperCase().trim()}`;
    const relayOK = () => typeof mqtt !== 'undefined';
    const relayClient = () => mqtt.connect(RELAY, { reconnectPeriod: 2000, connectTimeout: 8000, keepalive: 20 });
    const parse = m => { try { return JSON.parse(m.toString()); } catch (e) { return null; } };

    function hostRelay(code, h) {
        const base = topic(code);
        const cl = relayClient();
        const conns = new Map();
        const pub = (id, o) => { if (cl.connected) cl.publish(`${base}/p/${id}`, JSON.stringify(o)); };
        const drop = id => {
            const e = conns.get(id);
            if (!e) return;
            conns.delete(id);
            e.conn.open = false;
            h.onClose && h.onClose(e.conn);
        };
        cl.on('connect', () => cl.subscribe(`${base}/h`, () => h.onRelay(true)));
        cl.on('close', () => h.onRelay(false));
        cl.on('message', (t, m) => {
            const msg = parse(m);
            if (!msg || typeof msg.f !== 'string') return;
            let e = conns.get(msg.f);
            if (msg.k === 'hello') {
                if (!e) {
                    const id = msg.f;
                    const conn = { peer: `relay-${id}`, open: true, relay: true, send: o => pub(id, { k: 'd', d: o }) };
                    e = { conn, last: Date.now() };
                    conns.set(id, e);
                    h.onConn && h.onConn(conn);
                }
                e.last = Date.now();
                return pub(msg.f, { k: 'welcome' });
            }
            if (!e) return pub(msg.f, { k: 'gone' });
            e.last = Date.now();
            if (msg.k === 'bye') return drop(msg.f);
            if (msg.k === 'd') h.onData && h.onData(e.conn, msg.d);
        });
        const hb = setInterval(() => {
            const now = Date.now();
            for (const [id, e] of conns) {
                if (now - e.last > 25000) drop(id);
                else pub(id, { k: 'hb' });
            }
        }, 5000);
        return { destroy() { clearInterval(hb); try { cl.end(true); } catch (e) { /* egal */ } } };
    }

    function joinRelay(code, h) {
        const base = topic(code);
        const id = Math.random().toString(36).slice(2, 12);
        const cl = relayClient();
        let conn = null;
        let last = Date.now();
        const pub = o => { if (cl.connected) cl.publish(`${base}/h`, JSON.stringify({ f: id, ...o })); };
        const close = () => { if (conn && conn.open) { conn.open = false; h.onClose && h.onClose(); } };
        cl.on('connect', () => cl.subscribe(`${base}/p/${id}`, () => pub({ k: 'hello' })));
        cl.on('message', (t, m) => {
            const msg = parse(m);
            if (!msg) return;
            last = Date.now();
            if (msg.k === 'welcome') {
                if (!conn) {
                    conn = { peer: 'host', open: true, relay: true, send: o => pub({ k: 'd', d: o }) };
                    h.onOpen && h.onOpen(conn);
                }
                return;
            }
            if (!conn) return;
            if (msg.k === 'd') h.onData && h.onData(msg.d);
            else if (msg.k === 'gone') close();
        });
        const ping = setInterval(() => {
            if (!conn) return pub({ k: 'hello' });
            if (!conn.open) return;
            pub({ k: 'hb' });
            if (Date.now() - last > 25000) close();
        }, 5000);
        return {
            destroy() {
                clearInterval(ping);
                if (conn && conn.open) { pub({ k: 'bye' }); conn.open = false; }
                setTimeout(() => { try { cl.end(true); } catch (e) { /* egal */ } }, 300);
            },
        };
    }

    // Host: hält den Raum offen und meldet sich nach Unterbrüchen (WLAN-Wechsel, Standby) selbst wieder an.
    function hostRtc(code, h) {
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
    function joinRtc(code, h) {
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

    // Host: beide Wege gleichzeitig offen halten.
    function host(code, h) {
        let rtcUp = false;
        let relayUp = false;
        const upd = () => {
            if (rtcUp || relayUp) h.onOpen && h.onOpen();
            else h.onStatus && h.onStatus('reconnect');
        };
        const rtc = typeof Peer !== 'undefined' ? hostRtc(code, {
            ...h,
            onOpen: () => { rtcUp = true; upd(); },
            onStatus: s => { if (s === 'reconnect') { rtcUp = false; upd(); } },
            onError: t => { if (t === 'taken' || !relayUp) h.onError && h.onError(t); },
        }) : null;
        const relay = relayOK() ? hostRelay(code, { ...h, onRelay: up => { relayUp = up; upd(); } }) : null;
        return { destroy() { if (rtc) rtc.destroy(); if (relay) relay.destroy(); } };
    }

    // Spieler: direkte Verbindung und Ausweich-Weg gleichzeitig versuchen – der schnellere gewinnt.
    function join(code, h) {
        let winner = null;
        let rtcErr = null;
        let relayDead = !relayOK();
        let done = false;
        let rtc = null;
        let relay = null;
        const finishFail = () => {
            if (done || winner || !rtcErr || !relayDead) return;
            done = true;
            h.onError && h.onError(rtcErr);
        };
        const wrap = (name, other) => ({
            onOpen: conn => {
                if (winner || done) return;
                winner = name;
                const o = other();
                if (o) o.destroy();
                h.onOpen && h.onOpen(conn);
            },
            onData: d => { if (winner === name) h.onData && h.onData(d); },
            onClose: () => { if (winner === name) h.onClose && h.onClose(); },
            onStatus: s => { if (!winner && relayDead) h.onStatus && h.onStatus(s); },
        });
        if (typeof Peer !== 'undefined') {
            rtc = joinRtc(code, {
                ...wrap('rtc', () => relay),
                onError: m => {
                    if (winner === 'rtc') return h.onClose && h.onClose();
                    rtcErr = m;
                    finishFail();
                },
            });
        } else rtcErr = 'Keine Verbindung zum Beamer. Prüft das Internet.';
        if (!relayDead) {
            relay = joinRelay(code, wrap('relay', () => rtc));
            setTimeout(() => { if (winner !== 'relay') { relayDead = true; finishFail(); } }, 15000);
        }
        return { destroy() { done = true; if (rtc) rtc.destroy(); if (relay) relay.destroy(); } };
    }

    return { makeCode, host, join, available };
})();
