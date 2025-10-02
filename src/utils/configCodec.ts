import type { Config, StoredConfig } from "../types";

interface RawConfig {
  targetDate: string;
  preferredTimes: string;
  preferredCheckboxes: string;
  executionTime: string;
  selectedNumCourts: string;
}

class ConfigCodec {
  static encode(config: StoredConfig) {
    return {
      targetDate: config.targetDate,
      preferredTimes: config.preferredTimes?.join(","),
      preferredCheckboxes: config.preferredCheckboxes
        ?.map((id) => id.replace("facilityNo", ""))
        .join(","),
      executionTime: config.executionTime,
      scheduledExecutionTime: config.scheduledExecutionTime,
      maxCheckboxesToClick: config.maxCheckboxesToClick,
    };
  }

  static decode(raw: RawConfig): Config {
    return {
      targetDate: raw.targetDate,
      preferredTimes: raw.preferredTimes
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      preferredCheckboxes: raw.preferredCheckboxes
        .split(",")
        .map((c) => `facilityNo${c.trim()}`)
        .filter(Boolean),
      executionTime: raw.executionTime,
      maxCheckboxesToClick: parseInt(raw.selectedNumCourts, 10),
    };
  }
}

export default ConfigCodec;
