// ===== KAKAO PIT – eigenes Symbol-Set =====
// Fein gezeichnete Linien-Symbole (24 × 24, Strich in der Textfarbe, zarte Flächen).
// Ersetzt automatisch jedes Emoji auf der Seite – in Texten durch ein Symbol, in Karten-Grafiken wird es entfernt.
const Icons = (() => {
    const F = 'class="f"'; // zarte Fläche
    const P = {
        sprout: `<path d="M12 21v-8"/><path ${F} d="M12 13c0-4 2.5-6.5 7-6.5 0 4.4-2.6 6.8-7 6.5z"/><path ${F} d="M12 15c0-3.4-2.2-5.6-6-5.6 0 3.8 2.2 5.9 6 5.6z"/><path d="M7 21h10"/>`,
        pod: `<path ${F} d="M12 3c3.6 2.4 5.2 6 5.2 9.2S15.6 19.6 12 21c-3.6-1.4-5.2-5.6-5.2-8.8S8.4 5.4 12 3z"/><path d="M12 3.6v16.8M9.4 7.5c.8 3 .8 6 0 9M14.6 7.5c-.8 3-.8 6 0 9"/>`,
        bean: `<ellipse ${F} cx="12" cy="12" rx="5.4" ry="8" transform="rotate(28 12 12)"/><path d="M9.6 5.6c2.6 3.4 1.4 8.8 4.8 12.8"/>`,
        factory: `<path ${F} d="M3 20V10l5 3V10l5 3V10l5 3V5h3v15z"/><path d="M3 20h18M7 16.5h2M12 16.5h2M17 16.5h2"/><path d="M18 5V3.5M20 5V3"/>`,
        fin: `<path ${F} d="M3 17c4-1 6.4-4.6 7.6-11 3.6 2.6 6 6.6 6.8 11z"/><path d="M2 19c2 0 2-1.4 4-1.4S8 19 10 19s2-1.4 4-1.4 2 1.4 4 1.4 2-1.4 4-1.4"/>`,
        laptop: `<rect ${F} x="4.5" y="5" width="15" height="10" rx="1.4"/><path d="M2.5 18.5h19l-1.6-3.5H4.1z"/><path d="M7.5 12l2.4-2.2 2 1.4 3-3"/>`,
        phone: `<rect ${F} x="7" y="2.8" width="10" height="18.4" rx="2.2"/><path d="M10.5 5.2h3M11.2 18.5h1.6"/>`,
        bell: `<path ${F} d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 1.8h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0M12 3v2"/>`,
        trophy: `<path ${F} d="M7.5 4h9v4.5a4.5 4.5 0 0 1-9 0z"/><path d="M7.5 5.5H4.5c0 3 1.4 4.6 3.4 4.8M16.5 5.5h3c0 3-1.4 4.6-3.4 4.8M12 13v3.5M8.5 20h7M9.5 16.5h5V20h-5z"/>`,
        pause: `<rect ${F} x="6.5" y="5" width="3.6" height="14" rx="1"/><rect ${F} x="13.9" y="5" width="3.6" height="14" rx="1"/>`,
        news: `<rect ${F} x="3.5" y="4.5" width="14" height="15" rx="1.5"/><path d="M17.5 8.5h3v9.5a1.5 1.5 0 0 1-3 0M6.5 8h8M6.5 11h8M6.5 14h5M6.5 17h6"/>`,
        dice: `<rect ${F} x="4" y="4" width="16" height="16" rx="3.4"/><circle cx="8.6" cy="8.6" r=".9" class="d"/><circle cx="15.4" cy="15.4" r=".9" class="d"/><circle cx="12" cy="12" r=".9" class="d"/><circle cx="15.4" cy="8.6" r=".9" class="d"/><circle cx="8.6" cy="15.4" r=".9" class="d"/>`,
        up: `<path d="M3.5 19.5h17"/><path d="M4.5 16l4.5-4.5 3.5 2.5 6.5-7.5"/><path d="M15 6.5h4v4"/>`,
        down: `<path d="M3.5 19.5h17"/><path d="M4.5 6.5l4.5 4.5 3.5-2.5 6.5 7.5"/><path d="M15 16h4v-4"/>`,
        receipt: `<path ${F} d="M6 3h12v18l-2-1.4-2 1.4-2-1.4-2 1.4-2-1.4L6 21z"/><path d="M9 8h6M9 11.5h6M9 15h3.5"/>`,
        target: `<circle ${F} cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.4" class="d"/>`,
        globe: `<circle ${F} cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.6 2.4 3.8 5.4 3.8 8.5s-1.2 6.1-3.8 8.5c-2.6-2.4-3.8-5.4-3.8-8.5S9.4 5.9 12 3.5z"/>`,
        book: `<path ${F} d="M12 6.5C9.8 5 7 4.6 3.5 5v13c3.5-.4 6.3 0 8.5 1.5 2.2-1.5 5-1.9 8.5-1.5V5c-3.5-.4-6.3 0-8.5 1.5z"/><path d="M12 6.5v13"/>`,
        crane: `<path d="M6 21V5M3 21h7M6 5h14M6 5l4 4M14.5 5v3.5"/><rect ${F} x="12.6" y="8.5" width="3.8" height="3" rx=".6"/><path d="M6 9l-3-1.5V5"/>`,
        choc: `<rect ${F} x="5" y="3.5" width="14" height="17" rx="1.6"/><path d="M5 9.2h14M5 14.8h14M9.7 3.5v17M14.3 3.5v17"/>`,
        box: `<path ${F} d="M3.5 7.5L12 3.5l8.5 4v9L12 20.5l-8.5-4z"/><path d="M3.5 7.5L12 11.5l8.5-4M12 11.5v9M7.8 5.5l8.5 4"/>`,
        coins: `<ellipse ${F} cx="9" cy="7" rx="5.5" ry="2.5"/><path d="M3.5 7v4c0 1.4 2.5 2.5 5.5 2.5M14.5 7v2"/><ellipse ${F} cx="15" cy="13" rx="5.5" ry="2.5"/><path d="M9.5 13v4c0 1.4 2.5 2.5 5.5 2.5s5.5-1.1 5.5-2.5v-4"/>`,
        contract: `<path ${F} d="M6.5 3.5h8l3.5 3.5v13.5h-11.5z"/><path d="M14.5 3.5V7H18M9 11h6M9 14h6M9 17h3.5"/>`,
        seal: `<path ${F} d="M6.5 3.5h8l3.5 3.5v7"/><path d="M6.5 3.5v17h5M9 9h6M9 12h4"/><circle ${F} cx="16.5" cy="16.5" r="3.5"/><path d="M15 19.6l-.8 2.4 2.3-1 2.3 1-.8-2.4"/>`,
        lock: `<rect ${F} x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V7.8a4 4 0 0 1 8 0v2.7M12 14.5v2.5"/>`,
        sun: `<circle ${F} cx="12" cy="12" r="4"/><path d="M12 2.5v2.3M12 19.2v2.3M2.5 12h2.3M19.2 12h2.3M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6"/>`,
        hand: `<path ${F} d="M2.5 11.5l4-4 3 1 2.5-1.5 2.5 1.5 3-1 4 4-3 3.5-4.5 4-1.5-1.2-1.5 1.2-4.5-4z"/><path d="M9.5 8.5l-2.5 2.6c.8.9 2 .9 2.8.1l2-1.7 4.5 4.3M11 16.5l1.5 1.2M13 15l1.5 1.3"/>`,
        anchor: `<circle cx="12" cy="5" r="1.8"/><path d="M12 6.8V21M8 10h8M4.5 13.5c0 4 3.3 7.5 7.5 7.5s7.5-3.5 7.5-7.5M4.5 13.5l-1.5 1.5M19.5 13.5l1.5 1.5"/>`,
        rain: `<path ${F} d="M7 15.5h10.2a3.8 3.8 0 0 0 .3-7.6A5.5 5.5 0 0 0 7 9.2a3.2 3.2 0 0 0 0 6.3z"/><path d="M8.5 18.2l-.8 2M12.5 18.2l-.8 2M16.5 18.2l-.8 2"/>`,
        cloudsun: `<circle ${F} cx="9" cy="8" r="3"/><path d="M9 2.8v1.2M3.8 8H5M5.3 4.3l.9.9M12.7 4.3l-.9.9"/><path ${F} d="M9.5 19h9a3.4 3.4 0 0 0 .2-6.8 4.8 4.8 0 0 0-9.2 1.3 2.8 2.8 0 0 0 0 5.5z"/>`,
        bank: `<path ${F} d="M3 9.5L12 4l9 5.5z"/><path d="M5 9.5v8M9.7 9.5v8M14.3 9.5v8M19 9.5v8M3 20.5h18M4 17.5h16"/>`,
        case: `<rect ${F} x="3.5" y="7.5" width="17" height="12" rx="1.8"/><path d="M9 7.5V5.5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M3.5 12.5h17M11 12.5v2h2v-2"/>`,
        spy: `<path ${F} d="M5 10.5h14l-1.5-5.5-3 1.2h-5l-3-1.2z"/><path d="M3 10.5h18"/><circle cx="8.3" cy="15.5" r="2.6"/><circle cx="15.7" cy="15.5" r="2.6"/><path d="M10.9 15.2h2.2"/>`,
        shield: `<path ${F} d="M12 3l7.5 3v5.5c0 4.6-3.2 8.2-7.5 9.5-4.3-1.3-7.5-4.9-7.5-9.5V6z"/><path d="M8.8 12l2.2 2.2 4.4-4.6"/>`,
        warn: `<path ${F} d="M12 3.8l9 15.7H3z"/><path d="M12 9.5v4.5M12 16.8v.2"/>`,
        leaf: `<path ${F} d="M5 19c0-8.2 5.5-13.5 14.5-14.5C19 13.5 13.5 19 5 19z"/><path d="M5 19c3-3.8 6-6.6 9.5-9"/>`,
        wheat: `<path d="M12 21V7"/><path ${F} d="M12 8c-2.2-.4-3.2-2-3.2-4 2.2.3 3.2 1.8 3.2 4zM12 8c2.2-.4 3.2-2 3.2-4-2.2.3-3.2 1.8-3.2 4zM12 12.5c-2.2-.4-3.2-2-3.2-4 2.2.3 3.2 1.8 3.2 4zM12 12.5c2.2-.4 3.2-2 3.2-4-2.2.3-3.2 1.8-3.2 4zM12 17c-2.2-.4-3.2-2-3.2-4 2.2.3 3.2 1.8 3.2 4zM12 17c2.2-.4 3.2-2 3.2-4-2.2.3-3.2 1.8-3.2 4z"/>`,
        ban: `<circle ${F} cx="12" cy="12" r="8.5"/><path d="M6 6l12 12"/>`,
        bowl: `<path ${F} d="M3.5 11.5h17a8.5 8.5 0 0 1-17 0z"/><path d="M8 11.5c0-2.6 1.6-4.4 4-4.4M12 11.5c0-3.4 2.2-6 5.2-6M9 20.5h6"/>`,
        palm: `<path d="M12.5 21c.6-4.6.4-8.6-.5-12"/><path ${F} d="M12 9c-3-3-6.6-3.2-9-1.4 3 .2 5.6 1 9 1.4zM12 9c3-3 6.6-3.2 9-1.4-3 .2-5.6 1-9 1.4zM12 9c-1.5-3.4-.8-5.8 1.6-6.4-.2 2.4-.7 4.3-1.6 6.4z"/><path d="M8 21h9"/>`,
        cash: `<rect ${F} x="2.8" y="6.5" width="18.4" height="11" rx="1.6"/><circle cx="12" cy="12" r="2.6"/><path d="M6 9.5v5M18 9.5v5"/>`,
        snow: `<path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9M9.5 4.5L12 7l2.5-2.5M9.5 19.5L12 17l2.5 2.5"/>`,
        sat: `<rect ${F} x="9.6" y="9.6" width="4.8" height="4.8" rx=".8" transform="rotate(45 12 12)"/><path ${F} d="M4 4.5l4.2 4.2-2.3 2.3-4.2-4.2zM20 19.5l-4.2-4.2 2.3-2.3 4.2 4.2z"/><path d="M15.5 8.5l2-2M17 18.5a3 3 0 0 0 1.8-1.8M18.5 21a5.5 5.5 0 0 0 3.5-3.5"/>`,
        clip: `<rect ${F} x="5" y="4.5" width="14" height="16.5" rx="1.6"/><rect x="9" y="3" width="6" height="3" rx="1"/><path d="M8.5 10.5h7M8.5 13.5h7M8.5 16.5h4.5"/>`,
        columns: `<path ${F} d="M3 8.5L12 4l9 4.5z"/><path d="M5.5 8.5v9M10 8.5v9M14 8.5v9M18.5 8.5v9M3.5 20h17M4.5 17.5h15"/>`,
        chat: `<path ${F} d="M4 5.5h16v10H10l-4.5 3.8V15.5H4z"/><path d="M8 9.5h8M8 12.5h5"/>`,
        tree: `<path ${F} d="M12 3.5c3.6 0 6.2 2.6 6.2 5.8 0 1.2-.4 2.2-1 3 1 .7 1.6 1.8 1.6 3 0 2-1.8 3.4-4 3.4H9.2c-2.2 0-4-1.4-4-3.4 0-1.2.6-2.3 1.6-3-.6-.8-1-1.8-1-3 0-3.2 2.6-5.8 6.2-5.8z"/><path d="M12 21v-9M12 15l-2.5-2M12 13.5l2.5-2"/>`,
        drop: `<path ${F} d="M12 3.5c3.4 4.2 6 7.4 6 10.5a6 6 0 0 1-12 0c0-3.1 2.6-6.3 6-10.5z"/><path d="M9.5 14.5a2.6 2.6 0 0 0 2.5 2.5"/>`,
        horn: `<path ${F} d="M3.5 10v4h3.5l8.5 4.5v-13L7 10z"/><path d="M7 14l1 5h2.5l-1-4.4M18.5 9a4 4 0 0 1 0 6"/>`,
        brain: `<path ${F} d="M9.5 4.5a3 3 0 0 0-3 3 3 3 0 0 0-2 5 3 3 0 0 0 2 5 3 3 0 0 0 3 2.5h1V4.5zM14.5 4.5a3 3 0 0 1 3 3 3 3 0 0 1 2 5 3 3 0 0 1-2 5 3 3 0 0 1-3 2.5h-1V4.5z"/><path d="M12 4.5v15.5"/>`,
        antenna: `<path d="M12 11v10M8.5 21h7"/><circle cx="12" cy="9.5" r="1.6" class="d"/><path d="M8.2 6a5.2 5.2 0 0 0 0 7M15.8 6a5.2 5.2 0 0 1 0 7M5.4 3.5a9 9 0 0 0 0 12M18.6 3.5a9 9 0 0 1 0 12"/>`,
        crown: `<path ${F} d="M3.5 8l4.2 3.5L12 5l4.3 6.5L20.5 8 19 18H5z"/><path d="M5 20.5h14"/>`,
        broken: `<path ${F} d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.2a4.3 4.3 0 0 1 7.5 2.6C19.5 15.4 12 20 12 20z"/><path d="M12 7.2l-1.5 4 2.6 1.4-1.6 4.2"/>`,
        truck: `<path ${F} d="M2.5 6.5h11v9.5h-11z"/><path ${F} d="M13.5 9.5h4l3 3.5v3h-7z"/><circle cx="6.5" cy="17.5" r="1.8"/><circle cx="17" cy="17.5" r="1.8"/><path d="M5 9.5h5M5 12.5h5"/>`,
        xcircle: `<circle ${F} cx="12" cy="12" r="8.5"/><path d="M9 9l6 6M15 9l-6 6"/>`,
        loss: `<rect ${F} x="3" y="7" width="12.5" height="8.5" rx="1.2" transform="rotate(-12 9 11)"/><path d="M16.5 15.5l3.5 1.5M17.5 12.5l3.5.5M15.5 18.5l2.5 2"/>`,
        medal: `<path d="M8 3l2.5 6M16 3l-2.5 6"/><circle ${F} cx="12" cy="14.5" r="5.5"/><path d="M12 11.5l.9 1.9 2 .3-1.5 1.4.4 2-1.8-1-1.8 1 .4-2-1.5-1.4 2-.3z"/>`,
        siren: `<path ${F} d="M6.5 17v-5a5.5 5.5 0 0 1 11 0v5z"/><path d="M4.5 20.5h15v-3.5h-15zM12 2.5V4M4 6l1.2 1.2M20 6l-1.2 1.2M10 11.5a2 2 0 0 1 2-2"/>`,
        wave: `<path ${F} d="M7.5 12.5V7a1.3 1.3 0 0 1 2.6 0v4.5V5.2a1.3 1.3 0 0 1 2.6 0v6.3V6a1.3 1.3 0 0 1 2.6 0v6.5l.6-1.6a1.4 1.4 0 0 1 2.6 1L16.6 17a5.6 5.6 0 0 1-5.3 3.8h-.2a4.4 4.4 0 0 1-3.6-2.5l-1.6-3.6a1.3 1.3 0 0 1 2.3-1.2z"/>`,
        alarm: `<circle ${F} cx="12" cy="13" r="7"/><path d="M12 9v4l2.5 1.8M4 5.5l2.8-2.2M20 5.5l-2.8-2.2M7 19.5l-1.5 1.5M17 19.5l1.5 1.5"/>`,
        hour: `<path ${F} d="M7 3.5h10c0 4.4-2.6 6.4-5 8.5 2.4 2.1 5 4.1 5 8.5H7c0-4.4 2.6-6.4 5-8.5-2.4-2.1-5-4.1-5-8.5z"/><path d="M5.5 3.5h13M5.5 20.5h13"/>`,
        fire: `<path ${F} d="M12 21c3.6 0 6-2.6 6-6 0-4-3-5.6-3.6-9.5-2.4 1.6-3.4 3.8-3.4 5.6-1.2-.6-1.8-1.8-2-3C7.6 9.8 6 12 6 15c0 3.4 2.4 6 6 6z"/><path d="M12 21c-1.6 0-2.8-1.2-2.8-2.9 0-1.8 1.4-2.6 2.8-4.4 1.4 1.8 2.8 2.6 2.8 4.4 0 1.7-1.2 2.9-2.8 2.9z"/>`,
        flask: `<path d="M9.5 3.5h5M10.5 3.5v6L5 18.5a1.5 1.5 0 0 0 1.3 2h11.4a1.5 1.5 0 0 0 1.3-2L13.5 9.5v-6"/><path ${F} d="M7.2 15h9.6l2.2 3.5a1.5 1.5 0 0 1-1.3 2H6.3A1.5 1.5 0 0 1 5 18.5z"/>`,
        ruler: `<rect ${F} x="2.5" y="8.5" width="19" height="7" rx="1.2"/><path d="M6 8.5v3M9.5 8.5v2M13 8.5v3M16.5 8.5v2M20 8.5v3"/>`,
        ruin: `<path ${F} d="M3.5 11l8.5-6.5 8.5 6.5v9.5h-17z"/><path d="M9 20.5v-5l2.5-1 1 2.5M14.5 9.5l1.5 2-1 2M3 20.5h18"/>`,
        scale: `<path d="M12 3.5v17M7.5 20.5h9M5 6.5h14M12 5l-7 1.5M12 5l7 1.5"/><path ${F} d="M2.5 13.5L5 7l2.5 6.5a2.5 2.5 0 0 1-5 0zM16.5 13.5L19 7l2.5 6.5a2.5 2.5 0 0 1-5 0z"/>`,
        call: `<path ${F} d="M5 3.5h3.5l1.8 4.5-2.3 1.4a11 11 0 0 0 6.6 6.6l1.4-2.3 4.5 1.8V19a2 2 0 0 1-2 2A16 16 0 0 1 3 5.5a2 2 0 0 1 2-2z"/>`,
        check: `<circle ${F} cx="12" cy="12" r="8.5"/><path d="M8 12.3l2.7 2.7L16.2 9.5"/>`,
        tick: `<path d="M5 12.5l4.2 4.2L19 7"/>`,
        cross: `<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>`,
        sunrise: `<path ${F} d="M6.5 16a5.5 5.5 0 0 1 11 0z"/><path d="M2.5 16h19M5 19.5h14M12 5v3M5.5 8.5l1.6 1.6M18.5 8.5l-1.6 1.6"/>`,
        star: `<path ${F} d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.8l-5.2 2.8 1-5.8L3.5 9.7l5.9-.8z"/>`,
        starO: `<path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.8l-5.2 2.8 1-5.8L3.5 9.7l5.9-.8z"/>`,
        gold: `<path d="M8 3l2.5 6M16 3l-2.5 6"/><circle ${F} cx="12" cy="14.5" r="5.5"/><path d="M11 12.8l1.4-1v6.2"/>`,
        silver: `<path d="M8 3l2.5 6M16 3l-2.5 6"/><circle ${F} cx="12" cy="14.5" r="5.5"/><path d="M10.2 12.8a1.9 1.9 0 0 1 3.5.9c0 1.4-3.5 2.4-3.5 4.3h3.6"/>`,
        bronze: `<path d="M8 3l2.5 6M16 3l-2.5 6"/><circle ${F} cx="12" cy="14.5" r="5.5"/><path d="M10.3 12a1.9 1.9 0 0 1 3.3 1.2c0 .8-.7 1.3-1.6 1.3.9 0 1.7.5 1.7 1.4a1.9 1.9 0 0 1-3.5 1"/>`,
        bot: `<rect ${F} x="5" y="8" width="14" height="11" rx="2.6"/><path d="M12 8V4.8M9 13h.01M15 13h.01M9.5 16.2h5M3 12.5v3M21 12.5v3"/><circle cx="12" cy="4" r=".9" class="d"/>`,
        cal: `<rect ${F} x="3.5" y="5" width="17" height="15.5" rx="1.8"/><path d="M3.5 9.5h17M8 3v4M16 3v4M7.5 13h2M11 13h2M14.5 13h2M7.5 16.5h2M11 16.5h2"/>`,
        nosig: `<path d="M3.5 20.5h0M7.5 20.5v-3M11.5 20.5v-6.5M15.5 20.5v-10M19.5 20.5V6.5M3 3l18 18"/>`,
        candy: `<circle ${F} cx="12" cy="12" r="4.5"/><path ${F} d="M7.6 10.4L3 8l1 4-1 4 4.6-2.4zM16.4 10.4L21 8l-1 4 1 4-4.6-2.4z"/>`,
        drum: `<ellipse ${F} cx="12" cy="9" rx="7.5" ry="2.8"/><path d="M4.5 9v6.5c0 1.6 3.4 2.8 7.5 2.8s7.5-1.2 7.5-2.8V9M8 11.5l2 6M16 11.5l-2 6M15.5 2.5l-4.2 5M20.5 4.5l-6.2 4"/>`,
        mail: `<rect ${F} x="3" y="5.5" width="18" height="13" rx="1.6"/><path d="M3.5 6.5l8.5 6.5 8.5-6.5"/>`,
        skip: `<path ${F} d="M5 5.5l8 6.5-8 6.5z"/><path ${F} d="M12 5.5l6 6.5-6 6.5"/><path d="M19.5 5.5v13"/>`,
        bars: `<path d="M3.5 20.5h17"/><rect ${F} x="5" y="12" width="3" height="8.5" rx=".6"/><rect ${F} x="10.5" y="7" width="3" height="13.5" rx=".6"/><rect ${F} x="16" y="10" width="3" height="10.5" rx=".6"/>`,
        bulb: `<path ${F} d="M8.5 15.5a6 6 0 1 1 7 0c-.8.6-1 1.4-1 2.5h-5c0-1.1-.2-1.9-1-2.5z"/><path d="M9.5 20.5h5M12 9.5v3.5"/>`,
        talk: `<circle ${F} cx="9" cy="8" r="3.4"/><path ${F} d="M3 20c0-3.6 2.7-6 6-6s6 2.4 6 6z"/><path d="M17 6.5a4 4 0 0 1 0 6M19.6 4a7.5 7.5 0 0 1 0 11"/>`,
        point: `<path d="M4 12h14M13 7l5 5-5 5"/>`,
        think: `<circle ${F} cx="12" cy="12" r="8.5"/><path d="M9.6 9.6a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1.1.9-1.1 1.7v.4M12 16.8v.2"/>`,
        pin: `<path ${F} d="M12 21s-6.5-5.8-6.5-11a6.5 6.5 0 0 1 13 0c0 5.2-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.4"/>`,
        cut: `<circle cx="6.5" cy="17.5" r="2.6"/><circle cx="17.5" cy="17.5" r="2.6"/><path d="M8.5 15.8L18 4M15.5 15.8L6 4"/>`,
        sparkle: `<path ${F} d="M12 3.5c.8 4.2 2.6 6.4 6.5 7.5-3.9 1.1-5.7 3.3-6.5 7.5-.8-4.2-2.6-6.4-6.5-7.5 3.9-1.1 5.7-3.3 6.5-7.5z"/><path d="M19 3.5v3M17.5 5h3"/>`,
        map: `<path ${F} d="M3.5 6l5.5-2 6 2 5.5-2v14l-5.5 2-6-2-5.5 2z"/><path d="M9 4v14M15 6v14"/>`,
        arrowUp: `<path d="M12 19.5v-15M6.5 10L12 4.5 17.5 10"/>`,
        mirror: `<ellipse ${F} cx="12" cy="9.5" rx="5.5" ry="6.5"/><path d="M12 16v4.5M8.5 20.5h7M9.8 7a2.6 2.6 0 0 1 2.2-1.5"/>`,
        barrel: `<path ${F} d="M6 4.5h12l1 7.5-1 7.5H6l-1-7.5z"/><path d="M5.4 8.5h13.2M5.4 15.5h13.2"/>`,
        sound: `<path ${F} d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>`,
        mute: `<path ${F} d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9.5l5 5M20.5 9.5l-5 5"/>`,
        dot: `<path ${F} d="M12 5l7 7-7 7-7-7z"/>`,
        chartUp: `<rect ${F} x="3.5" y="3.5" width="17" height="17" rx="2"/><path d="M7 15l3-3 2.5 2 4.5-5"/>`,
    };
    const E = {
        '🌱': 'sprout', '🫘': 'bean', '🏭': 'factory', '🦈': 'fin', '💻': 'laptop', '📱': 'phone', '🔔': 'bell', '🏆': 'trophy', '⏸': 'pause', '📰': 'news', '🎲': 'dice',
        '📈': 'up', '📉': 'down', '💹': 'chartUp', '🧾': 'receipt', '🎯': 'target', '🌍': 'globe', '📖': 'book', '🏗': 'crane', '🍫': 'choc', '📦': 'box', '💰': 'coins', '📜': 'contract',
        '☀': 'sun', '🤝': 'hand', '⚓': 'anchor', '🌧': 'rain', '🌦': 'cloudsun', '🏦': 'bank', '💼': 'case', '🕵': 'spy', '🛡': 'shield', '⚠': 'warn', '🍂': 'leaf', '🌾': 'wheat',
        '🚫': 'ban', '🥗': 'bowl', '🌴': 'palm', '💵': 'cash', '❄': 'snow', '🛰': 'sat', '📋': 'clip', '🏛': 'columns', '💬': 'chat', '🌳': 'tree', '💧': 'drop', '📣': 'horn',
        '🧠': 'brain', '📡': 'antenna', '👑': 'crown', '💔': 'broken', '🚚': 'truck', '💀': 'xcircle', '💸': 'loss', '🏅': 'medal', '🚨': 'siren', '👋': 'wave', '⏰': 'alarm',
        '⏳': 'hour', '🔥': 'fire', '🧪': 'flask', '📏': 'ruler', '🏚': 'ruin', '⚖': 'scale', '📞': 'call', '✅': 'check', '✔': 'tick', '✓': 'tick', '❌': 'cross', '✕': 'cross',
        '🌅': 'sunrise', '⭐': 'star', '★': 'star', '☆': 'starO', '🥇': 'gold', '🥈': 'silver', '🥉': 'bronze', '🤖': 'bot', '🗓': 'cal', '📵': 'nosig', '🍬': 'candy', '🥁': 'drum',
        '✉': 'mail', '⏭': 'skip', '📊': 'bars', '💡': 'bulb', '🗣': 'talk', '👉': 'point', '🤔': 'think', '🔒': 'lock', '📍': 'pin', '✂': 'cut', '✨': 'sparkle', '🗺': 'map',
        '⬆': 'arrowUp', '🪞': 'mirror', '🛢': 'barrel', '🔊': 'sound', '🔇': 'mute',
    };
    // Emojis (inkl. Variations-Zeichen und Hautfarben/ZWJ-Folgen) erkennen
    const RE = /(?:[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{2300}-\u{23FF}★☆])(?:️|‍(?:[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}])️?|[\u{1F3FB}-\u{1F3FF}])*️?/gu;
    const KEEP = new Set(['▲', '▼', '◆', '◇', '◉', '○', '·', '↺', '←', '→', '↓', '⤢', '◐', '±', '−', '×']);
    const nameOf = em => E[em.replace(/️|‍.*$/u, '')] || 'dot';
    const svg = (name, cls = '') => `<svg class="ico ${cls}" viewBox="0 0 24 24" aria-hidden="true">${P[name] || P.dot}</svg>`;
    // Für die Leinwand: Symbol als Bild (einmal je Farbe)
    const imgs = {};
    function img(em, color = '#f3dcaa') {
        const name = nameOf(em);
        const key = `${name}|${color}`;
        if (imgs[key]) return imgs[key];
        const im = new Image();
        im.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="96" height="96" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><style>.f{fill:${color};fill-opacity:.18}.d{fill:${color}}</style>${P[name] || P.dot}</svg>`)}`;
        imgs[key] = im;
        return im;
    }
    // Text ohne Emojis (z. B. für SVG-Texte, Titel)
    const strip = s => String(s).replace(RE, '').replace(/\s{2,}/g, ' ').trim();
    // Alle Emojis in einem Teilbaum durch Symbole ersetzen
    function paint(root) {
        if (!root) return;
        const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: n => (RE.test(n.nodeValue) ? (RE.lastIndex = 0, NodeFilter.FILTER_ACCEPT) : (RE.lastIndex = 0, NodeFilter.FILTER_SKIP)) });
        const list = [];
        while (w.nextNode()) list.push(w.currentNode);
        for (const t of list) {
            const par = t.parentNode;
            if (!par || par.nodeName === 'SCRIPT' || par.nodeName === 'STYLE' || par.nodeName === 'TEXTAREA') continue;
            if (par.namespaceURI === 'http://www.w3.org/2000/svg') { t.nodeValue = strip(t.nodeValue); continue; }
            const frag = document.createDocumentFragment();
            let last = 0;
            const s = t.nodeValue;
            s.replace(RE, (m, off) => {
                if (off > last) frag.appendChild(document.createTextNode(s.slice(last, off)));
                const span = document.createElement('span');
                span.className = `icw i-${nameOf(m)}`;
                span.innerHTML = svg(nameOf(m));
                frag.appendChild(span);
                last = off + m.length;
                return m;
            });
            if (last < s.length) frag.appendChild(document.createTextNode(s.slice(last)));
            par.replaceChild(frag, t);
        }
        // Titel-Attribute (Tooltips) ebenfalls säubern
        if (root.querySelectorAll) root.querySelectorAll('[title]').forEach(el => { const v = el.getAttribute('title'); if (RE.test(v)) { RE.lastIndex = 0; el.setAttribute('title', strip(v)); } RE.lastIndex = 0; });
    }
    let obs = null;
    function watch() {
        if (obs || !document.body) return;
        paint(document.body);
        let pending = new Set();
        let raf = 0;
        obs = new MutationObserver(muts => {
            for (const m of muts) {
                if (m.type === 'characterData') pending.add(m.target.parentNode);
                else m.addedNodes.forEach(n => pending.add(n.nodeType === 3 ? n.parentNode : n));
            }
            if (!raf) raf = requestAnimationFrame(() => { raf = 0; const p = pending; pending = new Set(); obs.disconnect(); p.forEach(n => n && n.isConnected && paint(n)); obs.observe(document.body, { childList: true, subtree: true, characterData: true }); });
        });
        obs.observe(document.body, { childList: true, subtree: true, characterData: true });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watch); else watch();
    return { svg, img, strip, paint, nameOf, inner: name => P[name] || P.dot, has: em => !!E[em] };
})();
