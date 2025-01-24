'use strict';

/*********************
 * GLOBALE VARIABLEN *
 *********************/
let recording = false;
let timeUpdateInterval;
let sensorChart;
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
      const utcTimestamp = Math.floor((localDate.getTime() / 1000) - (localDate.getTimezoneOffset() * 60));

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
    this.updateChart(data);
  }

  static updatePressure(data) {
    const container = document.getElementById('drucksensoren');
    let html = data.druck_error 
      ? this.createErrorElement(data.druck_error)
      : Array.from({length: 4}, (_, i) => this.createPressureElement(data[`sensor${i+1}`], i+1)).join('');
    
    container.innerHTML = html;
  }

  static createPressureElement(sensor, id) {
    if (!sensor) return '';
    return sensor.angeschlossen
      ? `<div class="sensor-card">
           <h3>Sensor ${id}</h3>
           <p>${sensor.druck_MPa.toFixed(2)} MPa</p>
           <p>${sensor.druck_bar.toFixed(2)} bar</p>
         </div>`
      : this.createErrorElement(`Sensor ${id} nicht verbunden`);
  }

  static updateFlow(data) {
    const container = document.getElementById('flowmeter');
    let html = '';
    
    if (data.flowMeter1) {
      html += this.createFlowElement(data.flowMeter1, 1);
    }
    if (data.flowMeter2) {
      html += this.createFlowElement(data.flowMeter2, 2);
    }
    
    container.innerHTML = html || this.createErrorElement("Keine Flow-Daten");
  }

  static createFlowElement(flowData, id) {
    return `<div class="flow-card">
              <h3>Flow Meter ${id}</h3>
              <p>Aktuell: ${flowData.flowRate_L_per_min.toFixed(2)} L/min</p>
              <p>Gesamt: ${flowData.cumulativeVolume_L.toFixed(1)} L</p>
            </div>`;
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

  static updateChart(data) {
    if (!sensorChart) return;

    const time = new Date().toLocaleTimeString();
    sensorChart.data.labels.push(time);
    sensorChart.data.datasets[0].data.push(data.sensor1?.druck_MPa || null);
    sensorChart.data.datasets[1].data.push(data.sensor2?.druck_MPa || null);
    sensorChart.update();
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
function initializeChart() {
  const ctx = document.getElementById('sensorChart').getContext('2d');
  sensorChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: [], // Zeitstempel
      datasets: [
        {
          label: 'Sensor 1 (MPa)',
          data: [],
          borderColor: '#4CAF50',
          fill: false
        },
        {
          label: 'Sensor 2 (MPa)',
          data: [],
          borderColor: '#FF5733',
          fill: false
        }
      ]
    },
    options: {
      responsive: true,
      scales: {
        x: {
          display: true,
          title: {
            display: true,
            text: 'Zeit'
          }
        },
        y: {
          display: true,
          title: {
            display: true,
            text: 'Druck (MPa)'
          }
        }
      }
    }
  });
}

function resetChart() {
  if (sensorChart) {
    sensorChart.data.labels = [];
    sensorChart.data.datasets.forEach(dataset => {
      dataset.data = [];
    });
    sensorChart.update();
    showToast("Diagramm zurückgesetzt");
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
  setInterval(() => SensorManager.update(), 1000);
  SensorManager.update();

  // Diagramm initialisieren
  initializeChart();
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