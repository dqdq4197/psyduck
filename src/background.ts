import { Config } from "./types";
import { getScheduledExecutionTime } from "./utils";

// --- Global State ---
let aggressiveLoopTimeoutId: number | null = null;

/**
 * 웹 페이지에 주입되어 확인 팝업을 처리하는 스크립트입니다.
 * @returns 확인 버튼 클릭 성공 여부.
 */
function handleConfirmationScript(): boolean {
  const confirmLayer = document.querySelector(
    "#confirmLayer"
  ) as HTMLElement | null;
  if (confirmLayer && confirmLayer.style.display !== "none") {
    const yesButton = confirmLayer.querySelector(
      ".regist"
    ) as HTMLElement | null;
    if (yesButton) {
      yesButton.click();
      return true;
    }
  }
  return false;
}

/**
 * 웹 페이지에 주입되어 지정된 시간 슬롯을 찾고 클릭합니다.
 * @param date - 찾을 예약 날짜 (YYYY-MM-DD).
 * @param times - 우선순위 시간 목록 (HH:MM).
 * @returns 클릭된 시간 문자열 또는 찾지 못했을 경우 false.
 */
function findTimeSlotAndClickScript(
  date: string,
  times: string[]
): string | false {
  const dayElements = Array.from(document.querySelectorAll("td"));
  const targetDay = dayElements.find((td) => {
    const link = td.querySelector("a.possible");

    if (link) {
      const onclickAttr = link.getAttribute("onclick");
      if (onclickAttr && onclickAttr.includes(`'${date}'`)) {
        return true;
      }
    }

    return false;
  });

  if (targetDay) {
    for (const time of times) {
      const links = Array.from(targetDay.querySelectorAll("li.possible a"));

      for (const link of links) {
        if (link.textContent && link.textContent.includes(time)) {
          (link as HTMLElement).click();

          return link.textContent.trim(); // Return the clicked time
        }
      }
    }
  }

  return false; // Not found
}

// --- Core Aggressive Loop Logic ---
/**
 * 탐색 루프를 시작하여 예약 시간 슬롯을 찾고 클릭합니다.
 * @param config - 예약 설정 (날짜, 시간, 코트 등).
 */
async function startAggressiveLoop(config: Config) {
  console.log(
    `[예약 봇] 탐색 루프를 시작. 대상: ${config.targetDate} ${config.preferredTimes}`
  );

  chrome.runtime.sendMessage({ action: "loopStarted" });

  const tabs = await chrome.tabs.query({
    url: "https://www.auc.or.kr/reservation/*",
  });

  if (tabs.length === 0) {
    console.error("[예약 봇] 예약 대상 탭을 찾을 수 없습니다.");
    chrome.runtime.sendMessage({ action: "loopStopped" });
    return;
  }

  if (tabs.length > 1) {
    console.log(
      `[예약 봇] ${tabs.length}개의 예약 탭이 감지되었습니다. 첫 번째 탭을 대상으로 작업을 시작합니다.`
    );
  }

  const tab = tabs[0]; // 첫 번째 탭을 대상으로 지정
  if (tab.id === undefined) {
    console.error("[예약 봇] 대상 탭의 ID를 찾을 수 없습니다.");
    chrome.runtime.sendMessage({ action: "loopStopped" });
    return;
  }

  // 전체 작업에 대한 타임아웃 설정 (예: 30초)
  const TIMEOUT_MS = 60 * 60 * 1_000;
  aggressiveLoopTimeoutId = setTimeout(() => {
    console.error(`[예약 봇] 탐색 루프 시간 타임아웃 ❗`);
    stopAggressiveLoop();
  }, TIMEOUT_MS);

  searchAndReload(tab.id, config);
}

/**
 * 탐색 루프를 중지합니다.
 */
function stopAggressiveLoop() {
  if (aggressiveLoopTimeoutId !== null) {
    clearTimeout(aggressiveLoopTimeoutId);
    aggressiveLoopTimeoutId = null;
    console.log("[예약 봇] 탐색 루프가 중지되었습니다.");
    chrome.runtime.sendMessage({ action: "loopStopped" });
  }
}

/**
 * 페이지를 새로고침하며 예약 시간 슬롯을 재탐색하는 재귀 함수입니다.
 * @param tabId - 현재 활성 탭의 ID.
 * @param config - 예약 설정.
 */
async function searchAndReload(tabId: number, config: Config) {
  // 타임아웃이 초기화되었다면, 프로세스가 중지되었거나 완료된 것입니다.
  if (aggressiveLoopTimeoutId === null) {
    console.log("[예약 봇] 루프가 중단되었습니다 (시간 초과 또는 성공).");
    chrome.runtime.sendMessage({ action: "loopStopped" });
    return;
  }

  console.log("[예약 봇] 탐색 루프를 실행합니다...");

  try {
    const injectionResults = await chrome.scripting.executeScript({
      target: { tabId },
      func: findTimeSlotAndClickScript,
      args: [config.targetDate, config.preferredTimes],
    });

    const result =
      injectionResults && injectionResults[0] && injectionResults[0].result;

    if (result) {
      // 시간 슬롯을 찾아서 클릭했다면
      console.log(`[예약 봇] 성공! '${result}' 시간대를 찾아 클릭했습니다.`);
      stopAggressiveLoop();

      // 이제 확인 스크립트 주입
      await chrome.scripting.executeScript({
        target: { tabId },
        func: handleConfirmationScript,
      });

      console.log("[예약 봇] 확인창 처리 완료.");

      // 예약 단계 2 페이지가 로드될 때까지 대기
      await new Promise((resolve) => {
        const listener = (
          updatedTabId: number,
          changeInfo: chrome.tabs.OnUpdatedInfo,
          tab: chrome.tabs.Tab
        ) => {
          if (
            updatedTabId === tabId &&
            changeInfo.status === "complete" &&
            tab.url?.includes("reservationStep2")
          ) {
            chrome.tabs.onUpdated.removeListener(listener);
            resolve(tab);
          }
        };
        chrome.tabs.onUpdated.addListener(listener);
      });

      await chrome.scripting.executeScript({
        target: { tabId },
        files: ["dist/content-script.js"],
      });

      return; // 루프 종료
    }

    // --- 찾지 못했다면, 새로고침하고 재귀 호출 ---
    console.log(
      "[예약 봇] 시간대를 찾지 못했습니다. 페이지를 새로고침하고 다시 시도합니다..."
    );

    // 페이지 새로고침 후 로드 완료까지 대기
    await new Promise((resolve) => {
      const listener = (
        updatedTabId: number,
        changeInfo: chrome.tabs.OnUpdatedInfo
      ) => {
        if (updatedTabId === tabId && changeInfo.status === "complete") {
          chrome.tabs.onUpdated.removeListener(listener);
          resolve(true); // 페이지 스크립트가 실행될 시간을 위한 작은 지연
        }
      };
      chrome.tabs.onUpdated.addListener(listener);
      chrome.tabs.reload(tabId); // 새로고침 시작
    });

    // 루프의 다음 반복 호출 (새로고침을 트리거할 것임)
    searchAndReload(tabId, config);
  } catch (error) {
    console.error("[예약 봇] searchAndReload 루프 중 오류 발생:", error);
    stopAggressiveLoop();
  }
}

// --- Event Listeners (Main entry points) ---
/**
 * 런타임 메시지를 처리합니다 (팝업에서 보낸 메시지).
 * @param message - 수신된 메시지.
 * @param sender - 메시지를 보낸 발신자 정보.
 * @param sendResponse - 응답을 보내기 위한 함수.
 * @returns 응답이 비동기적으로 전송될 것임을 나타냅니다.
 */
function handleRuntimeMessage(message: { action: string; config: Config }) {
  if (message.action === "runNow") {
    startAggressiveLoop(message.config);
  }

  if (message.action === "stopLoop") {
    stopAggressiveLoop();
  }

  if (message.action === "schedule") {
    const scheduledExecutionTime = getScheduledExecutionTime(
      message.config.executionTime
    );

    chrome.storage.local.set({
      scheduledExecutionTime: scheduledExecutionTime.getTime(),
    });

    chrome.alarms.clearAll();

    chrome.alarms.create("runReservation", {
      when: scheduledExecutionTime.getTime() - 1000,
    });

    console.log(
      `[예약 봇] 예약이 설정되었습니다: ${scheduledExecutionTime.toLocaleString()}.`
    );
  }
}

/**
 * 알람 이벤트를 처리합니다.
 * @param alarm - 발생한 알람 객체.
 */
function handleAlarm(alarm: chrome.alarms.Alarm) {
  if (alarm.name === "runReservation") {
    chrome.storage.local.get(null, (config: Config) => {
      if (config.targetDate) {
        startAggressiveLoop(config);
        chrome.storage.local.remove("scheduledExecutionTime");
      }
    });
  }
}

// --- Register Listeners ---
chrome.runtime.onMessage.addListener(handleRuntimeMessage);
chrome.alarms.onAlarm.addListener(handleAlarm);
