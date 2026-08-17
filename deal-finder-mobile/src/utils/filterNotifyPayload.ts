/**
 * Mobile filter notification channel payload helpers.
 * Explicit booleans only — omitted != false on partial PATCH-style updates.
 */
export function hydrateNotifyPush(value: boolean | null | undefined): boolean {
  return value !== false;
}

export function hydrateNotifyTelegram(
  value: boolean | null | undefined,
): boolean {
  return value === true;
}

export function hydrateNotifyWhatsapp(
  value: boolean | null | undefined,
): boolean {
  return value === true;
}

export function buildNotifyChannelPayload(form: {
  notifyPush: boolean;
  notifyTelegram: boolean;
  notifyWhatsapp: boolean;
}): {
  notifyPush: boolean;
  notifyTelegram: boolean;
  notifyWhatsapp: boolean;
} {
  return {
    notifyPush: form.notifyPush,
    notifyTelegram: form.notifyTelegram,
    notifyWhatsapp: form.notifyWhatsapp,
  };
}
