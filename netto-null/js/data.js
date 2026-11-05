// ===== NETTO NULL – Spieldaten =====

const CFG = {
    rounds: 6,
    years: [2026, 2030, 2034, 2038, 2042, 2046],
    baseline: 100,                       // t CO₂ pro Runde ohne Massnahmen
    cap: [100, 90, 78, 64, 48, 30],      // Gratis-Zertifikate pro Firma und Runde
    startCash: 12000,
    revenue: 6000,                       // Gewinn aus dem normalen Geschäft pro Runde
    penalty: 350,                        // Strafe pro Tonne ohne Zertifikat
    maxPrice: 450,
};

// Jede Branche kann unterschiedlich günstig CO₂ sparen – darum lohnt sich Handel.
const COMPANIES = {
    energy: {
        name: 'Energie AG', short: 'Energie', icon: '⚡', color: '#facc15', alloc: 0.62,
        desc: 'Ein altes Kohlekraftwerk. Umbauen ist relativ günstig – Sonne und Wind sind billig geworden.',
        measures: [
            { id: 'gas', name: 'Kohle → Gas', icon: '🔥', t: 20, cost: 4500 },
            { id: 'solar', name: 'Solarpark', icon: '☀️', t: 25, cost: 7500 },
            { id: 'wind', name: 'Windpark', icon: '🌬️', t: 25, cost: 10500 },
            { id: 'storage', name: 'Batteriespeicher', icon: '🔋', t: 20, cost: 12000 },
        ],
    },
    chem: {
        name: 'Chemie Basel', short: 'Chemie', icon: '🧪', color: '#34d399', alloc: 0.95,
        desc: 'Braucht viel Prozesswärme. Einiges lässt sich optimieren, der Rest wird teuer.',
        measures: [
            { id: 'process', name: 'Prozess-Optimierung', icon: '⚙️', t: 15, cost: 5400 },
            { id: 'heatpump', name: 'Industrie-Wärmepumpe', icon: '♨️', t: 20, cost: 9000 },
            { id: 'bio', name: 'Biomasse statt Öl', icon: '🌿', t: 20, cost: 13200 },
            { id: 'h2', name: 'Grüner Wasserstoff', icon: '💧', t: 30, cost: 27000 },
        ],
    },
    steel: {
        name: 'Stahlwerk Gerlafingen', short: 'Stahl', icon: '🔩', color: '#94a3b8', alloc: 1.08,
        desc: 'Hochofen mit Koks. Kleine Schritte sind möglich, der grosse Umbau ist sehr teuer.',
        measures: [
            { id: 'waste', name: 'Abwärme nutzen', icon: '🌡️', t: 10, cost: 2700 },
            { id: 'scrap', name: 'Mehr Schrott-Recycling', icon: '♻️', t: 20, cost: 10800 },
            { id: 'arc', name: 'Elektro-Lichtbogenofen', icon: '⚡', t: 25, cost: 18000 },
            { id: 'h2steel', name: 'Wasserstoff-Hochofen', icon: '💧', t: 40, cost: 42000 },
        ],
    },
    air: {
        name: 'Alpen Airways', short: 'Airline', icon: '✈️', color: '#60a5fa', alloc: 1.18,
        desc: 'Fliegen ohne Kerosin ist schwierig. Fast jede Massnahme kostet viel.',
        measures: [
            { id: 'routes', name: 'Routen optimieren', icon: '🧭', t: 8, cost: 1800 },
            { id: 'rail', name: 'Kurzstrecken → Bahn', icon: '🚆', t: 12, cost: 7200 },
            { id: 'planes', name: 'Neue Flugzeuge', icon: '🛩️', t: 20, cost: 18000 },
            { id: 'saf', name: 'Synthetisches Kerosin', icon: '🛢️', t: 25, cost: 30000 },
        ],
    },
    cement: {
        name: 'Zementwerk Jura', short: 'Zement', icon: '🏗️', color: '#f97316', alloc: 1.22,
        desc: 'Beim Brennen von Kalk entsteht CO₂ chemisch – das lässt sich kaum vermeiden.',
        measures: [
            { id: 'eff', name: 'Effizientere Öfen', icon: '🔧', t: 10, cost: 3600 },
            { id: 'fuel', name: 'Abfall als Brennstoff', icon: '🗑️', t: 15, cost: 10800 },
            { id: 'clinker', name: 'Klinker-Ersatz', icon: '🧱', t: 15, cost: 14400 },
            { id: 'ccs', name: 'CO₂-Abscheidung (CCS)', icon: '🏭', t: 40, cost: 48000 },
        ],
    },
};
const COMPANY_ORDER = ['energy', 'cement', 'steel', 'air', 'chem'];

// Ereignisse ab Runde 2 (zufällige Reihenfolge)
const EVENTS = [
    { id: 'solar', icon: '☀️', title: 'Solarpreise im freien Fall', text: 'Massnahmen von Energie-Firmen kosten diese Runde 40 % weniger.', sector: 'energy', discount: 0.4 },
    { id: 'boom', icon: '📈', title: 'Wirtschaftsboom', text: 'Volle Auftragsbücher: Alle Firmen stossen diese Runde 10 t mehr aus.', extra: 10 },
    { id: 'recession', icon: '📉', title: 'Rezession', text: 'Weniger Produktion: Alle Firmen stossen diese Runde 10 t weniger aus – aber der Gewinn sinkt um 2\'000.', extra: -10, revenue: -2000 },
    { id: 'h2', icon: '💧', title: 'Durchbruch beim Wasserstoff', text: 'Alle Wasserstoff-Massnahmen kosten diese Runde 35 % weniger.', tag: 'h2', discount: 0.35 },
    { id: 'subsidy', icon: '🏛️', title: 'Klimafonds des Bundes', text: 'Der Bund zahlt 30 % jeder Investition diese Runde.', discount: 0.3 },
    { id: 'strict', icon: '⚖️', title: 'Parlament verschärft das Ziel', text: 'Ab dieser Runde gibt es pro Firma 5 Zertifikate weniger als geplant.', capCut: 5 },
];

const LESSON_TEXT = {
    externality: 'Ohne Cap kostet Verschmutzung nichts – die Kosten (Klimaschäden) tragen andere. Ökonomen nennen das eine <b>negative Externalität</b>.',
    cap: 'Der Staat legt die <b>Gesamtmenge</b> fest. Wie viel jede einzelne Firma spart, entscheidet der Markt.',
    price: 'Der CO₂-Preis entsteht dort, wo sich <b>Angebot und Nachfrage</b> kreuzen.',
    efficiency: 'Gespart wird dort, wo es am <b>billigsten</b> ist. Firmen mit teuren Massnahmen kaufen lieber Zertifikate.',
};

// ===== Helpers =====
const fmt = n => Math.round(n).toLocaleString('de-CH');
const signed = n => `${n > 0 ? '+' : n < 0 ? '−' : '±'}${fmt(Math.abs(n))}`;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const $ = id => document.getElementById(id);

const BOT_NAMES = {
    energy: ['Axpo-KI', 'Repower-Bot', 'Alpiq-KI'],
    cement: ['Holcim-Bot', 'Jura-Cement-KI', 'Vigier-Bot'],
    steel: ['Swiss Steel AI', 'Von Roll Bot', 'Stahl-KI'],
    air: ['Swissair 2.0', 'Edelweiss-KI', 'Helvetic-Bot'],
    chem: ['Lonza-Bot', 'Ems-KI', 'Clariant-Bot'],
};

// ===== Sound =====
const Sound = (() => {
    let ac = null;
    let muted = false;
    function init() {
        if (ac) return;
        const AC = window.AudioContext || window.webkitAudioContext;
        if (AC) ac = new AC();
    }
    function tone(f, d, type = 'sine', v = 0.15, when = 0) {
        if (!ac || muted) return;
        const t = ac.currentTime + when;
        const o = ac.createOscillator();
        const g = ac.createGain();
        o.type = type;
        o.frequency.setValueAtTime(f, t);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(v, t + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t + d);
        o.connect(g);
        g.connect(ac.destination);
        o.start(t);
        o.stop(t + d + 0.05);
    }
    const S = {
        join: () => { tone(523, 0.1, 'triangle'); tone(784, 0.18, 'triangle', 0.15, 0.08); },
        card: () => { tone(660, 0.08, 'triangle'); tone(990, 0.14, 'triangle', 0.12, 0.06); },
        ready: () => [523, 659, 784].forEach((f, i) => tone(f, 0.15, 'triangle', 0.12, i * 0.07)),
        news: () => { tone(740, 0.12, 'sine', 0.12); tone(988, 0.2, 'sine', 0.12, 0.14); },
        gavel: () => { tone(140, 0.12, 'square', 0.12); tone(110, 0.2, 'square', 0.1, 0.16); },
        bad: () => tone(180, 0.3, 'square', 0.08),
        end: () => [523, 659, 784, 1046, 784, 1046].forEach((f, i) => tone(f, 0.3, 'triangle', 0.13, i * 0.13)),
    };
    return { init, play: n => { if (ac && ac.state === 'suspended') ac.resume(); if (S[n]) S[n](); }, toggle: () => (muted = !muted) };
})();
