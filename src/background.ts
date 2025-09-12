import { Config } from "./types";

let aggressiveLoopTimeoutId: number | null = null;

/**
 * 웹 페이지에 주입되어 시간 슬롯을 찾아 클릭하는 스크립트입니다.
 * @param date - 찾을 예약 날짜 (YYYY-MM-DD).
 * @param times - 우선순위 시간 목록 (HH:MM).
 * @returns 클릭된 시간 문자열 또는 찾지 못했을 경우 false.
 */
function findAndClickScript(date: string, times: string[]): string | false {
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
 * 공격적 탐색 루프를 시작하여 예약 시간 슬롯을 찾고 클릭합니다.
 * @param config - 예약 설정 (날짜, 시간, 코트 등).
 */
async function startAggressiveLoop(config: Config) {
  console.log(
    `[예약 봇] 탐색 루프를 시작. 대상: ${config.targetDate} ${config.preferredTimes}`
  );

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (
    !tab ||
    tab.id === undefined ||
    !tab.url?.startsWith("https://www.auc.or.kr/")
  ) {
    console.log(
      "[예약 봇] 대상 웹사이트가 아니거나 활성 탭을 찾을 수 없습니다."
    );
    return;
  }

  // 전체 작업에 대한 타임아웃 설정 (예: 10초)
  const TIMEOUT_MS = 10000;
  aggressiveLoopTimeoutId = setTimeout(() => {
    console.log("[예약 봇] 공격적 탐색 루프 시간이 초과되었습니다.");
    aggressiveLoopTimeoutId = null; // 플래그 초기화
    chrome.alarms.clear("runReservation"); // 보류 중인 알람 제거
    console.error("예약 탐색 시간이 초과되었습니다.");
  }, TIMEOUT_MS);

  searchAndReload(tab.id, config);
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
    return;
  }

  console.log("[예약 봇] 탐색 루프를 실행합니다...");

  try {
    const injectionResults = await chrome.scripting.executeScript({
      target: { tabId: tabId },
      func: findAndClickScript,
      args: [config.targetDate, config.preferredTimes],
    });

    // 주입된 스크립트의 결과 확인
    const result =
      injectionResults && injectionResults[0] && injectionResults[0].result;
    if (result) {
      console.log(`[예약 봇] 성공! '${result}' 시간대를 찾아 클릭했습니다.`);
      clearTimeout(aggressiveLoopTimeoutId);
      aggressiveLoopTimeoutId = null;

      // 이제 확인 스크립트 주입
      await chrome.scripting.executeScript({
        target: { tabId: tabId },
        func: handleConfirmationScript,
      });
      console.log(
        "[예약 봇] 확인창 처리 스크립트를 주입했습니다. 페이지 이동을 기다립니다..."
      );

      // Wait for the tab to navigate to the next step
      await new Promise((resolve) => {
        const listener = (
          updatedTabId: number,
          changeInfo: chrome.tabs.OnUpdatedInfo,
          tab: chrome.tabs.Tab
        ) => {
          // Wait for the correct tab to finish loading the target URL
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

      console.log(
        "[예약 봇] '시설 선택' 페이지 로드 완료. 콘텐츠 스크립트를 주입합니다."
      );

      // Manually inject the content script
      await chrome.scripting.executeScript({
        target: { tabId: tabId },
        files: ["dist/content-script.js"],
      });

      return; // 루프 종료
    }

    // --- 찾지 못했다면, 새로고침하고 재귀 호출 ---
    console.log(
      "[예약 봇] 시간대를 찾지 못했습니다. 페이지를 새로고침하고 다시 시도합니다..."
    );

    await new Promise((resolve) => {
      const listener = (
        updatedTabId: number,
        changeInfo: chrome.tabs.OnUpdatedInfo
      ) => {
        if (updatedTabId === tabId && changeInfo.status === "complete") {
          chrome.tabs.onUpdated.removeListener(listener);
          setTimeout(resolve, 50); // 페이지 스크립트가 실행될 시간을 위한 작은 지연
        }
      };
      chrome.tabs.onUpdated.addListener(listener);
      chrome.tabs.reload(tabId);
    });

    // 루프의 다음 반복 호출
    searchAndReload(tabId, config);
  } catch (error) {
    console.error("[예약 봇] searchAndReload 루프 중 오류 발생:", error);
    if (aggressiveLoopTimeoutId !== null) {
      clearTimeout(aggressiveLoopTimeoutId);
      aggressiveLoopTimeoutId = null;
    }
  }
}

/**
 * 런타임 메시지를 처리합니다 (팝업에서 보낸 메시지).
 * @param message - 수신된 메시지.
 * @param sender - 메시지를 보낸 발신자 정보.
 * @param sendResponse - 응답을 보내기 위한 함수.
 * @returns 응답이 비동기적으로 전송될 것임을 나타냅니다.
 */
function handleRuntimeMessage(message: {
  action: string;
  config: Config;
}): boolean {
  if (message.action === "runNow") {
    startAggressiveLoop(message.config);
  } else if (message.action === "schedule") {
    const [hours, minutes] = message.config.executionTime.split(":");
    const targetTime = new Date();
    targetTime.setHours(parseInt(hours, 10), parseInt(minutes, 10), 0, 0);

    if (targetTime.getTime() < Date.now()) {
      targetTime.setDate(targetTime.getDate() + 1);
    }

    chrome.storage.local.set({
      scheduledExecutionTime: targetTime.getTime(),
    });

    chrome.alarms.clearAll();

    chrome.alarms.create("runReservation", {
      when: targetTime.getTime() - 2000,
    });

    console.log(
      `[예약 봇] 예약이 설정되었습니다: ${targetTime.toLocaleString()}.`
    );
  }
  return true;
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
