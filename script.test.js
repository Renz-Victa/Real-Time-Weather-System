// ── Mocks ─────────────────────────────────────────────────────────
const localStorageMock = (() => {
  let store = {};
  return {
    getItem: (k) => store[k] ?? null,
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
    clear: () => { store = {}; },
  };
})();
Object.defineProperty(global, 'localStorage', { value: localStorageMock });

global.fetch = jest.fn();
global.Notification = undefined; // Disable notifications in tests

// ── DOM ───────────────────────────────────────────────────────────
document.body.innerHTML = `
    <a href="#city-input" class="skip-link">Skip to search</a>
 
    <div id="alert-banner" class="alert-banner hidden" role="alert">
        <span id="alert-icon">⚠</span>
        <div class="alert-content">
            <strong id="alert-title"></strong>
            <span id="alert-body"></span>
        </div>
        <button id="alert-close">✕</button>
    </div>
 
    <button id="themeToggle"  aria-pressed="false">Dark Mode</button>
    <button id="notify-btn"   aria-pressed="false" aria-label="Enable weather notifications"><span id="notify-icon">🔔</span></button>
    <input  id="city-input"   type="text" />
    <button id="search-btn">Search</button>
    <button id="location-btn"><span aria-hidden="true">📍</span></button>
    <button id="unitToggle"   aria-label="Switch to Fahrenheit" aria-pressed="false">°F</button>
 
    <div    id="error-message"   class="hidden" role="alert"></div>
    <div    id="status-message"  class="sr-only" role="status"></div>
    <div    id="skeleton-screen" class="hidden" aria-hidden="true"></div>
 
    <main id="weather-main" aria-busy="false">
        <section id="current-weather"  class="hidden">
            <h2  id="city-name"></h2>
            <p   id="local-time"></p>
            <p   id="date"></p>
            <img id="weather-icon" src="" alt="" />
            <h1  id="temperature" aria-live="polite"></h1>
            <p   id="feels-like"></p>
            <p   id="description"></p>
            <p   id="temp-range"></p>
            <dd  id="humidity"></dd>
            <dd  id="wind-speed"></dd>
            <dd  id="pressure"></dd>
            <dd  id="visibility"></dd>
            <dd  id="uv-index"></dd>
            <dd  id="wind-dir"></dd>
        </section>
        <section id="hourly-section"   class="hidden"><div id="hourly-grid" role="list"></div></section>
        <section id="chart-section"    class="hidden"><canvas id="temp-chart"></canvas></section>
        <section id="precip-section"   class="hidden"><canvas id="precip-chart"></canvas></section>
        <section id="forecast-section" class="hidden"><ul id="forecast-grid"></ul></section>
    </main>
`;

require('./script.js');

// ── Shortcuts ─────────────────────────────────────────────────────
const errorMessage = document.getElementById('error-message');
const currentWeatherSection = document.getElementById('current-weather');
const forecastSection = document.getElementById('forecast-section');
const unitToggle = document.getElementById('unitToggle');
const toggleBtn = document.getElementById('themeToggle');
const alertBanner = document.getElementById('alert-banner');
const alertTitle = document.getElementById('alert-title');
const weatherMain = document.getElementById('weather-main');
const skeletonScreen = document.getElementById('skeleton-screen');

// ── Shared helpers ────────────────────────────────────────────────
function baseWeatherData(currentOverrides = {}) {
  const times = Array.from({ length: 25 }, (_, i) =>
    `2026-01-01T${String(i).padStart(2, '0')}:00`
  );
  return {
    current: {
      temperature_2m: 15,
      apparent_temperature: 13,
      relative_humidity_2m: 72,
      weather_code: 0,
      wind_speed_10m: 3,
      wind_direction_10m: 180,
      surface_pressure: 1013,
      visibility: 10000,
      uv_index: 3,
      ...currentOverrides,
    },
    hourly: {
      time: times,
      temperature_2m: times.map(() => 15),
      weather_code: times.map(() => 0),
      precipitation_probability: times.map(() => 5),
    },
    daily: {
      time: ['2026-01-01', '2026-01-02', '2026-01-03', '2026-01-04', '2026-01-05', '2026-01-06'],
      weather_code: [0, 1, 2, 3, 61, 80],
      temperature_2m_max: [18, 17, 16, 15, 14, 13],
      temperature_2m_min: [10, 9, 8, 7, 6, 5],
    },
  };
}

const MOCK_GEO = { results: [{ name: 'London', country: 'GB', latitude: 51.5, longitude: -0.1, timezone: 'Europe/London' }] };

function mockFetchSuccess(weather = baseWeatherData()) {
  global.fetch
    .mockResolvedValueOnce({ ok: true, json: jest.fn().mockResolvedValue(MOCK_GEO) })
    .mockResolvedValueOnce({ ok: true, json: jest.fn().mockResolvedValue(weather) });
}

// ─────────────────────────────────────────────────────────────────
// getWmoCondition()
// ─────────────────────────────────────────────────────────────────
describe('getWmoCondition()', () => {
  it('clear sky for code 0', () => expect(getWmoCondition(0).description).toBe('clear sky'));
  it('thunderstorm for code 95', () => expect(getWmoCondition(95).description).toBe('thunderstorm'));
  it('icon 10d for rain (61)', () => expect(getWmoCondition(61).icon).toBe('10d'));
  it('icon 13d for snow (71)', () => expect(getWmoCondition(71).icon).toBe('13d'));
  it('unknown for bad code', () => expect(getWmoCondition(999).description).toBe('unknown'));
});

// ─────────────────────────────────────────────────────────────────
// getWindDirection()
// ─────────────────────────────────────────────────────────────────
describe('getWindDirection()', () => {
  it('N for 0', () => expect(getWindDirection(0)).toBe('N'));
  it('E for 90', () => expect(getWindDirection(90)).toBe('E'));
  it('S for 180', () => expect(getWindDirection(180)).toBe('S'));
  it('W for 270', () => expect(getWindDirection(270)).toBe('W'));
  it('NE for 45', () => expect(getWindDirection(45)).toBe('NE'));
  it('SW for 225', () => expect(getWindDirection(225)).toBe('SW'));
});

// ─────────────────────────────────────────────────────────────────
// getUvLabel()
// ─────────────────────────────────────────────────────────────────
describe('getUvLabel()', () => {
  it('Low for 1', () => expect(getUvLabel(1)).toContain('Low'));
  it('Mod for 4', () => expect(getUvLabel(4)).toContain('Mod'));
  it('High for 6', () => expect(getUvLabel(6)).toContain('High'));
  it('V.High for 9', () => expect(getUvLabel(9)).toContain('V.High'));
  it('Extreme for 12', () => expect(getUvLabel(12)).toContain('Extreme'));
});

// ─────────────────────────────────────────────────────────────────
// evaluateAlerts() — the alert engine
// ─────────────────────────────────────────────────────────────────
describe('evaluateAlerts()', () => {
  it('returns null for clear benign conditions', () => {
    expect(evaluateAlerts(baseWeatherData(), 'metric')).toBeNull();
  });

  it('thunderstorm danger alert for code 95', () => {
    const a = evaluateAlerts(baseWeatherData({ weather_code: 95 }), 'metric');
    expect(a.severity).toBe('danger');
    expect(a.title).toMatch(/thunderstorm/i);
  });

  it('freezing rain danger alert for code 67', () => {
    const a = evaluateAlerts(baseWeatherData({ weather_code: 67 }), 'metric');
    expect(a.severity).toBe('danger');
    expect(a.title).toMatch(/freezing/i);
  });

  it('rain incoming when next 3h precip >= 60%', () => {
    const data = baseWeatherData();
    data.hourly.precipitation_probability = [70, 80, 65, ...Array(22).fill(0)];
    const a = evaluateAlerts(data, 'metric');
    expect(a.title).toMatch(/rain incoming/i);
  });

  it('high wind warning for wind_speed >= 15 m/s', () => {
    const a = evaluateAlerts(baseWeatherData({ wind_speed_10m: 16 }), 'metric');
    expect(a.title).toMatch(/wind/i);
  });

  it('UV warning for uv_index >= 8', () => {
    const a = evaluateAlerts(baseWeatherData({ uv_index: 9 }), 'metric');
    expect(a.title).toMatch(/uv/i);
  });

  it('fog advisory for weather_code 45', () => {
    const a = evaluateAlerts(baseWeatherData({ weather_code: 45 }), 'metric');
    expect(a.title).toMatch(/fog/i);
  });

  it('extreme heat for temp >= 37°C', () => {
    const a = evaluateAlerts(baseWeatherData({ temperature_2m: 38 }), 'metric');
    expect(a.title).toMatch(/heat/i);
  });

  it('extreme cold for temp <= -15°C', () => {
    const a = evaluateAlerts(baseWeatherData({ temperature_2m: -16 }), 'metric');
    expect(a.title).toMatch(/cold/i);
  });

  it('thunderstorm beats rain incoming (priority ordering)', () => {
    const data = baseWeatherData({ weather_code: 95 });
    data.hourly.precipitation_probability = [75, 75, 75, ...Array(22).fill(0)];
    const a = evaluateAlerts(data, 'metric');
    expect(a.severity).toBe('danger');
    expect(a.title).toMatch(/thunderstorm/i);
  });

  it('high UV severity is warning not danger', () => {
    const a = evaluateAlerts(baseWeatherData({ uv_index: 10 }), 'metric');
    expect(a.severity).toBe('warning');
  });
});

// ─────────────────────────────────────────────────────────────────
// updateUnitButton()
// ─────────────────────────────────────────────────────────────────
describe('updateUnitButton()', () => {
  it('shows °F when metric', () => { unit = 'metric'; updateUnitButton(); expect(unitToggle.textContent).toBe('°F'); });
  it('shows °C when imperial', () => { unit = 'imperial'; updateUnitButton(); expect(unitToggle.textContent).toBe('°C'); });
  it('aria-pressed false when metric', () => { unit = 'metric'; updateUnitButton(); expect(unitToggle.getAttribute('aria-pressed')).toBe('false'); });
  it('aria-pressed true when imperial', () => { unit = 'imperial'; updateUnitButton(); expect(unitToggle.getAttribute('aria-pressed')).toBe('true'); });
});

// ─────────────────────────────────────────────────────────────────
// applyTheme()
// ─────────────────────────────────────────────────────────────────
describe('applyTheme()', () => {
  it('sets data-theme dark', () => { applyTheme('dark'); expect(document.documentElement.getAttribute('data-theme')).toBe('dark'); });
  it('sets data-theme light', () => { applyTheme('light'); expect(document.documentElement.getAttribute('data-theme')).toBe('light'); });
  it('button says Light Mode', () => { applyTheme('dark'); expect(toggleBtn.textContent).toBe('Light Mode'); });
  it('button says Dark Mode', () => { applyTheme('light'); expect(toggleBtn.textContent).toBe('Dark Mode'); });
  it('aria-pressed true when dark', () => { applyTheme('dark'); expect(toggleBtn.getAttribute('aria-pressed')).toBe('true'); });
  it('aria-pressed false when light', () => { applyTheme('light'); expect(toggleBtn.getAttribute('aria-pressed')).toBe('false'); });
  it('persists to localStorage', () => { applyTheme('dark'); expect(localStorage.getItem('theme')).toBe('dark'); });
});

// ─────────────────────────────────────────────────────────────────
// showError()
// ─────────────────────────────────────────────────────────────────
describe('showError()', () => {
  beforeEach(() => {
    errorMessage.classList.add('hidden');
    errorMessage.textContent = '';
    currentWeatherSection.classList.remove('hidden');
    forecastSection.classList.remove('hidden');
  });
  it('shows error banner', () => { showError('Oops'); expect(errorMessage.classList.contains('hidden')).toBe(false); });
  it('sets error text', () => { showError('Oops'); expect(errorMessage.textContent).toBe('Oops'); });
  it('hides weather section', () => { showError('Oops'); expect(currentWeatherSection.classList.contains('hidden')).toBe(true); });
  it('hides forecast section', () => { showError('Oops'); expect(forecastSection.classList.contains('hidden')).toBe(true); });
});

// ─────────────────────────────────────────────────────────────────
// showSkeleton() / hideSkeleton()
// ─────────────────────────────────────────────────────────────────
describe('showSkeleton() and hideSkeleton()', () => {
  it('shows skeleton screen', () => { skeletonScreen.classList.add('hidden'); showSkeleton(); expect(skeletonScreen.classList.contains('hidden')).toBe(false); });
  it('aria-busy true on main', () => { showSkeleton(); expect(weatherMain.getAttribute('aria-busy')).toBe('true'); });
  it('hides weather section', () => { currentWeatherSection.classList.remove('hidden'); showSkeleton(); expect(currentWeatherSection.classList.contains('hidden')).toBe(true); });
  it('hides skeleton on hide', () => { skeletonScreen.classList.remove('hidden'); hideSkeleton(); expect(skeletonScreen.classList.contains('hidden')).toBe(true); });
  it('aria-busy false on hide', () => { hideSkeleton(); expect(weatherMain.getAttribute('aria-busy')).toBe('false'); });
});

// ─────────────────────────────────────────────────────────────────
// getWeather()
// ─────────────────────────────────────────────────────────────────
describe('getWeather()', () => {
  beforeEach(() => { jest.clearAllMocks(); global.fetch = jest.fn(); });

  it('does nothing on blank input', async () => { await getWeather('   '); expect(global.fetch).not.toHaveBeenCalled(); });

  it('shows error when city not found', async () => {
    global.fetch.mockResolvedValueOnce({ ok: true, json: jest.fn().mockResolvedValue({ results: [] }) });
    errorMessage.classList.add('hidden');
    await getWeather('InvalidXYZ');
    expect(errorMessage.classList.contains('hidden')).toBe(false);
    expect(errorMessage.textContent).toMatch(/not found/i);
  });

  it('calls geocoding API with city', async () => { mockFetchSuccess(); await getWeather('London'); expect(global.fetch.mock.calls[0][0]).toContain('geocoding-api.open-meteo.com'); expect(global.fetch.mock.calls[0][0]).toContain('London'); });
  it('calls weather API after geocoding', async () => { mockFetchSuccess(); await getWeather('London'); expect(global.fetch.mock.calls[1][0]).toContain('api.open-meteo.com'); });
  it('saves city to localStorage', async () => { mockFetchSuccess(); await getWeather('London'); expect(localStorage.getItem('lastCity')).toBe('London'); });
  it('renders city name in DOM', async () => { mockFetchSuccess(); await getWeather('London'); expect(document.getElementById('city-name').textContent).toBe('London, GB'); });

  it('passes fahrenheit unit when imperial', async () => {
    unit = 'imperial';
    mockFetchSuccess();
    await getWeather('London');
    expect(global.fetch.mock.calls[1][0]).toContain('temperature_unit=fahrenheit');
    unit = 'metric';
  });

  it('shows error when weather API fails', async () => {
    global.fetch
      .mockResolvedValueOnce({ ok: true, json: jest.fn().mockResolvedValue(MOCK_GEO) })
      .mockResolvedValueOnce({ ok: false, status: 500 });
    errorMessage.classList.add('hidden');
    await getWeather('London');
    expect(errorMessage.classList.contains('hidden')).toBe(false);
  });
});