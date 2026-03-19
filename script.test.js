const localStorageMock = (() => {
  let store = {};
  return {
    getItem: (key) => store[key] ?? null,
    setItem: (key, value) => { store[key] = String(value); },
    removeItem: (key) => { delete store[key]; },
    clear: () => { store = {}; },
  };
})();
Object.defineProperty(global, 'localStorage', { value: localStorageMock });

global.fetch = jest.fn();

document.body.innerHTML = `
 <button id="themeToggle">Dark Mode</button>
 <input id="city-input" type="text" />
 <button id="search-btn">Search</button>
 <button id="location-btn">📍</button>
 <button id="unitToggle">°F</button>
 <div id="error-message" class="hidden"></div>
 <section id="current-weather" class="hidden"></section>
 <section id="forecast-section" class="hidden"></section>
 <div id="skeleton-screen" class="hidden"></div>
 <div id="forecast-grid"></div>
 <span id="city-name"></span>
 <span id="date"></span>
 <span id="temperature"></span>
 <span id="description"></span>
 <span id="humidity"></span>
 <span id="wind-speed"></span>
 <img id="weather-icon" src="" alt="" />
`;

const script = require('./script.js');
const { showError, updateUnitButton, applyTheme, getWeather } = script;

const errorMessage = document.getElementById('error-message');
const currentWeatherSection = document.getElementById('current-weather');
const forecastSection = document.getElementById('forecast-section');
const unitToggle = document.getElementById('unitToggle');
const toggleBtn = document.getElementById('themeToggle');

describe('showError()', () => {

  beforeEach(() => {
    errorMessage.classList.add('hidden');
    errorMessage.textContent = '';
    currentWeatherSection.classList.remove('hidden');
    forecastSection.classList.remove('hidden');
  });

  it('remove hidden class from the error element', () => {
    showError('City not found.');
    expect(errorMessage.classList.contains('hidden')).toBe(false);
  });

  it('sets the correct error message text', () => {
    showError('City not found.');
    expect(errorMessage.textContent).toBe('City not found.');
  });

  it('hides the current weather section', () => {
    showError('City not found.');
    expect(currentWeatherSection.classList.contains('hidden')).toBe(true);
  });

  it('hides the forecast section', () => {
    showError('City not found.');
    expect(forecastSection.classList.contains('hidden')).toBe(true);
  });
});

describe('updateUnitButton()', () => {

  it('shows °F when unit is metric', () => {
    script.unit = 'metric';
    updateUnitButton();
    expect(unitToggle.textContent).toBe('°F');
  });

  it('shows °C when unit is imperial', () => {
    script.unit = 'imperial';
    updateUnitButton();
    expect(unitToggle.textContent).toBe('°C');
  });
});

describe('applyTheme()', () => {

  it('sets data-theme to dark', () => {
    applyTheme('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('sets data-theme to light', () => {
    applyTheme('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('sets dark background color on body', () => {
    applyTheme('dark');
    expect(document.body.style.backgroundColor).toBe('rgb(15, 23, 42)');
  });

  it('sets light background color on body', () => {
    applyTheme('light');
    expect(document.body.style.backgroundColor).toBe('rgb(245, 247, 250)');
  });

  it('updates button label to Light Mode when dark is applied', () => {
    applyTheme('dark');
    expect(toggleBtn.textContent).toBe('Light Mode');
  });

  it('updates button label to Dark Mode when light is applied', () => {
    applyTheme('light');
    expect(toggleBtn.textContent).toBe('Dark Mode');
  });

  it('persists theme choice to localStorage', () => {
    applyTheme('dark');
    expect(localStorage.getItem('theme')).toBe('dark');
  });
});

describe('getWeather()', () => {

  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
  });

  it('does not call fetch when given an empty string', async () => {
    await getWeather('  ');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('shows an error when the weather API returns 404', async () => {
    global.fetch.mockResolvedValue({ ok: false, status: 404, json: jest.fn() });
    errorMessage.classList.add('hidden');

    await getWeather('InvalidCityXYZ');

    expect(errorMessage.classList.contains('hidden')).toBe(false);
    expect(errorMessage.textContent).toMatch(/City not found/i);
  });

  it('calls fetch with the correct city and unit', async () => {
    const mockWeatherData = {
      name: 'London',
      sys: { country: 'GB' },
      main: { temp: 15, feels_like: 13, temp_max: 17, temp_min: 11, humidity: 80, pressure: 1012 },
      weather: [{ description: 'clear sky', icon: '01d', id: 800 }],
      wind: { speed: 3.5 },
      visibility: 10000,
      timezone: 0,
    };

    const mockForecastData = {
      list: [
        {
          dt: 1000000,
          dt_txt: '2026-03-20 12:00:00',
          main: { temp: 14 },
          weather: [{ description: 'clear', icon: '01d' }],
        },
      ],
    };

    global.fetch.mockImplementation((url) => {
      if (url.includes('/forecast')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockForecastData),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockWeatherData),
      });
    });

    script.unit = 'metric';
    await getWeather('London');

    const firstUrl = global.fetch.mock.calls[0][0];
    expect(firstUrl).toContain('q=London');
    expect(firstUrl).toContain('units=metric');
  });

  it('saves the city to localStorage after a successful fetch', async () => {
    const mockWeatherData = {
      name: 'Paris',
      sys: { country: 'FR' },
      main: { temp: 20, feels_like: 19, temp_max: 22, temp_min: 18, humidity: 60, pressure: 1015 },
      weather: [{ description: 'sunny', icon: '01d', id: 800 }],
      wind: { speed: 2.1 },
      visibility: 9000,
      timezone: 3600,
    };

    const mockForecastData = {
      list: [
        {
          dt: 1000000,
          dt_txt: '2026-03-20 12:00:00',
          main: { temp: 18 },
          weather: [{ description: 'cloudy', icon: '02d' }],
        },
      ],
    };

    global.fetch.mockImplementation((url) => {
      if (url.includes('/forecast')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockForecastData),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockWeatherData),
      });
    });

    await getWeather('Paris');

    expect(localStorage.getItem('lastCity')).toBe('Paris');
  });
});