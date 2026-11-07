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

## Rollen

| Rolle | Ausgangslage | Lernziel |
|---|---|---|
| 🌱 Kakao-Kooperative | Erntet im Dezember ca. 100 t, Risiko fallende Preise. **Eigene Mechanik:** Dürre, Krankheit oder Regen verändern die **Erntemenge**. Pflanzenschutz halbiert Verluste. | **Short-Hedge** – und: Futures sichern den Preis, nicht die Menge (Überabsicherung) |
| 🏭 Schokoladenfabrik | Braucht 100 t, Risiko steigende Preise. **Eigene Mechanik:** Kunden bestellen laufend Schokolade zu einem **festen Verkaufspreis**. Jeder angenommene Auftrag erhöht den Bedarf. | **Long-Hedge**: Marge eines Auftrags mit Futures fixieren |
| 🦈 Hedgefonds | Kein Kakao, nur Kapital, grösseres Limit. **Eigene Mechanik:** **Research-Berichte** über laufende Gerüchte (ca. 80 % Trefferquote, kostet Geld). | **Spekulation**, Informationsvorsprung, Hebel, Liquiditätsrisiko |

**Mandate – wie in der Realität:** Die Rollen können nicht dasselbe tun. Die Kooperative darf nur Futures **verkaufen**, und zwar höchstens so viel, wie sie erntet. Die Fabrik darf nur **kaufen**, höchstens ihren Bedarf (der mit jedem Auftrag wächst). Beide dürfen ihre Absicherung wieder auflösen, aber nie auf die andere Seite wechseln. Nur Hedgefonds dürfen in beide Richtungen spekulieren. Das gilt auch für das Board: Hedger sehen nur Angebote, die zu ihrem Mandat passen.

Jeder Spieler wählt beim Beitreten seine Rolle (oder «Zufall») und kann sie im Warteraum bis zum Start wechseln. KI-Trader füllen die Rollen auf, die am wenigsten besetzt sind.

## Regeln

- **Kontrakt:** 1 Kontrakt = 10 t Kakao, Lieferung Dezember. Startpreis (= Plan) 2'400 CHF/t.
- **Einschuss:** 10 % des Kontraktwerts (Hebel 10×). Margin Call unter 70 %: nachschiessen oder Position verkleinern, sonst **Zwangsglattstellung** nach 25 s.
- **Mark-to-Market:** Am Ende jedes Monats werden alle Positionen zum Marktpreis abgerechnet.
- **Handel:**
  - **Markt:** Kauf/Verkauf beim Market Maker mit Spread und Gebühr. Grosse Orders bewegen den Preis.
  - **Board:** eigene Angebote für andere Spieler (Block-Deals, halbe Gebühr, kein Spread).
- **News:** Zuerst kommt ein **Gerücht**, danach eine **Bestätigung** oder ein **Dementi**. Der Markt preist Gerüchte teilweise schon ein. Dazu kommen Eilmeldungen und manchmal eine Erhöhung des Einschusses durch die Börsenaufsicht.
- **Wertung:** Ergebnis gegenüber dem Plan (inkl. Wirkung des Preises auf Ernte bzw. Einkauf). Kooperativen und Fabriken erhalten bis zu **15'000 CHF Bonus** für konsequente Absicherung (zeitgewichtete Hedge-Quote).

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
| `js/net.js` | Verbindung mit Raumcode (PeerJS) |
| `js/host.js` | Beamer: Lobby, Live-Chart, Rangliste, News, Auswertung |
| `js/player.js` | Handy: Handel, Board, Margin Call, persönliche Auswertung |
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


## Etappe 2: Weltkarte, Lagerhaus

- **🌍 Weltkarte** auf dem Beamer (statt der Abschlussliste): Punkte-Karte mit den Kakao-Regionen Ghana, Elfenbeinküste, Ecuador und Indonesien. Jede Kooperative bekommt eine Region; Ernte-Ereignisse treffen nur diese Region. Gerüchte und Meldungen erscheinen als pulsierende Marker auf der Karte.
- **🏚️ Lagerhaus** (Ausbau für Kooperativen, 10'000 CHF): In der Ausbauphase bis zu 60 t Ernte zum Schlusskurs einlagern (60 CHF/t Lagerkosten) und im nächsten Jahr zum dann gültigen Preis verkaufen. Lohnt sich nur, wenn der Preis um mehr als die Lagerkosten steigt.
