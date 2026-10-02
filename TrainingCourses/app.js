const $ = (id) => document.getElementById(id);
const uid = (prefix='id') => `${prefix}-${crypto.randomUUID ? crypto.randomUUID() : Date.now()+Math.random().toString(16).slice(2)}`;
const clone = (x) => JSON.parse(JSON.stringify(x));

const state = {
  course: null,
  selectedModule: 0,
  selectedStep: null,
  db: null,
  player: { moduleIndex:0, stepIndex:0, unlocked:0, completed:{}, knowledge:{} }
};

const SAMPLE = {
  schemaVersion: 1,
  course: {
    id: 'sample-refresher', title: 'Sample Refresher Training',
    description: 'A small example course showing the V1 training builder structure.', version: '1.0', defaultPassMark: 80,
    modules: [{
      id:'module-introduction', title:'Introduction', description:'A short introductory module.',
      steps:[
        {id:'step-welcome',type:'content',title:'Welcome',text:'This is a sample content step. Use the builder to replace this text with your own training material.',images:[]},
        {id:'step-check',type:'knowledge-check',title:'Quick check',question:'What is the purpose of a refresher course?',choices:['Introduce an entirely new role','Reinforce and verify existing knowledge','Replace all practical training'],correctIndex:1,feedback:'A refresher should reinforce and verify knowledge already acquired.'}
      ],
      assessment:{passMark:80,retryRule:'unlimited',questions:[
        {id:'q1',type:'mcq',text:'Which statement best describes refresher training?',choices:['It reinforces existing knowledge','It removes the need for competency checks','It must always last four hours'],correct:[0],feedback:'Refresher training is intended to reinforce and verify existing knowledge.'},
        {id:'q2',type:'truefalse',text:'A refresher course can use short interactive checks throughout the module.',choices:['True','False'],correct:[0],feedback:'Short checks can reinforce key information and improve engagement.'}
      ]}
    }]
  }
};

function toast(msg){ const el=$('toast'); el.textContent=msg; el.classList.add('show'); clearTimeout(toast.t); toast.t=setTimeout(()=>el.classList.remove('show'),1800); }
function esc(s=''){ return String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
function nl2br(s=''){ return esc(s).replace(/\n/g,'<br>'); }
function normalizeCourse(c){
  c.id ||= uid('course'); c.title ||= 'Untitled Course'; c.description ||= ''; c.version ||= '1.0'; c.defaultPassMark ??= 80; c.modules ||= [];
  c.modules.forEach(m=>{ m.id ||= uid('module'); m.title ||= 'Untitled Module'; m.description ||= ''; m.steps ||= []; m.assessment ||= {passMark:c.defaultPassMark,retryRule:'unlimited',questions:[]}; m.assessment.questions ||= []; m.assessment.passMark ??= c.defaultPassMark; m.assessment.retryRule ||= 'unlimited'; });
  return c;
}

// IndexedDB
function openDb(){ return new Promise((resolve,reject)=>{ const r=indexedDB.open('TrainingBuilderDB',1); r.onupgradeneeded=()=>{ const db=r.result; if(!db.objectStoreNames.contains('courses')) db.createObjectStore('courses',{keyPath:'id'}); }; r.onsuccess=()=>resolve(r.result); r.onerror=()=>reject(r.error); }); }
function dbPut(course){ return new Promise((resolve,reject)=>{ const tx=state.db.transaction('courses','readwrite'); tx.objectStore('courses').put(clone(course)); tx.oncomplete=resolve; tx.onerror=()=>reject(tx.error); }); }
function dbGetAll(){ return new Promise((resolve,reject)=>{ const r=state.db.transaction('courses').objectStore('courses').getAll(); r.onsuccess=()=>resolve(r.result); r.onerror=()=>reject(r.error); }); }
async function refreshCourseSelect(){ const courses=await dbGetAll(); const sel=$('courseSelect'); sel.innerHTML=''; courses.sort((a,b)=>a.title.localeCompare(b.title)).forEach(c=>{ const o=document.createElement('option'); o.value=c.id; o.textContent=`${c.title} (${c.version})`; sel.appendChild(o); }); if(state.course) sel.value=state.course.id; }

function bindTopLevel(){
  $('courseTitle').oninput=e=>{state.course.title=e.target.value; renderModuleList();};
  $('courseDescription').oninput=e=>state.course.description=e.target.value;
  $('courseVersion').oninput=e=>state.course.version=e.target.value;
  $('coursePassMark').oninput=e=>state.course.defaultPassMark=Number(e.target.value||0);
  $('saveBtn').onclick=saveCourse;
  $('newCourseBtn').onclick=newCourse;
  $('addModuleBtn').onclick=addModule;
  $('deleteModuleBtn').onclick=deleteModule;
  $('addStepBtn').onclick=addStep;
  $('addQuestionBtn').onclick=addQuestion;
  $('previewBtn').onclick=startPreview;
  $('exitPreviewBtn').onclick=exitPreview;
  $('exportBtn').onclick=exportCourse;
  $('importInput').onchange=importCourse;
  $('courseSelect').onchange=async e=>{ const all=await dbGetAll(); const c=all.find(x=>x.id===e.target.value); if(c){state.course=normalizeCourse(c);state.selectedModule=0;state.selectedStep=null;renderBuilder();} };
  $('moduleTitle').oninput=e=>{ const m=currentModule(); if(m){m.title=e.target.value; $('moduleHeading').textContent=m.title; renderModuleList();} };
  $('moduleDescription').oninput=e=>{ const m=currentModule(); if(m)m.description=e.target.value; };
  $('assessmentPassMark').oninput=e=>{ const m=currentModule(); if(m)m.assessment.passMark=Number(e.target.value||0); };
  $('assessmentRetry').onchange=e=>{ const m=currentModule(); if(m)m.assessment.retryRule=e.target.value; };
}

function currentModule(){ return state.course?.modules?.[state.selectedModule] || null; }
function renderBuilder(){
  const c=state.course; if(!c)return;
  $('courseTitle').value=c.title; $('courseDescription').value=c.description; $('courseVersion').value=c.version; $('coursePassMark').value=c.defaultPassMark;
  renderModuleList(); renderModuleEditor();
}
function renderModuleList(){
  const wrap=$('moduleList'); wrap.innerHTML='';
  state.course.modules.forEach((m,i)=>{
    const el=document.createElement('div'); el.className='list-item'+(i===state.selectedModule?' active':''); el.draggable=true; el.dataset.index=i;
    el.innerHTML=`<span class="drag">☰</span><div><div class="list-title">${esc(m.title)}</div><div class="list-subtitle">${m.steps.length} step${m.steps.length===1?'':'s'} · ${m.assessment.questions.length} question${m.assessment.questions.length===1?'':'s'}</div></div><div class="mini-actions"><button class="icon-btn" data-act="up">↑</button><button class="icon-btn" data-act="down">↓</button></div>`;
    el.onclick=e=>{ if(e.target.closest('button')) return; state.selectedModule=i;state.selectedStep=null;renderBuilder(); };
    el.querySelector('[data-act="up"]').onclick=()=>moveItem(state.course.modules,i,i-1,'module');
    el.querySelector('[data-act="down"]').onclick=()=>moveItem(state.course.modules,i,i+1,'module');
    addDragHandlers(el, state.course.modules, ()=>{ state.selectedModule=Math.min(state.selectedModule,state.course.modules.length-1);renderBuilder(); });
    wrap.appendChild(el);
  });
}
function renderModuleEditor(){
  const m=currentModule(); $('emptyEditor').hidden=!!m; $('moduleEditor').hidden=!m; if(!m)return;
  $('moduleHeading').textContent=m.title; $('moduleTitle').value=m.title; $('moduleDescription').value=m.description;
  $('assessmentPassMark').value=m.assessment.passMark; $('assessmentRetry').value=m.assessment.retryRule;
  renderStepList(); renderStepEditor(); renderQuestions();
}
function addModule(){ const c=state.course; c.modules.push({id:uid('module'),title:`Module ${c.modules.length+1}`,description:'',steps:[],assessment:{passMark:c.defaultPassMark,retryRule:'unlimited',questions:[]}}); state.selectedModule=c.modules.length-1;state.selectedStep=null;renderBuilder(); }
function deleteModule(){ const m=currentModule(); if(!m)return; if(!confirm(`Delete module "${m.title}"?`))return; state.course.modules.splice(state.selectedModule,1); state.selectedModule=Math.max(0,state.selectedModule-1); state.selectedStep=null; renderBuilder(); }
function moveItem(arr,from,to,kind){ if(to<0||to>=arr.length)return; const [x]=arr.splice(from,1); arr.splice(to,0,x); if(kind==='module') state.selectedModule=to; if(kind==='step') state.selectedStep=to; renderBuilder(); }
function addDragHandlers(el,arr,onDone){ el.addEventListener('dragstart',e=>{e.dataTransfer.setData('text/plain',el.dataset.index); el.classList.add('dragging');}); el.addEventListener('dragend',()=>el.classList.remove('dragging')); el.addEventListener('dragover',e=>e.preventDefault()); el.addEventListener('drop',e=>{e.preventDefault(); const from=Number(e.dataTransfer.getData('text/plain')),to=Number(el.dataset.index); if(from===to||Number.isNaN(from))return; const [x]=arr.splice(from,1);arr.splice(to,0,x);onDone();}); }

function newStep(type='content'){ const s={id:uid('step'),type,title:'New Step'}; if(type==='content'||type==='image-text')Object.assign(s,{text:'',images:[]}); if(type==='media')Object.assign(s,{text:'',mediaType:'video',src:''}); if(type==='knowledge-check')Object.assign(s,{question:'',choices:['Option 1','Option 2'],correctIndex:0,feedback:''}); return s; }
function addStep(){ const m=currentModule(); if(!m)return; m.steps.push(newStep()); state.selectedStep=m.steps.length-1; renderStepList(); renderStepEditor(); }
function renderStepList(){
  const m=currentModule(),wrap=$('stepList');wrap.innerHTML='';
  m.steps.forEach((s,i)=>{ const el=document.createElement('div');el.className='list-item'+(i===state.selectedStep?' active':'');el.draggable=true;el.dataset.index=i;el.innerHTML=`<span class="drag">☰</span><div><div class="list-title">${esc(s.title||'Untitled step')}</div><div class="list-subtitle">${esc(stepTypeLabel(s.type))}</div></div><div class="mini-actions"><button class="icon-btn" data-act="up">↑</button><button class="icon-btn" data-act="down">↓</button><button class="icon-btn" data-act="del">×</button></div>`;
    el.onclick=e=>{if(e.target.closest('button'))return;state.selectedStep=i;renderStepList();renderStepEditor();};
    el.querySelector('[data-act="up"]').onclick=()=>moveItem(m.steps,i,i-1,'step'); el.querySelector('[data-act="down"]').onclick=()=>moveItem(m.steps,i,i+1,'step'); el.querySelector('[data-act="del"]').onclick=()=>{m.steps.splice(i,1);state.selectedStep=null;renderStepList();renderStepEditor();}; addDragHandlers(el,m.steps,()=>{state.selectedStep=null;renderStepList();renderStepEditor();}); wrap.appendChild(el); });
}
function stepTypeLabel(t){ return ({content:'Content','image-text':'Image + text',media:'Audio / video','knowledge-check':'Knowledge check'})[t]||t; }
function renderStepEditor(){
  const m=currentModule(), s=m.steps[state.selectedStep]; const wrap=$('stepEditor'); if(!s){wrap.hidden=true;wrap.innerHTML='';return;} wrap.hidden=false;
  wrap.innerHTML=`<div class="editor-toolbar"><div><div class="eyebrow">Step editor</div><h3>${esc(s.title||'Step')}</h3></div></div>
    <div class="type-row"><label>Step type<select id="stepType"><option value="content">Content</option><option value="image-text">Image + text</option><option value="media">Audio / video</option><option value="knowledge-check">Knowledge check</option></select></label><label>Title<input id="stepTitle" value="${esc(s.title||'')}"></label></div><div id="stepFields"></div>`;
  $('stepType').value=s.type; $('stepType').onchange=e=>{ const fresh=newStep(e.target.value); fresh.id=s.id; fresh.title=s.title; m.steps[state.selectedStep]=fresh; renderStepList();renderStepEditor();};
  $('stepTitle').oninput=e=>{s.title=e.target.value;renderStepList();}; renderStepFields(s);
}
function renderStepFields(s){
  const f=$('stepFields');
  if(s.type==='content'||s.type==='image-text'){
    f.innerHTML=`<label>Text<textarea id="stepText" rows="7">${esc(s.text||'')}</textarea></label>${s.type==='image-text'?`<label>Images<input id="stepImages" type="file" accept="image/*" multiple></label><div id="imageGrid" class="image-preview-grid"></div>`:''}`;
    $('stepText').oninput=e=>s.text=e.target.value; if(s.type==='image-text'){ $('stepImages').onchange=e=>readFilesAsDataURLs(e.target.files).then(xs=>{s.images.push(...xs);renderStepFields(s);}); renderImageGrid(s); }
  } else if(s.type==='media'){
    f.innerHTML=`<label>Intro / transcript text<textarea id="stepText" rows="4">${esc(s.text||'')}</textarea></label><div class="row-2"><label>Media type<select id="mediaType"><option value="video">Video</option><option value="audio">Audio</option></select></label><label>Media source<input id="mediaSrc" value="${esc(s.src||'')}" placeholder="URL or upload a local file below"></label></div><label>Upload media<input id="mediaFile" type="file" accept="video/*,audio/*"></label><p class="muted">For V1, uploaded media is embedded into the course JSON. Large videos will create very large files.</p>`;
    $('stepText').oninput=e=>s.text=e.target.value; $('mediaType').value=s.mediaType||'video'; $('mediaType').onchange=e=>s.mediaType=e.target.value; $('mediaSrc').oninput=e=>s.src=e.target.value; $('mediaFile').onchange=e=>readFilesAsDataURLs(e.target.files).then(xs=>{if(xs[0]){s.src=xs[0];renderStepEditor();}});
  } else if(s.type==='knowledge-check'){
    f.innerHTML=`<label>Question<textarea id="kcQuestion" rows="3">${esc(s.question||'')}</textarea></label><div id="kcChoices"></div><button id="addKcChoice" class="small secondary">+ Add choice</button><label>Feedback<textarea id="kcFeedback" rows="3">${esc(s.feedback||'')}</textarea></label>`;
    $('kcQuestion').oninput=e=>s.question=e.target.value; $('kcFeedback').oninput=e=>s.feedback=e.target.value; $('addKcChoice').onclick=()=>{s.choices.push(`Option ${s.choices.length+1}`);renderStepEditor();}; renderKcChoices(s);
  }
}
function renderImageGrid(s){ const g=$('imageGrid');g.innerHTML='';(s.images||[]).forEach((src,i)=>{const c=document.createElement('div');c.className='image-card';c.innerHTML=`<img src="${src}"><button title="Remove">×</button>`;c.querySelector('button').onclick=()=>{s.images.splice(i,1);renderStepFields(s)};g.appendChild(c);}); }
function renderKcChoices(s){ const w=$('kcChoices');w.innerHTML='<div class="muted">Select the correct answer.</div>';s.choices.forEach((ch,i)=>{const r=document.createElement('div');r.className='choice-row';r.innerHTML=`<input type="radio" name="kcCorrect" ${i===s.correctIndex?'checked':''}><input type="text" value="${esc(ch)}"><button class="icon-btn">×</button>`;r.children[0].onchange=()=>s.correctIndex=i;r.children[1].oninput=e=>s.choices[i]=e.target.value;r.children[2].onclick=()=>{s.choices.splice(i,1);s.correctIndex=Math.min(s.correctIndex,s.choices.length-1);renderStepEditor();};w.appendChild(r);}); }
function readFilesAsDataURLs(files){ return Promise.all([...files].map(file=>new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result);r.onerror=rej;r.readAsDataURL(file);}))); }

function newQuestion(type='mcq'){ if(type==='truefalse')return{id:uid('q'),type,text:'',choices:['True','False'],correct:[0],feedback:''}; return{id:uid('q'),type,text:'',choices:['Option 1','Option 2'],correct:[0],feedback:''}; }
function addQuestion(){ const m=currentModule();m.assessment.questions.push(newQuestion());renderQuestions(); }
function renderQuestions(){
  const m=currentModule(),wrap=$('questionList');wrap.innerHTML='';
  m.assessment.questions.forEach((q,qi)=>{ const d=document.createElement('details');d.className='question-card'; d.innerHTML=`<summary>Q${qi+1}: ${esc(q.text||'Untitled question')} <span class="muted">(${questionTypeLabel(q.type)})</span></summary><div class="question-grid"><label>Question type<select class="q-type"><option value="mcq">Multiple choice</option><option value="multi">Multiple response</option><option value="truefalse">True / False</option></select></label><label>Question<textarea class="q-text" rows="2">${esc(q.text||'')}</textarea></label><div class="q-choices"></div><button class="small secondary q-add-choice">+ Add choice</button><label>Feedback<textarea class="q-feedback" rows="2">${esc(q.feedback||'')}</textarea></label><div class="question-actions"><div><button class="icon-btn q-up">↑</button> <button class="icon-btn q-down">↓</button></div><button class="danger secondary q-delete">Delete question</button></div></div>`;
    const type=d.querySelector('.q-type');type.value=q.type;type.onchange=e=>{ const nq=newQuestion(e.target.value);nq.id=q.id;nq.text=q.text;nq.feedback=q.feedback;m.assessment.questions[qi]=nq;renderQuestions();}; d.querySelector('.q-text').oninput=e=>{q.text=e.target.value;d.querySelector('summary').childNodes[0].textContent=`Q${qi+1}: ${q.text||'Untitled question'} `;}; d.querySelector('.q-feedback').oninput=e=>q.feedback=e.target.value; d.querySelector('.q-add-choice').onclick=()=>{if(q.type==='truefalse')return;q.choices.push(`Option ${q.choices.length+1}`);renderQuestions();}; d.querySelector('.q-delete').onclick=()=>{m.assessment.questions.splice(qi,1);renderQuestions();}; d.querySelector('.q-up').onclick=()=>{if(qi>0){[m.assessment.questions[qi-1],m.assessment.questions[qi]]=[m.assessment.questions[qi],m.assessment.questions[qi-1]];renderQuestions();}}; d.querySelector('.q-down').onclick=()=>{if(qi<m.assessment.questions.length-1){[m.assessment.questions[qi+1],m.assessment.questions[qi]]=[m.assessment.questions[qi],m.assessment.questions[qi+1]];renderQuestions();}}; renderQuestionChoices(d.querySelector('.q-choices'),q); wrap.appendChild(d); });
}
function questionTypeLabel(t){return({mcq:'Multiple choice',multi:'Multiple response',truefalse:'True / False'})[t]||t;}
function renderQuestionChoices(w,q){w.innerHTML='<div class="muted">Mark the correct answer(s).</div>';q.choices.forEach((ch,i)=>{const r=document.createElement('div');r.className='choice-row';const type=q.type==='multi'?'checkbox':'radio';r.innerHTML=`<input type="${type}" name="correct-${q.id}" ${q.correct.includes(i)?'checked':''}><input type="text" value="${esc(ch)}"><button class="icon-btn" ${q.type==='truefalse'?'disabled':''}>×</button>`;r.children[0].onchange=e=>{if(q.type==='multi'){q.correct=e.target.checked?[...new Set([...q.correct,i])]:q.correct.filter(x=>x!==i);}else q.correct=[i];};r.children[1].oninput=e=>q.choices[i]=e.target.value;r.children[2].onclick=()=>{q.choices.splice(i,1);q.correct=q.correct.filter(x=>x!==i).map(x=>x>i?x-1:x);renderQuestions();};w.appendChild(r);});}

async function saveCourse(){ normalizeCourse(state.course); await dbPut(state.course); localStorage.setItem('trainingBuilderLastCourse',state.course.id); await refreshCourseSelect(); toast('Course saved locally'); }
async function newCourse(){ const c=normalizeCourse({id:uid('course'),title:'New Course',description:'',version:'1.0',defaultPassMark:80,modules:[]});state.course=c;state.selectedModule=0;state.selectedStep=null;await dbPut(c);await refreshCourseSelect();renderBuilder(); }
function exportCourse(){ const payload={schemaVersion:1,course:state.course}; const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}); const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`${(state.course.title||'course').replace(/[^a-z0-9]+/gi,'-').replace(/^-|-$/g,'')}-v${state.course.version||'1'}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),500); }
async function importCourse(e){ const file=e.target.files[0]; if(!file)return; try{ const data=JSON.parse(await file.text()); const c=normalizeCourse(data.course||data); if(!c.title)throw new Error('Not a course file'); if((await dbGetAll()).some(x=>x.id===c.id))c.id=uid('course'); state.course=c;state.selectedModule=0;state.selectedStep=null;await saveCourse();renderBuilder();toast('Course imported'); }catch(err){alert(`Import failed: ${err.message}`);} finally{e.target.value='';} }

// Player
function startPreview(){ state.player={moduleIndex:0,stepIndex:0,unlocked:0,completed:{},knowledge:{}}; $('builderView').classList.remove('active');$('playerView').classList.add('active');$('playerCourseTitle').textContent=state.course.title;renderPlayerNav();renderPlayer(); }
function exitPreview(){ $('playerView').classList.remove('active');$('builderView').classList.add('active'); }
function renderPlayerNav(){ const w=$('playerModuleNav');w.innerHTML='';state.course.modules.forEach((m,i)=>{const b=document.createElement('button');b.className='player-module'+(i===state.player.moduleIndex?' active':'')+(i>state.player.unlocked?' locked':'');const done=state.player.completed[i];b.innerHTML=`${i+1}. ${esc(m.title)}<span class="status">${done?`Passed ${done.score}%`:i>state.player.unlocked?'Locked':i===state.player.moduleIndex?'In progress':'Available'}</span>`;b.disabled=i>state.player.unlocked;b.onclick=()=>{state.player.moduleIndex=i;state.player.stepIndex=0;renderPlayerNav();renderPlayer();};w.appendChild(b);}); }
function renderPlayer(){ const m=state.course.modules[state.player.moduleIndex],w=$('playerContent'); if(!m){w.innerHTML='<div class="player-card"><h2>No modules yet</h2><p>This course has no modules.</p></div>';return;} if(state.player.stepIndex<m.steps.length) renderPlayerStep(m,state.player.stepIndex,w); else renderAssessment(m,w); }
function progressPct(m){ const total=Math.max(1,m.steps.length+1); return Math.min(100,Math.round((state.player.stepIndex/total)*100)); }
function renderPlayerStep(m,i,w){ const s=m.steps[i]; let body=''; if(s.type==='content')body=`<div class="step-text">${nl2br(s.text||'')}</div>`; if(s.type==='image-text')body=`<div class="step-text">${nl2br(s.text||'')}</div><div class="gallery">${(s.images||[]).map(x=>`<img class="step-image" src="${x}">`).join('')}</div>`; if(s.type==='media')body=`<div class="step-text">${nl2br(s.text||'')}</div>${s.src?(s.mediaType==='audio'?`<audio class="media-el" controls src="${s.src}"></audio>`:`<video class="media-el" controls src="${s.src}"></video>`):'<p class="muted">No media has been added.</p>'}`; if(s.type==='knowledge-check')body=knowledgeHtml(s);
  w.innerHTML=`<div class="player-card"><div class="eyebrow">Module ${state.player.moduleIndex+1} · Step ${i+1} of ${m.steps.length}</div><h2>${esc(s.title||'')}</h2><div class="progress-track"><div class="progress-bar" style="width:${progressPct(m)}%"></div></div>${body}<div class="player-actions"><button id="pBack" class="secondary" ${i===0?'disabled':''}>← Previous</button><button id="pNext">${i===m.steps.length-1?'Go to assessment →':'Continue →'}</button></div></div>`;
  $('pBack').onclick=()=>{state.player.stepIndex--;renderPlayer();}; $('pNext').onclick=()=>{ if(s.type==='knowledge-check'&&!state.player.knowledge[s.id]?.answered){toast('Answer the knowledge check before continuing');return;} state.player.stepIndex++;renderPlayer();}; if(s.type==='knowledge-check')bindKnowledge(s);
}
function knowledgeHtml(s){ return `<div class="step-text">${nl2br(s.question||'')}</div><div id="kcPlayerChoices">${(s.choices||[]).map((c,i)=>`<label class="knowledge-choice"><input type="radio" name="player-kc" value="${i}"> ${esc(c)}</label>`).join('')}</div><button id="kcSubmit" class="secondary">Check answer</button><div id="kcPlayerFeedback"></div>`; }
function bindKnowledge(s){ const prior=state.player.knowledge[s.id]; if(prior?.answered){ const r=document.querySelector(`input[name="player-kc"][value="${prior.choice}"]`);if(r)r.checked=true;showKcFeedback(s,prior.choice); } $('kcSubmit').onclick=()=>{const r=document.querySelector('input[name="player-kc"]:checked');if(!r){toast('Choose an answer');return;}const choice=Number(r.value);state.player.knowledge[s.id]={answered:true,choice};showKcFeedback(s,choice);}; }
function showKcFeedback(s,choice){ const ok=choice===Number(s.correctIndex); $('kcPlayerFeedback').innerHTML=`<div class="feedback ${ok?'correct':'incorrect'}"><strong>${ok?'Correct':'Not quite'}</strong>${s.feedback?`<br>${nl2br(s.feedback)}`:''}</div>`; }
function renderAssessment(m,w){ const qs=m.assessment.questions||[]; if(!qs.length){ w.innerHTML=`<div class="player-card"><div class="eyebrow">Module assessment</div><h2>${esc(m.title)}</h2><p>No assessment questions have been added to this module.</p><button id="completeNoTest">Complete module</button></div>`;$('completeNoTest').onclick=()=>completeModule(100);return; }
  w.innerHTML=`<div class="player-card"><div class="eyebrow">Module assessment</div><h2>${esc(m.title)}</h2><p>Pass mark: <strong>${m.assessment.passMark}%</strong></p><form id="assessmentForm">${qs.map((q,qi)=>assessmentQuestionHtml(q,qi)).join('')}<div class="player-actions"><button type="button" id="reviewModule" class="secondary">← Review module</button><button type="submit">Submit assessment</button></div></form><div id="assessmentResult"></div></div>`;
  $('reviewModule').onclick=()=>{state.player.stepIndex=0;renderPlayer();}; $('assessmentForm').onsubmit=e=>{e.preventDefault();gradeAssessment(m);}; }
function assessmentQuestionHtml(q,qi){ const type=q.type==='multi'?'checkbox':'radio';return `<div class="question-card"><h3>${qi+1}. ${esc(q.text||'')}</h3>${q.choices.map((c,i)=>`<label class="knowledge-choice"><input type="${type}" name="aq-${qi}" value="${i}"> ${esc(c)}</label>`).join('')}</div>`; }
function gradeAssessment(m){ const qs=m.assessment.questions;let correct=0,allAnswered=true;qs.forEach((q,qi)=>{const picked=[...document.querySelectorAll(`[name="aq-${qi}"]:checked`)].map(x=>Number(x.value));if(!picked.length)allAnswered=false;const a=[...picked].sort((a,b)=>a-b),b=[...(q.correct||[])].sort((a,b)=>a-b);if(a.length===b.length&&a.every((x,j)=>x===b[j]))correct++;}); if(!allAnswered){toast('Answer every question before submitting');return;} const score=Math.round((correct/qs.length)*1000)/10,passed=score>=m.assessment.passMark;const r=$('assessmentResult');r.innerHTML=`<div class="score-box ${passed?'score-pass':'score-fail'}"><h3>${passed?'Passed':'Not passed'}</h3><p>Score: <strong>${score}%</strong> · Pass mark: ${m.assessment.passMark}%</p>${passed?'<button id="nextModuleBtn">Continue</button>':`<button id="retryBtn">${m.assessment.retryRule==='review'?'Review module':'Retry assessment'}</button>`}</div>`; if(passed)$('nextModuleBtn').onclick=()=>completeModule(score);else $('retryBtn').onclick=()=>{ if(m.assessment.retryRule==='review')state.player.stepIndex=0;renderPlayer();}; }
function completeModule(score){ const i=state.player.moduleIndex;state.player.completed[i]={score,completedAt:new Date().toISOString()}; if(i<state.course.modules.length-1){state.player.unlocked=Math.max(state.player.unlocked,i+1);state.player.moduleIndex=i+1;state.player.stepIndex=0;renderPlayerNav();renderPlayer();}else{renderPlayerNav();$('playerContent').innerHTML=`<div class="player-card"><div class="eyebrow">Course complete</div><h2>${esc(state.course.title)}</h2><p>You have completed all modules in this preview.</p><div class="score-box score-pass"><strong>${Object.keys(state.player.completed).length} of ${state.course.modules.length} modules completed</strong></div><button id="restartPreview">Restart preview</button></div>`;$('restartPreview').onclick=startPreview;} }

async function init(){ state.db=await openDb(); let courses=await dbGetAll(); if(!courses.length){ await dbPut(clone(SAMPLE.course));courses=await dbGetAll(); } const last=localStorage.getItem('trainingBuilderLastCourse'); state.course=normalizeCourse(courses.find(c=>c.id===last)||courses[0]); bindTopLevel(); await refreshCourseSelect(); renderBuilder(); }
init().catch(err=>{console.error(err);alert('Training Builder could not start: '+err.message);});
