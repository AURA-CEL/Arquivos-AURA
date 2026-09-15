/* ============================================================
   AURA
   SISTEMA DE MONITORAMENTO DE RISCO DE ALAGAMENTOS
   ============================================================ */


/* ============================================================
   CONFIGURAÇÃO
   ============================================================ */

const AURA = {

  thresholds: {

    safe: 30,

    attention: 30,
    alert: 60,
    danger: 90

  },


  state: {

    level: 0,

    risk: 'safe',

    mode: 'disconnected',


    sensors: {

      inferior: {
        active: false,
        filtered: 0,
        raw: 0,
        avg: 0
      },

      medio: {
        active: false,
        filtered: 0,
        raw: 0,
        avg: 0
      },

      superior: {
        active: false,
        filtered: 0,
        raw: 0,
        avg: 0
      }

    },


    history: [],

    lastHistoryLevel: null,

    lastChartAt: null,

    max24h: null,

    min24h: null,

    connected: false,

    lastUpdate: null,

    bytesReceived: 0,

    readErrors: 0,


    /* ========================================================
       CHUVA
       ======================================================== */

    rain: {

      tips: 0,

      totalMm: 0,

      hourMm: 0,

      twentyFourHourMm: 0,

      dailyMm: 0,

      eventMm: 0,

      eventActive: false,

      eventStartedAt: null,

      eventEndedAt: null,

      lastTipAt: null,

      lastTipTimestamp: null,

      mmPerTip: 0.968,

      semChuvaMinutes: null,

      tipHistory: [],

      events: []

    }

  },


  serial: {

    port: null,

    reader: null,

    keepReading: false,

    baudRate: 115200

  },


  chart: null

};


/* ============================================================
   CONFIGURAÇÕES DA CHUVA
   ============================================================ */

const RAIN_MM_PER_TIP = 0.968;


/*
   Após 15 minutos sem basculada,
   o evento é considerado encerrado.
*/

const RAIN_EVENT_TIMEOUT =
  15 * 60 * 1000;


/*
   Histórico mantido no navegador.
*/

const RAIN_HISTORY_LIMIT =
  7 * 24 * 60 * 60 * 1000;


/* ============================================================
   UTILITÁRIOS
   ============================================================ */

function pad(value) {

  return String(value)
    .padStart(2, '0');

}


function formatTime(date = new Date()) {

  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;

}


function formatDate(date = new Date()) {

  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;

}


function formatRain(value) {

  return Number(value || 0)
    .toFixed(2)
    .replace('.', ',');

}


function formatDuration(milliseconds) {

  if (
    !Number.isFinite(milliseconds) ||
    milliseconds < 0
  ) {

    return '—';

  }


  const minutes =
    Math.floor(milliseconds / 60000);


  if (minutes < 1) {

    return 'menos de 1 min';

  }


  const hours =
    Math.floor(minutes / 60);


  const remaining =
    minutes % 60;


  if (hours === 0) {

    return `${remaining} min`;

  }


  if (remaining === 0) {

    return `${hours}h`;

  }


  return `${hours}h ${remaining}min`;

}


/* ============================================================
   RISCO
   ============================================================ */

function getRiskStatus(level) {

  const t =
    AURA.thresholds;


  if (level >= t.danger) {

    return 'danger';

  }


  if (level >= t.alert) {

    return 'alert';

  }


  if (level >= t.attention) {

    return 'attention';

  }


  return 'safe';

}


const RISK_META = {

  safe: {

    label: 'SEM DETECÇÃO',

    text:
      'Nenhum sensor detecta água. Isso não garante ausência de risco.',

    color: '#8DA63B'

  },


  attention: {

    label: 'ATENÇÃO',

    text:
      'Nível elevado: acompanhe a situação.',

    color: '#E8B339'

  },


  alert: {

    label: 'ALERTA',

    text:
      'Nível alto: prepare ações preventivas.',

    color: '#E67E22'

  },


  danger: {

    label: 'PERIGO',

    text:
      'Risco elevado: siga os protocolos de segurança.',

    color: '#D64545'

  }

};


/* ============================================================
   LOG
   ============================================================ */

function logMessage(
  text,
  type = 'info'
) {

  const container =
    document.getElementById(
      'serial-log'
    );


  if (!container) return;


  const entry =
    document.createElement(
      'div'
    );


  entry.className =
    `log-entry log-${type}`;


  entry.textContent =
    `[${formatTime()}] ${text}`;


  container.appendChild(entry);


  container.scrollTop =
    container.scrollHeight;


  while (
    container.children.length > 100
  ) {

    container.removeChild(
      container.firstChild
    );

  }

}


/* ============================================================
   RELÓGIO
   ============================================================ */

function updateClock() {

  const now =
    new Date();


  const date =
    document.getElementById(
      'current-date'
    );


  const time =
    document.getElementById(
      'current-time'
    );


  if (date) {

    date.textContent =
      formatDate(now);

  }


  if (time) {

    time.textContent =
      formatTime(now);

  }

}


function updateLastUpdate() {

  const now =
    new Date();


  AURA.state.lastUpdate =
    now;


  const element =
    document.getElementById(
      'last-update'
    );


  if (element) {

    element.textContent =
      `Última atualização: ${formatTime(now)}`;

  }


  const heartbeat =
    document.getElementById(
      'sys-heartbeat'
    );


  if (heartbeat) {

    heartbeat.textContent =
      formatTime(now);

  }

}


/* ============================================================
   CONEXÃO
   ============================================================ */

function setConnectionUI(mode) {

  AURA.state.mode = mode;
  if (mode === 'serial') { AURA.state.lastUpdate = null; AURA.state.rain.hasBaseline = false; }
  renderOverview();


  const dot =
    document.querySelector(
      '#connection-status .status-dot'
    );


  const label =
    document.getElementById(
      'connection-label'
    );


  const badge =
    document.getElementById(
      'arduino-mode-badge'
    );


  const indicator =
    document.getElementById(
      'conn-indicator'
    );


  const title =
    document.getElementById(
      'conn-title'
    );


  const desc =
    document.getElementById(
      'conn-desc'
    );


  const techMode =
    document.getElementById(
      'tech-mode'
    );


  const btn =
    document.getElementById(
      'btn-connect-serial'
    );


  const btn2 =
    document.getElementById(
      'btn-connect-serial-2'
    );


  const disconnect =
    document.getElementById(
      'btn-disconnect'
    );


  if (dot) {

    dot.classList.remove(
      'sim',
      'online',
      'offline'
    );

  }


  if (indicator) {

    indicator.classList.remove(
      'connected',
      'offline'
    );

  }


  if (mode === 'serial') {

    dot?.classList.add(
      'online'
    );


    if (label) {

      label.textContent =
        'Arduino conectado';

    }


    if (badge) {

      badge.textContent =
        'SERIAL';

      badge.className =
        'badge online';

    }


    indicator?.classList.add(
      'connected'
    );


    if (title) {

      title.textContent =
        'Arduino conectado';

    }


    if (desc) {

      desc.textContent =
        'Recebendo dados reais via Web Serial API.';

    }


    if (techMode) {

      techMode.textContent =
        'Serial';

    }


    if (btn) {

      btn.textContent =
        'Desconectar Arduino';

    }


    if (btn2) {

      btn2.textContent =
        'Desconectar Arduino';

    }


    if (disconnect) {

      disconnect.disabled =
        false;

    }


    return;

  }


  dot?.classList.add(
    'offline'
  );


  if (label) {

    label.textContent =
      'Arduino desconectado';

  }


  if (badge) {

    badge.textContent =
      'OFFLINE';

    badge.className =
      'badge danger';

  }


  indicator?.classList.add(
    'offline'
  );


  if (title) {

    title.textContent =
      'Arduino desconectado';

  }


  if (desc) {

    desc.textContent =
      'Conecte o Arduino para receber leituras reais.';

  }


  if (techMode) {

    techMode.textContent =
      'Desconectado';

  }


  if (btn) {

    btn.textContent =
      'Conectar Arduino';

  }


  if (btn2) {

    btn2.textContent =
      'Conectar via Serial';

  }


  if (disconnect) {

    disconnect.disabled =
      true;

  }

}


/* ============================================================
   INDICADOR DE RISCO
   ============================================================ */

function updateGauge(level) {

  const value =
    Math.max(
      0,
      Math.min(
        100,
        Number(level) || 0
      )
    );


  const progress =
    document.getElementById(
      'gauge-progress'
    );


  const needle =
    document.getElementById(
      'gauge-needle'
    );


  const valueEl =
    document.getElementById(
      'risk-level-value'
    );


  const badge =
    document.getElementById(
      'risk-badge'
    );


  const status =
    document.getElementById(
      'risk-status-text'
    );


  const length =
    283;


  if (progress) {

    progress.style.strokeDashoffset =
      length -
      (value / 100) * length;

  }


  if (needle) {

    const angle =
      -90 +
      (value / 100) * 180;

    needle.style.transform =
      `rotate(${angle}deg)`;

  }


  if (valueEl) {

    valueEl.textContent =
      value.toFixed(0);

  }


  const risk =
    getRiskStatus(value);


  const meta =
    RISK_META[risk];


  if (progress) {

    progress.style.stroke =
      meta.color;

  }


  if (badge) {

    badge.textContent =
      meta.label;

    badge.className =
      `badge ${risk}`;

  }


  if (status) {

    status.textContent =
      meta.text;

  }


  AURA.state.risk =
    risk;

  AURA.state.level =
    value;

}


/* ============================================================
   RÉGUA
   ============================================================ */

function updateRiverRuler(level) {

  const value =
    Math.max(
      0,
      Math.min(
        100,
        Number(level) || 0
      )
    );


  const water =
    document.getElementById(
      'river-water'
    );


  const indicator =
    document.getElementById(
      'river-indicator'
    );


  const label =
    document.getElementById(
      'river-indicator-label'
    );


  const status =
    document.getElementById(
      'river-ruler-status'
    );


  if (!water) return;


  const risk =
    getRiskStatus(value);


  const colors = {

    safe: '#49B7D7',

    attention: '#E8B339',

    alert: '#E67E22',

    danger: '#D64545'

  };


  water.style.height =
    `${value}%`;


  water.style.background =
    `linear-gradient(to top, ${colors[risk]}, #67d7f2)`;


  if (indicator) {

    indicator.style.bottom =
      `${value}%`;

    indicator.style.background =
      colors[risk];

  }


  if (label) {

    label.textContent =
      `${value.toFixed(0)}%`;

  }


  if (status) {

    status.textContent =
      RISK_META[risk].label;

  }

}


/* ============================================================
   NÍVEL
   ============================================================ */

function animateNumber(
  element,
  from,
  to,
  duration
) {

  if (!element) return;


  const start =
    performance.now();


  const difference =
    to - from;


  function step(now) {

    const progress =
      Math.min(
        (now - start) /
        duration,
        1
      );


    const eased =
      1 -
      Math.pow(
        1 - progress,
        3
      );


    element.textContent =
      (
        from +
        difference * eased
      ).toFixed(1);


    if (progress < 1) {

      requestAnimationFrame(
        step
      );

    }

  }


  requestAnimationFrame(
    step
  );

}


function updateLevelDisplay(level) {

  const element =
    document.getElementById(
      'current-level'
    );


  const bar =
    document.getElementById(
      'level-bar'
    );


  const current =
    parseFloat(
      element?.textContent
    ) || 0;


  animateNumber(
    element,
    current,
    level,
    500
  );


  if (bar) {

    bar.style.width =
      `${Math.min(level, 100)}%`;

  }


  const risk =
    getRiskStatus(level);


  const colors = {

    safe:
      'linear-gradient(90deg,#8DA63B,#49B7D7)',

    attention:
      'linear-gradient(90deg,#E8B339,#F0C14A)',

    alert:
      'linear-gradient(90deg,#E67E22,#F39C12)',

    danger:
      'linear-gradient(90deg,#D64545,#E74C3C)'

  };


  if (bar) {

    bar.style.background =
      colors[risk];

  }


  if (
    AURA.state.max24h === null ||
    level > AURA.state.max24h
  ) {

    AURA.state.max24h =
      level;

  }


  if (
    AURA.state.min24h === null ||
    level < AURA.state.min24h
  ) {

    AURA.state.min24h =
      level;

  }


  const max =
    document.getElementById(
      'max-24h'
    );


  const min =
    document.getElementById(
      'min-24h'
    );


  if (max) {

    max.textContent =
      `${AURA.state.max24h.toFixed(1)}%`;

  }


  if (min) {

    min.textContent =
      `${AURA.state.min24h.toFixed(1)}%`;

  }

}


/* ============================================================
   SENSORES
   ============================================================ */

function updateSensors(
  sensors
) {

  if (!sensors) return;


  const keys = [
    'inferior',
    'medio',
    'superior'
  ];


  keys.forEach(
    key => {

      const reading =
        sensors[key];


      if (!reading) return;


      AURA.state.sensors[key] = {

        active:
          Boolean(reading.active),

        filtered:
          Number(reading.filtered) || 0,

        raw:
          Number(reading.raw) || 0,

        avg:
          Number(reading.avg) || 0

      };

    }
  );


  const activeCount =
    keys.filter(
      key =>
        AURA.state.sensors[key].active
    ).length;


  const element =
    document.getElementById(
      'sys-sensors'
    );


  if (element) {

    element.textContent =
      `${activeCount}/3 ativos`;

  }


  renderMonitoring();

}


/* ============================================================
   CHUVA — REGISTRO
   ============================================================ */

function registerRainTip(
  totalTips,
  timestamp = Date.now()
) {

  const rain =
    AURA.state.rain;


  totalTips = Number(totalTips);
  if (Number.isInteger(totalTips) && totalTips >= 0 && !rain.hasBaseline) { rain.tips = totalTips; rain.hasBaseline = true; return; }


  if (
    !Number.isFinite(totalTips)
  ) {

    return;

  }


  /*
     Se o Arduino reiniciou,
     o contador pode voltar para zero.
  */

  if (
    totalTips < rain.tips
  ) {

    rain.tipHistory =
      [];

    rain.eventMm =
      0;

    rain.eventActive =
      false;

    rain.eventStartedAt =
      null;

    rain.eventEndedAt =
      null;

    rain.events =
      [];

  }


  const previous = totalTips < rain.tips ? 0 : Number(rain.tips || 0);


  const newTips =
    Math.max(
      0,
      totalTips - previous
    );


  rain.tips =
    totalTips;


  /*
     Registra cada basculada nova.
  */

  for (
    let i = 0;
    i < newTips;
    i++
  ) {

    const tipTime =
      timestamp -
      (
        (newTips - 1 - i) *
        100
      );


    rain.tipHistory.push({

      timestamp:
        tipTime,

      mm:
        RAIN_MM_PER_TIP

    });

  }


  /*
     Remove histórico antigo.
  */

  const cutoff =
    timestamp -
    RAIN_HISTORY_LIMIT;


  rain.tipHistory =
    rain.tipHistory.filter(
      item =>
        item.timestamp >=
        cutoff
    );


  /*
     Se houve chuva nova.
  */

  if (newTips > 0) {

    rain.lastTipTimestamp =
      timestamp;


    rain.lastTipAt =
      new Date(timestamp);


    /*
       Se não havia evento,
       começa um novo.
    */

    if (!rain.eventActive) {

      rain.eventActive =
        true;


      rain.eventStartedAt =
        new Date(timestamp);


      rain.eventEndedAt =
        null;


      rain.eventMm =
        0;

    }


    /*
       Soma a chuva ao evento.
    */

    rain.eventMm +=
      newTips *
      RAIN_MM_PER_TIP;

  }

}


/* ============================================================
   CHUVA — JANELAS
   ============================================================ */

function calculateRainWindows(
  now = Date.now()
) {

  const rain =
    AURA.state.rain;


  const history =
    rain.tipHistory || [];


  /*
     ÚLTIMA HORA
  */

  const hourCutoff =
    now -
    60 * 60 * 1000;


  rain.hourMm =
    history
      .filter(
        item =>
          item.timestamp >=
          hourCutoff
      )
      .reduce(
        (
          sum,
          item
        ) =>
          sum + item.mm,
        0
      );


  /*
     ÚLTIMAS 24 HORAS
  */

  const dayCutoff =
    now -
    24 * 60 * 60 * 1000;


  rain.twentyFourHourMm =
    history
      .filter(
        item =>
          item.timestamp >=
          dayCutoff
      )
      .reduce(
        (
          sum,
          item
        ) =>
          sum + item.mm,
        0
      );


  /*
     ACUMULADO DIÁRIO

     De 00:00 até agora.
  */

  const today =
    new Date(now);


  today.setHours(
    0,
    0,
    0,
    0
  );


  rain.dailyMm =
    history
      .filter(
        item =>
          item.timestamp >=
          today.getTime()
      )
      .reduce(
        (
          sum,
          item
        ) =>
          sum + item.mm,
        0
      );


  /*
     EVENTO

     Termina após 15 minutos sem
     nova basculada.
  */

  if (
    rain.eventActive &&
    rain.lastTipTimestamp !== null &&
    now -
      rain.lastTipTimestamp >=
      RAIN_EVENT_TIMEOUT
  ) {

    rain.eventActive =
      false;


    rain.eventEndedAt =
      new Date(
        rain.lastTipTimestamp
      );


    /*
       Guarda o evento encerrado.
    */

    if (
      rain.eventMm > 0 &&
      rain.eventStartedAt
    ) {

      rain.events.unshift({

        start:
          rain.eventStartedAt,

        end:
          rain.eventEndedAt,

        mm:
          rain.eventMm

      });


      /*
         Mantém somente os últimos 30 eventos.
      */

      if (
        rain.events.length > 30
      ) {

        rain.events.pop();

      }

    }

  }


  /*
     TEMPO SEM CHUVA
  */

  if (
    rain.lastTipTimestamp !== null
  ) {

    rain.semChuvaMinutes =
      Math.floor(
        (
          now -
          rain.lastTipTimestamp
        ) /
        60000
      );

  }

  else {

    rain.semChuvaMinutes =
      null;

  }

}


/* ============================================================
   CHUVA — INTERFACE
   ============================================================ */

function updateRainDisplay(
  pluviometro
) {

  if (!pluviometro) {

    calculateRainWindows();

    renderRain();

    return;

  }


  const tips =
    Number(
      pluviometro.basculadas
    );


  const totalMm =
    Number(
      pluviometro.chuva_mm
    );


  if (
    Number.isFinite(tips)
  ) {

    registerRainTip(
      tips
    );

  }


  if (
    Number.isFinite(totalMm)
  ) {

    AURA.state.rain.totalMm =
      totalMm;

  }


  calculateRainWindows();

  renderRain();

}


/* ============================================================
   RENDERIZA PLUVIÔMETRO
   ============================================================ */

function renderRain() {

  const rain =
    AURA.state.rain;


  const now =
    Date.now();


  const raining =
    rain.lastTipTimestamp !== null &&
    now -
      rain.lastTipTimestamp <
      RAIN_EVENT_TIMEOUT;


  const hour =
    document.getElementById(
      'rain-hour'
    );


  const day24 =
    document.getElementById(
      'rain-24h'
    );


  const daily =
    document.getElementById(
      'rain-day'
    );


  const event =
    document.getElementById(
      'rain-event'
    );


  const tips =
    document.getElementById(
      'rain-tips'
    );


  const last =
    document.getElementById(
      'rain-last'
    );


  const since =
    document.getElementById(
      'rain-since'
    );


  const badge =
    document.getElementById(
      'rain-badge'
    );


  if (hour) {

    hour.textContent =
      formatRain(
        rain.hourMm
      );

  }


  if (day24) {

    day24.textContent =
      `${formatRain(rain.twentyFourHourMm)} mm`;

  }


  if (daily) {

    daily.textContent =
      `${formatRain(rain.dailyMm)} mm`;

  }


  if (event) {

    event.textContent =
      `${formatRain(rain.eventMm)} mm`;

  }


  if (tips) {

    tips.textContent =
      rain.tips;

  }


  if (last) {

    last.textContent =
      rain.lastTipAt
        ? formatTime(
            rain.lastTipAt
          )
        : '—';

  }


  if (since) {

    since.textContent =
      rain.lastTipTimestamp !== null
        ? formatDuration(
            now -
            rain.lastTipTimestamp
          )
        : '—';

  }


  if (badge) {

    badge.textContent =
      raining
        ? 'CHUVA DETECTADA'
        : 'SEM CHUVA';


    badge.className =
      raining
        ? 'badge rain-active'
        : 'badge';

  }


  renderMonitoringRain();

  renderRainAnalysis();

  renderRainEvents();

}


/* ============================================================
   MONITORAMENTO
   ============================================================ */

function renderMonitoring() {

  const container =
    document.getElementById(
      'monitoring-cards'
    );


  if (!container) return;


  const names = {

    inferior:
      'Sensor inferior',

    medio:
      'Sensor médio',

    superior:
      'Sensor superior'

  };


  container.innerHTML =
    Object.entries(
      AURA.state.sensors
    )
    .map(
      (
        [
          key,
          sensor
        ]
      ) => `

        <div class="monitor-card">

          <span class="monitor-label">
            ${names[key]}
          </span>

          <strong class="${
            sensor.active
              ? 'active'
              : ''
          }">

            ${
              sensor.active
                ? 'Água detectada'
                : 'Sem detecção'
            }

          </strong>

          <small>

            Bruto: ${sensor.raw}

            · Média: ${Number(
              sensor.avg
            ).toFixed(1)}

            · Filtrado: ${Number(
              sensor.filtered
            ).toFixed(1)}

          </small>

        </div>

      `
    )
    .join('');

}


/* ============================================================
   MONITORAMENTO DA CHUVA
   ============================================================ */

function renderMonitoringRain() {

  const container =
    document.getElementById(
      'monitoring-rain'
    );


  if (!container) return;


  const rain =
    AURA.state.rain;


  container.innerHTML = `

    <div class="rain-monitor-grid">

      <div>
        <span>Última hora</span>
        <strong>${formatRain(
          rain.hourMm
        )} mm</strong>
      </div>

      <div>
        <span>Últimas 24h</span>
        <strong>${formatRain(
          rain.twentyFourHourMm
        )} mm</strong>
      </div>

      <div>
        <span>Hoje</span>
        <strong>${formatRain(
          rain.dailyMm
        )} mm</strong>
      </div>

      <div>
        <span>Evento atual</span>
        <strong>${formatRain(
          rain.eventMm
        )} mm</strong>
      </div>

      <div>
        <span>Basculadas</span>
        <strong>${rain.tips}</strong>
      </div>

      <div>
        <span>Sem chuva há</span>
        <strong>${
          rain.lastTipTimestamp !== null
            ? formatDuration(
                Date.now() -
                rain.lastTipTimestamp
              )
            : '—'
        }</strong>
      </div>

    </div>

  `;

}


/* ============================================================
   HISTÓRICO DE NÍVEL
   ============================================================ */

function addHistoryEntry(
  level,
  previousLevel
) {

  const risk =
    getRiskStatus(level);


  const entry = {

    time:
      formatTime(),

    level:
      level.toFixed(1),

    previousLevel,

    risk

  };


  AURA.state.history.unshift(
    entry
  );


  if (
    AURA.state.history.length >
    30
  ) {

    AURA.state.history.pop();

  }


  renderTimeline(
    'timeline-container',
    AURA.state.history.slice(
      0,
      6
    )
  );


  renderTimeline(
    'timeline-full',
    AURA.state.history
  );


  renderHistorySummary();

}


/* ============================================================
   TIMELINE
   ============================================================ */

function renderTimeline(
  containerId,
  entries
) {

  const container =
    document.getElementById(
      containerId
    );


  if (!container) return;


  if (!entries.length) {

    container.innerHTML =
      '<p class="empty-history">Ainda não há alterações registradas.</p>';

    return;

  }


  container.innerHTML =
    entries
      .map(
        entry => `

          <div class="timeline-item">

            <div class="timeline-icon ${
              entry.risk
            }">
              •
            </div>

            <div class="timeline-content">

              <div class="timeline-time">
                ${entry.time}
              </div>

              <div class="timeline-level">

                ${
                  entry.previousLevel === null
                    ? 'Monitoramento iniciado'
                    : `Nível alterado de ${
                        Number(
                          entry.previousLevel
                        ).toFixed(0)
                      }% para ${
                        Number(
                          entry.level
                        ).toFixed(0)
                      }%`
                }

              </div>

              <div class="timeline-status">
                ${
                  RISK_META[
                    entry.risk
                  ].label
                }
              </div>

            </div>

          </div>

        `
      )
      .join('');

}


/* ============================================================
   RESUMO DO HISTÓRICO
   ============================================================ */

function renderHistorySummary() {

  const target =
    document.getElementById(
      'history-summary'
    );


  if (!target) return;


  const entries =
    AURA.state.history;


  target.innerHTML = `

    <div>

      <span>
        Alterações
      </span>

      <strong>
        ${Math.max(
          0,
          entries.length - 1
        )}
      </strong>

    </div>


    <div>

      <span>
        Nível atual
      </span>

      <strong>
        ${AURA.state.level.toFixed(0)}%
      </strong>

    </div>


    <div>

      <span>
        Maior nível
      </span>

      <strong>
        ${
          AURA.state.max24h === null
            ? '—'
            : AURA.state.max24h.toFixed(0) + '%'
        }
      </strong>

    </div>


    <div>

      <span>
        Última alteração
      </span>

      <strong>
        ${
          entries[0]
            ? entries[0].time
            : '—'
        }
      </strong>

    </div>

  `;

}


/* ============================================================
   GRÁFICO
   ============================================================ */

function initChart() {

  const canvas =
    document.getElementById(
      'levelChart'
    );


  if (!canvas || typeof Chart === 'undefined') return;


  const ctx =
    canvas.getContext(
      '2d'
    );


  AURA.chart =
    new Chart(
      ctx,
      {

        type:
          'line',


        data: {

          labels: [],


          datasets: [

            {

              label:
                'Nível',

              data: [],

              borderColor:
                '#49B7D7',

              backgroundColor:
                'rgba(73,183,215,.15)',

              borderWidth:
                2.5,

              fill:
                true,

              tension: 0,
              stepped: true,

              pointRadius:
                3

            }

          ]

        },


        options: {

          responsive:
            true,

          maintainAspectRatio:
            false,


          scales: {

            y: {

              beginAtZero:
                true,

              max:
                100,

              ticks: {

                callback:
                  value =>
                    `${value}%`

              }

            }

          }

        }

      }
    );

}


function updateChart(
  level
) {

  if (!AURA.chart) return;


  const now =
    new Date();


  const labels =
    AURA.chart.data.labels;


  const data =
    AURA.chart.data.datasets[0].data;


  labels.push(
    `${pad(
      now.getHours()
    )}:${pad(
      now.getMinutes()
    )}`
  );


  data.push(
    Number(
      level.toFixed(1)
    )
  );


  if (
    labels.length > 60
  ) {

    labels.shift();

    data.shift();

  }


  AURA.chart.update(
    'active'
  );

}


/* ============================================================
   LEITURA COMPLETA
   ============================================================ */

function applyReading(
  reading
) {

  const keys = ['inferior', 'medio', 'superior'];
  if (!reading || !keys.every(key => {
    const sensor = reading.sensors?.[key];
    return sensor && typeof sensor.active === 'boolean' &&
      ['raw', 'avg', 'filtered'].every(field => typeof sensor[field] === 'number' && Number.isFinite(sensor[field]) && sensor[field] >= 0 && sensor[field] <= 1023);
  })) return;
  const count = keys.filter(key => reading.sensors[key].active).length;
  const level = Number((count * 100 / 3).toFixed(1));
  if (typeof reading.level !== 'number' || !Number.isFinite(reading.level) || Math.abs(reading.level - level) > 0.2) return;
  AURA.state.inconsistent = (reading.sensors.superior.active && !reading.sensors.medio.active) || (reading.sensors.medio.active && !reading.sensors.inferior.active);
  const rain = reading.pluviometro;
  AURA.state.rainAvailable = !!rain && Number.isInteger(rain.basculadas) && rain.basculadas >= 0 && typeof rain.chuva_mm === 'number' && Number.isFinite(rain.chuva_mm) && rain.chuva_mm >= 0;
  if (!AURA.state.rainAvailable) reading = {...reading, pluviometro: null};
  updateGauge(
    level
  );


  updateRiverRuler(
    level
  );


  updateLevelDisplay(
    level
  );


  updateSensors(
    reading.sensors
  );


  updateRainDisplay(
    reading.pluviometro
  );


  const now =
    Date.now();


  const changed =
    AURA.state.lastHistoryLevel === null ||
    level !==
      AURA.state.lastHistoryLevel;


  if (changed) {

    addHistoryEntry(
      level,
      AURA.state.lastHistoryLevel
    );


    AURA.state.lastHistoryLevel =
      level;

  }


  if (
    changed ||
    AURA.state.lastChartAt === null ||
    now -
      AURA.state.lastChartAt >=
      60000
  ) {

    updateChart(
      level
    );


    AURA.state.lastChartAt =
      now;

  }


  updateLastUpdate();
  renderOverview();

}


/* ============================================================
   PARSER SERIAL
   ============================================================ */

function parseSerialLine(
  line
) {

  const cleaned =
    line.trim();


  if (!cleaned) {

    return null;

  }


  /*
     Novo protocolo JSON.
  */

  try {

    const reading =
      JSON.parse(
        cleaned
      );


    const keys = [
      'inferior',
      'medio',
      'superior'
    ];


    if (
      Number.isFinite(
        Number(
          reading.level
        )
      ) &&
      reading.sensors &&
      keys.every(
        key =>
          reading.sensors[key]
      )
    ) {


      


      return reading;

    }

  }

  catch (error) {

    /*
       Não é JSON.
       Continua.
    */

  }


  return null;

}


/* ============================================================
   CONEXÃO SERIAL
   ============================================================ */

async function connectSerial() {

  if (
    !('serial' in navigator)
  ) {

    alert(
      'Seu navegador não suporta Web Serial API. Use Google Chrome ou Microsoft Edge.'
    );

    return;

  }


  try {

    const port =
      await navigator.serial.requestPort();


    await port.open({

      baudRate:
        AURA.serial.baudRate

    });


    AURA.serial.port =
      port;


    AURA.serial.keepReading =
      true;


    AURA.state.connected =
      true;


    setConnectionUI(
      'serial'
    );


    const info =
      port.getInfo();


    const portLabel =
      info.usbVendorId
        ? `USB ${info.usbVendorId.toString(16)}:${(
            info.usbProductId || 0
          ).toString(16)}`
        : 'Porta serial';


    const techPort =
      document.getElementById(
        'tech-port'
      );


    if (techPort) {

      techPort.textContent =
        portLabel;

    }


    const arduino =
      document.getElementById(
        'sys-arduino'
      );


    if (arduino) {

      arduino.textContent =
        'Online';

      arduino.classList.add(
        'online'
      );

    }


    const serial =
      document.getElementById(
        'sys-serial'
      );


    if (serial) {

      serial.textContent =
        'Estável';

      serial.classList.add(
        'online'
      );

    }


    logMessage(
      `Arduino conectado em ${portLabel}.`,
      'info'
    );


    await readSerialLoop();

  }

  catch (error) {

    if (
      error.name ===
      'NotFoundError'
    ) {

      logMessage(
        'Nenhuma porta selecionada.',
        'warn'
      );

    }

    else {

      logMessage(
        `Erro ao conectar: ${error.message}`,
        'error'
      );

      console.error(
        error
      );

    }

  }

}


/* ============================================================
   LEITURA SERIAL
   ============================================================ */

async function readSerialLoop() {

  const port =
    AURA.serial.port;


  if (
    !port ||
    !port.readable
  ) {

    return;

  }


  const decoder =
    new TextDecoderStream();


  const readableClosed = port.readable.pipeTo(decoder.writable).catch(() => {});


  const reader =
    decoder.readable.getReader();


  AURA.serial.reader =
    reader;


  let buffer =
    '';


  try {

    while (
      AURA.serial.keepReading
    ) {

      const {
        value,
        done
      } =
        await reader.read();


      if (done) {

        break;

      }


      AURA.state.bytesReceived +=
        value.length;


      const bytes =
        document.getElementById(
          'tech-bytes'
        );


      if (bytes) {

        bytes.textContent =
          AURA.state.bytesReceived;

      }


      buffer +=
        value;


      const lines =
        buffer.split(
          /\r?\n/
        );


      buffer =
        lines.pop();


      for (
        const line of lines
      ) {

        if (
          !line.trim()
        ) {

          continue;

        }


        const reading =
          parseSerialLine(
            line
          );


        if (
          reading !== null
        ) {

          applyReading(
            reading
          );


          logMessage(
            'Leitura recebida.',
            'data'
          );

        }

        else {

          AURA.state.readErrors++;


          const errors =
            document.getElementById(
              'tech-errors'
            );


          if (errors) {

            errors.textContent =
              AURA.state.readErrors;

          }

        }

      }

    }

  }

  catch (error) {

    logMessage(
      `Erro de leitura: ${error.message}`,
      'error'
    );

  }

  finally {

    reader.releaseLock();
    await readableClosed;
    AURA.serial.reader = null;
    AURA.state.connected = false;
    setConnectionUI('disconnected');
    try { await port.close(); } catch (_) { /* Already closed by disconnect. */ }
    AURA.serial.port = null;

  }

}


/* ============================================================
   DESCONECTAR
   ============================================================ */

async function disconnectSerial() {

  AURA.serial.keepReading =
    false;


  try {

    if (
      AURA.serial.reader
    ) {

      await AURA.serial.reader.cancel();

      AURA.serial.reader =
        null;

    }


    if (
      AURA.serial.port
    ) {

      await AURA.serial.port.close();

      AURA.serial.port =
        null;

    }

  }

  catch (error) {

    console.warn(
      error
    );

  }


  AURA.state.connected =
    false;


  setConnectionUI(
    'disconnected'
  );


  const arduino =
    document.getElementById(
      'sys-arduino'
    );


  if (arduino) {

    arduino.textContent =
      'Offline';

    arduino.classList.remove(
      'online'
    );

  }


  const serial =
    document.getElementById(
      'sys-serial'
    );


  if (serial) {

    serial.textContent =
      '—';

    serial.classList.remove(
      'online'
    );

  }


  logMessage(
    'Arduino desconectado.',
    'warn'
  );

}


/* ============================================================
   NAVEGAÇÃO
   ============================================================ */

function initNavigation() {

  const buttons =
    document.querySelectorAll(
      '.nav-item'
    );


  const sections =
    document.querySelectorAll(
      '.section'
    );


  buttons.forEach(
    button => {

      button.addEventListener(
        'click',
        () => {

          const target =
            button.dataset.section;


          buttons.forEach(
            item =>
              item.classList.remove(
                'active'
              )
          );


          button.classList.add('active');
          buttons.forEach(item => item === button ? item.setAttribute('aria-current', 'page') : item.removeAttribute('aria-current'));


          sections.forEach(
            section => {

              section.classList.toggle(
                'active',
                section.id ===
                  `section-${target}`
              );

            }
          );

        }
      );

    }
  );

}


/* ============================================================
   EVENTOS DOS BOTÕES
   ============================================================ */

function initUIEvents() {

  const connect =
    document.getElementById(
      'btn-connect-serial'
    );


  const connect2 =
    document.getElementById(
      'btn-connect-serial-2'
    );


  const disconnect =
    document.getElementById(
      'btn-disconnect'
    );


  connect?.addEventListener(
    'click',
    () => {

      if (
        AURA.state.mode ===
        'serial'
      ) {

        disconnectSerial();

      }

      else {

        connectSerial();

      }

    }
  );


  connect2?.addEventListener(
    'click',
    () => {

      if (
        AURA.state.mode ===
        'serial'
      ) {

        disconnectSerial();

      }

      else {

        connectSerial();

      }

    }
  );


  disconnect?.addEventListener(
    'click',
    disconnectSerial
  );


  document
    .getElementById(
      'btn-clear-log'
    )
    ?.addEventListener(
      'click',
      () => {

        const log =
          document.getElementById(
            'serial-log'
          );


        if (log) {

          log.innerHTML =
            '';

        }

        logMessage(
          'Log limpo.',
          'info'
        );

      }
    );


  document
    .getElementById(
      'btn-export-csv'
    )
    ?.addEventListener(
      'click',
      exportCSV
    );


  document
    .getElementById(
      'btn-export-report'
    )
    ?.addEventListener(
      'click',
      exportReport
    );

}


/* ============================================================
   EXPORTAÇÃO CSV
   ============================================================ */

function exportCSV() {

  const rows = [

    'Horário,Nível,Status,Chuva 1h,Chuva 24h,Chuva diária,Evento'

  ];


  const rain =
    AURA.state.rain;


  AURA.state.history
    .forEach(
      entry => {

        rows.push(

          `${entry.time},` +
          `${entry.level},` +
          `${RISK_META[entry.risk].label},` +
          `${formatRain(rain.hourMm)},` +
          `${formatRain(rain.twentyFourHourMm)},` +
          `${formatRain(rain.dailyMm)},` +
          `${formatRain(rain.eventMm)}`

        );

      }
    );


  const blob =
    new Blob(
      [
        rows.join('\n')
      ],
      {
        type:
          'text/csv;charset=utf-8;'
      }
    );


  const url =
    URL.createObjectURL(
      blob
    );


  const link =
    document.createElement(
      'a'
    );


  link.href =
    url;


  link.download =
    `aura-${formatDate().replace(
      /\//g,
      '-'
    )}.csv`;


  link.click();


  URL.revokeObjectURL(
    url
  );

}


/* ============================================================
   RELATÓRIO
   ============================================================ */

function exportReport() {

  const rain =
    AURA.state.rain;


  const report = `RELATÓRIO AURA

Gerado em:
${formatDate()} ${formatTime()}

NÍVEL
Nível atual:
${AURA.state.level.toFixed(1)}%

Status:
${RISK_META[AURA.state.risk].label}

Maior nível:
${
  AURA.state.max24h === null
    ? '—'
    : AURA.state.max24h.toFixed(1) + '%'
}

CHUVA

Última hora:
${formatRain(rain.hourMm)} mm

Últimas 24 horas:
${formatRain(rain.twentyFourHourMm)} mm

Acumulado hoje:
${formatRain(rain.dailyMm)} mm

Evento atual:
${formatRain(rain.eventMm)} mm

Basculadas:
${rain.tips}

Última basculada:
${
  rain.lastTipAt
    ? formatTime(rain.lastTipAt)
    : '—'
}

Sem chuva há:
${
  rain.lastTipTimestamp !== null
    ? formatDuration(
        Date.now() -
        rain.lastTipTimestamp
      )
    : '—'
}

Calibração:
0,968 mm / basculada
`;


  const blob =
    new Blob(
      [report],
      {
        type:
          'text/plain;charset=utf-8'
      }
    );


  const url =
    URL.createObjectURL(
      blob
    );


  const link =
    document.createElement(
      'a'
    );


  link.href =
    url;


  link.download =
    `aura-relatorio-${formatDate().replace(
      /\//g,
      '-'
    )}.txt`;


  link.click();


  URL.revokeObjectURL(
    url
  );

}


/* ============================================================
   EVENTOS DE CHUVA
   ============================================================ */

function renderRainEvents() {

  const container =
    document.getElementById(
      'rain-events-history'
    );


  if (!container) return;


  const events =
    AURA.state.rain.events;


  if (!events.length) {

    container.innerHTML =
      '<p class="empty-history">Ainda não há eventos de chuva encerrados.</p>';

    return;

  }


  container.innerHTML =
    events
      .map(
        event => `

          <div class="rain-event-row">

            <div>

              <strong>
                ${formatRain(
                  event.mm
                )} mm
              </strong>

              <span>
                ${
                  formatTime(
                    event.start
                  )
                }
                →
                ${
                  formatTime(
                    event.end
                  )
                }
              </span>

            </div>

          </div>

        `
      )
      .join('');

}


/* ============================================================
   ANÁLISES
   ============================================================ */

function renderAnalysis() {

  const container =
    document.getElementById(
      'analysis-grid'
    );


  if (!container) return;


  const points =
    AURA.chart
      ?.data
      .datasets[0]
      .data || [];


  const average =
    points.length
      ? points.reduce(
          (
            sum,
            value
          ) =>
            sum + value,
          0
        ) /
        points.length
      : 0;


  const first =
    points[0] ?? 0;


  const last =
    points.at(-1) ?? 0;


  const trend =
    last - first;


  const trendText =
    trend > 15
      ? 'Tendência de alta'
      : trend < -15
        ? 'Tendência de queda'
        : 'Nível estável';


  const rain =
    AURA.state.rain;


  container.innerHTML = `

    <div class="analysis-metric">

      <span>
        Média do nível
      </span>

      <strong>
        ${average.toFixed(0)}%
      </strong>

      <small>
        Das últimas amostras
      </small>

    </div>


    <div class="analysis-metric">

      <span>
        Tendência
      </span>

      <strong>
        ${trendText}
      </strong>

      <small>
        Variação recente
      </small>

    </div>


    <div class="analysis-metric">

      <span>
        Chuva última hora
      </span>

      <strong>
        ${formatRain(
          rain.hourMm
        )} mm
      </strong>

      <small>
        Janela móvel
      </small>

    </div>


    <div class="analysis-metric">

      <span>
        Chuva últimas 24h
      </span>

      <strong>
        ${formatRain(
          rain.twentyFourHourMm
        )} mm
      </strong>

      <small>
        Janela móvel
      </small>

    </div>

  `;

}


/* ============================================================
   ANÁLISE DA CHUVA
   ============================================================ */

function renderRainAnalysis() {

  const container =
    document.getElementById(
      'rain-analysis'
    );


  if (!container) return;


  const rain =
    AURA.state.rain;


  container.innerHTML = `

    <div class="rain-analysis-grid">

      <div>

        <span>
          Última hora
        </span>

        <strong>
          ${formatRain(
            rain.hourMm
          )} mm
        </strong>

      </div>


      <div>

        <span>
          Últimas 24h
        </span>

        <strong>
          ${formatRain(
            rain.twentyFourHourMm
          )} mm
        </strong>

      </div>


      <div>

        <span>
          Hoje
        </span>

        <strong>
          ${formatRain(
            rain.dailyMm
          )} mm
        </strong>

      </div>


      <div>

        <span>
          Evento
        </span>

        <strong>
          ${formatRain(
            rain.eventMm
          )} mm
        </strong>

      </div>

    </div>

  `;

}


/* ============================================================
   INICIALIZAÇÃO
   ============================================================ */

function init() {

  updateClock();


  setInterval(
    updateClock,
    1000
  );


  /*
     Atualiza as janelas da chuva
     a cada segundo.
  */

  setInterval(
    () => {

      calculateRainWindows();

      renderRain();

      renderAnalysis();

    },
    1000
  );


  initNavigation();
  document.getElementById('open-technical')?.addEventListener('click', () => {
    const tab = document.querySelector('[data-section="tecnico"]');
    tab.click(); tab.focus(); window.scrollTo({top: 0, behavior: 'smooth'});
  });
  setInterval(renderOverview, 1000);

  initChart();

  initUIEvents();

  renderMonitoring();

  renderRain();

  renderAnalysis();

  renderHistorySummary();


  setConnectionUI(
    'disconnected'
  );


  logMessage(
    'AURA iniciado. Aguardando conexão com o Arduino.',
    'info'
  );


  /*
     Disponibiliza para testes pelo console.
  */

  window.AURA =
    AURA;


  window.AURA_EXT = {

    connectSerial,

    disconnectSerial,

    applyReading,

    exportCSV,

    exportReport

  };

}


/* ============================================================
   START
   ============================================================ */

document.addEventListener(
  'DOMContentLoaded',
  init
);
/* Plain-language overview. A reading expires after 5 seconds (10 expected frames). */
function renderOverview() {
  const set = (id, text) => { const el = document.getElementById(id); if (el && el.textContent !== text) el.textContent = text; };
  const state = AURA.state;
  const fresh = state.mode === 'serial' && state.lastUpdate && Date.now() - state.lastUpdate.getTime() < 5000;
  renderLiveRuler(!!fresh);
  const sensors = ['inferior','medio','superior'].map(key => state.sensors[key].active);
  const count = sensors.filter(Boolean).length;
  const valid = fresh && !state.inconsistent;
  if (!valid) {
    set('risk-badge', 'SEM DADOS ATUAIS');
    set('risk-status-text', 'Aguarde uma leitura válida para interpretar o índice.');
  }
  const messages = [
    ['Sem detecção', 'Nenhum sensor em contato com a água.', 'A água não foi detectada nas três alturas monitoradas. Continue acompanhando as próximas leituras.', 'Abaixo dos sensores', 'Nenhuma das três faixas detecta água.', 'Continue de olho nas mudanças.', 'As leituras se atualizam automaticamente. Observe se a água alcança uma nova faixa.'],
    ['Atenção', 'A água chegou à primeira faixa.', 'O sensor inferior detectou água. Acompanhe se ela alcança as próximas alturas.', 'Primeira faixa', 'A água foi detectada na altura inferior.', 'Acompanhe as próximas leituras.', 'Observe se a água também chega à faixa intermediária. Cada faixa indica uma altura diferente no equipamento.'],
    ['Alerta', 'A água chegou à segunda faixa.', 'Os sensores inferior e intermediário detectaram água. O equipamento está em faixa de alerta.', 'Segunda faixa', 'A água foi detectada em duas alturas.', 'Dê prioridade a este acompanhamento.', 'Observe as atualizações: a próxima faixa é a mais alta do equipamento.'],
    ['Crítico', 'A água chegou à faixa mais alta.', 'Os três sensores detectaram água. Esta é a sinalização crítica do protótipo.', 'Faixa mais alta', 'A água foi detectada nas três alturas.', 'A faixa crítica foi atingida.', 'O equipamento atingiu sua última faixa de detecção. Ele não mede quanto a água sobe acima desse ponto.']
  ];
  let m = messages[count];
  if (!valid) m = fresh && state.inconsistent
    ? ['Verificar sensores', 'As leituras precisam de verificação.', 'Os sensores indicam uma sequência inesperada. Verifique as leituras e a montagem em Dados detalhados.', 'Leitura inconsistente', 'Não foi possível interpretar as alturas.', 'Verifique o equipamento.', 'Um sensor mais alto detectou água enquanto um abaixo dele não detectou. Confira a montagem e a calibração.']
    : [state.lastUpdate ? 'Sem atualização' : 'Sem leitura', state.lastUpdate ? 'O acompanhamento foi interrompido.' : 'Aguardando leituras', state.lastUpdate ? 'Sem dados atuais, não é possível informar a situação da água. Confira a conexão do equipamento.' : 'Conecte o Arduino para receber as medições.', 'Ainda sem leitura', 'A água é acompanhada em três alturas.', 'Tudo começa com uma conexão.', 'Conecte o Arduino por USB e selecione a porta no botão acima. As leituras aparecerão automaticamente.'];
  ['simple-badge','situation-title','situation-description','simple-level','simple-level-detail','simple-action-title','simple-action'].forEach((id,i)=>set(id,m[i]));
  document.querySelector('.situation')?.setAttribute('data-status', valid ? ['safe','attention','alert','danger'][count] : 'unknown');
  document.querySelectorAll('.sensor-steps span').forEach((el,i)=>el.classList.toggle('wet', !!valid && sensors[i]));
  document.querySelectorAll('.sensor-pole i').forEach((el,i)=>el.classList.toggle('wet', !!valid && sensors[2-i]));
  const water = document.querySelector('.scene-water');
  if(water) water.style.height = valid ? (60 + count * 53) + 'px' : '60px';
  set('scene-label', valid ? m[3] : 'Aguardando dados');
  const timestamp = state.lastUpdate ? 'Última leitura às ' + formatTime(state.lastUpdate) : 'Nenhuma leitura recebida ainda.';
  set('simple-freshness', fresh ? 'Atualizando automaticamente · ' + timestamp : timestamp);
  set('technical-freshness', fresh ? 'Leituras atuais · ' + timestamp + '. Históricos limitados à sessão neste navegador.' : 'Sem dados atuais. Valores abaixo são registros anteriores ou indicadores ainda sem medição.');
  if(state.mode === 'serial') set('connection-label', fresh ? 'Recebendo leituras' : 'Conectado · sem leituras atuais');
  const rainValid = fresh && state.rainAvailable;
  set('simple-rain', rainValid ? (state.rain.totalMm > 0 ? 'Há chuva acumulada' : 'Nenhum volume registrado') : 'Ainda sem leitura');
  set('simple-rain-detail', rainValid ? 'Total registrado desde que o Arduino foi ligado.' : 'Aguardando dados atuais do pluviômetro.');
  const total = document.getElementById('simple-rain-total');
  if(total) total.innerHTML = (rainValid ? formatRain(state.rain.totalMm) : '—') + ' <small>mm acumulados no equipamento</small>';
}

function renderLiveRuler(fresh) {
  const state = AURA.state;
  const set = (id, value) => {
    const node = document.getElementById(id);
    if (node && node.textContent !== value) node.textContent = value;
  };
  ['inferior', 'medio', 'superior'].forEach(key => {
    const active = state.sensors[key].active;
    const status = fresh ? (active ? 'wet' : 'dry') : 'unknown';
    document.getElementById(`ruler-${key}`)?.setAttribute('data-state', status);
    set(`ruler-state-${key}`, fresh ? (active ? 'Água detectada' : 'Sem detecção') : 'Sem leitura atual');
  });
  set('ruler-connection', fresh ? 'Recebendo leituras' : 'Sem leitura atual');
  set('ruler-message', !fresh
    ? 'Aguardando leituras atuais do equipamento.'
    : state.inconsistent
      ? 'Sequência inesperada: um sensor acima detecta água e outro abaixo não. Verifique o equipamento.'
      : '');
}





