// Failure alerts via Telegram (optional).
//
// Configure TELEGRAM_BOT_TOKEN (from @BotFather) and TELEGRAM_CHAT_ID to
// receive alerts when agent runs fail. When unset, all functions below are
// safe no-ops that return false. Alert functions never throw: alerting must
// not break the pipeline it reports on.

const TELEGRAM_API = "https://api.telegram.org";

export function isAlertsConfigured(): boolean {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID);
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Send a Telegram message. Returns true when the message was accepted.
 * Never throws.
 */
export async function sendTelegramAlert(title: string, body: string): Promise<boolean> {
  if (!isAlertsConfigured()) return false;
  const token = process.env.TELEGRAM_BOT_TOKEN as string;
  const chatId = process.env.TELEGRAM_CHAT_ID as string;
  const site = process.env.SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || "PawPilot";
  const text = `🐾 <b>${escapeHtml(title)}</b>\n${escapeHtml(site)}\n${new Date().toISOString()}\n\n${body}`.slice(0, 4000);
  try {
    const res = await fetch(`${TELEGRAM_API}/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      console.error(`[alerts] telegram send failed: HTTP ${res.status}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error(`[alerts] telegram send error: ${(err as Error).message}`);
    return false;
  }
}

/** Alert that a scheduled job failed. Never throws. */
export async function alertJobFailure(job: string, detail: string): Promise<void> {
  if (!isAlertsConfigured()) return;
  await sendTelegramAlert(
    `PawPilot job failed: ${job}`,
    escapeHtml(detail).slice(0, 3000),
  );
}

/** Alert that a job finished partially (some items failed). Never throws. */
export async function alertJobPartial(job: string, detail: string): Promise<void> {
  if (!isAlertsConfigured()) return;
  await sendTelegramAlert(
    `PawPilot job partial: ${job}`,
    escapeHtml(detail).slice(0, 3000),
  );
}
