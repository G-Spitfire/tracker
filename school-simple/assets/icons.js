'use strict';
// Canonical SVG icon definitions used by the app and the icon gallery.
// Keep names and markup stable; the gallery renders these exact functions.
function ico(name,active=false){
const line={
home:'<path d="M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z"/><path d="M9.5 20v-6.5h5V20"/>',
grades:'<rect x="4" y="13" width="3.7" height="7" rx="1.7"/><rect x="10.2" y="9" width="3.7" height="11" rx="1.7"/><rect x="16.4" y="5" width="3.7" height="15" rx="1.7"/>',
schedule:'<rect x="3.5" y="5.5" width="17" height="15" rx="3.5"/><path d="M8 3.8v3.5M16 3.8v3.5M3.5 10.5h17"/><path d="M8 14.2h3.5M8 17.3h3.5M15 14.2h1"/>',
homework:'<path d="M12 7c-2.5-1.5-5.4-1.8-8.3-.8v12.6c2.9-.9 5.8-.7 8.3 1 2.5-1.7 5.4-1.9 8.3-1V6.2c-2.9-1-5.8-.7-8.3.8zM12 7v12.8"/>',
refresh:'<path d="M19 8a7.8 7.8 0 0 0-13-2L4 8M4 4.5V8h3.5M5 16a7.8 7.8 0 0 0 13 2l2-2M20 19.5V16h-3.5"/>',profile:'<circle cx="12" cy="8" r="3.6"/><path d="M5 20v-1.3c0-3.8 3-6.2 7-6.2s7 2.4 7 6.2V20z"/>',
left:'<path d="m15 18-6-6 6-6"/>',right:'<path d="m9 18 6-6-6-6"/>'};
return '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(line[name]||'')+'</svg>'}


function kpiIcon(name){
 const art={
 average:'<rect x="3.5" y="13" width="4" height="7" rx="2"/><rect x="10" y="9" width="4" height="11" rx="2"/><rect x="16.5" y="4" width="4" height="16" rx="2"/>',
 trend:'<path d="m3.5 17 6-6 4 3.5 7-8"/><path d="M15.5 6.5h5v5"/><circle cx="3.5" cy="17" r="1" fill="currentColor" stroke="none"/>',
 star:'<path d="m12 3 2.8 5.7 6.3.9-4.55 4.45 1.08 6.2L12 17.3l-5.63 2.95 1.08-6.2L2.9 9.6l6.3-.9z"/><path d="m9.1 12 2 2 3.9-4"/>',
 alert:'<path d="M10.1 4.3a2.2 2.2 0 0 1 3.8 0l7.8 13.3a2.2 2.2 0 0 1-1.9 3.3H4.2a2.2 2.2 0 0 1-1.9-3.3z"/><path d="M12 9v5"/><circle cx="12" cy="17.4" r=".9" fill="currentColor" stroke="none"/>',
 tree:'<path d="m12 3-5 7h2l-5 7h16l-5-7h2z"/><path d="M12 17v4M9.5 21h5"/><path d="m12 1.8.7 1.5 1.6.2-1.2 1.1.3 1.6L12 5.4l-1.4.8.3-1.6-1.2-1.1 1.6-.2z"/>',
 flame:'<path d="M12 3c.6 3 3.5 5.1 3.5 8.1 1-1 1.5-2.1 1.5-3.1 2.1 2.5 3 5 3 7.2a8 8 0 0 1-16 0c0-3.8 2.4-6.8 4.6-9.4.1 2.2.7 3.6 1.5 4.4C11.3 8.3 12 5.7 12 3z"/>',
 homework:'<path d="M12 6.5C9.5 4.8 6.2 4.4 3.5 5.5v13c3-1 6-.6 8.5 1.2 2.5-1.8 5.5-2.2 8.5-1.2v-13c-2.7-1.1-6-.7-8.5 1zM12 6.5v13.2"/><path d="M16 4.8v6l1.5-1.1 1.5 1.1V5"/>'
 };
 return '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(art[name]||'')+'</svg>';
}
