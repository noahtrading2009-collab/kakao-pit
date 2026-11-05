// ===== NETTO NULL – Online-Verbindung mit Raumcode (WebRTC über PeerJS) =====
// Der Host meldet sich unter «nettonull-<CODE>» beim öffentlichen PeerJS-Vermittler an.
// Spieler verbinden sich direkt (Peer-to-Peer) mit dem Host. Der Vermittler dient nur zum Finden.

const Net = (() => {
    const PREFIX = 'nettonull-v1-';
    const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

    function makeCode() {
        let c = '';
        for (let i = 0; i < 5; i++) c += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
        return c;
    }

    function available() {
        return typeof Peer !== 'undefined';
    }

    function host(code, h) {
        const peer = new Peer(PREFIX + code, { debug: 1 });
        peer.on('open', () => h.onOpen && h.onOpen());
        peer.on('connection', conn => {
            conn.on('open', () => h.onConn && h.onConn(conn));
            conn.on('data', d => h.onData && h.onData(conn, d));
            conn.on('close', () => h.onClose && h.onClose(conn));
            conn.on('error', () => h.onClose && h.onClose(conn));
        });
        peer.on('error', e => h.onError && h.onError(e.type === 'unavailable-id' ? 'taken' : e.type || 'error'));
        peer.on('disconnected', () => {
            if (!peer.destroyed) setTimeout(() => peer.reconnect(), 1500);
        });
        return peer;
    }

    function join(code, h) {
        const peer = new Peer(undefined, { debug: 1 });
        let conn = null;
        peer.on('open', () => {
            conn = peer.connect(PREFIX + code.toUpperCase().trim(), { reliable: true, serialization: 'json' });
            conn.on('open', () => h.onOpen && h.onOpen(conn));
            conn.on('data', d => h.onData && h.onData(d));
            conn.on('close', () => h.onClose && h.onClose());
            conn.on('error', () => h.onClose && h.onClose());
        });
        peer.on('error', e => h.onError && h.onError(e.type === 'peer-unavailable' ? 'Raum nicht gefunden. Stimmt der Code?' : `Verbindungsfehler (${e.type})`));
        return peer;
    }

    return { makeCode, host, join, available };
})();
