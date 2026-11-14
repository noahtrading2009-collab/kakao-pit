// ===== KAKAO PIT – Markt-Engine (läuft nur beim Host, der Host ist die Börse) =====
// Kontrakt: 10 t Kakao, Fälligkeit Dezember (nach CFG.months Handelsmonaten).
// Konten pro Spieler: cash (frei) + margin (Einschuss bei der Börse).
// Abrechnung (Mark-to-Market) am Ende jedes Monats gegen den Referenzpreis G.ref.
// Ein Trade zum Preis X verbucht sofort (ref − X) × Menge aufs Margin-Konto, damit die
// spätere Abrechnung gegen ref genau den Gewinn ab X ergibt.

const Engine = (() => {
    let G = null;
    let emit = () => {};

    function create(len, onEvent, years) {
        emit = onEvent || (() => {});
        G = {
            phase: 'lobby', len, monthSec: CFG.monthSec[len] || CFG.monthSec.normal,
            clock: 0, sec: 0, month: 1, settleLeft: 0,
            p0: CFG.p0, price: CFG.p0, ref: CFG.p0, marginRate: CFG.marginRate, pendingRate: null,
            history: [{ s: 0, p: CFG.p0 }], marks: [], feed: [], events: [], players: [], tape: [],
            flow: 0, drift: 0, seq: 1, trades: [],
            year: 1, years: years || CFG.years, yearLog: [], shopLeft: 0, deals: [],
            // Einmal pro Karriere (ab 2 Jahren) ein Krisenjahr wie 2024
            crisisYear: (years || CFG.years) >= 2 ? 2 + Math.floor(Math.random() * ((years || CFG.years) - 1)) : 0,
        };
        return G;
    }

    // ===== Spieler =====

    function chooseRole() {
        const counts = { producer: 0, processor: 0, spec: 0 };
        G.players.forEach(p => { counts[p.role]++; });
        const min = Math.min(...Object.values(counts));
        return rand(Object.keys(counts).filter(k => counts[k] === min));
    }

    function addPlayer(name, key, bot = false, role = null) {
        const existing = key && G.players.find(p => p.key === key);
        if (existing) {
            existing.connected = true;
            return existing;
        }
        if (G.phase === 'end') return null;
        const late = G.phase !== 'lobby';
        const ref = late ? G.price : G.p0;   // Wer später kommt, startet neutral zum aktuellen Preis
        role = role || chooseRole();
        const R = ROLES[role];
        const p = {
            id: G.seq++, name: String(name || 'Trader').slice(0, 18), key, bot, role, connected: true,
            cash: R.cash, margin: 0, pos: 0, fees: 0, trades: 0, liquidations: 0, bankrupt: false,
            call: null, expAcc: 0, expN: 0, startValue: R.cash + R.physical * ref, planValue: R.physical * ref, planP: ref, notes: [],
            physical: R.physical, basePhys: R.physical, revenue: 0, protect: false, harvestLog: [],
            upgrades: [], total: 0, yearPts: [], years: [], upSpent: 0, interest: 0, loans: 0, level: 0,
            region: null, settled: false, lastResult: 0, spotPaid: 0,
            orders: [], orderOffer: null, nextOrderAt: 8 + Math.floor(Math.random() * CFG.orderEvery),
            reports: [], job: null, researchSpent: 0,
            costs: 0,                                   // Pflanzenschutz, Bankzuschlag (für den Hedge-Vergleich)
            buyerOffer: null, nextBuyerAt: 10 + Math.floor(Math.random() * CFG.buyerEvery), sales: [],
            rep: 0, decision: null, pending: [], qPrem: 0, dried: false, marginMult: 1, needCut: 0, recipeSteps: 0, dealsT: 0, lostSmuggle: 0, memberBonus: 0,
            nextSmuggleAt: 20 + Math.floor(Math.random() * 25),
        };
        if (role === 'producer') p.region = pickRegion();
        G.players.push(p);
        if (late && !bot) feed({ kind: 'bell', icon: '👋', text: `${p.name} steigt als ${R.short} ein.` });
        return p;
    }

    function pickRegion() {
        const cnt = Object.fromEntries(COCOA_REGIONS.map(r => [r, 0]));
        G.players.forEach(p => { if (p.region && cnt[p.region] !== undefined) cnt[p.region]++; });
        const min = Math.min(...Object.values(cnt));
        return rand(COCOA_REGIONS.filter(r => cnt[r] === min));
    }

    // Players may pick or switch their role while the room is still in the lobby.
    function setRole(id, role) {
        const p = byId(id);
        if (!p || G.phase !== 'lobby' || !ROLES[role]) return false;
        const R = ROLES[role];
        p.role = role;
        p.cash = R.cash;
        p.physical = R.physical;
        p.basePhys = R.physical;
        p.region = role === 'producer' ? (p.region || pickRegion()) : null;
        p.startValue = R.cash + R.physical * G.p0;
        p.planValue = R.physical * G.p0;
        p.planP = G.p0;
        return true;
    }

    function removePlayer(id) {
        if (G.phase === 'lobby') G.players = G.players.filter(p => p.id !== id);
    }

    const byId = id => G.players.find(p => p.id === id);
    const has = (p, u) => p.upgrades.includes(u);
    const unrealC = p => p.pos * (G.price - G.ref) * CFG.size;
    const futEq = p => p.margin + unrealC(p);
    const req = (p, pos = p.pos) => Math.abs(pos) * G.price * CFG.size * G.marginRate;
    const exposure = p => p.physical + p.pos * CFG.size;
    // Was im Dezember nicht abgesichert ist, muss kurzfristig zum Tagespreis gehandelt werden –
    // mit Abschlag (Notverkauf) bzw. Aufschlag (Notkauf). So ist Nichtstun eine Wette, die etwas kostet.
    const openTons = p => (p.role === 'producer' ? Math.max(0, p.physical + Math.min(0, p.pos) * CFG.size)
        : p.role === 'processor' ? Math.max(0, -p.physical - Math.max(0, p.pos) * CFG.size) : 0);
    const spotCost = p => openTons(p) * G.price * CFG.spotPenalty;
    const liveResult = p => (p.settled ? p.lastResult : p.cash + futEq(p) + p.physical * G.price + p.revenue - p.startValue - spotCost(p));
    // Was hat die Absicherung bisher gebracht? Vergleich mit «gar nichts abgesichert» (inkl. Notverkauf-Abschlag).
    const hedgeEffect = p => liveResult(p) - (p.physical * G.price + p.revenue - p.planValue - Math.abs(p.physical) * G.price * CFG.spotPenalty) + p.costs + p.researchSpent;
    // Gesicherter Durchschnittspreis der abgesicherten Tonnen (Futures-Einstieg)
    const securedPrice = p => (p.pos && p.role !== 'spec' && p.hedgeT ? Math.round(p.hedgeV / p.hedgeT) : null);
    // Progressive Einführung: Jahr 1 nur das Kernspiel, Nebenmechaniken ab Jahr 2 bzw. 3.
    function feat(k) {
        if (!G) return false;
        if (G.years === 1) return CFG.singleYearFeatures.includes(k);
        return G.year >= (CFG.featureYear[k] || 1);
    }
    function hedgeQuote(p) {
        if (p.role === 'spec' || !p.expN) return 0;
        return clamp(1 - p.expAcc / p.expN / 100, 0, 1);
    }
    // Kein Hedge-Bonus mehr: Hedger treten gegeneinander um den besten Preis an.
    const bonus = () => 0;
    const score = p => liveResult(p);
    // Kennzahl pro Rolle: Bauern = erzielter Preis pro Tonne (Plan 100 t),
    // Fabrik = effektiver Einkaufspreis pro Tonne Grundbedarf, Fonds = Gewinn.
    function metric(p, res = liveResult(p)) {
        // Bauern: Gesamterlös (Ernte + Direktverkäufe + Futures − Kosten) geteilt durch alle Tonnen inkl. Nachernte.
        if (p.role === 'producer') return Math.round((res + p.planValue) / Math.max(10, p.physical + p.sales.reduce((s, x) => s + x.t, 0)));
        if (p.role === 'processor') return Math.round((-p.planValue - res) / Math.max(10, -p.basePhys));
        return Math.round(res);
    }

    // Bankauflage: Hedger müssen bis Ende Monat CFG.bankMonth mindestens CFG.bankQuota abgesichert haben.
    function hedgedShare(p) {
        if (p.role === 'producer') return p.physical > 0 ? Math.max(0, -p.pos * CFG.size) / p.physical : 0;
        if (p.role === 'processor') return -p.physical > 0 ? Math.max(0, p.pos * CFG.size) / -p.physical : 0;
        return 0;
    }

    function note(p, kind, text) {
        p.notes.push({ kind, text, sec: G.sec });
        if (p.notes.length > 20) p.notes.shift();
        emit('note', { pid: p.id, kind, text });
    }

    // ===== Handel =====

    function execute(p, q, price, fee, reducing) {
        // Für den Chart: Wer ist wann ein- bzw. ausgestiegen?
        G.trades.push({ s: G.clock, pid: p.id, q, price, open: Math.abs(p.pos + q) > Math.abs(p.pos) });
        if (G.trades.length > 3000) G.trades.shift();
        p.margin += q * (G.ref - price) * CFG.size;
        // Durchschnittlicher Einstiegspreis der offenen Position (für «gesicherter Preis»)
        if (Math.sign(p.pos + q) !== Math.sign(p.pos) && p.pos !== 0) { p.hedgeT = 0; p.hedgeV = 0; }
        if (Math.abs(p.pos + q) > Math.abs(p.pos)) {
            const add = Math.abs(p.pos + q) - Math.abs(p.pos);
            p.hedgeT = (p.hedgeT || 0) + add * CFG.size;
            p.hedgeV = (p.hedgeV || 0) + add * CFG.size * price;
        } else if (p.hedgeT) {
            const keep = Math.abs(p.pos + q) * CFG.size;
            p.hedgeV = p.hedgeT ? (p.hedgeV / p.hedgeT) * keep : 0;
            p.hedgeT = keep;
        }
        p.pos += q;
        p.cash -= fee;
        p.fees += fee;
        p.trades++;
        const need = req(p);
        const eq = futEq(p);
        if (eq < need) {
            const t = Math.min(need - eq, Math.max(0, p.cash));
            p.cash -= t;
            p.margin += t;
        } else if (reducing && eq > need) {
            const r = Math.min(eq - need, Math.max(0, p.margin));
            p.margin -= r;
            p.cash += r;
        }
        if (p.call && (p.pos === 0 || futEq(p) >= req(p))) {
            p.call = null;
            note(p, 'good', 'Margin Call erledigt.');
        }
    }

    // Jede Rolle hat ihren eigenen erlaubten Bereich (Mandat):
    // Kooperative nur Short bis zur Erntemenge, Fabrik nur Long bis zum Bedarf, Fonds frei.
    function bounds(p) {
        if (p.role === 'producer') return { min: -Math.floor(Math.max(0, p.physical) / CFG.size), max: 0 };
        if (p.role === 'processor') return { min: 0, max: Math.floor(Math.max(0, -p.physical) / CFG.size) };
        const lim = ROLES[p.role].limit + (has(p, "credit") ? 10 : 0);
        return { min: -lim, max: lim };
    }

    function mandate(p, newPos) {
        const b = bounds(p);
        if (newPos >= b.min && newPos <= b.max) return null;
        // Bestehende Überabsicherung abbauen ist immer erlaubt.
        if (Math.abs(newPos) < Math.abs(p.pos) && Math.sign(newPos) !== -Math.sign(p.pos)) return null;
        if (p.role === 'producer') {
            if (newPos > 0) return 'Als Kooperative darfst du keine Futures kaufen – du sicherst nur deine Ernte ab. Spekulieren ist Sache der Hedgefonds.';
            return `Mandat: Du darfst höchstens deine Ernte absichern – ${p.physical} t = ${-b.min} Kontrakte.`;
        }
        if (p.role === 'processor') {
            if (newPos < 0) return 'Als Fabrik darfst du keine Futures verkaufen – du sicherst nur deinen Einkauf ab. Spekulieren ist Sache der Hedgefonds.';
            return `Mandat: Du darfst höchstens deinen Bedarf absichern – ${-p.physical} t = ${b.max} Kontrakte. Mehr Aufträge = mehr Bedarf.`;
        }
        return `Positionslimit: höchstens ${b.max} Kontrakte.`;
    }

    function check(p, newPos, fee) {
        if (!p || p.bankrupt) return 'Dein Konto ist gesperrt (Konkurs).';
        if (G.phase === 'pre') return `Pre-Market: Die Börse öffnet in ${G.preLeft} s.`;
        if (G.phase !== 'trading') return 'Die Börse ist gerade geschlossen.';
        if (G.paused) return 'Pause – die Spielleitung erklärt gerade etwas.';
        const m = mandate(p, newPos);
        if (m) return m;
        if (Math.abs(newPos) > Math.abs(p.pos) && p.cash + futEq(p) - fee < req(p, newPos)) {
            return `Zu wenig Geld für den Einschuss (${fmt(req(p, newPos))} CHF nötig).`;
        }
        return null;
    }

    function trade(id, q) {
        const p = byId(id);
        q = Math.trunc(q);
        if (!q) return { ok: false, msg: 'Ungültige Menge.' };
        const fee = Math.abs(q) * CFG.fee;
        const err = check(p, p && p.pos + q, fee);
        if (err) return { ok: false, msg: err };
        const price = Math.round(G.price * (1 + Math.sign(q) * CFG.spread));
        const reducing = Math.abs(p.pos + q) < Math.abs(p.pos);
        execute(p, q, price, fee, reducing);
        G.flow += q;
        pushTape({ who: p.name, role: p.role, q, price, kind: 'markt' });
        return { ok: true, price, q };
    }

    function pushTape(t) {
        G.tape.unshift({ ...t, sec: G.sec });
        if (G.tape.length > 30) G.tape.pop();
        emit('trade', t);
    }

    function topUp(id) {
        const p = byId(id);
        if (!p || !p.call) return { ok: false, msg: 'Kein Margin Call offen.' };
        const need = req(p) - futEq(p);
        const t = Math.min(need, p.cash);
        p.cash -= t;
        p.margin += t;
        if (futEq(p) >= req(p) - 0.5) {
            p.call = null;
            return { ok: true, msg: 'Nachgeschossen – Position bleibt offen.' };
        }
        return { ok: false, msg: 'Nicht genug Bargeld. Reduziere deine Position!' };
    }

    function liquidate(p, why) {
        if (p.pos !== 0) {
            const q = -p.pos;
            const price = Math.round(G.price * (1 + Math.sign(q) * CFG.spread * 2));
            execute(p, q, price, Math.abs(q) * CFG.fee, true);
            G.flow += q;
            pushTape({ who: `${p.name} (Zwangsglattstellung)`, role: p.role, q, price, kind: 'liq' });
        }
        p.call = null;
        p.liquidations++;
        if (p.cash + p.margin < 0) {
            // Niemand fällt aus dem Spiel: Neustart mit Notkredit (Zins wird am Ende abgezogen).
            p.cash += p.margin;
            p.margin = 0;
            p.cash += CFG.loan;
            p.startValue += CFG.loan;
            p.loans++;
            p.interest += CFG.loan * CFG.loanRate;
            note(p, 'bad', `💀 Pleite! Die Bank gibt dir einen Notkredit von ${fmt(CFG.loan)} CHF (${fmt(CFG.loan * CFG.loanRate)} CHF Zins am Schluss). Du spielst weiter – mit kleinerem Risiko!`);
            feed({ kind: 'alert', icon: '💀', text: `${p.name} ist pleite – Neustart mit Notkredit.` });
        } else {
            p.cash += p.margin;
            p.margin = 0;
            note(p, 'bad', why);
        }
        emit('liquidation', { pid: p.id });
    }

    // ===== Rollen-Aktionen =====

    // Kooperative: Pflanzenschutz ist eine Versicherung – billig, solange es ruhig ist,
    // teuer, sobald ein Dürre- oder Krankheitsgerücht läuft.
    function protectPrice(p) {
        const risky = G.events.some(e => e.stage === 'rumor' && e.def.yield && e.def.yield < 1 && (!p || !e.region || e.region === p.region));
        return risky ? CFG.protectHigh : CFG.protectLow;
    }

    function protect(id) {
        const p = byId(id);
        if (!p || p.role !== 'producer') return { ok: false, msg: 'Nur für Kooperativen.' };
        if (!feat('protect')) return { ok: false, msg: 'Pflanzenschutz gibt es erst später in der Karriere.' };
        if (p.protect) return { ok: false, msg: 'Deine Plantage ist schon geschützt.' };
        if (G.phase !== 'trading' && G.phase !== 'settle') return { ok: false, msg: 'Erst wenn die Börse läuft.' };
        const c = protectPrice(p);
        if (p.cash < c) return { ok: false, msg: 'Zu wenig Geld.' };
        p.cash -= c;
        p.costs += c;
        p.protect = true;
        return { ok: true, msg: `Pflanzenschutz für ${fmt(c)} CHF gekauft: Ernteverluste werden ab jetzt halbiert.` };
    }

    // Kooperative: Händler bieten Direktverkäufe zu festem Preis an (Terminverkauf ohne Börse).
    function spawnBuyers() {
        if (!feat('buyers')) return;
        const total = CFG.months * G.monthSec;
        for (const p of G.players) {
            if (p.role !== 'producer' || p.bankrupt) continue;
            if (p.buyerOffer && G.sec >= p.buyerOffer.until) p.buyerOffer = null;
            if (p.buyerOffer || G.clock < p.nextBuyerAt || G.clock > total - 15 || p.physical < 20) continue;
            const t = Math.min(10 * (1 + Math.floor(Math.random() * 3)), Math.floor(p.physical / 10) * 10 - 10);
            if (t < 10) continue;
            const prem = Math.round((-130 + Math.random() * 280) / 5) * 5;   // mal besser, mal schlechter als die Börse
            p.buyerOffer = { id: G.seq++, client: rand(BUYERS), t, price: Math.round(G.price + prem), until: G.sec + CFG.orderSec };
            p.nextBuyerAt = G.clock + Math.round(CFG.buyerEvery * (0.7 + Math.random() * 0.6));
            note(p, 'good', `🤝 ${p.buyerOffer.client} will ${t} t kaufen – fester Preis ${fmt(p.buyerOffer.price)} CHF/t.`);
        }
    }

    function answerBuyer(id, accept) {
        const p = byId(id);
        if (!p || !p.buyerOffer) return { ok: false, msg: 'Das Angebot ist nicht mehr gültig.' };
        const o = p.buyerOffer;
        p.buyerOffer = null;
        if (!accept) return { ok: true, msg: `Angebot von ${o.client} abgelehnt.` };
        if (o.t > p.physical) return { ok: false, msg: 'So viel Kakao hast du nicht mehr.' };
        p.physical -= o.t;
        p.revenue += o.t * o.price;
        p.sales.push({ client: o.client, t: o.t, price: o.price });
        const over = -p.pos * CFG.size > p.physical;
        return { ok: true, msg: `Verkauft: ${o.t} t an ${o.client} zu ${fmt(o.price)} CHF/t – dieser Preis ist fix.${over ? ' ⚠️ Jetzt bist du überabgesichert – löse einen Teil auf!' : ''}` };
    }

    function harvestShock(def, confirmed, region) {
        if (!def.yield || !confirmed || !feat('yield')) return;
        for (const p of G.players) {
            if (p.role !== 'producer') continue;
            if (region && p.region !== region) continue;
            let f = def.yield;
            if (f < 1 && p.protect) f = 1 - (1 - f) / 2;
            if (f < 1 && has(p, "irrigation")) f = 1 - (1 - f) / 2;
            p.lastSky = def.id;
            const before = p.physical;
            p.physical = Math.max(10, Math.round(p.physical * f));
            const d = p.physical - before;
            p.harvestLog.push({ text: def.yes, d });
            note(p, d < 0 ? 'bad' : 'good', d < 0
                ? `🌱 Deine Ernte schrumpft um ${-d} t auf ${p.physical} t${p.protect ? ' (Pflanzenschutz hat die Hälfte gerettet)' : ''}. Prüfe deine Absicherung!`
                : `🌱 Deine Ernte wächst um ${d} t auf ${p.physical} t. Du kannst mehr absichern.`);
        }
    }

    // Fabrik: Kundenaufträge zu festem Verkaufspreis.
    function spawnOrders(mult = 1) {
        if (!feat('orders')) return;
        const total = CFG.months * G.monthSec;
        for (const p of G.players) {
            if (p.role !== 'processor' || p.bankrupt) continue;
            if (p.orderOffer && G.sec >= p.orderOffer.until) p.orderOffer = null;
            if (p.orderOffer || G.clock < p.nextOrderAt || G.clock > total - 15 || -p.physical >= 200) continue;
            const t = 10 * (1 + Math.floor(Math.random() * 3));
            const margin = Math.round((60 + Math.random() * 160) * mult * (has(p, "pralines") ? 1.6 : 1));
            p.orderOffer = { id: G.seq++, client: rand(CLIENTS), t, price: Math.round(G.price + margin), until: G.sec + CFG.orderSec };
            p.nextOrderAt = G.clock + Math.round(CFG.orderEvery * (has(p, "marketing") ? 0.55 : 1) * (0.7 + Math.random() * 0.6));
            note(p, 'good', `📦 Neuer Auftrag: ${p.orderOffer.client} will Schokolade aus ${t} t Kakao – fester Erlös ${fmt(p.orderOffer.price)} CHF/t.`);
        }
    }

    function answerOrder(id, accept) {
        const p = byId(id);
        if (!p || !p.orderOffer) return { ok: false, msg: 'Der Auftrag ist nicht mehr gültig.' };
        const o = p.orderOffer;
        p.orderOffer = null;
        if (!accept) return { ok: true, msg: `Auftrag von ${o.client} abgelehnt.` };
        p.physical -= o.t;
        p.revenue += o.t * o.price;
        p.orders.push({ client: o.client, t: o.t, price: o.price, at: G.price });
        return { ok: true, msg: `Auftrag angenommen: ${o.t} t zu ${fmt(o.price)} CHF/t. Dein Bedarf steigt auf ${-p.physical} t – sichere ihn ab!` };
    }

    // ===== Hedgefonds: Intel-Karte =====
    // Ein Bericht kostet Geld und Zeit und liefert ein Indiz – keine Lösung.
    const intelCost = (p, t) => Math.round(INTEL_TYPES[t].cost * (has(p, 'network') ? 0.5 : 1));
    const intelDur = (p, t) => Math.max(1, Math.round(INTEL_TYPES[t].dur * (has(p, 'network') ? 0.5 : 1)));
    const intelRel = (p, t) => Math.min(0.9, INTEL_TYPES[t].rel + (has(p, 'analysts') && !INTEL_TYPES[t].soft ? 0.12 : 0));

    function investigate(id, key) {
        const p = byId(id);
        if (!p || p.role !== 'spec') return { ok: false, msg: 'Nur für Hedgefonds.' };
        if (G.phase !== 'trading' && G.phase !== 'settle') return { ok: false, msg: 'Erst wenn die Börse läuft.' };
        if (G.paused) return { ok: false, msg: 'Pause.' };
        const [loc, type] = String(key).split(':');
        if (!INTEL_LOCS[loc] || !INTEL_LOCS[loc].types.includes(type)) return { ok: false, msg: 'Unbekannte Quelle.' };
        if (p.job) return { ok: false, msg: 'Dein Team arbeitet noch am letzten Bericht.' };
        const cost = intelCost(p, type);
        if (p.cash < cost) return { ok: false, msg: 'Zu wenig Geld für diesen Bericht.' };
        p.cash -= cost;
        p.researchSpent += cost;
        const dur = intelDur(p, type);
        p.job = { loc, type, until: G.sec + dur, dur, rids: G.events.filter(e => e.stage === 'rumor').map(e => e.id) };
        return { ok: true, msg: `${INTEL_TYPES[type].icon} ${INTEL_TYPES[type].name} ${INTEL_LOCS[loc].name} angefordert – kommt in ${dur} s.` };
    }

    // Passt die Quelle zu einem laufenden Gerücht?
    function hintFor(e, loc, type) {
        const map = INTEL_HINTS[e.def.id];
        if (!map) return null;
        for (const [k, texts] of Object.entries(map)) {
            const [t, l] = k.split('@');
            const where = l === 'R' ? REGION_LOC[e.region] : l;
            if (t === type && where === loc) return texts;
        }
        return null;
    }

    function finishJob(p) {
        const { loc, type, rids } = p.job;
        p.job = null;
        const T = INTEL_TYPES[type];
        // Gerüchte, die beim Anfordern liefen (auch wenn sie inzwischen aufgelöst sind), plus neue
        const rumors = G.events.filter(e => e.type === 'rumor' && (rids.includes(e.id) || e.stage === 'rumor'));
        let rep = null;
        const rel = intelRel(p, type);
        if (type === 'social' && rumors.length) {
            const e = rumors[0];
            const says = Math.random() < rel ? e.confirmed : !e.confirmed;
            rep = { rid: e.id, dir: says ? 1 : -1, soft: true, text: says ? `Viral: «${e.def.rumor}» – alle reden davon. (unbestätigt)` : `Viele halten «${e.def.rumor}» für Fake. (unbestätigt)` };
        } else {
            for (const e of rumors) {
                const texts = hintFor(e, loc, type);
                if (!texts) continue;
                const R = e.region ? REGIONS[e.region].name : '';
                // Fakten lügen nicht: entweder eindeutig (und dann richtig) oder unklar
                if (Math.random() < rel) rep = { rid: e.id, dir: e.confirmed ? 1 : -1, clear: true, text: (e.confirmed ? texts[0] : texts[1]).replace(/\{R\}/g, R) };
                else rep = { rid: e.id, dir: 0, clear: false, text: T.unclear };
                break;
            }
        }
        if (!rep) rep = { rid: null, dir: 0, none: true, text: 'Nichts Auffälliges zu den laufenden Gerüchten – diese Quelle passt zu keinem Gerücht.' };
        const e = rep.rid ? G.events.find(x => x.id === rep.rid) : null;
        if (e && e.stage === 'done') rep.text += ' (Zu spät: Das Gerücht ist schon aufgelöst.)';
        p.reports.push({ ...rep, loc, type, rel, icon: T.icon, src: T.name, place: INTEL_LOCS[loc].name, rumor: e ? e.def.rumor : null, sec: G.sec, year: G.year });
        if (p.reports.length > 40) p.reports.shift();
        note(p, 'good', `${T.icon} Bericht da: ${rep.text}`);
    }

    // ===== Lieferverträge zwischen Kooperativen und Fabriken =====
    // Ein Vertrag fixiert Menge und Preis für Dezember. Wer bricht, zahlt Strafe – und alle sehen es.
    const err = msg => ({ ok: false, msg });

    function dealOffer(id, t, price) {
        const p = byId(id);
        if (!p || p.role === 'spec') return err('Lieferverträge gibt es nur zwischen Kooperativen und Fabriken.');
        if (!feat('deals')) return err('Lieferverträge kommen später in der Karriere.');
        if (G.phase !== 'trading') return err('Die Börse ist gerade geschlossen.');
        t = Math.round(Number(t) / 10) * 10;
        price = Math.round(Number(price));
        if (!(t >= 10 && t <= 50)) return err('Menge 10 bis 50 t.');
        if (!(Math.abs(price / G.price - 1) <= CFG.dealBand)) return err(`Preis höchstens ±${Math.round(CFG.dealBand * 100)} % von der Börse.`);
        const free = p.role === 'producer' ? p.physical : -p.physical;
        if (t > free) return err(p.role === 'producer' ? 'So viel Kakao hast du nicht mehr frei.' : 'So viel brauchst du nicht mehr.');
        if (G.deals.some(d => d.from === id && d.status === 'open')) return err('Du hast schon ein offenes Angebot.');
        const d = { id: G.seq++, from: id, fromName: p.name, fromRep: p.rep, side: p.role === 'producer' ? 'sell' : 'buy', t, price, status: 'open', until: G.sec + CFG.dealSec };
        G.deals.push(d);
        emit('deal', d);
        return { ok: true, msg: `📜 Angebot steht: ${t} t zu ${fmt(price)} CHF/t – ${CFG.dealSec} s gültig.` };
    }

    function dealCancel(id, did) {
        const d = G.deals.find(x => x.id === did && x.from === id && x.status === 'open');
        if (d) d.status = 'cancelled';
        return { ok: true, msg: 'Angebot zurückgezogen.' };
    }

    function dealAccept(id, did) {
        const p = byId(id);
        const d = G.deals.find(x => x.id === did && x.status === 'open');
        if (!p || !d) return err('Das Angebot ist weg – jemand war schneller.');
        if (G.phase !== 'trading') return err('Die Börse ist gerade geschlossen.');
        const maker = byId(d.from);
        if (d.from === id) return err('Das ist dein eigenes Angebot.');
        if (!maker || p.role === 'spec' || p.role === maker.role) return err('Dieses Angebot ist nicht für deine Rolle.');
        const seller = d.side === 'sell' ? maker : p;
        const buyer = seller === maker ? p : maker;
        if (seller.physical < d.t) { d.status = 'cancelled'; return err(`${seller.name} hat nicht mehr genug Kakao – Angebot gelöscht.`); }
        if (-buyer.physical < d.t) return err(buyer === p ? 'So viel brauchst du nicht mehr.' : `${buyer.name} braucht nicht mehr so viel.`);
        d.status = 'signed';
        d.seller = seller.id;
        d.buyer = buyer.id;
        d.sName = seller.name;
        d.bName = buyer.name;
        seller.physical -= d.t;
        seller.revenue += d.t * d.price;
        seller.sales.push({ client: buyer.name, t: d.t, price: d.price, deal: d.id });
        buyer.physical += d.t;
        buyer.revenue -= d.t * d.price;
        seller.dealsT += d.t;
        buyer.dealsT += d.t;
        feed({ kind: 'deal', icon: '📜', text: `VERTRAG: ${seller.name} liefert ${buyer.name} ${d.t} t zu ${fmt(d.price)} CHF/t.` });
        note(maker, 'good', `📜 ${p.name} hat dein Angebot angenommen: ${d.t} t zu ${fmt(d.price)} CHF/t – fix für Dezember.`);
        return { ok: true, msg: `📜 Vertrag unterschrieben: ${d.t} t zu ${fmt(d.price)} CHF/t mit ${maker.name}.` };
    }

    function dealBreak(id, did) {
        const p = byId(id);
        const d = G.deals.find(x => x.id === did && x.status === 'signed' && (x.seller === id || x.buyer === id));
        if (!p || !d) return err('Diesen Vertrag gibt es nicht.');
        if (G.phase !== 'trading' && G.phase !== 'settle') return err('Die Börse ist gerade geschlossen.');
        const s = byId(d.seller);
        const b = byId(d.buyer);
        const other = p === s ? b : s;
        const fee = Math.round(d.t * CFG.breachFee);
        s.physical += d.t;
        s.revenue -= d.t * d.price;
        s.sales = s.sales.filter(x => x.deal !== d.id);
        b.physical -= d.t;
        b.revenue += d.t * d.price;
        s.dealsT -= d.t;
        b.dealsT -= d.t;
        p.cash -= fee;
        p.costs += fee;
        other.cash += fee;
        p.rep++;
        d.status = 'broken';
        d.breaker = id;
        feed({ kind: 'alert', icon: '💔', text: `VERTRAGSBRUCH: ${p.name} bricht den Vertrag mit ${other.name} (${d.t} t zu ${fmt(d.price)}) und zahlt ${fmt(fee)} CHF Strafe.` });
        note(other, 'bad', `💔 ${p.name} hat euren Vertrag gebrochen! ${other.role === 'producer' ? `Du hast die ${d.t} t wieder offen` : `Dir fehlen wieder ${d.t} t`} – sichere neu ab. Du bekommst ${fmt(fee)} CHF Strafe.`);
        return { ok: true, msg: `💔 Vertrag gebrochen. ${fmt(fee)} CHF Strafe – und alle haben es gesehen.` };
    }

    // ===== Entscheidungen der Rollen (eine Karte zur Zeit) =====
    function decide(p, d) {
        p.decision = { id: G.seq++, until: G.sec + CFG.decisionSec, ...d };
    }

    // Kooperative: Steigt der Weltpreis, locken Schmuggler die Bauern mit mehr Geld.
    function spawnRoleDecisions() {
        for (const p of G.players) {
            if (p.decision) {
                if (G.sec >= p.decision.until) answerDecision(p.id, p.decision.def, true);
                continue;
            }
            if (p.role === 'producer') {
                const prem = G.price / G.p0 - 1;
                if (feat('smuggle') && prem >= 0.06 && p.physical >= 20 && G.clock >= p.nextSmuggleAt) {
                    const loss = Math.min(p.physical, Math.max(10, Math.round((p.physical * clamp(prem * 0.8, 0.08, 0.35)) / 5) * 5));
                    const smugP = Math.round((G.price * 0.96) / 10) * 10;
                    const bonus = Math.round((loss * (G.price - G.p0) * 0.45) / 100) * 100;
                    decide(p, { kind: 'smuggle', loss, smugP, bonus, def: 'none' });
                    p.nextSmuggleAt = G.clock + 40 + Math.floor(Math.random() * 30);
                    note(p, 'bad', `🕵️ Schmuggler bieten deinen Bauern ${fmt(smugP)} CHF/t – du zahlst nur ${fmt(G.p0)}.`);
                } else if (feat('drying') && !p.dried && G.clock >= G.monthSec * 2 + 8) {
                    p.dried = true;
                    decide(p, { kind: 'dry', def: 'fast' });
                }
            } else if (p.role === 'processor' && feat('recipe') && p.recipeSteps < 2 && G.price / G.p0 - 1 >= CFG.recipeStep * (p.recipeSteps + 1) && -p.physical >= 20) {
                p.recipeSteps++;
                decide(p, { kind: 'recipe', rise: G.price / G.p0 - 1, def: 'absorb' });
            }
        }
    }

    function answerDecision(id, choice, timeout = false) {
        const p = byId(id);
        const D = p && p.decision;
        if (!D) return err('Diese Entscheidung ist nicht mehr offen.');
        p.decision = null;
        const pre = timeout ? '⏰ Zeit abgelaufen – ' : '';
        if (D.kind === 'smuggle') {
            if (choice === 'pay' && p.cash >= D.bonus) {
                p.cash -= D.bonus;
                p.costs += D.bonus;
                p.memberBonus += D.bonus;
                return { ok: true, msg: `🤝 Bonus bezahlt (${fmt(D.bonus)} CHF). Deine Bauern bleiben – du behältst alle Tonnen.` };
            }
            const lose = Math.min(D.loss, Math.max(0, p.physical));
            p.physical -= lose;
            p.lostSmuggle += lose;
            feed({ kind: 'bell', icon: '🚚', text: `${lose} t Kakao von ${p.name} wurden über die Grenze geschmuggelt.` });
            const over = -p.pos * CFG.size > p.physical;
            note(p, 'bad', `${pre}🚚 ${lose} t sind über die Grenze verschwunden. Dir bleiben ${p.physical} t.${over ? ' ⚠️ Du hast jetzt mehr abgesichert, als du hast!' : ''}`);
            return { ok: true, msg: `🚚 ${lose} t verloren.` };
        }
        if (D.kind === 'dry') {
            if (choice === 'sun') {
                if (Math.random() < CFG.rainRisk) {
                    const lose = Math.round(p.physical * 0.12);
                    p.physical -= lose;
                    p.qPrem = CFG.qSun / 2;
                    feed({ kind: 'bell', icon: '🌧️', text: `Regen bei ${p.name}: ${lose} t Kakao beim Trocknen verdorben.` });
                    return { ok: true, msg: `🌧️ Pech: Regen! ${lose} t sind verdorben. Der Rest hat gute Qualität (+${CFG.qSun / 2} CHF/t).` };
                }
                p.qPrem = CFG.qSun;
                return { ok: true, msg: `☀️ Perfekt getrocknet: Qualität A, +${CFG.qSun} CHF/t im Dezember.` };
            }
            p.qPrem = CFG.qFast;
            return { ok: true, msg: `${pre}🔥 Schnell im Ofen getrocknet: sicher, aber Qualität B (${CFG.qFast} CHF/t).` };
        }
        if (D.kind === 'recipe') {
            const need = -p.physical;
            const cut = pct2 => Math.min(need, Math.round((need * pct2) / 10) * 10);
            const later = (sec, chance, mult, headline, good) => p.pending.push({ at: G.sec + sec, chance, mult, headline, good });
            let msg;
            if (choice === 'price') {
                const c = cut(0.2);
                p.physical += c;
                p.needCut += c;
                p.marginMult *= 1.35;
                msg = `💸 Preise erhöht: mehr Marge pro Tafel, aber Kunden springen ab – du brauchst ${c} t weniger Kakao.`;
            } else if (choice === 'recipe') {
                const c = cut(0.15);
                p.physical += c;
                p.needCut += c;
                later(20 + Math.random() * 25, 0.45, 0.7, `📰 Test im Konsumentenmagazin: «${p.name} spart am Kakao – Schokolade schmeckt nach Zucker»`, false);
                msg = `🧪 Rezeptur geändert: ${c} t weniger Kakao nötig. Hoffentlich merkt es niemand …`;
            } else if (choice === 'shrink') {
                const c = cut(0.1);
                p.physical += c;
                p.needCut += c;
                p.marginMult *= 1.1;
                later(20 + Math.random() * 25, 0.55, 0.65, `📰 Konsumentenschutz entlarvt Mogelpackung: «${p.name}» – Tafel kleiner, Preis gleich`, false);
                msg = `📏 Tafel verkleinert: ${c} t weniger Kakao und etwas mehr Marge. Riskant …`;
            } else {
                later(20 + Math.random() * 25, 0.5, 1.12, `📰 «${p.name} hält die Preise – trotz Kakao-Krise»: Kundschaft lobt die Fabrik`, true);
                msg = `${pre}🤝 Du trägst die Kosten selbst. Gut abgesichert? Dann tut es weniger weh.`;
            }
            const over = p.pos * CFG.size > -p.physical;
            return { ok: true, msg: msg + (over ? ' ⚠️ Du hast jetzt mehr Kakao abgesichert, als du brauchst!' : '') };
        }
        return err('Unbekannte Entscheidung.');
    }

    // Verzögerte Folgen (Schlagzeilen)
    function runPending() {
        for (const p of G.players) {
            if (!p.pending.length) continue;
            for (const e of p.pending.filter(x => G.sec >= x.at)) {
                if (Math.random() < e.chance) {
                    p.marginMult *= e.mult;
                    feed({ kind: e.good ? 'bell' : 'alert', icon: e.good ? '🏅' : '📰', text: e.headline });
                    note(p, e.good ? 'good' : 'bad', e.good ? '🏅 Gute Presse: Deine Marge steigt.' : '📰 Schlechte Presse: Kunden springen ab – deine Marge sinkt.');
                }
            }
            p.pending = p.pending.filter(x => G.sec < x.at);
        }
    }

    // ===== News =====

    function feed(item) {
        const it = { ...item, sec: G.sec, clock: G.clock, year: G.year };
        G.feed.unshift(it);
        if (G.feed.length > 40) G.feed.pop();
        emit('news', it);
    }

    function scheduleNews() {
        const total = CFG.months * G.monthSec;
        const pool = shuffleArr([...NEWS]);
        const evs = [];
        for (let m = 0; m < CFG.months; m++) {
            const base = m * G.monthSec;
            const n = m === 0 ? 1 : 2;
            for (let k = 0; k < n && pool.length; k++) {
                const at = base + Math.round(10 + (k + Math.random() * 0.8) * ((G.monthSec - 25) / n));
                const def = pool.pop();
                evs.push({ id: G.seq++, type: 'rumor', def, at, resolveAt: Math.min(total - 4, at + CFG.rumorMin + Math.round(Math.random() * CFG.rumorSpread)), confirmed: Math.random() < def.prob, priced: 0, stage: 'pending', region: def.yield ? rand(COCOA_REGIONS) : null });
            }
        }
        shuffleArr([...SURPRISES]).slice(0, 2).forEach((s, i) => {
            evs.push({ type: 'surprise', def: s, at: Math.round(G.monthSec * (1.3 + i * 1.4) + Math.random() * 20), stage: 'pending' });
        });
        if (G.year === G.crisisYear) {
            evs.push({ type: 'surprise', def: { icon: '🚨', impact: 0.16, text: 'KRISE: Ernte in Westafrika bricht ein – Kakao explodiert' }, at: Math.round(G.monthSec * 0.45), stage: 'pending' });
            evs.push({ type: 'hike', rate: CFG.crisisMargin, at: Math.round(G.monthSec * 1.25), stage: 'pending' });
            evs.push({ type: 'surprise', def: { icon: '🏚️', impact: 0.12, text: 'KRISE: Lagerbestände so tief wie seit 50 Jahren nicht mehr' }, at: Math.round(G.monthSec * 1.7), stage: 'pending' });
        }
        G.events = evs.filter(e => e.at < total - 3).sort((a, b) => a.at - b.at);
    }

    function runNews() {
        let drift = 0;
        for (const e of G.events) {
            if (e.stage === 'pending' && G.clock >= e.at) {
                if (e.type === 'rumor') {
                    e.stage = 'rumor';
                    e.target = e.def.impact * e.def.prob * CFG.rumorPriced;
                    feed({ kind: 'rumor', icon: e.def.icon, text: `GERÜCHT${e.region ? ` (${REGIONS[e.region].name})` : ''}: ${e.def.rumor}`, dir: Math.sign(e.def.impact), region: e.region || null });
                    if (e.def.yield && feat('yield')) G.players.filter(p => p.role === 'producer' && (!e.region || p.region === e.region)).forEach(p => note(p, 'bad', `🌱 Achtung: Dieses Gerücht betrifft deine Region ${REGIONS[p.region].name} (${e.def.yield < 1 ? `bis −${Math.round((1 - e.def.yield) * 100)} %` : `bis +${Math.round((e.def.yield - 1) * 100)} %`}).`));
                } else if (e.type === 'surprise') {
                    e.stage = 'done';
                    drift += e.def.impact;
                    feed({ kind: 'flash', icon: e.def.icon, text: e.def.text, dir: Math.sign(e.def.impact) });
                } else if (e.type === 'hike') {
                    e.stage = 'done';
                    G.marginRate = e.rate;
                    feed({ kind: 'alert', icon: '⚖️', text: `BÖRSE: Einschuss sofort auf ${Math.round(e.rate * 100)} % erhöht – wer zu wenig Geld hat, bekommt einen Margin Call.` });
                    for (const p of G.players) {
                        if (p.pos && !p.call && futEq(p) < req(p) * CFG.maintenance) {
                            p.call = { need: req(p) - futEq(p), until: G.sec + CFG.callSec };
                            note(p, 'bad', `📞 MARGIN CALL: Die Börse hat den Einschuss erhöht. Schiess ${fmt(req(p) - futEq(p))} CHF nach oder verkleinere deine Position!`);
                        }
                    }
                }
            }
            if (e.stage === 'rumor') {
                if (G.clock >= e.resolveAt) {
                    e.stage = 'done';
                    const jump = e.confirmed ? e.def.impact - e.priced : -e.priced;
                    drift += jump;
                    feed({ kind: e.confirmed ? 'yes' : 'no', icon: e.confirmed ? '✅' : '❌', text: `${e.confirmed ? 'BESTÄTIGT' : 'DEMENTI'}${e.region ? ` (${REGIONS[e.region].name})` : ''}: ${e.confirmed ? e.def.yes : e.def.no}`, dir: Math.sign(jump), jump, region: e.region || null, yieldIcon: e.def.icon });
                    harvestShock(e.def, e.confirmed, e.region);
                    if (e.def.orders && e.confirmed) G.orderBoost = G.clock + 40;
                } else {
                    const d = (e.target - e.priced) * CFG.rumorSpeed;
                    e.priced += d;
                    drift += d;
                }
            }
        }
        return drift;
    }

    function activeRumors() {
        return G.events.filter(e => e.stage === 'rumor').map(e => ({ impact: e.def.impact, priced: e.priced, left: e.resolveAt - G.clock, since: G.clock - e.at, icon: e.def.icon, text: e.def.rumor, region: e.region || null }));
    }

    // ===== Ablauf =====

    // Pre-Market: Die Börse ist noch geschlossen – Zeit für die Einführung auf den Handys.
    function start(pre = CFG.preSec) {
        if (G.phase !== 'lobby') return;
        if (pre > 0) {
            G.phase = 'pre';
            G.preLeft = pre;
            feed({ kind: 'bell', icon: '🌅', text: `Pre-Market: Die Börse öffnet in ${pre} Sekunden. Lernt euer Cockpit kennen!` });
            emit('pre', { left: pre });
            return;
        }
        openMarket();
    }

    // Tutorial fertig? Sind alle echten Spieler bereit, öffnet die Börse nach ein paar Sekunden.
    function setReady(id) {
        const p = byId(id);
        if (!p) return { ok: false };
        p.ready = true;
        if (G.phase === 'pre') {
            const humans = G.players.filter(x => !x.bot && x.connected !== false);
            if (humans.length && humans.every(x => x.ready)) G.preLeft = Math.min(G.preLeft, 5);
        }
        return { ok: true };
    }

    function openMarket() {
        if (G.phase !== 'pre' && G.phase !== 'lobby') return;
        scheduleNews();
        G.phase = 'trading';
        G.preLeft = 0;
        feed({ kind: 'bell', icon: '🔔', text: `Die Börse ist eröffnet! Kakao Dezember-Future: ${fmt(G.price)} CHF/t.` });
        emit('open', { month: 1 });
    }

    function settle() {
        G.phase = 'settle';
        G.settleLeft = CFG.settleSec;
        const results = [];
        for (const p of G.players) {
            const pl = p.pos * (G.price - G.ref) * CFG.size;
            p.margin += pl;
            results.push({ pid: p.id, pl });
        }
        G.ref = G.price;
        for (const p of G.players) {
            if (p.bankrupt) continue;
            const need = req(p);
            if (p.pos !== 0 && p.margin < need * CFG.maintenance) {
                p.call = { need: need - p.margin, until: G.sec + CFG.callSec };
                note(p, 'bad', `MARGIN CALL: Schiess ${fmt(need - p.margin)} CHF nach oder reduziere deine Position – sonst Zwangsglattstellung in ${CFG.callSec} s!`);
            } else if (p.margin > need) {
                const r = p.margin - need;
                p.margin -= r;
                p.cash += r;
            }
        }
        G.marks.push({ month: G.month, price: G.price, clock: G.clock });
        feed({ kind: 'settle', icon: '🧾', text: `Abrechnung Monat ${G.month}: Alle Positionen zu ${fmt(G.price)} CHF/t bewertet.` });
        emit('settle', { month: G.month, results });
    }

    // ===== Jahresende (Fälligkeit) =====
    function finish() {
        for (const p of G.players) {
            p.cash += p.margin;
            p.margin = 0;
            // Nicht abgesicherte Tonnen: Notverkauf bzw. Notkauf mit Abschlag
            const sc = spotCost(p);
            p.spotPaid = Math.round(sc);
            p.cash += p.physical * G.price + p.revenue - sc;
            p.orderOffer = null;
            p.buyerOffer = null;
            p.call = null;
        }
        feed({ kind: 'bell', icon: '🔔', text: `Fälligkeit Jahr ${G.year}! Schlusskurs ${fmt(G.price)} CHF/t.` });
        const d = debrief();
        // Zusatzerträge aus dem Kerngeschäft (unabhängig vom Handel): Ernte-Marge und Fairtrade-Prämie
        for (const r of d.rows) {
            const p = byId(r.id);
            let extra = 0;
            if (p.role === 'producer') {
                const tons = p.physical + p.sales.reduce((s, x) => s + x.t, 0);
                extra = tons * (CFG.farmMargin + p.qPrem) + (has(p, 'fairtrade') ? tons * CFG.fairPremium : 0);
            } else if (p.role === 'processor') {
                extra = (-p.basePhys - p.needCut) * CFG.chocMargin * p.marginMult;   // Verarbeitungsmarge (Krisen-Entscheide wirken hier)
            }
            // Kasse sauber abschliessen: Ernte bzw. Grundbedarf zum Planwert ist schon im Startwert enthalten,
            // damit bleibt nach dem Jahr genau «Start + Jahresergebnis» in der Kasse.
            p.cash -= p.basePhys * (p.planP || G.p0);
            p.cash += extra;
            r.extra = Math.round(extra);
            r.yearResult = r.result + r.extra;
            p.settled = true;
            p.lastResult = r.result;
            p.total += r.yearResult;
            p.yearPts.push(r.points);
            p.years.push({ year: G.year, result: r.yearResult, metric: r.metric, points: r.points });
            const before = p.level;
            p.level = Math.min(RANKS.length - 1, p.yearPts.filter(x => x >= 0).length);
            r.promoted = p.level > before;
            r.level = p.level;
            r.total = p.total;
        }
        // Jahresüberblick: Kurs, Sieger pro Rolle, wichtigste Meldungen
        const best = (role, cmp) => d.rows.filter(r => r.role === role).sort(cmp)[0];
        const pick = r => (r ? { id: r.id, name: r.name, role: r.role, metric: r.metric, result: r.yearResult, bot: r.bot } : null);
        const step = Math.max(1, Math.floor(G.history.length / 120));
        G.yearLog.push({
            year: G.year, final: G.price, p0: G.p0,
            hi: Math.max(...G.history.map(h => h.p)), lo: Math.min(...G.history.map(h => h.p)),
            history: G.history.filter((h, i) => i % step === 0 || i === G.history.length - 1).map(h => h.p),
            star: d.star ? { id: d.star.id, name: d.star.name, role: d.star.role } : null,
            winners: {
                producer: pick(best('producer', (a, b) => b.metric - a.metric)),
                processor: pick(best('processor', (a, b) => a.metric - b.metric)),
                spec: pick(best('spec', (a, b) => b.result - a.result)),
            },
            events: G.feed.filter(f => f.sec >= (G.yearStartSec || 0) && ['yes', 'flash'].includes(f.kind)).slice(0, 4).map(f => ({ icon: f.yieldIcon || f.icon, text: f.text, dir: f.dir || 0 })),
            upgrades: G.players.reduce((n, p) => n + p.upgrades.length, 0),
        });
        if (G.year < G.years) {
            G.phase = 'shop';
            G.shopLeft = CFG.shopSec;
            emit('yearEnd', d);
            // KI-Firmen bauen nach und nach aus (mit Reserve)
            G.players.filter(p => p.bot).forEach(p => {
                const opts = shuffleArr((UPGRADES[p.role] || []).filter(u => !has(p, u.id)));
                for (const u of opts) {
                    if (p.cash - u.cost > ROLES[p.role].cash * 0.55 && Math.random() < 0.7) {
                        setTimeout(() => { if (G.phase === 'shop') buyUpgrade(p.id, u.id); }, 2000 + Math.random() * 15000);
                    }
                }
            });
        } else {
            G.phase = 'end';
            emit('end', finalDebrief(d));
        }
    }

    // ===== Ausbauphase =====
    function buyUpgrade(id, uid) {
        const p = byId(id);
        if (!p || G.phase !== 'shop') return { ok: false, msg: 'Ausbauen geht nur zwischen den Jahren.' };
        const u = (UPGRADES[p.role] || []).find(x => x.id === uid);
        if (!u) return { ok: false, msg: 'Unbekannter Ausbau.' };
        if (has(p, uid)) return { ok: false, msg: 'Schon gekauft.' };
        if (p.cash < u.cost) return { ok: false, msg: `Zu wenig Geld (${fmt(u.cost)} CHF nötig).` };
        p.cash -= u.cost;
        p.upSpent += u.cost;
        p.upgrades.push(uid);
        emit('upgrade', { pid: p.id, name: p.name, role: p.role, u });
        return { ok: true, msg: `${u.icon} ${u.name} gekauft!` };
    }

    function nextYear() {
        if (G.phase !== 'shop') return;
        G.year++;
        G.p0 = G.price;
        G.ref = G.price;
        G.month = 1;
        G.clock = 0;
        G.history = [{ s: 0, p: G.price }];
        G.yearStartSec = G.sec;
        G.marks = [];
        G.trades = [];
        G.tape = [];
        G.marginRate = CFG.marginRate;
        G.deals = [];
        G.orderBoost = 0;
        for (const p of G.players) {
            const R = ROLES[p.role];
            // Notkredit für Pleitiers – mit saftigem Zins
            if (p.bankrupt || p.cash < 8000) {
                p.cash += CFG.loan;
                p.loans++;
                p.interest += CFG.loan * CFG.loanRate;
                p.bankrupt = false;
                note(p, 'bad', `🏦 Notkredit: ${fmt(CFG.loan)} CHF, aber ${fmt(CFG.loan * CFG.loanRate)} CHF Zins werden am Ende abgezogen.`);
            }
            p.pos = 0;
            p.margin = 0;
            p.call = null;
            p.basePhys = R.physical + (p.role === 'producer' && has(p, 'land') ? 30 : 0);
            p.physical = p.basePhys;
            p.settled = false;
            p.spotPaid = 0;
            p.hedgeT = 0;
            p.hedgeV = 0;
            p.revenue = 0;
            p.protect = false;
            p.harvestLog = [];
            p.orders = [];
            p.orderOffer = null;
            p.sales = [];
            p.buyerOffer = null;
            p.costs = 0;
            p.researchSpent = 0;
            p.reports = [];
            p.job = null;
            p.expAcc = 0;
            p.expN = 0;
            p.fees = 0;
            p.liquidations = 0;
            p.lastSky = null;
            p.nextOrderAt = 8 + Math.floor(Math.random() * CFG.orderEvery);
            p.nextBuyerAt = 10 + Math.floor(Math.random() * CFG.buyerEvery);
            Object.assign(p, { decision: null, pending: [], qPrem: 0, dried: false, marginMult: 1, needCut: 0, recipeSteps: 0, dealsT: 0, lostSmuggle: 0, memberBonus: 0, nextSmuggleAt: 20 + Math.floor(Math.random() * 25) });
            p.startValue = p.cash + p.physical * G.p0;
            p.planValue = p.physical * G.p0;
            p.planP = G.p0;
            if (p.role === 'processor' && has(p, 'contract')) {
                const price = G.p0 + 150;
                p.physical -= 30;
                p.revenue += 30 * price;
                p.orders.push({ client: 'Grosskunde (Vertrag)', t: 30, price, at: G.price });
            }
        }
        scheduleNews();
        G.phase = 'trading';
        feed({ kind: 'bell', icon: '🔔', text: `Jahr ${G.year} beginnt! Neuer Planpreis: ${fmt(G.p0)} CHF/t.` });
        // «Neu in diesem Jahr»: Nebenmechaniken kommen schrittweise dazu
        if (G.year === G.crisisYear) feed({ kind: 'alert', icon: '🚨', text: `KRISENJAHR: Schlechte Ernten, leere Lager – stellt euch auf wilde Preise ein!` });
        const fresh = Object.keys(CFG.featureYear).filter(k => CFG.featureYear[k] === G.year);
        if (fresh.length) emit('newFeatures', { year: G.year, keys: fresh });
        emit('year', { year: G.year });
        emit('open', { month: 1 });
    }

    function tick() {
        if (!G || G.phase === 'lobby' || G.phase === 'end' || G.paused) return;
        if (G.phase === 'shop') {
            G.sec++;
            G.shopLeft--;
            if (G.shopLeft <= 0) nextYear();
            return;
        }
        if (G.phase === 'pre') {
            G.sec++;
            G.preLeft--;
            if (G.preLeft <= 0) openMarket();
            return;
        }
        G.sec++;
        if (G.phase === 'trading') {
            G.clock++;
            const news = runNews();
            const flow = clamp(G.flow * CFG.impact, -0.006, 0.006);
            G.flow = 0;
            const next = G.price * (1 + gauss() * CFG.vol * (G.year === G.crisisYear ? 1.5 : 1) + news + flow);
            G.price = Math.round(clamp(next, CFG.minPrice, CFG.maxPrice));
            G.history.push({ s: G.clock, p: G.price });
            for (const p of G.players) {
                if (p.role !== 'spec') {
                    p.expAcc += Math.abs(exposure(p));
                    p.expN++;
                }
            }
            spawnOrders(G.orderBoost && G.clock < G.orderBoost ? 1.6 : 1);
            spawnRoleDecisions();
            runPending();
            for (const d of G.deals) if (d.status === 'open' && G.sec >= d.until) d.status = 'expired';
            spawnBuyers();
        }
        for (const p of G.players) if (p.job && G.sec >= p.job.until) finishJob(p);
        for (const p of G.players) {
            if (p.bankrupt || p.pos === 0) continue;
            if (futEq(p) < 0) {
                // Konto leer: zuerst automatisch vom freien Geld nachschiessen, nur wenn das nicht reicht → Zwangsglattstellung.
                const gap = -futEq(p) + req(p) * 0.3;
                if (p.cash >= -futEq(p)) {
                    const t = Math.min(gap, p.cash);
                    p.cash -= t;
                    p.margin += t;
                    note(p, 'bad', `💸 Starker Kurssprung: ${fmt(t)} CHF automatisch aufs Margin-Konto nachgeschossen. Dein Bargeld schmilzt!`);
                } else liquidate(p, 'Dein Margin-Konto ist leer und dein Bargeld reicht nicht: Position zwangsweise glattgestellt.');
            }
            else if (p.call && G.sec >= p.call.until) liquidate(p, 'Frist abgelaufen: Deine Position wurde zwangsweise glattgestellt.');
        }
        if (G.phase === 'trading' && G.clock % G.monthSec === 0) settle();
        else if (G.phase === 'settle') {
            G.settleLeft--;
            if (G.settleLeft <= 0) {
                if (G.month >= CFG.months) return finish();
                G.month++;
                G.phase = 'trading';
                feed({ kind: 'bell', icon: '🔔', text: `Monat ${G.month} von ${CFG.months}: Handel läuft.` });
                emit('open', { month: G.month });
            }
        }
    }

    // ===== Zustand für Bildschirme =====

    function secLeft() {
        if (G.phase === 'pre') return G.preLeft;
        if (G.phase === 'settle') return G.settleLeft;
        if (G.phase !== 'trading') return 0;
        return G.monthSec - (G.clock % G.monthSec);
    }

    function ranking() {
        return G.players.map(p => ({ id: p.id, name: p.name, role: p.role, bot: p.bot, score: Math.round(score(p)), metric: metric(p), hedged: hedgedShare(p), bank: p.bank || null, level: p.level, total: Math.round(p.total), pos: p.pos, bankrupt: p.bankrupt, connected: p.connected }))
            .sort((a, b) => b.score - a.score);
    }

    function publicState(full = false) {
        return {
            phase: G.phase, paused: !!G.paused, month: G.month, crisis: G.year === G.crisisYear,
            preReady: G.phase === 'pre' ? { n: G.players.filter(x => !x.bot && x.ready).length, total: G.players.filter(x => !x.bot).length, names: G.players.filter(x => !x.bot).map(x => ({ name: x.name, ready: !!x.ready })) } : null, months: CFG.months, secLeft: secLeft(), monthSec: G.monthSec,
            year: G.year, years: G.years, shopLeft: G.shopLeft,
            price: G.price, ref: G.ref, p0: G.p0, marginRate: G.marginRate,
            history: full ? G.history : G.history.slice(-90).map(h => h.p),
            tape: G.tape.slice(0, full ? 12 : 5),
            feed: G.feed.slice(0, full ? 8 : 4),
            ranking: ranking(),
            playerCount: G.players.length,
        };
    }

    function personal(id) {
        const p = byId(id);
        if (!p) return null;
        const rk = ranking().filter(r => r.role === p.role);
        const rank = rk.findIndex(r => r.id === id) + 1;
        return {
            roleCount: rk.length, metric: metric(p), hedgeEffect: Math.round(hedgeEffect(p)), protectPrice: protectPrice(p),
            buyerOffer: p.buyerOffer ? { client: p.buyerOffer.client, t: p.buyerOffer.t, price: p.buyerOffer.price, left: Math.max(0, p.buyerOffer.until - G.sec) } : null,
            sales: p.sales.slice(-3), hedged: hedgedShare(p), open: openTons(p), spotCost: Math.round(spotCost(p)), secured: securedPrice(p),
            feat: Object.fromEntries(Object.keys(CFG.featureYear).map(k => [k, feat(k)])),
            rumor: activeRumors()[0] || null,
            id: p.id, name: p.name, role: p.role, cash: Math.round(p.cash), margin: Math.round(p.margin), pos: p.pos,
            eq: Math.round(futEq(p)), unreal: Math.round(unrealC(p)), req: Math.round(req(p)), exposure: exposure(p),
            call: p.call ? { need: Math.round(Math.max(0, req(p) - futEq(p))), left: Math.max(0, p.call.until - G.sec) } : null,
            result: Math.round(liveResult(p)), bonus: bonus(p), hedgeQuote: hedgeQuote(p), rank, bankrupt: p.bankrupt,
            limit: ROLES[p.role].limit, bounds: bounds(p), notes: p.notes.slice(-3), liquidations: p.liquidations,
            physical: p.physical, revenue: Math.round(p.revenue), protect: p.protect, harvestLog: p.harvestLog.slice(-3),
            orders: p.orders.map(o => ({ client: o.client, t: o.t, price: o.price })),
            deals: dealView(p),
            decision: p.decision ? { ...p.decision, left: Math.max(0, p.decision.until - G.sec) } : null,
            rep: p.rep, dealsT: p.dealsT, qPrem: p.qPrem, marginMult: p.marginMult, lostSmuggle: p.lostSmuggle,
            orderOffer: p.orderOffer ? { client: p.orderOffer.client, t: p.orderOffer.t, price: p.orderOffer.price, left: Math.max(0, p.orderOffer.until - G.sec) } : null,
            intel: p.role === 'spec' ? intelState(p) : null,
            rumorActive: G.events.some(e => e.stage === 'rumor'),
            sky: ((G.events.find(e => e.stage === 'rumor' && e.def.yield && (!e.region || e.region === p.region)) || {}).def || {}).id || p.lastSky || 'sun',
            skyRumor: G.events.some(e => e.stage === 'rumor' && e.def.yield && (!e.region || e.region === p.region)),
            month: G.month, year: G.year, years: G.years, shopLeft: G.shopLeft,
            upgrades: p.upgrades.slice(), level: p.level, total: Math.round(p.total), upSpent: p.upSpent, interest: p.interest, loans: p.loans,
            yearsDone: p.years.slice(),
            region: p.region,
        };
    }

    // Für das Terminal: laufender Auftrag, Berichte, Gerüchte mit Szenarien (Risiko-Cockpit)
    function intelState(p) {
        return {
            job: p.job ? { loc: p.job.loc, type: p.job.type, left: Math.max(0, p.job.until - G.sec), dur: p.job.dur } : null,
            reports: p.reports.filter(r => r.year === G.year).slice(-16),
            costs: Object.fromEntries(Object.keys(INTEL_TYPES).map(t => [t, { cost: intelCost(p, t), dur: intelDur(p, t), rel: Math.round(intelRel(p, t) * 100) }])),
            rumors: G.events.filter(e => e.stage === 'rumor').map(e => ({
                id: e.id, icon: e.def.icon, text: e.def.rumor, region: e.region || null,
                left: Math.max(0, e.resolveAt - G.clock), since: G.clock - e.at,
                jumpYes: e.def.impact - e.priced, jumpNo: -e.priced,
            })),
            spent: p.researchSpent,
        };
    }

    // Verträge aus Sicht eines Spielers
    function dealView(p) {
        if (p.role === 'spec') return null;
        const other = p.role === 'producer' ? 'buy' : 'sell';
        return {
            offers: G.deals.filter(d => d.status === 'open' && d.side === other).map(d => ({ id: d.id, name: d.fromName, rep: (byId(d.from) || {}).rep || 0, t: d.t, price: d.price, left: Math.max(0, d.until - G.sec) })),
            mine: G.deals.filter(d => d.status === 'open' && d.from === p.id).map(d => ({ id: d.id, t: d.t, price: d.price, left: Math.max(0, d.until - G.sec) })),
            signed: G.deals.filter(d => d.status === 'signed' && (d.seller === p.id || d.buyer === p.id)).map(d => ({ id: d.id, with: d.seller === p.id ? d.bName : d.sName, t: d.t, price: d.price, fee: Math.round(d.t * CFG.breachFee) })),
        };
    }

    function debrief() {
        const rows = G.players.map(p => {
            const R = ROLES[p.role];
            // Effect of price, harvest size and customer orders on the physical business (vs. plan).
            const physPL = p.physical * G.price + p.revenue - p.basePhys * (p.planP || G.p0);
            const result = p.cash - p.startValue;
            return {
                id: p.id, name: p.name, role: p.role, bot: p.bot, result: Math.round(result), physPL: Math.round(physPL),
                physical: p.physical, protect: p.protect, orders: p.orders.length, orderT: p.orders.reduce((s, o) => s + o.t, 0),
                orderMargin: Math.round(p.orders.reduce((s, o) => s + o.t * (o.price - G.price), 0)), researchSpent: p.researchSpent, reports: p.reports.length,
                futPL: Math.round(result - physPL), fees: Math.round(p.fees), bonus: bonus(p), score: Math.round(result + bonus(p)),
                hedgeQuote: hedgeQuote(p), liquidations: p.liquidations, bankrupt: p.bankrupt, trades: p.trades,
                metric: metric(p, result), spotPaid: p.spotPaid || 0, open: openTons(p),
            };
        }).sort((a, b) => b.score - a.score);
        // Trader des Tages: Punkte = wie viel besser als der Durchschnitt der eigenen Rolle,
        // geteilt durch die typische Streuung der Rolle (damit alle Rollen gleiche Chancen haben).
        const SCALE = { producer: 110, processor: 60, spec: 10000 };
        const avg = a => a.reduce((s, x) => s + x, 0) / a.length;
        for (const r of rows) {
            const peers = rows.filter(x => x.role === r.role);
            if (r.role === 'spec') {
                const base = peers.length > 1 ? avg(peers.map(x => x.result)) : 0;
                r.points = Math.round((10 * (r.result - base)) / SCALE.spec);
            } else {
                const base = peers.length > 1 ? avg(peers.map(x => x.metric)) : G.price;   // allein in der Rolle: Vergleich mit «gar nicht absichern»
                r.points = Math.round((10 * (r.role === 'producer' ? r.metric - base : base - r.metric)) / SCALE[r.role]);
            }
        }
        const star = rows.filter(r => !r.bankrupt).sort((a, b) => b.points - a.points)[0] || null;
        return { rows, star, trades: G.trades, final: G.price, p0: G.p0, change: G.price / G.p0 - 1, history: G.history, marks: G.marks, feed: G.feed.slice(0, 20) };
    }

    // ===== Karriere-Auswertung über alle Jahre =====
    function finalDebrief(last) {
        const career = G.players.map(p => ({
            id: p.id, name: p.name, role: p.role, bot: p.bot, level: p.level,
            years: p.years.slice(), upgrades: p.upgrades.slice(), upSpent: p.upSpent, interest: p.interest, loans: p.loans,
            points: p.yearPts.reduce((s, x) => s + x, 0),
            final: Math.round(p.total - p.upSpent - p.interest),
        })).sort((a, b) => b.final - a.final);
        const star = career.slice().sort((a, b) => b.points - a.points)[0] || null;
        return { ...last, career, careerStar: star, yearLog: G.yearLog.slice(), years: G.years };
    }

    return {
        create, addPlayer, setRole, removePlayer, start, openMarket, setReady, tick, dealOffer, dealAccept, dealCancel, dealBreak, answerDecision, trade, topUp, setPaused: v => { if (G) G.paused = !!v; },
        protect, answerOrder, investigate, answerBuyer, protectPrice, buyUpgrade, nextYear, feat,
        publicState, personal, debrief, activeRumors, exposure, futEq, req, byId, openTons,
        get G() { return G; },
    };
})();
