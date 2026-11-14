// Preserve DOM identity and keyboard focus between timer ticks.
const previous=new WeakMap();
export function setMarkup(element,markup){if(previous.get(element)===markup||element.innerHTML===markup){previous.set(element,markup);return}element.innerHTML=markup;previous.set(element,markup);}
