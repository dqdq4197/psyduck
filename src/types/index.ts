export interface Config {
    targetDate: string;
    preferredTimes: string[];
    preferredCheckboxes: string[]; // e.g., ['facilityNo5', 'facilityNo6']
    executionTime: string; // HH:MM
    maxCheckboxesToClick: number;
}

export interface StoredConfig extends Config {
    scheduledExecutionTime?: number; // Unix timestamp for countdown
}
