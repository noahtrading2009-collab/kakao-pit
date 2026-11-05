// ===== KAKAO PIT – KI-Trader (füllen den Markt, damit auch kleine Gruppen spielen können) =====

const Bots = (() => {
    const mind = new Map();

    function brain(p) {
        if (!mind.has(p.id)) {
            mind.set(p.id, {
                ratio: 0.55 + Math.random() * 0.45,   // wie stark ein Hedger absichert
                pace: 0.08 + Math.random() * 0.14,    // wie oft er handelt
                greed: 6000 + Math.random() * 8000,   // Gewinnmitnahme Spekulant
                pain: 7000 + Math.random() * 7000,    // Stop-Loss Spekulant
                bias: Math.random() < 0.5 ? 1 : -1,
            });
        }
        return mind.get(p.id);
    }

    function step() {
        const G = Engine.G;
        if (!G || G.phase !== 'trading') {
            // Margin Calls auch in der Abrechnungspause beantworten.
            if (G && G.phase === 'settle') G.players.filter(p => p.bot && p.call).forEach(answerCall);
            return;
        }
        for (const p of G.players) {
            if (!p.bot || p.bankrupt) continue;
            if (p.call) {
                answerCall(p);
                continue;
            }
            const m = brain(p);
            if (p.role === 'spec') speculate(p, m, G);
            else hedge(p, m, G);
        }
    }

    function answerCall(p) {
        if (Math.random() < 0.5) return;
        const r = Engine.topUp(p.id);
        if (!r.ok && p.pos) Engine.trade(p.id, -Math.sign(p.pos) * Math.max(1, Math.ceil(Math.abs(p.pos) / 3)));
    }

    function hedge(p, m, G) {
        const target = Math.round((-ROLES[p.role].physical / CFG.size) * m.ratio);
        const gap = target - p.pos;
        // Gute Angebote anderer Spieler in die richtige Richtung annehmen.
        const good = G.offers.find(o => o.by !== p.id
            && (gap > 0 ? o.side === 'sell' && o.price <= G.price * 1.002 : o.side === 'buy' && o.price >= G.price * 0.998)
            && o.qty <= Math.abs(gap));
        if (good && Math.random() < 0.35) return Engine.acceptOffer(p.id, good.id);
        if (Math.abs(gap) >= 1 && Math.random() < m.pace) {
            Engine.trade(p.id, Math.sign(gap) * Math.min(Math.abs(gap), 1 + Math.floor(Math.random() * 2)));
        }
        if (Math.random() < 0.01 && Math.abs(gap) >= 2) {
            const side = gap > 0 ? 'buy' : 'sell';
            Engine.postOffer(p.id, side, Math.min(3, Math.abs(gap)), G.price * (side === 'buy' ? 0.995 : 1.005));
        }
    }

    function speculate(p, m, G) {
        const pl = Engine.futEq(p) - Engine.req(p);
        const unreal = p.pos * (G.price - G.ref) * CFG.size;
        if (p.pos && (unreal > m.greed || unreal < -m.pain) && Math.random() < 0.3) {
            return Engine.trade(p.id, -Math.sign(p.pos) * Math.min(Math.abs(p.pos), 3));
        }
        const rumors = Engine.activeRumors();
        if (rumors.length) {
            const r = rumors[0];
            const want = Math.sign(r.impact) * Math.round(4 + Math.abs(r.impact) * 40);
            if (r.left <= 2 && p.pos && Math.random() < 0.5) return Engine.trade(p.id, -Math.sign(p.pos) * Math.min(Math.abs(p.pos), 3));
            if (Math.sign(want - p.pos) !== 0 && Math.random() < 0.25) return Engine.trade(p.id, Math.sign(want - p.pos) * Math.min(3, Math.abs(want - p.pos)));
        } else if (Math.random() < 0.04) {
            Engine.trade(p.id, (Math.random() < 0.55 ? m.bias : -m.bias) * (1 + Math.floor(Math.random() * 2)));
        }
        if (Math.random() < 0.015 && pl > 5000) {
            const side = Math.random() < 0.5 ? 'buy' : 'sell';
            Engine.postOffer(p.id, side, 1 + Math.floor(Math.random() * 3), G.price * (side === 'buy' ? 0.996 : 1.004));
        }
    }

    function reset() {
        mind.clear();
    }

    return { step, reset };
})();
