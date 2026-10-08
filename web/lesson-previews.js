(async()=>{
 await window.RP_I18N.ready;
 const text=(button,open)=>{
  button.dataset.i18n=open?'HIDE PREVIEW':'SHOW PREVIEW';
  button.textContent=window.RP_I18N.t(button.dataset.i18n);
  button.setAttribute('aria-expanded',String(open));
 };
 const close=button=>{
  const panel=document.getElementById(button.getAttribute('aria-controls'));
  panel?.querySelector('video')?.pause();
  if(panel)panel.hidden=true;
  text(button,false);
 };
 // One delegated controller covers authored pack rows and future matching lessons.
 document.addEventListener('click',event=>{
  const button=event.target.closest('[data-preview-toggle]');if(!button)return;
  const panel=document.getElementById(button.getAttribute('aria-controls'));if(!panel)return;
  const opening=panel.hidden;
  document.querySelectorAll('[data-preview-toggle]').forEach(other=>{if(other!==button)close(other);});
  if(opening){panel.hidden=false;text(button,true);}else close(button);
 });
 const manifest=await fetch('/lesson-previews.json').then(r=>r.json());
 for(const target of document.querySelectorAll('[data-tutorial-target]')){
  const item=manifest.find(p=>p.id===target.dataset.tutorialTarget);
  if(!item||item.duration>40.001)continue;
  // Exact identifiers only: never fall back to a numbered clip or another routine.
  const container=document.createElement('div');container.className='lesson-preview';container.id=`preview-${item.id}`;container.hidden=true;
  const button=document.createElement('button');button.type='button';button.className='preview-toggle';button.dataset.previewToggle='';button.setAttribute('aria-controls',container.id);text(button,false);
  const label=document.createElement('p');label.dataset.i18n='TUTORIAL PREVIEW · UP TO 40 SECONDS';label.textContent=window.RP_I18N.t(label.dataset.i18n);
  const video=document.createElement('video');video.controls=true;video.playsInline=true;video.preload='none';video.poster=item.poster;video.src=item.preview;video.dataset.lessonId=item.id;video.width=item.width;video.height=item.height;video.setAttribute('data-i18n-aria-label','Tutorial preview');video.setAttribute('aria-label',window.RP_I18N.t('Tutorial preview'));
  container.append(label,video);target.querySelector('.lesson-unavailable')?.remove();target.append(button,container);
 }
})();
