import { Config } from "./types";

/**
 * DOM 요소가 나타날 때까지 기다립니다.
 * @param selector - 기다릴 요소의 CSS 선택자.
 * @param timeout - 기다릴 최대 시간 (밀리초).
 * @returns 요소가 나타나면 해당 HTMLElement를 반환하는 Promise.
 */
function waitForElement(
  selector: string,
  timeout = 15000
): Promise<HTMLElement> {
  return new Promise((resolve, reject) => {
    const intervalTime = 100;
    const endTime = Date.now() + timeout;

    const poll = () => {
      const el = document.querySelector(selector);
      if (
        el instanceof HTMLElement &&
        (el.offsetWidth > 0 ||
          el.offsetHeight > 0 ||
          el.getClientRects().length > 0)
      ) {
        resolve(el);
      } else if (Date.now() > endTime) {
        console.error(
          `[예약 봇] ${selector} 요소를 찾지 못했거나, ${timeout}ms 이후에도 보이지 않습니다.`
        );
        reject(
          new Error(
            `[예약 봇] ${selector} 요소를 찾지 못했거나, ${timeout}ms 이후에도 보이지 않습니다.`
          )
        );
      } else {
        setTimeout(poll, intervalTime);
      }
    };
    poll();
  });
}

/**
 * 주어진 체크박스 ID 목록을 클릭합니다.
 * @param checkboxIds - 클릭할 체크박스 ID 배열.
 * @param maxClicks - 클릭할 최대 체크박스 수.
 * @returns 성공적으로 클릭된 체크박스 ID 배열.
 */
async function clickCheckboxes(
  checkboxIds: string[],
  maxClicks: number
): Promise<string[]> {
  const successfullyClicked: string[] = [];
  for (const checkboxId of checkboxIds) {
    if (successfullyClicked.length >= maxClicks) {
      break;
    }

    console.log(`[예약 봇] 체크박스 클릭 시도: ID ${checkboxId}`);
    const input = document.getElementById(
      checkboxId
    ) as HTMLInputElement | null;

    if (input && !input.disabled) {
      const label = document.querySelector(
        `label[for="${checkboxId}"]`
      ) as HTMLLabelElement | null;
      if (label) {
        console.log(
          `[예약 봇] ${checkboxId}의 입력(input)과 라벨(label)을 찾았습니다. 라벨을 클릭합니다.`
        );
        label.click();
        await new Promise((resolve) => setTimeout(resolve, 100));

        if (input.checked) {
          console.log(`[예약 봇] ${checkboxId} 클릭 및 체크 성공.`);
          successfullyClicked.push(checkboxId);
        } else {
          console.log(
            `[예약 봇] ${checkboxId} 라벨 클릭이 동작하지 않았습니다. 입력(input)을 직접 클릭합니다.`
          );
          input.click();
          await new Promise((resolve) => setTimeout(resolve, 100));

          if (input.checked) {
            console.log(`[예약 봇] ${checkboxId} 입력(input) 직접 클릭 성공.`);
            successfullyClicked.push(checkboxId);
          } else {
            console.log(`[예약 봇] ${checkboxId} 직접 클릭도 실패했습니다.`);
          }
        }
      } else {
        console.log(`[예약 봇] ${checkboxId}의 라벨을 찾을 수 없습니다.`);
      }
    } else {
      console.log(
        `[예약 봇] ${checkboxId}의 입력을 찾을 수 없거나 비활성화되어 있습니다.`
      );
    }
  }
  return successfullyClicked;
}

// 코트 그룹 정의
const courtGroups: number[][] = [
  [1, 2, 3, 4],
  [5, 6, 7, 8],
  [9, 10, 11, 12],
];

/**
 * 주어진 사용 가능한 ID 목록과 그룹 내에서 연속된 코트 쌍을 찾습니다.
 * @param availableIds - 현재 사용 가능한 체크박스 ID 배열.
 * @param group - 코트 그룹 (예: [1,2,3,4]).
 * @returns 연속된 코트 ID 쌍의 배열 (예: [['facilityNo1', 'facilityNo2']]).
 */
function findConsecutivePairs(
  availableIds: string[],
  group: number[]
): string[][] {
  const pairs: string[][] = [];
  for (let i = 0; i < group.length - 1; i++) {
    const id1 = `facilityNo${group[i]}`;
    const id2 = `facilityNo${group[i + 1]}`;
    if (availableIds.includes(id1) && availableIds.includes(id2)) {
      pairs.push([id1, id2]);
    }
  }
  return pairs;
}

// --- Main Logic ---
/**
 * 체크박스 선택 로직을 처리합니다. 선호하는 코트, 연속된 쌍, 남은 코트 순으로 선택을 시도합니다.
 * @param preferredIds - 사용자가 선호하는 체크박스 ID 배열.
 * @param maxClicks - 클릭할 최대 체크박스 수.
 * @returns 성공적으로 클릭된 체크박스 ID 배열.
 */
async function handleCheckboxSelection(
  preferredIds: string[],
  maxClicks: number
): Promise<string[]> {
  try {
    await waitForElement(
      ".yy-checks-list input[type='checkbox']:not([disabled])"
    );
    console.log("[예약 봇] 클릭 가능한 체크박스를 하나 이상 찾았습니다.");

    const enabledCheckboxes = Array.from(
      document.querySelectorAll("input[type='checkbox']:not([disabled])")
    );

    if (enabledCheckboxes.length === 0) {
      console.log(
        "[예약 봇] 오류: 대기 후에도 클릭 가능한 체크박스를 찾지 못했습니다."
      );
      return [];
    }

    const enabledCheckboxIds = enabledCheckboxes.map((cb) => cb.id);
    console.log(
      "[예약 봇] 페이지에서 찾은 활성화된 체크박스 ID:",
      enabledCheckboxIds
    );

    let clickedIds: string[] = [];
    let remainingClicks: number = maxClicks;

    // Phase 1: Try User's Preferred Specific Courts
    const preferredAvailable = preferredIds.filter((id) =>
      enabledCheckboxIds.includes(id)
    );
    console.log(
      "[예약 봇] 사용자가 선호하는 체크박스 중 선택 가능한 목록:",
      preferredAvailable
    );

    if (preferredAvailable.length > 0) {
      const clickedFromPreferred = await clickCheckboxes(
        preferredAvailable,
        remainingClicks
      );
      clickedIds = clickedIds.concat(clickedFromPreferred);
      remainingClicks -= clickedFromPreferred.length;
      if (remainingClicks <= 0) {
        console.log(
          "[예약 봇] 선호하는 특정 코트에서 필요한 개수만큼 선택 완료."
        );
        return clickedIds;
      }
    }

    // Phase 2 & 3: Try Consecutive Pairs (Preferred Group first, then others)
    // ONLY if maxClicks is 2 and we still need 2 clicks
    if (maxClicks === 2 && remainingClicks >= 2) {
      console.log("[예약 봇] 연속된 코트 쌍을 탐색합니다.");
      let groupsToSearch: number[][] = [];
      let searchedGroups = new Set<number>();

      // Add preferred groups first
      for (const preferredId of preferredIds) {
        const courtNumber = parseInt(preferredId.replace("facilityNo", ""));
        for (const group of courtGroups) {
          if (group.includes(courtNumber) && !searchedGroups.has(group[0])) {
            groupsToSearch.push(group);
            searchedGroups.add(group[0]);
            break;
          }
        }
      }
      // Add remaining groups
      for (const group of courtGroups) {
        if (!searchedGroups.has(group[0])) {
          groupsToSearch.push(group);
        }
      }

      for (const group of groupsToSearch) {
        if (remainingClicks <= 0) break;
        const pairs = findConsecutivePairs(enabledCheckboxIds, group);
        console.log(
          `[예약 봇] 그룹 ${group[0]}-${
            group[group.length - 1]
          }에서 찾은 연속된 쌍:`,
          pairs
        );

        for (const pair of pairs) {
          if (remainingClicks >= 2) {
            // Need 2 clicks for a pair
            const clickedFromPair = await clickCheckboxes(pair, 2);
            if (clickedFromPair.length === 2) {
              // Ensure both were clicked
              clickedIds = clickedIds.concat(clickedFromPair);
              remainingClicks -= 2;
              console.log(
                `[예약 봇] 그룹 ${group[0]}-${
                  group[group.length - 1]
                }에서 연속된 쌍 ${pair.join(",")} 선택 완료.`
              );
              if (remainingClicks <= 0) break;
            }
          }
        }
      }
    }

    // Phase 4: Try Any Remaining Available Courts
    if (remainingClicks > 0) {
      console.log(
        "[예약 봇] 남은 클릭 수에 대해 사용 가능한 모든 코트를 탐색합니다."
      );
      const alreadyClickedIds = new Set(clickedIds);
      const trulyRemainingAvailable = enabledCheckboxIds.filter(
        (id) => !alreadyClickedIds.has(id)
      );

      const clickedFromRemaining = await clickCheckboxes(
        trulyRemainingAvailable,
        remainingClicks
      );
      clickedIds = clickedIds.concat(clickedFromRemaining);
      remainingClicks -= clickedFromRemaining.length;
    }

    const clickedNumbers = clickedIds.map((id) => id.replace("facilityNo", ""));
    console.log(
      `[예약 봇] 코트 선택 완료. 선택된 코트: ${clickedNumbers.join(", ")}`
    );
    return clickedIds;
  } catch (error) {
    console.error("[예약 봇] 체크박스 선택 중 오류 발생:", error);
    alert(
      "체크박스를 선택하는 중 오류가 발생했습니다. 개발자 콘솔을 확인해주세요."
    );
    return [];
  }
}

/**
 * 콘텐츠 스크립트의 메인 실행 로직입니다.
 * 페이지 로드 시 실행되며, 저장된 설정에 따라 체크박스 선택을 시도합니다.
 */
(async () => {
  console.log("[예약 봇] 체크박스 선택 스크립트가 로드되었습니다.");

  chrome.storage.local.get(null, async (config: Config) => {
    if (!config.targetDate) {
      console.log("[예약 봇] 저장된 설정값을 찾을 수 없어 중단합니다.");
      return;
    }

    console.log("[예약 봇] 저장된 설정값을 불러왔습니다:", config);

    const clickedIds = await handleCheckboxSelection(
      config.preferredCheckboxes,
      config.maxCheckboxesToClick
    );

    if (clickedIds.length > 0) {
      try {
        const nextButton = await waitForElement(".btn4");
        nextButton.click();
        console.log("[예약 봇] '다음' 버튼을 클릭했습니다.");
      } catch (error) {
        console.error(
          "[예약 봇] '다음' 버튼을 찾거나 클릭할 수 없습니다:",
          error
        );
      }
    }

    console.log("[예약 봇] 체크박스 선택 프로세스가 종료되었습니다.");
  });
})();
