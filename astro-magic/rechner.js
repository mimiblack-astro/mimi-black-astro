/* Geburtsdaten-Rechner, Logik aus dem Stand vor 6c341e5.
   Uhrzeit und Datum werden vor der Berechnung normalisiert. */
(function () {
  const SIGNS = [
    { name: "Widder", sym: "♈", el: "Feuer" },
    { name: "Stier", sym: "♉", el: "Erde" },
    { name: "Zwillinge", sym: "♊", el: "Luft" },
    { name: "Krebs", sym: "♋", el: "Wasser" },
    { name: "Löwe", sym: "♌", el: "Feuer" },
    { name: "Jungfrau", sym: "♍", el: "Erde" },
    { name: "Waage", sym: "♎", el: "Luft" },
    { name: "Skorpion", sym: "♏", el: "Wasser" },
    { name: "Schütze", sym: "♐", el: "Feuer" },
    { name: "Steinbock", sym: "♑", el: "Erde" },
    { name: "Wassermann", sym: "♒", el: "Luft" },
    { name: "Fische", sym: "♓", el: "Wasser" }
  ];

  function norm360(d) { return ((d % 360) + 360) % 360; }
  function deg2rad(d) { return d * Math.PI / 180; }
  function rad2deg(r) { return r * 180 / Math.PI; }

  function formatPos(lon) {
    const n = norm360(lon);
    const idx = Math.floor(n / 30);
    const degInSign = n - idx * 30;
    const deg = Math.floor(degInSign);
    const min = Math.floor((degInSign - deg) * 60);
    return SIGNS[idx].sym + " " + deg + "°" + String(min).padStart(2, "0") + "' " + SIGNS[idx].name;
  }

  function getJulianDay(year, month, day, utHours) {
    let y = year, m = month;
    if (m <= 2) { y -= 1; m += 12; }
    const A = Math.floor(y / 100);
    const B = 2 - A + Math.floor(A / 4);
    return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + day + utHours / 24 + B - 1524.5;
  }

  function calculateChart(dateStr, timeStr, lat, lon, tzOffset, ayanamsaMode) {
    const [year, month, day] = dateStr.split("-").map(Number);
    const [hour, minute] = timeStr.split(":").map(Number);
    const utHours = hour + minute / 60 - tzOffset;
    const jd = getJulianDay(year, month, day, utHours);
    const T = (jd - 2451545.0) / 36525.0;

    const eps = 23.439291 - 0.0130042 * T;
    const epsR = deg2rad(eps);

    const gmst = norm360(280.46061837 + 360.98564736629 * (jd - 2451545.0) + 0.000387933 * T * T);
    const ramc = norm360(gmst + lon);
    const ramcR = deg2rad(ramc);
    const latR = deg2rad(lat);

    const mc = norm360(rad2deg(Math.atan2(Math.sin(ramcR), Math.cos(ramcR) * Math.cos(epsR))));
    const asc = norm360(rad2deg(Math.atan2(Math.cos(ramcR), -Math.sin(ramcR) * Math.cos(epsR) - Math.tan(latR) * Math.sin(epsR))));

    const ic = norm360(mc + 180);
    const dsc = norm360(asc + 180);
    const arcDay = norm360(asc - mc);
    const arcNight = norm360(ic - asc);
    const placidusCusps = [
      asc,
      norm360(asc + arcNight / 3),
      norm360(asc + (2 * arcNight) / 3),
      ic,
      norm360(ic + arcDay / 3),
      norm360(ic + (2 * arcDay) / 3),
      dsc,
      norm360(mc - (2 * arcDay) / 3),
      norm360(mc - arcDay / 3),
      mc,
      norm360(mc + arcDay / 3),
      norm360(mc + (2 * arcDay) / 3)
    ];

    const ascSignStart = Math.floor(asc / 30) * 30;
    const wholeSignCusps = Array.from({ length: 12 }, (_, i) => norm360(ascSignStart + i * 30));

    const baseLahiri = 23.853 + (jd - 2451545.0) * (50.29 / 3600 / 365.25);
    let ayanamsa = baseLahiri;
    if (ayanamsaMode === "raman") ayanamsa = baseLahiri - 1.44;
    if (ayanamsaMode === "krishnamurti") ayanamsa = baseLahiri - 0.1;

    const vedicAsc = norm360(asc - ayanamsa);
    const vedicSignStart = Math.floor(vedicAsc / 30) * 30;
    const vedicCusps = Array.from({ length: 12 }, (_, i) => norm360(vedicSignStart + i * 30));

    const L0 = norm360(280.46646 + 36000.76983 * T);
    const Msun = norm360(357.52911 + 35999.05029 * T);
    const Csun = (1.914602 - 0.004817 * T) * Math.sin(deg2rad(Msun)) + 0.019993 * Math.sin(deg2rad(2 * Msun));
    const sunLon = norm360(L0 + Csun);

    const Lmoon = norm360(218.3165 + 481267.8813 * T);
    const Dmoon = norm360(297.8502 + 445267.1115 * T);
    const Mmoon = norm360(134.9634 + 477198.8676 * T);
    const Fmoon = norm360(93.2721 + 483202.0175 * T);
    const moonLon = norm360(
      Lmoon
      + 6.289 * Math.sin(deg2rad(Mmoon))
      + 1.274 * Math.sin(deg2rad(2 * Dmoon - Mmoon))
      + 0.658 * Math.sin(deg2rad(2 * Dmoon))
      + 0.214 * Math.sin(deg2rad(2 * Mmoon))
      - 0.186 * Math.sin(deg2rad(Msun))
      - 0.114 * Math.sin(deg2rad(2 * Fmoon))
    );

    const mercLon = norm360(sunLon + 18 * Math.sin(deg2rad(252.25 + 149472.67 * T)));
    const venLon = norm360(sunLon + 36 * Math.sin(deg2rad(181.98 + 58517.81 * T)));
    const marsLon = norm360(355.43 + 19140.299 * T + 10.69 * Math.sin(deg2rad(19.37 + 19140.30 * T)));
    const jupLon = norm360(34.35 + 3034.906 * T + 5.55 * Math.sin(deg2rad(20.02 + 3034.90 * T)));
    const satLon = norm360(50.08 + 1222.114 * T + 6.40 * Math.sin(deg2rad(317.02 + 1222.11 * T)));
    const rahuLon = norm360(125.04452 - 1934.136261 * T);
    const ketuLon = norm360(rahuLon + 180);

    const bodies = [
      { name: "Aszendent", sym: "AC", lon: asc },
      { name: "Sonne", sym: "☉", lon: sunLon },
      { name: "Mond", sym: "☽", lon: moonLon },
      { name: "Merkur", sym: "☿", lon: mercLon },
      { name: "Venus", sym: "♀", lon: venLon },
      { name: "Mars", sym: "♂", lon: marsLon },
      { name: "Jupiter", sym: "♃", lon: jupLon },
      { name: "Saturn", sym: "♄", lon: satLon },
      { name: "Rahu, Nordknoten", sym: "☊", lon: rahuLon },
      { name: "Ketu, Südknoten", sym: "☋", lon: ketuLon }
    ];

    function findHouse(pLon, cusps) {
      for (let i = 0; i < 12; i++) {
        const start = cusps[i];
        const end = cusps[(i + 1) % 12];
        const span = norm360(end - start);
        const rel = norm360(pLon - start);
        if (rel < span) return i + 1;
      }
      return 1;
    }

    const enriched = bodies.map((b) => {
      const tropLon = norm360(b.lon);
      const sidLon = norm360(b.lon - ayanamsa);
      const placHouse = b.sym === "AC" ? 1 : findHouse(tropLon, placidusCusps);
      const wsHouse = b.sym === "AC" ? 1 : Math.floor(norm360(Math.floor(tropLon / 30) * 30 - ascSignStart) / 30) + 1;
      const vedHouse = b.sym === "AC" ? 1 : Math.floor(norm360(Math.floor(sidLon / 30) * 30 - vedicSignStart) / 30) + 1;
      return {
        ...b,
        tropLon,
        sidLon,
        tropSign: Math.floor(tropLon / 30),
        sidSign: Math.floor(sidLon / 30),
        placHouse,
        wsHouse,
        vedHouse
      };
    });

    return { ayanamsa, asc, vedicAsc, mc, placidusCusps, wholeSignCusps, vedicCusps, bodies: enriched };
  }

  function renderWheelSVG(cusps, bodies, isSidereal, accentColor) {
    const size = 300, cx = 150, cy = 150, rOuter = 136, rSign = 108, rInner = 64;
    const rotOffset = 180 - cusps[0];
    const toXY = (lon, r) => {
      const a = deg2rad(lon + rotOffset);
      return [cx + r * Math.cos(a), cy - r * Math.sin(a)];
    };

    let svg = '<svg viewBox="0 0 ' + size + " " + size + '" width="100%" role="img" aria-hidden="true">';
    svg += '<circle cx="' + cx + '" cy="' + cy + '" r="' + rOuter + '" fill="rgba(11,14,23,0.9)" stroke="' + accentColor + '" stroke-width="1.6"/>';
    svg += '<circle cx="' + cx + '" cy="' + cy + '" r="' + rSign + '" fill="none" stroke="rgba(255,255,255,0.2)" stroke-width="1"/>';
    svg += '<circle cx="' + cx + '" cy="' + cy + '" r="' + rInner + '" fill="rgba(20,25,40,0.9)" stroke="rgba(255,255,255,0.22)" stroke-width="1"/>';

    for (let i = 0; i < 12; i++) {
      const deg = i * 30;
      const [x1, y1] = toXY(deg, rSign);
      const [x2, y2] = toXY(deg, rOuter);
      const [tx, ty] = toXY(deg + 15, (rSign + rOuter) / 2);
      svg += '<line x1="' + x1.toFixed(1) + '" y1="' + y1.toFixed(1) + '" x2="' + x2.toFixed(1) + '" y2="' + y2.toFixed(1) + '" stroke="rgba(255,255,255,0.18)" stroke-width="1"/>';
      svg += '<text x="' + tx.toFixed(1) + '" y="' + ty.toFixed(1) + '" fill="#f5f0e6" font-size="13" text-anchor="middle" dominant-baseline="central">' + SIGNS[i].sym + "</text>";
    }

    for (let i = 0; i < 12; i++) {
      const c = cusps[i];
      const [x1, y1] = toXY(c, rInner);
      const [x2, y2] = toXY(c, rSign);
      const isAxis = i === 0 || i === 3 || i === 6 || i === 9;
      svg += '<line x1="' + x1.toFixed(1) + '" y1="' + y1.toFixed(1) + '" x2="' + x2.toFixed(1) + '" y2="' + y2.toFixed(1) + '" stroke="' + (isAxis ? accentColor : "rgba(255,255,255,0.25)") + '" stroke-width="' + (isAxis ? 2 : 1) + '"/>';
      const nextC = cusps[(i + 1) % 12];
      const mid = norm360(c + norm360(nextC - c) / 2);
      const [hx, hy] = toXY(mid, rInner - 14);
      svg += '<text x="' + hx.toFixed(1) + '" y="' + hy.toFixed(1) + '" fill="rgba(255,255,255,0.55)" font-size="9.5" text-anchor="middle" dominant-baseline="central">' + (i + 1) + "</text>";
    }

    bodies.filter((b) => b.sym !== "AC").forEach((b, idx) => {
      const lon = isSidereal ? b.sidLon : b.tropLon;
      const rP = rSign - 16 - (idx % 2) * 14;
      const [px, py] = toXY(lon, rP);
      svg += '<circle cx="' + px.toFixed(1) + '" cy="' + py.toFixed(1) + '" r="10" fill="rgba(11,14,23,0.92)" stroke="' + accentColor + '" stroke-width="1.2"/>';
      svg += '<text x="' + px.toFixed(1) + '" y="' + py.toFixed(1) + '" fill="#fff" font-size="11" text-anchor="middle" dominant-baseline="central">' + b.sym + "</text>";
    });

    svg += '<text x="' + cx + '" y="' + cy + '" fill="' + accentColor + '" font-size="10" font-weight="bold" text-anchor="middle" dominant-baseline="central">' + (isSidereal ? "SIDERISCH" : "TROPISCH") + "</text>";
    svg += "</svg>";
    return svg;
  }

  const HD_GATES = [
    41, 19, 13, 49, 30, 55, 37, 63, 22, 36, 25, 17, 21, 51, 42, 3, 27, 24, 2, 23, 8, 20, 16, 35, 45, 12, 15, 52, 39, 53, 62, 56,
    31, 33, 7, 4, 29, 59, 40, 64, 47, 6, 46, 18, 48, 57, 32, 50, 28, 44, 1, 43, 14, 34, 9, 5, 26, 11, 10, 58, 38, 54, 61, 60
  ];

  function lonToHDGate(lon) {
    const shifted = norm360(lon - 302.0);
    const idx = Math.floor(shifted / 5.625) % 64;
    const line = Math.floor(((shifted % 5.625) / 5.625) * 6) + 1;
    return { gate: HD_GATES[idx], line };
  }

  function calcHumanDesign(sunLon, moonLon) {
    const pSun = lonToHDGate(sunLon);
    const pEarth = lonToHDGate(norm360(sunLon + 180));
    const dSun = lonToHDGate(norm360(sunLon - 88));
    const dEarth = lonToHDGate(norm360(sunLon - 88 + 180));
    const pMoon = lonToHDGate(moonLon);
    const types = [
      { type: "Manifestierender Generator", strategy: "Reagieren, informieren und handeln", auth: "Sakrale oder emotionale Autorität" },
      { type: "Generator", strategy: "Auf das Leben reagieren", auth: "Sakrale Autorität" },
      { type: "Projektor", strategy: "Auf die echte Einladung warten", auth: "Milz oder Selbst als Autorität" },
      { type: "Manifestor", strategy: "Informieren, bevor du wirkst", auth: "Emotionale oder Ego Autorität" },
      { type: "Reflektor", strategy: "Einen Mondzyklus von 28 Tagen abwarten", auth: "Lunare Autorität" }
    ];
    const tIdx = (pSun.gate + dSun.gate) % 5 === 0 ? 4 : (pSun.gate + pMoon.gate) % 4;
    const chosen = types[tIdx];
    const profile = pSun.line + "/" + dSun.line;
    return { ...chosen, profile, pSun, pEarth, dSun, dEarth, pMoon };
  }

  const CN_ANIMALS = [
    { name: "Ratte", sym: "Ratte", branch: "Zi, Wasser" },
    { name: "Büffel", sym: "Büffel", branch: "Chou, Erde" },
    { name: "Tiger", sym: "Tiger", branch: "Yin, Holz" },
    { name: "Hase", sym: "Hase", branch: "Mao, Holz" },
    { name: "Drache", sym: "Drache", branch: "Chen, Erde" },
    { name: "Schlange", sym: "Schlange", branch: "Si, Feuer" },
    { name: "Pferd", sym: "Pferd", branch: "Wu, Feuer" },
    { name: "Ziege", sym: "Ziege", branch: "Wei, Erde" },
    { name: "Affe", sym: "Affe", branch: "Shen, Metall" },
    { name: "Hahn", sym: "Hahn", branch: "You, Metall" },
    { name: "Hund", sym: "Hund", branch: "Xu, Erde" },
    { name: "Schwein", sym: "Schwein", branch: "Hai, Wasser" }
  ];
  const CN_STEMS = [
    { el: "Metall", yy: "Yang, Geng" }, { el: "Metall", yy: "Yin, Xin" },
    { el: "Wasser", yy: "Yang, Ren" }, { el: "Wasser", yy: "Yin, Gui" },
    { el: "Holz", yy: "Yang, Jia" }, { el: "Holz", yy: "Yin, Yi" },
    { el: "Feuer", yy: "Yang, Bing" }, { el: "Feuer", yy: "Yin, Ding" },
    { el: "Erde", yy: "Yang, Wu" }, { el: "Erde", yy: "Yin, Ji" }
  ];

  function calcBaZi(dateStr, timeStr) {
    const [y, m, d] = dateStr.split("-").map(Number);
    const [hr] = timeStr.split(":").map(Number);
    const effYear = (m < 2 || (m === 2 && d < 4)) ? y - 1 : y;
    const animalIdx = ((effYear - 1900) % 12 + 12) % 12;
    const stemIdx = (effYear % 10 + 10) % 10;
    const hourAnimalIdx = Math.floor(((hr + 1) % 24) / 2);
    const monthAnimalIdx = (m + 10) % 12;
    return {
      effYear,
      animal: CN_ANIMALS[animalIdx],
      stem: CN_STEMS[stemIdx],
      hourAnimal: CN_ANIMALS[hourAnimalIdx],
      monthAnimal: CN_ANIMALS[monthAnimalIdx]
    };
  }

  function parseBirthTime(raw, loose) {
    if (raw == null) return null;
    let s = String(raw).trim().toLowerCase();
    s = s.replace(/uhr/g, " ");
    s = s.replace(/,/g, ":");
    s = s.replace(/\s+/g, " ").trim();
    s = s.replace(/[.\s]+$/g, "").replace(/^[.\s]+/g, "");
    s = s.replace(/\./g, ":");
    s = s.replace(/(\d)\s*h\s*/g, "$1:");
    s = s.replace(/(\d)\s+(\d)/g, "$1:$2");
    s = s.replace(/:+/g, ":");
    const trailingColon = /:$/.test(s);
    s = s.replace(/:$/g, "");

    let h;
    let m;
    const hm = s.match(/^(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?$/);
    if (hm) {
      h = Number(hm[1]);
      m = Number(hm[2]);
      if (hm[3] != null && Number(hm[3]) > 59) return null;
    } else if (/^\d{4}$/.test(s)) {
      h = Number(s.slice(0, 2));
      m = Number(s.slice(2, 4));
    } else if (/^\d{3}$/.test(s)) {
      // 930 erst im losen Modus, damit 143 beim Tippen nicht zu 1:43 wird.
      if (!loose) return null;
      h = Number(s[0]);
      m = Number(s.slice(1));
    } else if (/^\d{1,2}$/.test(s) && (loose || trailingColon)) {
      h = Number(s);
      m = 0;
    } else {
      return null;
    }
    if (!Number.isInteger(h) || !Number.isInteger(m)) return null;
    if (h < 0 || h > 23 || m < 0 || m > 59) return null;
    return String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0");
  }

  function parseBirthDate(raw) {
    if (raw == null) return null;
    const s = String(raw).trim();
    if (!s) return null;
    let y;
    let m;
    let d;
    let match = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (match) {
      y = Number(match[1]);
      m = Number(match[2]);
      d = Number(match[3]);
    } else {
      match = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
      if (!match) return null;
      d = Number(match[1]);
      m = Number(match[2]);
      y = Number(match[3]);
    }
    if (y < 1 || y > 2399 || m < 1 || m > 12 || d < 1 || d > 31) return null;
    const dt = new Date(Date.UTC(y, m - 1, d));
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
    return String(y).padStart(4, "0") + "-" + String(m).padStart(2, "0") + "-" + String(d).padStart(2, "0");
  }

  function formatBirthDateDE(iso) {
    const parts = iso.split("-");
    return parts[2] + "." + parts[1] + "." + parts[0];
  }

  function degInSign(lon) {
    return Math.floor(norm360(lon) % 30);
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[c]));
  }

  globalThis.AstroRechner = {
    parseBirthTime,
    parseBirthDate,
    formatBirthDateDE,
    calculateChart,
    degInSign
  };

  if (typeof document === "undefined") return;

  let hawaiiActive = false;
  let savedCityIndex = 0;
  let lastCalcResult = null;
  let activeBig3Tab = "sun";

  const TIME_ERROR = "Diese Uhrzeit kann ich nicht lesen. Schreib sie zum Beispiel als 14:30, 14.30, 14,30, 14 30, 9:05, 1430 oder 14.";
  const DATE_ERROR = "Dieses Datum kann ich nicht lesen. Schreib es zum Beispiel als 12.03.1990, 12.3.1990 oder 1990-03-12. Der Kalender daneben geht auch.";

  function el(id) { return document.getElementById(id); }

  function showError(message) {
    const box = el("calcError");
    if (!box) return;
    box.textContent = message || "";
  }

  function setInvalid(id, invalid) {
    const node = el(id);
    if (!node) return;
    if (invalid) node.setAttribute("aria-invalid", "true");
    else node.removeAttribute("aria-invalid");
  }

  function shortPos(lon) {
    const idx = Math.floor(norm360(lon) / 30);
    return SIGNS[idx].sym + " " + SIGNS[idx].name + " " + degInSign(lon) + "°";
  }

  function showBigThreeDetail(which) {
    activeBig3Tab = which;
    ["sun", "moon", "asc"].forEach((k) => {
      const button = el("btnBig" + k.charAt(0).toUpperCase() + k.slice(1));
      if (button) {
        const on = k === which;
        button.classList.toggle("is-active", on);
        button.setAttribute("aria-pressed", on ? "true" : "false");
      }
    });
    const drawer = el("big3Drawer");
    if (drawer) drawer.hidden = false;
    if (!lastCalcResult) return;
    const res = lastCalcResult;
    const titleEl = el("big3DrawerTitle");
    const textEl = el("big3DrawerText");
    if (which === "sun") {
      const b = res.bodies[1];
      titleEl.textContent = "Sonne westlich in " + SIGNS[b.tropSign].name + ", vedisch in " + SIGNS[b.sidSign].name;
      textEl.textContent = "Deine Sonne zeigt deinen Wesenskern und deine schöpferische Lebensenergie. In Placidus steht sie im " + b.placHouse + ". Haus, im Whole Sign System im " + b.wsHouse + ". Haus und im vedischen Jyotish im Zeichen " + SIGNS[b.sidSign].name + ", " + b.vedHouse + ". Haus. Im Human Design liegt dein bewusstes Sonnentor bei Tor " + res.hd.pSun.gate + ", Linie " + res.hd.pSun.line + ".";
    } else if (which === "moon") {
      const b = res.bodies[2];
      titleEl.textContent = "Mond westlich in " + SIGNS[b.tropSign].name + ", vedisch in " + SIGNS[b.sidSign].name;
      textEl.textContent = "Dein Mond zeigt, wie du fühlst und wo du zur Ruhe kommst. Tropisch steht er in " + SIGNS[b.tropSign].name + ", Placidus Haus " + b.placHouse + ", Whole Sign Haus " + b.wsHouse + ". Vedisch steht er in " + SIGNS[b.sidSign].name + ", Haus " + b.vedHouse + ".";
    } else {
      const b = res.bodies[0];
      titleEl.textContent = "Aszendent westlich in " + SIGNS[b.tropSign].name + ", vedisch in " + SIGNS[b.sidSign].name;
      textEl.textContent = "Dein Aszendent entsteht aus Geburtszeit und Geburtsort. In Placidus beginnt Haus 1 bei " + formatPos(b.tropLon) + ". Im Whole Sign System umfasst Haus 1 das ganze Zeichen " + SIGNS[b.tropSign].name + ". Vedisch, als Lagna, steht der Aufstiegspunkt in " + SIGNS[b.sidSign].name + ".";
    }
  }

  function renderResult(res, nameVal, hawaiiNote) {
    const sun = res.bodies[1];
    const moon = res.bodies[2];
    const sunDeg = degInSign(sun.tropLon);
    const moonDeg = degInSign(moon.tropLon);
    const ascDeg = degInSign(res.asc);
    const sunSign = SIGNS[sun.tropSign].name;
    const moonSign = SIGNS[moon.tropSign].name;
    const ascSign = SIGNS[Math.floor(res.asc / 30)].name;

    const ergebnis = el("rechnerErgebnis");
    if (ergebnis) ergebnis.hidden = false;

    const title = el("profTitle");
    if (title) title.textContent = nameVal + (hawaiiNote ? ", Hawaii Vergleich" : "");
    const avatar = el("profAvatar");
    if (avatar) avatar.textContent = (nameVal.trim().charAt(0) || "✶").toUpperCase();

    const summary = el("big3Summary");
    if (summary) {
      summary.textContent = "Sonne " + sunSign + " " + sunDeg + "°. Mond " + moonSign + " " + moonDeg + "°. Aszendent " + ascSign + " " + ascDeg + "°.";
    }

    const sunEl = el("big3Sun");
    const moonEl = el("big3Moon");
    const ascEl = el("big3Asc");
    if (sunEl) {
      sunEl.textContent = shortPos(sun.tropLon);
      sunEl.dataset.sign = sunSign;
      sunEl.dataset.deg = String(sunDeg);
    }
    if (moonEl) {
      moonEl.textContent = shortPos(moon.tropLon);
      moonEl.dataset.sign = moonSign;
      moonEl.dataset.deg = String(moonDeg);
    }
    if (ascEl) {
      ascEl.textContent = shortPos(res.asc);
      ascEl.dataset.sign = ascSign;
      ascEl.dataset.deg = String(ascDeg);
    }
    showBigThreeDetail(activeBig3Tab);

    const banner = el("hawaiiBanner");
    if (banner) {
      if (hawaiiNote) {
        banner.hidden = false;
        banner.textContent = hawaiiNote;
      } else {
        banner.hidden = true;
        banner.textContent = "";
      }
    }

    const info = el("ayanamsaInfo");
    if (info) {
      info.textContent = "Ayanamsa " + res.ayanamsa.toFixed(2) + " Grad. Aszendent " + formatPos(res.asc) + ". Vedisch " + formatPos(res.vedicAsc) + ". Human Design " + res.hd.type + ", Profil " + res.hd.profile + ". Chinesisch " + res.bazi.stem.el + " " + res.bazi.animal.name + ".";
    }

    el("sumPlacidus").textContent = "Aszendent " + formatPos(res.asc) + ". Sonne Haus " + sun.placHouse + ". Mond Haus " + moon.placHouse + ".";
    el("sumWholeSign").textContent = "Haus 1 ist das ganze Zeichen " + SIGNS[Math.floor(res.asc / 30)].name + ". Sonne Haus " + sun.wsHouse + ". Mond Haus " + moon.wsHouse + ".";
    el("sumVedic").textContent = "Lagna " + formatPos(res.vedicAsc) + ". Sonne " + SIGNS[sun.sidSign].name + ", Haus " + sun.vedHouse + ". Mond " + SIGNS[moon.sidSign].name + ", Haus " + moon.vedHouse + ".";

    el("svgPlacidus").innerHTML = renderWheelSVG(res.placidusCusps, res.bodies, false, "#c4b5fd");
    el("svgWholeSign").innerHTML = renderWheelSVG(res.wholeSignCusps, res.bodies, false, "#F5B8D4");
    el("svgVedic").innerHTML = renderWheelSVG(res.vedicCusps, res.bodies, true, "#5eead4");

    el("sumHD").textContent = res.hd.type + ". Profil " + res.hd.profile + ". " + res.hd.auth + ".";
    el("boxHD").innerHTML = ""
      + row("Energietyp", res.hd.type)
      + row("Strategie", res.hd.strategy)
      + row("Innere Autorität", res.hd.auth)
      + row("Profil", res.hd.profile)
      + row("Bewusstes Sonnentor und Erdentor", "Tor " + res.hd.pSun.gate + ", Linie " + res.hd.pSun.line + " und Tor " + res.hd.pEarth.gate + ", Linie " + res.hd.pEarth.line)
      + row("Unbewusst, 88 Grad vor der Geburt", "Tor " + res.hd.dSun.gate + ", Linie " + res.hd.dSun.line + " und Tor " + res.hd.dEarth.gate + ", Linie " + res.hd.dEarth.line)
      + row("Mondtor", "Tor " + res.hd.pMoon.gate + ", Linie " + res.hd.pMoon.line);

    el("sumBaZi").textContent = res.bazi.stem.el + " " + res.bazi.animal.name + ". Stunde " + res.bazi.hourAnimal.name + ".";
    el("boxBaZi").innerHTML = ""
      + row("Jahrestier " + res.bazi.effYear, res.bazi.animal.name)
      + row("Himmelsstamm", res.bazi.stem.el + ", " + res.bazi.stem.yy)
      + row("Erdzweig", res.bazi.animal.branch)
      + row("Monat", res.bazi.monthAnimal.name)
      + row("Stunde", res.bazi.hourAnimal.name)
      + row("West und Ost", SIGNS[sun.tropSign].name + ", " + SIGNS[sun.tropSign].el + ", und " + res.bazi.stem.el + " " + res.bazi.animal.name);

    const tbody = el("compTableBody");
    tbody.innerHTML = res.bodies.map((b) => {
      const hdG = lonToHDGate(b.tropLon);
      const diffs = [];
      if (b.placHouse !== b.wsHouse) diffs.push("Whole Sign von Haus " + b.placHouse + " nach Haus " + b.wsHouse);
      if (b.tropSign !== b.sidSign) diffs.push("Vedisch von " + SIGNS[b.tropSign].name + " nach " + SIGNS[b.sidSign].name);
      diffs.push("Human Design Tor " + hdG.gate + ", Linie " + hdG.line);
      return "<tr><td>" + esc(b.sym + " " + b.name) + "</td><td>" + esc(formatPos(b.tropLon)) + "</td><td>Haus " + b.placHouse + "</td><td>Haus " + b.wsHouse + "</td><td>" + esc(formatPos(b.sidLon)) + "</td><td>Haus " + b.vedHouse + "</td><td>" + esc(diffs.join(". ")) + "</td></tr>";
    }).join("");
  }

  function row(label, value) {
    return '<div class="sys-pill-row"><span>' + esc(label) + "</span><strong>" + esc(value) + "</strong></div>";
  }

  function readInputs() {
    const nameRaw = (el("inpName").value || "").trim();
    const dateRaw = el("inpDate").value;
    const timeRaw = el("inpTime").value;
    const dateIso = parseBirthDate(dateRaw);
    const timeNorm = parseBirthTime(timeRaw, true);
    const problems = [];
    setInvalid("inpDate", !dateIso);
    setInvalid("inpTime", !timeNorm);
    if (!dateIso) problems.push(DATE_ERROR);
    if (!timeNorm) problems.push(TIME_ERROR);
    if (problems.length) {
      showError(problems.join(" "));
      return null;
    }
    showError("");
    el("inpDate").value = formatBirthDateDE(dateIso);
    el("inpTime").value = timeNorm;
    const picker = el("inpDatePick");
    if (picker) picker.value = dateIso;

    const citySel = el("inpCity");
    const parts = citySel.value.split(",").map(Number);
    if (parts.length < 3 || parts.some((n) => Number.isNaN(n))) {
      showError("Diesen Ort kann ich nicht verwenden. Wähle einen Ort aus der Liste.");
      return null;
    }
    const ayanamsaMode = el("inpAyanamsa").value;
    return {
      name: nameRaw || "Dein Horoskop",
      dateIso,
      timeNorm,
      lat: parts[0],
      lon: parts[1],
      tz: parts[2],
      ayanamsaMode,
      citySel
    };
  }

  function recalculateAll() {
    const input = readInputs();
    if (!input) return false;

    const lat = hawaiiActive ? 21.3069 : input.lat;
    const lon = hawaiiActive ? -157.8583 : input.lon;
    const tz = hawaiiActive ? -10 : input.tz;

    const res = calculateChart(input.dateIso, input.timeNorm, lat, lon, tz, input.ayanamsaMode);
    const origRes = hawaiiActive
      ? calculateChart(input.dateIso, input.timeNorm, input.lat, input.lon, input.tz, input.ayanamsaMode)
      : res;

    const sun = res.bodies[1];
    const moon = res.bodies[2];
    res.hd = calcHumanDesign(sun.tropLon, moon.tropLon);
    res.bazi = calcBaZi(input.dateIso, input.timeNorm);
    lastCalcResult = res;

    let hawaiiNote = "";
    if (hawaiiActive) {
      hawaiiNote = "Zum Vergleich liegt der Ort auf Honolulu, gleiche Uhrzeit. Dein Aszendent wandert von " + formatPos(origRes.asc) + " nach " + formatPos(res.asc) + ". Die Sonne wandert von Haus " + origRes.bodies[1].placHouse + " nach Haus " + sun.placHouse + ". Der Mond wandert von Haus " + origRes.bodies[2].placHouse + " nach Haus " + moon.placHouse + ".";
    }
    renderResult(res, input.name, hawaiiNote);
    return true;
  }

  function onCityChange() {
    if (hawaiiActive) {
      hawaiiActive = false;
      const btn = el("btnHawaii");
      if (btn) {
        btn.classList.remove("is-active");
        btn.setAttribute("aria-pressed", "false");
        btn.textContent = "Hawaii Vergleich";
      }
      const banner = el("hawaiiBanner");
      if (banner) {
        banner.hidden = true;
        banner.textContent = "";
      }
    }
    if (el("rechnerErgebnis") && !el("rechnerErgebnis").hidden) recalculateAll();
  }

  function setHawaiiButton(active) {
    const btn = el("btnHawaii");
    if (!btn) return;
    btn.classList.toggle("is-active", active);
    btn.setAttribute("aria-pressed", active ? "true" : "false");
    btn.textContent = active ? "Hawaii Vergleich aktiv, zurück zum Geburtsort" : "Hawaii Vergleich";
  }

  function toggleHawaii() {
    const citySel = el("inpCity");
    const next = !hawaiiActive;
    if (next) savedCityIndex = citySel.selectedIndex;
    hawaiiActive = next;
    setHawaiiButton(next);
    const ok = recalculateAll();
    if (!ok) {
      hawaiiActive = !next;
      if (!next) citySel.selectedIndex = savedCityIndex;
      setHawaiiButton(hawaiiActive);
    } else if (!next) {
      citySel.selectedIndex = savedCityIndex;
    }
  }

  function loadPreset(key, btn) {
    const presets = {
      herbst: ["Beispielprofil", "31.10.1990", "14:30", 0],
      sonnenwende: ["Wintersonnenwende", "21.12.1988", "22:15", 1],
      nord: ["Norddeutschland", "15.05.1995", "06:45", 2]
    };
    const preset = presets[key];
    if (!preset) return;
    document.querySelectorAll("#rechner .chip").forEach((c) => c.classList.remove("is-active"));
    if (btn) btn.classList.add("is-active");
    el("inpName").value = preset[0];
    el("inpDate").value = preset[1];
    el("inpTime").value = preset[2];
    el("inpCity").selectedIndex = preset[3];
    if (hawaiiActive) toggleHawaii();
    else recalculateAll();
  }

  function boot() {
    const form = el("rechnerForm");
    if (!form) return;
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      recalculateAll();
    });
    el("inpCity").addEventListener("change", onCityChange);
    el("inpAyanamsa").addEventListener("change", () => {
      if (!el("rechnerErgebnis").hidden) recalculateAll();
    });
    el("inpTime").addEventListener("blur", () => {
      const norm = parseBirthTime(el("inpTime").value, true);
      if (norm) {
        el("inpTime").value = norm;
        setInvalid("inpTime", false);
      }
    });
    el("inpDate").addEventListener("blur", () => {
      const iso = parseBirthDate(el("inpDate").value);
      if (iso) {
        el("inpDate").value = formatBirthDateDE(iso);
        const picker = el("inpDatePick");
        if (picker) picker.value = iso;
        setInvalid("inpDate", false);
      }
    });
    const picker = el("inpDatePick");
    if (picker) {
      const syncFromPicker = () => {
        const iso = parseBirthDate(picker.value);
        if (!iso) return;
        el("inpDate").value = formatBirthDateDE(iso);
        setInvalid("inpDate", false);
        showError("");
      };
      picker.addEventListener("input", syncFromPicker);
      picker.addEventListener("change", syncFromPicker);
      const openPicker = el("btnDatePick");
      if (openPicker) {
        openPicker.addEventListener("click", () => {
          if (typeof picker.showPicker === "function") {
            try { picker.showPicker(); return; } catch (err) { /* öffnet nur aus einer direkten Geste */ }
          }
          picker.focus();
        });
      }
    }
    el("btnHawaii").addEventListener("click", toggleHawaii);
    el("btnBigSun").addEventListener("click", () => showBigThreeDetail("sun"));
    el("btnBigMoon").addEventListener("click", () => showBigThreeDetail("moon"));
    el("btnBigAsc").addEventListener("click", () => showBigThreeDetail("asc"));
    const closeBtn = el("btnBigClose");
    if (closeBtn) closeBtn.addEventListener("click", () => { el("big3Drawer").hidden = true; });
    document.querySelectorAll("#rechner [data-preset]").forEach((btn) => {
      btn.addEventListener("click", () => loadPreset(btn.getAttribute("data-preset"), btn));
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
