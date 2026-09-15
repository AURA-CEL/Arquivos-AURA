/* Forecast is independent of AURA sensor state. No keys or location permission needed. */
(() => {
  'use strict';
  const DEFAULT_CITY = {name: 'Rio de Janeiro', admin1: 'RJ', country: 'Brasil', latitude: -22.9068, longitude: -43.1729};
  const REFRESH_MS = 15 * 60 * 1000;
  const state = {city: DEFAULT_CITY, targetCity: DEFAULT_CITY, data: null, loadedAt: 0, request: 0, searchRequest: 0, controller: null, searchController: null, busy: false};
  const el = id => document.getElementById(id);
  const text = (id, value) => { if (el(id)) el(id).textContent = value; };
  const finite = value => typeof value === 'number' && Number.isFinite(value);
  const number = (value, digits = 0) => finite(value) ? value.toLocaleString('pt-BR', {maximumFractionDigits: digits}) : '—';
  const unit = (value, suffix, digits = 0) => finite(value) ? `${number(value, digits)}${suffix}` : '—';
  const cityName = city => [city.name, city.admin1].filter(Boolean).join(' · ');
  const escape = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[char]));

  function condition(code, isDay = true) {
    if (code === 0) return [isDay ? 'Céu limpo' : 'Noite de céu limpo', isDay ? '☀' : '☾'];
    if (code === 1 || code === 2) return ['Parcialmente nublado', isDay ? '⛅' : '☁'];
    if (code === 3) return ['Nublado', '☁'];
    if (code === 45 || code === 48) return ['Nevoeiro', '≋'];
    if ([51,53,55,56,57].includes(code)) return ['Garoa', '☂'];
    if ([61,63,65,66,67].includes(code)) return ['Chuva', '☂'];
    if ([71,73,75,77,85,86].includes(code)) return ['Neve', '❄'];
    if ([80,81,82].includes(code)) return ['Pancadas de chuva', '☂'];
    if ([95,96,99].includes(code)) return ['Trovoadas', 'ϟ'];
    return ['Condição indisponível', '—'];
  }

  function forecastURL(city) {
    const params = new URLSearchParams({
      latitude: city.latitude, longitude: city.longitude, timezone: 'auto', timeformat: 'unixtime', forecast_days: 7,
      current: 'temperature_2m,relative_humidity_2m,is_day,weather_code,wind_speed_10m',
      hourly: 'temperature_2m,relative_humidity_2m,precipitation_probability,precipitation,weather_code,is_day',
      daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_gusts_10m_max',
      temperature_unit: 'celsius', wind_speed_unit: 'kmh', precipitation_unit: 'mm'
    });
    return `https://api.open-meteo.com/v1/forecast?${params}`;
  }

  async function json(url, controller) {
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(url, {signal: controller.signal});
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } finally { clearTimeout(timer); }
  }

  function validate(data) {
    if (!data || data.error || !data.current || !finite(data.current.time) || !Array.isArray(data.daily?.time) || !data.daily.time.length || !Array.isArray(data.hourly?.time) || !data.hourly.time.length || !data.daily.time.every(finite) || !data.hourly.time.every(finite)) throw new Error('Resposta incompleta');
    if (typeof data.timezone !== 'string') throw new Error('Fuso horário ausente');
    new Intl.DateTimeFormat('pt-BR', {timeZone: data.timezone}).format();
    return data;
  }

  function date(time, options) {
    return new Intl.DateTimeFormat('pt-BR', {...options, timeZone: state.data.timezone}).format(new Date(time * 1000));
  }

  function render() {
    const data = state.data;
    const current = data.current, daily = data.daily;
    const [description, icon] = condition(current.weather_code, current.is_day !== 0);
    const rain = daily.precipitation_sum?.[0], chance = daily.precipitation_probability_max?.[0];
    text('forecast-city', cityName(state.city));
    text('forecast-local-time', `Condições estimadas para ${date(current.time, {day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})} · horário local`);
    text('forecast-temp', unit(current.temperature_2m, '°'));
    text('forecast-icon', icon);
    text('forecast-condition', description);
    text('forecast-range', `Máxima ${unit(daily.temperature_2m_max?.[0], '°')} · Mínima ${unit(daily.temperature_2m_min?.[0], '°')}`);
    text('forecast-probability', unit(chance, '%'));
    text('forecast-precipitation', unit(rain, ' mm', 1));
    text('forecast-humidity', unit(current.relative_humidity_2m, '%'));
    text('forecast-wind', unit(current.wind_speed_10m, ' km/h'));
    text('forecast-gusts', `Rajadas previstas para hoje: ${unit(daily.wind_gusts_10m_max?.[0], ' km/h')}`);
    text('forecast-headline', finite(rain) ? (rain > 0 ? `${number(rain, 1)} mm de precipitação previstos hoje.` : 'Sem volume de precipitação previsto hoje.') : 'Volume de precipitação indisponível.');
    text('forecast-description', `${finite(chance) ? `Probabilidade máxima de ${number(chance)}% ao longo do dia. ` : ''}Previsão para a cidade, independente da chuva registrada pelo Arduino.`);
    el('forecast-hero').dataset.sky = current.is_day === 0 ? 'night' : [51,53,55,56,57,61,63,65,66,67,80,81,82,95,96,99].includes(current.weather_code) ? 'rain' : 'day';
    const start = Math.floor(Date.now() / 3600000) * 3600;
    const hours = data.hourly.time.map((time, i) => ({time, i})).filter(item => item.time >= start).slice(0,24);
    el('forecast-hourly').innerHTML = hours.map(({time,i}) => {
      const [label, symbol] = condition(data.hourly.weather_code?.[i], data.hourly.is_day?.[i] !== 0);
      return `<div class="forecast-hour"><time datetime="${new Date(time*1000).toISOString()}">${date(time,{hour:'2-digit',minute:'2-digit'})}</time><span class="wx-icon" role="img" aria-label="${escape(label)}">${symbol}</span><strong>${unit(data.hourly.temperature_2m?.[i],'°')}</strong><span class="hour-rain" aria-label="Probabilidade de precipitação">${unit(data.hourly.precipitation_probability?.[i],'%')}</span><small>${unit(data.hourly.precipitation?.[i],' mm',1)}</small><small>Umidade ${unit(data.hourly.relative_humidity_2m?.[i],'%')}</small></div>`;
    }).join('') || '<p class="weather-empty">Sem previsão disponível para as próximas horas.</p>';
    el('forecast-daily').innerHTML = daily.time.slice(0,7).map((time,i) => {
      const [label,symbol] = condition(daily.weather_code?.[i]);
      const day = i === 0 ? 'Hoje' : i === 1 ? 'Amanhã' : date(time,{weekday:'short'});
      return `<div class="forecast-day"><time datetime="${new Date(time*1000).toISOString()}">${day}<small class="day-date">${date(time,{day:'2-digit',month:'2-digit'})}</small></time><span class="day-condition"><span class="wx-icon" aria-hidden="true">${symbol}</span>${escape(label)}</span><span class="day-temps"><span aria-label="Mínima">${unit(daily.temperature_2m_min?.[i],'°')}</span><strong aria-label="Máxima">${unit(daily.temperature_2m_max?.[i],'°')}</strong></span><span class="day-rain">${unit(daily.precipitation_sum?.[i],' mm',1)}<small>${unit(daily.precipitation_probability_max?.[i],'%')} de probabilidade</small></span></div>`;
    }).join('');
    const timestamp = new Date(state.loadedAt).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
    const stale = Date.now() - current.time * 1000 > 90 * 60 * 1000;
    text('weather-load-status', `${stale ? 'Atenção: a fonte retornou condições com mais de 90 minutos. ' : ''}Consultado às ${timestamp} · consulta automática a cada 15 min.`);
  }

  async function load(city = state.targetCity) {
    state.targetCity = city;
    const id = ++state.request;
    state.controller?.abort();
    state.controller = new AbortController();
    state.busy = true;
    el('weather-refresh').disabled = true;
    el('weather-content').setAttribute('aria-busy','true');
    text('weather-load-status', `Consultando previsão para ${cityName(city)}…`);
    // Keep the old city's label with its data until the new request succeeds.
    try {
      const data = validate(await json(forecastURL(city), state.controller));
      if (id !== state.request) return;
      state.city = city; state.data = data; state.loadedAt = Date.now();
      render();
    } catch (error) {
      if (id !== state.request) return;
      text('weather-load-status', state.data
        ? `Não foi possível atualizar ${cityName(city)}. Exibindo a consulta anterior de ${cityName(state.city)}, às ${new Date(state.loadedAt).toLocaleTimeString('pt-BR')}. Tente novamente.`
        : 'Não foi possível carregar a previsão. Confira a internet e use “Atualizar previsão” para tentar novamente.');
    } finally {
      if (id === state.request) {
        state.busy = false; el('weather-refresh').disabled = false;
        el('weather-content').setAttribute('aria-busy','false');
      }
    }
  }

  async function search(event) {
    event.preventDefault();
    const query = el('weather-city').value.trim();
    if (query.length < 2) { text('weather-search-status','Digite pelo menos 2 letras.'); return; }
    const id = ++state.searchRequest;
    state.searchController?.abort(); state.searchController = new AbortController();
    el('weather-results').hidden = true;
    el('weather-search-button').disabled = true;
    text('weather-search-status','Buscando cidades…');
    try {
      const params = new URLSearchParams({name:query,count:5,language:'pt',format:'json'});
      const data = await json(`https://geocoding-api.open-meteo.com/v1/search?${params}`,state.searchController);
      if (id !== state.searchRequest) return;
      const cities = (data.results || []).filter(city => typeof city.name === 'string' && finite(city.latitude) && finite(city.longitude));
      text('weather-search-status',cities.length ? 'Selecione a cidade:' : 'Nenhuma cidade encontrada. Tente o nome completo.');
      const list = el('weather-results'); list.replaceChildren();
      for (const city of cities) {
        const li = document.createElement('li'), button = document.createElement('button');
        button.type = 'button'; button.textContent = `${cityName(city)} · ${city.country || ''}`;
        button.addEventListener('click',()=>{ list.hidden=true; text('weather-search-status',''); el('weather-city').value=''; el('weather-city').focus(); load(city); });
        li.appendChild(button); list.appendChild(li);
      }
      list.hidden = !cities.length;
    } catch(error) {
      if(id === state.searchRequest) text('weather-search-status','Não foi possível buscar cidades. Confira a conexão e tente novamente.');
    } finally { if(id === state.searchRequest) el('weather-search-button').disabled=false; }
  }

  document.addEventListener('DOMContentLoaded', () => {
    el('weather-search').addEventListener('submit',search);
    el('weather-refresh').addEventListener('click',()=>load());
    const refreshIfNeeded = () => {
      if (!document.hidden && el('section-tempo').classList.contains('active') && !state.busy && (!state.data || Date.now()-state.loadedAt >= REFRESH_MS)) load();
    };
    document.querySelector('[data-section="tempo"]').addEventListener('click',refreshIfNeeded);
    document.addEventListener('visibilitychange',refreshIfNeeded);
    setInterval(refreshIfNeeded,REFRESH_MS);
  });
  // Pure helpers available only to Node-based verification; nothing added to browser globals.
  if (typeof module !== 'undefined') module.exports = {condition, forecastURL, validate, number, unit};
})();

