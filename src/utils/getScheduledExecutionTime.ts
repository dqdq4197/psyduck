import type { Config } from "../types";

function getScheduledExecutionTime(
  executionTime: Config["executionTime"]
): Date {
  const [hours, minutes] = executionTime.split(":");
  const targetTime = new Date();

  targetTime.setHours(parseInt(hours, 10), parseInt(minutes, 10), 0, 0);

  if (targetTime.getTime() < Date.now()) {
    targetTime.setDate(targetTime.getDate() + 1);
  }

  return targetTime;
}

export default getScheduledExecutionTime;
