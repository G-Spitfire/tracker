'use strict';
// Canonical SVG icon definitions used by the app and the icon gallery.
// Keep names and markup stable; the gallery renders these exact functions.
function ico(name,active=false){
if(name==='notice')return '<svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M10 3.5a2.3 2.3 0 0 1 4 0l9 15.6a2.3 2.3 0 0 1-2 3.4H3a2.3 2.3 0 0 1-2-3.4Z"/><path d="M12 9v5" stroke="white" stroke-width="2.6" stroke-linecap="round"/><circle cx="12" cy="17.7" r="1.5" fill="white"/></svg>';

const line={
home:'<path d="M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z"/><path d="M9.5 20v-6.5h5V20"/>',
grades:'<rect x="4" y="13" width="3.7" height="7" rx="1.7"/><rect x="10.2" y="9" width="3.7" height="11" rx="1.7"/><rect x="16.4" y="5" width="3.7" height="15" rx="1.7"/>',
schedule:'<rect x="3.5" y="5.5" width="17" height="15" rx="3.5"/><path d="M8 3.8v3.5M16 3.8v3.5M3.5 10.5h17"/><path d="M8 14.2h3.5M8 17.3h3.5M15 14.2h1"/>',
 homework:'<path d="M12 6.5C9.5 4.8 6.2 4.4 3.5 5.5v13c3-1 6-.6 8.5 1.2 2.5-1.8 5.5-2.2 8.5-1.2v-13c-2.7-1.1-6-.7-8.5 1zM12 6.5v13.2"/>',
refresh:'<path d="M19 8a7.8 7.8 0 0 0-13-2L4 8M4 4.5V8h3.5M5 16a7.8 7.8 0 0 0 13 2l2-2M20 19.5V16h-3.5"/>',profile:'<circle cx="12" cy="8" r="3.6"/><path d="M5 20v-1.3c0-3.8 3-6.2 7-6.2s7 2.4 7 6.2V20z"/>',
close:'<path d="M6 6l12 12M18 6 6 18"/>',
left:'<path d="m15 18-6-6 6-6"/>',right:'<path d="m9 18 6-6-6-6"/>'};
return '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(line[name]||'')+'</svg>'}


function kpiIcon(name){
 const art={
 average:'<rect x="3.5" y="13" width="4" height="7" rx="2"/><rect x="10" y="9" width="4" height="11" rx="2"/><rect x="16.5" y="4" width="4" height="16" rx="2"/>',
 trend:'<path d="m3.5 17 6-6 4 3.5 7-8"/><path d="M15.5 6.5h5v5"/><circle cx="3.5" cy="17" r="1" fill="currentColor" stroke="none"/>',
 star:'<path d="m12 3 2.8 5.7 6.3.9-4.55 4.45 1.08 6.2L12 17.3l-5.63 2.95 1.08-6.2L2.9 9.6l6.3-.9z"/>',
 alert:'<path d="M10.1 4.3a2.2 2.2 0 0 1 3.8 0l7.8 13.3a2.2 2.2 0 0 1-1.9 3.3H4.2a2.2 2.2 0 0 1-1.9-3.3z"/><path d="M12 9v5"/><circle cx="12" cy="17.4" r=".9" fill="currentColor" stroke="none"/>',
 tree:'<path d="m12 3-5 7h2l-5 7h16l-5-7h2z"/><path d="M12 17v4M9.5 21h5"/><path d="m12 1.8.7 1.5 1.6.2-1.2 1.1.3 1.6L12 5.4l-1.4.8.3-1.6-1.2-1.1 1.6-.2z"/>',
 flame:'<path d="M12 2.8 20 6v5.6c0 4.7-3 7.8-8 9.6-5-1.8-8-4.9-8-9.6V6z"/><path d="m8.4 12 2.5 2.5 4.8-5"/>',
 homework:'<rect x="5" y="4.5" width="14" height="17" rx="2.5"/><path d="M9 4.5v-1h6v1M8.5 9h6M8.5 12h3M9 16l2 2 4-4"/>'
 };
 return '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(art[name]||'')+'</svg>';
}
