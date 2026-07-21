const EMOJI: Record<string, string> = {
  HKWorkoutActivityTypeSwimming: "\u{1F3CA}",
  HKWorkoutActivityTypeRunning: "\u{1F3C3}",
  HKWorkoutActivityTypeCycling: "\u{1F6B4}",
  HKWorkoutActivityTypeTraditionalStrengthTraining: "\u{1F3CB}️",
  HKWorkoutActivityTypeFunctionalStrengthTraining: "\u{1F3CB}️",
  HKWorkoutActivityTypeHiking: "\u{1F97E}",
  HKWorkoutActivityTypeYoga: "\u{1F9D8}",
  HKWorkoutActivityTypeElliptical: "\u{1F3C3}‍♂️",
  HKWorkoutActivityTypeRowing: "\u{1F6A3}",
  HKWorkoutActivityTypeStairClimbing: "\u{1FA9C}",
  HKWorkoutActivityTypeStairs: "\u{1FA9C}",
  HKWorkoutActivityTypeClimbing: "\u{1F9D7}",
  HKWorkoutActivityTypeHighIntensityIntervalTraining: "\u{1F525}",
  HKWorkoutActivityTypeStairStepper: "\u{1FA9C}",
  HKWorkoutActivityTypeOther: "\u{1F4AA}",
};

const DISPLAY_NAMES: Record<string, string> = {
  HKWorkoutActivityTypeTraditionalStrengthTraining: "Strength",
  HKWorkoutActivityTypeFunctionalStrengthTraining: "Strength",
  HKWorkoutActivityTypeHighIntensityIntervalTraining: "HIIT",
  HKWorkoutActivityTypeStairClimbing: "Stairs",
  HKWorkoutActivityTypeStairStepper: "Stair Master",
  HKWorkoutActivityTypeOther: "Workout",
};

export function workoutEmoji(type: string): string {
  return EMOJI[type] || "\u{1F4AA}";
}

// 'Strength', 'HIIT', or the HK name split on capitals ('Cross Training')
export function workoutLabel(type: string): string {
  if (DISPLAY_NAMES[type]) return DISPLAY_NAMES[type];
  return type
    .replace("HKWorkoutActivityType", "")
    .replace(/([A-Z])/g, " $1")
    .trim();
}
