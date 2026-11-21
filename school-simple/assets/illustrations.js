'use strict';
// Canonical homework empty-state SVG illustrations.
function homeworkIllustration(kind){
   const shapes={bag:'<rect x="18" y="17" width="44" height="50" rx="11"/><path d="M29 18v-5a11 11 0 0 1 22 0v5M27 43h26v14H27zM31 33h2m14 0h2M35 38q5 5 10 0M18 33l-10-8m54 8 10-8"/>',cat:'<path d="M18 33 17 17l13 9q10-5 20 0l13-9-1 16q8 21-7 28-15 8-30 0-15-7-7-28zM31 40h2m14 0h2m-14 9q5 5 10 0M23 48l-13-3m13 8-13 2m47-7 13-3m-13 8 13 2"/>',pencil:'<path d="m22 56 29-42q5-7 12-2t2 12L36 66 16 73zM22 56l14 10M47 20l14 10M16 73l7-18M11 25l-6-4m12-5-2-8m49 44 8 4"/>',books:'<path d="M14 29h45l8 11-8 11H14q-8-11 0-22zM18 51h45l-5 13H13q-6-7 5-13zM17 40h46M25 35h13m5 0h10M29 35v6m18-6v6M9 18l4-8 4 8 8 4-8 4-4 8-4-8-8-4z"/>'};return '<svg class="homework-doodle" viewBox="0 0 80 80" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">'+shapes[kind]+'</g></svg>';
  }
