/* ============================================================
   AURA
   Alerta de Urgência para Risco de Alagamentos

   Sensores de nível:
   A0 = inferior
   A1 = médio
   A2 = superior

   LEDs:
   D11 = verde
   D8  = amarelo 1
   D10 = amarelo 2
   D9  = vermelho

   Buzzer:
   D12

   Pluviômetro Reed:
   D2

   Calibração:
   0,968 mm por basculada
   ============================================================ */

const byte PIN_SENSOR_INFERIOR = A0;
const byte PIN_SENSOR_MEDIO    = A1;
const byte PIN_SENSOR_SUPERIOR = A2;

const byte PIN_LED_VERDE     = 11;
const byte PIN_LED_AMARELO_1 = 8;
const byte PIN_LED_AMARELO_2 = 10;
const byte PIN_LED_VERMELHO  = 9;

const byte PIN_BUZZER = 12;

const byte PIN_REED = 2;


/* ============================================================
   CONFIGURAÇÕES
   ============================================================ */

const unsigned long INTERVALO_LEITURA_MS = 50;
const unsigned long INTERVALO_ENVIO_MS   = 500;

const byte NUM_AMOSTRAS = 12;

const float ALPHA_EMA = 0.15f;


/*
   Limiares dos sensores de nível.
   Ajuste posteriormente conforme a calibração física.
*/
const int THRESHOLD_ON  = 500;
const int THRESHOLD_OFF = 430;


/*
   Pluviômetro:
   1 basculada = 0,968 mm
*/
const float MM_POR_BASCULADA = 0.968f;


/*
   Debounce do Reed
*/
const unsigned long REED_DEBOUNCE_MS = 150;


/* ============================================================
   ESTRUTURA DOS SENSORES
   ============================================================ */

struct Sensor {

  byte pin;

  int raw;

  float average;

  float filtered;

  bool active;

};


/* ============================================================
   SENSORES
   ============================================================ */

Sensor sensors[3] = {

  {PIN_SENSOR_INFERIOR, 0, 0, 0, false},

  {PIN_SENSOR_MEDIO,    0, 0, 0, false},

  {PIN_SENSOR_SUPERIOR, 0, 0, 0, false}

};


/* ============================================================
   CONTROLE DOS TEMPOS
   ============================================================ */

unsigned long lastRead = 0;

unsigned long lastSend = 0;


/* ============================================================
   BUZZER
   ============================================================ */

unsigned long beepStarted = 0;

bool buzzerOn = false;

bool criticalAlertPlayed = false;

byte beepsCompleted = 0;


/* ============================================================
   PLUVIÔMETRO
   ============================================================ */

/*
   Estado elétrico do Reed.

   HIGH = ímã afastado
   LOW  = ímã próximo

   Uma basculada é contabilizada quando ocorre:

   HIGH → LOW
*/

int reedStableState = HIGH;

int reedLastReading = HIGH;

unsigned long reedLastChange = 0;


/*
   Contador total de basculadas desde o início do Arduino.
*/
unsigned long totalBasculadas = 0;


/*
   Momento da última basculada.
*/
unsigned long ultimaBasculadaMs = 0;


/* ============================================================
   LEITURA MÉDIA DOS SENSORES
   ============================================================ */

float readAverage(byte pin) {

  long sum = 0;

  for (byte i = 0; i < NUM_AMOSTRAS; i++) {

    sum += analogRead(pin);

  }

  return sum / (float)NUM_AMOSTRAS;
}


/* ============================================================
   ATUALIZAÇÃO DOS SENSORES
   ============================================================ */

void updateSensors() {

  for (byte i = 0; i < 3; i++) {

    Sensor &s = sensors[i];

    s.raw = analogRead(s.pin);

    s.average = readAverage(s.pin);


    /*
       Filtro EMA.
    */

    if (s.filtered == 0) {

      s.filtered = s.average;

    } else {

      s.filtered =
        ALPHA_EMA * s.average +
        (1.0f - ALPHA_EMA) * s.filtered;

    }


    /*
       Histerese.

       Liga acima de THRESHOLD_ON.

       Desliga abaixo de THRESHOLD_OFF.
    */

    if (!s.active && s.filtered >= THRESHOLD_ON) {

      s.active = true;

    }

    else if (s.active && s.filtered <= THRESHOLD_OFF) {

      s.active = false;

    }

  }

}


/* ============================================================
   QUANTIDADE DE SENSORES ATIVOS
   ============================================================ */

byte activeCount() {

  byte count = 0;

  for (byte i = 0; i < 3; i++) {

    if (sensors[i].active) {

      count++;

    }

  }

  return count;

}


/* ============================================================
   SAÍDAS
   ============================================================ */

void updateOutputs(byte count) {

  /*
     Verde permanece ligado indicando que o sistema está
     energizado.
  */

  digitalWrite(PIN_LED_VERDE, HIGH);


  /*
     LEDs de nível.
  */

  digitalWrite(
    PIN_LED_AMARELO_1,
    count >= 1 ? HIGH : LOW
  );

  digitalWrite(
    PIN_LED_AMARELO_2,
    count >= 2 ? HIGH : LOW
  );

  digitalWrite(
    PIN_LED_VERMELHO,
    count >= 3 ? HIGH : LOW
  );


  /*
     Alerta crítico:
     cinco apitos.
  */

  const unsigned long now = millis();


  if (count < 3) {

    noTone(PIN_BUZZER);

    buzzerOn = false;

    criticalAlertPlayed = false;

    beepsCompleted = 0;

    return;

  }


  if (criticalAlertPlayed) {

    return;

  }


  if (!buzzerOn && now - beepStarted >= 250) {

    tone(PIN_BUZZER, 2200);

    buzzerOn = true;

    beepStarted = now;

  }

  else if (buzzerOn && now - beepStarted >= 250) {

    noTone(PIN_BUZZER);

    buzzerOn = false;

    beepStarted = now;

    beepsCompleted++;


    if (beepsCompleted >= 5) {

      criticalAlertPlayed = true;

    }

  }

}


/* ============================================================
   PLUVIÔMETRO
   ============================================================ */

void updatePluviometro() {

  unsigned long now = millis();

  int reading = digitalRead(PIN_REED);


  /*
     Detecta alteração elétrica.
  */

  if (reading != reedLastReading) {

    reedLastChange = now;

    reedLastReading = reading;

  }


  /*
     Só aceita a nova leitura depois do debounce.
  */

  if ((now - reedLastChange) >= REED_DEBOUNCE_MS) {

    if (reading != reedStableState) {

      int previousState = reedStableState;

      reedStableState = reading;


      /*
         BASCULADA:

         HIGH → LOW

         O ímã se aproxima do Reed.
      */

      if (
        previousState == HIGH &&
        reedStableState == LOW
      ) {

        totalBasculadas++;

        ultimaBasculadaMs = now;

      }

    }

  }

}


/* ============================================================
   JSON DOS SENSORES
   ============================================================ */

void printSensorJson(const Sensor &s) {

  Serial.print(F("{\"raw\":"));

  Serial.print(s.raw);

  Serial.print(F(",\"avg\":"));

  Serial.print(s.average, 1);

  Serial.print(F(",\"filtered\":"));

  Serial.print(s.filtered, 1);

  Serial.print(F(",\"active\":"));

  Serial.print(
    s.active ? F("true") : F("false")
  );

  Serial.print('}');

}


/* ============================================================
   ENVIO PARA O DASHBOARD
   ============================================================ */

void sendDashboardReading(byte count) {

  /*
     Chuva acumulada total desde que o Arduino iniciou.
  */

  float chuvaAcumulada =
    totalBasculadas * MM_POR_BASCULADA;


  /*
     Tempo desde a última basculada.
  */

  unsigned long semChuvaMs = 0;


  if (ultimaBasculadaMs > 0) {

    semChuvaMs = millis() - ultimaBasculadaMs;

  }


  /*
     JSON
  */

  Serial.print(F("{"));

  /*
     Nível
  */

  Serial.print(F("\"level\":"));

  Serial.print(
    (count * 100.0f) / 3.0f,
    1
  );


  /*
     Sensores ativos
  */

  Serial.print(F(",\"activeCount\":"));

  Serial.print(count);


  /*
     Pluviômetro
  */

  Serial.print(F(",\"pluviometro\":{"));

  Serial.print(F("\"basculadas\":"));

  Serial.print(totalBasculadas);

  Serial.print(F(",\"chuva_mm\":"));

  Serial.print(chuvaAcumulada, 3);

  Serial.print(F(",\"mm_por_basculada\":"));

  Serial.print(MM_POR_BASCULADA, 3);

  Serial.print(F(",\"ultima_basculada_ms\":"));

  Serial.print(ultimaBasculadaMs);

  Serial.print(F(",\"sem_chuva_ms\":"));

  Serial.print(semChuvaMs);

  Serial.print(F("}"));


  /*
     Sensores
  */

  Serial.print(F(",\"sensors\":{"));

  Serial.print(F("\"inferior\":"));

  printSensorJson(sensors[0]);

  Serial.print(F(",\"medio\":"));

  printSensorJson(sensors[1]);

  Serial.print(F(",\"superior\":"));

  printSensorJson(sensors[2]);

  Serial.print(F("}"));

  Serial.println(F("}"));

}


/* ============================================================
   SETUP
   ============================================================ */

void setup() {

  Serial.begin(115200);


  /*
     LEDs
  */

  pinMode(PIN_LED_VERDE, OUTPUT);

  pinMode(PIN_LED_AMARELO_1, OUTPUT);

  pinMode(PIN_LED_AMARELO_2, OUTPUT);

  pinMode(PIN_LED_VERMELHO, OUTPUT);


  /*
     Buzzer
  */

  pinMode(PIN_BUZZER, OUTPUT);

  noTone(PIN_BUZZER);


  /*
     Reed.

     Usamos INPUT_PULLUP porque o módulo fecha o circuito
     quando o ímã se aproxima.

     Portanto:

     HIGH = afastado
     LOW  = próximo
  */

  pinMode(PIN_REED, INPUT_PULLUP);


  /*
     Inicialização do estado do Reed.
  */

  reedStableState = digitalRead(PIN_REED);

  reedLastReading = reedStableState;

}


/* ============================================================
   LOOP
   ============================================================ */

void loop() {

  unsigned long now = millis();


  /*
     Sensores de nível.
  */

  if (
    now - lastRead >=
    INTERVALO_LEITURA_MS
  ) {

    lastRead = now;

    updateSensors();

    updatePluviometro();

    updateOutputs(activeCount());

  }


  /*
     Envio para dashboard.
  */

  if (
    now - lastSend >=
    INTERVALO_ENVIO_MS
  ) {

    lastSend = now;

    sendDashboardReading(
      activeCount()
    );

  }

}
