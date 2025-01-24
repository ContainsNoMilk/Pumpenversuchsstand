'use strict';

/*********************
 * GLOBALE VARIABLEN *
 *********************/
let recording = false;
let timeUpdateInterval;
let pressureChart;
let flowChart; // Hinzufügen für das Flow-Chart
const TIME_API_ENDPOINT = '/getTime';
const TIME_SET_API = '/setTime';

/********************
 * ZEITMANAGEMENT   *
 ********************/
class TimeManager {
  static async updateDisplay() {
    try {
      const response = await fetch(TIME_API_ENDPOINT);
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      
      const timeStr = await response.text();
      const timeElement = document.getElementById('timeDisplay');
      if (timeElement) {
        timeElement.textContent = timeStr;
        timeElement.title = "Klicken zum Ändern der Zeit";
      }
    } catch (error) {
      console.error('Zeitaktualisierungsfehler:', error);
      this.showTimeError();
    }
  }

  static showTimeError() {
    const timeElement = document.getElementById('timeDisplay');
    if (timeElement) {
      timeElement.textContent = "--:--:--";
      timeElement.style.color = '#ff4444';
    }
  }

  static showSettings() {
    try {
      const now = new Date();
      const datetimeInput = document.getElementById('datetimeInput');
      datetimeInput.value = this.formatLocalDateTime(now);
      document.getElementById('timeModal').style.display = 'block';
    } catch (error) {
      console.error('Modalöffnungsfehler:', error);
    }
  }

  static formatLocalDateTime(date) {
    return new Date(date.getTime() - (date.getTimezoneOffset() * 60000))
      .toISOString()
      .slice(0, 16);
  }

  static async setCustomTime() {
    try {
      const datetimeInput = document.getElementById('datetimeInput');
      const localDate = new Date(datetimeInput.value);
      const utcTimestamp = Math.floor(localDate.getTime() / 1000);

      const response = await fetch(`${TIME_SET_API}?timestamp=${utcTimestamp}`);
      if (!response.ok) throw new Error('Zeitsetzung fehlgeschlagen');
      
      await this.updateDisplay();
      this.hideModal();
    } catch (error) {
      console.error('Zeitsetzungsfehler:', error);
      alert('Zeiteinstellung fehlgeschlagen: ' + error.message);
    }
  }

  static async syncDeviceTime() {
    try {
      const utcTimestamp = Math.floor(Date.now() / 1000);
      const response = await fetch(`${TIME_SET_API}?timestamp=${utcTimestamp}`);
      if (!response.ok) throw new Error('Synchronisation fehlgeschlagen');
      
      await this.updateDisplay();
      this.hideModal();
    } catch (error) {
      console.error('Synchronisationsfehler:', error);
      alert('Gerätesynchronisation fehlgeschlagen!');
    }
  }

  static hideModal() {
    document.getElementById('timeModal').style.display = 'none';
  }
}

/*********************
 * SENSORMANAGEMENT  *
 *********************/
class SensorManager {
  static async update() {
    try {
      const response = await fetch('/api/sensorwerte');
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      
      const data = await response.json();
      this.updateUI(data);
    } catch (error) {
      console.error('Sensorabfragefehler:', error);
      this.showError();
    }
  }

  static updateUI(data) {
    this.updatePressure(data);
    this.updateFlow(data);
    this.updateRecordingStatus(data);
    this.updateCharts(data);
  }

  static updatePressure(data) {
    const container = document.getElementById('drucksensoren');
    let html = '';
  
    // Generiere Karten für Sensor 1–4
    for (let i = 1; i <= 4; i++) {
      const sensor = data[`sensor${i}`];
      html += `
        <div class="sensor-card">
          <h3>Sensor ${i}</h3>
          <p>${sensor?.druck_MPa?.toFixed(2) || '–'} MPa</p>
          <p>${sensor?.druck_bar?.toFixed(2) || '–'} Bar</p>
          <p class="${sensor?.angeschlossen ? 'connected' : 'disconnected'}">
            ${sensor?.angeschlossen ? 'Verbunden' : 'Getrennt'}
          </p>
        </div>
      `;
    }
  
    container.innerHTML = html || this.createErrorElement("Keine Daten");
  }

  static updateFlow(data) {
    const container = document.getElementById('flowmeter');
    let html = '';
  
    // Füge beide Durchflusssensoren hinzu
    if (data.flow1 && data.flow2) {
      html += this.createFlowElement(data.flow1, 1);
      html += this.createFlowElement(data.flow2, 2);
    }
  
    container.innerHTML = html || this.createErrorElement("Keine Daten");
  }
  
  static createFlowElement(flowData, id) {
    return `
      <div class="flow-card">
        <h3>Flow Meter ${id}</h3>
        <p>Aktuell: ${flowData.rate?.toFixed(2) || flowData.flowRate_L_per_min?.toFixed(2) || '–'} L/min</p>
        <p>Gesamt: ${flowData.total?.toFixed(1) || flowData.cumulativeVolume_L?.toFixed(1) || '–'} L</p>
      </div>
    `;
  }

  static updateRecordingStatus(data) {
    if (data.recording !== undefined) {
      recording = data.recording;
      const btn = document.getElementById('toggleRecordingBtn');
      if (btn) {
        btn.querySelector('.text').textContent = recording ? 'Aufnahme stoppen' : 'Aufnahme starten';
        btn.classList.toggle('recording', recording);
      }
    }
  }

  static updateCharts(data) {
    const currentTime = new Date();

    // Druckchart aktualisieren
    if (pressureChart) {
      pressureChart.data.labels.push(currentTime);
      for (let i = 1; i <= 4; i++) {
        pressureChart.data.datasets[i - 1].data.push(data[`sensor${i}`]?.druck_MPa || null);
      }

      // Begrenze auf 600 Datenpunkte (10 Minuten bei 1 Sekunde Intervall)
      if (pressureChart.data.labels.length > 600) {
        pressureChart.data.labels.shift();
        pressureChart.data.datasets.forEach(dataset => dataset.data.shift());
      }

      pressureChart.update();
    }

    // Durchflusschart aktualisieren
    if (flowChart) {
      flowChart.data.labels.push(currentTime);
      flowChart.data.datasets[0].data.push(data.flow1?.rate || null);
      flowChart.data.datasets[1].data.push(data.flow2?.rate || null);

      // Begrenze auf 600 Datenpunkte (10 Minuten bei 1 Sekunde Intervall)
      if (flowChart.data.labels.length > 600) {
        flowChart.data.labels.shift();
        flowChart.data.datasets.forEach(dataset => dataset.data.shift());
      }

      flowChart.update();
    }
  }

  static createErrorElement(message) {
    return `<div class="error-card">
              <span class="error-icon">⚠️</span>
              <p>${message}</p>
            </div>`;
  }

  static showError() {
    const containers = ['drucksensoren', 'flowmeter'];
    containers.forEach(id => {
      const container = document.getElementById(id);
      if (container) {
        container.innerHTML = this.createErrorElement("Daten nicht verfügbar");
      }
    });
  }
}

/*********************
 * LOGGING & SYSTEM  *
 *********************/
class SystemManager {
  static async toggleRecording() {
    try {
      const response = await fetch('/toggleRecording');
      if (!response.ok) throw new Error('Statusänderung fehlgeschlagen');
      
      const data = await response.json();
      recording = data.recording;
      this.updateRecordingButton();
    } catch (error) {
      console.error('Aufnahmefehler:', error);
      alert('Aufnahme konnte nicht gestartet/gestoppt werden');
    }
  }

  static updateRecordingButton() {
    const btn = document.getElementById('toggleRecordingBtn');
    if (btn) {
      btn.querySelector('.text').textContent = recording ? 'Aufnahme stoppen' : 'Aufnahme starten';
      btn.classList.toggle('recording', recording);
    }
  }

  static async deleteLog() {
    if (!confirm("Logdatei endgültig löschen?")) return;
    
    try {
      const response = await fetch('/deleteLog');
      const result = await response.text();
      alert(result);
    } catch (error) {
      console.error('Löschfehler:', error);
      alert('Logdatei konnte nicht gelöscht werden');
    }
  }

  static async clearCumulativeFlow() {
    if (!confirm("Kumulierten Flow wirklich zurücksetzen?")) return;
    
    try {
      const response = await fetch('/clearCumulativeFlow');
      const result = await response.text();
      alert(result);
    } catch (error) {
      console.error('Zurücksetzungsfehler:', error);
      alert('Flow-Zurücksetzung fehlgeschlagen');
    }
  }
}

/*********************
 * DIAGRAMM          *
 *********************/
function initializePressureChart() {
  const ctx = document.getElementById('pressureChart').getContext('2d');
  pressureChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: [], // Zeitstempel
      datasets: [
        {
          label: 'Sensor 1 (MPa)',
          data: [],
          borderColor: 'var(--chart-green)', // Grün
          fill: false
        },
        {
          label: 'Sensor 2 (MPa)',
          data: [],
          borderColor: 'var(--chart-blue)', // Blau
          fill: false
        },
        {
          label: 'Sensor 3 (MPa)',
          data: [],
          borderColor: 'var(--chart-orange)', // Orange
          fill: false
        },
        {
          label: 'Sensor 4 (MPa)',
          data: [],
          borderColor: 'var(--chart-red)', // Rot
          fill: false
        }
      ]
    },
    options: {
      responsive: true,
      scales: {
        x: { type: 'time', time: { unit: 'minute' }, title: { display: true, text: 'Zeit' } },
        y: { title: { display: true, text: 'Druck (MPa)' } }
      }
    }
  });
}

function initializeFlowChart() {
  const ctx = document.getElementById('flowChart').getContext('2d');
  flowChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: [], // Zeitstempel
      datasets: [
        {
          label: 'Flow Meter 1 (L/min)',
          data: [],
          borderColor: 'var(--chart-green)', // Grün
          fill: false
        },
        {
          label: 'Flow Meter 2 (L/min)',
          data: [],
          borderColor: 'var(--chart-cyan)', // Cyan
          fill: false
        }
      ]
    },
    options: {
      responsive: true,
      scales: {
        x: { type: 'time', time: { unit: 'minute' }, title: { display: true, text: 'Zeit' } },
        y: { title: { display: true, text: 'Durchfluss (L/min)' } }
      }
    }
  });
}

function resetChart() {
  if (pressureChart) {
    pressureChart.data.labels = [];
    pressureChart.data.datasets.forEach(dataset => {
      dataset.data = [];
    });
    pressureChart.update();
    showToast("Druckdiagramm zurückgesetzt");
  }

  if (flowChart) {
    flowChart.data.labels = [];
    flowChart.data.datasets.forEach(dataset => {
      dataset.data = [];
    });
    flowChart.update();
    showToast("Durchflussdiagramm zurückgesetzt");
  }
}

/*********************
 * TOAST-NACHRICHTEN *
 *********************/
function showToast(message, isError = false) {
  const toastContainer = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${isError ? 'error' : ''}`;
  toast.innerHTML = `<span class="icon">${isError ? '⚠️' : '✓'}</span> ${message}`;
  toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 3000);
}

/*********************
 * INITIALISIERUNG   *
 *********************/
document.addEventListener('DOMContentLoaded', () => {
  // Zeitinitialisierung
  TimeManager.updateDisplay();
  timeUpdateInterval = setInterval(() => TimeManager.updateDisplay(), 1000);
  
  // Event-Listener
  document.getElementById('timeDisplay').addEventListener('click', () => TimeManager.showSettings());
  document.getElementById('toggleRecordingBtn').addEventListener('click', () => SystemManager.toggleRecording());
  
  // Sensor-Updates
  setInterval(() => {
    TimeManager.updateDisplay();
    SensorManager.update();
  }, 1000);

  // Diagramme initialisieren
  initializePressureChart();
  initializeFlowChart();
});

/*********************
 * GLOBALE FUNKTIONEN*
 *********************/
window.setCustomTime = () => TimeManager.setCustomTime();
window.syncDeviceTime = () => TimeManager.syncDeviceTime();
window.hideModal = () => TimeManager.hideModal();
window.deleteLog = () => SystemManager.deleteLog();
window.clearCumulativeFlow = () => SystemManager.clearCumulativeFlow();
window.resetChart = () => resetChart();
