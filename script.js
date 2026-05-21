const WEATHER_API_KEY = "2828d215b8202f6d4439c304ffafc235";
const AUTO_UPDATE_MINUTES = 1;
const REQUEST_TIMEOUT_MS = 10000;

const form = document.querySelector("#weather-form");
const cityInput = document.querySelector("#city-input");
const statusMessage = document.querySelector("#status-message");
const forecastList = document.querySelector("#forecast-list");

let activeCity = "Manila";
let autoUpdateTimer;
let activeTimezone = "Asia/Manila";

const savedPlaces = {
  manila: {
    name: "Manila",
    admin1: "Metro Manila",
    country: "Philippines",
    latitude: 14.5995,
    longitude: 120.9842
  }
};

const elements = {
  location: document.querySelector("#location-name"),
  updated: document.querySelector("#updated-time"),
  icon: document.querySelector("#weather-icon"),
  temperature: document.querySelector("#temperature"),
  condition: document.querySelector("#condition"),
  summary: document.querySelector("#summary"),
  wind: document.querySelector("#wind"),
  humidity: document.querySelector("#humidity"),
  pressure: document.querySelector("#pressure"),
  feelsLike: document.querySelector("#feels-like"),
  forecastNote: document.querySelector("#forecast-note")
};

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const city = cityInput.value.trim();

  if (city) {
    loadWeather(city);
  }
});

async function loadWeather(city, isAutoUpdate = false) {
  activeCity = city;
  setStatus(isAutoUpdate ? `Auto updating ${city} weather...` : `Searching weather for ${city}...`);

  try {
    if (hasApiKey()) {
      const weather = await getWeatherApiForecast(city);
      updateWeatherApiCurrent(weather);
      updateWeatherApiForecast(weather);
      setStatus("");
    } else {
      const place = await getOpenMeteoCoordinates(city);
      const weather = await getOpenMeteoForecast(place);
      updateOpenMeteoCurrent(place, weather);
      updateOpenMeteoForecast(weather);
      setStatus("");
    }

    startAutoUpdate();
  } catch (error) {
    console.error(error);
    setStatus(error.message, true);
  }
}

async function getWeatherApiForecast(city) {
  const endpoint = new URL("https://api.weatherapi.com/v1/forecast.json");
  endpoint.search = new URLSearchParams({
    key: WEATHER_API_KEY,
    q: city,
    days: "3", // INAYOS: Binabaan sa 3 dahil limitado sa 3 days ang free tier plan ng WeatherAPI
    aqi: "no",
    alerts: "no"
  });

  const response = await fetchWithTimeout(endpoint);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error?.message || "Could not load WeatherAPI.com forecast.");
  }

  return data;
}

async function getOpenMeteoCoordinates(city) {
  const savedPlace = savedPlaces[city.trim().toLowerCase()];

  if (savedPlace) {
    return savedPlace;
  }

  const endpoint = new URL("https://geocoding-api.open-meteo.com/v1/search");
  endpoint.search = new URLSearchParams({
    name: city,
    count: "1",
    language: "en",
    format: "json"
  });

  const response = await fetchWithTimeout(endpoint);

  if (!response.ok) {
    throw new Error("Could not reach the location service.");
  }

  const data = await response.json();

  if (!data.results?.length) {
    throw new Error("City not found. Try a nearby major city.");
  }

  return data.results[0];
}

async function getOpenMeteoForecast(place) {
  const endpoint = new URL("https://api.open-meteo.com/v1/forecast");
  endpoint.search = new URLSearchParams({
    latitude: place.latitude,
    longitude: place.longitude,
    current: [
      "temperature_2m",
      "relative_humidity_2m",
      "apparent_temperature",
      "weather_code",
      "pressure_msl",
      "wind_speed_10m"
    ].join(","),
    daily: [
      "weather_code",
      "temperature_2m_max",
      "temperature_2m_min"
    ].join(","),
    timezone: "auto"
  });

  const response = await fetchWithTimeout(endpoint);

  if (!response.ok) {
    throw new Error("Could not load the forecast right now.");
  }

  return response.json();
}

async function fetchWithTimeout(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    return await fetch(url, { signal: controller.signal });
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("Weather request timed out. Check your internet connection.");
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

// INAYOS: Ginawang uniform ang pag-render ng main icon gamit ang iyong getConditionIcon function
function updateWeatherApiCurrent(weather) {
  const location = weather.location;
  const current = weather.current;
  const placeLabel = [location.name, location.region, location.country].filter(Boolean).join(", ");
  activeTimezone = location.tz_id || activeTimezone;

  elements.location.textContent = placeLabel;
  updateLiveClock();
  
  // Mas maganda ang hitsura kung parehong gagamit ng iyong CSS art styles
  elements.icon.innerHTML = getConditionIcon(current.condition.text);
  elements.temperature.textContent = `${Math.round(current.temp_c)}\u00B0`;
  elements.condition.textContent = current.condition.text;
  elements.summary.textContent = `Feels like ${Math.round(current.feelslike_c)}\u00B0C with ${current.humidity}% humidity.`;
  elements.wind.textContent = `${Math.round(current.wind_kph)} km/h`;
  elements.humidity.textContent = `${current.humidity}%`;
  elements.pressure.textContent = `${Math.round(current.pressure_mb)} hPa`;
  elements.feelsLike.textContent = `${Math.round(current.feelslike_c)}\u00B0C`;
  elements.forecastNote.textContent = `Forecast for ${location.name}`;
}

function updateWeatherApiForecast(weather) {
  forecastList.innerHTML = weather.forecast.forecastday.map((forecast) => {
    const day = formatForecastDay(forecast.date);
    const icon = getConditionIcon(forecast.day.condition.text);

    return `
      <article class="forecast-item">
        <div class="forecast-day">
          <span class="mini-icon" aria-hidden="true">${icon}</span>
          <div>
            <strong>${day}</strong>
            <span>${forecast.day.condition.text}</span>
          </div>
        </div>
        <strong>${Math.round(forecast.day.mintemp_c)}\u00B0 / ${Math.round(forecast.day.maxtemp_c)}\u00B0C</strong>
      </article>
    `;
  }).join("");
}

function updateOpenMeteoCurrent(place, weather) {
  const current = weather.current;
  const [description, icon] = getOpenMeteoCondition(current.weather_code);
  const placeLabel = [place.name, place.admin1, place.country].filter(Boolean).join(", ");
  activeTimezone = weather.timezone || activeTimezone;

  elements.location.textContent = placeLabel;
  updateLiveClock();
  elements.icon.innerHTML = icon;
  elements.temperature.textContent = `${Math.round(current.temperature_2m)}\u00B0`;
  elements.condition.textContent = description;
  elements.summary.textContent = `Feels like ${Math.round(current.apparent_temperature)}\u00B0C with ${current.relative_humidity_2m}% humidity.`;
  elements.wind.textContent = `${Math.round(current.wind_speed_10m)} km/h`;
  elements.humidity.textContent = `${current.relative_humidity_2m}%`;
  elements.pressure.textContent = `${Math.round(current.pressure_msl)} hPa`;
  elements.feelsLike.textContent = `${Math.round(current.apparent_temperature)}\u00B0C`;
  elements.forecastNote.textContent = `Forecast for ${place.name}`;
}

function updateOpenMeteoForecast(weather) {
  const daily = weather.daily;

  forecastList.innerHTML = daily.time.map((date, index) => {
    const [description, icon] = getOpenMeteoCondition(daily.weather_code[index]);

    return `
      <article class="forecast-item">
        <div class="forecast-day">
          <span class="mini-icon" aria-hidden="true">${icon}</span>
          <div>
            <strong>${formatForecastDay(date)}</strong>
            <span>${description}</span>
          </div>
        </div>
        <strong>${Math.round(daily.temperature_2m_min[index])}\u00B0 / ${Math.round(daily.temperature_2m_max[index])}\u00B0C</strong>
      </article>
    `;
  }).join("");
}

function getOpenMeteoCondition(code) {
  const conditions = {
    0: ["Clear sky", getDayNightIcon("clear")],
    1: ["Mainly clear", getDayNightIcon("clear")],
    2: ["Partly cloudy", getDayNightIcon("partly")],
    3: ["Overcast", `<span class="weather-art cloudy"><i></i></span>`],
    45: ["Fog", `<span class="weather-art cloudy"><i></i></span>`],
    48: ["Rime fog", `<span class="weather-art cloudy"><i></i></span>`],
    51: ["Light drizzle", `<span class="weather-art cloudy"><i></i></span>`],
    53: ["Moderate drizzle", `<span class="weather-art cloudy"><i></i></span>`],
    55: ["Dense drizzle", `<span class="weather-art cloudy"><i></i></span>`],
    61: ["Slight rain", `<span class="weather-art storm"><i></i><b></b><em></em></span>`],
    63: ["Moderate rain", `<span class="weather-art storm"><i></i><b></b><em></em></span>`],
    65: ["Heavy rain", `<span class="weather-art storm"><i></i><b></b><em></em></span>`],
    71: ["Slight snow", `<span class="weather-art cloudy"><i></i></span>`],
    73: ["Moderate snow", `<span class="weather-art cloudy"><i></i></span>`],
    75: ["Heavy snow", `<span class="weather-art cloudy"><i></i></span>`],
    80: ["Rain showers", `<span class="weather-art storm"><i></i><b></b><em></em></span>`],
    81: ["Moderate showers", `<span class="weather-art storm"><i></i><b></b><em></em></span>`],
    82: ["Violent showers", `<span class="weather-art storm"><i></i><b></b><em></em></span>`],
    95: ["Thunderstorm", `<span class="weather-art storm"><i></i><b></b><em></em></span>`],
    96: ["Thunderstorm with hail", `<span class="weather-art storm"><i></i><b></b><em></em></span>`],
    99: ["Heavy thunderstorm with hail", `<span class="weather-art storm"><i></i><b></b><em></em></span>`]
  };

  return conditions[code] || ["Weather update", getDayNightIcon("partly")];
}

function getConditionIcon(condition) {
  const text = condition.toLowerCase();

  if (text.includes("thunder")) {
    return `<span class="weather-art storm"><i></i><b></b><em></em></span>`;
  }

  if (text.includes("rain") || text.includes("shower")) {
    return `<span class="weather-art storm"><i></i><b></b><em></em></span>`;
  }

  if (text.includes("drizzle")) {
    return `<span class="weather-art cloudy"><i></i></span>`;
  }

  if (text.includes("cloud") || text.includes("overcast")) {
    return `<span class="weather-art cloudy"><i></i></span>`;
  }

  if (text.includes("sun") || text.includes("clear")) {
    return getDayNightIcon("clear");
  }

  if (text.includes("fog") || text.includes("mist")) {
    return `<span class="weather-art cloudy"><i></i></span>`;
  }

  return getDayNightIcon("partly");
}

function getDayNightIcon(type) {
  const hour = Number(new Date().toLocaleString("en-US", {
    hour: "2-digit",
    hour12: false,
    timeZone: activeTimezone
  }));
  const isNight = hour < 6 || hour >= 18;
  const variant = isNight && type === "clear" ? "moon" : isNight ? "night" : type;

  if (variant === "moon") {
    return `<span class="weather-art moon"><b></b></span>`;
  }

  return `<span class="weather-art ${variant}"><i></i><b></b></span>`;
}

// INAYOS: Binigyan ng guard block `if (!elements.updated) return;` para hindi mag-crash ang interval clock kung sakaling naglo-load pa lang ang DOM
function updateLiveClock() {
  if (!elements.updated) return;
  const now = new Date();

  elements.updated.textContent = `Local time ${now.toLocaleString([], {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    timeZone: activeTimezone
  })}`;
}

function formatForecastDay(date) {
  return new Date(`${date}T12:00:00`).toLocaleDateString([], {
    weekday: "short",
    month: "short",
    day: "numeric"
  });
}

function setStatus(message, isError = false) {
  if (!statusMessage) {
    return;
  }

  statusMessage.textContent = message;
  statusMessage.classList.toggle("error", isError);
}

function startAutoUpdate() {
  clearInterval(autoUpdateTimer);
  autoUpdateTimer = setInterval(() => {
    loadWeather(activeCity, true);
  }, AUTO_UPDATE_MINUTES * 60 * 1000);
}

function hasApiKey() {
  return WEATHER_API_KEY &&
    WEATHER_API_KEY !== "PASTE_YOUR_WEATHERAPI_KEY_HERE" &&
    WEATHER_API_KEY !== "your_real_api_key_here";
}

// Bootstrapping initialization
loadWeather(activeCity);
setInterval(updateLiveClock, 1000);
