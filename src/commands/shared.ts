/**
 * Shared utilities for command handlers.
 */

export function jsonOut(success: boolean, data?: unknown, errorMsg?: string): void {
  console.log(
    JSON.stringify(
      success ? { success: true, data } : { success: false, error: errorMsg },
      null,
      2
    )
  );
}

/**
 * Resolve agent ID from --agent flag or AITASKS_AGENT_ID env var.
 * Returns null if neither is set (caller decides if required).
 */
export function agentId(flagValue?: string): string | null {
  return flagValue ?? process.env['AITASKS_AGENT_ID'] ?? null;
}

/**
 * Resolve agent ID and exit with error if not set.
 */
export function requireAgentId(flagValue?: string, command = 'this command'): string {
  const id = agentId(flagValue);
  if (!id) {
    console.error(
      `  Agent ID required for ${command}.\n` +
      `  Use --agent <id> or set AITASKS_AGENT_ID environment variable.`
    );
    process.exit(1);
  }
  return id;
}

export function isJsonMode(flag?: boolean): boolean {
  return flag === true || process.env['AITASKS_JSON'] === 'true';
}

export function exitError(msg: string, json: boolean): never {
  if (json) {
    console.log(JSON.stringify({ success: false, error: msg }, null, 2));
  } else {
    console.error(`  Error: ${msg}`);
  }
  process.exit(1);
}
