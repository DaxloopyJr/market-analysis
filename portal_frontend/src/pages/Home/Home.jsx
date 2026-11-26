/**
 * FILE: src/pages/Home/Home.jsx
 * Public home page (approved mockup v2, 5 Nov 2026): one page for the public viewer (SRS FR-049, SDD 6.1.13).
 * Sections: header + price ticker · hero + featured figure · key figures · commodity prices · growth (5 years)
 *           · institutions · news & publications · institution call-to-action · footer.
 *
 * DATA: SAMPLE_DATA below is placeholder content until Laravel publishes the public endpoints.
 *   When the backend is ready set PUBLIC_API_READY = true; loadPublicData() then reads
 *   GET /public/home (one payload with the same shape as SAMPLE_DATA) and replaces the sample.
 *   Only figures the Ministry Data Owner (MDD) cleared for public release may be returned there.
 * Language: EN / SW from the header (Kiswahili first for the public).
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import api from "../../API/axios";
import LanguageControl from "../../components/LanguageControl";
import "./Home.css";

/* Switch to true when GET /public/home exists on Laravel. */
const PUBLIC_API_READY = false;
/* Shows a small "sample figures" line while SAMPLE_DATA is in use. */
const SHOW_SAMPLE_NOTICE = true;

const EMBLEM = "/reference/national-emblem.png";

/* ------------------------------------------------------------------ sample data (replace via API) */
const SAMPLE_DATA = {
  updatedAt: "2026-11-04",
  featured: {label: {SW: "Ukuaji wa sekta ya viwanda", EN: "Manufacturing sector growth"}, value: "7.1%", change: 0.6,
    note: {SW: "Mchango wa viwanda kwenye pato la Taifa · Q2 2025/26 · chanzo: Wizara", EN: "Manufacturing share of GDP · Q2 2025/26 · source: Ministry"},
    trend: [5.2, 5.5, 5.4, 5.9, 6.1, 6.4, 6.6, 6.9, 7.1]},
  channels: {portal: 9, api: 4},
  kpis: [
    {key: "firms", icon: "🏭", color: "#0b5bd3", label: {SW: "Viwanda vipya vilivyosajiliwa", EN: "New industries registered"}, value: "1,240", change: 8.2, source: "BRELA · Q1–Q2 2025/26", trend: [820, 880, 940, 1010, 1120, 1240]},
    {key: "exports", icon: "🚢", color: "#1eb53a", label: {SW: "Mauzo ya bidhaa nje", EN: "Exports of goods"}, value: "TZS 3.2T", change: 5.1, source: "TanTrade · Q2 2025/26", trend: [2.4, 2.5, 2.7, 2.8, 3.0, 3.2]},
    {key: "quality", icon: "✔", color: "#e0a100", label: {SW: "Bidhaa zilizothibitishwa ubora", EN: "Products certified"}, value: "4,860", change: 3.4, source: "TBS · Q2 2025/26", trend: [4100, 4250, 4300, 4520, 4700, 4860]},
    {key: "jobs", icon: "👥", color: "#00a3dd", label: {SW: "Ajira mpya kupitia SMEs", EN: "New jobs through SMEs"}, value: "18,400", change: 11, source: "SIDO · Q2 2025/26", trend: [11200, 12600, 13900, 14500, 16600, 18400]},
  ],
  prices: {
    week: {SW: "Wiki ya 27 Okt – 2 Nov 2026", EN: "Week of 27 Oct – 2 Nov 2026"},
    regions: ["Dar es Salaam", "Dodoma", "Arusha", "Mbeya", "Mwanza"],
    items: [
      {group: "grain", icon: "🌽", name: {SW: "Mahindi", EN: "Maize"}, unit: "kg", byRegion: [850, 720, 780, 650, 760], change: -3.1, trend: [890, 880, 900, 895, 870, 850]},
      {group: "grain", icon: "🍚", name: {SW: "Mchele", EN: "Rice"}, unit: "kg", byRegion: [2600, 2450, 2500, 2300, 2480], change: 1.2, trend: [2380, 2400, 2410, 2430, 2445, 2470]},
      {group: "grain", icon: "🫘", name: {SW: "Maharage", EN: "Beans"}, unit: "kg", byRegion: [3100, 2900, 2950, 2700, 3000], change: 0, trend: [2930, 2925, 2935, 2930, 2930, 2930]},
      {group: "grain", icon: "🌾", name: {SW: "Ngano", EN: "Wheat"}, unit: "kg", byRegion: [1950, 1880, 1750, 1870, 2050], change: -1.1, trend: [1960, 1950, 1950, 1930, 1920, 1900]},
      {group: "industrial", icon: "🍬", name: {SW: "Sukari", EN: "Sugar"}, unit: "kg", byRegion: [3200, 3300, 3250, 3350, 3300], change: 0.8, trend: [3220, 3230, 3240, 3255, 3265, 3280]},
      {group: "industrial", icon: "🧱", name: {SW: "Saruji", EN: "Cement"}, unit: "50kg", byRegion: [16500, 17000, 17200, 17800, 17500], change: -0.6, trend: [17300, 17280, 17250, 17220, 17200, 17200]},
      {group: "industrial", icon: "🫗", name: {SW: "Mafuta ya kula", EN: "Cooking oil"}, unit: "L", byRegion: [5400, 5500, 5450, 5600, 5550], change: 0.4, trend: [5440, 5450, 5460, 5470, 5480, 5500]},
    ],
  },
  growth: {
    exports: {title: {SW: "Mauzo ya bidhaa zilizosindikwa nje", EN: "Exports of processed goods"}, unit: {SW: "TZS bilioni · TanTrade", EN: "TZS billion · TanTrade"},
      points: [["2021/22", 1840], ["2022/23", 2120], ["2023/24", 2330], ["2024/25", 2760], ["2025/26", 3200]]},
    registrations: {title: {SW: "Usajili mpya wa biashara", EN: "New business registrations"}, unit: {SW: "BRELA · kwa mwaka", EN: "BRELA · per year"},
      points: [["2021/22", 1460], ["2022/23", 1810], ["2023/24", 2050], ["2024/25", 2480], ["2025/26", 2980]]},
    highlights: [
      {value: "147,996", label: {SW: "Watumiaji wa taarifa za biashara · TanTrade 2025/26", EN: "Trade information users · TanTrade 2025/26"}},
      {value: "11,098", label: {SW: "Wauzaji nje waliosajiliwa · TanTrade", EN: "Registered exporters · TanTrade"}},
    ],
  },
  institutions: [
    {code: "BRELA", color: "#172e69", value: "1,240", label: {SW: "usajili mpya", EN: "new registrations"}},
    {code: "SIDO", color: "#1f8a4c", value: "18,400", label: {SW: "ajira kupitia SMEs", EN: "jobs through SMEs"}},
    {code: "TBS", color: "#0b5bd3", value: "4,860", label: {SW: "vyeti vya ubora", EN: "quality certificates"}},
    {code: "TANTRADE", color: "#00a3dd", value: "147,996", label: {SW: "watumiaji wa taarifa", EN: "information users"}},
    {code: "WRRB", color: "#e0a100", value: "62", label: {SW: "maghala yaliyosajiliwa", EN: "registered warehouses"}},
    {code: "FCC", color: "#9d174d", value: "310", label: {SW: "ukaguzi wa bei", EN: "price surveillances"}},
    {code: "WMA", color: "#5b4bd6", value: "92%", label: {SW: "vipimo sahihi", EN: "accurate measures"}},
  ],
  news: [
    {date: "2026-11-04", title: {SW: "Takwimu za robo ya pili 2025/26 zimechapishwa", EN: "Q2 2025/26 figures published"}, text: {SW: "Taasisi 11 kati ya 13 zimewasilisha.", EN: "11 of 13 institutions have reported."}},
    {date: "2026-10-28", title: {SW: "Bei za nafaka: mwenendo wa wiki 4", EN: "Grain prices: 4-week trend"}, text: {SW: "Bei ya mahindi imeshuka kwa mikoa ya kusini.", EN: "Maize prices fell in southern regions."}},
    {date: "2026-10-15", title: {SW: "Ripoti ya M&E ya mwaka 2024/25", EN: "Annual M&E report 2024/25"}, text: {SW: "Inapatikana kupakuliwa.", EN: "Available for download."}},
  ],
  publications: [
    {type: "PDF", color: "#c0392b", title: {SW: "Ripoti ya Utekelezaji M&E · Q2 2025/26", EN: "M&E Implementation Report · Q2 2025/26"}, meta: {SW: "Wizara · 2.1 MB", EN: "Ministry · 2.1 MB"}, url: ""},
    {type: "XLS", color: "#1f8a4c", title: {SW: "Takwimu za Viwanda 2025", EN: "Industry Statistics 2025"}, meta: {SW: "Mkusanyiko wa mwaka · Excel/CSV", EN: "Annual compilation · Excel/CSV"}, url: ""},
    {type: "API", color: "#0b5bd3", title: {SW: "Open Data API", EN: "Open Data API"}, meta: {SW: "Kwa watafiti na mifumo mingine", EN: "For researchers and other systems"}, url: ""},
  ],
};

/* ------------------------------------------------------------------ wording */
const TEXT = {
  SW: {
    nav: ["Mwanzo", "Takwimu", "Bei za Bidhaa", "Taasisi", "Machapisho"], login: "Ingia", tickerLabel: "BEI LEO",
    pill: "WIZARA YA VIWANDA NA BIASHARA", h1: "Takwimu Sahihi", h2: "za Viwanda na Biashara", h3: "kwa Tanzania Inayokua",
    intro: "Takwimu rasmi zilizoidhinishwa na Wizara: bei za bidhaa sokoni, ukuaji wa viwanda na biashara, na taarifa za taasisi zilizo chini ya Wizara — mahali pamoja.",
    seeData: "ANGALIA TAKWIMU", signIn: "Ingia kwenye mfumo", featuredTag: "TAKWIMU YA ROBO MWAKA",
    portal: "taasisi · Portal", api: "taasisi · API", updated: "Imesasishwa", yearChange: "mwaka",
    pricesTag: "BEI ZA BIDHAA SOKONI", pricesTitle: "Bei za nafaka na bidhaa wiki hii", grain: "Nafaka", industrial: "Bidhaa za viwanda",
    region: "Mkoa", allRegions: "Wote", fullTable: "Ona jedwali kamili", cardsView: "Ona kadi", average: "wastani", per: "kwa",
    product: "Bidhaa", unit: "Kipimo", weekChange: "Badiliko (wiki)",
    growthTag: "UKUAJI", growthTitle: "Viwanda na Biashara kwa miaka 5", download: "Pakua data",
    instTag: "TAASISI", instTitle: "Taasisi chini ya Wizara", seeStats: "Ona takwimu",
    newsTag: "MATANGAZO", newsTitle: "Habari na matangazo", pubTag: "MACHAPISHO", pubTitle: "Ripoti na data huria", get: "Pakua", details: "Maelezo",
    ctaTitle: "Wewe ni taasisi chini ya Wizara?", ctaText: "Wasilisha taarifa kupitia Portal au unganisha mfumo wako kwa API.",
    fAbout: "Kuhusu takwimu", fAboutText: "Chanzo · Ufafanuzi wa viashiria · Sera ya uchapishaji", fPrivacy: "Faragha", fPrivacyText: "Taarifa ya faragha (PDPA 2022)",
    fContact: "Mawasiliano", ministry: "Wizara ya Viwanda na Biashara · Dodoma", subtitle: "Wizara ya Viwanda na Biashara — Takwimu Rasmi",
    sample: "Takwimu zinazoonyeshwa ni za mfano hadi data rasmi itakapochapishwa.", noData: "Haijachapishwa bado",
    months: ["JAN", "FEB", "MAC", "APR", "MEI", "JUN", "JUL", "AGO", "SEP", "OKT", "NOV", "DES"],
  },
  EN: {
    nav: ["Home", "Statistics", "Prices", "Institutions", "Publications"], login: "Login", tickerLabel: "PRICES TODAY",
    pill: "MINISTRY OF INDUSTRY AND TRADE", h1: "Reliable", h2: "Industry & Trade Data", h3: "for a Growing Tanzania",
    intro: "Official statistics approved by the Ministry: market prices, industry and trade growth, and figures from the institutions under the Ministry — in one place.",
    seeData: "VIEW STATISTICS", signIn: "Sign in to the portal", featuredTag: "QUARTERLY HIGHLIGHT",
    portal: "institutions · Portal", api: "institutions · API", updated: "Updated", yearChange: "year",
    pricesTag: "MARKET PRICES", pricesTitle: "Grain and commodity prices this week", grain: "Grains", industrial: "Industrial goods",
    region: "Region", allRegions: "All", fullTable: "View full table", cardsView: "View cards", average: "average", per: "per",
    product: "Product", unit: "Unit", weekChange: "Change (week)",
    growthTag: "GROWTH", growthTitle: "Industry and trade over 5 years", download: "Download data",
    instTag: "INSTITUTIONS", instTitle: "Institutions under the Ministry", seeStats: "View figures",
    newsTag: "NEWS", newsTitle: "News and announcements", pubTag: "PUBLICATIONS", pubTitle: "Reports and open data", get: "Download", details: "Details",
    ctaTitle: "Are you an institution under the Ministry?", ctaText: "Submit data through the Portal or connect your system by API.",
    fAbout: "About the data", fAboutText: "Sources · Indicator definitions · Publication policy", fPrivacy: "Privacy", fPrivacyText: "Privacy notice (PDPA 2022)",
    fContact: "Contact", ministry: "Ministry of Industry and Trade · Dodoma", subtitle: "Ministry of Industry and Trade — Official Statistics",
    sample: "Figures shown are samples until official data is published.", noData: "Not published yet",
    months: ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"],
  },
};

/* ------------------------------------------------------------------ helpers */
const fmt = value => (value === null || value === undefined || value === "" ? "—" : Number(value).toLocaleString("en-US"));
const changeClass = change => (change > 0 ? "up" : change < 0 ? "down" : "flat");
const changeText = change => (change === null || change === undefined ? "—" : `${change > 0 ? "▲" : change < 0 ? "▼" : "—"} ${Math.abs(change).toFixed(1)}%`);
const average = list => { const xs = list.filter(v => Number.isFinite(v)); return xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null; };

function Spark({ values = [], color = "#0b5bd3", width = 90, height = 30 }) {
  const xs = values.filter(v => Number.isFinite(v));
  if (xs.length < 2) return null;
  const min = Math.min(...xs), max = Math.max(...xs), span = max - min || 1;
  const points = xs.map((v, i) => `${(i / (xs.length - 1)) * width},${height - 3 - ((v - min) / span) * (height - 6)}`).join(" ");
  return <svg className="ph-spark" width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
    <polyline points={points} fill="none" stroke={color} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>;
}

function Area({ values = [] }) {
  const xs = values.filter(v => Number.isFinite(v));
  if (xs.length < 2) return null;
  const w = 440, h = 70, min = Math.min(...xs), max = Math.max(...xs), span = max - min || 1;
  const pts = xs.map((v, i) => [(i / (xs.length - 1)) * w, h - 6 - ((v - min) / span) * (h - 16)]);
  const line = pts.map(p => p.join(",")).join(" ");
  return <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true">
    <defs><linearGradient id="ph-area" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#fcd116" stopOpacity=".45" /><stop offset="1" stopColor="#fcd116" stopOpacity="0" /></linearGradient></defs>
    <path d={`M${line.replaceAll(" ", " L")} L${w},${h} L0,${h}Z`} fill="url(#ph-area)" />
    <polyline points={line} fill="none" stroke="#fcd116" strokeWidth="3" />
  </svg>;
}

async function loadPublicData() {
  // Expected: GET /public/home -> {data: <same shape as SAMPLE_DATA>} (no login; MDD-cleared figures only).
  const response = await api.get("/public/home");
  return response?.data?.data ?? response?.data ?? null;
}

/* ------------------------------------------------------------------ page */
export default function Home() {
  const navigate = useNavigate();
  const [lang, setLang] = useState("SW");
  const [data, setData] = useState(SAMPLE_DATA);
  const [isSample, setIsSample] = useState(true);
  const [group, setGroup] = useState("grain");
  const [region, setRegion] = useState("");
  const [tableView, setTableView] = useState(false);
  const t = TEXT[lang] ?? TEXT.SW;
  const L = value => (value && typeof value === "object" ? value[lang] ?? value.SW ?? value.EN : value ?? "");

  useEffect(() => {
    if (!PUBLIC_API_READY) return undefined;
    let alive = true;
    loadPublicData().then(result => { if (alive && result) { setData(result); setIsSample(false); } }).catch(() => { /* keep the page usable */ });
    return () => { alive = false; };
  }, []);

  const prices = useMemo(() => data.prices ?? {regions: [], items: []}, [data]);
  const regionIndex = region === "" ? -1 : prices.regions.indexOf(region);
  const priceCards = useMemo(() => (prices.items ?? []).filter(item => item.group === group).map(item => {
    const values = item.byRegion ?? [];
    const pairs = values.map((v, i) => [v, prices.regions[i]]).filter(([v]) => Number.isFinite(v));
    const low = pairs.reduce((a, b) => (b[0] < a[0] ? b : a), pairs[0] ?? [null, ""]);
    const high = pairs.reduce((a, b) => (b[0] > a[0] ? b : a), pairs[0] ?? [null, ""]);
    return {...item, shown: regionIndex >= 0 ? values[regionIndex] ?? null : average(values), low, high};
  }), [prices, group, regionIndex]);

  const updated = data.updatedAt ? new Date(`${data.updatedAt}T00:00:00`) : null;
  const updatedText = updated ? `${updated.getDate()} ${t.months[updated.getMonth()]} ${updated.getFullYear()}` : "—";
  const scrollTo = id => document.getElementById(id)?.scrollIntoView({behavior: "smooth", block: "start"});
  const navTargets = ["ph-top", "ph-stats", "ph-prices", "ph-institutions", "ph-publications"];
  const tickerItems = [...(prices.items ?? []), ...(prices.items ?? [])];

  return (
    <main className="ph-page" id="ph-top">
      <section className="ph-hero">
        <div className="ph-wrap">
          <header className="ph-header">
            <img src={EMBLEM} alt="Nembo ya Taifa" />
            <div className="ph-brand"><strong>Viwanda na Biashara Portal</strong><span>{t.subtitle}</span></div>
            <nav className="ph-nav" aria-label="Main">
              {t.nav.map((label, i) => <button type="button" key={label} className={i === 0 ? "is-on" : ""} onClick={() => scrollTo(navTargets[i])}>{label}</button>)}
            </nav>
            <LanguageControl language={lang} onChange={setLang} />
            <button type="button" className="ph-login" onClick={() => navigate("/login")}>{t.login}</button>
          </header>

          {(prices.items ?? []).length > 0 && <div className="ph-ticker" aria-label={t.tickerLabel}>
            <span className="ph-ticker-label">● {t.tickerLabel}</span>
            <div className="ph-ticker-window"><div className="ph-ticker-run">
              {tickerItems.map((item, i) => <span key={i}>{L(item.name)} <b>{fmt(average(item.byRegion ?? []))}</b>/{item.unit} <em className={changeClass(item.change)}>{changeText(item.change)}</em></span>)}
            </div></div>
          </div>}

          <div className="ph-hero-grid">
            <div>
              <span className="ph-pill"><i />{t.pill}</span>
              <h1>{t.h1}<br />{t.h2}<br /><em>{t.h3}</em></h1>
              <p>{t.intro}</p>
              <div className="ph-hero-actions">
                <button type="button" className="ph-btn-gold" onClick={() => scrollTo("ph-stats")}>{t.seeData} ↓</button>
                <button type="button" className="ph-btn-ghost" onClick={() => navigate("/login")}>{t.signIn} →</button>
              </div>
            </div>
            {data.featured && <aside className="ph-featured">
              <small>{t.featuredTag}</small>
              <h3>{L(data.featured.label)}</h3>
              <div className="ph-featured-value">{data.featured.value ?? t.noData}{Number.isFinite(data.featured.change) && <span className={changeClass(data.featured.change)}>{data.featured.change > 0 ? "▲" : "▼"} {Math.abs(data.featured.change)}</span>}</div>
              <p>{L(data.featured.note)}</p>
              <Area values={data.featured.trend} />
              <div className="ph-chips">
                {data.channels && <><span>{data.channels.portal} {t.portal}</span><span>{data.channels.api} {t.api}</span></>}
                <span>{t.updated} {updatedText}</span>
              </div>
            </aside>}
          </div>
        </div>
      </section>

      <div className="ph-wrap">
        <section className="ph-kpis" id="ph-stats">
          {(data.kpis ?? []).map(kpi => <article className="ph-kpi" key={kpi.key}>
            <span className="ph-kpi-icon" style={{background: kpi.color}} aria-hidden="true">{kpi.icon}</span>
            <Spark values={kpi.trend} color={kpi.color} />
            <span className="ph-kpi-label">{L(kpi.label)}</span>
            <b>{kpi.value ?? t.noData}</b>
            {Number.isFinite(kpi.change) && <i className={`ph-chip ${changeClass(kpi.change)}`}>{changeText(kpi.change)} {t.yearChange}</i>}
            <small>{kpi.source}</small>
          </article>)}
        </section>

        <section className="ph-section" id="ph-prices">
          <div className="ph-section-head">
            <div><small>{t.pricesTag}</small><h2>{t.pricesTitle}</h2><span className="ph-sub">{L(prices.week)} · TZS</span></div>
            <div className="ph-filters">
              <button type="button" className={group === "grain" ? "is-on" : ""} onClick={() => setGroup("grain")}>{t.grain}</button>
              <button type="button" className={group === "industrial" ? "is-on" : ""} onClick={() => setGroup("industrial")}>{t.industrial}</button>
              <label className="ph-select"><span>{t.region}</span>
                <select value={region} onChange={e => setRegion(e.target.value)}><option value="">{t.allRegions}</option>{prices.regions.map(r => <option key={r} value={r}>{r}</option>)}</select></label>
              <button type="button" onClick={() => setTableView(v => !v)}>{tableView ? t.cardsView : t.fullTable} →</button>
            </div>
          </div>
          {!priceCards.length && <div className="ph-empty">{t.noData}</div>}
          {!tableView && priceCards.length > 0 && <div className="ph-prices">
            {priceCards.map(item => <article className="ph-price" key={L(item.name)}>
              <div className="ph-price-top"><span className="ph-price-icon" aria-hidden="true">{item.icon}</span><div><b>{L(item.name)}</b><span>TZS {t.per} {item.unit}</span></div></div>
              <div className="ph-price-value">{fmt(item.shown)} <small>{region || t.average}</small></div>
              {item.low?.[0] !== null && <div className="ph-price-range">{fmt(item.low[0])} {item.low[1]} – {fmt(item.high[0])} {item.high[1]}</div>}
              <div className="ph-price-foot"><span className={`ph-chip ${changeClass(item.change)}`}>{changeText(item.change)}</span>
                <Spark values={item.trend} width={72} height={24} color={item.change > 0 ? "#1f8a4c" : item.change < 0 ? "#b42318" : "#5b6478"} /></div>
            </article>)}
          </div>}
          {tableView && priceCards.length > 0 && <div className="ph-table-wrap"><table className="ph-table">
            <thead><tr><th>{t.product}</th><th>{t.unit}</th>{prices.regions.map(r => <th key={r} className="n">{r}</th>)}<th className="n">{t.weekChange}</th></tr></thead>
            <tbody>{priceCards.map(item => <tr key={L(item.name)}><td><b>{L(item.name)}</b></td><td>{item.unit}</td>
              {prices.regions.map((r, i) => <td key={r} className="n">{fmt(item.byRegion?.[i])}</td>)}
              <td className={`n ${changeClass(item.change)}`}>{changeText(item.change)}</td></tr>)}</tbody>
          </table></div>}
        </section>
      </div>

      {data.growth && <section className="ph-band">
        <div className="ph-wrap">
          <div className="ph-section-head"><div><small>{t.growthTag}</small><h2>{t.growthTitle}</h2></div></div>
          <div className="ph-growth">
            <article className="ph-chart"><h5>{L(data.growth.exports.title)}</h5><small>{L(data.growth.exports.unit)}</small>
              <ResponsiveContainer width="100%" height={190}><LineChart data={data.growth.exports.points.map(([year, value]) => ({year, value}))} margin={{top: 14, right: 14, bottom: 0, left: -10}}>
                <CartesianGrid stroke="#eef1f5" vertical={false} /><XAxis dataKey="year" tick={{fontSize: 11}} /><YAxis tick={{fontSize: 11}} />
                <Tooltip formatter={v => fmt(v)} /><Line type="monotone" dataKey="value" stroke="#0b5bd3" strokeWidth={3} dot={{r: 5, fill: "#fff", strokeWidth: 3}} />
              </LineChart></ResponsiveContainer></article>
            <article className="ph-chart"><h5>{L(data.growth.registrations.title)}</h5><small>{L(data.growth.registrations.unit)}</small>
              <ResponsiveContainer width="100%" height={190}><BarChart data={data.growth.registrations.points.map(([year, value]) => ({year, value}))} margin={{top: 14, right: 6, bottom: 0, left: -10}}>
                <CartesianGrid stroke="#eef1f5" vertical={false} /><XAxis dataKey="year" tick={{fontSize: 11}} /><YAxis tick={{fontSize: 11}} /><Tooltip formatter={v => fmt(v)} />
                <Bar dataKey="value" radius={[6, 6, 0, 0]} maxBarSize={42}>{data.growth.registrations.points.map((_, i, all) => <Cell key={i} fill={i === all.length - 1 ? "#fcd116" : "#0b5bd3"} />)}</Bar>
              </BarChart></ResponsiveContainer></article>
            <div className="ph-highlights">{(data.growth.highlights ?? []).map(h => <div className="ph-highlight" key={h.value}><b>{h.value}</b><span>{L(h.label)}</span></div>)}</div>
          </div>
        </div>
      </section>}

      <div className="ph-wrap">
        <section className="ph-section" id="ph-institutions">
          <div className="ph-section-head"><div><small>{t.instTag}</small><h2>{t.instTitle}</h2></div></div>
          <div className="ph-institutions">
            {(data.institutions ?? []).map(inst => <article className="ph-inst" key={inst.code}>
              <span className="ph-inst-logo" style={{background: inst.color}}>{inst.code.slice(0, 5)}</span>
              <b>{inst.value ?? t.noData}</b><span>{L(inst.label)}</span><em>{t.seeStats} →</em>
            </article>)}
          </div>
        </section>

        <section className="ph-section ph-two" id="ph-publications">
          <article className="ph-panel"><div className="ph-section-head"><div><small>{t.newsTag}</small><h2>{t.newsTitle}</h2></div></div>
            {(data.news ?? []).map(item => { const d = new Date(`${item.date}T00:00:00`); return <div className="ph-news" key={item.date + L(item.title)}>
              <span className="ph-date"><b>{String(d.getDate()).padStart(2, "0")}</b>{t.months[d.getMonth()]}</span>
              <p><b>{L(item.title)}</b><br />{L(item.text)}</p></div>; })}
          </article>
          <article className="ph-panel"><div className="ph-section-head"><div><small>{t.pubTag}</small><h2>{t.pubTitle}</h2></div></div>
            {(data.publications ?? []).map(item => <div className="ph-pub" key={item.type + L(item.title)}>
              <span className="ph-file" style={{background: item.color}}>{item.type}</span>
              <p><b>{L(item.title)}</b><small>{L(item.meta)}</small></p>
              <a href={item.url || undefined} aria-disabled={!item.url}>{item.type === "API" ? `${t.details} →` : t.get}</a>
            </div>)}
          </article>
        </section>

        <section className="ph-cta">
          <div><h3>{t.ctaTitle}</h3><p>{t.ctaText}</p></div>
          <button type="button" onClick={() => navigate("/login")}>{t.signIn} →</button>
        </section>
        {isSample && SHOW_SAMPLE_NOTICE && <p className="ph-sample">{t.sample}</p>}
      </div>

      <footer className="ph-footer">
        <div className="ph-flag" />
        <div className="ph-wrap ph-footer-grid">
          <div><b>Viwanda na Biashara Portal</b>{t.ministry}</div>
          <div><b>{t.fAbout}</b>{t.fAboutText}</div>
          <div><b>{t.fPrivacy}</b>{t.fPrivacyText}</div>
          <div><b>{t.fContact}</b>info@mit.go.tz</div>
        </div>
      </footer>
    </main>
  );
}
