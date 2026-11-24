/* Loads the single editable WordScene dictionary before the app starts. */
(()=>{'use strict';
const ready=fetch('../words.json',{cache:'no-cache'}).then(response=>{
 if(!response.ok)throw new Error('WordScene dictionary could not be loaded ('+response.status+')');
 return response.json();
}).then(catalog=>{
 if(!catalog||catalog.version!==1||!Array.isArray(catalog.words)||!Array.isArray(catalog.topics))throw new Error('WordScene dictionary has an unsupported format');
 const byWord=Object.create(null);
 for(const topic of catalog.topics)for(const word of topic.words||[])(byWord[word.toLowerCase()]??=[]).push(topic.id);
 catalog.forWord=en=>(byWord[String(en).toLowerCase()]||[]);
 window.WordSceneCatalog=catalog;
 window.dispatchEvent(new Event('wordscene-catalog-ready'));
 return catalog;
});
window.WordSceneCatalogReady=ready;
ready.catch(error=>{
 console.error(error);
 const app=document.getElementById('app');
 if(app)app.innerHTML='<main><h1>Не удалось загрузить словарь</h1><p>Проверь подключение и обнови страницу.</p></main>';
});
})();
