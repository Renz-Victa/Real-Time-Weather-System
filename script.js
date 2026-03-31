const GEO_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const WEATHER_URL = 'https://api.open-meteo.com/v1/forecast';

// ── WMO weather code map ──────────────────────────────────────────
const WMO_CODES = {
    0: { description: 'clear sky', icon: '01d' },
    1: { description: 'mainly clear', icon: '01d' },
    2: { description: 'partly cloudy', icon: '02d' },
    3: { description: 'overcast', icon: '04d' },
    45: { description: 'foggy', icon: '50d' },
    48: { description: 'icy fog', icon: '50d' },
    51: { description: 'light drizzle', icon: '09d' },
    53: { description: 'moderate drizzle', icon: '09d' },
    55: { description: 'heavy drizzle', icon: '09d' },
    61: { description: 'light rain', icon: '10d' },
    63: { description: 'moderate rain', icon: '10d' },
    65: { description: 'heavy rain', icon: '10d' },
    66: { description: 'light freezing rain', icon: '13d' },
    67: { description: 'heavy freezing rain', icon: '13d' },
    71: { description: 'light snow', icon: '13d' },
    73: { description: 'moderate snow', icon: '13d' },
    75: { description: 'heavy snow', icon: '13d' },
    77: { description: 'snow grains', icon: '13d' },
    80: { description: 'light showers', icon: '09d' },
    81: { description: 'moderate showers', icon: '09d' },
    82: { description: 'violent showers', icon: '09d' },
    85: { description: 'light snow showers', icon: '13d' },
    86: { description: 'heavy snow showers', icon: '13d' },
    95: { description: 'thunderstorm', icon: '11d' },
    96: { description: 'thunderstorm with hail', icon: '11d' },
    99: { description: 'thunderstorm, heavy hail', icon: '11d' },
};

function getWmoCondition(code) {
    return WMO_CODES[code] || { description: 'unknown', icon: '01d' };
}

// ── Helpers ───────────────────────────────────────────────────────
function getWindDirection(degrees) {
    const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    return dirs[Math.round(degrees / 45) % 8];
}

function getUvLabel(uv) {
    if (uv <= 2) return `${uv} Low`;
    if (uv <= 5) return `${uv} Mod`;
    if (uv <= 7) return `${uv} High`;
    if (uv <= 10) return `${uv} V.High`;
    return `${uv} Extreme`;
}

function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
}

// ── DOM refs ──────────────────────────────────────────────────────
const cityInput = document.getElementById('city-input');
const searchBtn = document.getElementById('search-btn');
const errorMessage = document.getElementById('error-message');
const currentWeatherSection = document.getElementById('current-weather');
const forecastSection = document.getElementById('forecast-section');
const hourlySection = document.getElementById('hourly-section');
const chartSection = document.getElementById('chart-section');
const precipSection = document.getElementById('precip-section');
const forecastGrid = document.getElementById('forecast-grid');
const hourlyGrid = document.getElementById('hourly-grid');
const unitToggle = document.getElementById('unitToggle');
const toggleBtn = document.getElementById('themeToggle');

// ── State ─────────────────────────────────────────────────────────
let unit = localStorage.getItem('unit') || 'metric';
let currentController = null;
let debounceTimer;
let tempChartInstance = null;  // Chart.js instance — destroyed before each redraw
let precipChartInstance = null;
let notificationsEnabled = localStorage.getItem('notifications') === 'true';

// ── Theme ─────────────────────────────────────────────────────────
const THEMES = {
    dark: { bg: '#141210', color: '#F5EFE4' },
    light: { bg: '#FAF7F2', color: '#1C1A17' },
};

function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    document.body.style.backgroundColor = THEMES[theme].bg;
    document.body.style.color = THEMES[theme].color;
    localStorage.setItem('theme', theme);
    toggleBtn.textContent = theme === 'dark' ? 'Light Mode' : 'Dark Mode';
    toggleBtn.setAttribute('aria-pressed', String(theme === 'dark'));
    toggleBtn.setAttribute('aria-label',
        theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'
    );
}

// ── Unit button ───────────────────────────────────────────────────
function updateUnitButton() {
    const isMetric = unit === 'metric';
    unitToggle.textContent = isMetric ? '°F' : '°C';
    unitToggle.setAttribute('aria-label',
        isMetric ? 'Switch to Fahrenheit' : 'Switch to Celsius'
    );
    unitToggle.setAttribute('aria-pressed', String(!isMetric));
}

// ── Init ──────────────────────────────────────────────────────────
updateUnitButton();
applyTheme(localStorage.getItem('theme') || 'light');
initNotifyButton();

window.addEventListener('load', () => {
    const lastCity = localStorage.getItem('lastCity');
    if (lastCity) {
        cityInput.value = lastCity;
        getWeather(lastCity);
    }
});

// ── Event listeners ───────────────────────────────────────────────
searchBtn.addEventListener('click', () => getWeather(cityInput.value));

cityInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        clearTimeout(debounceTimer);
        getWeather(cityInput.value);
    }
});

cityInput.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    const val = cityInput.value.trim();
    if (val.length >= 3) {
        debounceTimer = setTimeout(() => getWeather(val), 500);
    }
});

document.getElementById('location-btn').addEventListener('click', () => {
    if (!('geolocation' in navigator)) {
        showError('Geolocation is not supported by your browser.');
        return;
    }
    const btn = document.getElementById('location-btn');
    btn.setAttribute('aria-disabled', 'true');

    navigator.geolocation.getCurrentPosition(
        async ({ coords }) => {
            btn.removeAttribute('aria-disabled');
            await getWeatherByCoords(coords.latitude, coords.longitude);
        },
        () => {
            btn.removeAttribute('aria-disabled');
            showError('Unable to get your location. Try searching by city name.');
        },
        { timeout: 10000, maximumAge: 300000 }
    );
});

toggleBtn.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme');
    applyTheme(current === 'dark' ? 'light' : 'dark');
});

unitToggle.addEventListener('click', () => {
    unit = unit === 'metric' ? 'imperial' : 'metric';
    localStorage.setItem('unit', unit);
    updateUnitButton();
    const city = localStorage.getItem('lastCity');
    if (city) getWeather(city);
});

document.getElementById('alert-close')?.addEventListener('click', () => {
    document.getElementById('alert-banner')?.classList.add('hidden');
});

// ================================================================
// NOTIFICATIONS
// Uses the Web Notifications API — fully browser-native, no service.
// Requests permission on first click; persists preference to localStorage.
// ================================================================

function initNotifyButton() {
    const btn = document.getElementById('notify-btn');
    if (!btn) return;

    // If notifications aren't supported, hide the button entirely
    if (!('Notification' in window)) {
        btn.classList.add('hidden');
        return;
    }

    // Restore saved state
    if (notificationsEnabled && Notification.permission === 'granted') {
        btn.setAttribute('aria-pressed', 'true');
        btn.setAttribute('aria-label', 'Disable weather notifications');
        document.getElementById('notify-icon').textContent = '🔔';
    }

    btn.addEventListener('click', async () => {
        if (notificationsEnabled) {
            // Toggle off — cannot revoke permission programmatically,
            // but we stop sending notifications and update the UI
            notificationsEnabled = false;
            localStorage.setItem('notifications', 'false');
            btn.setAttribute('aria-pressed', 'false');
            btn.setAttribute('aria-label', 'Enable weather notifications');
            document.getElementById('notify-icon').textContent = '🔔';
            return;
        }

        // Request permission if not already granted
        if (Notification.permission === 'denied') {
            showError('Notification permission is blocked. Enable it in your browser site settings.');
            return;
        }

        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
            notificationsEnabled = true;
            localStorage.setItem('notifications', 'true');
            btn.setAttribute('aria-pressed', 'true');
            btn.setAttribute('aria-label', 'Disable weather notifications');
            document.getElementById('notify-icon').textContent = '🔔';

            // Welcome notification so the user can confirm it worked
            sendNotification('Notifications enabled', 'You will be alerted about rain, storms, and severe weather.');
        } else {
            showError('Notification permission was not granted.');
        }
    });
}

/**
 * Send a browser notification if permission is granted and enabled.
 * @param {string} title
 * @param {string} body
 * @param {'info'|'warning'|'danger'} severity
 */
function sendNotification(title, body, severity = 'info') {
    if (!notificationsEnabled) return;
    if (!('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;

    const icons = { info: '🌤', warning: '⚠️', danger: '🚨' };
    new Notification(`${icons[severity]} ${title}`, {
        body,
        icon: '/favicon.ico',
        tag: `atmos-${severity}`,  // replaces same-tag notification instead of stacking
    });
}

// ================================================================
// WEATHER ALERTS
// Rule-based engine: analyses the Open-Meteo response and generates
// human-readable alerts for the most significant conditions.
// Returns { title, body, severity } or null.
// ================================================================

/**
 * Evaluates weather data and returns the highest-priority alert.
 * @param {object} data   Open-Meteo response
 * @param {string} unit   'metric' | 'imperial'
 * @returns {{ title: string, body: string, severity: string } | null}
 */
function evaluateAlerts(data, currentUnit) {
    const c = data.current;
    const hourly = data.hourly;
    const alerts = [];

    const windUnit = currentUnit === 'metric' ? 'm/s' : 'mph';
    const windLimit = currentUnit === 'metric' ? 15 : 34; // ~54 km/h

    // ── Storm / thunderstorm ──────────────────────────────────────
    if ([95, 96, 99].includes(c.weather_code)) {
        alerts.push({
            severity: 'danger',
            priority: 100,
            title: 'Thunderstorm warning',
            body: 'A thunderstorm is occurring now. Seek shelter indoors and avoid high ground.',
        });
    }

    // ── Upcoming rain in the next 3 hours ─────────────────────────
    const rainCodes = [51, 53, 55, 61, 63, 65, 66, 67, 80, 81, 82];
    const next3hCodes = hourly.weather_code.slice(0, 3);
    const next3hPrecip = hourly.precipitation_probability.slice(0, 3);
    const rainIncoming = next3hCodes.some(c => rainCodes.includes(c))
        || next3hPrecip.some(p => p >= 60);

    if (rainIncoming && !rainCodes.includes(c.weather_code)) {
        const maxProb = Math.max(...next3hPrecip);
        alerts.push({
            severity: 'warning',
            priority: 70,
            title: 'Rain incoming',
            body: `Rain expected within 3 hours (${maxProb}% chance). Consider an umbrella.`,
        });
    }

    // ── Heavy rain currently ──────────────────────────────────────
    if ([63, 65, 81, 82].includes(c.weather_code)) {
        alerts.push({
            severity: 'warning',
            priority: 80,
            title: 'Heavy rain',
            body: 'Heavy rainfall is occurring. Avoid driving through flooded areas.',
        });
    }

    // ── Snow ──────────────────────────────────────────────────────
    if ([71, 73, 75, 77, 85, 86].includes(c.weather_code)) {
        alerts.push({
            severity: 'warning',
            priority: 75,
            title: 'Snow warning',
            body: `Snowfall is occurring. Roads may be slippery — drive with caution.`,
        });
    }

    // ── Freezing rain ─────────────────────────────────────────────
    if ([66, 67].includes(c.weather_code)) {
        alerts.push({
            severity: 'danger',
            priority: 90,
            title: 'Freezing rain',
            body: 'Freezing rain is occurring. Surfaces are likely icy — stay indoors if possible.',
        });
    }

    // ── High wind ─────────────────────────────────────────────────
    if (c.wind_speed_10m >= windLimit) {
        alerts.push({
            severity: 'warning',
            priority: 65,
            title: 'High wind advisory',
            body: `Wind speed is ${c.wind_speed_10m} ${windUnit}. Secure loose outdoor items.`,
        });
    }

    // ── High UV ───────────────────────────────────────────────────
    if (c.uv_index >= 8) {
        alerts.push({
            severity: 'warning',
            priority: 50,
            title: 'High UV index',
            body: `UV index is ${c.uv_index} (${getUvLabel(c.uv_index)}). Wear sunscreen and limit sun exposure.`,
        });
    }

    // ── Fog ───────────────────────────────────────────────────────
    if ([45, 48].includes(c.weather_code)) {
        alerts.push({
            severity: 'info',
            priority: 40,
            title: 'Dense fog advisory',
            body: 'Visibility is severely reduced. Drive slowly and use fog lights.',
        });
    }

    // ── Extreme heat (metric: > 37°C / imperial: > 99°F) ──────────
    const heatLimit = currentUnit === 'metric' ? 37 : 99;
    if (c.temperature_2m >= heatLimit) {
        alerts.push({
            severity: 'danger',
            priority: 85,
            title: 'Extreme heat warning',
            body: `Temperature is ${Math.round(c.temperature_2m)}°${currentUnit === 'metric' ? 'C' : 'F'}. Stay hydrated and avoid prolonged outdoor activity.`,
        });
    }

    // ── Extreme cold (metric: < -15°C / imperial: < 5°F) ─────────
    const coldLimit = currentUnit === 'metric' ? -15 : 5;
    if (c.temperature_2m <= coldLimit) {
        alerts.push({
            severity: 'danger',
            priority: 85,
            title: 'Extreme cold warning',
            body: `Temperature is ${Math.round(c.temperature_2m)}°${currentUnit === 'metric' ? 'C' : 'F'}. Risk of frostbite — keep exposed skin covered.`,
        });
    }

    if (alerts.length === 0) return null;

    // Return highest-priority alert only (avoids overwhelming the user)
    return alerts.sort((a, b) => b.priority - a.priority)[0];
}

/**
 * Show or hide the alert banner based on evaluated conditions.
 * Also fires a browser notification if enabled.
 */
function renderAlert(data) {
    const banner = document.getElementById('alert-banner');
    if (!banner) return;

    const alert = evaluateAlerts(data, unit);

    if (!alert) {
        banner.classList.add('hidden');
        return;
    }

    document.getElementById('alert-title').textContent = alert.title;
    document.getElementById('alert-body').textContent = alert.body;
    document.getElementById('alert-icon').textContent =
        alert.severity === 'danger' ? '🚨' : alert.severity === 'info' ? 'ℹ' : '⚠';

    banner.className = `alert-banner alert-${alert.severity}`;
    banner.classList.remove('hidden');

    // Fire browser notification for non-info alerts
    if (alert.severity !== 'info') {
        sendNotification(alert.title, alert.body, alert.severity);
    }
}

// ================================================================
// CHARTS
// Uses Chart.js (loaded from CDN in index.html).
// Both charts are destroyed and recreated on each new search so
// the data stays in sync with the current city and unit.
// ================================================================

/**
 * Render the 24-hour temperature line chart.
 * @param {object} data  Open-Meteo response
 */
function renderTempChart(data) {
    const canvas = document.getElementById('temp-chart');
    if (!canvas || typeof Chart === 'undefined') return;

    // Destroy previous instance to prevent memory leaks and ghost datasets
    if (tempChartInstance) {
        tempChartInstance.destroy();
        tempChartInstance = null;
    }

    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const unitLabel = unit === 'metric' ? '°C' : '°F';
    const gridColor = isDark ? 'rgba(255,245,230,0.07)' : 'rgba(60,45,30,0.07)';
    const textColor = isDark ? '#9E9080' : '#B0A898';
    const lineColor = isDark ? '#F5EFE4' : '#1C1A17';

    // Find current hour index in the hourly array
    const currentHour = new Date().getHours();
    const startIdx = data.hourly.time.findIndex(t => new Date(t).getHours() === currentHour);
    const from = startIdx >= 0 ? startIdx : 0;

    const labels = data.hourly.time.slice(from, from + 24).map(t => {
        const h = new Date(t).getHours();
        return h === 0 ? '12 AM' : h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h - 12} PM`;
    });

    const temps = data.hourly.temperature_2m
        .slice(from, from + 24)
        .map(v => Math.round(v));

    tempChartInstance = new Chart(canvas, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: `Temperature (${unitLabel})`,
                data: temps,
                borderColor: lineColor,
                borderWidth: 1.5,
                pointRadius: 2,
                pointHoverRadius: 4,
                fill: true,
                backgroundColor: isDark
                    ? 'rgba(245,239,228,0.05)'
                    : 'rgba(28,26,23,0.04)',
                tension: 0.4,
            }],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: isDark ? '#1F1C18' : '#FFFCF8',
                    borderColor: isDark ? 'rgba(255,245,230,0.15)' : 'rgba(60,45,30,0.15)',
                    borderWidth: 1,
                    titleColor: isDark ? '#F5EFE4' : '#1C1A17',
                    bodyColor: isDark ? '#9E9080' : '#7A7060',
                    padding: 10,
                    callbacks: {
                        label: ctx => ` ${ctx.parsed.y}${unitLabel}`,
                    },
                },
            },
            scales: {
                x: {
                    grid: { color: gridColor },
                    ticks: { color: textColor, font: { size: 10 }, maxTicksLimit: 8 },
                },
                y: {
                    grid: { color: gridColor },
                    ticks: {
                        color: textColor,
                        font: { size: 10 },
                        callback: v => `${v}${unitLabel}`,
                    },
                },
            },
        },
    });
}

/**
 * Render the 24-hour precipitation probability bar chart.
 * @param {object} data  Open-Meteo response
 */
function renderPrecipChart(data) {
    const canvas = document.getElementById('precip-chart');
    if (!canvas || typeof Chart === 'undefined') return;

    if (precipChartInstance) {
        precipChartInstance.destroy();
        precipChartInstance = null;
    }

    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const gridColor = isDark ? 'rgba(255,245,230,0.07)' : 'rgba(60,45,30,0.07)';
    const textColor = isDark ? '#9E9080' : '#B0A898';
    const barColor = isDark ? 'rgba(96,165,250,0.65)' : 'rgba(95,168,211,0.65)';

    const currentHour = new Date().getHours();
    const startIdx = data.hourly.time.findIndex(t => new Date(t).getHours() === currentHour);
    const from = startIdx >= 0 ? startIdx : 0;

    const labels = data.hourly.time.slice(from, from + 24).map(t => {
        const h = new Date(t).getHours();
        return h === 0 ? '12 AM' : h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h - 12} PM`;
    });

    const precip = data.hourly.precipitation_probability.slice(from, from + 24);

    precipChartInstance = new Chart(canvas, {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: 'Rain chance (%)',
                data: precip,
                backgroundColor: barColor,
                borderRadius: 3,
                borderSkipped: false,
            }],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: isDark ? '#1F1C18' : '#FFFCF8',
                    borderColor: isDark ? 'rgba(255,245,230,0.15)' : 'rgba(60,45,30,0.15)',
                    borderWidth: 1,
                    titleColor: isDark ? '#F5EFE4' : '#1C1A17',
                    bodyColor: isDark ? '#9E9080' : '#7A7060',
                    padding: 10,
                    callbacks: {
                        label: ctx => ` ${ctx.parsed.y}% rain chance`,
                    },
                },
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { color: textColor, font: { size: 10 }, maxTicksLimit: 8 },
                },
                y: {
                    min: 0,
                    max: 100,
                    grid: { color: gridColor },
                    ticks: {
                        color: textColor,
                        font: { size: 10 },
                        callback: v => `${v}%`,
                        stepSize: 25,
                    },
                },
            },
        },
    });
}

// ── Geocoding ─────────────────────────────────────────────────────
async function geocodeCity(city, signal) {
    const url = `${GEO_URL}?name=${encodeURIComponent(city.trim())}&count=1&language=en&format=json`;
    const res = await fetch(url, { signal });

    if (!res.ok) throw new Error('Could not reach the geocoding service. Please try again.');

    const data = await res.json();
    if (!data.results || data.results.length === 0) {
        throw new Error(`"${city}" not found. Check the spelling and try again.`);
    }

    const { name, country, latitude, longitude, timezone } = data.results[0];
    return { name, country, latitude, longitude, timezone };
}

// ── Weather URL builder ───────────────────────────────────────────
function buildWeatherUrl(lat, lon) {
    const tempUnit = unit === 'imperial' ? 'fahrenheit' : 'celsius';
    const windUnit = unit === 'imperial' ? 'mph' : 'ms';

    const params = new URLSearchParams({
        latitude: lat,
        longitude: lon,
        current: [
            'temperature_2m', 'relative_humidity_2m', 'apparent_temperature',
            'weather_code', 'wind_speed_10m', 'wind_direction_10m',
            'surface_pressure', 'visibility', 'uv_index',
        ].join(','),
        hourly: [
            'temperature_2m', 'weather_code', 'precipitation_probability',
        ].join(','),
        daily: [
            'weather_code', 'temperature_2m_max', 'temperature_2m_min',
        ].join(','),
        temperature_unit: tempUnit,
        wind_speed_unit: windUnit,
        timezone: 'auto',
        forecast_days: 6,
        forecast_hours: 25,
    });

    return `${WEATHER_URL}?${params}`;
}

// ── Core fetch: city name ─────────────────────────────────────────
async function getWeather(city) {
    if (!city.trim()) return;

    if (currentController) currentController.abort();
    currentController = new AbortController();
    const { signal } = currentController;

    showSkeleton();
    errorMessage.classList.add('hidden');

    try {
        const location = await geocodeCity(city, signal);
        const weatherRes = await fetch(buildWeatherUrl(location.latitude, location.longitude), { signal });
        if (!weatherRes.ok) throw new Error('Could not load weather data. Please try again.');
        const weatherData = await weatherRes.json();

        renderAll(weatherData, location);
        localStorage.setItem('lastCity', city);

    } catch (err) {
        if (err.name === 'AbortError') return;
        showError(err.message);
    } finally {
        hideSkeleton();
    }
}

// ── Core fetch: coordinates ───────────────────────────────────────
async function getWeatherByCoords(lat, lon) {
    if (currentController) currentController.abort();
    currentController = new AbortController();
    const { signal } = currentController;

    showSkeleton();
    errorMessage.classList.add('hidden');

    try {
        const geoRes = await fetch(
            `${GEO_URL}?latitude=${lat}&longitude=${lon}&count=1&language=en&format=json`,
            { signal }
        );
        const geoData = await geoRes.json();
        const result = geoData.results?.[0];
        const location = result
            ? { name: result.name, country: result.country, latitude: lat, longitude: lon, timezone: result.timezone }
            : { name: 'Your location', country: '', latitude: lat, longitude: lon, timezone: 'auto' };

        const weatherRes = await fetch(buildWeatherUrl(lat, lon), { signal });
        if (!weatherRes.ok) throw new Error('Could not load weather data. Please try again.');
        const weatherData = await weatherRes.json();

        renderAll(weatherData, location);

    } catch (err) {
        if (err.name === 'AbortError') return;
        showError(err.message);
    } finally {
        hideSkeleton();
    }
}

// ── Render: orchestrator ──────────────────────────────────────────
function renderAll(data, location) {
    renderCurrentWeather(data, location);
    renderHourly(data);
    renderTempChart(data);
    renderPrecipChart(data);
    renderForecast(data);
    renderAlert(data);

    currentWeatherSection.classList.remove('hidden');
    hourlySection.classList.remove('hidden');
    chartSection.classList.remove('hidden');
    precipSection.classList.remove('hidden');
    forecastSection.classList.remove('hidden');
}

// ── Render: current weather ───────────────────────────────────────
function renderCurrentWeather(data, location) {
    const c = data.current;
    const daily = data.daily;
    const unitLabel = unit === 'metric' ? '°C' : '°F';
    const windUnit = unit === 'metric' ? 'm/s' : 'mph';
    const condition = getWmoCondition(c.weather_code);
    const temp = Math.round(c.temperature_2m);
    const feels = Math.round(c.apparent_temperature);
    const high = Math.round(daily.temperature_2m_max[0]);
    const low = Math.round(daily.temperature_2m_min[0]);
    const cityLabel = location.country ? `${location.name}, ${location.country}` : location.name;
    const visKm = c.visibility >= 1000
        ? `${(c.visibility / 1000).toFixed(1)} km`
        : `${c.visibility} m`;

    const now = new Date();
    const localTime = now.toLocaleTimeString(undefined, {
        hour: '2-digit', minute: '2-digit',
        timeZone: location.timezone || 'UTC',
    });

    setText('city-name', cityLabel);
    setText('local-time', localTime);
    setText('date', now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' }));
    setText('temperature', `${temp}${unitLabel}`);
    setText('feels-like', `Feels like ${feels}${unitLabel}`);
    setText('description', condition.description);
    setText('temp-range', `${high}° / ${low}°`);
    setText('humidity', `${c.relative_humidity_2m}%`);
    setText('wind-speed', `${c.wind_speed_10m} ${windUnit}`);
    setText('pressure', `${c.surface_pressure} hPa`);
    setText('visibility', visKm);
    setText('uv-index', getUvLabel(c.uv_index));
    setText('wind-dir', getWindDirection(c.wind_direction_10m));

    const icon = document.getElementById('weather-icon');
    if (icon) {
        icon.src = `https://openweathermap.org/img/wn/${condition.icon}@2x.png`;
        icon.alt = condition.description;
    }

    announceToScreenReader(
        `Weather loaded for ${cityLabel}. ` +
        `${temp}${unitLabel}, feels like ${feels}${unitLabel}, ${condition.description}. ` +
        `Humidity ${c.relative_humidity_2m}%, wind ${c.wind_speed_10m} ${windUnit}.`
    );
}

// ── Render: hourly ────────────────────────────────────────────────
function renderHourly(data) {
    hourlyGrid.innerHTML = '';

    const currentHour = new Date().getHours();
    const startIdx = data.hourly.time.findIndex(t => new Date(t).getHours() === currentHour);
    const from = startIdx >= 0 ? startIdx : 0;
    const unitLabel = unit === 'metric' ? '°C' : '°F';
    const rainCodes = [51, 53, 55, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99];

    data.hourly.time.slice(from, from + 24).forEach((timeStr, i) => {
        const h = new Date(timeStr).getHours();
        const isNow = i === 0;
        const timeLabel = isNow ? 'Now' : (h === 0 ? '12 AM' : h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h - 12} PM`);
        const temp = Math.round(data.hourly.temperature_2m[from + i]);
        const condition = getWmoCondition(data.hourly.weather_code[from + i]);
        const precip = data.hourly.precipitation_probability[from + i];
        const isRain = rainCodes.includes(data.hourly.weather_code[from + i]) || precip >= 60;

        const card = document.createElement('article');
        card.className = `hourly-card${isNow ? ' is-now' : ''}${isRain && !isNow ? ' is-rain' : ''}`;
        card.setAttribute('role', 'listitem');
        card.setAttribute('aria-label',
            `${timeLabel}: ${condition.description}, ${temp}${unitLabel}${precip > 0 ? `, ${precip}% rain chance` : ''}`
        );
        card.innerHTML = `
            <p class="hourly-time">${timeLabel}</p>
            <img class="hourly-icon" src="https://openweathermap.org/img/wn/${condition.icon}.png"
                 alt="${condition.description}" width="28" height="28" loading="lazy">
            <p class="hourly-temp">${temp}${unitLabel}</p>
            ${precip > 0 ? `<p class="hourly-precip">${precip}%</p>` : ''}
        `;
        hourlyGrid.appendChild(card);
    });
}

// ── Render: 5-day forecast ────────────────────────────────────────
function renderForecast(data) {
    forecastGrid.innerHTML = '';
    const unitLabel = unit === 'metric' ? '°C' : '°F';

    for (let i = 1; i <= 5; i++) {
        if (!data.daily.time[i]) break;

        const date = new Date(data.daily.time[i] + 'T12:00:00');
        const dayLabel = date.toLocaleDateString(undefined, { weekday: 'short' });
        const high = Math.round(data.daily.temperature_2m_max[i]);
        const low = Math.round(data.daily.temperature_2m_min[i]);
        const condition = getWmoCondition(data.daily.weather_code[i]);

        const card = document.createElement('li');
        card.className = 'forecast-card';
        card.setAttribute('aria-label',
            `${dayLabel}: ${condition.description}, high ${high}${unitLabel}, low ${low}${unitLabel}`
        );
        card.innerHTML = `
            <p class="forecast-day">${dayLabel}</p>
            <img src="https://openweathermap.org/img/wn/${condition.icon}.png"
                 alt="${condition.description}" width="34" height="34" loading="lazy">
            <p>${high}${unitLabel}</p>
            <p class="forecast-low">${low}${unitLabel}</p>
        `;
        forecastGrid.appendChild(card);
    }
}

// ── UI helpers ────────────────────────────────────────────────────
function announceToScreenReader(message) {
    const status = document.getElementById('status-message');
    if (!status) return;
    status.textContent = '';
    setTimeout(() => { status.textContent = message; }, 100);
}

function showSkeleton() {
    const skeleton = document.getElementById('skeleton-screen');
    if (skeleton) skeleton.classList.remove('hidden');
    const main = document.getElementById('weather-main');
    if (main) main.setAttribute('aria-busy', 'true');
    [currentWeatherSection, hourlySection, chartSection, precipSection, forecastSection]
        .forEach(el => el?.classList.add('hidden'));
    document.getElementById('alert-banner')?.classList.add('hidden');
}

function hideSkeleton() {
    const skeleton = document.getElementById('skeleton-screen');
    if (skeleton) skeleton.classList.add('hidden');
    const main = document.getElementById('weather-main');
    if (main) main.setAttribute('aria-busy', 'false');
}

function showError(message) {
    errorMessage.textContent = message;
    errorMessage.classList.remove('hidden');
    [currentWeatherSection, hourlySection, chartSection, precipSection, forecastSection]
        .forEach(el => el?.classList.add('hidden'));
}

// ── Tests (Jest) ──────────────────────────────────────────────────
if (typeof describe !== 'undefined') {

    describe('getWmoCondition()', () => {
        it('clear sky for code 0', () => expect(getWmoCondition(0).description).toBe('clear sky'));
        it('thunderstorm for code 95', () => expect(getWmoCondition(95).description).toBe('thunderstorm'));
        it('icon 10d for rain (61)', () => expect(getWmoCondition(61).icon).toBe('10d'));
        it('icon 13d for snow (71)', () => expect(getWmoCondition(71).icon).toBe('13d'));
        it('unknown for invalid code', () => expect(getWmoCondition(999).description).toBe('unknown'));
    });

    describe('getWindDirection()', () => {
        it('N for 0', () => expect(getWindDirection(0)).toBe('N'));
        it('E for 90', () => expect(getWindDirection(90)).toBe('E'));
        it('S for 180', () => expect(getWindDirection(180)).toBe('S'));
        it('W for 270', () => expect(getWindDirection(270)).toBe('W'));
        it('NE for 45', () => expect(getWindDirection(45)).toBe('NE'));
    });

    describe('getUvLabel()', () => {
        it('Low for 1', () => expect(getUvLabel(1)).toContain('Low'));
        it('Mod for 4', () => expect(getUvLabel(4)).toContain('Mod'));
        it('High for 6', () => expect(getUvLabel(6)).toContain('High'));
        it('Extreme for 12', () => expect(getUvLabel(12)).toContain('Extreme'));
    });

    describe('evaluateAlerts()', () => {
        function baseData(overrides = {}) {
            return {
                current: {
                    temperature_2m: 15,
                    weather_code: 0,
                    wind_speed_10m: 3,
                    uv_index: 2,
                    ...overrides,
                },
                hourly: {
                    weather_code: Array(24).fill(0),
                    precipitation_probability: Array(24).fill(0),
                },
            };
        }

        it('returns null when conditions are benign', () => {
            expect(evaluateAlerts(baseData(), 'metric')).toBeNull();
        });

        it('returns thunderstorm warning for code 95', () => {
            const alert = evaluateAlerts(baseData({ weather_code: 95 }), 'metric');
            expect(alert.severity).toBe('danger');
            expect(alert.title).toMatch(/thunderstorm/i);
        });

        it('returns rain incoming when next 3h precip >= 60%', () => {
            const data = baseData();
            data.hourly.precipitation_probability = [70, 80, 65, ...Array(21).fill(0)];
            const alert = evaluateAlerts(data, 'metric');
            expect(alert.title).toMatch(/rain incoming/i);
        });

        it('returns high wind for wind >= 15 m/s (metric)', () => {
            const alert = evaluateAlerts(baseData({ wind_speed_10m: 16 }), 'metric');
            expect(alert.title).toMatch(/wind/i);
        });

        it('returns high UV warning for uv_index >= 8', () => {
            const alert = evaluateAlerts(baseData({ uv_index: 9 }), 'metric');
            expect(alert.title).toMatch(/uv/i);
        });

        it('returns fog advisory for code 45', () => {
            const alert = evaluateAlerts(baseData({ weather_code: 45 }), 'metric');
            expect(alert.title).toMatch(/fog/i);
        });

        it('returns extreme heat for temp >= 37°C', () => {
            const alert = evaluateAlerts(baseData({ temperature_2m: 38 }), 'metric');
            expect(alert.title).toMatch(/heat/i);
        });

        it('returns extreme cold for temp <= -15°C', () => {
            const alert = evaluateAlerts(baseData({ temperature_2m: -16 }), 'metric');
            expect(alert.title).toMatch(/cold/i);
        });

        it('prioritises thunderstorm over rain incoming', () => {
            const data = baseData({ weather_code: 95 });
            data.hourly.precipitation_probability = [70, 70, 70, ...Array(21).fill(0)];
            const alert = evaluateAlerts(data, 'metric');
            expect(alert.severity).toBe('danger');
            expect(alert.title).toMatch(/thunderstorm/i);
        });
    });

    describe('updateUnitButton()', () => {
        it('shows °F when metric', () => { unit = 'metric'; updateUnitButton(); expect(unitToggle.textContent).toBe('°F'); });
        it('shows °C when imperial', () => { unit = 'imperial'; updateUnitButton(); expect(unitToggle.textContent).toBe('°C'); });
        it('aria-pressed false when metric', () => { unit = 'metric'; updateUnitButton(); expect(unitToggle.getAttribute('aria-pressed')).toBe('false'); });
        it('aria-pressed true when imperial', () => { unit = 'imperial'; updateUnitButton(); expect(unitToggle.getAttribute('aria-pressed')).toBe('true'); });
    });

    describe('applyTheme()', () => {
        it('sets data-theme dark', () => { applyTheme('dark'); expect(document.documentElement.getAttribute('data-theme')).toBe('dark'); });
        it('sets data-theme light', () => { applyTheme('light'); expect(document.documentElement.getAttribute('data-theme')).toBe('light'); });
        it('updates button to Light Mode', () => { applyTheme('dark'); expect(toggleBtn.textContent).toBe('Light Mode'); });
        it('updates button to Dark Mode', () => { applyTheme('light'); expect(toggleBtn.textContent).toBe('Dark Mode'); });
        it('aria-pressed true when dark', () => { applyTheme('dark'); expect(toggleBtn.getAttribute('aria-pressed')).toBe('true'); });
        it('aria-pressed false when light', () => { applyTheme('light'); expect(toggleBtn.getAttribute('aria-pressed')).toBe('false'); });
        it('persists to localStorage', () => { applyTheme('dark'); expect(localStorage.getItem('theme')).toBe('dark'); });
    });

    describe('showError()', () => {
        beforeEach(() => {
            errorMessage.classList.add('hidden');
            errorMessage.textContent = '';
            currentWeatherSection.classList.remove('hidden');
            forecastSection.classList.remove('hidden');
        });
        it('shows error element', () => { showError('Oops'); expect(errorMessage.classList.contains('hidden')).toBe(false); });
        it('sets error text', () => { showError('Oops'); expect(errorMessage.textContent).toBe('Oops'); });
        it('hides current weather section', () => { showError('Oops'); expect(currentWeatherSection.classList.contains('hidden')).toBe(true); });
    });

    describe('getWeather()', () => {
        beforeEach(() => { jest.clearAllMocks(); global.fetch = jest.fn(); });

        const mockGeo = { results: [{ name: 'London', country: 'GB', latitude: 51.5, longitude: -0.1, timezone: 'Europe/London' }] };
        const mockWeather = () => ({
            current: { temperature_2m: 15, apparent_temperature: 13, relative_humidity_2m: 72, weather_code: 0, wind_speed_10m: 3, wind_direction_10m: 180, surface_pressure: 1013, visibility: 10000, uv_index: 3 },
            hourly: { time: Array.from({ length: 25 }, (_, i) => `2026-01-01T${String(i).padStart(2, '0')}:00`), temperature_2m: Array(25).fill(15), weather_code: Array(25).fill(0), precipitation_probability: Array(25).fill(5) },
            daily: { time: ['2026-01-01', '2026-01-02', '2026-01-03', '2026-01-04', '2026-01-05', '2026-01-06'], weather_code: [0, 1, 2, 3, 61, 80], temperature_2m_max: [18, 17, 16, 15, 14, 13], temperature_2m_min: [10, 9, 8, 7, 6, 5] },
        });

        function mockSuccess() {
            global.fetch
                .mockResolvedValueOnce({ ok: true, json: jest.fn().mockResolvedValue(mockGeo) })
                .mockResolvedValueOnce({ ok: true, json: jest.fn().mockResolvedValue(mockWeather()) });
        }

        it('does nothing on empty input', async () => { await getWeather('   '); expect(global.fetch).not.toHaveBeenCalled(); });
        it('shows error when city not found', async () => { global.fetch.mockResolvedValueOnce({ ok: true, json: jest.fn().mockResolvedValue({ results: [] }) }); errorMessage.classList.add('hidden'); await getWeather('zzz'); expect(errorMessage.classList.contains('hidden')).toBe(false); });
        it('calls geocoding API', async () => { mockSuccess(); await getWeather('London'); expect(global.fetch.mock.calls[0][0]).toContain('geocoding-api.open-meteo.com'); });
        it('calls weather API after geocoding', async () => { mockSuccess(); await getWeather('London'); expect(global.fetch.mock.calls[1][0]).toContain('api.open-meteo.com'); });
        it('saves city to localStorage', async () => { mockSuccess(); await getWeather('London'); expect(localStorage.getItem('lastCity')).toBe('London'); });
        it('renders city name in DOM', async () => { mockSuccess(); await getWeather('London'); expect(document.getElementById('city-name').textContent).toBe('London, GB'); });
    });
}