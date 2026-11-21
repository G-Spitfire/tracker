'use strict';
// Approved static monochrome artwork. Child 0: Polina; child 1: Matvey.
const HOMEWORK_ART = Object.freeze({
  pencil:'pencil',dance:'dance',clay:'clay',tv:'tv',
  console:'console',ball:'ball',phone:'phone',book:'book'
});
function homeworkIllustration(kind){
 const file=HOMEWORK_ART[kind]||HOMEWORK_ART.pencil;
 return '<img class="homework-doodle" src="./assets/empty-states/'+file+'.png" width="78" height="78" alt="" aria-hidden="true" decoding="async">';
}
