// ===== KAKAO PIT – gemeinsame Daten und Hilfsfunktionen =====

const CFG = {
    size: 10,              // Tonnen pro Kontrakt
    p0: 2400,              // Startpreis CHF pro Tonne
    months: 4,             // Handelsmonate bis zur Fälligkeit (Dezember)
    monthSec: { kurz: 60, normal: 90, lang: 120 },
    settleSec: 7,          // Pause für die Abrechnung am Monatsende
    marginRate: 0.10,      // Einschuss: 10 % des Kontraktwerts
    maintenance: 0.7,      // Margin Call unter 70 % des nötigen Einschusses
    callSec: 25,           // Zeit, um nachzuschiessen
    fee: 8,                // CHF pro Kontrakt am Markt
    spread: 0.0015,        // Geld-Brief-Spanne des Market Makers
    vol: 0.0042,           // Zufallsschwankung pro Sekunde
    impact: 0.00025,       // Preiswirkung pro netto gehandeltem Kontrakt (klein: einzelne Trades bewegen den Markt kaum)
    offerSec: 35,          // Laufzeit eines Angebots auf dem Board
    offerBand: 0.04,       // Angebote max. ±4 % vom Marktpreis
    years: 3,              // Karriere: so viele Erntejahre
    shopSec: 75,           // Ausbauphase zwischen den Jahren (Sekunden)
    farmMargin: 250,       // Kooperative: Gewinn pro geernteter Tonne (Produktionskosten tiefer als Planpreis)
    chocMargin: 250,       // Fabrik: Verarbeitungsmarge pro Tonne Grundbedarf
    fairPremium: 120,      // Fairtrade-Prämie pro Tonne
    loan: 25000,           // Notkredit nach einer Pleite …
    loanRate: 0.3,         // … mit 30 % Zins
    bankMonth: 2,          // Bankprüfung am Ende dieses Monats …
    bankQuota: 0.5,        // … mindestens so viel muss abgesichert sein
    bankFee: 6000,         // sonst Risikozuschlag
    protectLow: 2000,      // Kooperative: Pflanzenschutz (Versicherung) in ruhigen Zeiten …
    protectHigh: 7000,     // … und wenn ein Dürre-/Krankheitsgerücht läuft
    buyerEvery: 32,        // Kooperative: ungefähr alle x Sekunden ein Händler-Angebot
    cancelProb: 0.45,      // Fabrik: Chance auf eine Stornierung pro Prüfung
    orderEvery: 28,        // Fabrik: ungefähr alle x Sekunden ein Kundenauftrag
    orderSec: 20,          // so lange ist ein Auftrag gültig
    researchCost: 2500,    // Hedgefonds: Research-Bericht
    researchHit: 0.8,      // Trefferquote der Research-Quelle
    researchCooldown: 20,
    minPrice: 900,
    maxPrice: 7000,
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
                <li>Zwischendurch bieten dir <b>Händler</b> feste Preise an, und Mitglieder liefern <b>Nachernte</b>. Prüfe jedes Mal: Ist das ein guter Preis? Ist alles abgesichert?</li>
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
                <li>Bonus: Kunden bestellen Schokolade zu einem <b>festen Preis</b>. Hast du billig eingekauft, verdienst du daran extra. Aber Vorsicht: Kunden können <b>stornieren</b> – dann bist du überabgesichert.</li>
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
        mission: 'Ihr erntet im Dezember <b>ca. 100 t Kakao</b>. Ihr tretet gegen die anderen Kooperativen an: Wer erzielt den <b>besten Preis pro Tonne</b>? Verkauft Futures, wenn der Preis hoch ist – aber wartet ihr zu lange, kann er abstürzen.',
        hint: 'Timing ist alles: Ein Dürre-Gerücht treibt den Preis hoch – jetzt verkaufen oder noch warten? 🏦 Die Bank verlangt bis Ende Monat 2 mindestens 50 % Absicherung. Und Achtung: Steigt der Preis, musst du Geld nachschiessen – zu viel absichern mit zu wenig Bargeld kann dich ruinieren.',
        job: 'Short-Hedger', tagline: 'Schütze deine Ernte vor fallenden Preisen.',
        can: ['Ernte auf Termin verkaufen (Short) – höchstens so viel, wie du erntest', 'Händler-Angebote annehmen: Direktverkauf zu festem Preis', 'Pflanzenschutz kaufen (günstig, solange es ruhig ist)', 'Absicherung wieder auflösen'],
        cannot: ['Futures kaufen (Long)', 'Mehr verkaufen, als du erntest', 'Research-Berichte'],
    },
    processor: {
        name: 'Schokoladenfabrik', short: 'Fabrik', icon: '🏭', color: '#f59e0b', physical: -100, cash: 60000, limit: 15,
        mission: 'Ihr braucht im Dezember <b>100 t Kakao</b>. Ihr tretet gegen die anderen Fabriken an: Wer kauft <b>am günstigsten</b> ein? Kauft Futures, wenn der Preis tief ist. Kundenaufträge zu festen Preisen bringen zusätzliche Marge – aber Kunden können auch stornieren.',
        hint: 'Timing ist alles: Kommt ein Gerücht über eine Rekordernte, fällt der Preis – warten oder jetzt kaufen? 🏦 Die Bank verlangt bis Ende Monat 2 mindestens 50 % Absicherung. Fällt der Preis stark, musst du Geld nachschiessen.',
        job: 'Long-Hedger', tagline: 'Sichere deinen Einkauf, bevor Kakao teurer wird.',
        can: ['Kakao auf Termin kaufen (Long) – höchstens deinen Bedarf', 'Kundenaufträge annehmen oder ablehnen', 'Absicherung wieder auflösen'],
        cannot: ['Futures verkaufen (Short)', 'Mehr kaufen, als du brauchst', 'Research-Berichte'],
    },
    spec: {
        name: 'Hedgefonds', short: 'Fonds', icon: '🦈', color: '#a78bfa', physical: 0, cash: 120000, limit: 20,
        mission: 'Ihr habt keinen Kakao und braucht keinen. Ihr handelt nur auf Kursbewegungen – und übernehmt damit das Risiko der anderen. Euer Vorteil: <b>Research</b> über Gerüchte und ein grösseres Positionslimit.',
        hint: 'Kauft Research-Berichte (meistens richtig, nicht immer) und handelt, bevor die News bestätigt wird. Hoher Hebel, Margin Calls und Konkurs sind real.',
        job: 'Spekulant', tagline: 'Übernimm das Risiko der anderen – und verdiene daran.',
        can: ['Long und Short handeln – bis 20 Kontrakte', 'Research-Berichte kaufen', 'Als Gegenpartei der Hedger auftreten'],
        cannot: ['Kakao ernten oder verarbeiten', 'Kundenaufträge', 'Bank-Kredit (ihr habt nur euer Kapital)'],
    },
};

// News: Gerücht → (bestätigt | dementiert). impact = Preisänderung bei Bestätigung.
const NEWS = [
    { id: 'drought', icon: '☀️', impact: 0.12, prob: 0.65, yield: 0.88, rumor: 'Wetterdienst warnt vor Trockenheit in Westafrika', yes: 'Dürre bestätigt: Ernte in Ghana bricht ein', no: 'Entwarnung: Regenzeit setzt pünktlich ein' },
    { id: 'blackpod', icon: '🍂', impact: 0.09, prob: 0.6, yield: 0.9, rumor: 'Pilzkrankheit «Black Pod» auf Plantagen gemeldet', yes: 'Black Pod breitet sich aus: Ernteausfälle bestätigt', no: 'Black Pod lokal begrenzt, keine Ernteausfälle' },
    { id: 'record', icon: '🌾', impact: -0.1, prob: 0.6, yield: 1.12, rumor: 'Insider: Elfenbeinküste erwartet Rekordernte', yes: 'Offiziell: Rekordernte an der Elfenbeinküste', no: 'Rekordernte-Gerücht falsch: Ernte im Durchschnitt' },
    { id: 'export', icon: '🚫', impact: 0.08, prob: 0.5, rumor: 'Ghana erwägt Exportstopp für Rohkakao', yes: 'Ghana verhängt Exportstopp für 30 Tage', no: 'Regierung dementiert Exportstopp' },
    { id: 'asia', icon: '🍫', impact: 0.06, prob: 0.7, orders: 1.6, rumor: 'Asiatische Konzerne bestellen massiv Schokolade', yes: 'Rekordnachfrage aus Asien bestätigt', no: 'Nachfrage aus Asien bleibt flach' },
    { id: 'diet', icon: '🥗', impact: -0.05, prob: 0.6, rumor: 'EU plant Zuckersteuer auf Süsswaren', yes: 'Zuckersteuer beschlossen: Schokoladenabsatz sinkt', no: 'EU verzichtet auf Zuckersteuer' },
    { id: 'strike', icon: '⚓', impact: 0.05, prob: 0.55, rumor: 'Hafenarbeiter in Abidjan drohen mit Streik', yes: 'Hafenstreik: Kakaoschiffe stecken fest', no: 'Einigung im Hafen von Abidjan, kein Streik' },
    { id: 'ecuador', icon: '🌴', impact: -0.07, prob: 0.6, rumor: 'Neue Grossplantagen in Ecuador sollen bald liefern', yes: 'Ecuador liefert erste Grossernte aus', no: 'Plantagen in Ecuador verzögern sich um ein Jahr' },
    { id: 'rain', icon: '🌧️', impact: -0.06, prob: 0.65, yield: 1.12, rumor: 'Prognose: ideales Regenwetter in Westafrika', yes: 'Perfekte Wachstumsbedingungen: Ernte steigt', no: 'Wetter normalisiert sich, keine Rekordernte' },
    { id: 'fund', icon: '🏦', impact: -0.06, prob: 0.5, rumor: 'Grosser Rohstofffonds soll Kakao-Positionen abbauen', yes: 'Fonds verkauft: Kakao unter Druck', no: 'Fonds hält Positionen, Gerücht falsch' },
];
const SURPRISES = [
    { id: 'container', icon: '📦', impact: 0.04, text: 'EILMELDUNG: Containerknappheit verzögert Lieferungen' },
    { id: 'dollar', icon: '💵', impact: -0.035, text: 'EILMELDUNG: Starker Dollar drückt Rohstoffpreise' },
    { id: 'frost', icon: '❄️', impact: 0.05, text: 'EILMELDUNG: Ungewöhnliche Kälte in Brasiliens Kakaoregion' },
    { id: 'recession', icon: '📉', impact: -0.045, text: 'EILMELDUNG: Rezessionsangst – Konsumgüter unter Druck' },
];
const MARGIN_HIKE = { id: 'hike', icon: '⚖️', text: 'BÖRSENAUFSICHT: Einschuss steigt ab der nächsten Abrechnung auf 15 %', rate: 0.15 };

const BUYERS = ['Barry Callebaut', 'Lindt & Sprüngli', 'Cargill', 'Nestlé', 'Ferrero', 'Olam Food', 'Touton Trading'];
const CLIENTS = ['Alpenmarkt', 'Kaufhaus Helvetia', 'Bahnhofkiosk AG', 'Pralinen-Boutique', 'Export Asien', 'Hotelkette Seeblick', 'Discounter Spar-Fix', 'Café-Kette Bohne'];

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
    let ac = null;
    let out = null;
    let muted = false;
    function init() {
        if (ac) return;
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        ac = new AC();
        out = ac.createGain();
        out.gain.value = 0.5;
        out.connect(ac.destination);
    }
    function tone(f, d, type = 'sine', v = 0.2, when = 0) {
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
        g.connect(out);
        o.start(t);
        o.stop(t + d + 0.05);
    }
    const S = {
        bell: () => [0, 0.35, 0.7].forEach(w => { tone(1568, 1.2, 'sine', 0.25, w); tone(2093, 1.0, 'sine', 0.12, w); }),
        buy: () => { tone(660, 0.08, 'square', 0.08); tone(990, 0.12, 'square', 0.07, 0.06); },
        sell: () => { tone(520, 0.08, 'square', 0.08); tone(350, 0.12, 'square', 0.07, 0.06); },
        news: () => { tone(880, 0.1, 'sawtooth', 0.08); tone(880, 0.1, 'sawtooth', 0.08, 0.15); tone(1175, 0.2, 'sawtooth', 0.08, 0.3); },
        alarm: () => [0, 0.25, 0.5, 0.75].forEach(w => tone(w % 0.5 ? 620 : 880, 0.2, 'square', 0.1, w)),
        cash: () => [1320, 1760, 2093].forEach((f, i) => tone(f, 0.15, 'triangle', 0.12, i * 0.06)),
        tick: () => tone(1800, 0.03, 'square', 0.03),
        join: () => { tone(523, 0.1, 'triangle', 0.15); tone(784, 0.18, 'triangle', 0.15, 0.08); },
        error: () => tone(180, 0.25, 'square', 0.08),
        end: () => [523, 659, 784, 1046, 784, 1046].forEach((f, i) => tone(f, 0.3, 'triangle', 0.15, i * 0.13)),
        drum: () => { for (let i = 0; i < 18; i++) tone(90 + (i % 2) * 20, 0.08, 'square', 0.05 + i * 0.006, i * 0.11); tone(60, 0.6, 'sine', 0.3, 2.0); },
        fanfare: () => [523, 659, 784, 1046].forEach((f, i) => { tone(f, 0.45, 'sawtooth', 0.07, i * 0.12); tone(f * 2, 0.4, 'triangle', 0.05, i * 0.12); }),
    };
    return {
        init,
        play: n => { if (ac && ac.state === 'suspended') ac.resume(); if (S[n]) S[n](); },
        toggle: () => (muted = !muted),
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
        { id: 'analysts', icon: '🧠', name: 'Analysten-Team', cost: 18000, desc: 'Research-Berichte stimmen zu 93 % statt 80 %.' },
        { id: 'credit', icon: '🏦', name: 'Kreditlinie', cost: 22000, desc: 'Positionslimit +10 Kontrakte (30 statt 20).' },
        { id: 'network', icon: '📡', name: 'Netzwerk', cost: 12000, desc: 'Research halb so teuer und doppelt so schnell verfügbar.' },
    ],
};

const RANKS = [
    { name: 'Junior', icon: '🌱' },
    { name: 'Trader', icon: '📈' },
    { name: 'Senior', icon: '💼' },
    { name: 'Legende', icon: '👑' },
];
