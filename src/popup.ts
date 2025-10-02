import { Config, StoredConfig } from "./types";
import {
  ConfigCodec,
  formatDuration,
  getScheduledExecutionTime,
} from "./utils";

document.addEventListener("DOMContentLoaded", () => {
  const targetDateEl = document.getElementById(
    "targetDate"
  ) as HTMLInputElement;
  const preferredTimesEl = document.getElementById(
    "preferredTimes"
  ) as HTMLInputElement;
  const preferredCheckboxesEl = document.getElementById(
    "preferredCheckboxes"
  ) as HTMLInputElement;
  const executionTimeEl = document.getElementById(
    "executionTime"
  ) as HTMLInputElement;
  const executeBtn = document.getElementById("execute") as HTMLButtonElement;
  const stopBtn = document.getElementById("stop") as HTMLButtonElement;
  const statusEl = document.getElementById("status") as HTMLDivElement;
  const countdownDisplay = document.getElementById(
    "countdownDisplay"
  ) as HTMLDivElement;
  let countdownInterval: number | undefined = undefined;

  function showExecuteButton() {
    executeBtn.style.display = "block";
    stopBtn.style.display = "none";
    countdownDisplay.style.display = "none";
  }

  function showStopButton() {
    executeBtn.style.display = "none";
    stopBtn.style.display = "block";
    countdownDisplay.style.display = "block";
  }

  chrome.storage.local.get(
    [
      "targetDate",
      "preferredTimes",
      "preferredCheckboxes",
      "executionTime",
      "scheduledExecutionTime",
      "maxCheckboxesToClick",
    ],
    (config: StoredConfig) => {
      const {
        targetDate,
        preferredTimes,
        preferredCheckboxes,
        executionTime,
        scheduledExecutionTime,
        maxCheckboxesToClick,
      } = ConfigCodec.encode(config);

      if (targetDate) {
        targetDateEl.value = targetDate;
      }

      if (preferredTimes) {
        preferredTimesEl.value = preferredTimes;
      }

      if (preferredCheckboxes) {
        preferredCheckboxesEl.value = preferredCheckboxes;
      }

      if (executionTime) {
        executionTimeEl.value = executionTime;
      }

      if (maxCheckboxesToClick) {
        const selectedRadio = document.querySelector(
          `input[name="numCourts"][value="${maxCheckboxesToClick}"]`
        ) satisfies HTMLInputElement | null;

        if (selectedRadio) {
          selectedRadio.checked = true;
        }
      } else {
        // Default to 2 if not set
        (document.getElementById("courts2") as HTMLInputElement).checked = true;
      }

      if (scheduledExecutionTime && scheduledExecutionTime > Date.now()) {
        startCountdown(scheduledExecutionTime);
        showStopButton();
      } else {
        showExecuteButton();
      }
    }
  );

  function startCountdown(executionTime: number) {
    if (typeof countdownInterval === "number") {
      clearInterval(countdownInterval);
    }

    countdownInterval = setInterval(() => {
      const now = Date.now();
      const remaining = executionTime - now;

      if (remaining <= 0) {
        clearInterval(countdownInterval);
        countdownDisplay.textContent = "예약 실행 시간이 되었습니다!";
        countdownDisplay.style.color = "#007bff";
        showExecuteButton();
        return;
      }

      countdownDisplay.textContent = `실행까지 남은 시간: ${formatDuration(
        remaining
      )}`;
      countdownDisplay.style.color = "#fd7e14";
    }, 1000);
  }

  executeBtn.addEventListener("click", () => {
    if (typeof countdownInterval === "number") {
      clearInterval(countdownInterval);
    }

    const config = getConfig();
    saveConfig(config);

    if (config.executionTime) {
      chrome.runtime.sendMessage({ action: "schedule", config });
      statusEl.textContent = `예약이 설정되었습니다: ${config.executionTime}`;
      statusEl.style.color = "green";
      showStopButton();

      const scheduledExecutionTime = getScheduledExecutionTime(
        config.executionTime
      );

      startCountdown(scheduledExecutionTime.getTime());
    } else {
      chrome.storage.local.remove("scheduledExecutionTime");
      chrome.runtime.sendMessage({ action: "runNow", config });
      statusEl.textContent = "예약을 즉시 실행합니다!";
      statusEl.style.color = "green";
      showExecuteButton();
    }
  });

  stopBtn.addEventListener("click", () => {
    chrome.alarms.clear("runReservation");
    chrome.storage.local.remove("scheduledExecutionTime");

    if (typeof countdownInterval === "number") {
      countdownDisplay.textContent = "";
      clearInterval(countdownInterval);
    }

    statusEl.textContent = "예약이 중지되었습니다.";
    statusEl.style.color = "red";

    showExecuteButton();
  });

  function getConfig(): Config {
    return ConfigCodec.decode({
      targetDate: targetDateEl.value,
      preferredTimes: preferredTimesEl.value,
      preferredCheckboxes: preferredCheckboxesEl.value,
      executionTime: executionTimeEl.value,
      selectedNumCourts: (
        document.querySelector(
          'input[name="numCourts"]:checked'
        ) as HTMLInputElement
      ).value,
    });
  }

  function saveConfig(config: Config) {
    chrome.storage.local.set(config);
  }
});
