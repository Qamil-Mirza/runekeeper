interface TrackedAction {
  type: string;
  description: string;
  timestamp: Date;
}

export class VoiceSessionTracker {
  private actions: TrackedAction[] = [];
  private startTime: Date;

  constructor() {
    this.startTime = new Date();
  }

  trackAction(type: string, description: string) {
    this.actions.push({ type, description, timestamp: new Date() });
  }

  buildSummary(): string {
    const durationMs = Date.now() - this.startTime.getTime();
    const durationMin = Math.round(durationMs / 60_000);

    if (this.actions.length === 0) {
      return `Voice session (${durationMin} min): No actions taken.`;
    }

    const parts: string[] = [];

    const created = this.actions.filter((a) => a.type === "create_tasks");
    if (created.length > 0) {
      const names = created.map((a) => a.description);
      parts.push(`Created ${created.length} task${created.length > 1 ? "s" : ""} (${names.join(", ")})`);
    }

    const scheduled = this.actions.filter((a) => a.type === "generate_schedule");
    if (scheduled.length > 0) {
      parts.push(`Generated schedule${scheduled.length > 1 ? ` ${scheduled.length} times` : ""}`);
    }

    const committed = this.actions.filter((a) => a.type === "confirm_plan");
    if (committed.length > 0) {
      parts.push(`Committed plan to calendar`);
    }

    const adjusted = this.actions.filter((a) => a.type === "adjust_block");
    if (adjusted.length > 0) {
      const names = adjusted.map((a) => a.description);
      parts.push(`Adjusted ${adjusted.length} block${adjusted.length > 1 ? "s" : ""} (${names.join(", ")})`);
    }

    return `Voice session (${durationMin} min): ${parts.join(". ")}.`;
  }
}
