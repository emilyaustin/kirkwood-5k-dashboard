// ── Constants ─────────────────────────────────────────────────────────────────

const M_DARK  = '#1d4ed8';
const M_MID   = '#3b82f6';
const M_LIGHT = '#93c5fd';
const F_DARK  = '#be185d';
const F_MID   = '#ec4899';
const F_LIGHT = '#f9a8d4';

const YEAR_COLORS = [
  '#f97316','#eab308','#22c55e','#14b8a6',
  '#3b82f6','#8b5cf6','#ec4899','#f43f5e','#0ea5e9','#a3e635',
];

const BRACKETS = ['0-12','13-19','20-29','30-39','40-49','50-59','60+'];

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtTime(s) {
  if (s == null || isNaN(s) || s <= 0) return '--:--';
  const m   = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
}

function median(arr) {
  if (!arr.length) return null;
  const a = [...arr].sort((x, y) => x - y);
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

function mean(arr) {
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
}

// ── Data Processing ───────────────────────────────────────────────────────────

function processData(data) {
  const stats = {};

  for (const year of data.years) {
    const raw    = data.results[String(year)] || [];
    const valid  = raw.filter(r => r.chip_time_seconds > 0);
    const sorted = [...valid].sort((a, b) => a.chip_time_seconds - b.chip_time_seconds);
    const male   = sorted.filter(r => r.gender === 'M');
    const female = sorted.filter(r => r.gender === 'F');
    const times  = sorted.map(r => r.chip_time_seconds);

    // Build age-group buckets: top-3 times + count, keyed by "M 30-39" etc.
    const ag = {};
    for (const b of BRACKETS) {
      ag[`M ${b}`] = { count: 0, top3: [] };
      ag[`F ${b}`] = { count: 0, top3: [] };
    }
    for (const r of sorted) {           // already sorted fastest-first
      const b = r.age_bracket;
      if (!b) continue;
      const g = r.gender === 'M' ? 'M' : r.gender === 'F' ? 'F' : null;
      if (!g) continue;
      const key = `${g} ${b}`;
      if (!ag[key]) continue;
      ag[key].count++;
      if (ag[key].top3.length < 3) ag[key].top3.push(r.chip_time_seconds);
    }

    stats[year] = {
      total:        raw.length,
      male_count:   male.length,
      female_count: female.length,
      podium_all:   sorted.slice(0, 3).map(r => r.chip_time_seconds),
      podium_m:     male.slice(0, 3).map(r => r.chip_time_seconds),
      podium_f:     female.slice(0, 3).map(r => r.chip_time_seconds),
      median_time:  median(times),
      mean_time:    mean(times),
      age_groups:   ag,
    };
  }

  return stats;
}

// ── Summary Cards ─────────────────────────────────────────────────────────────

function renderCards(stats, years, data) {
  const latest = years.at(-1);
  const s      = stats[latest];

  // Course records (fastest M and F ever)
  let crTime = Infinity, crYear = null;
  let crTimeF = Infinity, crYearF = null;
  for (const y of years) {
    const tm = stats[y].podium_m[0];
    const tf = stats[y].podium_f[0];
    if (tm && tm < crTime)  { crTime  = tm; crYear  = y; }
    if (tf && tf < crTimeF) { crTimeF = tf; crYearF = y; }
  }

  const total  = years.reduce((n, y) => n + stats[y].total, 0);
  const femPct = s.total ? Math.round(s.female_count / s.total * 100) : '?';

  // Oldest / youngest come from top-level metadata (age_bracket kept per-runner for grouping)
  const oldest   = { age: data.oldest_age,   year: data.oldest_year };
  const youngest = { age: data.youngest_age, year: data.youngest_year };

  // Avg race-day high from WEATHER
  const weatherYears = years.filter(y => WEATHER[y]);
  const avgHigh = Math.round(weatherYears.reduce((s, y) => s + WEATHER[y].temp_8am, 0) / weatherYears.length);
  const condCounts = {};
  for (const y of weatherYears) {
    const c = WEATHER[y].condition;
    condCounts[c] = (condCounts[c] || 0) + 1;
  }
  const topCond = Object.entries(condCounts).sort((a, b) => b[1] - a[1])[0][0];

  const condIcon = { 'Rain': '🌧️', 'Drizzle': '🌦️', 'Clear': '☀️', 'Partly Cloudy': '⛅' };

  function makeCard(accent, icon, label, value, sub) {
    const card = document.createElement('div');
    card.className = 'stat-card';
    card.style.setProperty('--accent', accent);
    [['icon', icon], ['label', label], ['value', value], ['sub', sub]].forEach(([cls, text]) => {
      const el = document.createElement('div');
      el.className = cls;
      el.textContent = text;
      card.appendChild(el);
    });
    return card;
  }

  const container = document.getElementById('stat-cards');
  container.textContent = '';
  container.append(
    makeCard('#14b8a6', '🏃', 'Total Finishers',    total.toLocaleString(),            `${years[0]}–${latest} · 2020 cancelled`),
    makeCard('#f59e0b', '🥇', 'Course Record (M)',   fmtTime(crTime),                   `set in ${crYear}`),
    makeCard('#ec4899', '🥇', 'Course Record (F)',   fmtTime(crTimeF),                  `set in ${crYearF}`),
    makeCard('#8b5cf6', '🎂', 'Oldest & Youngest',   `${oldest.age} & ${youngest.age}`, `oldest in ${oldest.year} · youngest in ${youngest.year}`),
    makeCard('#f97316', condIcon[topCond] || '⛅',   'Avg Race Day',                    `${avgHigh}°F`,                        `avg 8am temp · ${topCond} most common`),
  );
}

// ── Chart: Finishers ──────────────────────────────────────────────────────────

function renderFinishers(stats, years) {
  new Chart(document.getElementById('finishersChart'), {
    type: 'bar',
    data: {
      labels: years,
      datasets: [
        { label: 'Male',         data: years.map(y => stats[y].male_count),   backgroundColor: M_MID,    stack: 's' },
        { label: 'Female',       data: years.map(y => stats[y].female_count), backgroundColor: F_MID,    stack: 's' },
        { label: 'Gender unknown', data: years.map(y => stats[y].total - stats[y].male_count - stats[y].female_count), backgroundColor: '#94a3b8', stack: 's' },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'top' } },
      scales: {
        x: { stacked: true },
        y: { stacked: true, title: { display: true, text: 'Finishers' } },
      },
    },
  });
}

// ── Chart: Gender % ───────────────────────────────────────────────────────────

function renderGender(stats, years) {
  new Chart(document.getElementById('genderChart'), {
    type: 'line',
    data: {
      labels: years,
      datasets: [{
        label: '% Female',
        data: years.map(y => {
          const s = stats[y];
          // null out years with no gender data so they show as a gap
          if (s.male_count + s.female_count === 0) return null;
          return +((s.female_count / s.total) * 100).toFixed(1);
        }),
        borderColor: F_DARK,
        backgroundColor: F_DARK + '22',
        fill: true,
        tension: 0.35,
        pointRadius: 5,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: {
          min: 0, max: 100,
          title: { display: true, text: '% Female' },
          ticks: { callback: v => `${v}%` },
        },
      },
    },
  });
}

// ── Chart: Podium Times ───────────────────────────────────────────────────────

function timeTicks() {
  return { callback: v => fmtTime(v) };
}

function timeTooltip(ctx) {
  return `${ctx.dataset.label}: ${fmtTime(ctx.raw)}`;
}

let podiumChart = null;

function renderPodium(stats, years, gender = 'all') {
  if (podiumChart) { podiumChart.destroy(); podiumChart = null; }

  const A = ['#1e293b', '#64748b', '#cbd5e1'];  // neutral palette for "all overall"

  const overallDatasets = [
    { label: '1st Overall', idx: 0 },
    { label: '2nd Overall', idx: 1 },
    { label: '3rd Overall', idx: 2 },
  ].map(d => ({
    label:           d.label,
    data:            years.map(y => stats[y].podium_all[d.idx] ?? null),
    borderColor:     A[d.idx],
    backgroundColor: A[d.idx],
    tension: 0.2, pointRadius: 4,
    borderDash: d.idx === 2 ? [4, 3] : d.idx === 1 ? [2, 2] : [],
  }));

  const genderedDatasets = [
    { label: '1st M', colors: [M_DARK, M_MID, M_LIGHT], idx: 0, arr: 'podium_m', _g: 'M' },
    { label: '2nd M', colors: [M_DARK, M_MID, M_LIGHT], idx: 1, arr: 'podium_m', _g: 'M' },
    { label: '3rd M', colors: [M_DARK, M_MID, M_LIGHT], idx: 2, arr: 'podium_m', _g: 'M' },
    { label: '1st F', colors: [F_DARK, F_MID, F_LIGHT], idx: 0, arr: 'podium_f', _g: 'F' },
    { label: '2nd F', colors: [F_DARK, F_MID, F_LIGHT], idx: 1, arr: 'podium_f', _g: 'F' },
    { label: '3rd F', colors: [F_DARK, F_MID, F_LIGHT], idx: 2, arr: 'podium_f', _g: 'F' },
  ].map(d => ({
    label:           d.label,
    data:            years.map(y => stats[y][d.arr][d.idx] ?? null),
    borderColor:     d.colors[d.idx],
    backgroundColor: d.colors[d.idx],
    tension: 0.2, pointRadius: 4,
    borderDash: d.idx === 2 ? [4, 3] : d.idx === 1 ? [2, 2] : [],
    _g: d._g,
  }));

  const datasets = gender === 'all'
    ? overallDatasets
    : genderedDatasets.filter(d => d._g === gender);

  podiumChart = new Chart(document.getElementById('podiumChart'), {
    type: 'line',
    data: { labels: years, datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { position: 'top' },
        tooltip: { callbacks: { label: timeTooltip } },
      },
      scales: {
        y: { ticks: timeTicks(), title: { display: true, text: 'Finishing Time' } },
      },
    },
  });
}

function setupPodiumToggle(stats, years) {
  const btnAll = document.getElementById('podiumGenderAll');
  const btnM   = document.getElementById('podiumGenderM');
  const btnF   = document.getElementById('podiumGenderF');
  let activeGender = 'all';

  function setGender(g) {
    activeGender = g;
    btnAll.className = g === 'all' ? 'active-all' : '';
    btnM.className   = g === 'M'   ? 'active-m'   : '';
    btnF.className   = g === 'F'   ? 'active-f'   : '';
    renderPodium(stats, years, activeGender);
  }

  btnAll.addEventListener('click', () => setGender('all'));
  btnM.addEventListener('click',   () => setGender('M'));
  btnF.addEventListener('click',   () => setGender('F'));
}

// ── Chart: Median / Mean ──────────────────────────────────────────────────────

function renderMedian(stats, years) {
  new Chart(document.getElementById('medianChart'), {
    type: 'line',
    data: {
      labels: years,
      datasets: [
        {
          label: 'Median',
          data: years.map(y => stats[y].median_time),
          borderColor: '#7c3aed', backgroundColor: '#7c3aed22',
          fill: false, tension: 0.3, pointRadius: 5,
        },
        {
          label: 'Mean',
          data: years.map(y => stats[y].mean_time),
          borderColor: '#059669', backgroundColor: '#05966922',
          fill: false, tension: 0.3, pointRadius: 5,
          borderDash: [5, 3],
        },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { position: 'top' },
        tooltip: { callbacks: { label: timeTooltip } },
      },
      scales: {
        y: { ticks: timeTicks(), title: { display: true, text: 'Finishing Time' } },
      },
    },
  });
}

// ── Chart: Age Distribution ───────────────────────────────────────────────────

function renderAgeDist(stats, years) {
  const datasets = years.map((year, i) => ({
    label: String(year),
    data: BRACKETS.map(b => {
      const s  = stats[year];
      const mc = s.age_groups[`M ${b}`]?.count || 0;
      const fc = s.age_groups[`F ${b}`]?.count || 0;
      return s.total ? +((mc + fc) / s.total * 100).toFixed(1) : 0;
    }),
    backgroundColor: YEAR_COLORS[i] + 'bb',
    borderColor:     YEAR_COLORS[i],
    borderWidth: 1,
  }));

  new Chart(document.getElementById('ageDistChart'), {
    type: 'bar',
    data: { labels: BRACKETS, datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'top' } },
      scales: {
        y: { title: { display: true, text: '% of Field' }, ticks: { callback: v => `${v}%` } },
        x: { title: { display: true, text: 'Age Group' } },
      },
    },
  });
}

// ── Chart: Age Group Podium ───────────────────────────────────────────────────

let agChart = null;

function renderAgeGroup(stats, years, bracket, gender = 'all') {
  if (agChart) { agChart.destroy(); agChart = null; }

  const mk = `M ${bracket}`;
  const fk = `F ${bracket}`;

  const allDatasets = [
    { label: `1st M`, data: years.map(y => stats[y].age_groups[mk]?.top3[0] ?? null), borderColor: M_DARK,  backgroundColor: M_DARK,  tension: 0.2, pointRadius: 5, _g: 'M' },
    { label: `2nd M`, data: years.map(y => stats[y].age_groups[mk]?.top3[1] ?? null), borderColor: M_MID,   backgroundColor: M_MID,   tension: 0.2, pointRadius: 4, borderDash: [3,2], _g: 'M' },
    { label: `3rd M`, data: years.map(y => stats[y].age_groups[mk]?.top3[2] ?? null), borderColor: M_LIGHT, backgroundColor: M_LIGHT, tension: 0.2, pointRadius: 4, borderDash: [5,3], _g: 'M' },
    { label: `1st F`, data: years.map(y => stats[y].age_groups[fk]?.top3[0] ?? null), borderColor: F_DARK,  backgroundColor: F_DARK,  tension: 0.2, pointRadius: 5, _g: 'F' },
    { label: `2nd F`, data: years.map(y => stats[y].age_groups[fk]?.top3[1] ?? null), borderColor: F_MID,   backgroundColor: F_MID,   tension: 0.2, pointRadius: 4, borderDash: [3,2], _g: 'F' },
    { label: `3rd F`, data: years.map(y => stats[y].age_groups[fk]?.top3[2] ?? null), borderColor: F_LIGHT, backgroundColor: F_LIGHT, tension: 0.2, pointRadius: 4, borderDash: [5,3], _g: 'F' },
  ];

  const datasets = gender === 'all' ? allDatasets : allDatasets.filter(d => d._g === gender);

  agChart = new Chart(document.getElementById('ageGroupChart'), {
    type: 'line',
    data: {
      labels: years,
      datasets,
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { position: 'top' },
        tooltip: { callbacks: { label: timeTooltip } },
      },
      scales: {
        y: { ticks: timeTicks(), title: { display: true, text: 'Finishing Time' } },
      },
    },
  });
}

function setupAgeGroupSelect(stats, years) {
  const sel    = document.getElementById('agSelect');
  const btnAll = document.getElementById('agGenderAll');
  const btnM   = document.getElementById('agGenderM');
  const btnF   = document.getElementById('agGenderF');

  for (const b of BRACKETS) {
    const opt = document.createElement('option');
    opt.value = opt.textContent = b;
    sel.appendChild(opt);
  }
  // Default to the most-populated age group in the latest year
  const latest = years.at(-1);
  let best = '30-39', bestN = 0;
  for (const b of BRACKETS) {
    const n = (stats[latest].age_groups[`M ${b}`]?.count || 0)
            + (stats[latest].age_groups[`F ${b}`]?.count || 0);
    if (n > bestN) { bestN = n; best = b; }
  }
  sel.value = best;

  let activeGender = 'all';

  function redraw() { renderAgeGroup(stats, years, sel.value, activeGender); }

  function setGender(g) {
    activeGender = g;
    btnAll.className = g === 'all' ? 'active-all' : '';
    btnM.className   = g === 'M'   ? 'active-m'   : '';
    btnF.className   = g === 'F'   ? 'active-f'   : '';
    redraw();
  }

  sel.addEventListener('change', redraw);
  btnAll.addEventListener('click', () => setGender('all'));
  btnM.addEventListener('click',   () => setGender('M'));
  btnF.addEventListener('click',   () => setGender('F'));
}

// ── Weather Data ─────────────────────────────────────────────────────────────

const WEATHER = {
  2016: { date: '2016-05-14', high_f: 81.1, low_f: 54.4, temp_8am: 58.2, precip_in: 0.00, condition: 'Partly Cloudy' },
  2017: { date: '2017-05-20', high_f: 90.6, low_f: 68.2, temp_8am: 71.7, precip_in: 0.03, condition: 'Drizzle'       },
  2018: { date: '2018-05-19', high_f: 79.7, low_f: 66.1, temp_8am: 68.4, precip_in: 0.03, condition: 'Drizzle'       },
  2019: { date: '2019-05-18', high_f: 85.2, low_f: 63.6, temp_8am: 68.1, precip_in: 0.01, condition: 'Drizzle'       },
  2021: { date: '2021-07-31', high_f: 92.0, low_f: 75.2, temp_8am: 76.4, precip_in: 0.00, condition: 'Clear'         },
  2022: { date: '2022-05-14', high_f: 80.3, low_f: 60.3, temp_8am: 62.5, precip_in: 0.00, condition: 'Partly Cloudy' },
  2023: { date: '2023-05-13', high_f: 83.0, low_f: 62.1, temp_8am: 64.1, precip_in: 0.01, condition: 'Drizzle'       },
  2024: { date: '2024-05-18', high_f: 75.7, low_f: 66.1, temp_8am: 68.9, precip_in: 0.61, condition: 'Rain'          },
  2025: { date: '2025-05-17', high_f: 84.6, low_f: 69.3, temp_8am: 70.2, precip_in: 0.22, condition: 'Rain'          },
  2026: { date: '2026-05-16', high_f: 84.7, low_f: 57.9, temp_8am: 60.3, precip_in: 0.00, condition: 'Partly Cloudy' },
};


// ── Chart: Weather ────────────────────────────────────────────────────────────

function renderWeather(years) {
  const labels = years.filter(y => WEATHER[y]);
  const wx     = labels.map(y => WEATHER[y]);

  new Chart(document.getElementById('weatherChart'), {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          // Precipitation bars — drawn first (order 1) so lines sit on top
          label: 'Precip (in)',
          type: 'bar',
          data: wx.map(w => w.precip_in),
          backgroundColor: '#93c5fd88',
          borderColor: '#3b82f6',
          borderWidth: 1,
          yAxisID: 'yPrecip',
          order: 1,
        },
        {
          label: 'High °F',
          type: 'line',
          data: wx.map(w => w.high_f),
          borderColor: '#f97316',
          backgroundColor: '#f9731622',
          pointBackgroundColor: '#f97316',
          pointRadius: 5,
          fill: '+1',
          tension: 0.3,
          yAxisID: 'yTemp',
          order: 0,
        },
        {
          label: 'Low °F',
          type: 'line',
          data: wx.map(w => w.low_f),
          borderColor: '#60a5fa',
          backgroundColor: 'transparent',
          pointBackgroundColor: '#60a5fa',
          pointRadius: 5,
          fill: false,
          tension: 0.3,
          yAxisID: 'yTemp',
          order: 0,
        },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { position: 'top' },
        tooltip: {
          callbacks: {
            afterBody(items) {
              const y = labels[items[0].dataIndex];
              const w = WEATHER[y];
              return w ? [`Condition: ${w.condition}`, `Date: ${w.date}`] : [];
            },
          },
        },
      },
      scales: {
        yTemp: {
          type: 'linear', position: 'left',
          title: { display: true, text: 'Temperature (°F)' },
          min: 40, max: 100,
        },
        yPrecip: {
          type: 'linear', position: 'right',
          title: { display: true, text: 'Precipitation (in)' },
          min: 0, max: 1.2,
          grid: { drawOnChartArea: false },
        },
      },
    },
  });
}

// ── Percentile Calculator ─────────────────────────────────────────────────────

let calcChart = null;

const calcVertLinePlugin = {
  id: 'calcVertLine',
  afterDraw(chart) {
    const opts = chart.options.plugins.calcVertLine;
    if (!opts || opts.xSecs == null) return;
    const { ctx, chartArea: { top, bottom }, scales: { x } } = chart;
    if (chart.data.labels.length < 2) return;
    const binPx    = x.getPixelForValue(1) - x.getPixelForValue(0);
    const leftEdge = x.getPixelForValue(0) - binPx / 2;
    const rightEdge = leftEdge + chart.data.labels.length * binPx;
    const xPx      = Math.max(leftEdge, Math.min(rightEdge, leftEdge + ((opts.xSecs - opts.minT) / opts.binW) * binPx));
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(xPx, top);
    ctx.lineTo(xPx, bottom);
    ctx.strokeStyle = '#1A2B50';
    ctx.lineWidth   = 2.5;
    ctx.setLineDash([5, 4]);
    ctx.stroke();
    // "You" label above the line
    ctx.font         = 'bold 11px sans-serif';
    ctx.fillStyle    = '#1A2B50';
    ctx.textAlign    = 'center';
    ctx.setLineDash([]);
    ctx.fillText('You', xPx, top - 4);
    ctx.restore();
  },
};

function renderCalcChart(pool, userSecs) {
  const wrap = document.getElementById('calcChartWrap');
  wrap.style.display = 'block';
  if (calcChart) { calcChart.destroy(); calcChart = null; }

  const BIN  = 120; // 2-minute buckets
  const minT = Math.floor(Math.min(...pool.map(r => r.chip_time_seconds)) / BIN) * BIN;
  const maxT = Math.ceil( Math.max(...pool.map(r => r.chip_time_seconds)) / BIN) * BIN;
  const nBins = Math.max(1, (maxT - minT) / BIN);

  const counts = new Array(nBins).fill(0);
  for (const r of pool) {
    const idx = Math.min(Math.floor((r.chip_time_seconds - minT) / BIN), nBins - 1);
    if (idx >= 0) counts[idx]++;
  }

  const userBin = userSecs != null ? Math.floor((userSecs - minT) / BIN) : -1;
  const labels  = counts.map((_, i) => fmtTime(minT + i * BIN));

  // Cycle through YEAR_COLORS; dim non-user bins, full opacity on user bin
  const bgColors  = counts.map((_, i) => YEAR_COLORS[i % YEAR_COLORS.length] + (i === userBin ? '' : '88'));
  const bdrColors = counts.map((_, i) => YEAR_COLORS[i % YEAR_COLORS.length]);
  const bdrWidths = counts.map((_, i) => i === userBin ? 2 : 0);

  calcChart = new Chart(document.getElementById('calcChart'), {
    type: 'bar',
    data: {
      labels,
      datasets: [{ data: counts, backgroundColor: bgColors, borderColor: bdrColors, borderWidth: bdrWidths, barPercentage: 1.0, categoryPercentage: 1.0 }],
    },
    plugins: [calcVertLinePlugin],
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        calcVertLine: { xSecs: userSecs, minT, binW: BIN },
        tooltip: {
          callbacks: {
            title: items => {
              const i = items[0].dataIndex;
              return `${fmtTime(minT + i * BIN)} – ${fmtTime(minT + (i + 1) * BIN)}`;
            },
            label: item => `${item.raw} finisher${item.raw !== 1 ? 's' : ''}`,
          },
        },
      },
      scales: {
        x: { ticks: { autoSkip: true, maxTicksLimit: 10 }, title: { display: true, text: 'Finish Time' } },
        y: { title: { display: true, text: 'Finishers' } },
      },
      layout: { padding: { top: 18 } },
    },
  });
}

function setupCalculator(data, years) {
  const yearSel   = document.getElementById('calcYear');
  const ageSel    = document.getElementById('calcAge');
  const timeInput = document.getElementById('calcTime');
  const calcBtn   = document.getElementById('calcBtn');
  const resultDiv = document.getElementById('calcResult');
  const btnAll    = document.getElementById('calcGenderAll');
  const btnM      = document.getElementById('calcGenderM');
  const btnF      = document.getElementById('calcGenderF');

  // Year dropdown — most recent first
  for (const y of [...years].reverse()) {
    const opt = document.createElement('option');
    opt.value = String(y);
    opt.textContent = String(y);
    yearSel.appendChild(opt);
  }

  // Age group dropdown
  const anyOpt = document.createElement('option');
  anyOpt.value = '';
  anyOpt.textContent = 'Any';
  ageSel.appendChild(anyOpt);
  for (const b of BRACKETS) {
    const opt = document.createElement('option');
    opt.value = b;
    opt.textContent = b;
    ageSel.appendChild(opt);
  }

  let calcGender = 'all';

  function setCalcGender(g) {
    calcGender = g;
    btnAll.className = g === 'all' ? 'active-all' : '';
    btnM.className   = g === 'M'   ? 'active-m'   : '';
    btnF.className   = g === 'F'   ? 'active-f'   : '';
  }
  btnAll.addEventListener('click', () => setCalcGender('all'));
  btnM.addEventListener('click',   () => setCalcGender('M'));
  btnF.addEventListener('click',   () => setCalcGender('F'));

  function parseTimeSecs(raw) {
    const parts = raw.trim().split(':').map(Number);
    if (parts.some(isNaN)) return null;
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    return null;
  }

  function showResult(big, detail) {
    resultDiv.textContent = '';
    const bigEl = document.createElement('div');
    bigEl.className = 'result-big';
    bigEl.textContent = big;
    const detailEl = document.createElement('div');
    detailEl.className = 'result-detail';
    detailEl.textContent = detail;
    resultDiv.append(bigEl, detailEl);
  }

  function showError(msg) {
    resultDiv.textContent = '';
    const el = document.createElement('div');
    el.className = 'result-error';
    el.textContent = msg;
    resultDiv.appendChild(el);
  }

  calcBtn.addEventListener('click', () => {
    const year    = Number(yearSel.value);
    const bracket = ageSel.value;
    const userSecs = parseTimeSecs(timeInput.value);

    if (!userSecs || userSecs <= 0) {
      showError('Please enter a valid finish time (e.g. 28:45).');
      return;
    }

    let pool = (data.results[String(year)] || []).filter(r => r.chip_time_seconds > 0);
    if (calcGender !== 'all') pool = pool.filter(r => r.gender === calcGender);
    if (bracket)              pool = pool.filter(r => r.age_bracket === bracket);

    if (!pool.length) {
      showError('No data available for that combination.');
      return;
    }

    const faster  = pool.filter(r => r.chip_time_seconds < userSecs).length;
    const place   = faster + 1;
    const total   = pool.length;
    const topPct  = Math.ceil(place / total * 100);

    const gLabel  = calcGender === 'all' ? 'all' : calcGender === 'M' ? 'male' : 'female';
    const grpDesc = bracket ? `${gLabel} ${bracket}` : `${gLabel}`;

    showResult(
      `Top ${topPct}%`,
      `Place ${place.toLocaleString()} of ${total.toLocaleString()} ${grpDesc} finishers in ${year}`
    );
    renderCalcChart(pool, userSecs);
  });

  // Allow pressing Enter in the time field
  timeInput.addEventListener('keydown', e => { if (e.key === 'Enter') calcBtn.click(); });
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────

Chart.defaults.font.family = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
Chart.defaults.font.size   = 12;

async function init() {
  try {
    const resp = await fetch('data.json');
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();

    document.getElementById('loading').style.display  = 'none';
    document.getElementById('content').style.display  = 'block';

    const stats = processData(data);
    const years = data.years;

    renderCards(stats, years, data);
    setupAgeGroupSelect(stats, years);
    setupPodiumToggle(stats, years);
    setupCalculator(data, years);

    renderWeather(years);
    renderFinishers(stats, years);
    renderGender(stats, years);
    renderPodium(stats, years);
    renderMedian(stats, years);
    renderAgeDist(stats, years);
    renderAgeGroup(stats, years, document.getElementById('agSelect').value);

  } catch (err) {
    console.error(err);
    document.getElementById('loading').style.display   = 'none';
    document.getElementById('error-msg').style.display = 'block';
  }
}

init();
