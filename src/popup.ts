import { Config, StoredConfig } from "./types";

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
    statusEl.textContent = "";
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
    ],
    (result: StoredConfig) => {
      if (result.targetDate) targetDateEl.value = result.targetDate;
      if (result.preferredTimes)
        preferredTimesEl.value = result.preferredTimes.join(",");
      if (result.preferredCheckboxes) {
        const courtNumbers = result.preferredCheckboxes.map((id) =>
          id.replace("facilityNo", "")
        );
        preferredCheckboxesEl.value = courtNumbers.join(",");
      }
      if (result.executionTime) executionTimeEl.value = result.executionTime;

      if (
        result.scheduledExecutionTime &&
        result.scheduledExecutionTime > Date.now()
      ) {
        startCountdown(result.scheduledExecutionTime);
        showStopButton();
      } else {
        showExecuteButton();
      }
    }
  );

  function startCountdown(executionTime: number) {
    if (typeof countdownInterval === "number") clearInterval(countdownInterval);

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

      const seconds = Math.floor((remaining / 1000) % 60);
      const minutes = Math.floor((remaining / (1000 * 60)) % 60);
      const hours = Math.floor((remaining / (1000 * 60 * 60)) % 24);

      countdownDisplay.textContent = `실행까지 남은 시간: ${String(
        hours
      ).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(
        seconds
      ).padStart(2, "0")}`;
      countdownDisplay.style.color = "#fd7e14";
    }, 1000);
  }

  executeBtn.addEventListener("click", () => {
    if (typeof countdownInterval === "number") clearInterval(countdownInterval);
    const config = getConfig();
    saveConfig(config);

    if (config.executionTime) {
      chrome.runtime.sendMessage({ action: "schedule", config });
      statusEl.textContent = `예약이 설정되었습니다: ${config.executionTime}`;
      statusEl.style.color = "green";
      showStopButton();
      startCountdown(
        new Date(
          new Date().toDateString() + " " + config.executionTime
        ).getTime()
      );
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
      clearInterval(countdownInterval);
    }

    statusEl.textContent = "예약이 중지되었습니다.";
    statusEl.style.color = "red";

    showExecuteButton();
  });

  function getConfig(): Config {
    return {
      targetDate: targetDateEl.value,
      preferredTimes: preferredTimesEl.value.split(",").map((t) => t.trim()),
      preferredCheckboxes: preferredCheckboxesEl.value
        .split(",")
        .map((c) => `facilityNo${c.trim()}`),
      executionTime: executionTimeEl.value,
      maxCheckboxesToClick: 2,
    };
  }

  function saveConfig(config: Config) {
    chrome.storage.local.set(config);
  }
});
