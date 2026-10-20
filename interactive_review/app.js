(() => {
  'use strict';
  const DATA = window.REVIEW_DATA;
  const LABS = window.REVIEW_LABS;
  const QUESTIONS = window.REVIEW_QUIZ;
  const KEY = 'aws-saa-amazon-review-v1';
  const VIEWS = {journey:'购物旅程',labs:'故障实验',tree:'知识树',library:'服务速查',quiz:'综合测验',sources:'官方资料'};
  const main = document.getElementById('main');
  const dialog = document.getElementById('service-dialog');
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const icon = (kind, size = 16) => {
    const paths = {route:'<path d="M5 6h9a4 4 0 0 1 0 8H9m-4 4 4-4-4-4"/><circle cx="5" cy="6" r="2"/>',bolt:'<path d="m13 2-8 12h6l-1 8 9-12h-6l1-8Z"/>',tree:'<path d="M12 4v7M5 20v-5h14v5M12 11v9"/><rect x="9" y="2" width="6" height="5" rx="1"/>',grid:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',quiz:'<path d="M9 5H5v16h14V5h-4M9 3h6v4H9zM8 12h8M8 16h6"/>',headphone:'<path d="M4 14v-3a8 8 0 0 1 16 0v3"/><rect x="3" y="11" width="4" height="10" rx="2"/><rect x="17" y="11" width="4" height="10" rx="2"/>'};
    return '<svg width="'+size+'" height="'+size+'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(paths[kind]||paths.grid)+'</svg>';
  };
  if (!DATA?.chapters?.length || !Array.isArray(LABS) || !Array.isArray(QUESTIONS)) {
    main.innerHTML = '<div class="section-card"><h1>学习内容尚未载入</h1><p>请确认 content.js、labs.js、quiz.js 与 index.html 放在同一个文件夹，再刷新页面。</p></div>';
    return;
  }
  const safeUrl = url => /^https:\/\//.test(String(url)) ? esc(url) : '#';
  const defaults = () => ({view:'journey',chapter:0,steps:{},completed:[],lab:0,labStates:{},quiz:{started:false,submitted:false,index:0,answers:{},flags:[]}});
  function normalize(raw) {
    const s = defaults();
    if (!raw || typeof raw !== 'object') return s;
    if (Object.hasOwn(VIEWS, raw.view)) s.view=raw.view;
    if (Number.isInteger(raw.chapter) && raw.chapter>=0 && raw.chapter<DATA.chapters.length) s.chapter=raw.chapter;
    s.completed=Array.isArray(raw.completed)?[...new Set(raw.completed.filter(id=>DATA.chapters.some(c=>c.id===id)))]:[];
    for (const c of DATA.chapters) {
      const value=raw.steps?.[c.id];
      if(Number.isInteger(value)&&value>=0&&value<c.steps.length) s.steps[c.id]=value;
    }
    if(Number.isInteger(raw.lab)&&raw.lab>=0&&raw.lab<LABS.length) s.lab=raw.lab;
    for(const lab of LABS) {
      const value=raw.labStates?.[lab.id];
      if(Number.isInteger(value)&&value>=0&&value<lab.states.length)s.labStates[lab.id]=value;
    }
    const q=raw.quiz;
    if(q&&typeof q==='object') {
      s.quiz.started=q.started===true;
      if(Number.isInteger(q.index)&&q.index>=0&&q.index<QUESTIONS.length)s.quiz.index=q.index;
      for(const question of QUESTIONS) {
        const value=q.answers?.[question.id];
        if(Number.isInteger(value)&&value>=0&&value<question.options.length)s.quiz.answers[question.id]=value;
      }
      s.quiz.flags=Array.isArray(q.flags)?[...new Set(q.flags.filter(id=>QUESTIONS.some(item=>item.id===id)))]:[];
      s.quiz.submitted=q.submitted===true&&Object.keys(s.quiz.answers).length===QUESTIONS.length;
      if(s.quiz.submitted)s.quiz.started=true;
    }
    return s;
  }
  let storageOK=true;
  let state=defaults();
  try { const saved=localStorage.getItem(KEY); if(saved)state=normalize(JSON.parse(saved).state); }catch(_){storageOK=false;}
  const initialHash=location.hash.slice(1);
  if(Object.hasOwn(VIEWS,initialHash))state.view=initialHash;
  let playing=false, playTimer=null, graphObserver=null, toastTimer=null;
  let search='',category='all', quizAlert='';
  function persist() {
    try {localStorage.setItem(KEY,JSON.stringify({app:KEY,version:1,state}));storageOK=true;}catch(_){storageOK=false;}
    updateChrome();
  }
  function toast(message) {
    const target=document.getElementById('toast');
    target.textContent=message;target.hidden=false;
    clearTimeout(toastTimer);toastTimer=setTimeout(()=>{target.hidden=true;},4000);
  }
  function stopPlay(){playing=false;clearInterval(playTimer);playTimer=null;}
  function updateChrome(){
    document.getElementById('breadcrumb-label').textContent=VIEWS[state.view];
    document.getElementById('progress-count').textContent=state.completed.length+' / '+DATA.chapters.length;
    const track=document.getElementById('chapter-progress');
    track.setAttribute('aria-valuemax',String(DATA.chapters.length));
    track.setAttribute('aria-valuenow',String(state.completed.length));
    track.querySelector('span').style.width=(state.completed.length/DATA.chapters.length*100)+'%';
    document.getElementById('storage-label').textContent=storageOK?'本地学习 · 自动保存':'暂不能保存 · 请导出进度';
    const kinds=['route','bolt','tree','grid','quiz'];
    document.getElementById('navigation').innerHTML=['journey','labs','tree','library','quiz'].map((id,index)=>'<button class="nav-item '+(state.view===id?'active':'')+'" data-view="'+id+'" '+(state.view===id?'aria-current="page"':'')+'><span class="nav-number">0'+(index+1)+'</span>'+icon(kinds[index])+'<span>'+VIEWS[id]+'</span><span class="nav-icon">↗</span></button>').join('');
  }
  function go(view){
    if(!Object.hasOwn(VIEWS,view))return;
    stopPlay();state.view=view;quizAlert='';
    history.replaceState(null,'','#'+view);persist();render();main.focus({preventScroll:true});window.scrollTo({top:0,behavior:'instant'});
  }
  function render(preserve=false){
    const y=window.scrollY;
    const focused=document.activeElement;
    let focusSelector='';
    if(preserve&&main.contains(focused)){
      const attr=['data-action','data-chapter','data-lab','data-lab-state','data-question','data-service'].find(key=>focused.hasAttribute(key));
      if(attr)focusSelector='['+attr+'="'+CSS.escape(focused.getAttribute(attr))+'"]';
    }
    if(graphObserver){graphObserver.disconnect();graphObserver=null;}
    updateChrome();
    main.innerHTML=({journey:journeyView,labs:labsView,tree:treeView,library:libraryView,quiz:quizView,sources:sourcesView}[state.view])();
    if(state.view==='library')updateLibrary();
    if(state.view==='journey'||state.view==='labs')requestAnimationFrame(mountGraph);
    if(focusSelector){const nextFocus=main.querySelector(focusSelector);if(nextFocus&&!nextFocus.disabled)nextFocus.focus({preventScroll:true});else main.focus({preventScroll:true});}
    if(preserve)window.scrollTo({top:y,behavior:'instant'});
  }
  function hero(){return '<section class="hero"><div><div class="eyebrow">AMAZON / ARCHITECTURE LAB</div><h1>一笔订单，<br>看懂云上<span>每一站。</span></h1><p>你买下一副耳机，背后发生了什么？<br>沿着图片、购物车和付款发货，把 AWS 服务真正串起来。</p><div class="hero-meta"><span><strong>'+DATA.chapters.length+'</strong>段购物旅程</span><span><strong>'+LABS.length+'</strong>个故障实验</span><span><strong>'+QUESTIONS.length+'</strong>道变式题</span></div></div><div class="order-ticket" aria-label="教学订单示意"><div class="ticket-heading"><span>YOUR ORDER</span><span>教学演示</span></div><div class="ticket-product"><div class="headphones">'+icon('headphone',39)+'</div><div><strong>无线降噪耳机</strong><span>Joey 的购物旅程 · × 1</span></div></div><div class="ticket-route"><span>东京区域 / 双 AZ</span><span>准备出发 →</span></div><div class="ticket-bottom" aria-hidden="true">'+Array.from({length:27},()=>'<i></i>').join('')+'</div><div class="ticket-note"># ONE ORDER, MANY SERVICES</div></div></section>';}
  function currentChapter(){return DATA.chapters[state.chapter];}
  function currentStep(){const c=currentChapter();return c.steps[state.steps[c.id]||0];}
  function journeyView(){
    const c=currentChapter(),index=state.steps[c.id]||0,step=c.steps[index],complete=state.completed.includes(c.id);
    return hero()+'<nav class="chapter-strip" aria-label="选择购物旅程章节">'+DATA.chapters.map((item,i)=>'<button class="chapter-button '+(i===state.chapter?'active ':'')+(state.completed.includes(item.id)?'complete':'')+'" data-chapter="'+i+'" aria-pressed="'+(i===state.chapter)+'" title="'+esc(item.title)+'"><span class="chapter-index">'+(state.completed.includes(item.id)?'✓':String(i+1).padStart(2,'0'))+'</span><span class="chapter-label">'+esc(item.title)+'</span></button>').join('')+'</nav><section aria-labelledby="lesson-heading"><div class="section-header"><div><div class="eyebrow">'+esc(c.kicker||'CHAPTER '+String(state.chapter+1).padStart(2,'0'))+'</div><h2 id="lesson-heading">'+esc(c.title)+'</h2><p>'+esc(c.summary)+'</p></div><button class="complete-button" data-action="complete" aria-pressed="'+complete+'">'+(complete?'✓ 已学明白':'○ 标记已学')+'</button></div><div class="workspace"><div class="diagram-panel"><div class="panel-toolbar"><strong>跟着请求走一遍</strong><span class="panel-caption">点击节点，认识这个服务 ↗</span></div><div class="graph-stage" id="diagram-canvas"></div><div class="graph-legend"><span><i class="legend-line"></i>当前步骤</span><span><i class="legend-line muted"></i>其余调用路径</span></div><div class="graph-help">箭头表示服务调用或事件通知；图中位置是教学示意。</div></div><article class="step-panel" aria-live="polite"><div class="step-counter"><span>STEP '+String(index+1).padStart(2,'0')+' / '+String(c.steps.length).padStart(2,'0')+'</span><button class="play-button" data-action="play">'+(playing?'Ⅱ 暂停':'▷ 自动走一遍')+'</button></div><div class="step-dots" aria-hidden="true">'+c.steps.map((_,i)=>'<span class="step-dot '+(i<=index?'active':'')+'"></span>').join('')+'</div><h3>'+esc(step.title)+'</h3><p class="step-body">'+esc(step.body)+'</p><div class="step-story"><div class="story-label">放回真实场景</div>'+esc(c.story)+'</div><div class="step-controls"><button data-action="previous" '+(index===0?'disabled':'')+'>← 上一步</button><button class="next" data-action="next" '+(index===c.steps.length-1?'disabled':'')+'>下一步 →</button></div></article></div><div class="takeaway-grid"><div class="note-box"><h3 class="note-title">'+icon('route',14)+'这次要记住</h3><ul>'+c.takeaways.map(t=>'<li>'+esc(t)+'</li>').join('')+'</ul></div><div class="note-box pitfall"><h3 class="note-title">'+icon('bolt',14)+'容易混淆的地方</h3><ul>'+c.pitfalls.map(t=>'<li>'+esc(t)+'</li>').join('')+'</ul></div></div><div class="related-row"><span>这一站的服务</span>'+c.services.map(id=>{const service=DATA.services.find(s=>s.id===id);return service?'<button class="service-chip" data-service="'+esc(id)+'">'+esc(service.name)+' ↗</button>':'';}).join('')+'</div>'+(index===c.steps.length-1?'<div class="button-row" style="margin-top:20px"><button class="btn primary" data-action="complete">'+(complete?'✓ 本章已完成':'我能讲清楚了，标记已学')+'</button>'+(state.chapter<DATA.chapters.length-1?'<button class="next-chapter" data-action="next-chapter">继续下一段旅程 →</button>':'<button class="next-chapter" data-view="labs">去故障实验看看 →</button>')+'</div>':'')+'</section>';
  }
  function labsView(){
    const lab=LABS[state.lab],selected=state.labStates[lab.id]||0,result=lab.states[selected];
    return '<div class="page-heading"><div class="eyebrow">WHAT IF / FAILURE LAB</div><h1>把条件换一换，系统会怎样？</h1><p>亲手切换故障状态，分清“服务还在”和“路径能用”之间的差别。</p></div><div class="lab-tabs" aria-label="选择故障实验">'+LABS.map((item,i)=>'<button class="lab-tab '+(i===state.lab?'active':'')+'" data-lab="'+i+'" aria-pressed="'+(i===state.lab)+'">0'+(i+1)+' / '+esc(item.title)+'</button>').join('')+'</div><div class="section-header"><div><h2>'+esc(lab.question)+'</h2><p>'+esc(lab.baseline)+'</p></div></div><div class="workspace"><div class="diagram-panel"><div class="panel-toolbar"><strong>观察路径与状态</strong><span class="panel-caption">修改右侧条件，图会随之变化</span></div><div class="graph-stage" id="diagram-canvas"></div><div class="graph-legend"><span><i class="legend-line"></i>当前相关路径</span><span><i class="legend-line muted"></i>其他路径</span></div><div class="graph-help">故障会标在节点上；创建、通知等控制动作使用虚线。</div></div><article class="lab-result"><div class="state-label">切换条件 / WHAT CHANGES</div><div class="state-options">'+lab.states.map((item,i)=>'<button class="state-option" data-lab-state="'+i+'" aria-pressed="'+(i===selected)+'">'+esc(item.label)+'</button>').join('')+'</div><div class="result-block" role="status" aria-live="polite"><span class="status-label '+esc(result.status)+'">'+({ok:'● 路径或机制可以工作',warning:'● 需要注意的取舍',danger:'● 存在故障或业务风险'}[result.status]||'● 当前状态')+'</span><h3>'+esc(result.resultTitle)+'</h3><p>'+esc(result.resultBody)+'</p></div></article></div><p class="lesson-rule">'+esc(lab.lesson)+'</p>';
  }
  function treeView(){return '<div class="page-heading"><div class="eyebrow">CONNECT THE DOTS / KNOWLEDGE TREE</div><h1>零散的名字，放回同一棵树。</h1><p>先问业务遇到了什么问题，再找对应的 AWS 服务。点击分支可以收起或展开。</p></div><div class="tree-toolbar"><span class="library-count">从入口，到计算、数据与持续运营</span><button class="btn" data-action="toggle-tree">收起全部</button></div><div class="tree-grid">'+DATA.knowledgeTree.map((branch,i)=>'<details class="tree-branch" open><summary><span class="branch-number">0'+(i+1)+'</span>'+esc(branch.title)+'</summary><ul class="tree-items">'+branch.items.map(item=>'<li><strong>'+esc(item.name)+'</strong><span>'+esc(item.text)+'</span></li>').join('')+'</ul></details>').join('')+'</div>';}
  function libraryView(){const cats=[...new Set(DATA.services.map(s=>s.category))];return '<div class="page-heading"><div class="eyebrow">SERVICE FIELD GUIDE</div><h1>这个名字，到底负责什么？</h1><p>用一句类比、一个购物例子和一条边界，把容易混淆的术语分清楚。</p></div><div class="library-tools"><label class="search-box"><span class="sr-label" hidden>搜索服务、中文名称或例子</span><input type="search" id="service-search" aria-label="搜索服务、中文名称或例子" placeholder="搜索，如 IAM、购物车、数据库…" value="'+esc(search)+'"></label><select id="service-category" aria-label="按知识类别筛选"><option value="all">所有知识类别</option>'+cats.map(c=>'<option '+(category===c?'selected':'')+' value="'+esc(c)+'">'+esc(c)+'</option>').join('')+'</select></div><p class="library-count" id="service-count"></p><div class="service-grid" id="service-grid">'+libraryCards()+'</div>';}
  function filteredServices(){const term=search.trim().toLocaleLowerCase();return DATA.services.filter(s=>(category==='all'||s.category===category)&&(!term||[s.name,s.cn,s.analogy,s.example,s.boundary].join(' ').toLocaleLowerCase().includes(term)));}
  function libraryCards(){const rows=filteredServices();return rows.length?rows.map(s=>'<button class="service-card" data-service="'+esc(s.id)+'"><span class="service-category">'+esc(s.category)+'</span><h2>'+esc(s.name)+'</h2><span class="service-cn">'+esc(s.cn)+'</span><p>'+esc(s.analogy)+'</p><span class="card-link">放进 Amazon 案例里看 ↗</span></button>').join(''):'<p class="empty-state">没有找到这个关键词。试试服务英文名，或者换一个更短的词。</p>';}
  function updateLibrary(){const grid=document.getElementById('service-grid');if(grid){grid.innerHTML=libraryCards();document.getElementById('service-count').textContent='找到 '+filteredServices().length+' / '+DATA.services.length+' 个知识条目';}}
  function quizView(){
    if(state.quiz.submitted)return resultsView();
    if(!state.quiz.started)return '<div class="page-heading"><div class="eyebrow">CHECK YOUR UNDERSTANDING</div><h1>会认名字，也要会选方案。</h1><p>换一组卖家、仓库和大促情景，检验你能不能把知识迁移过去。</p></div><section class="section-card quiz-intro"><div><span class="eyebrow">'+QUESTIONS.length+' 道原创变式题 / 单选</span><h2>先独立判断，<br>全部交卷后再看解释。</h2><p>这一次没有推荐选项，也不会提前揭晓答案。拿不准的题可以标记，交卷前回来重新想一遍。</p><div class="button-row"><button class="btn primary" data-action="start-quiz">开始这次测验 →</button></div></div><ul class="quiz-rules"><li><b>混合知识点</b>比较相似产品，关注题目真正的要求。</li><li><b>保留你的判断</b>答案和不确定标记自动保存，可以中途休息。</li><li><b>把错题接回知识</b>交卷后解释每个选项，并链接到相关旅程。</li></ul></section><p class="quiz-note">这些是原创理解题，不是考试真题；本次得分不等于 AWS 官方考试水平。</p>';
    const index=state.quiz.index,q=QUESTIONS[index],chosen=state.quiz.answers[q.id],answered=Object.keys(state.quiz.answers).length;
    return '<div class="page-heading"><div class="eyebrow">SCENARIO QUIZ / NO HINTS</div><h1>按需求选方案，不按名字猜。</h1><p>已作答 '+answered+' / '+QUESTIONS.length+' 题 · 全部提交后显示答案与解析</p></div><div class="quiz-shell"><article class="section-card question-card"><div class="question-top"><span>QUESTION '+String(index+1).padStart(2,'0')+' / '+QUESTIONS.length+'</span><span>单选 · 独立作答</span></div><h2 id="question-title">'+esc(q.question)+'</h2><fieldset style="border:0;padding:0;margin:0" aria-labelledby="question-title"><div class="answer-options">'+q.options.map((option,i)=>'<label class="answer-option '+(chosen===i?'selected':'')+'"><input type="radio" name="quiz-answer" value="'+i+'" '+(chosen===i?'checked':'')+'><span class="answer-letter">'+String.fromCharCode(65+i)+'</span><span>'+esc(option)+'</span></label>').join('')+'</div></fieldset><div class="question-actions"><button class="flag-button" data-action="flag" aria-pressed="'+state.quiz.flags.includes(q.id)+'">'+(state.quiz.flags.includes(q.id)?'⚑ 已标记不确定':'⚐ 标记不确定')+'</button><div class="button-row"><button class="btn" data-action="quiz-previous" '+(index===0?'disabled':'')+'>← 上一题</button><button class="btn primary" data-action="quiz-next" '+(index===QUESTIONS.length-1?'disabled':'')+'>下一题 →</button></div></div>'+ (quizAlert?'<p class="inline-alert" role="alert">'+esc(quizAlert)+'</p>':'')+'</article><aside class="section-card question-map" aria-label="题目导航"><h3>答题进度</h3><div class="question-grid">'+QUESTIONS.map((item,i)=>'<button class="question-number '+(Number.isInteger(state.quiz.answers[item.id])?'answered ':'')+(i===index?'current ':'')+(state.quiz.flags.includes(item.id)?'flagged':'')+'" data-question="'+i+'" aria-label="第 '+(i+1)+' 题，'+(Number.isInteger(state.quiz.answers[item.id])?'已作答':'未作答')+(state.quiz.flags.includes(item.id)?'，标记不确定':'')+'" '+(i===index?'aria-current="step"':'')+'>'+(i+1)+'</button>').join('')+'</div><p class="quiz-map-note">绿色：已作答<br>小点：标记不确定</p><button class="btn primary quiz-submit" data-action="submit-quiz">全部交卷</button></aside></div><p class="quiz-note">进度保存在当前浏览器。跳题、选择或修改答案都不会提前显示对错。</p>';
  }
  function resultsView(){
    const correct=QUESTIONS.filter(q=>state.quiz.answers[q.id]===q.answer).length;
    return '<div class="page-heading"><div class="eyebrow">REVIEW / UNDERSTAND THE WHY</div><h1>分数是起点，把原因带走。</h1><p>展开题目，看看选项之间真正的区别。做对但不确定的题，也值得复盘。</p></div><div class="result-hero"><div class="score-circle"><strong>'+correct+'</strong><span>/ '+QUESTIONS.length+'</span></div><div><h2>'+ (correct===QUESTIONS.length?'这组变式题全部答对了。':'找到薄弱点，复习就有方向了。')+'</h2><p>本次正确率 '+Math.round(correct/QUESTIONS.length*100)+'% · 标记不确定 '+state.quiz.flags.length+' 题</p><div class="button-row"><button class="btn orange" data-action="restart-quiz">重新独立作答</button><button class="btn" data-view="journey">回购物旅程复习</button></div></div></div><div class="review-list">'+QUESTIONS.map((q,index)=>{const selected=state.quiz.answers[q.id],right=selected===q.answer;return '<details class="review-question" '+(!right?'open':'')+'><summary><span class="review-status '+(right?'':'wrong')+'">'+(right?'✓':'×')+'</span><span>'+(index+1)+'. '+esc(q.question)+(state.quiz.flags.includes(q.id)?'　⚑':'')+'</span></summary><div class="review-explanation"><p>你的选择：'+String.fromCharCode(65+selected)+'. '+esc(q.options[selected])+'</p><p class="correct-answer">正确选择：'+String.fromCharCode(65+q.answer)+'. '+esc(q.options[q.answer])+'</p><p>'+esc(q.explanation)+'</p><ul class="why-not">'+q.whyNot.map((reason,i)=>'<li>'+String.fromCharCode(65+i)+'. '+esc(reason)+'</li>').join('')+'</ul><button class="service-chip" data-review-chapter="'+esc(q.chapter)+'">回到相关旅程 →</button></div></details>';}).join('')+'</div><p class="quiz-note">当前题库是原创复习题。建议结合未见过的正规模拟题判断备考状态。</p>';
  }
  function sourcesView(){return '<div class="page-heading"><div class="eyebrow">READ THE SOURCE</div><h1>理解之后，回官方资料核对。</h1><p>重点看功能边界和适用条件；无需把整篇文档背下来。</p></div><p class="source-description">Amazon 公开资料确认它使用多种 AWS 服务。本网站围绕购物设计的具体网络、数据流、人数和故障情景属于教学假设，不代表 Amazon 完整内部实现。所有交互都是本地示意，不会连接或创建 AWS 资源。</p><div class="source-list">'+DATA.sources.map(s=>'<a class="source-link" href="'+safeUrl(s.url)+'" target="_blank" rel="noopener noreferrer"><span>'+esc(s.title)+'</span><span aria-hidden="true">↗</span></a>').join('')+'</div><p class="quiz-note">服务速查中的每个条目也附有对应的官方文档入口。服务能力可能更新，实际操作时以文档为准。</p>';}
  function mountGraph(){
    const canvas=document.getElementById('diagram-canvas');if(!canvas)return;
    const spec=state.view==='journey'?(currentStep().diagram||currentChapter().diagram):LABS[state.lab].diagram;
    const snapshot=state.view==='journey'?currentStep():LABS[state.lab].states[state.labStates[LABS[state.lab].id]||0];
    const draw=()=>drawGraph(canvas,spec,snapshot);
    graphObserver=new ResizeObserver(draw);graphObserver.observe(canvas);draw();
  }
  function drawGraph(canvas,spec,snapshot){
    const width=Math.max(260,canvas.clientWidth),narrow=width<500;
    const nodeWidth=narrow?Math.min(255,width-76):(width-48)/3-17;
    const height=104,spacing=narrow?140:157;
    const positions=new Map();
    spec.nodes.forEach((n,index)=>positions.set(n.id,{x:narrow?(width-nodeWidth)/2:24+n.col*((width-48)/3),y:28+(narrow?index:n.row)*spacing,n}));
    const stageHeight=Math.max(...Array.from(positions.values()).map(p=>p.y))+height+28;
    canvas.style.height=stageHeight+'px';canvas.replaceChildren();
    const ns='http://www.w3.org/2000/svg';
    const make=(tag,attrs={},text)=>{const el=document.createElementNS(ns,tag);Object.entries(attrs).forEach(([k,v])=>el.setAttribute(k,String(v)));if(text!==undefined)el.textContent=text;return el;};
    const svg=make('svg',{class:'connections',viewBox:'0 0 '+width+' '+stageHeight,role:'img','aria-label':'当前场景的服务调用路径'});
    const defs=make('defs');
    for(const kind of ['normal','active','failed']){const marker=make('marker',{id:'edge-arrow-'+kind,viewBox:'0 0 10 10',refX:9,refY:5,markerWidth:6,markerHeight:6,orient:'auto-start-reverse'});marker.append(make('path',{d:'M 0 0 L 10 5 L 0 10 z',fill:{normal:'#c9d5d0',active:'#d17d39',failed:'#bf8175'}[kind]}));defs.append(marker);}
    svg.append(defs);
    const active=new Set(snapshot.activeNodes||[]),failed=new Set(snapshot.failedNodes||[]);
    const edgeSelection=Array.isArray(snapshot.highlightEdges)?new Set(snapshot.highlightEdges):null;
    const isMoving=playing&&!matchMedia('(prefers-reduced-motion: reduce)').matches;
    spec.edges.forEach((edge,index)=>{
      const a=positions.get(edge.from),b=positions.get(edge.to);if(!a||!b)return;
      let path;
      if(narrow){
        if(b.y-a.y===spacing){path='M '+(a.x+nodeWidth/2)+' '+(a.y+height)+' L '+(b.x+nodeWidth/2)+' '+b.y;}
        else{const lane=10+(index%4)*6;path='M '+a.x+' '+(a.y+height/2)+' H '+lane+' V '+(b.y+height/2)+' H '+b.x;}
      }else if(a.y===b.y){
        if(Math.abs(a.n.col-b.n.col)>1){const upper=a.y-17;path='M '+(a.x+nodeWidth/2)+' '+a.y+' V '+upper+' H '+(b.x+nodeWidth/2)+' V '+b.y;}
        else{const right=b.x>a.x;path='M '+(right?a.x+nodeWidth:a.x)+' '+(a.y+height/2)+' L '+(right?b.x:b.x+nodeWidth)+' '+(b.y+height/2);}
      }
      else if(a.x===b.x){
        if(Math.abs(a.n.row-b.n.row)>1){const left=a.n.col===0,lane=left?a.x-13:a.x+nodeWidth+13,port=left?a.x:a.x+nodeWidth;path='M '+port+' '+(a.y+height/2)+' H '+lane+' V '+(b.y+height/2)+' H '+port;}
        else{const down=b.y>a.y;path='M '+(a.x+nodeWidth/2)+' '+(down?a.y+height:a.y)+' L '+(b.x+nodeWidth/2)+' '+(down?b.y:b.y+height);}
      }
      else if(Math.abs(a.n.row-b.n.row)>1){const down=b.y>a.y,sy=down?a.y+height:a.y,gapY=sy+(down?18:-18),lane=b.x-8;path='M '+(a.x+nodeWidth/2)+' '+sy+' V '+gapY+' H '+lane+' V '+(b.y+height/2)+' H '+b.x;}
      else {const down=b.y>a.y;const y1=down?a.y+height:a.y,y2=down?b.y:b.y+height,mid=(y1+y2)/2;path='M '+(a.x+nodeWidth/2)+' '+y1+' C '+(a.x+nodeWidth/2)+' '+mid+', '+(b.x+nodeWidth/2)+' '+mid+', '+(b.x+nodeWidth/2)+' '+y2;}
      const on=edgeSelection?edgeSelection.has(edge.from+'>'+edge.to):active.has(edge.from)&&active.has(edge.to);
      const bad=failed.has(edge.from)||failed.has(edge.to);
      const kind=bad?'failed':on?'active':'normal';
      const line=make('path',{d:path,class:'graph-edge '+(on?'active ':'')+(bad?'failed ':'')+(['control','async','alternative'].includes(edge.kind)?'control':''),'marker-end':'url(#edge-arrow-'+kind+')','data-from':edge.from,'data-to':edge.to});
      line.append(make('title',{},a.n.title+' → '+b.n.title+(edge.label?'：'+edge.label:'')));svg.append(line);
      if(on&&isMoving){const dot=make('circle',{r:3.5,fill:'#d17d39'});const motion=make('animateMotion',{dur:'2s',repeatCount:'indefinite',path});dot.append(motion);svg.append(dot);}
    });
    canvas.append(svg);
    const types={entry:'入口',compute:'计算',data:'数据',network:'网络',support:'协作'};
    spec.nodes.forEach(n=>{
      const p=positions.get(n.id),button=document.createElement('button');button.type='button';button.className='service-node '+(active.has(n.id)?'is-active ':'')+(failed.has(n.id)?'is-failed':'');
      Object.assign(button.style,{left:p.x+'px',top:p.y+'px',width:nodeWidth+'px',height:height+'px'});
      button.dataset.node=n.id;button.setAttribute('aria-label',n.title+'（'+n.subtitle+'），'+(failed.has(n.id)?'当前故障，':'')+'查看解释');
      button.innerHTML='<span class="node-kind">'+(failed.has(n.id)?'故障':types[n.type]||'服务')+'</span><span class="node-title">'+esc(n.title)+'</span><span class="node-subtitle">'+esc(n.subtitle)+'</span><span class="node-zone" title="'+esc(n.zone)+'">'+esc(n.zone)+'</span>';
      canvas.append(button);
    });
    const routeDetails=document.createElement('div');routeDetails.className='graph-path-detail';
    const currentEdges=spec.edges.filter(e=>edgeSelection?edgeSelection.has(e.from+'>'+e.to):active.has(e.from)&&active.has(e.to));
    const labels=currentEdges.map(e=>{const a=positions.get(e.from)?.n,b=positions.get(e.to)?.n;return a&&b?a.title+' → '+b.title+(e.label?'：'+e.label:''):'';}).filter(Boolean);
    routeDetails.textContent=labels.length?labels.join(' · '):'当前没有可用或需要高亮的调用路径，请对照右侧说明。';
    const oldDetail=canvas.parentElement.querySelector('.graph-path-detail');if(oldDetail)oldDetail.remove();
    canvas.after(routeDetails);
  }
  function showService(id,fallback){
    const s=DATA.services.find(item=>item.id===id)||fallback;if(!s)return;
    const content=document.getElementById('dialog-content');
    content.innerHTML='<div class="dialog-category">'+esc(s.category||'当前场景中的角色')+'</div><h2 class="dialog-heading" id="dialog-heading">'+esc(s.name||s.title)+'</h2><p class="dialog-cn">'+esc(s.cn||s.subtitle)+'</p><div class="dialog-section"><h3>用熟悉的东西理解</h3><p>'+esc(s.analogy||s.subtitle)+'</p></div><div class="dialog-section"><h3>放进购物场景里</h3><p>'+esc(s.example||s.zone||'这是应用中的业务参与者。')+'</p></div><div class="dialog-boundary"><h3>记住这条边界</h3><p>'+esc(s.boundary||'图展示当前业务关系；不代表每个节点都是独立的 AWS 产品。')+'</p></div>'+(s.source?'<a class="btn" href="'+safeUrl(s.source)+'" target="_blank" rel="noopener noreferrer">查看 AWS 官方说明 ↗</a>':'');
    dialog.showModal();
  }
  function showNode(id){
    const spec=state.view==='journey'?(currentStep().diagram||currentChapter().diagram):LABS[state.lab].diagram,n=spec.nodes.find(item=>item.id===id);if(!n)return;
    let service=DATA.services.find(s=>s.id===n.service||s.id===n.id);
    const title=n.title.toLowerCase();
    if(!service)service=DATA.services.find(s=>s.name.toLowerCase()===title||s.id.toLowerCase()===title);
    if(!service)service=DATA.services.find(s=>s.name.length>2&&title.includes(s.name.toLowerCase()));
    showService(service?.id,n);
  }
  function moveStep(delta,automatic=false){
    if(!automatic)stopPlay();
    const c=currentChapter(),index=state.steps[c.id]||0;
    state.steps[c.id]=Math.max(0,Math.min(c.steps.length-1,index+delta));
    if(state.steps[c.id]===c.steps.length-1)stopPlay();
    persist();render(true);
  }
  function changeChapter(index){
    if(!Number.isInteger(index)||index<0||index>=DATA.chapters.length)return;
    stopPlay();state.chapter=index;state.view='journey';persist();render(true);
  }
  function submitQuiz(){
    const missing=QUESTIONS.filter(q=>!Number.isInteger(state.quiz.answers[q.id]));
    if(missing.length){quizAlert='还有 '+missing.length+' 道题未作答。先完成这些题，再交卷。';state.quiz.index=QUESTIONS.findIndex(q=>q.id===missing[0].id);persist();render(true);return;}
    state.quiz.submitted=true;quizAlert='';persist();render();window.scrollTo({top:0,behavior:'instant'});
  }
  function exportProgress(){
    const blob=new Blob([JSON.stringify({app:KEY,version:1,exportedAt:new Date().toISOString(),state},null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='aws-amazon-review-progress.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('进度已导出。换设备时可用“导入进度”继续。');
  }
  document.addEventListener('click',event=>{
    const button=event.target.closest('button');if(!button)return;
    if(button.dataset.view){go(button.dataset.view);return;}
    if(button.dataset.chapter!==undefined){changeChapter(Number(button.dataset.chapter));return;}
    if(button.dataset.lab!==undefined){state.lab=Number(button.dataset.lab);persist();render(true);return;}
    if(button.dataset.labState!==undefined){state.labStates[LABS[state.lab].id]=Number(button.dataset.labState);persist();render(true);return;}
    if(button.dataset.service){showService(button.dataset.service);return;}
    if(button.dataset.node){showNode(button.dataset.node);return;}
    if(button.dataset.question!==undefined){state.quiz.index=Number(button.dataset.question);quizAlert='';persist();render(true);return;}
    if(button.dataset.reviewChapter){const index=DATA.chapters.findIndex(c=>c.id===button.dataset.reviewChapter);changeChapter(index);history.replaceState(null,'','#journey');window.scrollTo({top:0,behavior:'instant'});return;}
    switch(button.dataset.action){
      case 'next':moveStep(1);break;
      case 'previous':moveStep(-1);break;
      case 'next-chapter':changeChapter(state.chapter+1);break;
      case 'complete':{const id=currentChapter().id;if(state.completed.includes(id))state.completed=state.completed.filter(item=>item!==id);else state.completed.push(id);persist();render(true);toast(state.completed.includes(id)?'已记下这次学习。下一次可以直接从这里接着走。':'已取消完成标记。');break;}
      case 'play':{if(playing){stopPlay();render(true);}else{const c=currentChapter();if((state.steps[c.id]||0)===c.steps.length-1)state.steps[c.id]=0;playing=true;playTimer=setInterval(()=>moveStep(1,true),6500);render(true);}break;}
      case 'close-dialog':dialog.close();break;
      case 'toggle-tree':{const branches=[...main.querySelectorAll('.tree-branch')],expand=branches.some(b=>!b.open);branches.forEach(b=>b.open=expand);button.textContent=expand?'收起全部':'展开全部';break;}
      case 'start-quiz':state.quiz.started=true;persist();render();break;
      case 'quiz-next':state.quiz.index=Math.min(QUESTIONS.length-1,state.quiz.index+1);quizAlert='';persist();render(true);break;
      case 'quiz-previous':state.quiz.index=Math.max(0,state.quiz.index-1);quizAlert='';persist();render(true);break;
      case 'flag':{const id=QUESTIONS[state.quiz.index].id;state.quiz.flags=state.quiz.flags.includes(id)?state.quiz.flags.filter(item=>item!==id):state.quiz.flags.concat(id);persist();render(true);break;}
      case 'submit-quiz':submitQuiz();break;
      case 'restart-quiz':if(confirm('重新作答会清除这次测验的选择与成绩，章节学习进度会保留。继续吗？')){state.quiz=defaults().quiz;state.quiz.started=true;persist();render();}break;
      case 'export':exportProgress();break;
      case 'import':document.getElementById('import-progress').click();break;
    }
  });
  document.addEventListener('input',event=>{if(event.target.id==='service-search'){search=event.target.value;updateLibrary();}});
  document.addEventListener('change',async event=>{
    const target=event.target;
    if(target.name==='quiz-answer'){
      state.quiz.answers[QUESTIONS[state.quiz.index].id]=Number(target.value);quizAlert='';persist();render(true);
      main.querySelector('input[name="quiz-answer"][value="'+target.value+'"]').focus({preventScroll:true});
    }
    if(target.id==='service-category'){category=target.value;updateLibrary();}
    if(target.id==='import-progress'){
      const file=target.files?.[0];target.value='';if(!file)return;
      try{
        if(file.size>512000)throw new Error('这个文件过大，请选择本网站导出的进度文件。');
        const data=JSON.parse(await file.text());
        if(data.app!==KEY||data.version!==1||!data.state||typeof data.state!=='object'||Array.isArray(data.state))throw new Error('这不是本网站支持的进度文件。');
        stopPlay();state=normalize(data.state);persist();history.replaceState(null,'','#'+state.view);render();toast('进度已导入，可以继续学习。');
      }catch(error){toast(error instanceof SyntaxError?'文件不是有效的 JSON，请选择导出的进度文件。':error.message);}
    }
  });
  dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}});
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&playing){stopPlay();render(true);}});
  window.addEventListener('hashchange',()=>{const view=location.hash.slice(1);if(Object.hasOwn(VIEWS,view)&&view!==state.view)go(view);});
  render();
})();
