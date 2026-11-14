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
                delay: 3 + Math.floor(Math.random() * 8),   // Reaktionszeit auf Gerüchte (wie ein Mensch)
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
        if (p.role === 'producer' && !p.protect && Math.random() < (Engine.protectPrice() > CFG.protectLow ? 0.004 : 0.012)) Engine.protect(p.id);
        if (p.buyerOffer && Math.random() < 0.15) Engine.answerBuyer(p.id, p.buyerOffer.price >= G.price * (0.995 + Math.random() * 0.03));
        if (p.orderOffer && Math.random() < 0.15) Engine.answerOrder(p.id, Math.random() < 0.6 + (m.ratio - 0.7));
        // Timing: Bauern sichern mehr ab, wenn der Preis hoch ist, Fabriken, wenn er tief ist.
        const rel = G.price / G.p0 - 1;
        let ratio = clamp(m.ratio * 0.55 + (p.role === 'producer' ? rel : -rel) * 3.5, 0.1, 1);
        // Im letzten Monat den Rest absichern (sonst droht der Notverkauf-Abschlag) – aber nicht alle gleich konsequent.
        if (G.month >= CFG.months) ratio = Math.max(ratio, m.ratio);
        const target = Math.round((-p.physical / CFG.size) * ratio);
        const gap = target - p.pos;
        if (Math.abs(gap) >= 1 && Math.random() < m.pace) {
            Engine.trade(p.id, Math.sign(gap) * Math.min(Math.abs(gap), 1 + Math.floor(Math.random() * 2)));
        }
    }

    function speculate(p, m, G) {
        const pl = Engine.futEq(p) - Engine.req(p);
        const unreal = p.pos * (G.price - G.ref) * CFG.size;
        if (p.pos && (unreal > m.greed || unreal < -m.pain) && Math.random() < 0.3) {
            return Engine.trade(p.id, -Math.sign(p.pos) * Math.min(Math.abs(p.pos), 3));
        }
        const rumors = Engine.activeRumors();
        if (rumors.length && Engine.feat('research') && p.researchAt < G.sec - 30 && Math.random() < 0.06) {
            Engine.research(p.id);
            const r = rumors[0];
            const last = p.reports[p.reports.length - 1];
            if (last) m.view = { until: G.clock + r.left, dir: last.text.includes('steigen') ? 1 : -1 };
        }
        if (m.view && G.clock < m.view.until) {
            const want = m.view.dir * 8;
            if (want !== p.pos && Math.random() < 0.3) return Engine.trade(p.id, Math.sign(want - p.pos) * Math.min(3, Math.abs(want - p.pos)));
        } else if (rumors.length && rumors[0].since >= m.delay) {
            const r = rumors[0];
            const want = Math.sign(r.impact) * Math.round(4 + Math.abs(r.impact) * 40);
            if (r.left <= 2 && p.pos && Math.random() < 0.5) return Engine.trade(p.id, -Math.sign(p.pos) * Math.min(Math.abs(p.pos), 3));
            if (Math.sign(want - p.pos) !== 0 && Math.random() < 0.25) return Engine.trade(p.id, Math.sign(want - p.pos) * Math.min(3, Math.abs(want - p.pos)));
        } else if (Math.random() < 0.04) {
            Engine.trade(p.id, (Math.random() < 0.55 ? m.bias : -m.bias) * (1 + Math.floor(Math.random() * 2)));
        }
    }

    function reset() {
        mind.clear();
    }

    return { step, reset };
})();
