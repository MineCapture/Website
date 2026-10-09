const $ = id => document.getElementById(id);
const uid = (prefix='id') => `${prefix}-${crypto.randomUUID ? crypto.randomUUID() : Date.now() + '-' + Math.random().toString(16).slice(2)}`;
const clone = x => JSON.parse(JSON.stringify(x));
const nowIso = () => new Date().toISOString();
const todayDisplay = () => new Intl.DateTimeFormat('en-GB',{day:'2-digit',month:'long',year:'numeric'}).format(new Date());
const esc = (s='') => String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const fmtDuration = sec => { sec=Math.max(0,Math.round(sec||0)); const h=Math.floor(sec/3600),m=Math.floor((sec%3600)/60),s=sec%60; return h?`${h}h ${m}m ${s}s`:`${m}m ${s}s`; };
const safeHtml = s => s || '';
const WINDOWS_RESERVED_NAMES = new Set(['CON','PRN','AUX','NUL',...Array.from({length:9},(_,i)=>`COM${i+1}`),...Array.from({length:9},(_,i)=>`LPT${i+1}`)]);
function courseTitleValidation(title){
  const t=String(title||'').trim();
  if(!t) return 'Course title cannot be blank.';
  if(/[\x00-\x1F]/.test(t)) return 'Course title cannot contain control characters.';
  return '';
}
function makeCourseFolderName(title){
  let t=String(title||'Course').normalize('NFKD').replace(/[\u0300-\u036f]/g,'');
  t=t.replace(/[<>:"/\\|?*\x00-\x1F]/g,' ').replace(/[. ]+$/g,'').trim();
  t=t.replace(/\s+/g,'-').replace(/-+/g,'-').replace(/^[.-]+|[.-]+$/g,'');
  if(!t||WINDOWS_RESERVED_NAMES.has(t.toUpperCase())) t=`Course-${Date.now().toString(36)}`;
  return t.slice(0,90);
}
function internalCourseBase(course=state.course){
  const folder=course?.folderName || makeCourseFolderName(course?.title||'Course');
  return `Courses/${encodeURIComponent(folder)}/Media/`;
}
function courseJsonPath(course=state.course){
  const folder=course?.folderName || makeCourseFolderName(course?.title||'Course');
  return `Courses/${folder}/course.json`;
}
function isAbsoluteWebUrl(v){return /^https?:\/\//i.test(String(v||'').trim());}
function resolveResource(ref,sourceType='internal',course=state.course){
  const value=String(ref||'').trim(); if(!value)return '';
  if(sourceType==='internal'){
    const clean=value.replace(/^\/+/, '').replace(/^Media\//i,'');
    try{return new URL(internalCourseBase(course)+clean.split('/').map(encodeURIComponent).join('/'), document.baseURI).href;}catch{return '';}
  }
  return isAbsoluteWebUrl(value)?value:'';
}
function normaliseAsset(asset){
  const defaults={sourceType:'internal',ref:'',caption:'',alt:'',displaySize:'medium',enlargeable:true};
  if(!asset)return {...defaults};
  if(typeof asset==='string'){
    if(asset.startsWith('data:'))return {...defaults,sourceType:'legacy',ref:asset};
    return {...defaults,sourceType:isAbsoluteWebUrl(asset)?'web':'internal',ref:asset.replace(/^Media\//i,'')};
  }
  asset.sourceType ||= 'internal'; asset.ref ||= asset.url || ''; asset.caption ||= ''; asset.alt ||= '';
  asset.displaySize ||= 'medium';
  if(!['small','medium','large','full'].includes(asset.displaySize))asset.displaySize='medium';
  if(asset.enlargeable===undefined)asset.enlargeable=true;
  if(asset.sourceType==='internal') asset.ref=String(asset.ref).replace(/^Media\//i,'');
  return asset;
}
function imageSizeLabel(size){return ({small:'Small',medium:'Medium',large:'Large',full:'Full width'})[size]||'Medium';}
function imageClass(asset,base='step-image'){
  const a=normaliseAsset(asset); return `${base} image-size-${a.displaySize}${a.enlargeable?' image-enlargeable':''}`;
}
function assetUrl(asset,course=state.course){
  const a=normaliseAsset(asset);
  if(a.sourceType==='legacy')return a.ref;
  return resolveResource(a.ref,a.sourceType,course);
}
function resourceHint(sourceType){
  return sourceType==='internal' ? `Stored under TrainingBuilder/Courses/${state.course?.folderName||'Course'}/Media/ — enter the path inside Media, e.g. fault.jpg or Images/fault.jpg` : 'Enter a full http:// or https:// URL.';
}
function validVersion(v){return /^\d+\.\d+(?:\.\d+)?$/.test(String(v||'').trim());}

const state = {
  course:null, selectedModule:0, selectedStep:null, db:null, openQuestions:new Set(), saveTimer:null, deployedCourses:[],
  player:{mode:null,session:null,moduleIndex:0,stepIndex:0,assessmentOrder:null},
  imageViewer:{items:[],index:0,title:''},
  activity:{lastActivity:Date.now(),paused:false,tick:0}
};

const SAMPLE = {schemaVersion:3,course:{
  id:'sample-refresher',title:'Sample Refresher Training',folderName:'Sample-Refresher-Training',status:'draft',description:'A small example showing the training builder structure.',version:'1.0',defaultPassMark:80,
  objectives:['Reinforce existing knowledge','Demonstrate understanding through short checks'],modules:[{
    id:'module-introduction',title:'Introduction',description:'A short introductory module.',objectives:['Understand the purpose of refresher training'],completionMode:'assessment_required',expectedMinutes:5,
    steps:[
      {id:'step-welcome',type:'content',title:'Welcome',html:'<p>This is a sample content step. Use the builder to replace this with your own training material.</p>',images:[]},
      {id:'step-document',type:'document',title:'Reference procedure',html:'<p>This step shows how an existing rule or procedure can be linked into a course.</p>',url:'',buttonLabel:'Open document',requireAcknowledgement:true,acknowledgementText:'I confirm that I have reviewed this document.'},
      {id:'step-check',type:'knowledge-check',title:'Quick check',question:'What is the purpose of a refresher course?',choices:['Introduce an entirely new role','Reinforce and verify existing knowledge','Replace all practical training'],correctIndex:1,feedbackCorrect:'Correct.',feedbackIncorrect:'A refresher should reinforce and verify knowledge already acquired.'}
    ],
    assessment:{passMark:80,retryRule:'unlimited',shuffleQuestions:false,shuffleAnswers:false,questions:[
      {id:'q1',type:'mcq',text:'Which statement best describes refresher training?',choices:['It reinforces existing knowledge','It removes the need for competency checks','It must always last four hours'],correct:[0],feedbackCorrect:'Correct.',feedbackIncorrect:'Refresher training is intended to reinforce and verify existing knowledge.',image:''},
      {id:'q2',type:'truefalse',text:'A refresher course can use short interactive checks throughout the module.',choices:['True','False'],correct:[0],feedbackCorrect:'Correct.',feedbackIncorrect:'Short checks can reinforce key information and improve engagement.',image:''}
    ]}
  }]
}};

function toast(msg){const el=$('toast');el.textContent=msg;el.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(()=>el.classList.remove('show'),1800);}
function linesToArray(v){return String(v||'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean);}
function arrayToLines(v){return (v||[]).join('\n');}
function stepTypeLabel(t){return ({content:'Content', 'image-text':'Image + text', media:'Audio / video','knowledge-check':'Knowledge check',scenario:'Scenario',document:'Document / procedure'})[t]||t;}
function questionTypeLabel(t){return ({mcq:'Multiple choice',multi:'Multiple response',truefalse:'True / False'})[t]||t;}
function markChanged(){ $('saveStatus').textContent='Saving…'; clearTimeout(state.saveTimer); state.saveTimer=setTimeout(()=>saveCourse(true),650); }

function normalizeStep(s){
  s.id ||= uid('step'); s.type ||= 'content'; s.title ||= 'Untitled Step';
  if(s.text && !s.html) s.html=`<p>${esc(s.text).replace(/\n/g,'<br>')}</p>`;
  if(['content','image-text'].includes(s.type)){s.html ||= ''; s.images ||= []; s.images=s.images.map(normaliseAsset);}
  if(s.type==='media'){s.html ||= ''; s.mediaType ||= 'video'; s.sourceType ||= 'internal'; s.src ||= ''; if(s.sourceType==='internal'&&isAbsoluteWebUrl(s.src))s.sourceType='web'; s.requireComplete ??= false; s.playbackRequirement ||= (s.requireComplete ? (s.sourceType==='youtube' ? 'acknowledgement' : 'complete') : 'optional'); s.completionAcknowledgementText ||= 'I confirm that I have watched/listened to this media.';}
  if(s.type==='document'){s.html ||= ''; s.sourceType ||= isAbsoluteWebUrl(s.url)?'web':'internal'; s.url ||= ''; if(s.sourceType==='internal'&&isAbsoluteWebUrl(s.url))s.sourceType='web'; s.buttonLabel ||= 'Open document'; s.requireAcknowledgement ??= true; s.acknowledgementText ||= 'I confirm that I have reviewed this document.';}
  if(s.type==='knowledge-check'){s.question ||= ''; s.choices ||= ['Option 1','Option 2']; s.correctIndex ??= 0; s.feedbackCorrect ||= s.feedback || ''; s.feedbackIncorrect ||= s.feedback || '';}
  if(s.type==='scenario'){s.html ||= ''; s.image=normaliseAsset(s.image); s.question ||= ''; s.choices ||= ['Option 1','Option 2']; s.correctIndex ??= 0; s.feedbackCorrect ||= ''; s.feedbackIncorrect ||= '';}
  return s;
}
function normalizeQuestion(q){
  q.id ||= uid('q'); q.type ||= 'mcq'; q.text ||= ''; q.choices ||= q.type==='truefalse'?['True','False']:['Option 1','Option 2']; if(q.type==='truefalse')q.choices=['True','False'];
  q.correct ||= [0]; q.feedbackCorrect ||= q.feedback || ''; q.feedbackIncorrect ||= q.feedback || ''; q.image=normaliseAsset(q.image);
  return q;
}
function normalizeCourse(c){
  c.id ||= uid('course'); c.title ||= 'Untitled Course'; c.folderName ||= makeCourseFolderName(c.title); c.status ||= 'draft'; c.description ||= ''; c.version ||= '1.0'; c.defaultPassMark ??= 80; c.objectives ||= []; c.modules ||= [];
  c.modules.forEach(m=>{
    m.id ||= uid('module'); m.title ||= 'Untitled Module'; m.description ||= ''; m.objectives ||= []; m.completionMode ||= 'assessment_required'; m.expectedMinutes ??= 0; m.steps ||= []; m.steps=m.steps.map(normalizeStep);
    m.assessment ||= {passMark:c.defaultPassMark,retryRule:'unlimited',questions:[]}; m.assessment.questions ||= []; m.assessment.questions=m.assessment.questions.map(normalizeQuestion); m.assessment.passMark ??= c.defaultPassMark; m.assessment.retryRule ||= 'unlimited'; m.assessment.shuffleQuestions ??= false; m.assessment.shuffleAnswers ??= false;
  });
  return c;
}

// IndexedDB
function openDb(){return new Promise((resolve,reject)=>{const r=indexedDB.open('TrainingBuilderDB',3);r.onupgradeneeded=()=>{const db=r.result;if(!db.objectStoreNames.contains('courses'))db.createObjectStore('courses',{keyPath:'id'});if(!db.objectStoreNames.contains('sessions'))db.createObjectStore('sessions',{keyPath:'id'});if(!db.objectStoreNames.contains('completionRecords'))db.createObjectStore('completionRecords',{keyPath:'id'});if(!db.objectStoreNames.contains('publishedVersions'))db.createObjectStore('publishedVersions',{keyPath:'id'});};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
function dbStore(name,mode='readonly'){return state.db.transaction(name,mode).objectStore(name);}
function dbPut(name,obj){return new Promise((resolve,reject)=>{const tx=state.db.transaction(name,'readwrite');tx.objectStore(name).put(clone(obj));tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});}
function dbGetAll(name){return new Promise((resolve,reject)=>{const r=dbStore(name).getAll();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
function dbDelete(name,id){return new Promise((resolve,reject)=>{const tx=state.db.transaction(name,'readwrite');tx.objectStore(name).delete(id);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});}

async function loadDeployedCourses(){
  const manifestUrl=new URL('Courses/courses.json',document.baseURI).href;
  try{
    const manifestRes=await fetch(manifestUrl,{cache:'no-store'});
    if(!manifestRes.ok)throw new Error(`HTTP ${manifestRes.status}`);
    const manifest=await manifestRes.json();
    const entries=Array.isArray(manifest)?manifest:(manifest.courses||[]);
    const loaded=[];
    for(const entry of entries){
      const folder=String(entry.folder||entry.folderName||'').trim();
      if(!folder)continue;
      const file=String(entry.courseFile||'course.json').replace(/^\/+/, '');
      try{
        const url=new URL(`Courses/${encodeURIComponent(folder)}/${file}`,document.baseURI).href;
        const res=await fetch(url,{cache:'no-store'});
        if(!res.ok)throw new Error(`HTTP ${res.status}`);
        const data=await res.json();
        const course=normalizeCourse(data.course||data);
        course.folderName=folder;
        course.status='published';
        course.deliverySource='static';
        course.deliveryPath=`Courses/${folder}/${file}`;
        loaded.push({folder,courseFile:file,url,course});
      }catch(err){
        console.warn(`Could not load deployed course ${folder}:`,err);
        loaded.push({folder,courseFile:file,error:err.message,course:null});
      }
    }
    state.deployedCourses=loaded;
  }catch(err){
    console.warn('No deployed course manifest found:',err);
    state.deployedCourses=[];
  }
  const b=$('availableTrainingBtn');
  if(b){const count=state.deployedCourses.filter(x=>x.course).length;b.textContent=count?`Available training (${count})`:'Available training';}
  return state.deployedCourses;
}

async function openAvailableTraining(){
  await loadDeployedCourses();
  $('availableTrainingModal').hidden=false;
  const w=$('availableTrainingContent');
  const ok=state.deployedCourses.filter(x=>x.course), bad=state.deployedCourses.filter(x=>!x.course);
  w.innerHTML=`${ok.length?'':'<p class="muted">No deployed courses are listed in Courses/courses.json.</p>'}${ok.map((x,i)=>`<div class="record-card"><div><strong>${esc(x.course.title)}</strong><div class="record-meta">Version ${esc(x.course.version)} · ${esc(x.folder)}/${esc(x.courseFile)}${x.course.description?`<br>${esc(x.course.description)}`:''}</div></div><div class="toolbar-actions"><button class="secondary small" data-runstatic="${i}">Run course</button></div></div>`).join('')}${bad.length?`<div class="notice" style="margin-top:1rem"><strong>${bad.length} manifest entr${bad.length===1?'y could':'ies could'} not be loaded.</strong><br>${bad.map(x=>`${esc(x.folder)}: ${esc(x.error||'Unknown error')}`).join('<br>')}</div>`:''}`;
  w.querySelectorAll('[data-runstatic]').forEach(b=>b.onclick=()=>{const x=ok[Number(b.dataset.runstatic)];if(x)runDeployedCourse(x);});
}

function restoreDraftAfterDelivery(){
  const draft=state.course?._returnDraft||null;
  if(draft){state.course=draft;renderBuilder();}
}

function runDeployedCourse(entry){
  if(!entry?.course)return;
  $('availableTrainingModal').hidden=true;
  const draft=state.course;
  const c=normalizeCourse(clone(entry.course));
  c.folderName=entry.folder;
  c._returnDraft=draft;
  c.deliverySource='static';
  c.deliveryPath=`Courses/${entry.folder}/${entry.courseFile||'course.json'}`;
  state.course=c;
  openRegistration();
}


async function refreshCourseSelect(){const courses=await dbGetAll('courses');const sel=$('courseSelect');sel.innerHTML='';courses.sort((a,b)=>a.title.localeCompare(b.title)).forEach(c=>{const o=document.createElement('option');o.value=c.id;o.textContent=`${c.title} (${c.version})`;sel.appendChild(o);});if(state.course)sel.value=state.course.id;}
async function saveCourse(silent=false){if(!state.course)return;const titleErr=courseTitleValidation(state.course.title);if(titleErr){$('saveStatus').textContent='Invalid course title';if(!silent)alert(titleErr);return;}normalizeCourse(state.course);await dbPut('courses',state.course);localStorage.setItem('trainingBuilderLastCourse',state.course.id);await refreshCourseSelect();$('saveStatus').textContent='Saved';if(!silent)toast('Course saved locally');}

function bindTopLevel(){
  const simple=[['courseTitle','title'],['courseDescription','description'],['courseVersion','version']];simple.forEach(([id,key])=>$(id).oninput=e=>{state.course[key]=e.target.value;if(key==='title'){renderModuleList();updateCourseTitleWarning();}markChanged();}); $('courseTitle').onblur=updateCourseTitleWarning;
  $('courseObjectives').oninput=e=>{state.course.objectives=linesToArray(e.target.value);markChanged();};
  $('coursePassMark').oninput=e=>{state.course.defaultPassMark=Number(e.target.value||0);markChanged();};
  $('saveBtn').onclick=()=>saveCourse(false);$('newCourseBtn').onclick=newCourse;$('addModuleBtn').onclick=addModule;$('deleteModuleBtn').onclick=deleteModule;$('duplicateModuleBtn').onclick=duplicateModule;$('addStepBtn').onclick=addStep;$('addQuestionBtn').onclick=addQuestion;
  $('previewBtn').onclick=()=>startPreview();$('runCourseBtn').onclick=openRegistration;$('exitPlayerBtn').onclick=exitPlayer;$('exportBtn').onclick=exportCourse;$('importInput').onchange=importCourse;$('recordsBtn').onclick=openRecords;$('closeRecordsBtn').onclick=()=>{$('recordsModal').hidden=true;};$('availableTrainingBtn').onclick=openAvailableTraining;$('closeAvailableTrainingBtn').onclick=()=>{$('availableTrainingModal').hidden=true;};$('publishBtn').onclick=publishCurrentVersion;$('versionsBtn').onclick=openVersions;$('closeVersionsBtn').onclick=()=>{$('versionsModal').hidden=true;};
  $('cancelRegistrationBtn').onclick=()=>{$('registrationModal').hidden=true;restoreDraftAfterDelivery();};$('closeMediaModalBtn').onclick=closeMediaModal;$('mediaModal').addEventListener('click',e=>{if(e.target===$('mediaModal'))closeMediaModal();});$('closeImageModalBtn').onclick=closeImageModal;$('imageModal').addEventListener('click',e=>{if(e.target===$('imageModal'))closeImageModal();});$('imageModalPrev').onclick=()=>moveImageModal(-1);$('imageModalNext').onclick=()=>moveImageModal(1);document.addEventListener('keydown',e=>{if(e.key==='Escape'){if(!$('imageModal').hidden)closeImageModal();else if(!$('mediaModal').hidden)closeMediaModal();}if(!$('imageModal').hidden&&e.key==='ArrowLeft')moveImageModal(-1);if(!$('imageModal').hidden&&e.key==='ArrowRight')moveImageModal(1);});$('startTrainingBtn').onclick=startTrainingFromRegistration;$('resumeActivityBtn').onclick=resumeActivity;
  $('courseSelect').onchange=async e=>{const all=await dbGetAll('courses');const c=all.find(x=>x.id===e.target.value);if(c){state.course=normalizeCourse(c);state.selectedModule=0;state.selectedStep=null;state.openQuestions.clear();renderBuilder();localStorage.setItem('trainingBuilderLastCourse',c.id);}};
  $('moduleTitle').oninput=e=>{const m=currentModule();if(m){m.title=e.target.value;$('moduleHeading').textContent=m.title;renderModuleList();markChanged();}};
  $('moduleDescription').oninput=e=>{const m=currentModule();if(m){m.description=e.target.value;markChanged();}};
  $('moduleObjectives').oninput=e=>{const m=currentModule();if(m){m.objectives=linesToArray(e.target.value);markChanged();}};
  $('moduleCompletionMode').onchange=e=>{const m=currentModule();if(m){m.completionMode=e.target.value;markChanged();}};
  $('moduleExpectedMinutes').oninput=e=>{const m=currentModule();if(m){m.expectedMinutes=Number(e.target.value||0);markChanged();}};
  $('assessmentPassMark').oninput=e=>{const m=currentModule();if(m){m.assessment.passMark=Number(e.target.value||0);markChanged();}};
  $('assessmentRetry').onchange=e=>{const m=currentModule();if(m){m.assessment.retryRule=e.target.value;markChanged();}};
  $('shuffleQuestions').onchange=e=>{const m=currentModule();if(m){m.assessment.shuffleQuestions=e.target.checked;markChanged();}};
  $('shuffleAnswers').onchange=e=>{const m=currentModule();if(m){m.assessment.shuffleAnswers=e.target.checked;markChanged();}};
}

function currentModule(){return state.course?.modules?.[state.selectedModule]||null;}
function updateCourseTitleWarning(){const el=$('courseTitleWarning');if(!el)return;const err=courseTitleValidation(state.course?.title||'');el.textContent=err||'The visible title may be changed later; the storage folder remains fixed.';el.className=err?'field-hint error':'field-hint';const folder=$('courseFolder');if(folder)folder.value=state.course?.folderName||'';const hint=$('coursePathHint');if(hint)hint.textContent=`Draft JSON: TrainingBuilder/${courseJsonPath()} · Internal media: TrainingBuilder/Courses/${state.course?.folderName||''}/Media/`;}
function renderBuilder(){const c=state.course;if(!c)return;$('courseTitle').value=c.title;$('courseFolder').value=c.folderName||'';updateCourseTitleWarning();$('courseDescription').value=c.description;$('courseVersion').value=c.version;$('coursePassMark').value=c.defaultPassMark;$('courseObjectives').value=arrayToLines(c.objectives);renderModuleList();renderModuleEditor();}
function renderModuleList(){const wrap=$('moduleList');wrap.innerHTML='';state.course.modules.forEach((m,i)=>{const el=document.createElement('div');el.className='list-item'+(i===state.selectedModule?' active':'');el.draggable=true;el.dataset.index=i;el.innerHTML=`<span class="drag">☰</span><div><div class="list-title">${esc(m.title)}</div><div class="list-subtitle">${m.steps.length} step${m.steps.length===1?'':'s'} · ${m.assessment.questions.length} question${m.assessment.questions.length===1?'':'s'}</div></div><div class="mini-actions"><button class="icon-btn" data-act="up">↑</button><button class="icon-btn" data-act="down">↓</button></div>`;el.onclick=e=>{if(e.target.closest('button'))return;state.selectedModule=i;state.selectedStep=null;state.openQuestions.clear();renderBuilder();};el.querySelector('[data-act="up"]').onclick=()=>moveItem(state.course.modules,i,i-1,'module');el.querySelector('[data-act="down"]').onclick=()=>moveItem(state.course.modules,i,i+1,'module');addDragHandlers(el,state.course.modules,()=>{state.selectedModule=Math.min(state.selectedModule,state.course.modules.length-1);renderBuilder();markChanged();});wrap.appendChild(el);});}
function renderModuleEditor(){const m=currentModule();$('emptyEditor').hidden=!!m;$('moduleEditor').hidden=!m;if(!m)return;$('moduleHeading').textContent=m.title;$('moduleTitle').value=m.title;$('moduleDescription').value=m.description;$('moduleObjectives').value=arrayToLines(m.objectives);$('moduleCompletionMode').value=m.completionMode;$('moduleExpectedMinutes').value=m.expectedMinutes||'';$('assessmentPassMark').value=m.assessment.passMark;$('assessmentRetry').value=m.assessment.retryRule;$('shuffleQuestions').checked=!!m.assessment.shuffleQuestions;$('shuffleAnswers').checked=!!m.assessment.shuffleAnswers;renderStepList();renderStepEditor();renderQuestions();}
function addModule(){const c=state.course;c.modules.push({id:uid('module'),title:`Module ${c.modules.length+1}`,description:'',objectives:[],completionMode:'assessment_required',expectedMinutes:0,steps:[],assessment:{passMark:c.defaultPassMark,retryRule:'unlimited',shuffleQuestions:false,shuffleAnswers:false,questions:[]}});state.selectedModule=c.modules.length-1;state.selectedStep=null;renderBuilder();markChanged();}
function duplicateModule(){const m=currentModule();if(!m)return;const copy=clone(m);copy.id=uid('module');copy.title=`${m.title} (Copy)`;copy.steps=copy.steps.map(s=>({...s,id:uid('step')}));copy.assessment.questions=copy.assessment.questions.map(q=>({...q,id:uid('q')}));state.course.modules.splice(state.selectedModule+1,0,copy);state.selectedModule++;state.selectedStep=null;renderBuilder();markChanged();}
function deleteModule(){const m=currentModule();if(!m)return;if(!confirm(`Delete module "${m.title}"?`))return;state.course.modules.splice(state.selectedModule,1);state.selectedModule=Math.max(0,state.selectedModule-1);state.selectedStep=null;renderBuilder();markChanged();}
function moveItem(arr,from,to,kind){if(to<0||to>=arr.length)return;const [x]=arr.splice(from,1);arr.splice(to,0,x);if(kind==='module')state.selectedModule=to;if(kind==='step')state.selectedStep=to;renderBuilder();markChanged();}
function addDragHandlers(el,arr,onDone){el.addEventListener('dragstart',e=>{e.dataTransfer.setData('text/plain',el.dataset.index);el.classList.add('dragging');});el.addEventListener('dragend',()=>el.classList.remove('dragging'));el.addEventListener('dragover',e=>e.preventDefault());el.addEventListener('drop',e=>{e.preventDefault();const from=Number(e.dataTransfer.getData('text/plain')),to=Number(el.dataset.index);if(from===to||Number.isNaN(from))return;const [x]=arr.splice(from,1);arr.splice(to,0,x);onDone();});}

function newStep(type='content'){return normalizeStep({id:uid('step'),type,title:'New Step'});}
function addStep(){const m=currentModule();if(!m)return;m.steps.push(newStep('content'));state.selectedStep=m.steps.length-1;renderStepList();renderStepEditor();markChanged();}
function renderStepList(){const m=currentModule(),wrap=$('stepList');wrap.innerHTML='';m.steps.forEach((s,i)=>{const el=document.createElement('div');el.className='list-item'+(i===state.selectedStep?' active':'');el.draggable=true;el.dataset.index=i;el.innerHTML=`<span class="drag">☰</span><div><div class="list-title">${esc(s.title||'Untitled step')}</div><div class="list-subtitle">${esc(stepTypeLabel(s.type))}</div></div><div class="mini-actions"><button class="icon-btn" data-act="copy" title="Duplicate">⧉</button><button class="icon-btn" data-act="up">↑</button><button class="icon-btn" data-act="down">↓</button><button class="icon-btn" data-act="del">×</button></div>`;el.onclick=e=>{if(e.target.closest('button'))return;state.selectedStep=i;renderStepList();renderStepEditor();};el.querySelector('[data-act="copy"]').onclick=()=>{const copy=clone(s);copy.id=uid('step');copy.title=`${s.title} (Copy)`;m.steps.splice(i+1,0,copy);state.selectedStep=i+1;renderStepList();renderStepEditor();markChanged();};el.querySelector('[data-act="up"]').onclick=()=>moveItem(m.steps,i,i-1,'step');el.querySelector('[data-act="down"]').onclick=()=>moveItem(m.steps,i,i+1,'step');el.querySelector('[data-act="del"]').onclick=()=>{if(!confirm('Delete this step?'))return;m.steps.splice(i,1);state.selectedStep=null;renderStepList();renderStepEditor();markChanged();};addDragHandlers(el,m.steps,()=>{state.selectedStep=null;renderStepList();renderStepEditor();markChanged();});wrap.appendChild(el);});}
const RICH_FONTS=['Segoe UI','Arial','Calibri','Verdana','Georgia','Times New Roman'];
const RICH_SIZES=[{v:'2',label:'Small'},{v:'3',label:'Normal'},{v:'4',label:'Large'},{v:'5',label:'Extra large'}];
function richEditorHtml(value,id){return `<div class="rich-toolbar" data-for="${id}">
  <select class="rich-format-select" data-rich-action="formatBlock" title="Paragraph style"><option value="p">Paragraph</option><option value="h2">Heading 2</option><option value="h3">Heading 3</option><option value="h4">Heading 4</option></select>
  <select class="rich-font-select" data-rich-action="fontName" title="Font"><option value="">Font</option>${RICH_FONTS.map(f=>`<option value="${esc(f)}">${esc(f)}</option>`).join('')}</select>
  <select class="rich-size-select" data-rich-action="fontSize" title="Font size"><option value="">Size</option>${RICH_SIZES.map(x=>`<option value="${x.v}">${x.label}</option>`).join('')}</select>
  <button type="button" class="secondary" data-cmd="bold" title="Bold"><b>B</b></button>
  <button type="button" class="secondary" data-cmd="italic" title="Italic"><i>I</i></button>
  <button type="button" class="secondary" data-cmd="insertUnorderedList">• List</button>
  <button type="button" class="secondary" data-cmd="insertOrderedList">1. List</button>
  <button type="button" class="secondary" data-cmd="createLink">Link</button>
  <button type="button" class="secondary" data-cmd="removeFormat" title="Remove font, size and emphasis formatting">Clear formatting</button>
</div><div id="${id}" class="rich-editor" contenteditable="true">${safeHtml(value)}</div>`;}
function cleanPastedHtml(html,plain=''){
  if(!html){return esc(plain).replace(/\r?\n/g,'<br>');}
  const source=document.createElement('div'); source.innerHTML=html;
  const allowed=new Set(['P','BR','B','STRONG','I','EM','UL','OL','LI','A','H1','H2','H3','H4']);
  const cleanNode=node=>{
    if(node.nodeType===Node.TEXT_NODE)return document.createTextNode(node.nodeValue||'');
    if(node.nodeType!==Node.ELEMENT_NODE)return document.createDocumentFragment();
    const tag=node.tagName.toUpperCase();
    const frag=document.createDocumentFragment();
    const children=[...node.childNodes].map(cleanNode);
    if(!allowed.has(tag)){children.forEach(c=>frag.appendChild(c));return frag;}
    const out=document.createElement(tag.toLowerCase());
    if(tag==='A'){const href=node.getAttribute('href')||'';if(/^(https?:|mailto:|#)/i.test(href))out.setAttribute('href',href);}
    children.forEach(c=>out.appendChild(c));return out;
  };
  const holder=document.createElement('div'); [...source.childNodes].forEach(n=>holder.appendChild(cleanNode(n)));
  return holder.innerHTML;
}
function insertHtmlAtSelection(editor,html){
  editor.focus();
  if(document.queryCommandSupported?.('insertHTML')){document.execCommand('insertHTML',false,html);return;}
  const sel=window.getSelection();if(!sel||!sel.rangeCount)return;const range=sel.getRangeAt(0);range.deleteContents();const temp=document.createElement('div');temp.innerHTML=html;const frag=document.createDocumentFragment();let n,last;while((n=temp.firstChild)){last=frag.appendChild(n);}range.insertNode(frag);if(last){range.setStartAfter(last);range.collapse(true);sel.removeAllRanges();sel.addRange(range);}
}
function bindRichEditor(root,id,onChange){
  const editor=root.querySelector('#'+id),toolbar=root.querySelector(`.rich-toolbar[data-for="${id}"]`);
  toolbar.querySelectorAll('button[data-cmd]').forEach(b=>b.onclick=()=>{
    editor.focus();const cmd=b.dataset.cmd;
    if(cmd==='createLink'){const url=prompt('Enter link URL or network/intranet path');if(url)document.execCommand('createLink',false,url);}
    else document.execCommand(cmd,false,null);
    onChange(editor.innerHTML);
  });
  toolbar.querySelectorAll('select[data-rich-action]').forEach(sel=>sel.onchange=()=>{
    if(!sel.value)return;editor.focus();
    const action=sel.dataset.richAction;
    if(action==='formatBlock')document.execCommand('formatBlock',false,sel.value);
    else document.execCommand(action,false,sel.value);
    onChange(editor.innerHTML);
    if(action!=='formatBlock')sel.selectedIndex=0;
  });
  editor.addEventListener('paste',e=>{
    e.preventDefault();const dt=e.clipboardData;const html=dt?.getData('text/html')||'',plain=dt?.getData('text/plain')||'';
    insertHtmlAtSelection(editor,cleanPastedHtml(html,plain));onChange(editor.innerHTML);
  });
  editor.oninput=()=>onChange(editor.innerHTML);
}
function renderStepEditor(){const m=currentModule(),wrap=$('stepEditor');if(state.selectedStep===null||!m.steps[state.selectedStep]){wrap.hidden=true;wrap.innerHTML='';return;}wrap.hidden=false;const s=m.steps[state.selectedStep];wrap.innerHTML=`<div class="type-row"><label>Step type<select id="stepType">${['content','image-text','media','document','knowledge-check','scenario'].map(t=>`<option value="${t}" ${s.type===t?'selected':''}>${stepTypeLabel(t)}</option>`).join('')}</select></label><label>Step title<input id="stepTitle" value="${esc(s.title||'')}"></label></div><div id="stepSpecific"></div>`;
  $('stepType').onchange=e=>{const idx=state.selectedStep;m.steps[idx]=normalizeStep({...m.steps[idx],type:e.target.value});renderStepList();renderStepEditor();markChanged();};$('stepTitle').oninput=e=>{s.title=e.target.value;renderStepList();markChanged();};renderStepSpecific(s,$('stepSpecific'));
}
function renderStepSpecific(s,root){
  if(['content','image-text'].includes(s.type)){
    root.innerHTML=`<label>Content</label>${richEditorHtml(s.html,'stepRich')}${s.type==='image-text'?`<div id="stepImagePreviews" class="image-reference-list"></div><button id="addStepImage" type="button" class="secondary small">+ Add image reference</button>`:''}`;bindRichEditor(root,'stepRich',v=>{s.html=v;markChanged();});if(s.type==='image-text'){renderImageReferences(root.querySelector('#stepImagePreviews'),s.images,()=>{renderStepSpecific(s,root);markChanged();});root.querySelector('#addStepImage').onclick=()=>{s.images.push(normaliseAsset({sourceType:'internal',ref:'',caption:'',alt:''}));renderStepSpecific(s,root);markChanged();};}
  } else if(s.type==='media'){
    const legacyDataUrl=(s.src||'').startsWith('data:');
    const youtubeCompleteNote=s.sourceType==='youtube'&&s.playbackRequirement==='complete'?'<div class="notice warning">Automatic end-of-video detection is not used for YouTube in this version. The trainee will be asked to acknowledge completion after opening the video.</div>':'';
    root.innerHTML=`<label>Introductory text</label>${richEditorHtml(s.html,'stepRich')}<div class="row-2"><label>Media type<select id="mediaType"><option value="video" ${s.mediaType==='video'?'selected':''}>Video</option><option value="audio" ${s.mediaType==='audio'?'selected':''}>Audio</option></select></label><label>Source type<select id="mediaSourceType"><option value="internal" ${s.sourceType==='internal'?'selected':''}>Course media file (Media folder)</option><option value="sharepoint" ${s.sourceType==='sharepoint'?'selected':''}>SharePoint URL</option><option value="youtube" ${s.sourceType==='youtube'?'selected':''}>YouTube URL</option><option value="web" ${s.sourceType==='web'?'selected':''}>Other web URL</option></select></label></div><label>Media reference<input id="mediaUrl" value="${legacyDataUrl?'':esc(s.src)}" placeholder="${s.sourceType==='internal'?'coursevideo.mp4':'https://...'}"></label><div class="inline-actions"><button id="testMedia" type="button" class="secondary small">Test / open media</button>${s.src?'<button id="clearMedia" type="button" class="secondary small">Clear</button>':''}</div>${legacyDataUrl?'<div class="notice warning">This step contains media embedded by an older version. V1.4 no longer embeds media in course JSON. Enter a URL to replace it.</div>':''}<label>Playback requirement<select id="mediaRequirement"><option value="optional" ${s.playbackRequirement==='optional'?'selected':''}>Optional media</option><option value="open" ${s.playbackRequirement==='open'?'selected':''}>Must open media</option><option value="complete" ${s.playbackRequirement==='complete'?'selected':''}>Must complete media</option><option value="acknowledgement" ${s.playbackRequirement==='acknowledgement'?'selected':''}>Require acknowledgement</option></select></label>${youtubeCompleteNote}<label id="mediaAckLabel" ${['acknowledgement','complete'].includes(s.playbackRequirement)&&s.sourceType==='youtube'?'':'hidden'}>Completion acknowledgement<input id="mediaAckText" value="${esc(s.completionAcknowledgementText)}"></label><div class="muted">${resourceHint(s.sourceType)} Media opens in a large trainee modal.</div>`;
    bindRichEditor(root,'stepRich',v=>{s.html=v;markChanged();});
    root.querySelector('#mediaType').onchange=e=>{s.mediaType=e.target.value;markChanged();};
    root.querySelector('#mediaSourceType').onchange=e=>{s.sourceType=e.target.value;renderStepSpecific(s,root);markChanged();};
    root.querySelector('#mediaUrl').oninput=e=>{s.src=e.target.value.trim();markChanged();};
    root.querySelector('#mediaRequirement').onchange=e=>{s.playbackRequirement=e.target.value;s.requireComplete=s.playbackRequirement!=='optional';renderStepSpecific(s,root);markChanged();};
    root.querySelector('#mediaAckText')?.addEventListener('input',e=>{s.completionAcknowledgementText=e.target.value;markChanged();});
    root.querySelector('#testMedia').onclick=()=>openExternalResource(s.src,'media',s.sourceType);
    root.querySelector('#clearMedia')?.addEventListener('click',()=>{s.src='';renderStepSpecific(s,root);markChanged();});
  } else if(s.type==='document'){
    root.innerHTML=`<label>Instructions / context</label>${richEditorHtml(s.html,'stepRich')}<div class="row-2"><label>Source type<select id="docSourceType"><option value="internal" ${s.sourceType==='internal'?'selected':''}>Course file (Media folder)</option><option value="sharepoint" ${s.sourceType==='sharepoint'?'selected':''}>SharePoint URL</option><option value="web" ${s.sourceType==='web'?'selected':''}>Other web URL</option></select></label><label>Document reference<input id="docUrl" value="${esc(s.url)}" placeholder="${s.sourceType==='internal'?'procedure.pdf':'https://...'}"></label></div><div class="inline-actions"><button id="testDocument" type="button" class="secondary small">Test / open document</button></div><div class="muted">${resourceHint(s.sourceType)}</div><div class="row-2"><label>Button label<input id="docLabel" value="${esc(s.buttonLabel)}"></label><label>Acknowledgement text<input id="docAckText" value="${esc(s.acknowledgementText)}"></label></div><label><span class="checkbox-label"><input id="docAck" type="checkbox" ${s.requireAcknowledgement?'checked':''}> Require acknowledgement before continuing</span></label>`;bindRichEditor(root,'stepRich',v=>{s.html=v;markChanged();});root.querySelector('#docSourceType').onchange=e=>{s.sourceType=e.target.value;renderStepSpecific(s,root);markChanged();};root.querySelector('#docUrl').oninput=e=>{s.url=e.target.value.trim();markChanged();};root.querySelector('#testDocument').onclick=()=>openExternalResource(s.url,'document',s.sourceType);root.querySelector('#docLabel').oninput=e=>{s.buttonLabel=e.target.value;markChanged();};root.querySelector('#docAckText').oninput=e=>{s.acknowledgementText=e.target.value;markChanged();};root.querySelector('#docAck').onchange=e=>{s.requireAcknowledgement=e.target.checked;markChanged();};
  } else if(s.type==='knowledge-check'){
    root.innerHTML=`<label>Question<textarea id="kcQuestion" rows="2">${esc(s.question)}</textarea></label><div id="kcChoices"></div><button id="kcAddChoice" class="secondary small">+ Add option</button><div class="feedback-grid"><label>Correct feedback<textarea id="kcGood" rows="2">${esc(s.feedbackCorrect)}</textarea></label><label>Incorrect feedback<textarea id="kcBad" rows="2">${esc(s.feedbackIncorrect)}</textarea></label></div>`;root.querySelector('#kcQuestion').oninput=e=>{s.question=e.target.value;markChanged();};renderSimpleChoices(root.querySelector('#kcChoices'),s);root.querySelector('#kcAddChoice').onclick=()=>{s.choices.push(`Option ${s.choices.length+1}`);renderSimpleChoices(root.querySelector('#kcChoices'),s);markChanged();};root.querySelector('#kcGood').oninput=e=>{s.feedbackCorrect=e.target.value;markChanged();};root.querySelector('#kcBad').oninput=e=>{s.feedbackIncorrect=e.target.value;markChanged();};
  } else if(s.type==='scenario'){
    const sa=normaliseAsset(s.image); const surl=assetUrl(sa); root.innerHTML=`<label>Scenario description</label>${richEditorHtml(s.html,'stepRich')}<div class="row-2"><label>Image source<select id="scenarioImageSource"><option value="internal" ${sa.sourceType==='internal'?'selected':''}>Course image (Media folder)</option><option value="sharepoint" ${sa.sourceType==='sharepoint'?'selected':''}>SharePoint URL</option><option value="web" ${sa.sourceType==='web'?'selected':''}>Other web URL</option></select></label><label>Image reference<input id="scenarioImageRef" value="${esc(sa.sourceType==='legacy'?'':sa.ref)}" placeholder="${sa.sourceType==='internal'?'scenario.jpg':'https://...'}"></label></div><div class="muted">${sa.sourceType==='legacy'?'Legacy embedded image: replace it with a reference.':resourceHint(sa.sourceType)}</div>${surl?`<img class="question-image-preview" src="${esc(surl)}" alt="${esc(sa.alt)}"><button id="testScenarioImage" class="secondary small">Open image</button><button id="removeScenarioImage" class="secondary small">Remove image</button>`:''}<div class="row-2"><label>Alt text<input id="scenarioImageAlt" value="${esc(sa.alt)}"></label><label>Display size<select id="scenarioImageSize"><option value="small" ${sa.displaySize==='small'?'selected':''}>Small</option><option value="medium" ${sa.displaySize==='medium'?'selected':''}>Medium</option><option value="large" ${sa.displaySize==='large'?'selected':''}>Large</option><option value="full" ${sa.displaySize==='full'?'selected':''}>Full width</option></select></label></div><label><span class="checkbox-label"><input id="scenarioImageEnlarge" type="checkbox" ${sa.enlargeable?'checked':''}> Click to enlarge in trainee view</span></label><label>Decision / question<textarea id="scenarioQuestion" rows="2">${esc(s.question)}</textarea></label><div id="scenarioChoices"></div><button id="scenarioAddChoice" class="secondary small">+ Add option</button><div class="feedback-grid"><label>Correct feedback<textarea id="scenarioGood" rows="2">${esc(s.feedbackCorrect)}</textarea></label><label>Incorrect feedback<textarea id="scenarioBad" rows="2">${esc(s.feedbackIncorrect)}</textarea></label></div>`;bindRichEditor(root,'stepRich',v=>{s.html=v;markChanged();});root.querySelector('#scenarioImageSource').onchange=e=>{s.image.sourceType=e.target.value;s.image.ref='';renderStepSpecific(s,root);markChanged();};root.querySelector('#scenarioImageRef').oninput=e=>{s.image.ref=e.target.value.trim();markChanged();};root.querySelector('#scenarioImageAlt').oninput=e=>{s.image.alt=e.target.value;markChanged();};root.querySelector('#scenarioImageSize').onchange=e=>{s.image.displaySize=e.target.value;markChanged();};root.querySelector('#scenarioImageEnlarge').onchange=e=>{s.image.enlargeable=e.target.checked;markChanged();};root.querySelector('#testScenarioImage')?.addEventListener('click',()=>openExternalResource(s.image.ref,'image',s.image.sourceType));root.querySelector('#removeScenarioImage')?.addEventListener('click',()=>{s.image=normaliseAsset(null);renderStepSpecific(s,root);markChanged();});root.querySelector('#scenarioQuestion').oninput=e=>{s.question=e.target.value;markChanged();};renderSimpleChoices(root.querySelector('#scenarioChoices'),s);root.querySelector('#scenarioAddChoice').onclick=()=>{s.choices.push(`Option ${s.choices.length+1}`);renderSimpleChoices(root.querySelector('#scenarioChoices'),s);markChanged();};root.querySelector('#scenarioGood').oninput=e=>{s.feedbackCorrect=e.target.value;markChanged();};root.querySelector('#scenarioBad').oninput=e=>{s.feedbackIncorrect=e.target.value;markChanged();};
  }
}
function normaliseWebUrl(value){
  const v=(value||'').trim();
  if(!v)return '';
  if(/^https?:\/\//i.test(v))return v;
  return '';
}
function openExternalResource(value,label='resource',sourceType='web'){
  const url=sourceType==='internal'?resolveResource(value,'internal'):normaliseWebUrl(value);
  if(!url){toast(`Enter a valid ${label} reference first`);return;}
  window.open(url,'_blank','noopener,noreferrer');
}
function youtubeEmbedUrl(value){
  const url=normaliseWebUrl(value); if(!url)return '';
  try{
    const u=new URL(url); let id='';
    if(u.hostname.includes('youtu.be')) id=u.pathname.split('/').filter(Boolean)[0]||'';
    else if(u.hostname.includes('youtube.com')){
      if(u.pathname==='/watch') id=u.searchParams.get('v')||'';
      else if(u.pathname.startsWith('/embed/')) id=u.pathname.split('/')[2]||'';
      else if(u.pathname.startsWith('/shorts/')) id=u.pathname.split('/')[2]||'';
    }
    return id?`https://www.youtube.com/embed/${encodeURIComponent(id)}?rel=0`:'';
  }catch{return '';}
}
function effectiveMediaRequirement(s){
  if(s.playbackRequirement)return s.playbackRequirement;
  return s.requireComplete?(s.sourceType==='youtube'?'acknowledgement':'complete'):'optional';
}
function mediaPlayerHtml(s,ss){
  const url=s.sourceType==='internal'?resolveResource(s.src,'internal'):normaliseWebUrl(s.src);
  if(!url)return '<p class="muted">No valid media URL has been supplied.</p>';
  const req=effectiveMediaRequirement(s), label=s.mediaType==='audio'?'Listen to audio':'Watch video';
  const sourceLabel=({internal:'Course file',sharepoint:'SharePoint',youtube:'YouTube',web:'Web'})[s.sourceType]||'Media';
  const needsAck=req==='acknowledgement'||(req==='complete'&&s.sourceType==='youtube');
  const ack=needsAck&&ss.mediaOpened?`<label class="ack-row"><span class="checkbox-label"><input id="mediaAcknowledged" type="checkbox" ${ss.mediaCompleted?'checked':''}> ${esc(s.completionAcknowledgementText||'I confirm that I have watched/listened to this media.')}</span></label>`:'';
  const status=ss.mediaCompleted?'<span class="media-status complete">Complete</span>':ss.mediaOpened?'<span class="media-status">Opened</span>':'';
  return `<div class="media-activity-card"><div><div class="media-activity-type">${esc(sourceLabel)} · ${s.mediaType==='audio'?'Audio':'Video'}</div><div class="media-activity-title">${esc(s.title||'Media')}</div></div><div class="media-activity-actions">${status}<button type="button" id="openMediaModal">${label}</button></div></div>${ack}`;
}
function closeMediaModal(refresh=true){
  const modal=$('mediaModal'); if(!modal)return;
  const host=$('mediaModalBody');
  const media=host?.querySelector('video,audio'); if(media)media.pause();
  if(host)host.innerHTML='';
  modal.hidden=true;
  if(refresh&&state.player.mode&&state.player.session)renderPlayer();
}
function openMediaModalForStep(s,ss,m){
  const url=s.sourceType==='internal'?resolveResource(s.src,'internal'):normaliseWebUrl(s.src); if(!url){toast('No valid media URL has been supplied');return;}
  const modal=$('mediaModal'), host=$('mediaModalBody'), title=$('mediaModalTitle');
  title.textContent=s.title||'Media'; host.innerHTML='';
  if(s.sourceType==='youtube'){
    const embed=youtubeEmbedUrl(url);
    if(!embed){toast('The YouTube URL could not be recognised');return;}
    host.innerHTML=`<div class="video-modal-frame"><iframe src="${esc(embed)}" title="${esc(s.title||'YouTube video')}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe></div>`;
  }else if(s.mediaType==='audio'){
    host.innerHTML=`<div class="audio-modal-wrap"><audio id="modalStepMedia" controls autoplay preload="metadata" src="${esc(url)}"></audio><a class="button secondary small" href="${esc(url)}" target="_blank" rel="noopener">Open separately</a></div>`;
  }else{
    host.innerHTML=`<video id="modalStepMedia" class="modal-video" controls autoplay preload="metadata" src="${esc(url)}"></video><div class="inline-actions"><a class="button secondary small" href="${esc(url)}" target="_blank" rel="noopener">Open separately</a></div>`;
  }
  const firstOpen=!ss.mediaOpened; ss.mediaOpened=true; ss.mediaOpenedAt ||= nowIso();
  if(firstOpen)audit('media_opened',`${m.title} / ${s.title}`);
  const req=effectiveMediaRequirement(s);
  if(req==='open'&&!ss.mediaCompleted){ss.mediaCompleted=true;ss.mediaCompletedAt=nowIso();audit('media_completed',`${m.title} / ${s.title} (opened)`);}
  const direct=host.querySelector('#modalStepMedia');
  if(direct&&req==='complete')direct.onended=()=>{ss.mediaCompleted=true;ss.mediaCompletedAt=nowIso();audit('media_completed',`${m.title} / ${s.title}`);persistSession();closeMediaModal(false);renderPlayer();};
  persistSession(); modal.hidden=false;
}
function closeImageModal(){const modal=$('imageModal');if(!modal)return;modal.hidden=true;$('imageModalImage').removeAttribute('src');state.imageViewer={items:[],index:0,title:''};}
function openImageModal(items,index=0,title='Image'){
  const valid=(items||[]).map(normaliseAsset).filter(a=>assetUrl(a)); if(!valid.length)return;
  state.imageViewer={items:valid,index:Math.max(0,Math.min(index,valid.length-1)),title:title||'Image'};
  renderImageModal(); $('imageModal').hidden=false;
}
function renderImageModal(){
  const v=state.imageViewer,a=v.items[v.index]; if(!a)return closeImageModal();
  const img=$('imageModalImage');img.src=assetUrl(a);img.alt=a.alt||a.caption||v.title||'Training image';
  $('imageModalTitle').textContent=a.caption||v.title||'Image'; $('imageModalCaption').textContent=a.caption||'';
  const many=v.items.length>1;$('imageModalPrev').hidden=!many;$('imageModalNext').hidden=!many;$('imageModalCounter').textContent=many?`${v.index+1} of ${v.items.length}`:'';
}
function moveImageModal(delta){const v=state.imageViewer;if(!v.items.length)return;v.index=(v.index+delta+v.items.length)%v.items.length;renderImageModal();}
function playerImageHtml(raw,idx=0,group='image',baseClass='step-image'){
  const a=normaliseAsset(raw),url=assetUrl(a);if(!url)return '';
  const attrs=a.enlargeable?` role="button" tabindex="0" data-image-group="${esc(group)}" data-image-index="${idx}" title="Click to enlarge"`:'';
  return `<img class="${imageClass(a,baseClass)}" src="${esc(url)}" alt="${esc(a.alt)}"${attrs}>`;
}
function bindImageEnlargers(container,assets,title='Image',group='image'){
  const list=(assets||[]).map(normaliseAsset).filter(a=>assetUrl(a));
  container.querySelectorAll(`[data-image-group="${group}"]`).forEach(el=>{const open=()=>openImageModal(list,Number(el.dataset.imageIndex||0),title);el.addEventListener('click',open);el.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();open();}});});
}

function renderSimpleChoices(w,s){w.innerHTML='';s.choices.forEach((ch,i)=>{const r=document.createElement('div');r.className='choice-row';r.innerHTML=`<input type="radio" name="correct-${s.id}" ${Number(s.correctIndex)===i?'checked':''}><input type="text" value="${esc(ch)}"><button class="icon-btn" ${s.choices.length<=2?'disabled':''}>×</button>`;r.children[0].onchange=()=>{s.correctIndex=i;markChanged();};r.children[1].oninput=e=>{s.choices[i]=e.target.value;markChanged();};r.children[2].onclick=()=>{s.choices.splice(i,1);if(s.correctIndex>=s.choices.length)s.correctIndex=0;renderSimpleChoices(w,s);markChanged();};w.appendChild(r);});}
function renderImageReferences(w,images,onChange){
  w.innerHTML=''; (images||[]).forEach((raw,i)=>{
    const a=normaliseAsset(raw); images[i]=a; const url=assetUrl(a); const c=document.createElement('div'); c.className='asset-reference-card';
    c.innerHTML=`<div class="row-2"><label>Source<select class="asset-source"><option value="internal" ${a.sourceType==='internal'?'selected':''}>Course image (Media folder)</option><option value="sharepoint" ${a.sourceType==='sharepoint'?'selected':''}>SharePoint URL</option><option value="web" ${a.sourceType==='web'?'selected':''}>Other web URL</option></select></label><label>Image reference<input class="asset-ref" value="${esc(a.sourceType==='legacy'?'':a.ref)}" placeholder="${a.sourceType==='internal'?'example.jpg':'https://...'}"></label></div><div class="muted">${a.sourceType==='legacy'?'Legacy embedded image: replace it with a reference.':resourceHint(a.sourceType)}</div><div class="row-2"><label>Caption<input class="asset-caption" value="${esc(a.caption)}"></label><label>Alt text<input class="asset-alt" value="${esc(a.alt)}"></label></div><div class="row-2 compact-row"><label>Display size<select class="asset-size"><option value="small" ${a.displaySize==='small'?'selected':''}>Small</option><option value="medium" ${a.displaySize==='medium'?'selected':''}>Medium</option><option value="large" ${a.displaySize==='large'?'selected':''}>Large</option><option value="full" ${a.displaySize==='full'?'selected':''}>Full width</option></select></label><label><span class="checkbox-label"><input class="asset-enlarge" type="checkbox" ${a.enlargeable?'checked':''}> Click to enlarge in trainee view</span></label></div>${url?`<img class="question-image-preview" src="${esc(url)}" alt="${esc(a.alt)}">`:''}<div class="inline-actions"><button type="button" class="secondary small asset-test">Test / open image</button><button type="button" class="secondary small asset-remove">Remove</button></div>`;
    c.querySelector('.asset-source').onchange=e=>{a.sourceType=e.target.value;a.ref='';onChange();}; c.querySelector('.asset-ref').oninput=e=>{a.ref=e.target.value.trim();markChanged();}; c.querySelector('.asset-caption').oninput=e=>{a.caption=e.target.value;markChanged();}; c.querySelector('.asset-alt').oninput=e=>{a.alt=e.target.value;markChanged();}; c.querySelector('.asset-size').onchange=e=>{a.displaySize=e.target.value;markChanged();}; c.querySelector('.asset-enlarge').onchange=e=>{a.enlargeable=e.target.checked;markChanged();}; c.querySelector('.asset-test').onclick=()=>openExternalResource(a.ref,'image',a.sourceType); c.querySelector('.asset-remove').onclick=()=>{images.splice(i,1);onChange();}; w.appendChild(c);
  });
}

function newQuestion(type='mcq'){return normalizeQuestion({id:uid('q'),type,text:'New question',choices:type==='truefalse'?['True','False']:['Option 1','Option 2'],correct:[0],feedbackCorrect:'',feedbackIncorrect:'',image:normaliseAsset(null)});}
function addQuestion(){const m=currentModule();if(!m)return;const q=newQuestion();m.assessment.questions.push(q);state.openQuestions.add(q.id);renderQuestions();setTimeout(()=>document.querySelector(`[data-qid="${q.id}"]`)?.scrollIntoView({behavior:'smooth',block:'center'}),0);markChanged();}
function renderQuestions(){const m=currentModule(),wrap=$('questionList');wrap.innerHTML='';m.assessment.questions.forEach((q,i)=>wrap.appendChild(buildQuestionCard(q,i,m)));}
function buildQuestionCard(q,i,m){const d=document.createElement('details');d.className='question-card';d.dataset.qid=q.id;d.open=state.openQuestions.has(q.id);d.ontoggle=()=>{if(d.open)state.openQuestions.add(q.id);else state.openQuestions.delete(q.id);};d.innerHTML=`<summary><span>Q${i+1}. ${esc(q.text||'Untitled question')}</span><span class="summary-meta">${questionTypeLabel(q.type)}</span></summary><div class="question-grid"><div class="row-2"><label>Type<select class="q-type"><option value="mcq">Multiple choice</option><option value="multi">Multiple response</option><option value="truefalse">True / False</option></select></label><label>Question<textarea class="q-text" rows="2">${esc(q.text)}</textarea></label></div><div class="q-image-wrap"></div><div class="choices-wrap"></div>${q.type!=='truefalse'?'<button type="button" class="secondary small add-choice">+ Add option</button>':''}<div class="feedback-grid"><label>Correct feedback<textarea class="q-good" rows="2">${esc(q.feedbackCorrect)}</textarea></label><label>Incorrect feedback<textarea class="q-bad" rows="2">${esc(q.feedbackIncorrect)}</textarea></label></div><div class="question-actions"><button type="button" class="secondary duplicate-q">Duplicate question</button><button type="button" class="secondary danger delete-q">Delete question</button></div></div>`;
  const type=d.querySelector('.q-type');type.value=q.type;type.onchange=e=>{q.type=e.target.value;if(q.type==='truefalse'){q.choices=['True','False'];q.correct=[0];}else if(q.choices.length<2){q.choices=['Option 1','Option 2'];q.correct=[0];}d.querySelector('summary span').textContent=`Q${i+1}. ${q.text||'Untitled question'}`;d.querySelector('.summary-meta').textContent=questionTypeLabel(q.type);renderQuestionChoices(d.querySelector('.choices-wrap'),q);const add=d.querySelector('.add-choice');if(q.type==='truefalse'){add?.remove();}else if(!add){const b=document.createElement('button');b.type='button';b.className='secondary small add-choice';b.textContent='+ Add option';d.querySelector('.feedback-grid').before(b);bindAddChoice(b,d,q);}markChanged();};
  d.querySelector('.q-text').oninput=e=>{q.text=e.target.value;d.querySelector('summary span').textContent=`Q${i+1}. ${q.text||'Untitled question'}`;markChanged();};
  d.querySelector('.q-good').oninput=e=>{q.feedbackCorrect=e.target.value;markChanged();};d.querySelector('.q-bad').oninput=e=>{q.feedbackIncorrect=e.target.value;markChanged();}; renderSingleQuestionImageEditor(d.querySelector('.q-image-wrap'),q,()=>renderQuestionsPreserve(q.id));
  d.querySelector('.duplicate-q').onclick=()=>{const copy=clone(q);copy.id=uid('q');copy.text=`${q.text} (Copy)`;m.assessment.questions.splice(i+1,0,copy);state.openQuestions.add(copy.id);renderQuestions();markChanged();};d.querySelector('.delete-q').onclick=()=>{if(!confirm('Delete this question?'))return;m.assessment.questions.splice(i,1);state.openQuestions.delete(q.id);renderQuestions();markChanged();};
  renderQuestionChoices(d.querySelector('.choices-wrap'),q);bindAddChoice(d.querySelector('.add-choice'),d,q);return d;
}
function renderSingleQuestionImageEditor(w,q,onRefresh){
  const a=normaliseAsset(q.image); q.image=a; const url=assetUrl(a);
  w.innerHTML=`<div class="row-2"><label>Question image source<select class="q-img-source"><option value="internal" ${a.sourceType==='internal'?'selected':''}>Course image (Media folder)</option><option value="sharepoint" ${a.sourceType==='sharepoint'?'selected':''}>SharePoint URL</option><option value="web" ${a.sourceType==='web'?'selected':''}>Other web URL</option></select></label><label>Image reference<input class="q-img-ref" value="${esc(a.sourceType==='legacy'?'':a.ref)}" placeholder="${a.sourceType==='internal'?'question.jpg':'https://...'}"></label></div><div class="muted">${a.sourceType==='legacy'?'Legacy embedded image: replace it with a reference.':resourceHint(a.sourceType)}</div><div class="row-2"><label>Alt text<input class="q-img-alt" value="${esc(a.alt)}"></label><label>Display size<select class="q-img-size"><option value="small" ${a.displaySize==='small'?'selected':''}>Small</option><option value="medium" ${a.displaySize==='medium'?'selected':''}>Medium</option><option value="large" ${a.displaySize==='large'?'selected':''}>Large</option><option value="full" ${a.displaySize==='full'?'selected':''}>Full width</option></select></label></div><label><span class="checkbox-label"><input class="q-img-enlarge" type="checkbox" ${a.enlargeable?'checked':''}> Click to enlarge in trainee view</span></label>${url?`<img class="question-image-preview" src="${esc(url)}" alt="${esc(a.alt)}"><div class="inline-actions"><button type="button" class="secondary small q-img-test">Open image</button><button type="button" class="secondary small q-img-remove">Remove image</button></div>`:''}`;
  w.querySelector('.q-img-source').onchange=e=>{a.sourceType=e.target.value;a.ref='';onRefresh();markChanged();}; w.querySelector('.q-img-ref').oninput=e=>{a.ref=e.target.value.trim();markChanged();}; w.querySelector('.q-img-alt').oninput=e=>{a.alt=e.target.value;markChanged();}; w.querySelector('.q-img-size').onchange=e=>{a.displaySize=e.target.value;markChanged();}; w.querySelector('.q-img-enlarge').onchange=e=>{a.enlargeable=e.target.checked;markChanged();}; w.querySelector('.q-img-test')?.addEventListener('click',()=>openExternalResource(a.ref,'image',a.sourceType)); w.querySelector('.q-img-remove')?.addEventListener('click',()=>{q.image=normaliseAsset(null);onRefresh();markChanged();});
}
function renderQuestionsPreserve(qid){const y=window.scrollY;state.openQuestions.add(qid);renderQuestions();window.scrollTo(0,y);}
function bindAddChoice(btn,card,q){if(!btn)return;btn.onclick=()=>{q.choices.push(`Option ${q.choices.length+1}`);renderQuestionChoices(card.querySelector('.choices-wrap'),q);markChanged();};}
function renderQuestionChoices(w,q){w.innerHTML='<div class="muted">Mark the correct answer(s).</div>';q.choices.forEach((ch,i)=>{const r=document.createElement('div');r.className='choice-row';const type=q.type==='multi'?'checkbox':'radio';r.innerHTML=`<input type="${type}" name="correct-${q.id}" ${q.correct.includes(i)?'checked':''}><input type="text" value="${esc(ch)}"><button type="button" class="icon-btn" ${q.type==='truefalse'||q.choices.length<=2?'disabled':''}>×</button>`;r.children[0].onchange=e=>{if(q.type==='multi')q.correct=e.target.checked?[...new Set([...q.correct,i])]:q.correct.filter(x=>x!==i);else q.correct=[i];markChanged();};r.children[1].oninput=e=>{q.choices[i]=e.target.value;markChanged();};r.children[2].onclick=()=>{q.choices.splice(i,1);q.correct=q.correct.filter(x=>x!==i).map(x=>x>i?x-1:x);if(!q.correct.length)q.correct=[0];renderQuestionChoices(w,q);markChanged();};w.appendChild(r);});}

async function newCourse(){const entered=prompt('Enter the new course title:','New Course');if(entered===null)return;const title=entered.trim();const err=courseTitleValidation(title);if(err){alert(err);return;}const courses=await dbGetAll('courses');const used=new Set(courses.map(x=>x.folderName).filter(Boolean).map(x=>x.toLowerCase()));let base=makeCourseFolderName(title),folder=base,n=2;while(used.has(folder.toLowerCase()))folder=`${base}-${n++}`;const c=normalizeCourse({id:uid('course'),title,folderName:folder,status:'draft',description:'',objectives:[],version:'1.0',defaultPassMark:80,modules:[]});state.course=c;state.selectedModule=0;state.selectedStep=null;await dbPut('courses',c);await refreshCourseSelect();renderBuilder();}
function exportCourse(){const titleErr=courseTitleValidation(state.course.title);if(titleErr){alert(titleErr);return;}const payload={schemaVersion:3,course:state.course};const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='course.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),500);}
async function importCourse(e){const file=e.target.files[0];if(!file)return;try{const data=JSON.parse(await file.text());const c=normalizeCourse(data.course||data);if(!c.title)throw new Error('Not a course file');const courses=await dbGetAll('courses');if(courses.some(x=>x.id===c.id)){c.id=uid('course');const used=new Set(courses.map(x=>x.folderName).filter(Boolean).map(x=>x.toLowerCase()));let base=c.folderName||makeCourseFolderName(c.title),folder=base,n=2;while(used.has(folder.toLowerCase()))folder=`${base}-${n++}`;c.folderName=folder;}state.course=c;state.selectedModule=0;state.selectedStep=null;await saveCourse(true);renderBuilder();toast('Course imported');}catch(err){alert(`Import failed: ${err.message}`);}finally{e.target.value='';}}

// Training sessions

async function publishCurrentVersion(){
  await saveCourse(true);
  const c=state.course;
  const titleErr=courseTitleValidation(c.title); if(titleErr){alert(titleErr);return;}
  const v=String(c.version||'').trim();
  if(!validVersion(v)){alert('Enter a version such as 1.0, 1.1 or 2.0 before publishing.');return;}
  const id=`${c.id}@${v}`;
  const existing=(await dbGetAll('publishedVersions')).find(x=>x.id===id);
  if(existing){alert(`Version ${v} has already been published. Published versions are immutable. Change the draft version number before publishing again.`);return;}
  if(!confirm(`Publish ${c.title} version ${v}?\n\nThis creates an immutable local snapshot. Do not overwrite media files referenced by a published version; use a new filename when media changes.`))return;
  const snapshot=clone(c); snapshot.status='published'; snapshot.publishedAt=nowIso();
  const record={id,courseId:c.id,folderName:c.folderName,version:v,title:c.title,publishedAt:snapshot.publishedAt,course:snapshot};
  await dbPut('publishedVersions',record);
  c.lastPublishedVersion=v; c.lastPublishedAt=snapshot.publishedAt; await dbPut('courses',c); renderBuilder(); toast(`Published version ${v}`);
}
async function openVersions(){
  const all=(await dbGetAll('publishedVersions')).filter(x=>x.courseId===state.course.id).sort((a,b)=>b.publishedAt.localeCompare(a.publishedAt));
  $('versionsModal').hidden=false; const w=$('versionsContent');
  w.innerHTML=`<div class="version-summary"><strong>Draft:</strong> ${esc(state.course.version)} <span class="muted">· ${esc(courseJsonPath())}</span></div>${all.length?'':'<p class="muted">No published versions yet.</p>'}${all.map(x=>`<div class="record-card"><div><strong>Version ${esc(x.version)}</strong> — ${esc(x.title)}<div class="record-meta">Published ${new Date(x.publishedAt).toLocaleString('en-GB')} · Versions/${esc(x.version)}/course.json</div></div><div class="toolbar-actions"><button class="secondary small" data-previewver="${esc(x.id)}">Preview</button><button class="secondary small" data-exportver="${esc(x.id)}">Export JSON</button></div></div>`).join('')}<div class="notice" style="margin-top:1rem">Intended IIS structure: <strong>Courses/${esc(state.course.folderName)}/course.json</strong> is the editable draft. Published snapshots are stored under <strong>Courses/${esc(state.course.folderName)}/Versions/&lt;version&gt;/course.json</strong>. Media remains under <strong>Media/</strong>; after publication, replace changed media with a new filename rather than overwriting an existing referenced file.</div>`;
  w.querySelectorAll('[data-exportver]').forEach(b=>b.onclick=()=>{const r=all.find(x=>x.id===b.dataset.exportver);if(!r)return;const blob=new Blob([JSON.stringify({schemaVersion:3,course:r.course},null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='course.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),500);});
  w.querySelectorAll('[data-previewver]').forEach(b=>b.onclick=()=>{const r=all.find(x=>x.id===b.dataset.previewver);if(!r)return;$('versionsModal').hidden=true;const draft=state.course;state.course=normalizeCourse(clone(r.course));startPreview();state.course._returnDraft=draft;});
}
function createSession(trainee,mode='training'){
  const modules=state.course.modules.map(m=>({moduleId:m.id,title:m.title,startedAt:null,completedAt:null,activeSeconds:0,score:null,correctAnswers:0,totalQuestions:0,passed:null,attempts:[]}));
  return {id:uid('session'),courseId:state.course.id,courseTitle:state.course.title,courseVersion:state.course.version,courseDate:new Date().toISOString().slice(0,10),trainee,startedAt:nowIso(),updatedAt:nowIso(),completedAt:null,status:'in_progress',locked:false,currentModule:0,currentStep:0,totalActiveSeconds:0,modules,knowledge:{},stepState:{},assessmentDrafts:{},auditEvents:[],mode};
}
function audit(type,details=''){const s=state.player.session;if(!s)return;s.auditEvents.push({at:nowIso(),type,details});if(s.auditEvents.length>1000)s.auditEvents=s.auditEvents.slice(-1000);}
async function persistSession(){const s=state.player.session;if(!s||state.player.mode!=='training')return;s.updatedAt=nowIso();await dbPut('sessions',s);}
async function openRegistration(){
  const err=courseTitleValidation(state.course.title);if(err){alert(err);return;}
  $('registrationCourseTitle').textContent=`${state.course.title} — v${state.course.version}`;
  $('traineeFirstName').value='';$('traineeLastName').value='';$('traineeWorksNumber').value='';$('traineeCourseDate').value=todayDisplay();
  $('startTrainingBtn').textContent='Start new session';
  const sessions=(await dbGetAll('sessions')).filter(s=>s.courseId===state.course.id&&s.courseVersion===state.course.version&&s.status==='in_progress'&&!s.locked).sort((a,b)=>(b.updatedAt||b.startedAt||'').localeCompare(a.updatedAt||a.startedAt||''));
  const n=$('resumeNotice');
  if(sessions.length){
    n.hidden=false;
    n.innerHTML=`<strong>Unfinished session${sessions.length===1?'':'s'} found on this browser</strong><p class="muted" style="margin:.35rem 0 .7rem">Resume an existing session, or enter details below to start training for a different trainee.</p>${sessions.map(s=>`<div class="resume-session"><div><strong>${esc(s.trainee?.firstName||'')} ${esc(s.trainee?.lastName||'')}</strong> · Works No. ${esc(s.trainee?.worksNumber||'')}<div class="record-meta">Started ${new Date(s.startedAt).toLocaleString('en-GB')} · Last saved ${new Date(s.updatedAt||s.startedAt).toLocaleString('en-GB')} · Module ${Number(s.currentModule||0)+1} · ${fmtDuration(s.totalActiveSeconds)}</div></div><button type="button" class="secondary small" data-resume-session="${esc(s.id)}">Resume</button></div>`).join('')}`;
    n.querySelectorAll('[data-resume-session]').forEach(b=>b.onclick=()=>resumeSavedSession(b.dataset.resumeSession));
  }else{n.hidden=true;n.innerHTML='';}
  $('registrationModal').hidden=false;
}
async function resumeSavedSession(id){
  const sessions=await dbGetAll('sessions');const existing=sessions.find(s=>s.id===id&&s.status==='in_progress'&&!s.locked);if(!existing){toast('That session is no longer available');await openRegistration();return;}
  $('registrationModal').hidden=true;state.player.session=existing;state.player.mode='training';state.player.moduleIndex=existing.currentModule||0;state.player.stepIndex=existing.currentStep||0;audit('session_resumed','Training session resumed');await persistSession();enterPlayer();toast('Resumed existing session');
}
async function startTrainingFromRegistration(){const first=$('traineeFirstName').value.trim(),last=$('traineeLastName').value.trim(),works=$('traineeWorksNumber').value.trim();if(!first||!last||!works){toast('Enter first name, last name and works number');return;}const sessions=await dbGetAll('sessions');const existing=sessions.find(s=>s.courseId===state.course.id&&s.courseVersion===state.course.version&&s.trainee?.worksNumber?.toLowerCase()===works.toLowerCase()&&s.status==='in_progress'&&!s.locked);if(existing){await resumeSavedSession(existing.id);return;}$('registrationModal').hidden=true;const s=createSession({firstName:first,lastName:last,worksNumber:works},'training');state.player.session=s;state.player.mode='training';state.player.moduleIndex=0;state.player.stepIndex=0;audit('session_started','Training session started');startModuleIfNeeded(0);await persistSession();enterPlayer();}

function startPreview(){const err=courseTitleValidation(state.course.title);if(err){alert(err);return;}state.player.mode='preview';state.player.session=createSession({firstName:'Test',lastName:'Trainee',worksNumber:'PREVIEW'},'preview');state.player.moduleIndex=0;state.player.stepIndex=0;audit('preview_started','Author preview started');startModuleIfNeeded(0);enterPlayer();}
function enterPlayer(){$('builderView').classList.remove('active');$('playerView').classList.add('active');$('playerCourseTitle').textContent=state.course.title;state.activity.lastActivity=Date.now();state.activity.paused=false;$('pauseOverlay').hidden=true;renderPlayerIdentity();renderPlayerNav();renderPlayer();}
function exitPlayer(){if(state.player.mode==='training'&&state.player.session?.status==='in_progress')persistSession();const returnDraft=state.course?._returnDraft||null;$('playerView').classList.remove('active');$('builderView').classList.add('active');state.player.mode=null;state.player.session=null;if(returnDraft)state.course=returnDraft;renderBuilder();}
function renderPlayerIdentity(){const s=state.player.session,t=s?.trainee;if(!s||!t)return;$('playerIdentity').textContent=state.player.mode==='preview'?'Preview mode':`${t.firstName} ${t.lastName} · ${t.worksNumber}`;updateTimerDisplay();}
function updateTimerDisplay(){const s=state.player.session;if(!s)return;const mod=s.modules[state.player.moduleIndex];$('playerTimer').textContent=`Active time: ${fmtDuration(s.totalActiveSeconds)}${mod?` · Module: ${fmtDuration(mod.activeSeconds)}`:''}`;}
function startModuleIfNeeded(i){const s=state.player.session;if(!s||!s.modules[i])return;const mr=s.modules[i];if(!mr.startedAt){mr.startedAt=nowIso();audit('module_started',state.course.modules[i]?.title||`Module ${i+1}`);}}
function renderPlayerNav(){const w=$('playerModuleNav'),s=state.player.session;w.innerHTML='';state.course.modules.forEach((m,i)=>{const mr=s.modules[i],unlocked=i===0||s.modules.slice(0,i).every((x,idx)=>moduleAllowsProgress(state.course.modules[idx],x));const b=document.createElement('button');b.className='player-module'+(i===state.player.moduleIndex?' active':'')+(!unlocked?' locked':'');const status=mr.completedAt?(mr.score===null?'Completed':`${mr.passed===false?'Recorded':'Passed'} ${mr.score}%`):(!unlocked?'Locked':i===state.player.moduleIndex?'In progress':'Available');b.innerHTML=`${i+1}. ${esc(m.title)}<span class="status">${status}</span>`;b.disabled=!unlocked||s.locked;b.onclick=()=>{state.player.moduleIndex=i;state.player.stepIndex=0;s.currentModule=i;s.currentStep=0;startModuleIfNeeded(i);persistSession();renderPlayerNav();renderPlayer();};w.appendChild(b);});}
function moduleAllowsProgress(module,mr){if(!mr.completedAt)return false;if(module.completionMode==='assessment_required')return mr.passed===true;return true;}
function renderPlayer(){const s=state.player.session,m=state.course.modules[state.player.moduleIndex],w=$('playerContent');if(!m){w.innerHTML='<div class="player-card"><h2>No modules yet</h2></div>';return;}if(s.locked&&s.status==='passed'){renderCourseComplete(w);return;}s.currentModule=state.player.moduleIndex;s.currentStep=state.player.stepIndex;startModuleIfNeeded(state.player.moduleIndex);persistSession();if(state.player.stepIndex<m.steps.length)renderPlayerStep(m,state.player.stepIndex,w);else if(m.completionMode==='assessment_required'&&!m.assessment.questions.length)renderMissingAssessment(m,w);else if(m.completionMode==='steps_only'||!m.assessment.questions.length)renderModuleReady(m,w);else renderAssessment(m,w);renderPlayerNav();updateTimerDisplay();}
function progressPct(m){const total=Math.max(1,m.steps.length+1);return Math.min(100,Math.round((state.player.stepIndex/total)*100));}
function getStepState(id){const s=state.player.session;s.stepState[id] ||= {};return s.stepState[id];}
function renderPlayerStep(m,i,w){const s=m.steps[i],ss=getStepState(s.id);let body='';if(s.type==='content')body=`<div class="step-text">${safeHtml(s.html)}</div>`;if(s.type==='image-text')body=`<div class="step-text">${safeHtml(s.html)}</div><div class="gallery">${(s.images||[]).map((x,idx)=>{const a=normaliseAsset(x),u=assetUrl(a);return u?`<figure class="image-figure image-size-${a.displaySize}">${playerImageHtml(a,idx,'step-gallery')}${a.caption?`<figcaption>${esc(a.caption)}</figcaption>`:''}</figure>`:'';}).join('')}</div>`;if(s.type==='media'){const req=effectiveMediaRequirement(s);const needs=req!=='optional'&&!ss.mediaCompleted;const msg=req==='open'?'Open the media before continuing.':(req==='acknowledgement'||(req==='complete'&&s.sourceType==='youtube'))?'Open the media and confirm completion before continuing.':'The media must finish before you can continue.';body=`<div class="step-text">${safeHtml(s.html)}</div>${mediaPlayerHtml(s,ss)}${needs?`<div class="notice">${msg}</div>`:''}`;}if(s.type==='document')body=`<div class="doc-card"><div class="step-text">${safeHtml(s.html)}</div>${resolveResource(s.url,s.sourceType)?`<a class="button" href="${esc(resolveResource(s.url,s.sourceType))}" target="_blank" rel="noopener">${esc(s.buttonLabel||'Open document')}</a>`:'<p class="muted">No document link has been supplied.</p>'}${s.requireAcknowledgement?`<label class="ack-row"><span class="checkbox-label"><input id="docAcknowledged" type="checkbox" ${ss.acknowledged?'checked':''}> ${esc(s.acknowledgementText)}</span></label>`:''}</div>`;if(s.type==='knowledge-check')body=teachingQuestionHtml(s,ss,false);if(s.type==='scenario')body=`<div class="scenario-box"><div class="step-text">${safeHtml(s.html)}</div>${assetUrl(s.image)?playerImageHtml(s.image,0,'scenario-image'):''}</div>${teachingQuestionHtml(s,ss,true)}`;
  w.innerHTML=`<div class="player-card"><div class="eyebrow">Module ${state.player.moduleIndex+1} · Step ${i+1} of ${m.steps.length}</div><h2>${esc(s.title||'')}</h2><div class="progress-track"><div class="progress-bar" style="width:${progressPct(m)}%"></div></div>${body}<div class="player-actions"><button id="pBack" class="secondary" ${i===0?'disabled':''}>← Previous</button><button id="pNext">${i===m.steps.length-1?(m.completionMode==='steps_only'?'Complete module →':'Go to assessment →'):'Continue →'}</button></div></div>`;
  $('pBack').onclick=()=>{state.player.stepIndex=Math.max(0,i-1);state.player.session.currentStep=state.player.stepIndex;persistSession();renderPlayer();};$('pNext').onclick=async()=>{if(!canLeaveStep(s,ss))return;ss.completedAt ||= nowIso();audit('step_completed',`${m.title} / ${s.title}`);state.player.stepIndex=i+1;state.player.session.currentStep=state.player.stepIndex;await persistSession();renderPlayer();};
  if(s.type==='document'&&s.requireAcknowledgement)$('docAcknowledged').onchange=e=>{ss.acknowledged=e.target.checked;if(e.target.checked){ss.acknowledgedAt=nowIso();audit('document_acknowledged',`${m.title} / ${s.title}`);}persistSession();};
  if(s.type==='media'&&$('openMediaModal'))$('openMediaModal').onclick=()=>openMediaModalForStep(s,ss,m);
  if(s.type==='media'&&$('mediaAcknowledged'))$('mediaAcknowledged').onchange=e=>{ss.mediaCompleted=e.target.checked;if(e.target.checked){ss.mediaCompletedAt=nowIso();audit('media_acknowledged',`${m.title} / ${s.title}`);}persistSession();renderPlayer();};
  if(s.type==='image-text')bindImageEnlargers(w,s.images||[],s.title||'Image','step-gallery');if(s.type==='scenario'&&normaliseAsset(s.image).enlargeable)bindImageEnlargers(w,[s.image],s.title||'Scenario image','scenario-image');if(['knowledge-check','scenario'].includes(s.type))bindTeachingQuestion(s,ss);
}
function canLeaveStep(s,ss){if(s.type==='document'&&s.requireAcknowledgement&&!ss.acknowledged){toast('Acknowledge the document before continuing');return false;}if(s.type==='media'&&effectiveMediaRequirement(s)!=='optional'&&!ss.mediaCompleted){toast('Complete the media requirement before continuing');return false;}if(['knowledge-check','scenario'].includes(s.type)&&!ss.answered){toast('Answer the question before continuing');return false;}return true;}
function teachingQuestionHtml(s,ss,isScenario){return `<div class="step-text"><strong>${esc(s.question||'')}</strong></div><div id="teachChoices">${(s.choices||[]).map((c,i)=>`<label class="knowledge-choice"><input type="radio" name="teach-choice" value="${i}" ${Number(ss.choice)===i?'checked':''}> ${esc(c)}</label>`).join('')}</div><button id="teachSubmit" class="secondary">Check answer</button><div id="teachFeedback"></div>`;}
function bindTeachingQuestion(s,ss){if(ss.answered)showTeachingFeedback(s,ss.choice);$('teachSubmit').onclick=()=>{const r=document.querySelector('input[name="teach-choice"]:checked');if(!r){toast('Choose an answer');return;}ss.choice=Number(r.value);ss.answered=true;ss.correct=ss.choice===Number(s.correctIndex);ss.answeredAt=nowIso();audit('knowledge_check',`${s.title}: ${ss.correct?'correct':'incorrect'}`);persistSession();showTeachingFeedback(s,ss.choice);};}
function showTeachingFeedback(s,choice){const ok=Number(choice)===Number(s.correctIndex);$('teachFeedback').innerHTML=`<div class="feedback ${ok?'correct':'incorrect'}"><strong>${ok?'Correct':'Not quite'}</strong>${(ok?s.feedbackCorrect:s.feedbackIncorrect)?`<br>${esc(ok?s.feedbackCorrect:s.feedbackIncorrect)}`:''}</div>`;}
function renderMissingAssessment(m,w){w.innerHTML=`<div class="player-card"><div class="eyebrow">Module assessment</div><h2>${esc(m.title)}</h2><div class="notice">This module is configured to require a passed assessment, but no assessment questions have been added.</div>${state.player.mode==='preview'?'<p>Exit preview and add at least one question, or change the module completion rule.</p>':''}</div>`;}
function renderModuleReady(m,w){w.innerHTML=`<div class="player-card"><div class="eyebrow">Module complete</div><h2>${esc(m.title)}</h2><p>You have reached the end of this module.</p><button id="completeModuleBtn">Complete module</button></div>`;$('completeModuleBtn').onclick=()=>completeModule(null,0,0,true);}
function getAssessmentQuestions(m){let qs=m.assessment.questions.map(q=>({q,choiceOrder:q.choices.map((_,i)=>i)}));if(m.assessment.shuffleQuestions)qs=shuffle(qs);if(m.assessment.shuffleAnswers)qs=qs.map(x=>({...x,choiceOrder:shuffle(x.choiceOrder)}));return qs;}
function shuffle(arr){const a=[...arr];for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
function renderAssessment(m,w){const sess=state.player.session,draft=sess.assessmentDrafts[m.id] ||= {};if(!state.player.assessmentOrder||state.player.assessmentOrder.moduleId!==m.id)state.player.assessmentOrder={moduleId:m.id,items:getAssessmentQuestions(m)};const items=state.player.assessmentOrder.items;w.innerHTML=`<div class="player-card"><div class="eyebrow">Module assessment</div><h2>${esc(m.title)}</h2><p>Pass mark: <strong>${m.assessment.passMark}%</strong>${m.completionMode==='assessment_optional'?' · Score recorded but a pass is not required to continue.':''}</p><form id="assessmentForm">${items.map((x,qi)=>assessmentQuestionHtml(x.q,qi,x.choiceOrder,draft[x.q.id]||[])).join('')}<div class="player-actions"><button type="button" id="reviewModule" class="secondary">← Review module</button><button type="submit">Submit assessment</button></div></form><div id="assessmentResult"></div></div>`;
  items.forEach(x=>{const card=document.querySelector(`[data-question-id="${x.q.id}"]`);card?.querySelectorAll('input').forEach(inp=>inp.onchange=()=>{draft[x.q.id]=[...document.querySelectorAll(`[data-question-id="${x.q.id}"] input:checked`)].map(z=>Number(z.value));persistSession();});if(card&&normaliseAsset(x.q.image).enlargeable)bindImageEnlargers(card,[x.q.image],x.q.text||'Question image',`assessment-${x.q.id}`);});$('reviewModule').onclick=()=>{state.player.stepIndex=0;sess.currentStep=0;persistSession();renderPlayer();};$('assessmentForm').onsubmit=e=>{e.preventDefault();gradeAssessment(m,items,draft);};}
function assessmentQuestionHtml(q,qi,order,picked){const type=q.type==='multi'?'checkbox':'radio';return `<div class="question-card" data-question-id="${q.id}"><h3>${qi+1}. ${esc(q.text||'')}</h3>${assetUrl(q.image)?playerImageHtml(q.image,0,`assessment-${q.id}`,'assessment-question-image'):''}${order.map(i=>`<label class="knowledge-choice"><input type="${type}" name="aq-${q.id}" value="${i}" ${picked.includes(i)?'checked':''}> ${esc(q.choices[i])}</label>`).join('')}</div>`;}
async function gradeAssessment(m,items,draft){let correct=0,allAnswered=true;const feedback=[];items.forEach(({q})=>{const picked=draft[q.id]||[];if(!picked.length)allAnswered=false;const a=[...picked].sort((x,y)=>x-y),b=[...(q.correct||[])].sort((x,y)=>x-y),ok=a.length===b.length&&a.every((x,j)=>x===b[j]);if(ok)correct++;feedback.push({q,ok});});if(!allAnswered){toast('Answer every question before submitting');return;}const score=Math.round((correct/items.length)*1000)/10,passed=score>=m.assessment.passMark,mr=state.player.session.modules[state.player.moduleIndex];mr.attempts.push({at:nowIso(),score,correct,total:items.length,passed});audit('assessment_submitted',`${m.title}: ${score}% (${passed?'pass':'not passed'})`);await persistSession();const r=$('assessmentResult');r.innerHTML=`<div class="score-box ${passed?'score-pass':'score-fail'}"><h3>${passed?'Passed':'Not passed'}</h3><p>Score: <strong>${score}%</strong> · Pass mark: ${m.assessment.passMark}%</p>${feedback.map(x=>`<div class="feedback ${x.ok?'correct':'incorrect'}"><strong>${esc(x.q.text)}</strong><br>${esc(x.ok?x.q.feedbackCorrect:x.q.feedbackIncorrect)}</div>`).join('')}${passed||m.completionMode==='assessment_optional'?'<button id="nextModuleBtn">Continue</button>':`<button id="retryBtn">${m.assessment.retryRule==='review'?'Review module':'Retry assessment'}</button>`}</div>`;if(passed||m.completionMode==='assessment_optional')$('nextModuleBtn').onclick=()=>completeModule(score,correct,items.length,passed);else $('retryBtn').onclick=()=>{if(m.assessment.retryRule==='review')state.player.stepIndex=0;state.player.assessmentOrder=null;renderPlayer();};}
async function completeModule(score,correct,total,passed=true){const i=state.player.moduleIndex,m=state.course.modules[i],mr=state.player.session.modules[i];mr.score=score;mr.correctAnswers=correct||0;mr.totalQuestions=total||0;mr.passed=m.completionMode==='assessment_required'?!!passed:true;mr.completedAt=nowIso();audit('module_completed',`${m.title}${score===null?'':`: ${score}%`}`);if((m.expectedMinutes||0)>0 && mr.activeSeconds < (m.expectedMinutes*60*0.5)){audit('timing_flag',`${m.title} completed in ${fmtDuration(mr.activeSeconds)}; expected duration ${m.expectedMinutes} minutes`);}state.player.assessmentOrder=null;if(i<state.course.modules.length-1){state.player.moduleIndex=i+1;state.player.stepIndex=0;state.player.session.currentModule=i+1;state.player.session.currentStep=0;startModuleIfNeeded(i+1);await persistSession();renderPlayer();}else{await finishCourse();}}
async function finishCourse(){const s=state.player.session;const requiredOk=state.course.modules.every((m,i)=>m.completionMode!=='assessment_required'||s.modules[i].passed===true);if(!requiredOk){toast('A required module has not been passed');return;}s.status='passed';s.locked=true;s.completedAt=nowIso();audit('course_completed','Course passed and session locked');const totals=s.modules.reduce((a,m)=>({correct:a.correct+(m.correctAnswers||0),total:a.total+(m.totalQuestions||0)}),{correct:0,total:0});const overall=totals.total?Math.round((totals.correct/totals.total)*1000)/10:null;const record={id:`TRN-${new Date().getFullYear()}-${uid('').replace(/[^a-z0-9]/gi,'').slice(0,8).toUpperCase()}`,sessionId:s.id,courseId:s.courseId,courseTitle:s.courseTitle,courseVersion:s.courseVersion,courseDate:s.courseDate,trainee:clone(s.trainee),startedAt:s.startedAt,completedAt:s.completedAt,totalActiveSeconds:s.totalActiveSeconds,overallScore:overall,status:'passed',moduleResults:s.modules.map((mr,i)=>({moduleId:mr.moduleId,title:state.course.modules[i].title,score:mr.score,correctAnswers:mr.correctAnswers,totalQuestions:mr.totalQuestions,passed:mr.passed,activeSeconds:mr.activeSeconds,completedAt:mr.completedAt})),auditEvents:clone(s.auditEvents)};s.completionRecordId=record.id;if(state.player.mode==='training'){await dbPut('completionRecords',record);await dbPut('sessions',s);}renderPlayerNav();renderCourseComplete($('playerContent'),record);}
async function findCompletionRecord(){const s=state.player.session;if(!s)return null;if(s.completionRecordId){const all=await dbGetAll('completionRecords');return all.find(r=>r.id===s.completionRecordId)||null;}return null;}
function renderCourseComplete(w,record=null){const s=state.player.session;if(!record){const totals=s.modules.reduce((a,m)=>({correct:a.correct+(m.correctAnswers||0),total:a.total+(m.totalQuestions||0)}),{correct:0,total:0});record={id:s.completionRecordId||'PREVIEW',courseTitle:s.courseTitle,courseVersion:s.courseVersion,courseDate:s.courseDate,trainee:s.trainee,completedAt:s.completedAt,totalActiveSeconds:s.totalActiveSeconds,overallScore:totals.total?Math.round((totals.correct/totals.total)*1000)/10:null,moduleResults:s.modules.map((mr,i)=>({...mr,title:state.course.modules[i]?.title||mr.title}))};}w.innerHTML=`<div class="player-card"><div class="eyebrow">Course complete</div><h2>${esc(record.courseTitle)}</h2><p><strong>${esc(record.trainee.firstName)} ${esc(record.trainee.lastName)}</strong> · Works No. ${esc(record.trainee.worksNumber)}</p><table class="results-table"><thead><tr><th>Module</th><th>Active time</th><th>Result</th></tr></thead><tbody>${record.moduleResults.map(r=>`<tr><td>${esc(r.title)}</td><td>${fmtDuration(r.activeSeconds)}</td><td>${r.score===null?'Completed':`${r.score}%`}</td></tr>`).join('')}<tr><th>Course total</th><th>${fmtDuration(record.totalActiveSeconds)}</th><th>${record.overallScore===null?'Completed':`${record.overallScore}%`}</th></tr></tbody></table><div class="score-box score-pass"><strong>PASSED</strong>${state.player.mode==='training'?'<br>This completion session is now locked.':''}</div><div class="player-actions"><button id="showCertificate">View / print certificate</button>${state.player.mode==='preview'?'<button id="restartPreview" class="secondary">Restart preview</button>':''}</div></div>`;$('showCertificate').onclick=()=>renderCertificate(w,record);$('restartPreview')?.addEventListener('click',startPreview);}
function renderCertificate(w,r){const completed=new Date(r.completedAt||Date.now()).toLocaleDateString('en-GB',{day:'2-digit',month:'long',year:'numeric'});w.innerHTML=`<div class="certificate"><h1>Certificate of Completion</h1><div class="cert-subtitle"><strong>${esc(r.courseTitle)}</strong><br>Course version ${esc(r.courseVersion)}</div><p><strong>Trainee:</strong> ${esc(r.trainee.firstName)} ${esc(r.trainee.lastName)}<br><strong>Works number:</strong> ${esc(r.trainee.worksNumber)}<br><strong>Completion date:</strong> ${completed}<br><strong>Active course duration:</strong> ${fmtDuration(r.totalActiveSeconds)}</p><table class="results-table"><thead><tr><th>Module</th><th>Score</th></tr></thead><tbody>${r.moduleResults.map(x=>`<tr><td>${esc(x.title)}</td><td>${x.score===null?'Completed':`${x.score}%`}</td></tr>`).join('')}<tr><th>Overall course score</th><th>${r.overallScore===null?'Completed':`${r.overallScore}%`}</th></tr></tbody></table><h2 style="text-align:center;margin-top:2rem">PASSED</h2><div class="signature-grid"><div class="signature-box"><strong>Trainee</strong><div class="signature-line"></div><div>Print name</div><div class="signature-line"></div><div>Signature</div><div class="signature-line"></div><div>Date</div></div><div class="signature-box"><strong>Manager</strong><div class="signature-line"></div><div>Print name</div><div class="signature-line"></div><div>Signature</div><div class="signature-line"></div><div>Date</div></div></div><div class="completion-id">Completion record: ${esc(r.id)}</div></div><div class="player-actions"><button id="printCert">Print / Save PDF</button><button id="backSummary" class="secondary">Back to summary</button></div>`;$('printCert').onclick=()=>window.print();$('backSummary').onclick=()=>renderCourseComplete(w,r);}

// Active time / inactivity
function activityPing(){if(state.player.mode)state.activity.lastActivity=Date.now();}
function resumeActivity(){state.activity.paused=false;state.activity.lastActivity=Date.now();$('pauseOverlay').hidden=true;audit('activity_resumed','Training resumed after inactivity');persistSession();}
function activityTick(){const s=state.player.session;if(!s||!state.player.mode||s.locked)return;const idle=Date.now()-state.activity.lastActivity;if(idle>120000&&!state.activity.paused){state.activity.paused=true;$('pauseOverlay').hidden=false;audit('activity_paused','Paused after 2 minutes of inactivity');persistSession();}if(state.activity.paused||document.hidden)return;s.totalActiveSeconds=(s.totalActiveSeconds||0)+1;const mr=s.modules[state.player.moduleIndex];if(mr)mr.activeSeconds=(mr.activeSeconds||0)+1;state.activity.tick++;if(state.activity.tick%10===0)persistSession();updateTimerDisplay();}
['pointerdown','keydown','touchstart','scroll'].forEach(evt=>window.addEventListener(evt,activityPing,{passive:true}));setInterval(activityTick,1000);

// Records
async function openRecords(){$('recordsModal').hidden=false;const records=(await dbGetAll('completionRecords')).sort((a,b)=>(b.completedAt||'').localeCompare(a.completedAt||'')),sessions=(await dbGetAll('sessions')).filter(s=>s.status==='in_progress');const w=$('recordsContent');w.innerHTML=`<h3>Completed</h3>${records.length?'':'<p class="muted">No completed training records on this browser.</p>'}${records.map(r=>`<div class="record-card"><div><strong>${esc(r.trainee.firstName)} ${esc(r.trainee.lastName)}</strong> — ${esc(r.courseTitle)}<div class="record-meta">${esc(r.trainee.worksNumber)} · ${new Date(r.completedAt).toLocaleString('en-GB')} · ${r.overallScore===null?'Completed':r.overallScore+'%'} · ${fmtDuration(r.totalActiveSeconds)}</div></div><div class="toolbar-actions"><button class="secondary small" data-cert="${r.id}">Certificate</button><button class="secondary small" data-audit="${r.id}">Audit</button></div></div>`).join('')}<h3 style="margin-top:1.5rem">In progress</h3>${sessions.length?'':'<p class="muted">No in-progress sessions.</p>'}${sessions.map(s=>`<div class="record-card"><div><strong>${esc(s.trainee.firstName)} ${esc(s.trainee.lastName)}</strong> — ${esc(s.courseTitle)}<div class="record-meta">${esc(s.trainee.worksNumber)} · Started ${new Date(s.startedAt).toLocaleString('en-GB')} · ${fmtDuration(s.totalActiveSeconds)}</div></div></div>`).join('')}`;w.querySelectorAll('[data-cert]').forEach(b=>b.onclick=()=>showRecordCertificate(records.find(r=>r.id===b.dataset.cert)));w.querySelectorAll('[data-audit]').forEach(b=>b.onclick=()=>showAudit(records.find(r=>r.id===b.dataset.audit)));}
function showRecordCertificate(r){const w=$('recordsContent');const completed=new Date(r.completedAt).toLocaleDateString('en-GB',{day:'2-digit',month:'long',year:'numeric'});w.innerHTML=`<button id="recordsBack" class="secondary small">← Back</button><div class="certificate" style="margin-top:1rem"><h1>Certificate of Completion</h1><div class="cert-subtitle"><strong>${esc(r.courseTitle)}</strong><br>Course version ${esc(r.courseVersion)}</div><p><strong>Trainee:</strong> ${esc(r.trainee.firstName)} ${esc(r.trainee.lastName)}<br><strong>Works number:</strong> ${esc(r.trainee.worksNumber)}<br><strong>Completion date:</strong> ${completed}<br><strong>Active duration:</strong> ${fmtDuration(r.totalActiveSeconds)}</p><table class="results-table"><tbody>${r.moduleResults.map(x=>`<tr><td>${esc(x.title)}</td><td>${x.score===null?'Completed':x.score+'%'}</td></tr>`).join('')}<tr><th>Overall</th><th>${r.overallScore===null?'Completed':r.overallScore+'%'}</th></tr></tbody></table><div class="signature-grid"><div class="signature-box"><strong>Trainee</strong><div class="signature-line"></div><div>Signature</div></div><div class="signature-box"><strong>Manager</strong><div class="signature-line"></div><div>Signature</div></div></div><div class="completion-id">Completion record: ${esc(r.id)}</div></div><button id="recordPrint" style="margin-top:1rem">Print / Save PDF</button>`;$('recordsBack').onclick=openRecords;$('recordPrint').onclick=()=>window.print();}
function showAudit(r){const w=$('recordsContent');w.innerHTML=`<button id="recordsBack" class="secondary small">← Back</button><h3 style="margin-top:1rem">Audit history — ${esc(r.id)}</h3><table class="audit-table"><thead><tr><th>Date / time</th><th>Event</th><th>Details</th></tr></thead><tbody>${(r.auditEvents||[]).map(a=>`<tr><td>${new Date(a.at).toLocaleString('en-GB')}</td><td>${esc(a.type)}</td><td>${esc(a.details||'')}</td></tr>`).join('')}</tbody></table>`;$('recordsBack').onclick=openRecords;}

async function init(){state.db=await openDb();let courses=await dbGetAll('courses');if(!courses.length){await dbPut('courses',clone(SAMPLE.course));courses=await dbGetAll('courses');}const last=localStorage.getItem('trainingBuilderLastCourse');state.course=normalizeCourse(courses.find(c=>c.id===last)||courses[0]);bindTopLevel();await refreshCourseSelect();renderBuilder();await loadDeployedCourses();}
init().catch(err=>{console.error(err);alert('Training Builder could not start: '+err.message);});
