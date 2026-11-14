# KAKAO PIT

Ein Multiplayer-Echtzeitspiel um **Kakao-Futures** für das Ergänzungsfach Wirtschaft & Recht.

- **Ablauf:** Ein grosser Bildschirm (Beamer) ist die Börse. Alle anderen spielen auf dem Handy.
- **Spieler:** 2–30.
- **Dauer:** 4–8 Minuten pro Runde, plus Auswertung.

## So spielt ihr

1. **Host:** Seite öffnen → **Spiel leiten** → Spieldauer wählen → **Raum erstellen**. Auf dem Beamer erscheinen ein Raumcode und ein QR-Code.
2. **Spieler:** QR-Code scannen oder die Seite öffnen → Raumcode und Namen eingeben → **Beitreten**.
3. Zu wenige Leute? Der Host nimmt **KI-Trader** dazu (auch zum Alleine-Testen).
4. **Börse eröffnen.** 4 Handelsmonate, nach jedem Monat wird abgerechnet, danach ist Fälligkeit.

## Rollen (ein Satz pro Rolle)

| Rolle | Ziel |
|---|---|
| 🌱 Kakao-Kooperative | Verkaufe deine Ernte zu einem möglichst hohen Preis – bevor er fällt. |
| 🏭 Schokoladenfabrik | Kaufe deinen Kakao zu einem möglichst tiefen Preis – bevor er steigt. |
| 🦈 Hedgefonds | Wette auf steigende oder fallende Preise – und mach den grössten Gewinn. |

**Mandate:** Die Kooperative darf nur verkaufen (höchstens ihre Ernte), die Fabrik nur kaufen (höchstens ihren Bedarf). Nur Hedgefonds wetten in beide Richtungen.

## Regeln

- **Kontrakt:** 1 Kontrakt = 10 t Kakao, Lieferung Dezember. Auf dem Handy wird in Tonnen gewählt.
- **Pfand (Einschuss):** 10 % des Werts. Läuft der Preis gegen dich, gibt es einen Margin Call: nachschiessen oder verkleinern, sonst Zwangsverkauf.
- **Monatsabrechnung (Mark-to-Market)** am Ende jedes der 4 Monate.
- **Gerüchte:** Der Markt preist den erwarteten Effekt schnell ein. Wer rasch reagiert, hat einen kleinen, aber nie sicheren Vorteil.
- **Wertung:** Kooperativen = erzielter Preis pro Tonne, Fabriken = Einkaufspreis pro Tonne, Fonds = Gewinn. **Was im Dezember nicht abgesichert ist, wird 5 % schlechter gehandelt** (Notverkauf bzw. Notkauf). So ist Nichtstun eine Wette, die etwas kostet.
- **Pleite:** Neustart mit Notkredit (25'000 CHF, 30 % Zins am Schluss) – niemand muss zuschauen.

## Wie in echt: Verträge, Schmuggel, Schokoladen-Krise, Krisenjahr

Angelehnt an die Kakao-Krise 2024 (Preis von ~2'500 auf über 10'000 USD/t):

- **📜 Lieferverträge (ab Jahr 1):** Kooperativen und Fabriken schliessen direkt Verträge ab (10–50 t, Preis höchstens ±8 % von der Börse, Angebot 30 s gültig). Ein Vertrag zählt als Absicherung mit fixem Preis. **Brechen** ist möglich: 250 CHF/t Strafe an die Gegenseite, Banner auf dem Beamer und «⚠️ X× gebrochen» neben dem Namen – für die ganze Karriere.
- **🕵️ Schmuggler (Kooperative, ab Jahr 2):** Steigt der Weltpreis, bieten Schmuggler den Bauern mehr. Entscheidungskarte: Bonus zahlen oder Tonnen verlieren – dann ist die Absicherung plötzlich zu gross.
- **☀️ Trocknung (Kooperative, ab Jahr 3):** An der Sonne (Qualität A, +80 CHF/t, 30 % Regenrisiko) oder im Ofen (sicher, Qualität B, −60 CHF/t).
- **🍫 Schokoladen-Krise (Fabrik, ab Jahr 2):** Ab +12 % und +24 %: Preise erhöhen, Rezeptur ändern, Tafel verkleinern oder Kosten selbst tragen. Verzögerte Folgen als Schlagzeilen auf dem Beamer (Mogelpackung, Konsumentenmagazin, Lob).
- **🚨 Krisenjahr (einmal pro Karriere ab 2 Jahren):** Zwei Preisschocks nach oben, wildere Kurse und die Börse erhöht den Einschuss sofort auf 20 % – Margin Calls für alle mit zu wenig Bargeld.

Entscheidungskarten erscheinen auf dem Handy ganz oben (mit Ton und Vibration) und haben 25 Sekunden Zeit; danach gilt die vorsichtige Standardwahl.

## Schrittweise Einführung

Jahr 1 ist nur das Kernspiel: absichern bzw. wetten, Gerüchte, Monatsabrechnung.

| Ab Jahr | Neu |
|---|---|
| 1 | 📜 Lieferverträge · 🛰️ Terminal für Hedgefonds |
| 2 | 🌦️ Wetter verändert die Erntemenge · 🕵️ Schmuggler · 📦 Kundenaufträge · 🍫 Schokoladen-Krise |
| 3 | 🛡️ Pflanzenschutz · ☀️ Trocknung |

Bei «1 Jahr» gibt es das Kernspiel, Lieferverträge, Schmuggler (Kooperative) und die Schokoladen-Krise (Fabrik).

## Handy-Cockpit

Alles Wichtige passt ohne Scrollen auf den Bildschirm: Zeile «Was jetzt?» (mit Countdown bei Gerüchten), Preis mit Trend, Ziel-Fortschritt, Rang. Die Handelsknöpfe sind unten fixiert. Kurze Erklärungen erscheinen genau dann, wenn sie gebraucht werden (erster Start, erstes Gerücht, erster Trade, erste Abrechnung, neue Mechaniken). Regeln, Beispiel und Begriffe stehen im einklappbaren Bereich «📖 Hilfe».

## Pre-Market mit Tutorial

Nach «Börse eröffnen» ist die Börse geschlossen (Pre-Market). Auf jedem Gerät läuft ein **vollständiges Tutorial mit Übungen** – an der Börse passiert dabei nichts:

- Kooperative/Fabrik: Ziel, Preis, **Übungs-Absicherung** und **Auflösen** (mit Rechenbeispiel), **Übungs-Gerücht** mit Entscheidung und Erklärung beider Ausgänge, Wertung und Platz, **Übungs-Margin-Call**, Monatsabrechnung und Dezember-Regel, was später in der Karriere dazukommt, Hilfe.
- Hedgefonds im Terminal: Übungs-Gerücht, **Ort auf der Karte finden**, **Bericht anfordern**, Beweis-Waage, Risiko-Cockpit, **Übungs-Wette eröffnen und schliessen**, Margin Call, Wertung.
- Am Ende «Ich bin bereit». Der Beamer zeigt, wer bereit ist. Sind alle bereit, öffnet die Börse nach 5 Sekunden – spätestens nach 3 Minuten oder per Knopf «Börse jetzt öffnen».

## Beamer

- Feste 16:9-Bühne (1600 × 900), die auf jede Auflösung von 1280 × 720 bis 4K skaliert wird – nichts wird abgeschnitten.
- **News-Leiste über dem Chart:** links immer nur eine Meldung (weitere warten in der Schlange), rechts die Gerüchte-Uhr.
- **Gerüchte als Drama:** Countdown bis zur Auflösung, Trommelwirbel in den letzten Sekunden, danach Banner «BESTÄTIGT» / «DEMENTI» mit Preissprung.
- **Monatsabrechnung als Show:** Gewinner und Verlierer des Monats, Margin Calls.
- Ranglisten pro Rolle: Top 3 + «und X weitere».
- **Pause** (Knopf ⏸ oder Leertaste): Die Zeit steht, die Handys zeigen «Pause».
- Schluss: drei Diskussionsfragen, die aus dem Spiel abgeleitet sind.

## Handy: Rückblick und Robustheit

- Am Jahresende zeigt jedes Handy einen **persönlichen Rückblick**: Kursverlauf mit den eigenen wichtigsten Trades, was die Absicherung gebracht hat, und einen Satz Feedback zum Timing.
- Letzte 10 Sekunden eines Monats: Timer pulsiert und tickt. Vibration bei Trade, News und Margin Call.
- Nach Display-Sperre oder WLAN-Wechsel verbindet sich das Handy selbst wieder (gleicher Spieler).
- **Spätes Beitreten** ist möglich: Wer später kommt, startet neutral zum aktuellen Preis.
- Getestet mit 33 Spielern (32 KI + 1 Handy).

## Hedgefonds-Terminal (Laptop)

Hedgefonds, die auf einem breiten Bildschirm (ab 1000 px) spielen, bekommen statt des Handy-Cockpits ein Vollbild-Terminal:

- **Intel-Karte:** Jedes Gerücht hat einen Ort. Auf der Weltkarte (mit Ausschnitt Westafrika) fordert man dort Berichte an: 🛰️ Satellitenbild, 📋 Feldbericht, 🌧️ Wetterstation, ⚓ Hafenradar, 🏛️ Quelle in der Politik, 🏭 Bestelldaten, 📦 Lagerbestände, 💼 Fondsflüsse, 💬 Social Media.
- Jeder Bericht kostet **Geld und Zeit** (2–8 s), das Team arbeitet einen Bericht nach dem anderen ab. Passt die Quelle nicht zum Gerücht, findet man nichts.
- **Seriöse Quellen lügen nie:** Mit der Trefferchance (45–60 %) liefern sie einen **eindeutigen Befund**, der immer stimmt – sonst «kein klarer Befund». Nur 💬 Social Media ist billig, schnell und kann falsch liegen.
- **Beweis-Waage:** Ein eindeutiger Befund entscheidet; ohne ihn verschiebt nur Social Media die Waage ein wenig.
- **Risiko-Cockpit:** Position, Hebel, Pfand und für jedes Gerücht die Szenarien «bestätigt» / «dementiert» in CHF.
- Order-Ticket und Kurs der letzten 90 Sekunden.

Gerüchte laufen 24–38 Sekunden, damit Zeit für 2–3 Berichte bleibt.

## Ton

Alle Klänge werden live erzeugt (Börsenglocke mit Obertönen, Trommelwirbel, Sirene, Münzen, Holzblock-Ticken, leichter Hall). Der Knopf 🔊/🔇 ist auf Beamer, Handy und Terminal; Stumm gilt sofort (auch für laufende Klänge) und wird gespeichert.

## Balance prüfen

`tools/sim.html` spielt die Engine 200-mal mit festen Strategien (nie absichern, alles sofort, Hälfte, Gerüchten folgen) plus KI-Tradern und zeigt Siegquote, Durchschnitt und Streuung pro Rolle.

## Auswertung

Auf dem Beamer erscheinen:
- **Ranking:** Podium und Beste je Rolle.
- **Kursverlauf:** Chart mit allen News-Markern.
- **Tabelle:** Für jeden Trader «Kakao» (Preiseffekt auf Ernte/Einkauf) vs. «Futures» (Ergebnis der Kontrakte). Bei guten Hedgern heben sich beide weitgehend auf.
- **Lektionen:** automatisch aus der Partie erzeugt (bester Hedge, ungesichertes Risiko, Spekulanten, Zwangsglattstellungen).
- **Diskussionsfragen** für die Klasse.

Auf jedem Handy erscheint eine persönliche Auswertung.

## Technik und Voraussetzungen

- **Online:** Das Spiel muss **online erreichbar** sein, damit Handys es laden können (z. B. **GitHub Pages**). Als Datei auf dem Laptop funktioniert nur der Host mit KI-Tradern.
- **Internet:** Alle Geräte brauchen Internet. Die Verbindung läuft per WebRTC direkt zwischen den Geräten. Zum Finden dient der öffentliche Vermittler von **PeerJS** (`0.peerjs.com`). Manche Schulnetze blockieren WebRTC – dann hilft ein Handy-Hotspot.
- **Host = Börse:** Der Host-Rechner berechnet den Markt. Er darf während des Spiels nicht schlafen gehen oder den Tab schliessen.
- **Code:** HTML, CSS und Vanilla-JavaScript. Externe Skripte: PeerJS 1.5.4 (unpkg) und qrcodejs 1.0.0 (cdnjs). Schriften von Google Fonts.

| Datei | Inhalt |
|---|---|
| `js/common.js` | Regeln, Rollen, News, Begriffe, Sound |
| `js/engine.js` | Markt-Engine: Preis, Konten, Margin, Abrechnung, Wertung |
| `js/bots.js` | KI-Trader |
| `js/net.js` | Verbindung mit Raumcode (PeerJS, Ausweich-Weg über MQTT) |
| `js/host.js` | Beamer: Lobby, Live-Chart, Rangliste, News, Auswertung |
| `js/player.js` | Handy-Cockpit: Handel, «Was jetzt?», geführter Einstieg, Margin Call |
| `tools/sim.html` | Balance-Simulation |
| `js/app.js` | Start und Navigation |


## Karriere-Modus (bis zu 3 Jahre)

Der Host wählt 1, 2 oder 3 Erntejahre. Nach jedem Jahr:

1. **Jahresbericht** auf dem Beamer: Sieger pro Rolle, Trader des Jahres, Aufstiege im Rang.
2. **Ausbauphase** (75 s, Host kann früher weiter): Jede Firma investiert ihren Gewinn.
   - 🌱 Kooperative: Mehr Land (+30 t), Bewässerung (halbe Ernteverluste), Fairtrade (+120 CHF/t)
   - 🏭 Fabrik: Pralinen-Linie (+60 % Auftragsmarge), Grosskunden-Vertrag (sicherer Auftrag), Marketing (mehr Aufträge)
   - 🦈 Fonds: Analysten (93 % Trefferquote), Kreditlinie (+10 Kontrakte), Netzwerk (Research billiger und schneller)
3. **Neues Jahr**: neuer Planpreis = Schlusskurs des Vorjahres, neue Ernte, neue Gerüchte.

Ränge: Junior → Trader → Senior → Legende (ein Aufstieg für jedes Jahr, in dem man mindestens so gut war wie der Durchschnitt der eigenen Rolle). Wer pleite ist, bekommt einen Notkredit (25'000 CHF, 30 % Zins).

**Endergebnis** = Summe der Jahresergebnisse − Ausbau − Zinsen. Am Ende läuft eine **Preisverleihung**: Beste Kooperative, beste Fabrik, bester Hedgefonds und der Trader des Tages, danach die ganze Karriere-Bilanz.


## Weltkarte

Jede Kooperative bekommt eine Anbauregion (Ghana, Elfenbeinküste, Ecuador, Indonesien). Gerüchte und Meldungen erscheinen als Marker auf der Karte. Ab Jahr 2 treffen Ernte-Ereignisse nur die betroffene Region.
