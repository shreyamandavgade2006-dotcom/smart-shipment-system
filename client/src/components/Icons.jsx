// Minimal inline SVG icon set (stroke-based, lucide-style).
const I = ({ children, size = 18, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    {children}
  </svg>
);

export const IconDashboard = (p) => <I {...p}><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></I>;
export const IconPackage = (p) => <I {...p}><path d="M16.5 9.4 7.55 4.24" /><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" /><path d="M3.3 7 12 12l8.7-5" /><path d="M12 22V12" /></I>;
export const IconAlert = (p) => <I {...p}><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" /><path d="M12 9v4" /><path d="M12 17h.01" /></I>;
export const IconUsers = (p) => <I {...p}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></I>;
export const IconPin = (p) => <I {...p}><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" /><circle cx="12" cy="10" r="3" /></I>;
export const IconBell = (p) => <I {...p}><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></I>;
export const IconLogout = (p) => <I {...p}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" x2="9" y1="12" y2="12" /></I>;
export const IconPlus = (p) => <I {...p}><path d="M5 12h14" /><path d="M12 5v14" /></I>;
export const IconSearch = (p) => <I {...p}><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /></I>;
export const IconPencil = (p) => <I {...p}><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /><path d="m15 5 4 4" /></I>;
export const IconTrash = (p) => <I {...p}><path d="M3 6h18" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></I>;
export const IconX = (p) => <I {...p}><path d="M18 6 6 18" /><path d="m6 6 12 12" /></I>;
export const IconCheck = (p) => <I {...p}><polyline points="20 6 9 17 4 12" /></I>;
export const IconClock = (p) => <I {...p}><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></I>;
export const IconEscalate = (p) => <I {...p}><path d="M7 17 17 7" /><path d="M7 7h10v10" /></I>;
export const IconSparkles = (p) => <I {...p}><path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z" /></I>;
export const IconCopy = (p) => <I {...p}><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></I>;
export const IconRefresh = (p) => <I {...p}><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" /><path d="M21 3v5h-5" /><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" /><path d="M8 16H3v5" /></I>;
export const IconMenu = (p) => <I {...p}><line x1="4" x2="20" y1="6" y2="6" /><line x1="4" x2="20" y1="12" y2="12" /><line x1="4" x2="20" y1="18" y2="18" /></I>;
export const IconTruck = (p) => <I {...p}><path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2" /><path d="M15 18H9" /><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.62l-3.48-4.35A1 1 0 0 0 17.52 8H14" /><circle cx="17" cy="18" r="2" /><circle cx="7" cy="18" r="2" /></I>;
export const IconShield = (p) => <I {...p}><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" /></I>;
export const IconResolve = (p) => <I {...p}><circle cx="12" cy="12" r="10" /><path d="m9 12 2 2 4-4" /></I>;
export const IconTeam = (p) => <I {...p}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2" /><path d="M16 3.5a4 4 0 0 1 0 7" /></I>;
export default I;
