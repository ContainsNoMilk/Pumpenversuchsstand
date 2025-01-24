#include <Wire.h>
#include <WiFi.h>
#include <WebServer.h>
#include <LittleFS.h>
#include <Adafruit_ADS1X15.h>
#include <ArduinoJson.h>
#include <TimeLib.h>
#include <Timezone.h>

// Netzwerkkonfiguration
const char* ssid = "Druck-Durchflusssensor";
const char* password = "12345678";

// Hardware-Pins
const int flowPins[2] = {25, 26};

// Zeitzonenkonfiguration Berlin
TimeChangeRule CEST = {"CEST", Last, Sun, Mar, 2, 120}; // Sommerzeit
TimeChangeRule CET = {"CET", Last, Sun, Oct, 3, 60};   // Winterzeit
Timezone berlinTZ(CEST, CET);

// Sensordatenstrukturen
struct DruckSensor {
  float druck;        // in MPa
  bool angeschlossen;
} druckSensor[4];

volatile unsigned long impulseCount[2] = {0, 0};
unsigned long previousImpulseCount[2] = {0, 0};
float flowRate[2] = {0, 0};
volatile double waterFlow[2] = {0.0, 0.0};
double litersPerPulse[2] = {1.0 / 5880.0, 1.0 / 5880.0};

WebServer server(80);
Adafruit_ADS1115 ads;
bool ads1115_available = false;
bool recording = false;
unsigned long startZeit = 0;

// Prototypen
void leseDruckSensoren();
String generateCSVLine();
String getTimeString(time_t t);

// Interrupt Service Routines für Durchflusssensoren
void IRAM_ATTR onPulse0() {
  impulseCount[0]++;
  waterFlow[0] += litersPerPulse[0];
}

void IRAM_ATTR onPulse1() {
  impulseCount[1]++;
  waterFlow[1] += litersPerPulse[1];
}

bool initializeADS() {
  if (!ads.begin()) {
    Serial.println("ADS1115 nicht gefunden");
    return false;
  }
  ads.setGain(GAIN_TWOTHIRDS);
  ads.setDataRate(RATE_ADS1115_128SPS);
  return true;
}

void leseDruckSensoren() {
  if (!ads1115_available) return;

  for (uint8_t i = 0; i < 4; ++i) {
    int16_t raw = ads.readADC_SingleEnded(i);
    float spannung = raw * (6.144 / 32768.0);
    
    druckSensor[i].druck = (spannung - 0.5) * 2.5;
    druckSensor[i].angeschlossen = (spannung >= 0.4 && spannung <= 4.6);
  }
}

void handleApiSensorwerte() {
  DynamicJsonDocument doc(2048); // Größeres Dokument für 4 Sensoren und 2 Flows

  // Druckdaten für alle 4 Sensoren
  leseDruckSensoren();
  for (uint8_t i = 0; i < 4; ++i) {
    JsonObject sensor = doc.createNestedObject("sensor" + String(i + 1));
    sensor["druck_MPa"] = druckSensor[i].druck;
    sensor["druck_bar"] = druckSensor[i].druck * 10;
    sensor["angeschlossen"] = druckSensor[i].angeschlossen;
  }

  // Durchflussdaten
  JsonObject flow1 = doc.createNestedObject("flow1");
  flow1["rate"] = flowRate[0];
  flow1["total"] = waterFlow[0];

  JsonObject flow2 = doc.createNestedObject("flow2");
  flow2["rate"] = flowRate[1];
  flow2["total"] = waterFlow[1];

  doc["recording"] = recording;

  String response;
  serializeJson(doc, response);
  server.send(200, "application/json", response);
}

void handleTime() {
  time_t utc = now();
  time_t local = berlinTZ.toLocal(utc);
  
  String timeStr = getTimeString(local);
  server.send(200, "text/plain", timeStr);
}

void handleSetTime() {
  if (server.hasArg("timestamp")) {
    time_t utc = server.arg("timestamp").toInt();
    setTime(berlinTZ.toUTC(utc));
    server.send(200, "text/plain", "Zeit aktualisiert");
  }
}

String getTimeString(time_t t) {
  char buf[35];
  snprintf(buf, sizeof(buf), "%02d.%02d.%04d %02d:%02d:%02d %s",
           day(t), month(t), year(t),
           hour(t), minute(t), second(t),
           berlinTZ.locIsDST(t) ? "CEST" : "CET");
  return String(buf);
}

void handleDownloadLog() {
  File logFile = LittleFS.open("/log.csv", "r");
  server.sendHeader("Content-Disposition", "attachment; filename=log.csv");
  server.streamFile(logFile, "text/csv");
  logFile.close();
}

void handleToggleRecording() {
  recording = !recording;
  if (recording) startZeit = millis();
  server.send(200, "application/json", "{\"recording\":" + String(recording) + "}");
}

void handleDeleteLog() {
  LittleFS.remove("/log.csv");
  server.send(200, "text/plain", "Log gelöscht");
}

void handleClearCumulativeFlow() {
  waterFlow[0] = waterFlow[1] = 0;
  server.send(200, "text/plain", "Flow zurückgesetzt");
}

void logData() {
  if (!recording) return;

  File logFile = LittleFS.open("/log.csv", "a");
  if (logFile) {
    logFile.println(generateCSVLine());
    logFile.close();
  }
}

String generateCSVLine() {
    time_t utc = now();
    time_t local = berlinTZ.toLocal(utc);
    
    // Schritt 1: Zeitstring
    String line = getTimeString(local);
    // Schritt 2: Komma anhängen
    line += ",";
    
    if (ads1115_available) {
        for (uint8_t i = 0; i < 4; ++i) {
            line += String(druckSensor[i].druck, 3) + ",";
            line += String(druckSensor[i].druck * 10, 3) + ",";
        }
    }
    
    line += String(flowRate[0], 3) + ",";
    line += String(flowRate[1], 3) + ",";
    line += String(waterFlow[0], 3) + ",";
    line += String(waterFlow[1], 3);
    
    return line;
}

void setup() {
  Serial.begin(115200);
  
  if (!LittleFS.begin()) {
    Serial.println("LittleFS Fehler");
    while(1);
  }

  ads1115_available = initializeADS();

  pinMode(flowPins[0], INPUT_PULLUP);
  pinMode(flowPins[1], INPUT_PULLUP);
  attachInterrupt(digitalPinToInterrupt(flowPins[0]), onPulse0, FALLING);
  attachInterrupt(digitalPinToInterrupt(flowPins[1]), onPulse1, FALLING);

  WiFi.softAP(ssid, password);
  
  // API-Endpunkte
  server.on("/", []() {
    File file = LittleFS.open("/index.html");
    server.streamFile(file, "text/html");
    file.close();
  });

  server.on("/api/sensorwerte", handleApiSensorwerte);
  server.on("/getTime", handleTime);
  server.on("/setTime", handleSetTime);
  server.on("/downloadlog", handleDownloadLog);
  server.on("/toggleRecording", handleToggleRecording);
  server.on("/deleteLog", handleDeleteLog);
  server.on("/clearCumulativeFlow", handleClearCumulativeFlow);

  // Styles.css
  server.on("/styles.css", []() {
    File file = LittleFS.open("/styles.css");
    server.streamFile(file, "text/css");
    file.close();
  });

  // Script.js
  server.on("/script.js", []() {
    File file = LittleFS.open("/script.js");
    server.streamFile(file, "application/javascript");
    file.close();
  });

  // Starte Server
  server.begin();
  setTime(0); // Zeit initialisieren
}

void loop() {
  server.handleClient();

  static unsigned long lastUpdate = 0;
  if (millis() - lastUpdate >= 1000) {
    noInterrupts();
    flowRate[0] = (impulseCount[0] - previousImpulseCount[0]) / 7.5;
    flowRate[1] = (impulseCount[1] - previousImpulseCount[1]) / 7.5;
    previousImpulseCount[0] = impulseCount[0];
    previousImpulseCount[1] = impulseCount[1];
    interrupts();

    logData();
    lastUpdate = millis();
  }
}
