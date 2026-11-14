// ===== KAKAO PIT – gemeinsame Daten und Hilfsfunktionen =====

const CFG = {
    size: 10,              // Tonnen pro Kontrakt
    p0: 2400,              // Startpreis CHF pro Tonne
    months: 4,             // Handelsmonate bis zur Fälligkeit (Dezember)
    monthSec: { kurz: 60, normal: 90, lang: 120 },
    settleSec: 7,          // Pause für die Abrechnung am Monatsende
    preSec: 180,           // Pre-Market: höchstens so lange – öffnet früher, sobald alle das Tutorial fertig haben
    marginRate: 0.10,      // Einschuss: 10 % des Kontraktwerts
    maintenance: 0.7,      // Margin Call unter 70 % des nötigen Einschusses
    callSec: 25,           // Zeit, um nachzuschiessen
    fee: 8,                // CHF pro Kontrakt am Markt
    spread: 0.0015,        // Geld-Brief-Spanne des Market Makers
    vol: 0.0042,           // Zufallsschwankung pro Sekunde
    impact: 0.00025,       // Preiswirkung pro netto gehandeltem Kontrakt (klein: einzelne Trades bewegen den Markt kaum)
    years: 3,              // Karriere: so viele Erntejahre
    shopSec: 75,           // Ausbauphase zwischen den Jahren (Sekunden)
    farmMargin: 250,       // Kooperative: Gewinn pro geernteter Tonne (Produktionskosten tiefer als Planpreis)
    chocMargin: 250,       // Fabrik: Verarbeitungsmarge pro Tonne Grundbedarf
    fairPremium: 120,      // Fairtrade-Prämie pro Tonne
    loan: 25000,           // Notkredit nach einer Pleite …
    loanRate: 0.3,         // … mit 30 % Zins
    protectLow: 2000,      // Kooperative: Pflanzenschutz (Versicherung) in ruhigen Zeiten …
    protectHigh: 7000,     // … und wenn ein Dürre-/Krankheitsgerücht läuft
    buyerEvery: 32,        // Kooperative: ungefähr alle x Sekunden ein Händler-Angebot
    orderEvery: 28,        // Fabrik: ungefähr alle x Sekunden ein Kundenauftrag
    orderSec: 20,          // so lange ist ein Auftrag gültig
    minPrice: 900,
    maxPrice: 7000,
    // Wertung: Was im Dezember nicht abgesichert ist, wird kurzfristig gehandelt – 5 % schlechter als die Börse.
    spotPenalty: 0.05,
    // Gerüchte: Der Markt preist den erwarteten Effekt schnell ein (Anteil, Tempo pro Sekunde).
    // Wer sofort reagiert, hat einen kleinen Vorteil – sicher ist er nie.
    rumorPriced: 0.95,
    rumorSpeed: 0.3,
    rumorMin: 24,          // so lange läuft ein Gerücht mindestens (Sekunden) …
    rumorSpread: 14,       // … plus bis zu so viel Zufall
    // Progressive Einführung: ab welchem Jahr eine Nebenmechanik dazukommt
    featureYear: { deals: 1, yield: 2, smuggle: 2, orders: 2, recipe: 2, protect: 3, drying: 3, buyers: 99 },
    // Bei nur 1 Jahr: Kernspiel plus genau eine Besonderheit pro Rolle
    singleYearFeatures: ['deals', 'smuggle', 'recipe'],
    // Lieferverträge zwischen Kooperativen und Fabriken
    dealSec: 30,           // so lange gilt ein Angebot
    dealBand: 0.08,        // Preis höchstens ±8 % von der Börse
    breachFee: 250,        // Strafe pro Tonne bei Vertragsbruch (geht an die Gegenseite)
    decisionSec: 25,       // Zeit für eine Entscheidungskarte
    // Kooperative: Trocknung
    qSun: 80,              // Zuschlag pro Tonne für sorgfältig getrocknete Bohnen (Qualität A)
    qFast: -60,            // Abzug für schnell getrocknete Bohnen (Qualität B)
    rainRisk: 0.3,         // Regenrisiko beim Trocknen an der Sonne
    // Fabrik: Schokoladen-Krise ab +12 % und +24 %
    recipeStep: 0.12,
    // Krisenjahr: Einschuss steigt auf …
    crisisMargin: 0.2,
};

// Kurzer Text für «Neu in diesem Jahr»
// Gilt eine Neuerung für diese Rolle?
const featFor = (k, role) => [].concat(FEATURE_TEXT[k].role).includes(role);
const FEATURE_TEXT = {
    deals: { role: ['producer', 'processor'], icon: '📜', name: 'Lieferverträge', text: 'Kooperativen und Fabriken schliessen direkt Verträge ab: Menge und Preis für Dezember. Wer bricht, zahlt Strafe – und alle sehen es.' },
    smuggle: { role: 'producer', icon: '🕵️', name: 'Schmuggler', text: 'Steigt der Weltpreis, bieten Schmuggler deinen Bauern mehr Geld. Zahlst du keinen Bonus, verlierst du Tonnen.' },
    drying: { role: 'producer', icon: '☀️', name: 'Trocknung & Qualität', text: 'Sorgfältig an der Sonne trocknen bringt Qualität A – aber Regen kann Tonnen verderben.' },
    recipe: { role: 'processor', icon: '🍫', name: 'Schokoladen-Krise', text: 'Steigt Kakao stark, musst du reagieren: Preise erhöhen, Rezeptur ändern, Tafel verkleinern oder Kosten selbst tragen – mit Folgen.' },
    yield: { role: 'producer', icon: '🌦️', name: 'Wetter & Ernte', text: 'Wetter verändert jetzt deine Erntemenge. Futures sichern den Preis – nicht die Menge.' },
    protect: { role: 'producer', icon: '🛡️', name: 'Pflanzenschutz', text: 'Eine Versicherung, die Ernteverluste halbiert. Günstig, solange es ruhig ist.' },
    orders: { role: 'processor', icon: '📦', name: 'Kundenaufträge', text: 'Kunden bestellen Schokolade zu festen Preisen. Jeder Auftrag erhöht deinen Bedarf.' },
    buyers: { role: 'producer', icon: '🤝', name: 'Händler-Angebote', text: 'Händler bieten dir feste Preise für einen Teil der Ernte.' },
};

// ===== Konfetti (leichtgewichtig, ohne Bibliothek) =====
function confetti(ms = 3500, colors = ['#ffb547', '#22e58a', '#a78bfa', '#60a5fa', '#f472b6', '#fde047']) {
    const cv = document.createElement('canvas');
    cv.className = 'confetti';
    document.body.appendChild(cv);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = innerWidth;
    const H = innerHeight;
    cv.width = W * dpr;
    cv.height = H * dpr;
    const c = cv.getContext('2d');
    c.scale(dpr, dpr);
    const n = Math.min(220, Math.round(W / 6));
    const ps = Array.from({ length: n }, () => ({
        x: W / 2 + (Math.random() - 0.5) * W * 0.3, y: H * 0.35,
        vx: (Math.random() - 0.5) * 16, vy: -6 - Math.random() * 12,
        r: 4 + Math.random() * 6, a: Math.random() * 6, va: (Math.random() - 0.5) * 0.4,
        col: colors[Math.floor(Math.random() * colors.length)], shape: Math.random() < 0.5,
    }));
    const t0 = performance.now();
    const step = now => {
        const t = now - t0;
        c.clearRect(0, 0, W, H);
        for (const p of ps) {
            p.vy += 0.32;
            p.vx *= 0.99;
            p.x += p.vx;
            p.y += p.vy;
            p.a += p.va;
            c.save();
            c.globalAlpha = Math.max(0, 1 - Math.max(0, t - ms + 800) / 800);
            c.translate(p.x, p.y);
            c.rotate(p.a);
            c.fillStyle = p.col;
            if (p.shape) c.fillRect(-p.r / 2, -p.r / 4, p.r, p.r / 2);
            else {
                c.beginPath();
                c.arc(0, 0, p.r / 2.4, 0, Math.PI * 2);
                c.fill();
            }
            c.restore();
        }
        if (t < ms) requestAnimationFrame(step);
        else cv.remove();
    };
    requestAnimationFrame(step);
}

// ===== Eigene Rollen-Embleme (SVG statt Emoji) =====
let iconSeq = 0;
function roleIcon(role, size = 32) {
    const u = `ri${iconSeq++}`;
    const s = `width="${size}" height="${size}" viewBox="0 0 64 64" class="role-ico" aria-hidden="true"`;
    if (role === 'producer') {
        return `<svg ${s}><defs><linearGradient id="${u}a" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffd27a"/><stop offset=".5" stop-color="#e0822f"/><stop offset="1" stop-color="#7a3a12"/></linearGradient>
            <linearGradient id="${u}b" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#86efac"/><stop offset="1" stop-color="#15803d"/></linearGradient></defs>
            <path d="M44 8 C 56 4, 60 14, 52 20 C 48 14, 46 12, 44 8Z" fill="url(#${u}b)"/>
            <ellipse cx="30" cy="36" rx="16" ry="24" transform="rotate(-28 30 36)" fill="url(#${u}a)"/>
            <path d="M20 22 C 30 32, 30 44, 40 54 M26 16 C 36 28, 38 40, 46 48 M16 30 C 22 40, 24 48, 32 58" stroke="#5a2a0c" stroke-width="2" fill="none" opacity=".45" stroke-linecap="round"/>
            <ellipse cx="24" cy="26" rx="4" ry="8" transform="rotate(-28 24 26)" fill="#fff" opacity=".3"/>
            <path d="M42 14 L46 10" stroke="#3f6212" stroke-width="3" stroke-linecap="round"/></svg>`;
    }
    if (role === 'processor') {
        return `<svg ${s}><defs><linearGradient id="${u}a" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fcd34d"/><stop offset="1" stop-color="#b45309"/></linearGradient>
            <linearGradient id="${u}c" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8b4a22"/><stop offset="1" stop-color="#3b1a08"/></linearGradient></defs>
            <circle cx="46" cy="12" r="5" fill="#cbd5e1" opacity=".5"/><circle cx="52" cy="6" r="4" fill="#cbd5e1" opacity=".35"/>
            <rect x="40" y="14" width="8" height="20" rx="1.5" fill="#94a3b8"/>
            <path d="M6 58 V30 L18 22 V30 L30 22 V30 L42 22 V30 L58 30 V58 Z" fill="url(#${u}a)"/>
            <rect x="12" y="38" width="40" height="16" rx="3" fill="url(#${u}c)"/>
            <path d="M22 38 V54 M32 38 V54 M42 38 V54 M12 46 H52" stroke="#c98a4b" stroke-width="1.6" opacity=".7"/>
            <path d="M46 38 a6 6 0 0 0 6 6 V38Z" fill="#b45309"/></svg>`;
    }
    return `<svg ${s}><defs><linearGradient id="${u}a" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ddd6fe"/><stop offset=".55" stop-color="#8b5cf6"/><stop offset="1" stop-color="#4c1d95"/></linearGradient>
        <linearGradient id="${u}w" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#60a5fa"/><stop offset="1" stop-color="#1e3a8a"/></linearGradient></defs>
        <path d="M14 44 C 22 40, 30 16, 46 8 C 42 22, 44 34, 52 44 Z" fill="url(#${u}a)"/>
        <path d="M30 22 C 36 16, 40 13, 46 8" stroke="#fff" stroke-width="2" opacity=".5" fill="none" stroke-linecap="round"/>
        <path d="M4 46 Q 12 40 20 46 T 36 46 T 52 46 T 64 44 V60 H4 Z" fill="url(#${u}w)"/>
        <path d="M4 50 Q 12 44 20 50 T 36 50 T 52 50 T 64 48" stroke="#bfdbfe" stroke-width="2" fill="none" opacity=".7"/>
        <path d="M44 30 L50 24 L54 28 L60 20" stroke="#22e58a" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

// ===== Einfache Erklärung: Was ist ein Future und wie verdient meine Rolle Geld? =====
const FUTURE_INTRO = '<b>Ein Future ist ein Vertrag:</b> Du machst <b>heute</b> einen Preis ab, geliefert und bezahlt wird erst <b>im Dezember</b>. 1 Kontrakt = 10 t Kakao.';

function earnHTML(role) {
    const ex = (rows, cols) => `<table class="earn-ex"><tr><th></th>${cols.map(c => `<th>${c}</th>`).join('')}</tr>${rows.map(r => `<tr><td>${r[0]}</td>${r.slice(1).map((v, i) => `<td class="${i === r.length - 2 ? 'tot ' : ''}${String(v).startsWith('+') ? 'up' : String(v).startsWith('−') ? 'down' : ''}">${v}</td>`).join('')}</tr>`).join('')}</table>`;
    if (role === 'producer') {
        return `<div class="earn"><h4>💰 So verdienst du Geld</h4>
            <ol class="earn-steps">
                <li>Im Dezember verkaufst du deine <b>Ernte</b>. Wie viel du bekommst, hängt vom Preis <b>dann</b> ab – und den kennt heute niemand.</li>
                <li>Darum <b>verkaufst du heute Futures</b> (Knopf «ABSICHERN»). Damit legst du deinen Preis jetzt schon fest.</li>
                <li>Egal, was danach passiert: Was du bei der Ernte verlierst, gewinnst du beim Future – und umgekehrt.</li>
                <li>Was du bis Dezember <b>nicht</b> absicherst, musst du dann schnell verkaufen – <b>5 % unter dem Börsenpreis</b>.</li>
            </ol>
            <div class="earn-h">Beispiel: Du sicherst 10 t zu <b>2'500</b> ab</div>
            ${ex([['📉 Preis 2\'000', '20\'000', '+5\'000', '25\'000'], ['📈 Preis 3\'000', '30\'000', '−5\'000', '25\'000']], ['Ernte bringt', 'Future', 'Du bekommst'])}
            <p class="earn-win">🏆 Du gewinnst, wenn du zu einem <b>möglichst hohen Preis</b> absicherst. Also: Verkaufen, wenn Kakao teuer ist!</p></div>`;
    }
    if (role === 'processor') {
        return `<div class="earn"><h4>💰 So verdienst du Geld</h4>
            <ol class="earn-steps">
                <li>Im Dezember musst du <b>Kakao einkaufen</b>, um Schokolade zu machen. Wie viel er kostet, weiss heute niemand.</li>
                <li>Darum <b>kaufst du heute Futures</b> (Knopf «ABSICHERN»). Damit legst du deinen Einkaufspreis jetzt schon fest.</li>
                <li>Wird Kakao teurer, gewinnt dein Future – das gleicht den teureren Einkauf aus.</li>
                <li>Was du bis Dezember <b>nicht</b> absicherst, musst du dann schnell kaufen – <b>5 % über dem Börsenpreis</b>.</li>
            </ol>
            <div class="earn-h">Beispiel: Du sicherst 10 t zu <b>2'500</b> ab</div>
            ${ex([['📈 Preis 3\'000', '30\'000', '+5\'000', '25\'000'], ['📉 Preis 2\'000', '20\'000', '−5\'000', '25\'000']], ['Kakao kostet', 'Future', 'Du zahlst'])}
            <p class="earn-win">🏆 Du gewinnst, wenn du zu einem <b>möglichst tiefen Preis</b> absicherst. Also: Kaufen, wenn Kakao billig ist!</p></div>`;
    }
    return `<div class="earn"><h4>💰 So verdienst du Geld</h4>
        <ol class="earn-steps">
            <li>Du hast keinen Kakao – du <b>wettest auf den Preis</b>.</li>
            <li>Glaubst du, Kakao wird <b>teurer</b>? Dann <b>KAUFEN</b> (Long).</li>
            <li>Glaubst du, Kakao wird <b>billiger</b>? Dann <b>VERKAUFEN</b> (Short).</li>
            <li>Später machst du das Gegenteil und kassierst den Unterschied.</li>
        </ol>
        <div class="earn-h">Beispiel: 10 t, Preis heute <b>2'400</b></div>
        ${ex([['Gekauft → 📈 2\'600', '+2\'000'], ['Gekauft → 📉 2\'200', '−2\'000'], ['Verkauft → 📉 2\'200', '+2\'000']], ['Gewinn'])}
        <p class="earn-win">⚠️ Du musst nur 10 % als Pfand (Einschuss) hinterlegen. Darum sind Gewinne <b>und Verluste</b> gross. 🏆 Der Fonds mit dem höchsten Gewinn gewinnt.</p></div>`;
}

function roleRules(R) {
    return `<ul class="rules"><li class="can-h">Darf</li>${R.can.map(x => `<li class="can">${x}</li>`).join('')}<li class="can-h">Darf nicht</li>${R.cannot.map(x => `<li class="cannot">${x}</li>`).join('')}</ul>`;
}

const ROLES = {
    producer: {
        name: 'Kakao-Kooperative', short: 'Kooperative', icon: '🌱', color: '#4ade80', physical: 100, cash: 60000, limit: 15,
        goal: 'Verkaufe deine Ernte zu einem möglichst hohen Preis – bevor er fällt.',
        mission: 'Ihr erntet im Dezember <b>100 t Kakao</b>. Wer verkauft zum <b>besten Preis pro Tonne</b>?',
        hint: 'Ein Gerücht treibt den Preis hoch – jetzt verkaufen oder noch warten?',
        job: 'Verkäufer', tagline: 'Schütze deine Ernte vor fallenden Preisen.',
        can: ['Ernte heute schon verkaufen (Knopf ABSICHERN) – höchstens so viel, wie du erntest', 'Verkauf wieder rückgängig machen (AUFLÖSEN)'],
        cannot: ['Auf steigende Preise wetten – das dürfen nur Hedgefonds'],
    },
    processor: {
        name: 'Schokoladenfabrik', short: 'Fabrik', icon: '🏭', color: '#f59e0b', physical: -100, cash: 60000, limit: 15,
        goal: 'Kaufe deinen Kakao zu einem möglichst tiefen Preis – bevor er steigt.',
        mission: 'Ihr braucht im Dezember <b>100 t Kakao</b>. Wer kauft zum <b>tiefsten Preis pro Tonne</b> ein?',
        hint: 'Ein Gerücht drückt den Preis – jetzt kaufen oder noch warten?',
        job: 'Einkäufer', tagline: 'Sichere deinen Einkauf, bevor Kakao teurer wird.',
        can: ['Kakao heute schon kaufen (Knopf ABSICHERN) – höchstens deinen Bedarf', 'Kauf wieder rückgängig machen (AUFLÖSEN)'],
        cannot: ['Auf fallende Preise wetten – das dürfen nur Hedgefonds'],
    },
    spec: {
        name: 'Hedgefonds', short: 'Fonds', icon: '🦈', color: '#a78bfa', physical: 0, cash: 120000, limit: 20,
        goal: 'Wette auf steigende oder fallende Preise – und mach den grössten Gewinn.',
        mission: 'Ihr habt keinen Kakao. Ihr wettet auf den Preis – und übernehmt so das Risiko der anderen.',
        hint: 'Jedes Gerücht hat einen Ort. Im Terminal fragst du dort Berichte an – jeder ist nur ein Indiz.',
        job: 'Spekulant', tagline: 'Übernimm das Risiko der anderen – und verdiene daran.',
        can: ['Auf steigende Preise wetten (KAUFEN) oder auf fallende (VERKAUFEN) – bis 20 Kontrakte', 'Im Terminal (Laptop) Berichte zu Gerüchten anfordern'],
        cannot: ['Kakao ernten oder verarbeiten'],
    },
};

// News: Gerücht → (bestätigt | dementiert). impact = Preisänderung bei Bestätigung.
const NEWS = [
    { id: 'drought', icon: '☀️', impact: 0.12, prob: 0.65, yield: 0.88, rumor: 'Wetterdienst warnt vor Trockenheit', yes: 'Dürre bestätigt: Ernte bricht ein', no: 'Entwarnung: Regenzeit setzt pünktlich ein' },
    { id: 'blackpod', icon: '🍂', impact: 0.09, prob: 0.6, yield: 0.9, rumor: 'Pilzkrankheit «Black Pod» auf Plantagen gemeldet', yes: 'Black Pod breitet sich aus: Ernteausfälle bestätigt', no: 'Black Pod lokal begrenzt, keine Ernteausfälle' },
    { id: 'record', icon: '🌾', impact: -0.1, prob: 0.6, yield: 1.12, rumor: 'Insider: Rekordernte erwartet', yes: 'Offiziell: Rekordernte eingefahren', no: 'Rekordernte-Gerücht falsch: Ernte im Durchschnitt' },
    { id: 'export', icon: '🚫', impact: 0.08, prob: 0.5, rumor: 'Ghana erwägt Exportstopp für Rohkakao', yes: 'Ghana verhängt Exportstopp für 30 Tage', no: 'Regierung dementiert Exportstopp' },
    { id: 'asia', icon: '🍫', impact: 0.06, prob: 0.55, orders: 1.6, rumor: 'Asiatische Konzerne bestellen massiv Schokolade', yes: 'Rekordnachfrage aus Asien bestätigt', no: 'Nachfrage aus Asien bleibt flach' },
    { id: 'diet', icon: '🥗', impact: -0.07, prob: 0.6, rumor: 'EU plant Zuckersteuer auf Süsswaren', yes: 'Zuckersteuer beschlossen: Schokoladenabsatz sinkt', no: 'EU verzichtet auf Zuckersteuer' },
    { id: 'strike', icon: '⚓', impact: 0.05, prob: 0.55, rumor: 'Hafenarbeiter in Abidjan drohen mit Streik', yes: 'Hafenstreik: Kakaoschiffe stecken fest', no: 'Einigung im Hafen von Abidjan, kein Streik' },
    { id: 'ecuador', icon: '🌴', impact: -0.07, prob: 0.6, rumor: 'Neue Grossplantagen in Ecuador sollen bald liefern', yes: 'Ecuador liefert erste Grossernte aus', no: 'Plantagen in Ecuador verzögern sich um ein Jahr' },
    { id: 'rain', icon: '🌧️', impact: -0.06, prob: 0.65, yield: 1.12, rumor: 'Prognose: ideales Regenwetter', yes: 'Perfekte Wachstumsbedingungen: Ernte steigt', no: 'Wetter normalisiert sich, keine Rekordernte' },
    { id: 'fund', icon: '🏦', impact: -0.08, prob: 0.5, rumor: 'Grosser Rohstofffonds soll Kakao-Positionen abbauen', yes: 'Fonds verkauft: Kakao unter Druck', no: 'Fonds hält Positionen, Gerücht falsch' },
];
const SURPRISES = [
    { id: 'container', icon: '📦', impact: 0.04, text: 'EILMELDUNG: Containerknappheit verzögert Lieferungen' },
    { id: 'dollar', icon: '💵', impact: -0.035, text: 'EILMELDUNG: Starker Dollar drückt Rohstoffpreise' },
    { id: 'frost', icon: '❄️', impact: 0.04, text: 'EILMELDUNG: Ungewöhnliche Kälte in Brasiliens Kakaoregion' },
    { id: 'recession', icon: '📉', impact: -0.045, text: 'EILMELDUNG: Rezessionsangst – Konsumgüter unter Druck' },
];

// ===== Hedgefonds-Terminal: Intel-Karte =====
// Jedes Gerücht hat einen Ort. Wer weiss, WO er nachschauen muss, bekommt Indizien – nie die Lösung.
// Quellen-Typen: Kosten (CHF), Dauer (s), Trefferchance.
// Seriöse Quellen lügen nie: Mit der Trefferchance liefern sie einen EINDEUTIGEN Befund (der immer stimmt),
// sonst «kein klarer Befund». Nur Social Media (soft) kann falsch liegen.
const INTEL_TYPES = {
    sat: { icon: '🛰️', name: 'Satellitenbild', cost: 3000, dur: 8, rel: 0.6, unclear: 'Dichte Wolkendecke – kein klares Bild.' },
    field: { icon: '📋', name: 'Feldbericht', cost: 2000, dur: 7, rel: 0.55, unclear: 'Die Bauern sind sich uneinig – kein klarer Befund.' },
    weather: { icon: '🌧️', name: 'Wetterstation', cost: 1500, dur: 5, rel: 0.55, unclear: 'Messdaten lückenhaft – kein klarer Befund.' },
    port: { icon: '⚓', name: 'Hafenradar', cost: 2500, dur: 6, rel: 0.6, unclear: 'Signal gestört – keine klaren Daten.' },
    gov: { icon: '🏛️', name: 'Quelle in der Politik', cost: 2500, dur: 7, rel: 0.5, unclear: 'Die Quelle will sich noch nicht festlegen.' },
    demand: { icon: '🏭', name: 'Bestelldaten Hersteller', cost: 2500, dur: 6, rel: 0.55, unclear: 'Die Zahlen sind noch nicht vollständig.' },
    whs: { icon: '📦', name: 'Lagerbestände', cost: 1500, dur: 4, rel: 0.45, unclear: 'Bewegungen uneinheitlich – kein klares Bild.' },
    funds: { icon: '💼', name: 'Fondsflüsse (COT-Bericht)', cost: 2500, dur: 6, rel: 0.6, unclear: 'Die Daten der Woche sind noch nicht veröffentlicht.' },
    social: { icon: '💬', name: 'Social Media', cost: 300, dur: 2, rel: 0.55, soft: true },
};
// Orte auf der Karte (Längen-/Breitengrad) mit den Quellen, die es dort gibt
const INTEL_LOCS = {
    gh: { name: 'Ghana · Plantagen', lon: -1.6, lat: 7.6, types: ['sat', 'field', 'weather'], region: 'ghana' },
    ci: { name: 'Elfenbeinküste · Plantagen', lon: -6.2, lat: 7.8, types: ['sat', 'field', 'weather'], region: 'ivory' },
    ec: { name: 'Ecuador', lon: -79, lat: -1.5, types: ['sat', 'field', 'weather', 'port'], region: 'ecuador' },
    id: { name: 'Indonesien · Sulawesi', lon: 120.5, lat: -2, types: ['sat', 'field', 'weather'], region: 'indonesia' },
    abj: { name: 'Abidjan · Hafen', lon: -4, lat: 4.4, types: ['port', 'gov'] },
    acc: { name: 'Accra · Hafen Tema', lon: 0.6, lat: 5.0, types: ['port', 'gov'] },
    lon: { name: 'London · Börse & Lager', lon: -0.1, lat: 51.5, types: ['whs'] },
    bru: { name: 'Brüssel · EU', lon: 4.4, lat: 50.8, types: ['gov', 'demand'] },
    nyc: { name: 'New York · Fonds', lon: -74, lat: 40.7, types: ['funds'] },
    sha: { name: 'Shanghai · Hersteller Asien', lon: 121.5, lat: 31.2, types: ['demand'] },
    web: { name: 'Social Media', lon: -150, lat: 30, types: ['social'] },
};
const REGION_LOC = { ghana: 'gh', ivory: 'ci', ecuador: 'ec', indonesia: 'id' };
// Pro Gerücht: welche Quelle an welchem Ort etwas aussagt ('R' = Region des Gerüchts) und was sie zeigt
// [Text, wenn das Indiz für BESTÄTIGT spricht, Text, wenn es für DEMENTI spricht]
const INTEL_HINTS = {
    drought: {
        'sat@R': ['Vegetationsindex {R}: −11 % gegenüber Vorjahr. Blätter welken.', 'Vegetationsindex {R}: normal (+1 %). Die Bäume sind grün.'],
        'weather@R': ['Seit 5 Wochen kaum Regen in {R} (−70 %).', 'Regenmengen in {R} im Normalbereich.'],
        'field@R': ['Bauern in {R} melden vertrocknete Schoten.', 'Feldbericht {R}: Schoten entwickeln sich normal.'],
    },
    blackpod: {
        'field@R': ['Feldbericht {R}: schwarze, faulende Schoten auf vielen Höfen.', 'Feldbericht {R}: nur vereinzelte kranke Schoten.'],
        'sat@R': ['Satellit {R}: dunkle Flecken in den Plantagen.', 'Satellit {R}: Plantagen unauffällig.'],
    },
    record: {
        'sat@R': ['Vegetationsindex {R}: +12 % – sehr dichte Kronen.', 'Vegetationsindex {R}: durchschnittlich.'],
        'field@R': ['Feldbericht {R}: Bäume hängen voller Schoten.', 'Feldbericht {R}: normale Zahl an Schoten.'],
        'weather@R': ['Ideale Regen- und Sonnenphasen in {R}.', 'Wetter in {R}: durchschnittlich.'],
    },
    rain: {
        'weather@R': ['Regen in {R} genau zur richtigen Zeit (+15 %).', 'Regen in {R} eher knapp.'],
        'sat@R': ['Vegetationsindex {R}: +9 %.', 'Vegetationsindex {R}: normal.'],
    },
    export: {
        'gov@acc': ['Quelle im Ministerium in Accra: Der Exportstopp ist unterschriftsreif.', 'Quelle in Accra: Der Exportstopp ist vom Tisch.'],
        'port@acc': ['Hafen Tema: Kakao-Verladung gestoppt, Lager füllen sich.', 'Hafen Tema: Verladung läuft normal.'],
    },
    asia: {
        'demand@sha': ['Shanghai: Hersteller bestellen 40 % mehr Kakaobutter.', 'Shanghai: Bestellungen auf Vorjahresniveau.'],
        'whs@lon': ['Lagerbestände London sinken schnell – es wird viel abgeholt.', 'Lagerbestände London stabil.'],
    },
    diet: {
        'gov@bru': ['EU-Parlament: Mehrheit für die Zuckersteuer steht.', 'EU-Parlament: Zuckersteuer hat keine Mehrheit.'],
        'demand@bru': ['Europas Hersteller kürzen vorsorglich ihre Bestellungen.', 'Europas Hersteller bestellen normal.'],
    },
    strike: {
        'port@abj': ['Hafen Abidjan: 14 Schiffe warten (normal 6), die Kräne stehen still.', 'Hafen Abidjan: 5 Schiffe am Pier, Verladung normal.'],
        'gov@abj': ['Gewerkschaft Abidjan: Streikbeschluss gefasst.', 'Gewerkschaft Abidjan: Einigung in Sicht.'],
    },
    ecuador: {
        'port@ec': ['Hafen Guayaquil: Rekord-Verschiffung von Kakao angemeldet.', 'Hafen Guayaquil: Verschiffung normal.'],
        'field@ec': ['Feldbericht Ecuador: Die neuen Plantagen tragen schon.', 'Feldbericht Ecuador: Die jungen Bäume tragen noch kaum.'],
    },
    fund: {
        'funds@nyc': ['COT-Bericht: Grosse Fonds bauen Long-Positionen massiv ab.', 'COT-Bericht: Die Fonds halten ihre Positionen.'],
        'whs@lon': ['London: Fonds lassen Kakao aus den Lagern verkaufen.', 'London: keine auffälligen Lagerbewegungen.'],
    },
};

const BUYERS = ['Barry Callebaut', 'Lindt & Sprüngli', 'Cargill', 'Nestlé', 'Ferrero', 'Olam Food', 'Touton Trading'];
const CLIENTS = ['Alpenmarkt', 'Kaufhaus Helvetia', 'Bahnhofkiosk AG', 'Pralinen-Boutique', 'Export Asien', 'Hotelkette Seeblick', 'Discounter Spar-Fix', 'Café-Kette Bohne'];

const REGION_BOTS = {
    ghana: ['Ghana Cocoa Coop', 'Kumasi Kakao', 'Ashanti Farmers'],
    ivory: ['Côte Farmers', 'Akwaba Kakao', 'Abidjan Coop'],
    ecuador: ['Ecuador Verde', 'Cacao Andino', 'Guayas Coop'],
    indonesia: ['Sulawesi Kakao', 'Nusantara Coop', 'Makassar Farmers'],
};
const BOT_NAMES = {
    producer: ['Ghana Cocoa Coop', 'Côte Farmers', 'Ecuador Verde', 'Akwaba Kakao'],
    processor: ['Alpenschoko AG', 'Choco Suisse', 'Nordcacao', 'Praliné & Co'],
    spec: ['Basel Capital', 'Zürich Macro', 'Lemming Fund', 'Hai-Tech Partners'],
};

const GLOSSARY = [
    ['Future', 'Börsengehandelter Vertrag: Menge, Qualität und Liefertermin sind fix, nur der Preis wird gehandelt. Beide Seiten müssen erfüllen.'],
    ['Long / Short', 'Long = Future gekauft, gewinnt bei steigenden Preisen. Short = verkauft, gewinnt bei fallenden Preisen.'],
    ['Hedging', 'Ein bestehendes Preisrisiko mit einem Future ausgleichen – z. B. die Kooperative verkauft ihre Ernte im Voraus.'],
    ['Spekulation', 'Bewusst ein Preisrisiko eingehen, um zu verdienen. Spekulanten übernehmen das Risiko der Hedger.'],
    ['Einschuss (Margin)', 'Sicherheit bei der Börse: 10 % des Kontraktwerts. Darum wirkt jeder Kursschritt mit Hebel.'],
    ['Mark-to-Market', 'Am Monatsende werden alle Positionen zum Marktpreis abgerechnet. Gewinne/Verluste fliessen aufs Margin-Konto.'],
    ['Margin Call', 'Fällt das Margin-Konto unter 70 % des nötigen Einschusses, muss man nachschiessen – sonst Zwangsglattstellung.'],
    ['Gegenpartei', 'Hinter jedem Kauf steht ein Verkauf. Was der eine gewinnt, verliert der andere.'],
    ['Eingepreist', 'Ein Gerücht bewegt den Preis schon, bevor es bestätigt ist. Wer erst bei der Bestätigung reagiert, ist oft zu spät.'],
    ['Fälligkeit', 'Im Dezember wird abgerechnet. Der Future-Preis entspricht dann dem Kassapreis – die Absicherung «sitzt».'],
];

// ===== Helpers =====
const fmt = n => Math.round(n).toLocaleString('de-CH');
const fmtCHF = n => `${n < 0 ? '−' : ''}${fmt(Math.abs(n))}`;
const signed = n => `${n > 0 ? '+' : n < 0 ? '−' : '±'}${fmt(Math.abs(n))}`;
const pct = x => `${x > 0 ? '+' : x < 0 ? '−' : '±'}${Math.abs(x * 100).toFixed(1)} %`;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rand = arr => arr[Math.floor(Math.random() * arr.length)];
function shuffleArr(a) {
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sleep = ms => new Promise(r => setTimeout(r, ms));
function gauss() {
    let u = 0;
    let v = 0;
    while (!u) u = Math.random();
    while (!v) v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
const $ = id => document.getElementById(id);

// ===== Sound (Web Audio) =====
const Sound = (() => {
    // Alle Klänge werden live erzeugt (Web Audio, keine Dateien): Oszillatoren + gefiltertes Rauschen,
    // über Kompressor und einen leichten Hall. Stumm = Hauptregler auf 0 – auch bereits geplante Töne verstummen.
    let ac = null;
    let out = null;
    let dry = null;
    let wet = null;
    let noiseBuf = null;
    let muted = false;
    try { muted = localStorage.getItem('kakaopit-muted') === '1'; } catch (e) { /* egal */ }
    const VOL = 0.55;

    function init() {
        if (ac) return;
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        ac = new AC();
        const comp = ac.createDynamicsCompressor();
        comp.threshold.value = -16;
        comp.ratio.value = 4;
        out = ac.createGain();
        out.gain.value = muted ? 0 : VOL;
        comp.connect(out);
        out.connect(ac.destination);
        dry = ac.createGain();
        dry.connect(comp);
        // Kurzer, generierter Hall
        const len = Math.round(ac.sampleRate * 1.4);
        const ir = ac.createBuffer(2, len, ac.sampleRate);
        for (let ch = 0; ch < 2; ch++) {
            const d = ir.getChannelData(ch);
            for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
        }
        const conv = ac.createConvolver();
        conv.buffer = ir;
        wet = ac.createGain();
        wet.gain.value = 0.22;
        wet.connect(conv);
        conv.connect(comp);
        noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
        const nd = noiseBuf.getChannelData(0);
        for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    }

    function route(node, reverb) {
        node.connect(dry);
        if (reverb) node.connect(wet);
    }

    // Ein Ton mit Hüllkurve, optional Tonhöhen-Gleiten und Filter
    function tone(f, d, { type = 'sine', vol = 0.2, when = 0, to = null, attack = 0.008, cutoff = null, reverb = true, detune = 0 } = {}) {
        if (!ac) return;
        const t = ac.currentTime + when;
        const o = ac.createOscillator();
        const g = ac.createGain();
        o.type = type;
        o.detune.value = detune;
        o.frequency.setValueAtTime(f, t);
        if (to) o.frequency.exponentialRampToValueAtTime(to, t + d);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(vol, t + attack);
        g.gain.exponentialRampToValueAtTime(0.0001, t + d);
        let last = o;
        if (cutoff) {
            const fl = ac.createBiquadFilter();
            fl.type = 'lowpass';
            fl.frequency.setValueAtTime(cutoff, t);
            fl.frequency.exponentialRampToValueAtTime(Math.max(200, cutoff / 4), t + d);
            o.connect(fl);
            last = fl;
        }
        last.connect(g);
        route(g, reverb);
        o.start(t);
        o.stop(t + d + 0.05);
    }

    // Gefiltertes Rauschen (Trommeln, Klicks, Becken)
    function noise(d, { vol = 0.2, when = 0, type = 'bandpass', freq = 1000, q = 1, reverb = true } = {}) {
        if (!ac) return;
        const t = ac.currentTime + when;
        const src = ac.createBufferSource();
        src.buffer = noiseBuf;
        const fl = ac.createBiquadFilter();
        fl.type = type;
        fl.frequency.value = freq;
        fl.Q.value = q;
        const g = ac.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(vol, t + 0.004);
        g.gain.exponentialRampToValueAtTime(0.0001, t + d);
        src.connect(fl);
        fl.connect(g);
        route(g, reverb);
        src.start(t, Math.random() * 0.5);
        src.stop(t + d + 0.05);
    }

    // Glocke: unharmonische Teiltöne wie eine echte Börsenglocke
    function bellHit(f, when, vol) {
        [[1, 1], [2.76, 0.5], [5.4, 0.25], [8.93, 0.12]].forEach(([m, v]) => tone(f * m, 2.2 / Math.sqrt(m), { vol: vol * v, when, attack: 0.003 }));
    }

    const S = {
        bell: () => [0, 0.42, 0.84].forEach(w => bellHit(880, w, 0.22)),
        buy: () => { tone(660, 0.09, { type: 'triangle', vol: 0.16 }); tone(990, 0.18, { type: 'triangle', vol: 0.14, when: 0.07 }); noise(0.03, { vol: 0.08, freq: 4000, reverb: false }); },
        sell: () => { tone(740, 0.09, { type: 'triangle', vol: 0.16 }); tone(494, 0.18, { type: 'triangle', vol: 0.14, when: 0.07 }); noise(0.03, { vol: 0.08, freq: 3000, reverb: false }); },
        news: () => {
            // Nachrichten-Jingle: drei Töne mit gefiltertem Sägezahn, darunter ein tiefer Schwall
            [[659, 0], [784, 0.12], [1047, 0.24]].forEach(([f, w]) => { tone(f, 0.28, { type: 'sawtooth', vol: 0.08, when: w, cutoff: 3200 }); tone(f, 0.28, { type: 'sawtooth', vol: 0.06, when: w, cutoff: 3200, detune: 9 }); });
            tone(130, 0.7, { type: 'sine', vol: 0.18, when: 0.2 });
        },
        alarm: () => { for (let i = 0; i < 3; i++) tone(620, 0.32, { type: 'triangle', vol: 0.16, when: i * 0.36, to: 980 }); },
        cash: () => { for (let i = 0; i < 7; i++) tone(2400 + Math.random() * 1800, 0.12, { vol: 0.06, when: i * 0.045 }); noise(0.05, { vol: 0.08, freq: 6000, q: 3 }); },
        tick: () => { noise(0.025, { vol: 0.12, freq: 2200, q: 8, reverb: false }); tone(1600, 0.03, { vol: 0.04, reverb: false }); },
        join: () => { tone(523, 0.12, { type: 'triangle', vol: 0.14 }); tone(784, 0.22, { type: 'triangle', vol: 0.14, when: 0.08 }); },
        error: () => tone(220, 0.22, { type: 'triangle', vol: 0.14, to: 160 }),
        end: () => [523, 659, 784, 1047, 784, 1047].forEach((f, i) => { tone(f, 0.35, { type: 'sawtooth', vol: 0.06, when: i * 0.13, cutoff: 2600 }); tone(f / 2, 0.35, { type: 'triangle', vol: 0.08, when: i * 0.13 }); }),
        drum: () => {
            // Wirbel auf der kleinen Trommel, immer lauter – dann Pauke und Becken
            for (let i = 0; i < 22; i++) noise(0.07, { vol: 0.03 + i * 0.006, when: i * 0.09, freq: 1800, q: 0.8, reverb: false });
            tone(70, 0.9, { vol: 0.35, when: 2.0, to: 45 });
            noise(1.3, { vol: 0.12, when: 2.0, type: 'highpass', freq: 6000, q: 0.5 });
        },
        fanfare: () => [523, 659, 784, 1047].forEach((f, i) => {
            tone(f, 0.5, { type: 'sawtooth', vol: 0.07, when: i * 0.12, cutoff: 3000 });
            tone(f, 0.5, { type: 'sawtooth', vol: 0.05, when: i * 0.12, cutoff: 3000, detune: 12 });
            tone(f / 2, 0.5, { type: 'triangle', vol: 0.07, when: i * 0.12 });
        }),
    };

    function setMuted(m) {
        muted = !!m;
        try { localStorage.setItem('kakaopit-muted', muted ? '1' : '0'); } catch (e) { /* egal */ }
        if (out && ac) {
            // sofort leise – auch Töne, die schon geplant sind (Trommelwirbel, Glocke)
            out.gain.cancelScheduledValues(ac.currentTime);
            out.gain.setValueAtTime(muted ? 0 : VOL, ac.currentTime);
        }
        document.querySelectorAll('.snd-btn').forEach(b => { b.textContent = muted ? '🔇' : '🔊'; b.title = muted ? 'Ton an' : 'Ton aus'; });
        return muted;
    }

    return {
        init,
        play: n => {
            if (muted) return;
            if (!ac) init();
            if (ac && ac.state === 'suspended') ac.resume();
            if (S[n]) S[n]();
        },
        toggle: () => setMuted(!muted),
        setMuted,
        muted: () => muted,
    };
})();

// ===== Karriere: Ausbau zwischen den Jahren =====
const UPGRADES = {
    producer: [
        { id: 'land', icon: '🌳', name: 'Mehr Land', cost: 20000, desc: '+30 t Ernte pro Jahr. Mehr Kakao = mehr Gewinn – aber auch mehr abzusichern.' },
        { id: 'irrigation', icon: '💧', name: 'Bewässerung', cost: 12000, desc: 'Dürre und Krankheit treffen dich nur noch halb so hart – jedes Jahr, ohne Versicherung.' },
        { id: 'fairtrade', icon: '🤝', name: 'Fairtrade-Zertifikat', cost: 15000, desc: `+${CFG.fairPremium} CHF Prämie für jede verkaufte Tonne.` },
    ],
    processor: [
        { id: 'pralines', icon: '🍫', name: 'Pralinen-Linie', cost: 12000, desc: 'Kundenaufträge bringen 60 % mehr Marge.' },
        { id: 'contract', icon: '📜', name: 'Grosskunden-Vertrag', cost: 9000, desc: 'Jedes Jahr ein sicherer Auftrag: 30 t zu Planpreis + 150 CHF/t.' },
        { id: 'marketing', icon: '📣', name: 'Marketing', cost: 10000, desc: 'Kunden bestellen deutlich häufiger.' },
    ],
    spec: [
        { id: 'analysts', icon: '🧠', name: 'Analysten-Team', cost: 18000, desc: 'Mehr eindeutige Befunde (+12 Prozentpunkte Trefferchance).' },
        { id: 'credit', icon: '🏦', name: 'Kreditlinie', cost: 22000, desc: 'Positionslimit +10 Kontrakte (30 statt 20).' },
        { id: 'network', icon: '📡', name: 'Netzwerk', cost: 12000, desc: 'Berichte halb so teuer und doppelt so schnell.' },
    ],
};

const RANKS = [
    { name: 'Junior', icon: '🌱' },
    { name: 'Trader', icon: '📈' },
    { name: 'Senior', icon: '💼' },
    { name: 'Legende', icon: '👑' },
];


// ===== Weltkarte: Anbauregionen (Längen-/Breitengrad) =====
const REGIONS = {
    ghana: { name: 'Ghana', lon: -1.5, lat: 7, crop: 'cocoa' },
    ivory: { name: 'Elfenbeinküste', lon: -5.5, lat: 7.5, crop: 'cocoa' },
    ecuador: { name: 'Ecuador', lon: -79, lat: -1.5, crop: 'cocoa' },
    indonesia: { name: 'Indonesien', lon: 120.5, lat: -2, crop: 'cocoa' },
};
// Stark vereinfachte Landmasse für die Punkte-Weltkarte: [Breitengrad, [[von, bis] Längengrad, …]]
const LAND = [
    [75, [[-120, -70], [-70, -20], [55, 60], [95, 110]]],
    [70, [[-165, -140], [-125, -65], [-55, -20], [60, 180]]],
    [65, [[-168, -60], [-52, -25], [-24, -14], [10, 180]]],
    [60, [[-165, -95], [-78, -62], [-48, -42], [5, 180]]],
    [55, [[-133, -92], [-78, -58], [-8, 2], [8, 140], [155, 163]]],
    [50, [[-128, -55], [-5, 140], [142, 145]]],
    [45, [[-124, -62], [-1, 135], [140, 145]]],
    [40, [[-124, -74], [-9, 3], [8, 18], [20, 120], [125, 130], [139, 142]]],
    [35, [[-120, -76], [-8, 11], [33, 120], [130, 140]]],
    [30, [[-115, -81], [-10, 32], [34, 122]]],
    [25, [[-112, -97], [-82, -80], [-16, 35], [37, 57], [60, 122]]],
    [20, [[-106, -87], [-17, 40], [40, 58], [70, 88], [92, 110]]],
    [15, [[-92, -83], [-17, 42], [43, 52], [74, 80], [97, 109], [120, 122]]],
    [10, [[-86, -60], [-15, 50], [76, 80], [98, 107], [122, 126]]],
    [5, [[-78, -52], [-10, 48], [100, 104], [115, 119]]],
    [0, [[-80, -48], [9, 42], [100, 105], [109, 119], [120, 125]]],
    [-5, [[-81, -35], [12, 40], [105, 115], [120, 123], [135, 150]]],
    [-10, [[-78, -35], [13, 40], [120, 125], [142, 145]]],
    [-15, [[-76, -39], [12, 41], [44, 50], [125, 145]]],
    [-20, [[-70, -40], [13, 35], [44, 48], [114, 150]]],
    [-25, [[-70, -45], [15, 33], [44, 47], [113, 153]]],
    [-30, [[-72, -50], [17, 31], [115, 153]]],
    [-35, [[-72, -57], [18, 21], [116, 140], [142, 150]]],
    [-40, [[-74, -62], [145, 148], [172, 178]]],
    [-45, [[-75, -65], [167, 172]]],
    [-50, [[-75, -68]]],
    [-55, [[-72, -64]]],
];
const COCOA_REGIONS = Object.keys(REGIONS).filter(k => REGIONS[k].crop === 'cocoa');

