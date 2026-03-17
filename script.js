const API_KEY = '';
const BASE_URL = 'https://api.openweathermap.org/data/2.5';

const cityInput = document.getElementById('city-input');
const searchBtn = document.getElementById('search-btn');
const errorMessage = document.getElementById('error-message');
const currentWeatherSection = document.getElementById('current-weather');
const forecastSection = document.getElementById('forecast-section');
const forecastGrid = document.getElementById('forecast-grid');
const unitToggle = document.getElementById('unitToggle');
const toggleBtn = document.getElementById('themeToggle');

let unit = localStorage.getItem('unit') || 'metric';
let currentController = null;
let debounceTimer;

updateUnitButton();

const THEMES = {
    dark: { bg: '#0f172a', color: '#e5e7eb' },
    light: { bg: '#f5f7fa', color: '#111111' },
};

function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    document.body.style.backgroundColor = THEMES[theme].bg;
    document.body.style.color = THEMES[theme].color;
    localStorage.setItem('theme', theme);
    toggleBtn.textContent = theme === 'dark' ? 'Light Mode' : 'Dark Mode';
    toggleBtn.setAttribute('aria-label', theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
}

applyTheme(localStorage.getItem('theme') || 'light');

window.addEventListener('load', () => {
    const lastCity = localStorage.getItem('lastCity');
    if (lastCity) getWeather(lastCity);
});

searchBtn.addEventListener('click', () => getWeather(cityInput.value));


cityInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        clearTimeout(debounceTimer);
        getWeather(cityInput.value);
    }
});

cityInput.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => getWeather(cityInput.value), 500);
});

document.getElementById('location-btn').addEventListener('click', () => {
    if (!('geolocation' in navigator)) {
        showError('Geolocation is not supported by your browser');
        return;
    }
    navigator.geolocation.getCurrentPosition(
        async ({ coords }) => {
            const res = await fetch(
                `${BASE_URL}/weather?lat=${coords.latitude}&lon=${coords.longitude}&units=${unit}&appid=${API_KEY}`
            );
            const data = await res.json();
            getWeather(data.name);
        },
        () => showError('Unable to get your location')
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

async function getWeather(city) {
    if (!city.trim()) return;
    if (currentController) currentController.abort();
    currentController = new AbortController();
    const { signal } = currentController;

    showSkeleton();
    errorMessage.classList.add('hidden');

    try {
        const [weatherRes, forecastRes] = await Promise.all([
            fetch(`${BASE_URL}/weather?q=${city}&units=${unit}&appid=${API_KEY}`, { signal }),
            fetch(`${BASE_URL}/forecast?q=${city}&units=${unit}&appid=${API_KEY}`, { signal }),
        ]);

        if (!weatherRes.ok) throw new Error('City not found. Check the spelling and try again');
        if (!forecastRes.ok) throw new Error('Could not load forecast. Please try again');

        const [weatherData, forecastData] = await Promise.all([
            weatherRes.json(),
            forecastRes.json(),
        ]);

        updateCurrentWeather(weatherData);
        updateForecast(forecastData.list);

        localStorage.setItem('lastCity', city);
    } catch (error) {
        if (error.name === 'AbortError') return;
        showError(error.message);
    } finally {
        hideSkeleton();
    }
}

function updateCurrentWeather(data) {
    currentWeatherSection.classList.remove('hidden');
    forecastSection.classList.remove('hidden');

    const unitLabel = unit === 'metric' ? '°C' : '°F';

    document.getElementById('city-name').textContent = `${data.name}, ${data.sys.country}`;
    document.getElementById('date').textContent = new Date().toLocalDateString();
    document.getElementById('temperature').textContent = `${Math.round(data.main.temp)}${unitLabel}`;
    document.getElementById('description').textContent = data.weather[0].description;
    document.getElementById('humidity').textContent = `${data.main.humidity}%`;
    document.getElementById('wind-speed').textContent = `${data.wind.speed} m/s`;

    const icon = document.getElementById('weather-icon');
    icon.src = `https://openweathermap.org/img/wn/${data.weather[0].icon}@2x.png`;
    icon.alt = data.weather[0].description;
}

function updateForecast(forecastList) {
    forecastGrid.innerHTML = '';

    const unitLabel = unit === 'metric' ? '°C' : '°F';
    const dailyForecasts = forecastList.filter(r => r.dt_txt.includes('12:00:00'));

    dailyForecasts.forEach(dayData => {
        const date = new Date(dayData.dt * 1000)
            .toLocalDateString(undefined, { weekday: 'short', day: 'numeric' });
        const temp = Math.round(dayData.main.temp);
        const icon = dayData.weather[0].icon;
        const desc = dayData.weather[0].description;

        const card = document.createElement('div');
        card.className = 'forecast-card';
        card.innerHTML = `
         <p>${date}</p>
         <img src="https://openweathermap.org/img/wn/${icon}.png" alt="${desc}" loading="lazy">
         <p>${temp}${unitLabel}</p>
         `;
        forecastGrid.appendChild(card);
    });
}

function showSkeleton() {
    document.getElementById('skeleton-screen')?.classList.remove('hidden');
    currentWeatherSection.classList.add('hidden');
    forecastSection.classList.add('hidden');
}

function hideSkeleton() {
    document.getElementById('skeleton-screen')?.classList.add('hidden');
}

function showError(message) {
    errorMessage.textContent = message;
    errorMessage.classList.remove('hidden');
    currentWeatherSection.classList.add('hidden');
    forecastSection.classList.add('hidden');
}

function updateUnitButton() {
    unitToggle.textContent = unit === 'metric' ? '°F' : '°C';
}