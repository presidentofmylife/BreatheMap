// ===== App Scripts for BreatheMap =====

(function () {
  const MAPTILER_KEY = "Fa0eCZfHtPXtTP8CW5zo";

  /* ======================== POLLUTANT MAP ======================== */
  const aqMap = new maplibregl.Map({
    container: 'pollutant-map',
    style: `https://api.maptiler.com/maps/streets/style.json?key=${MAPTILER_KEY}`,
    center: [0, 20],
    zoom: 1.5,
    attributionControl: true
  });
  aqMap.addControl(new maplibregl.NavigationControl(), 'top-right');

  /* ---- 1) DATASETS (ISO3 -> value) ---- */
  const datasets = {
    pm10: { ITA: 42, FRA: 35, ESP: 28, DEU: 22, POL: 30, GBR: 18, GRC: 33, PRT: 20, ROU: 31, SWE: 12 },
    no2: { ITA: 23, FRA: 24, ESP: 20, DEU: 25, POL: 19, GBR: 24, GRC: 21, PRT: 15, ROU: 17, SWE: 10 },
    o3: { ITA: 110, FRA: 95, ESP: 105, DEU: 85, POL: 90, GBR: 80, GRC: 120, PRT: 100, ROU: 98, SWE: 75 }
  };

  /* ---- 2) THRESHOLDS (for fixed mode) ---- */
  const fixedThresholds = {
    pm10: [10, 20, 30, 40, 50],
    no2: [10, 20, 30, 40, 50],
    o3: [60, 90, 120, 150, 180]
  };
  const metricLabels = {
    pm10: 'PM10 (µg/m³)',
    no2: 'NO₂ (µg/m³)',
    o3: 'O₃ MDA8 (µg/m³)'
  };
  const palette = ['#f1eef6', '#bdc9e1', '#74a9cf', '#2b8cbe', '#045a8d', '#023858'];
  const noDataColor = '#e2e2e2';

  function buildFillColorExpression(thresholds) {
    const v = ['coalesce', ['feature-state', 'val'], -9999];
    const n = Math.min(thresholds.length, palette.length - 1);
    const step = ['step', v, palette[0]];
    for (let i = 0; i < n; i++) step.push(thresholds[i], palette[i + 1]);
    return ['case', ['==', v, -9999], noDataColor, step];
  }

  function quantilesFromData(metric, classes = 6) {
    const values = Object.values(datasets[metric] || {}).filter(x => typeof x === 'number').sort((a, b) => a - b);
    if (values.length < 2) return fixedThresholds[metric];
    const thresholds = [];
    for (let i = 1; i < classes; i++) thresholds.push(quantile(values, i / classes));
    return Array.from(new Set(thresholds.map(x => +x.toFixed(2))));
  }

  function quantile(arr, p) {
    const idx = (arr.length - 1) * p;
    const lo = Math.floor(idx), hi = Math.ceil(idx);
    if (lo === hi) return arr[lo];
    return arr[lo] + (arr[hi] - arr[lo]) * (idx - lo);
  }

  function updateLegend(metric, thresholds) {
    const el = document.getElementById('aq-legend');
    const unitLabel = metricLabels[metric] || metric;
    const fmt = v => (Math.abs(v) >= 100 ? v.toFixed(0) : v.toString());
    const parts = [];
    parts.push(`<div style="margin-bottom:4px; font-weight:600; color:#2a2a2a;">${unitLabel}</div>`);
    parts.push(`<div class="row"><span class="swatch" style="background:${palette[0]}"></span><span>&lt; ${fmt(thresholds[0])}</span></div>`);
    for (let i = 0; i < thresholds.length - 1; i++)
      parts.push(`<div class="row"><span class="swatch" style="background:${palette[i + 1]}"></span><span>${fmt(thresholds[i])}–${fmt(thresholds[i + 1])}</span></div>`);
    parts.push(`<div class="row"><span class="swatch" style="background:${palette[palette.length - 1]}"></span><span>≥ ${fmt(thresholds[thresholds.length - 1])}</span></div>`);
    parts.push(`<div class="row"><span class="swatch" style="background:${noDataColor}"></span><span>No data</span></div>`);
    el.innerHTML = parts.join('');
  }

  function applyDataset(metric) {
    const scaleMode = document.getElementById('aq-scale').value;
    const thresholds = (scaleMode === 'quantile') ? quantilesFromData(metric, 6) : fixedThresholds[metric];

    // Update paint property
    aqMap.setPaintProperty('country-fill', 'fill-color', buildFillColorExpression(thresholds));
    updateLegend(metric, thresholds);

    // Set feature states
    if (!window._aqCountriesFeatures) return;
    const data = datasets[metric] || {};

    for (const f of window._aqCountriesFeatures) {
      const iso3 = f.properties['ISO3166-1-Alpha-3'];
      const val = data[iso3];
      aqMap.setFeatureState(
        { source: 'countries', id: iso3 },
        { val: (typeof val === 'number' ? val : null) }
      );
    }
  }

  aqMap.on('load', async () => {
    // Countries GeoJSON
    const url = 'https://raw.githubusercontent.com/datasets/geo-countries/master/data/countries.geojson';
    const geo = await (await fetch(url)).json();

    // Store features for later use
    window._aqCountriesFeatures = geo.features;

    // Add source with promoteId to use ISO3 as feature ID
    aqMap.addSource('countries', {
      type: 'geojson',
      data: geo,
      promoteId: 'ISO3166-1-Alpha-3'
    });

    aqMap.addLayer({
      id: 'country-fill',
      type: 'fill',
      source: 'countries',
      paint: {
        'fill-color': buildFillColorExpression(fixedThresholds.pm10),
        'fill-opacity': 0.8
      }
    });

    aqMap.addLayer({
      id: 'country-outline',
      type: 'line',
      source: 'countries',
      paint: { 'line-color': '#666', 'line-width': 0.6 }
    });

    // Click popup
    const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: true });
    aqMap.on('click', 'country-fill', (e) => {
      const f = e.features[0];
      const iso3 = f.properties['ISO3166-1-Alpha-3'];
      const name = f.properties.name || f.properties.ADMIN || 'Country';
      const metric = document.getElementById('aq-metric').value;
      const data = datasets[metric] || {};
      const v = data[iso3];
      popup.setLngLat(e.lngLat)
        .setHTML(`<b>${name}</b><br>${metricLabels[metric] || metric}: ${v != null ? v : 'No data'}`)
        .addTo(aqMap);
    });
    aqMap.on('mouseenter', 'country-fill', () => aqMap.getCanvas().style.cursor = 'pointer');
    aqMap.on('mouseleave', 'country-fill', () => aqMap.getCanvas().style.cursor = '');

    // Apply initial dataset
    applyDataset('pm10');
  });

  /* ======================== ANALYTICS / CHARTS ======================== */
  function bucketLabels(thresholds) {
    const fmt = v => (Math.abs(v) >= 100 ? v.toFixed(0) : v.toString());
    const labels = [`< ${fmt(thresholds[0])}`];
    for (let i = 0; i < thresholds.length - 1; i++) {
      labels.push(`${fmt(thresholds[i])} – ${fmt(thresholds[i + 1])}`);
    }
    labels.push(`≥ ${fmt(thresholds[thresholds.length - 1])}`);
    return labels;
  }

  function percentageDistribution(values, thresholds) {
    const bins = new Array(thresholds.length + 1).fill(0);
    for (const x of values) {
      let i = 0;
      while (i < thresholds.length && x >= thresholds[i]) i++;
      bins[i]++;
    }
    const total = values.length || 1;
    return bins.map(c => +(c * 100 / total).toFixed(1));
  }

  function makeDoughnutChart(canvasId, labels, data, colors) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;
    new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{ data, backgroundColor: colors }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom' },
          tooltip: {
            callbacks: {
              label: (ctx) => `${ctx.label}: ${ctx.parsed}%`
            }
          }
        },
        animation: { duration: 500 }
      }
    });
  }

  function renderAnalytics() {
    const bandColors = ['#f1eef6', '#bdc9e1', '#74a9cf', '#2b8cbe', '#045a8d', '#023858'];

    // PM10
    const pm10Vals = Object.values({ ITA: 42, FRA: 35, ESP: 28, DEU: 22, POL: 30, GBR: 18, GRC: 33, PRT: 20, ROU: 31, SWE: 12 });
    const pm10Thr = [10, 20, 30, 40, 50];
    makeDoughnutChart('chart-pm10', bucketLabels(pm10Thr), percentageDistribution(pm10Vals, pm10Thr), bandColors);

    // NO2
    const no2Vals = Object.values({ ITA: 23, FRA: 24, ESP: 20, DEU: 25, POL: 19, GBR: 24, GRC: 21, PRT: 15, ROU: 17, SWE: 10 });
    const no2Thr = [10, 20, 30, 40, 50];
    makeDoughnutChart('chart-no2', bucketLabels(no2Thr), percentageDistribution(no2Vals, no2Thr), bandColors);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', renderAnalytics);
  } else {
    renderAnalytics();
  }

  // UI events
  document.getElementById('aq-metric').addEventListener('change', (e) => applyDataset(e.target.value));
  document.getElementById('aq-scale').addEventListener('change', () => applyDataset(document.getElementById('aq-metric').value));
  document.getElementById('aq-reset').addEventListener('click', () => aqMap.flyTo({ center: [0, 20], zoom: 1.5 }));

  /* ======================== TIME SLIDER ======================== */
  const timeState = {
    level: 'year',     // 'year', 'month', or 'day'
    year: 2024,
    month: null,
    day: null
  };

  const years = [2020, 2021, 2022, 2023, 2024];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function getDaysInMonth(year, month) {
    return new Date(year, month + 1, 0).getDate();
  }

  function updateTimeSlider() {
    const slider = document.getElementById('time-slider');
    const display = document.getElementById('time-display');
    const breadcrumb = document.getElementById('time-breadcrumb');
    const labels = document.getElementById('time-labels');
    const drillBtn = document.getElementById('time-drill');
    const backBtn = document.getElementById('time-back');

    if (timeState.level === 'year') {
      slider.min = 0;
      slider.max = years.length - 1;
      slider.value = years.indexOf(timeState.year);
      display.textContent = timeState.year;
      breadcrumb.innerHTML = '<span class="active">Year</span>';
      labels.innerHTML = years.map(y => `<span>${y}</span>`).join('');
      drillBtn.textContent = 'Month →';
      drillBtn.disabled = false;
      backBtn.disabled = true;
      backBtn.style.opacity = '0.5';
    }
    else if (timeState.level === 'month') {
      slider.min = 0;
      slider.max = months.length - 1;
      slider.value = timeState.month || 0;
      display.textContent = `${months[timeState.month]} ${timeState.year}`;
      breadcrumb.innerHTML = `<span id="bc-year">${timeState.year}</span> › <span class="active">Month</span>`;
      labels.innerHTML = months.map(m => `<span>${m}</span>`).join('');
      drillBtn.textContent = 'Day →';
      drillBtn.disabled = false;
      backBtn.disabled = false;
      backBtn.style.opacity = '1';

      document.getElementById('bc-year').addEventListener('click', () => {
        timeState.level = 'year';
        timeState.month = null;
        timeState.day = null;
        updateTimeSlider();
      });
    }
    else if (timeState.level === 'day') {
      const daysInMonth = getDaysInMonth(timeState.year, timeState.month);
      slider.min = 1;
      slider.max = daysInMonth;
      slider.value = timeState.day || 1;
      display.textContent = `${months[timeState.month]} ${timeState.day}, ${timeState.year}`;
      breadcrumb.innerHTML = `<span id="bc-year">${timeState.year}</span> › <span id="bc-month">${months[timeState.month]}</span> › <span class="active">Day</span>`;

      // Show day labels (simplified - show first, middle, last)
      const dayLabels = [];
      const step = Math.max(1, Math.floor(daysInMonth / 4));
      for (let i = 1; i <= daysInMonth; i += step) {
        dayLabels.push(i);
      }
      if (dayLabels[dayLabels.length - 1] !== daysInMonth) {
        dayLabels.push(daysInMonth);
      }
      labels.innerHTML = dayLabels.map(d => `<span>${d}</span>`).join('');

      drillBtn.textContent = 'Max Detail';
      drillBtn.disabled = true;
      drillBtn.style.opacity = '0.5';
      backBtn.disabled = false;
      backBtn.style.opacity = '1';

      document.getElementById('bc-year').addEventListener('click', () => {
        timeState.level = 'year';
        timeState.month = null;
        timeState.day = null;
        updateTimeSlider();
      });

      document.getElementById('bc-month').addEventListener('click', () => {
        timeState.level = 'month';
        timeState.day = null;
        updateTimeSlider();
      });
    }
  }

  document.getElementById('time-slider').addEventListener('input', (e) => {
    const val = parseInt(e.target.value);
    if (timeState.level === 'year') {
      timeState.year = years[val];
      document.getElementById('time-display').textContent = timeState.year;
    } else if (timeState.level === 'month') {
      timeState.month = val;
      document.getElementById('time-display').textContent = `${months[val]} ${timeState.year}`;
    } else if (timeState.level === 'day') {
      timeState.day = val;
      document.getElementById('time-display').textContent = `${months[timeState.month]} ${val}, ${timeState.year}`;
    }
  });

  document.getElementById('time-drill').addEventListener('click', () => {
    if (timeState.level === 'year') {
      timeState.level = 'month';
      timeState.month = 0;
    } else if (timeState.level === 'month') {
      timeState.level = 'day';
      timeState.day = 1;
    }
    updateTimeSlider();
  });

  document.getElementById('time-back').addEventListener('click', () => {
    if (timeState.level === 'day') {
      timeState.level = 'month';
      timeState.day = null;
    } else if (timeState.level === 'month') {
      timeState.level = 'year';
      timeState.month = null;
    }
    updateTimeSlider();
  });

  // Initialize
  updateTimeSlider();
})();

// ===== Charts (separate DOMContentLoaded block retained) =====
document.addEventListener("DOMContentLoaded", function () {

  // --- CONFIGURATION: Colors & Styles ---
  const colors = {
    pm25: 'rgba(255, 99, 132, 0.8)',  // Red/Pink
    pm10: 'rgba(54, 162, 235, 0.8)',  // Blue
    pm25_fill: 'rgba(255, 99, 132, 0.2)',
    pm10_fill: 'rgba(54, 162, 235, 0.2)',
    aqi: ['#50f000', '#ffff00', '#ff9000', '#ff0000', '#990000'] // Green to Dark Red
  };

  const commonOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'top', labels: { usePointStyle: true, font: { size: 11 } } },
      tooltip: {
        backgroundColor: 'rgba(255, 255, 255, 0.95)',
        titleColor: '#333',
        bodyColor: '#666',
        borderColor: '#ddd',
        borderWidth: 1
      }
    },
    scales: {
      y: { grid: { color: 'rgba(0,0,0,0.05)' } },
      x: { grid: { display: false } }
    },
    animation: {
      duration: 1500,
      easing: 'easeOutQuart'
    }
  };

  // --- CHART 1: Country Comparison (Bar Chart) ---
  new Chart(document.getElementById('chart-country-comparison'), {
    type: 'bar',
    data: {
      labels: ['Spain', 'Italy', 'Germany', 'Poland', 'Sweden', 'UK', 'Czech'],
      datasets: [
        {
          label: 'PM2.5 Mean',
          data: [12.5, 18.2, 14.1, 22.5, 6.8, 10.5, 19.1],
          backgroundColor: colors.pm25,
          borderRadius: 4
        },
        {
          label: 'PM10 Mean',
          data: [25.1, 32.5, 24.8, 38.2, 12.5, 18.2, 31.5],
          backgroundColor: colors.pm10,
          borderRadius: 4
        }
      ]
    },
    options: commonOptions
  });

  // --- CHART 2: WHO Exceedance (Horizontal Bar) ---
  new Chart(document.getElementById('chart-who-exceedance'), {
    type: 'bar',
    indexAxis: 'y',
    data: {
      labels: ['Poland', 'Italy', 'Czech', 'Spain', 'Germany', 'UK', 'Sweden'],
      datasets: [{
        label: '% Days > WHO Guideline (PM2.5)',
        data: [45, 38, 35, 15, 12, 5, 1],
        backgroundColor: (ctx) => {
          const val = ctx.raw;
          if (val > 30) return 'rgba(255, 0, 0, 0.7)';
          if (val > 10) return 'rgba(255, 165, 0, 0.7)';
          return 'rgba(75, 192, 192, 0.7)';
        },
        borderRadius: 4
      }]
    },
    options: {
      ...commonOptions,
      scales: { x: { max: 100, title: { display: true, text: 'Percentage of Days' } } }
    }
  });

  // --- CHART 3: Seasonal Patterns (Line Chart) ---
  new Chart(document.getElementById('chart-seasonal'), {
    type: 'line',
    data: {
      labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
      datasets: [
        {
          label: 'Poland (PM10)',
          data: [55, 52, 45, 35, 25, 20, 18, 20, 30, 42, 50, 58],
          borderColor: '#FF6384',
          tension: 0.4,
          fill: false
        },
        {
          label: 'Italy (PM10)',
          data: [45, 42, 38, 30, 25, 28, 32, 30, 28, 35, 40, 44],
          borderColor: '#36A2EB',
          tension: 0.4,
          fill: false
        },
        {
          label: 'Sweden (PM10)',
          data: [15, 14, 12, 10, 8, 6, 5, 6, 8, 10, 12, 14],
          borderColor: '#4BC0C0',
          tension: 0.4,
          fill: false
        }
      ]
    },
    options: commonOptions
  });

  // --- CHART 4 & 5: AQI Distribution (Doughnuts) ---
  const aqiLabels = ['Good', 'Fair', 'Moderate', 'Poor', 'Very Poor'];
  const aqiColors = ['#00e400', '#ffff00', '#ff7e00', '#ff0000', '#99004c'];

  new Chart(document.getElementById('chart-aqi-winter'), {
    type: 'doughnut',
    data: {
      labels: aqiLabels,
      datasets: [{
        data: [20, 30, 30, 15, 5],
        backgroundColor: aqiColors,
        borderWidth: 0
      }]
    },
    options: { ...commonOptions, cutout: '60%' }
  });

  new Chart(document.getElementById('chart-aqi-summer'), {
    type: 'doughnut',
    data: {
      labels: aqiLabels,
      datasets: [{
        data: [60, 25, 10, 5, 0],
        backgroundColor: aqiColors,
        borderWidth: 0
      }]
    },
    options: { ...commonOptions, cutout: '60%' }
  });

  // --- CHART 6: PM2.5/PM10 Ratio ---
  new Chart(document.getElementById('chart-ratio'), {
    type: 'bar',
    data: {
      labels: ['UK', 'DE', 'IT', 'PL'],
      datasets: [{
        label: 'Ratio',
        data: [0.65, 0.58, 0.52, 0.75],
        backgroundColor: 'rgba(153, 102, 255, 0.7)',
        borderRadius: 4
      }]
    },
    options: {
      ...commonOptions,
      scales: {
        y: {
          min: 0, max: 1,
          title: { display: true, text: 'Ratio (PM2.5 / PM10)' }
        }
      }
    }
  });
});
