/* RUx — central visible build/version authority (TEK SÜRÜM KAYNAĞI) */
export const RUX_APP_VERSION = 'RUx v0.75.15';
export const RUX_BUILD_ID = '0.75.15-heatmap-chart-fidelity-side-density-20260524';
export const RUX_BUILD_LABEL = 'Heatmap panel live order book';
export const RUX_BUILD_TIME = '2026-05-24 Europe/Istanbul';

export function applyRuxVersionBadges() {
  try {
    document.title = `RUx Trade Terminal — ${RUX_APP_VERSION}`;
    document.documentElement.setAttribute('data-rux-version', RUX_APP_VERSION);
    document.documentElement.setAttribute('data-rux-build', RUX_BUILD_ID);
    const side = document.querySelector('.om-version .muted.small');
    if (side) side.textContent = RUX_APP_VERSION;
    const foot = document.querySelector('.om-version .small');
    if (foot) {
      foot.innerHTML = `Build: <span class="om-link">v${RUX_BUILD_ID}</span> <span class="om-dot ok"></span>`;
    }
    let badge = document.getElementById('rux-build-badge');
    if (!badge) {
      badge = document.createElement('div');
      badge.id = 'rux-build-badge';
      badge.className = 'rux-build-badge';
      badge.setAttribute('title', RUX_BUILD_ID);
      const main = document.getElementById('om-main') || document.body;
      main.appendChild(badge);
    }
    badge.textContent = `${RUX_APP_VERSION} · ${RUX_BUILD_LABEL}`;
  } catch (err) {
    console.warn('RUx version badge failed', err);
  }
}

