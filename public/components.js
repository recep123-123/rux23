/* RUx — UI components */
import { el, svg, fmtNum, fmtPrice, fmtPct, coinClass, coinShort, coinName } from './api.js?v=0.75.4-cvd-headerfix-overflowfix-20260524';

/* ---- ICONS (lightweight inline SVG) ---- */
export const ICN = {
  bitcoin: (s=18) => svg('svg', { viewBox: '0 0 24 24', width: s, height: s, fill: 'currentColor' }, svg('path', { d: 'M14.5 9.5c0-1-.8-1.8-1.8-1.8H10v3.6h2.7c1 0 1.8-.8 1.8-1.8zm-1 6c0-1.1-.9-2-2-2H10v4h1.5c1.1 0 2-.9 2-2zM12 1a11 11 0 1 0 0 22 11 11 0 0 0 0-22zm4.5 8.5c0 1.4-.6 2.6-1.6 3.3 1.4.5 2.4 1.7 2.4 3.2 0 2.1-1.7 3.5-3.8 3.5h-.5v2H11v-2H9v2H7.4v-2H6V8h1.4V6H9v2h2v-2h1.5v2.1c2 .2 4 1.5 4 3.4z' })),
  trend: (s=18) => svg('svg', { viewBox: '0 0 24 24', width: s, height: s, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.8 }, svg('path', { d: 'M3 17l6-6 4 4 8-8M14 7h7v7' })),
  layers: (s=18) => svg('svg', { viewBox: '0 0 24 24', width: s, height: s, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.6 }, svg('path', { d: 'M12 2 2 7l10 5 10-5z' }), svg('path', { d: 'M2 17l10 5 10-5M2 12l10 5 10-5' })),
  pulse: (s=18) => svg('svg', { viewBox: '0 0 24 24', width: s, height: s, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.6 }, svg('path', { d: 'M3 12h4l3-9 4 18 3-9h4' })),
  shield: (s=18) => svg('svg', { viewBox: '0 0 24 24', width: s, height: s, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.6 }, svg('path', { d: 'M12 2 4 5v6c0 5 3.4 9.6 8 11 4.6-1.4 8-6 8-11V5l-8-3z' })),
  bars: (s=18) => svg('svg', { viewBox: '0 0 24 24', width: s, height: s, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.6 }, svg('path', { d: 'M4 20V10M10 20V4M16 20v-7M22 20H2' })),
  signal: (s=18) => svg('svg', { viewBox: '0 0 24 24', width: s, height: s, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.6 }, svg('path', { d: 'M2 12h6l3-9 3 18 3-9h5' })),
  gear: (s=18) => svg('svg', { viewBox: '0 0 24 24', width: s, height: s, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.6 }, svg('circle', { cx:12,cy:12,r:3 }), svg('path', { d: 'M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h.1A1.7 1.7 0 0 0 10 3.1V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v.1A1.7 1.7 0 0 0 20.9 10H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z' })),
  rocket: (s=18) => svg('svg', { viewBox: '0 0 24 24', width: s, height: s, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.6 }, svg('path', { d: 'M4.5 16.5c-1.5 1.3-2 5-2 5s3.7-.5 5-2c.7-.8.7-2.1 0-2.9-.8-.8-2.1-.8-3 0z' }), svg('path', { d: 'M12 15c-3-3-3-7 1-11l1-1 1 1c4 4 4 8 1 11l-2 1-2-1z' })),
  check: (s=14) => svg('svg', { viewBox: '0 0 24 24', width: s, height: s, fill: 'none', stroke: 'currentColor', 'stroke-width': 2.5 }, svg('path', { d: 'M5 12l5 5L20 7' })),
  x: (s=14) => svg('svg', { viewBox: '0 0 24 24', width: s, height: s, fill: 'none', stroke: 'currentColor', 'stroke-width': 2.5 }, svg('path', { d: 'M6 6l12 12M6 18L18 6' })),
  target: (s=18) => svg('svg', { viewBox: '0 0 24 24', width: s, height: s, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.6 }, svg('circle', { cx:12,cy:12,r:9 }), svg('circle', { cx:12,cy:12,r:5 }), svg('circle', { cx:12,cy:12,r:1.5, fill: 'currentColor' })),
  bell: (s=18) => svg('svg', { viewBox: '0 0 24 24', width: s, height: s, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.6 }, svg('path', { d: 'M6 8a6 6 0 1 1 12 0c0 7 3 7 3 9H3c0-2 3-2 3-9z' }), svg('path', { d: 'M10 19a2 2 0 0 0 4 0' })),
  warning: (s=18) => svg('svg', { viewBox: '0 0 24 24', width: s, height: s, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.6 }, svg('path', { d: 'M12 2 2 21h20L12 2zM12 9v6M12 18h.01' })),
  whale: (s=18) => svg('svg', { viewBox: '0 0 24 24', width: s, height: s, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.6 }, svg('path', { d: 'M3 14c0-3 4-6 9-6s9 3 9 6c0 2-2 5-6 5h-3c-1 0-2 1-3 2v-2H8c-3 0-5-2-5-5z' }), svg('circle', { cx:7,cy:13,r:1, fill: 'currentColor' })),
  scale: (s=18) => svg('svg', { viewBox: '0 0 24 24', width: s, height: s, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.6 }, svg('path', { d: 'M12 3v18M5 7l7-3 7 3M5 7l-3 7h6l-3-7zM19 7l-3 7h6l-3-7z' })),
  cpu: (s=18) => svg('svg', { viewBox: '0 0 24 24', width: s, height: s, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.6 }, svg('rect', { x:4,y:4,width:16,height:16,rx:2 }), svg('rect', { x:9,y:9,width:6,height:6 }), svg('path', { d: 'M9 1v3M15 1v3M9 20v3M15 20v3M1 9h3M1 15h3M20 9h3M20 15h3' })),
  flame: (s=18) => svg('svg', { viewBox: '0 0 24 24', width: s, height: s, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.6 }, svg('path', { d: 'M12 2c0 5-4 6-4 11a4 4 0 1 0 8 0c0-3-2-4-2-7 0 0 4 1 5 7M12 2c2 4-1 5-1 8' })),
  star: (s=14, filled=false) => svg('svg', { viewBox: '0 0 24 24', width: s, height: s, fill: filled ? 'currentColor' : 'none', stroke: 'currentColor', 'stroke-width': 1.5 }, svg('path', { d: 'M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z' })),
  externalLink: (s=12) => svg('svg', { viewBox: '0 0 24 24', width: s, height: s, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.8 }, svg('path', { d: 'M14 3h7v7M21 3l-9 9M5 5h6M5 5v14h14v-6' })),
  refresh: (s=14) => svg('svg', { viewBox: '0 0 24 24', width: s, height: s, fill: 'none', stroke: 'currentColor', 'stroke-width': 2 }, svg('path', { d: 'M3 12a9 9 0 0 1 16-5.7L21 8M21 4v5h-5M21 12a9 9 0 0 1-16 5.7L3 16M3 20v-5h5' })),
  chev: (s=12, dir='down') => {
    const d = { down: 'M6 9l6 6 6-6', up: 'M6 15l6-6 6 6', left: 'M15 18l-6-6 6-6', right: 'M9 6l6 6-6 6' };
    return svg('svg', { viewBox: '0 0 24 24', width: s, height: s, fill: 'none', stroke: 'currentColor', 'stroke-width': 2 }, svg('path', { d: d[dir] }));
  },
  up: (s=18) => svg('svg', { viewBox: '0 0 24 24', width: s, height: s, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.8 }, svg('path', { d: 'M12 19V5M5 12l7-7 7 7' })),
  down: (s=18) => svg('svg', { viewBox: '0 0 24 24', width: s, height: s, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.8 }, svg('path', { d: 'M12 5v14M5 12l7 7 7-7' })),
  save: (s=14) => svg('svg', { viewBox: '0 0 24 24', width: s, height: s, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.8 }, svg('path', { d: 'M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2zM17 21v-8H7v8M7 3v5h8' })),
  key: (s=14) => svg('svg', { viewBox: '0 0 24 24', width: s, height: s, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.8 }, svg('path', { d: 'M21 2l-2 2m-7.6 7.6a5 5 0 1 0-7 7 5 5 0 0 0 7-7zm0 0L15 8m0 0l3 3 3-3-3-3' })),
  filter: (s=14) => svg('svg', { viewBox: '0 0 24 24', width: s, height: s, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.8 }, svg('path', { d: 'M3 5h18l-7 9v6l-4-2v-4z' })),
  plus: (s=14) => svg('svg', { viewBox: '0 0 24 24', width: s, height: s, fill: 'none', stroke: 'currentColor', 'stroke-width': 2 }, svg('path', { d: 'M12 5v14M5 12h14' })),
  search: (s=14) => svg('svg', { viewBox: '0 0 24 24', width: s, height: s, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.8 }, svg('circle', { cx:11,cy:11,r:7 }), svg('path', { d: 'M20 20l-3-3' })),
  eye: (s=14) => svg('svg', { viewBox: '0 0 24 24', width: s, height: s, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.6 }, svg('path', { d: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7z' }), svg('circle', { cx:12,cy:12,r:3 })),
  download: (s=14) => svg('svg', { viewBox: '0 0 24 24', width: s, height: s, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.8 }, svg('path', { d: 'M12 3v12M6 11l6 6 6-6M3 21h18' })),
  upload: (s=14) => svg('svg', { viewBox: '0 0 24 24', width: s, height: s, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.8 }, svg('path', { d: 'M12 21V9M6 13l6-6 6 6M3 3h18' })),
  copy: (s=14) => svg('svg', { viewBox: '0 0 24 24', width: s, height: s, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.8 }, svg('rect', { x:9,y:9,width:11,height:11,rx:2 }), svg('path', { d: 'M5 15V5a2 2 0 0 1 2-2h10' })),
  edit: (s=14) => svg('svg', { viewBox: '0 0 24 24', width: s, height: s, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.8 }, svg('path', { d: 'M12 20h9M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4z' })),
  trash: (s=14) => svg('svg', { viewBox: '0 0 24 24', width: s, height: s, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.8 }, svg('path', { d: 'M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6' })),
  play: (s=14) => svg('svg', { viewBox: '0 0 24 24', width: s, height: s, fill: 'currentColor' }, svg('path', { d: 'M8 5v14l11-7z' })),
  pause: (s=14) => svg('svg', { viewBox: '0 0 24 24', width: s, height: s, fill: 'currentColor' }, svg('path', { d: 'M6 4h4v16H6zM14 4h4v16h-4z' })),
  brain: (s=18) => svg('svg', { viewBox: '0 0 24 24', width: s, height: s, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.6 }, svg('path', { d: 'M9.5 2A3.5 3.5 0 0 0 6 5.5v.5A3 3 0 0 0 4 9c0 .9.4 1.7 1 2.3-.6.6-1 1.4-1 2.3 0 1.4.8 2.5 2 3v1a3 3 0 0 0 3 3 3 3 0 0 0 3-3V5.5A3.5 3.5 0 0 0 9.5 2zM14.5 2A3.5 3.5 0 0 1 18 5.5v.5a3 3 0 0 1 2 3c0 .9-.4 1.7-1 2.3.6.6 1 1.4 1 2.3 0 1.4-.8 2.5-2 3v1a3 3 0 0 1-3 3 3 3 0 0 1-3-3V5.5A3.5 3.5 0 0 1 14.5 2z' })),
  zap: (s=18) => svg('svg', { viewBox: '0 0 24 24', width: s, height: s, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.8 }, svg('path', { d: 'M13 2 3 14h7l-1 8 10-12h-7l1-8z' })),
  scan: (s=18) => svg('svg', { viewBox: '0 0 24 24', width: s, height: s, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.6 }, svg('path', { d: 'M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M7 12h10' })),
  list: (s=14) => svg('svg', { viewBox: '0 0 24 24', width: s, height: s, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.8 }, svg('path', { d: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01' })),
  dollar: (s=18) => svg('svg', { viewBox: '0 0 24 24', width: s, height: s, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.8 }, svg('path', { d: 'M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7H15a3.5 3.5 0 0 1 0 7H6' })),
  globe: (s=14) => svg('svg', { viewBox: '0 0 24 24', width: s, height: s, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.6 }, svg('circle', { cx:12,cy:12,r:9 }), svg('path', { d: 'M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18' })),
  exchange: (s=14) => svg('svg', { viewBox: '0 0 24 24', width: s, height: s, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.8 }, svg('path', { d: 'M3 7h18l-4-4M21 17H3l4 4' })),
  briefcase: (s=14) => svg('svg', { viewBox: '0 0 24 24', width: s, height: s, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.6 }, svg('rect', { x:2,y:7,width:20,height:14,rx:2 }), svg('path', { d: 'M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2' })),
  link: (s=14) => svg('svg', { viewBox: '0 0 24 24', width: s, height: s, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.8 }, svg('path', { d: 'M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1' }), svg('path', { d: 'M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1' })),
  flag: (s=14) => svg('svg', { viewBox: '0 0 24 24', width: s, height: s, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.8 }, svg('path', { d: 'M4 21V4M4 4h13l-2 5 2 5H4' })),
  table: (s=14) => svg('svg', { viewBox: '0 0 24 24', width: s, height: s, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.6 }, svg('rect', { x:3,y:3,width:18,height:18,rx:2 }), svg('path', { d: 'M3 9h18M3 15h18M9 3v18M15 3v18' })),
  flow: (s=18) => svg('svg', { viewBox: '0 0 24 24', width: s, height: s, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.6 }, svg('circle', { cx:5,cy:5,r:2 }), svg('circle', { cx:19,cy:5,r:2 }), svg('circle', { cx:12,cy:12,r:2 }), svg('circle', { cx:5,cy:19,r:2 }), svg('circle', { cx:19,cy:19,r:2 }), svg('path', { d: 'M7 5h3l2 5 2-5h3M7 19h3l2-5 2 5h3' })),
  pie: (s=18) => svg('svg', { viewBox: '0 0 24 24', width: s, height: s, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.6 }, svg('path', { d: 'M21 12a9 9 0 1 1-9-9v9z' }), svg('path', { d: 'M21 12a9 9 0 0 0-9-9v9h9z' })),
  newspaper: (s=14) => svg('svg', { viewBox: '0 0 24 24', width: s, height: s, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.6 }, svg('path', { d: 'M19 21V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12zM7 7h8M7 11h8M7 15h6M19 8h2v11a2 2 0 0 1-2 2' })),
  beaker: (s=14) => svg('svg', { viewBox: '0 0 24 24', width: s, height: s, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.6 }, svg('path', { d: 'M9 3h6v5l5 9a3 3 0 0 1-2.7 4H6.7A3 3 0 0 1 4 17l5-9V3zM9 8h6' })),
  shieldcheck: (s=18) => svg('svg', { viewBox: '0 0 24 24', width: s, height: s, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.6 }, svg('path', { d: 'M12 2 4 5v6c0 5 3.4 9.6 8 11 4.6-1.4 8-6 8-11V5l-8-3z' }), svg('path', { d: 'M9 12l2 2 4-4' })),
  layout: (s=14) => svg('svg', { viewBox: '0 0 24 24', width: s, height: s, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.6 }, svg('rect', { x:3,y:3,width:18,height:18,rx:2 }), svg('path', { d: 'M9 3v18M3 9h18' })),
  axe: (s=14) => svg('svg', { viewBox: '0 0 24 24', width: s, height: s, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.6 }, svg('path', { d: 'M14 4l-3 3 3 3 7-7-3-3-3 3-1 1zM4 20l9-9' })),
  open: (s=14) => svg('svg', { viewBox: '0 0 24 24', width: s, height: s, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.8 }, svg('path', { d: 'M14 3h7v7M21 3l-9 9M5 5h6M5 5v14h14v-6' })),
  cube: (s=18) => svg('svg', { viewBox: '0 0 24 24', width: s, height: s, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.6 }, svg('path', { d: 'M12 2 3 7v10l9 5 9-5V7l-9-5zM3 7l9 5 9-5M12 12v10' })),
  swap: (s=14) => svg('svg', { viewBox: '0 0 24 24', width: s, height: s, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.8 }, svg('path', { d: 'M7 4v16M3 8l4-4 4 4M17 20V4M21 16l-4 4-4-4' })),
};

/* ---- Stat card ---- */
export function statCard({ icon, iconColor, label, value, sub, subColor, sparkSeries }) {
  const ic = el('div', { class: 'ic-box' + (iconColor ? ' ' + iconColor : '') }, icon || ICN.zap(18));
  const right = el('div', {});
  right.appendChild(el('div', { class: 'label' }, label));
  right.appendChild(el('div', { class: 'val' }, value));
  if (sub) right.appendChild(el('div', { class: 'sub ' + (subColor || '') }, sub));
  return el('div', { class: 'stat-card' + (sparkSeries ? ' with-bg-spark' : '') }, ic, right);
}

/* ---- Card wrapper ---- */
export function card({ title, info, link, actions, body, klass = '' }) {
  const head = (title || actions) ? el('div', { class: 'card-head' },
    title ? el('div', { class: 'card-title' }, title, info ? el('span', { class: 'info', title: info }, '?') : null) : el('div', {}),
    actions ? el('div', { class: 'card-actions' }, ...actions) : (link ? el('span', { class: 'card-link' }, link) : null)
  ) : null;
  return el('div', { class: 'card ' + klass }, head, typeof body === 'string' ? el('div', { html: body }) : body);
}

/* ---- Tag pill ---- */
export function tag(text, cls = 'gray') { return el('span', { class: 'tag ' + cls }, text); }

/* ---- Coin pill ---- */
export function coinPill(symbol, name) {
  const sh = coinShort(symbol);
  return el('span', { class: 'coin-cell' },
    el('span', { class: 'coin-icon ' + coinClass(symbol) }, sh.slice(0, 1)),
    el('span', {},
      el('span', { class: 'name' }, sh + (symbol.endsWith('USDT') ? '/USDT' : '')),
      el('span', { class: 'sub' }, name || coinName(symbol))
    )
  );
}

/* ---- Bar bar (signal strength) ---- */
export function barbar(value, max = 100, color = '') {
  const filled = Math.round((Math.max(0, Math.min(max, value)) / max) * 10);
  const wrap = el('div', { class: 'barbar ' + color });
  for (let i = 0; i < 10; i++) wrap.appendChild(el('i', { class: i < filled ? 'on' : '' }));
  return wrap;
}

/* ---- Mini sparkline (canvas) ---- */
export function sparkline(values, w = 80, h = 22, color = '#22d3ee', up = null) {
  const c = document.createElement('canvas');
  c.width = w * 2; c.height = h * 2;
  c.style.width = w + 'px'; c.style.height = h + 'px';
  c.className = 'spark';
  const ctx = c.getContext('2d');
  ctx.scale(2, 2);
  if (!values || values.length < 2) return c;
  const min = Math.min(...values), max = Math.max(...values), rng = max - min || 1;
  const last = values[values.length - 1], first = values[0];
  const stroke = up == null ? color : (last >= first ? '#10b981' : '#ef4444');
  ctx.beginPath();
  for (let i = 0; i < values.length; i++) {
    const x = (i / (values.length - 1)) * w;
    const y = h - ((values[i] - min) / rng) * h;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.strokeStyle = stroke; ctx.lineWidth = 1.2; ctx.stroke();
  // fill below
  ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.closePath();
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, stroke + '33');
  grad.addColorStop(1, stroke + '00');
  ctx.fillStyle = grad; ctx.fill();
  return c;
}

/* ---- Gauge (semicircle / circle) ---- */
export function ringGauge({ value, max = 100, label, sublabel, color = '#10b981', size = 120 }) {
  const r = size / 2 - 8;
  const cx = size / 2, cy = size / 2;
  const circ = 2 * Math.PI * r;
  const off = circ * (1 - Math.max(0, Math.min(1, value / max)));
  const sv = svg('svg', { width: size, height: size, viewBox: `0 0 ${size} ${size}` },
    svg('circle', { cx, cy, r, stroke: 'rgba(148,163,184,0.16)', 'stroke-width': 8, fill: 'none' }),
    svg('circle', { cx, cy, r, stroke: color, 'stroke-width': 8, fill: 'none', 'stroke-dasharray': circ, 'stroke-dashoffset': off, 'stroke-linecap': 'round' })
  );
  return el('div', { class: 'gauge', style: `width:${size}px;height:${size}px;` }, sv,
    el('div', { class: 'gauge-val' },
      el('span', { class: 'v' }, String(value)),
      label ? el('span', { class: 'l' }, label) : null,
      sublabel ? el('div', { style: 'font-size:10px;color:var(--fg-3);margin-top:2px' }, sublabel) : null,
    )
  );
}

/* ---- Half-circle gauge for fear & greed ---- */
export function halfGauge({ value, max = 100, label = '', size = 200, ranges }) {
  const r = size / 2 - 14;
  const cx = size / 2, cy = size / 2 + 14;
  const grads = ranges || [
    { from: 0, to: 25, color: '#dc2626' },
    { from: 25, to: 45, color: '#f59e0b' },
    { from: 45, to: 55, color: '#facc15' },
    { from: 55, to: 75, color: '#84cc16' },
    { from: 75, to: 100, color: '#16a34a' },
  ];
  const arc = (a1, a2, color) => {
    const x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1);
    const x2 = cx + r * Math.cos(a2), y2 = cy + r * Math.sin(a2);
    const large = (a2 - a1) > Math.PI ? 1 : 0;
    return svg('path', { d: `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`, stroke: color, 'stroke-width': 14, fill: 'none', 'stroke-linecap': 'round' });
  };
  const arcs = grads.map(g => {
    const a1 = Math.PI * (1 + g.from / 100);
    const a2 = Math.PI * (1 + g.to / 100);
    return arc(a1, a2, g.color);
  });
  // pointer
  const pa = Math.PI * (1 + Math.max(0, Math.min(100, value)) / 100);
  const px = cx + (r - 22) * Math.cos(pa), py = cy + (r - 22) * Math.sin(pa);
  const sv = svg('svg', { width: size, height: size/1.6, viewBox: `0 0 ${size} ${size/1.6}` },
    ...arcs,
    svg('circle', { cx, cy, r: 5, fill: '#0c1322', stroke: '#22d3ee', 'stroke-width': 1.5 }),
    svg('line', { x1: cx, y1: cy, x2: px, y2: py, stroke: '#fff', 'stroke-width': 2, 'stroke-linecap': 'round' }),
  );
  return el('div', { style: 'position:relative;display:inline-flex;flex-direction:column;align-items:center' },
    sv,
    el('div', { style: 'position:absolute; bottom: 6px; left: 0; right: 0; text-align:center;' },
      el('div', { style: 'font-size:24px; font-weight:700; color:var(--fg-1)' }, value),
      el('div', { style: 'font-size:11px; color:var(--fg-3); text-transform:uppercase; letter-spacing:0.08em;' }, label)
    )
  );
}

/* ---- Donut chart (svg) ---- */
export function donut({ data, size = 180, thickness = 22, centerTitle, centerValue }) {
  const cx = size/2, cy = size/2, r = size/2 - thickness/2 - 4;
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  let a0 = -Math.PI/2;
  const arcs = data.map(d => {
    const ang = (d.value / total) * Math.PI * 2;
    const a1 = a0 + ang;
    const x1 = cx + r * Math.cos(a0), y1 = cy + r * Math.sin(a0);
    const x2 = cx + r * Math.cos(a1), y2 = cy + r * Math.sin(a1);
    const large = ang > Math.PI ? 1 : 0;
    const path = `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`;
    a0 = a1;
    return svg('path', { d: path, stroke: d.color, 'stroke-width': thickness, fill: 'none', 'stroke-linecap': 'butt' });
  });
  const center = svg('text', { x: cx, y: cy, class: 'donut-label-center' },
    centerValue ? svg('tspan', { x: cx, y: cy - 2, class: 'vt' }, String(centerValue)) : null,
    centerTitle ? svg('tspan', { x: cx, y: cy + 14, class: 'lt' }, centerTitle) : null,
  );
  return svg('svg', { width: size, height: size, viewBox: `0 0 ${size} ${size}` }, ...arcs, center);
}

/* ---- Progress bar ---- */
export function progress(value, max = 100, klass = '') {
  const pct = Math.max(0, Math.min(100, (value/max)*100));
  return el('div', { class: 'bar-h ' + klass }, el('i', { style: `width:${pct}%` }));
}

/* ---- Checklist row ---- */
export function checklist(items) {
  const wrap = el('div', {});
  items.forEach(it => {
    const sym = it.state === 'miss' ? ICN.x(10) : (it.state === 'warn' ? '!' : ICN.check(10));
    const cls = it.state === 'miss' ? 'cl-check miss' : (it.state === 'warn' ? 'cl-check warn' : 'cl-check');
    const row = el('div', { class: 'cl-row' },
      el('span', { class: cls }, sym),
      el('span', { class: 'flex-1' }, it.label),
      it.right ? el('span', { class: 'right' }, it.right) : null,
    );
    wrap.appendChild(row);
  });
  return wrap;
}

/* ---- Switch ---- */
export function toggle(on, label = '', onChange = null) {
  const sw = el('div', { class: 'switch ' + (on ? 'on' : '') }, el('span', { class: 'track' }), label ? el('span', { class: 'lbl' }, label) : null);
  sw.addEventListener('click', () => {
    sw.classList.toggle('on');
    if (onChange) onChange(sw.classList.contains('on'));
  });
  return sw;
}

/* ---- Heatmap cell color helper ---- */
export function heatColorClass(pct) {
  if (pct >= 5) return 'h-g5';
  if (pct >= 3) return 'h-g4';
  if (pct >= 1.5) return 'h-g3';
  if (pct >= 0.5) return 'h-g2';
  if (pct >= 0) return 'h-g1';
  if (pct >= -0.5) return 'h-r1';
  if (pct >= -1.5) return 'h-r2';
  if (pct >= -3) return 'h-r3';
  if (pct >= -5) return 'h-r4';
  return 'h-r5';
}

/* ---- Page header builder ---- */
export function pageHead({ title, subtitle, fav = false, actions = [] }) {
  const star = el('span', { class: 'page-fav ' + (fav ? 'on' : '') }, ICN.star(20, fav));
  star.addEventListener('click', () => { star.classList.toggle('on'); });
  return el('div', { class: 'page-head' },
    el('div', { class: 'page-title-block' },
      el('h1', { class: 'page-title' }, title, star),
      subtitle ? el('div', { class: 'page-sub' }, subtitle) : null
    ),
    el('div', { class: 'page-actions' }, ...actions)
  );
}

/* ---- Timeframe pills ---- */
export function tfPills(active = '4h', tfs = ['4h','1h','15m','5m'], onChange = null) {
  const wrap = el('div', { class: 'tf-pills' });
  tfs.forEach(tf => {
    const b = el('button', { class: 'tf-pill' + (tf === active ? ' active' : '') }, tf);
    b.addEventListener('click', () => {
      wrap.querySelectorAll('.tf-pill').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      if (onChange) onChange(tf);
    });
    wrap.appendChild(b);
  });
  return wrap;
}

/* ---- Pagination ---- */
export function pager({ page = 1, pages = 1, onChange }) {
  const wrap = el('div', { class: 'pager' });
  const prev = el('button', { class: 'pg-btn' }, ICN.chev(10, 'left'));
  const next = el('button', { class: 'pg-btn' }, ICN.chev(10, 'right'));
  wrap.appendChild(prev);
  for (let i = 1; i <= Math.min(pages, 5); i++) {
    const b = el('button', { class: 'pg-btn' + (i === page ? ' active' : '') }, String(i));
    b.addEventListener('click', () => onChange && onChange(i));
    wrap.appendChild(b);
  }
  if (pages > 5) wrap.appendChild(el('span', { class: 'muted small' }, '...'));
  wrap.appendChild(next);
  prev.addEventListener('click', () => onChange && onChange(Math.max(1, page-1)));
  next.addEventListener('click', () => onChange && onChange(Math.min(pages, page+1)));
  return wrap;
}

/* ---- Heatmap (sectoral) row ---- */
export function heatmapRow(label, values) {
  const cells = el('div', { class: 'he-cells' });
  values.forEach(v => cells.appendChild(el('div', { class: 'he-cell ' + heatColorClass(v) })));
  return el('div', { class: 'he-row' }, el('div', { class: 'he-name' }, label), cells);
}

export function arrowUpDown(v) {
  if (v == null) return '';
  return v >= 0 ? '↑' : '↓';
}
