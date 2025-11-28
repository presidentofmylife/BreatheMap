// ===== App Scripts for BreatheMap =====

(function () {
  const MAPTILER_KEY = "Fa0eCZfHtPXtTP8CW5zo";

  /* ----------------------------------------------------------------
     1. CONFIGURATION & MAPPING
     ---------------------------------------------------------------- */
  
  // Map API Country Names to GeoJSON ISO3 Codes
  const countryMapping = {
    "CZECH": "CZE",
    "CZECH REPUBLIC": "CZE",
    "GERMANY": "DEU",
    "ITALY": "ITA",
    "POLAND": "POL",
    "SPAIN": "ESP",
    "SWEDEN": "SWE",
    "UK": "GBR",
    "UNITED KINGDOM": "GBR",
    "FRANCE": "FRA"
  };

  // Storage for the currently loaded data
  // Structure: { pm10: {ISO3: val}, pm25: {ISO3: val} }
  const datasets = {
    pm10: {},
    pm25: {}, // Note: using 'pm25' (no dot) for easier JS access
    o3: {}
  };

  // Coloring Thresholds
  const fixedThresholds = {
    pm10: [10, 20, 30, 40, 50],
    pm25: [5, 10, 15, 20, 25],
    o3: [60, 90, 120, 150, 180]
  };

  const metricLabels = {
    pm10: 'PM10 (µg/m³)',
    pm25: 'PM2.5 (µg/m³)',
    o3: 'O₃ (µg/m³)'
  };

  const palette = ['#f1eef6', '#bdc9e1', '#74a9cf', '#2b8cbe', '#045a8d', '#023858'];
  const noDataColor = '#e2e2e2';

  /* ----------------------------------------------------------------
     2. MAP INITIALIZATION
     ---------------------------------------------------------------- */
  const aqMap = new maplibregl.Map({
    container: 'pollutant-map',
    style: `https://api.maptiler.com/maps/streets/style.json?key=${MAPTILER_KEY}`,
    center: [10, 50], // Centered roughly on Europe
    zoom: 3.5,
    attributionControl: true
  });
  aqMap.addControl(new maplibregl.NavigationControl(), 'top-right');

  /* ----------------------------------------------------------------
     3. DATA PROCESSING LOGIC
     ---------------------------------------------------------------- */
  
  /**
   * Transforms API response: {"GERMANY": [{pollutant: "PM10", value: 39}, ...]} 
   * Into Map format: datasets.pm10["DEU"] = 39
   */
  function processApiData(rawData) {
    // Reset local datasets
    datasets.pm10 = {};
    datasets.pm25 = {};
    datasets.o3 = {};

    // 1. Handle case where data is wrapped in a date key (e.g. {"2013-01-01": {...}})
    let countryData = rawData;
    const keys = Object.keys(rawData);
    if(keys.length > 0 && keys[0].match(/^\d{4}-\d{2}-\d{2}$/)) {
        countryData = rawData[keys[0]]; 
    }

    // 2. Iterate over Countries (e.g., "CZECH", "GERMANY")
    for (const [countryName, pollutants] of Object.entries(countryData)) {
        const iso3 = countryMapping[countryName.toUpperCase()];
        
        if (iso3 && Array.isArray(pollutants)) {
            pollutants.forEach(item => {
                // Normalize pollutant name (API "PM2.5" -> App "pm25")
                // remove dots, lowercase
                const type = item.pollutant.toLowerCase().replace('.', ''); 

                if (datasets[type] !== undefined) {
                    datasets[type][iso3] = item.value;
                }
            });
        }
    }
    console.log("Processed Datasets:", datasets);
  }

  /* ----------------------------------------------------------------
     4. MAP COLORING & INTERACTION
     ---------------------------------------------------------------- */

  function buildFillColorExpression(thresholds) {
    const v = ['coalesce', ['feature-state', 'val'], -9999];
    const step = ['step', v, palette[0]];
    for (let i = 0; i < thresholds.length; i++) {
        if(i + 1 < palette.length) {
            step.push(thresholds[i], palette[i + 1]);
        }
    }
    return ['case', ['==', v, -9999], noDataColor, step];
  }

  function updateLegend(metric, thresholds) {
    const el = document.getElementById('aq-legend');
    if (!el) return;
    const unitLabel = metricLabels[metric] || metric;
    const fmt = v => (Math.abs(v) >= 100 ? v.toFixed(0) : v.toString());
    const parts = [];
    parts.push(`<div style="margin-bottom:4px; font-weight:600; color:#2a2a2a;">${unitLabel}</div>`);
    parts.push(`<div class="row"><span class="swatch" style="background:${palette[0]}"></span><span>&lt; ${fmt(thresholds[0])}</span></div>`);
    for (let i = 0; i < thresholds.length - 1; i++) {
       if(i + 1 < palette.length) {
          parts.push(`<div class="row"><span class="swatch" style="background:${palette[i + 1]}"></span><span>${fmt(thresholds[i])}–${fmt(thresholds[i + 1])}</span></div>`);
       }
    }
    parts.push(`<div class="row"><span class="swatch" style="background:${palette[palette.length - 1]}"></span><span>≥ ${fmt(thresholds[thresholds.length - 1])}</span></div>`);
    parts.push(`<div class="row"><span class="swatch" style="background:${noDataColor}"></span><span>No data</span></div>`);
    el.innerHTML = parts.join('');
  }

  function applyDataset(metric) {
    // 1. Normalize metric key (handle dropdown values like "pm2.5" -> "pm25")
    const cleanMetric = metric.replace('.', '');
    
    // 2. Get thresholds
    const thresholds = fixedThresholds[cleanMetric] || fixedThresholds.pm10;

    // 3. Update Map Paint Property
    if (aqMap.getLayer('country-fill')) {
      aqMap.setPaintProperty('country-fill', 'fill-color', buildFillColorExpression(thresholds));
    }
    updateLegend(cleanMetric, thresholds);

    // 4. Update Feature States
    if (!window._aqCountriesFeatures) return;
    
    const currentData = datasets[cleanMetric] || {};

    for (const f of window._aqCountriesFeatures) {
      const iso3 = f.properties['ISO3166-1-Alpha-3'];
      const val = currentData[iso3];

      aqMap.setFeatureState(
        { source: 'countries', id: iso3 },
        { val: (typeof val === 'number' ? val : null) }
      );
    }
  }

  /* ----------------------------------------------------------------
     5. MAP LOAD EVENT
     ---------------------------------------------------------------- */
  aqMap.on('load', async () => {
    // 1. Fetch Countries GeoJSON
    const url = 'https://raw.githubusercontent.com/datasets/geo-countries/master/data/countries.geojson';
    const geo = await (await fetch(url)).json();

    window._aqCountriesFeatures = geo.features;

    aqMap.addSource('countries', {
      type: 'geojson',
      data: geo,
      promoteId: 'ISO3166-1-Alpha-3' // Important: Uses ISO3 as ID
    });

    aqMap.addLayer({
      id: 'country-fill',
      type: 'fill',
      source: 'countries',
      paint: {
        'fill-color': noDataColor,
        'fill-opacity': 0.8
      }
    });

    aqMap.addLayer({
      id: 'country-outline',
      type: 'line',
      source: 'countries',
      paint: { 'line-color': '#666', 'line-width': 0.6 }
    });

    // 2. Popup Interaction
    const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: true });
    aqMap.on('click', 'country-fill', (e) => {
      const f = e.features[0];
      const iso3 = f.properties['ISO3166-1-Alpha-3'];
      const name = f.properties.name || f.properties.ADMIN || 'Country';
      
      const rawMetric = document.getElementById('aq-metric').value;
      const cleanMetric = rawMetric.replace('.', '');
      
      const val = (datasets[cleanMetric] && datasets[cleanMetric][iso3]);

      popup.setLngLat(e.lngLat)
        .setHTML(`<b>${name}</b><br>${metricLabels[cleanMetric] || cleanMetric}: ${val != null ? val.toFixed(1) : 'No data'}`)
        .addTo(aqMap);
    });
    
    aqMap.on('mouseenter', 'country-fill', () => aqMap.getCanvas().style.cursor = 'pointer');
    aqMap.on('mouseleave', 'country-fill', () => aqMap.getCanvas().style.cursor = '');

    // 3. Initial Load (triggers fetch for default slider date)
    fetchDataForDate(); 
  });


  /* ----------------------------------------------------------------
     6. TIME SLIDER LOGIC
     ---------------------------------------------------------------- */
  const timeState = {
    level: 'year',
    year: 2024,
    month: null,
    day: null
  };

  const years = [2013, 2014, 2015, 2016, 2017, 2018, 2019, 2021, 2022, 2023, 2024, 2025];
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

    if (!slider) return;

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
      breadcrumb.innerHTML = `<span id="bc-year" style="cursor:pointer; text-decoration:underline;">${timeState.year}</span> › <span class="active">Month</span>`;
      labels.innerHTML = months.map(m => `<span>${m}</span>`).join('');
      drillBtn.textContent = 'Day →';
      drillBtn.disabled = false;
      backBtn.disabled = false;
      backBtn.style.opacity = '1';

      const bcYear = document.getElementById('bc-year');
      if(bcYear) bcYear.addEventListener('click', () => {
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
      breadcrumb.innerHTML = `<span id="bc-year" style="cursor:pointer; text-decoration:underline;">${timeState.year}</span> › <span id="bc-month" style="cursor:pointer; text-decoration:underline;">${months[timeState.month]}</span> › <span class="active">Day</span>`;

      // Simplified day labels
      const dayLabels = [];
      const step = Math.max(1, Math.floor(daysInMonth / 4));
      for (let i = 1; i <= daysInMonth; i += step) dayLabels.push(i);
      if (dayLabels[dayLabels.length - 1] !== daysInMonth) dayLabels.push(daysInMonth);
      labels.innerHTML = dayLabels.map(d => `<span>${d}</span>`).join('');

      drillBtn.textContent = 'Max Detail';
      drillBtn.disabled = true;
      drillBtn.style.opacity = '0.5';
      backBtn.disabled = false;
      backBtn.style.opacity = '1';

      const bcYear = document.getElementById('bc-year');
      if(bcYear) bcYear.addEventListener('click', () => {
        timeState.level = 'year';
        timeState.month = null;
        timeState.day = null;
        updateTimeSlider();
      });

      const bcMonth = document.getElementById('bc-month');
      if(bcMonth) bcMonth.addEventListener('click', () => {
        timeState.level = 'month';
        timeState.day = null;
        updateTimeSlider();
      });
    }
  }

  /* ----------------------------------------------------------------
     7. DATA FETCHING
     ---------------------------------------------------------------- */
  async function fetchDataForDate() {
      // Construct Date: YYYY-MM-DD
      const year = timeState.year;
      // Default to Jan 1st if month/day are null (Year view)
      const month = (timeState.month !== null) ? timeState.month + 1 : 1; 
      const day = (timeState.day !== null) ? timeState.day : 1;

      const mm = String(month).padStart(2, '0');
      const dd = String(day).padStart(2, '0');
      const dateStr = `${year}-${mm}-${dd}`;

      console.log(`Fetching data for date: ${dateStr}`);
      
      const btn = document.getElementById('btn-update-date');
      if(btn) {
          btn.textContent = "Loading...";
          btn.disabled = true;
      }

      try {
          // Call your Flask endpoint
          const response = await fetch(`/get_values?date=${dateStr}`);
          
          if (!response.ok) {
              throw new Error(`Server returned ${response.status}`);
          }

          const newData = await response.json();
          // console.log("Raw Data received:", newData);

          // 1. Process Data (Map Names -> ISO3, Flatten Structure)
          processApiData(newData);

          // 2. Apply to Map
          const currentMetric = document.getElementById('aq-metric').value;
          applyDataset(currentMetric);
          
      } catch (error) {
          console.error("Failed to fetch data:", error);
          // Optional: alert("Could not load data for this date.");
      } finally {
          if(btn) {
              btn.textContent = "Update Map";
              btn.disabled = false;
          }
      }
  }


  /* ----------------------------------------------------------------
     8. UI EVENT LISTENERS
     ---------------------------------------------------------------- */
  
  // Metric Dropdown Change
  const metricSelect = document.getElementById('aq-metric');
  if(metricSelect) {
      metricSelect.addEventListener('change', (e) => applyDataset(e.target.value));
  }
  
  // Reset View Button
  const resetBtn = document.getElementById('aq-reset');
  if(resetBtn) {
      resetBtn.addEventListener('click', () => aqMap.flyTo({ center: [10, 50], zoom: 3.5 }));
  }

  // Update Map Button (if you added it)
  const updateDateBtn = document.getElementById('btn-update-date');
  if (updateDateBtn) {
      updateDateBtn.addEventListener('click', fetchDataForDate);
  }

  // Slider Input - Automatically fetch data on release
  const sliderEl = document.getElementById('time-slider');
  if(sliderEl) {
      // Use 'change' instead of 'input' so it only fetches when you let go of the handle
      sliderEl.addEventListener('change', (e) => {
        const val = parseInt(e.target.value);
        
        // 1. Update the internal state based on slider position
        if (timeState.level === 'year') {
          timeState.year = years[val];
          document.getElementById('time-display').textContent = timeState.year;
        } 
        else if (timeState.level === 'month') {
          timeState.month = val;
          document.getElementById('time-display').textContent = `${months[val]} ${timeState.year}`;
        } 
        else if (timeState.level === 'day') {
          timeState.day = val;
          document.getElementById('time-display').textContent = `${months[timeState.month]} ${val}, ${timeState.year}`;
        }

        // 2. TRIGGER THE FETCH AUTOMATICALLY
        fetchDataForDate(); 
      });

      // Optional: Keep 'input' just for updating text labels smoothly while dragging (no fetch)
      sliderEl.addEventListener('input', (e) => {
        const val = parseInt(e.target.value);
        if (timeState.level === 'year') {
           document.getElementById('time-display').textContent = years[val];
        } else if (timeState.level === 'month') {
           document.getElementById('time-display').textContent = `${months[val]} ${timeState.year}`;
        } else if (timeState.level === 'day') {
           document.getElementById('time-display').textContent = `${months[timeState.month]} ${val}, ${timeState.year}`;
        }
      });
  }

  // Slider Drill Down
  const drillEl = document.getElementById('time-drill');
  if(drillEl) {
      drillEl.addEventListener('click', () => {
        if (timeState.level === 'year') {
          timeState.level = 'month';
          timeState.month = 0;
        } else if (timeState.level === 'month') {
          timeState.level = 'day';
          timeState.day = 1;
        }
        updateTimeSlider();
      });
  }

  // Slider Back
  const backEl = document.getElementById('time-back');
  if(backEl) {
      backEl.addEventListener('click', () => {
        if (timeState.level === 'day') {
          timeState.level = 'month';
          timeState.day = null;
        } else if (timeState.level === 'month') {
          timeState.level = 'year';
          timeState.month = null;
        }
        updateTimeSlider();
      });
  }

  // Initialize Slider UI
  updateTimeSlider();
})();

/* ==================================================================
   ANALYTICS CHARTS
   ================================================================== */
document.addEventListener("DOMContentLoaded", function () {
  
  // 1. Check if analytics data exists (injected by Flask)
  let db = window.analyticsData;
  if (!db) {
    console.warn("Analytics data not loaded from Flask template.");
    return;
  }

  // Parse if string
  try {
    if (typeof db === 'string') db = JSON.parse(db);
  } catch (e) {
    console.error("Error parsing analytics data:", e);
    return;
  }

  // Configuration
  const colors = {
    pm25: 'rgba(255, 99, 132, 0.8)',
    pm10: 'rgba(54, 162, 235, 0.8)',
    aqi: ['#50f000', '#ffff00', '#ff9000', '#ff0000', '#99004c', '#730029'], // Good -> Hazardous,
    pm25_mean: '#9c27b0',
    pm25_std:  '#ba68c8',
    pm25_min:  '#e1bee7',
    pm25_max:  '#6a0080',

    // PM10 (teal/green scale)
    pm10_mean: '#009688',
    pm10_std:  '#4db6ac',
    pm10_min:  '#b2dfdb',
    pm10_max:  '#00695c'
  };

  const commonOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'top', labels: { usePointStyle: true, font: { size: 11 } } }
    },
    scales: {
      y: { grid: { color: 'rgba(0,0,0,0.05)' } },
      x: { grid: { display: false } }
    }
  };
  console.log(db)
  // --- CHART 1: Country Comparison ---
  if(db.summary && document.getElementById('chart-mean')) {
    new Chart(document.getElementById('chart-mean'), {
      type: 'bar',
      data: {
        labels: db.summary.countries,
        datasets: [
          { label: 'PM2.5 Mean', data: db.summary.pm25_mean, backgroundColor: colors.pm25, borderRadius: 4 },
          { label: 'PM10 Mean', data: db.summary.pm10_mean, backgroundColor: colors.pm10, borderRadius: 4 },
          { label: 'PM2.5 Std', data: db.summary.pm25_std, backgroundColor: colors.pm25_std, borderRadius: 4 },
          { label: 'PM10 Std', data: db.summary.pm10_std, backgroundColor: colors.pm10_std, borderRadius: 4 },   
          { label: 'PM2.5 Min', data: db.summary.pm25_min, backgroundColor: colors.pm25_min, borderRadius: 4 },
          { label: 'PM10 Min', data: db.summary.pm10_min, backgroundColor: colors.pm10_min, borderRadius: 4 },  
          { label: 'PM2.5 Max', data: db.summary.pm25_max, backgroundColor: colors.pm25_max, borderRadius: 4 },
          { label: 'PM10 Max', data: db.summary.pm10_max, backgroundColor: colors.pm10_max, borderRadius: 4 },     
        ]
      },
      options: commonOptions
    });
  }

  // --- CHART 2: WHO Compliance ---
  if(db.exceedance && document.getElementById('chart-compliance')) {
    new Chart(document.getElementById('chart-compliance'), {
      type: 'bar',
      indexAxis: 'y',
      data: {
        labels: db.compliance.countries,
        datasets: [{
          label: '% Days > WHO Guideline (PM2.5)',
          data: db.compliance.pct25,
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
  }

  // --- CHARTS 3 & 4: AQI Distribution ---
  const doughnutOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { position: 'right' } },
    cutout: '60%'
  };

  if(db.aqi_winter && document.getElementById('chart-aqi-winter')) {
    new Chart(document.getElementById('chart-aqi-winter'), {
      type: 'doughnut',
      data: {
        labels: db.aqi_labels,
        datasets: [{ data: db.aqi_winter, backgroundColor: colors.aqi, borderWidth: 0 }]
      },
      options: doughnutOptions
    });
  }

  if(db.aqi_summer && document.getElementById('chart-aqi-summer')) {
    new Chart(document.getElementById('chart-aqi-summer'), {
      type: 'doughnut',
      data: {
        labels: db.aqi_labels,
        datasets: [{ data: db.aqi_summer, backgroundColor: colors.aqi, borderWidth: 0 }]
      },
      options: doughnutOptions
    });
  }

  // --- CHART 5: Ratio ---
  if(db.ratio && document.getElementById('chart-ratio')) {
    new Chart(document.getElementById('chart-ratio'), {
      type: 'bar',
      data: {
        labels: db.ratio.countries,
        datasets: [{
          label: 'Ratio',
          data: db.ratio.values,
          backgroundColor: 'rgba(153, 102, 255, 0.7)',
          borderRadius: 4
        }]
      },
      options: {
        ...commonOptions,
        scales: {
          y: { min: 0, max: 1.0, title: { display: true, text: 'Ratio (PM2.5 / PM10)' } }
        }
      }
    });
  }

  // --- CHART 6: Mortality Risk ---
  if(db.mortality && document.getElementById('chart-mortality')) {
    new Chart(document.getElementById('chart-mortality'), {
      type: 'bar',
      data: {
        labels: db.mortality.countries,
        datasets: [{
          label: '% Excess Risk',
          data: db.mortality.risk,
          backgroundColor: 'rgba(255, 99, 132, 0.6)',
          borderColor: 'rgba(255, 99, 132, 1)',
          borderWidth: 1
        }]
      },
      options: commonOptions
    });
  }

  // --- CHART 7: Yearly Trends ---
  if(db.yearly_trends && document.getElementById('chart-yearly')) {
    const datasets = Object.keys(db.yearly_trends.data).map((country, i) => ({
      label: country,
      data: db.yearly_trends.data[country],
      borderColor: `hsl(${i * 45}, 70%, 50%)`,
      fill: false,
      tension: 0.3
    }));

    new Chart(document.getElementById('chart-yearly'), {
      type: 'line',
      data: {
        labels: db.yearly_trends.years,
        datasets: datasets
      },
      options: commonOptions
    });
  }

  // --- CHART 8: Weekend vs Weekday ---
  if(db.weekend_effect && document.getElementById('chart-weekend')) {
    const countries = Object.keys(db.weekend_effect);
    const wknd = countries.map(c => db.weekend_effect[c].weekend);
    const wkday = countries.map(c => db.weekend_effect[c].weekday);

    new Chart(document.getElementById('chart-weekend'), {
      type: 'bar',
      data: {
        labels: countries,
        datasets: [
          { label: 'Weekday', data: wkday, backgroundColor: '#36A2EB' },
          { label: 'Weekend', data: wknd, backgroundColor: '#FFCE56' }
        ]
      },
      options: commonOptions
    });
  }

  // --- TABLE: Model Performance ---
  if(db.model_performance && document.getElementById('table-model-perf')) {
    const tbody = document.getElementById('table-model-perf');
    tbody.innerHTML = '';
    db.model_performance.forEach(row => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${row.country}</strong></td>
        <td><strong>${row.pollutant}</strong></td>
        <td><strong>${row.model}</strong></td>
        <td>${parseFloat(row.rmse).toFixed(3)}</td>
        <td>${parseFloat(row.mae).toFixed(3)}</td>
        <td>${parseFloat(row.r2).toFixed(3)}</td>
      `;
      tbody.appendChild(tr);
    });
  }
  
  // --- TABLE: Worst Episodes ---
  if(db.worst_episodes && document.getElementById('table-worst-episodes')) {
      const tbody = document.getElementById('table-worst-episodes');
      tbody.innerHTML = '';
      db.worst_episodes.forEach(row => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${row.date}</td>
          <td><strong>${row.country}</strong></td>
          <td>${parseFloat(row.avg_concentration).toFixed(1)}</td>
          <td>${row.aqi || '-'}</td>
        `;
        tbody.appendChild(tr);
      });
  }
});