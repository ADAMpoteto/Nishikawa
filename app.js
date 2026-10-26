/* =====================================================================
   データソース（Googleスプレッドシートの公開CSV）
   ・トリマ     : No / 日付 / 曜日 / ポイント
   ・ランニング : No / 日付 / 曜日 / 距離 / 時間
   ・経県値     : 下の「経県値マップ」の項を参照
   ===================================================================== */
const URL_TORIMA = "https://docs.google.com/spreadsheets/d/e/2PACX-1vS5OcNhfxyK5x1xC4LOilrV-JQNIWHgmywi7kBWrOnOKubY_PApnTDUlVuNZA7h9qcKNjMP06Z4LlF0/pub?gid=619333186&single=true&output=csv";
const URL_RUN    = "https://docs.google.com/spreadsheets/d/e/2PACX-1vS5OcNhfxyK5x1xC4LOilrV-JQNIWHgmywi7kBWrOnOKubY_PApnTDUlVuNZA7h9qcKNjMP06Z4LlF0/pub?gid=2019901314&single=true&output=csv";

/* トリマの月間目標（ここを書き換えれば目標が変わります） */
const TM_TARGETS = [10000, 50000, 100000, 300000];

/* ランニングの月間距離目標（km） */
const RUN_MONTH_GOAL = 100;

/* ---------- ユーティリティ ---------- */
const WD=["日","月","火","水","木","金","土"];
function pd(s){ if(!s) return null; const m=String(s).match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/); return m?new Date(+m[1], +m[2]-1, +m[3]):null; }
function fmtMD(dt){ return `${dt.getMonth()+1}/${dt.getDate()}(${WD[dt.getDay()]})`; }
function prefersReduced(){ return !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches); }
function escHtml(s){ return String(s==null?"":s).replace(/[&<>"]/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c])); }
function F(o,k){ return (o && o[k]!=null) ? String(o[k]).trim() : ""; }
function cleanRows(rows){
  return (rows||[]).map(o=>{ const n={}; Object.keys(o).forEach(k=>{ n[k.replace(/^\uFEFF/,"").replace(/\s+/g,"").trim()]=o[k]; }); return n; });
}
function fetchCSV(url){
  return new Promise((resolve,reject)=>{
    if(typeof Papa==="undefined"){ reject(new Error("PapaParse 未読み込み")); return; }
    Papa.parse(url, { download:true, header:true, skipEmptyLines:"greedy", complete:resolve, error:reject });
  });
}
function fetchCSVRaw(url){
  return new Promise((resolve,reject)=>{
    if(typeof Papa==="undefined"){ reject(new Error("PapaParse 未読み込み")); return; }
    Papa.parse(url, { download:true, header:false, skipEmptyLines:false, complete:resolve, error:reject });
  });
}
/* "1,234" "1234P" → 1234 / 空欄 → null（0 は 0 のまま） */
function num(s){ const t=String(s==null?"":s).replace(/[０-９．]/g,c=>String.fromCharCode(c.charCodeAt(0)-0xFEE0)).replace(/[,，\sPpｐ円km]/gi,""); if(t==="") return null; const n=Number(t); return isFinite(n)?n:null; }
const nf=n=>Math.round(n).toLocaleString("ja-JP");
/* トリマは10ポイント単位なので、計算で出た値は10の位に切り上げる */
const ceil10=n=>Math.ceil(n/10)*10;
function today0(){ const t=new Date(); t.setHours(0,0,0,0); return t; }
function sameDay(a,b){ return a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate(); }
function ymKey(dt){ return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,"0")}`; }
function daysInMonth(y,m){ return new Date(y, m+1, 0).getDate(); }
function errBox(msg){ return `<div class="loading">${escHtml(msg)}</div>`; }

/* 縦棒グラフ（HTML/CSSで描くので画面幅に追従）。items: [{label, value, sub, cls, tip}] */
function barChartHtml(id, items, opt){
  opt=opt||{};
  const vals=items.map(i=>i.value||0);
  const lines=(opt.lines||[]).filter(l=>l.value>0);
  const max=Math.max(1, ...vals, ...lines.map(l=>l.value))*1.08;
  const cols=items.map((it,i)=>{
    const h=it.value==null?0:Math.max(it.value>0?1.5:0, it.value/max*100);
    return `<button type="button" class="bc-col ${it.cls||""}" data-i="${i}" aria-label="${escHtml(it.tip||"")}">
      <span class="bc-bar" style="height:${h}%"></span>
      <span class="bc-lbl">${it.label||""}</span>
    </button>`;
  }).join("");
  const lineHtml=lines.map(l=>`<div class="bc-line ${l.cls||""}" style="bottom:${l.value/max*100}%"><span>${escHtml(l.label)}</span></div>`).join("");
  return `<div class="bc" id="${id}">
    <div class="bc-readout" aria-live="polite"></div>
    <div class="bc-plot">${lineHtml}<div class="bc-cols">${cols}</div></div>
  </div>`;
}
function bindBarChart(id, items, defIdx){
  const root=document.getElementById(id); if(!root) return;
  const out=root.querySelector(".bc-readout");
  const pick=i=>{
    root.querySelectorAll(".bc-col").forEach(c=>c.classList.toggle("on", +c.dataset.i===i));
    out.innerHTML=items[i] ? items[i].tip : "";
  };
  root.querySelectorAll(".bc-col").forEach(c=>{
    c.addEventListener("click", ()=>pick(+c.dataset.i));
    c.addEventListener("mouseenter", ()=>pick(+c.dataset.i));
  });
  if(defIdx!=null && defIdx>=0) pick(defIdx);
}

/* ---------- ルーティング（戻る/進む・直リンク対応） ---------- */
const PAGES=["torima","run","bike","keiken","gourmet","eikan"];
function applyPage(page){
  if(!PAGES.includes(page)) page=PAGES[0];
  document.querySelectorAll(".page").forEach(p=>p.classList.remove("active"));
  document.getElementById(page).classList.add("active");
  document.querySelectorAll(".nav-btn").forEach(b=>b.classList.toggle("active", b.dataset.nav===page));
  /* タブ名：西川記録 | ページ名（ナビのボタンの文字を使う） */
  const nb=document.querySelector(`.nav-btn[data-nav="${page}"]`);
  document.title = nb ? `西川記録 | ${nb.textContent.trim()}` : "西川記録";
  if(page==="keiken"||page==="gourmet") kkSetMode(page);
  window.scrollTo(0,0);
}
function goto(page, push){
  if(push===undefined) push=true;
  applyPage(page);
  if(push){ const h="#"+page; if(location.hash!==h) history.pushState({page}, "", h); }
}
function parseHash(){ const h=(location.hash||"").replace(/^#/,""); return {page:h||PAGES[0]}; }
window.addEventListener("popstate", e=>{ const st=e.state||parseHash(); applyPage(st.page); });
window.addEventListener("scroll", ()=>{ document.querySelector("nav").classList.toggle("scrolled", window.scrollY>4); }, {passive:true});

/* =====================================================================
   トリマ
   ===================================================================== */
const TM={ days:[], months:[], sel:null };

async function loadTorima(){
  let rows=[];
  try{ rows=cleanRows((await fetchCSV(URL_TORIMA)).data); }
  catch(e){ document.getElementById("tm-hero").innerHTML=errBox("トリマのデータを読み込めませんでした。"); return; }

  const byKey={};
  rows.forEach(o=>{
    const dt=pd(F(o,"日付")); if(!dt) return;
    byKey[dt.toDateString()]={ dt, p:num(F(o,"ポイント")) };
  });
  TM.days=Object.values(byKey).sort((a,b)=>a.dt-b.dt);

  /* 月ごとにまとめる（記録のある月＋今月） */
  const t=today0(), curKey=ymKey(t), mm={};
  TM.days.forEach(d=>{ if(d.p!=null){ const k=ymKey(d.dt); mm[k]=true; } });
  mm[curKey]=true;
  TM.months=Object.keys(mm).sort().map(k=>{
    const [y,m]=k.split("-").map(Number);
    const n=daysInMonth(y,m-1), list=[];
    for(let i=1;i<=n;i++){
      const dt=new Date(y,m-1,i), hit=byKey[dt.toDateString()];
      list.push({ dt, p:hit?hit.p:null });
    }
    const ent=list.filter(d=>d.p!=null);
    const total=ent.reduce((s,d)=>s+d.p,0);
    return { key:k, y, m, label:`${y}年${m}月`, days:list, total, entered:ent.length,
             avg:ent.length?total/ent.length:0, best:ent.reduce((b,d)=>(!b||d.p>b.p)?d:b,null),
             isCur:k===curKey, isPast:k<curKey };
  });

  tmRenderMissing(byKey);
  const sel=document.getElementById("tm-month-sel");
  sel.innerHTML=TM.months.slice().reverse().map(m=>`<option value="${m.key}">${m.label}${m.isCur?"（今月）":""}</option>`).join("");
  sel.onchange=()=>tmShow(sel.value);
  tmShow(curKey);
  tmRenderOverall();
}

/* 未入力日のお知らせ（最初の記録日〜昨日のうち、ポイントが空欄の日） */
function tmRenderMissing(byKey){
  const el=document.getElementById("tm-alert");
  const ent=TM.days.filter(d=>d.p!=null);
  if(!ent.length){ el.hidden=true; return; }
  const t=today0(), miss=[];
  for(let d=new Date(ent[0].dt); d<t; d.setDate(d.getDate()+1)){
    const hit=byKey[d.toDateString()];
    if(!hit || hit.p==null) miss.push(new Date(d));
  }
  if(!miss.length){ el.hidden=true; return; }
  const show=miss.slice(-5).reverse().map(fmtMD).join("、");
  el.innerHTML=`<strong>未入力の日があります</strong>${escHtml(show)}${miss.length>5?` ほか${miss.length-5}日`:""}
    <small>入力すると「1日あと何P」の計算が正しくなります。</small>`;
  el.hidden=false;
}

/* 先月の同じ日との比較 */
function tmCompareHtml(mo){
  const pd0=new Date(mo.y, mo.m-2, 1), prev=TM.months.find(m=>m.key===ymKey(pd0));
  if(!prev || !prev.entered) return "";
  let diff, label;
  if(mo.isCur){
    let lastDay=0; mo.days.forEach((d,i)=>{ if(d.p!=null) lastDay=i+1; });
    if(!lastDay) return "";
    const upto=Math.min(lastDay, prev.days.length);
    const prevCum=prev.days.slice(0,upto).reduce((s,d)=>s+(d.p||0),0);
    diff=mo.total-prevCum;
    label=`先月の同じ日（${prev.m}/${upto}）時点より`;
  }else{
    diff=mo.total-prev.total; label="先月より";
  }
  const cls=diff>0?"up":diff<0?"down":"";
  return `<span class="hero-chip cmp ${cls}">${label} <strong>${diff>0?"+":diff<0?"−":"±"}${nf(Math.abs(diff))}</strong> P</span>`;
}

/* 今月の残り日数：今日の分がまだ未入力なら今日も数える */
function tmRemaining(mo){
  if(!mo.isCur) return 0;
  const t=today0(), last=daysInMonth(mo.y, mo.m-1);
  let r=last-t.getDate()+1;
  const td=mo.days[t.getDate()-1];
  if(td && td.p!=null) r-=1;
  return Math.max(0,r);
}

function tmShow(key){
  const mo=TM.months.find(m=>m.key===key)||TM.months[TM.months.length-1];
  TM.sel=mo;
  document.getElementById("tm-month-sel").value=mo.key;
  const rem=tmRemaining(mo);
  const forecast=mo.isCur ? mo.total + mo.avg*rem : mo.total;
  const t=today0();

  /* HERO */
  const progressTxt = mo.isCur
    ? `${t.getMonth()+1}月${t.getDate()}日時点・残り <strong>${rem}</strong> 日`
    : (mo.isPast ? "確定" : "");
  document.getElementById("tm-hero").innerHTML=`
    <div class="tm-hero-label">${escHtml(mo.label)}の獲得ポイント</div>
    <div class="tm-big">${nf(mo.total)}<small>P</small></div>
    <div class="hero-meta">
      ${progressTxt?`<span class="hero-chip accent">${progressTxt}</span>`:""}
      ${tmCompareHtml(mo)}
      <span class="hero-chip">1日平均 <strong>${nf(ceil10(mo.avg))}</strong> P</span>
      ${mo.isCur && mo.entered?`<span class="hero-chip">このペースの月末予測 <strong>${nf(ceil10(forecast))}</strong> P</span>`:""}
    </div>`;

  /* 目標カード */
  const nextIdx=TM_TARGETS.findIndex(T=>mo.total<T);
  document.getElementById("tm-targets").innerHTML=TM_TARGETS.map((T,i)=>{
    const pct=Math.min(100, mo.total/T*100);
    let cls="", main="", sub="";
    if(mo.total>=T){
      /* 達成した日を探す */
      let c=0, hitDay=null; for(const d of mo.days){ if(d.p!=null){ c+=d.p; if(c>=T){ hitDay=d.dt; break; } } }
      cls="done"; main="達成！"; sub=hitDay?`${fmtMD(hitDay)} に到達`:"";
    }else if(mo.isCur && rem>0){
      const left=T-mo.total, per=ceil10(left/rem);
      main=`1日 <strong>${nf(per)}</strong> P`;
      if(forecast>=T){ cls="ok"; sub=`あと ${nf(left)} P／今のペースなら届く`; }
      else{
        const up=ceil10(per-mo.avg);
        cls= per>mo.avg*3 ? "far" : "push";
        sub=`あと ${nf(left)} P／平均より +${nf(up)} P/日`;
      }
    }else{
      cls="miss"; main="未達"; sub=`${pct.toFixed(1)}%（あと ${nf(T-mo.total)} P だった）`;
    }
    return `<div class="tgt ${cls}${i===nextIdx&&mo.isCur?" next":""}">
      <div class="tgt-head"><span class="tgt-goal">${nf(T)} P</span>${i===nextIdx&&mo.isCur?'<span class="tgt-tag">次の目標</span>':""}</div>
      <div class="tgt-main">${main}</div>
      <div class="tgt-bar"><span style="width:${pct}%"></span></div>
      <div class="tgt-sub">${sub}</div>
    </div>`;
  }).join("");
  document.getElementById("tm-target-note").textContent = mo.isCur
    ? "「1日◯P」は（目標 − 今月の獲得P）÷ 残り日数。毎日入力するたびに自動で変わります。"
    : "過去の月は結果のみ表示しています。";

  /* 日別グラフ */
  const items=mo.days.map(d=>{
    const future=d.dt>t, wk=d.dt.getDay();
    const lbl=(d.dt.getDate()===1||d.dt.getDate()%5===0)?String(d.dt.getDate()):"";
    return { value:d.p, label:lbl,
      cls:[d.p==null?(future?"future":"blank"):"", wk===0?"sun":wk===6?"sat":"", sameDay(d.dt,t)?"today":""].join(" "),
      tip:`${fmtMD(d.dt)}　${d.p==null?(future?"これから":"未入力"):`<strong>${nf(d.p)}</strong> P`}` };
  });
  const lines=[{value:mo.avg, label:`平均 ${nf(ceil10(mo.avg))}`, cls:"avg"}];
  if(mo.isCur && rem>0 && nextIdx>=0){
    const per=ceil10((TM_TARGETS[nextIdx]-mo.total)/rem);
    const maxDay=Math.max(0,...mo.days.map(d=>d.p||0));
    if(per<=Math.max(maxDay,1)*1.6) lines.push({value:per, label:`${nf(TM_TARGETS[nextIdx])}P に必要 ${nf(per)}`, cls:"need"});
  }
  let lastIdx=-1; mo.days.forEach((d,i)=>{ if(d.p!=null) lastIdx=i; });
  document.getElementById("tm-daily").innerHTML=barChartHtml("tm-chart", items, {lines})
    + `<div class="stats-row tm-mini">
        <div class="stat-chip">入力日数 <strong>${mo.entered}</strong> 日</div>
        ${mo.best?`<div class="stat-chip">この月の最高 <strong>${nf(mo.best.p)}</strong> P（${fmtMD(mo.best.dt)}）</div>`:""}
      </div>
      <details class="tm-table"><summary>日別の一覧を開く</summary>
        <table><thead><tr><th>日付</th><th>ポイント</th><th>累計</th></tr></thead><tbody>${
          (()=>{ let c=0; return mo.days.filter(d=>d.p!=null).map(d=>{ c+=d.p; return `<tr><td>${fmtMD(d.dt)}</td><td>${nf(d.p)}</td><td>${nf(c)}</td></tr>`; }).join(""); })()
        }</tbody></table>
      </details>`;
  bindBarChart("tm-chart", items, lastIdx);
  document.querySelectorAll(".mlist-row[data-m]").forEach(r=>r.classList.toggle("on", r.dataset.m===mo.key));
}

function tmRenderOverall(){
  const ent=TM.days.filter(d=>d.p!=null);
  const total=ent.reduce((s,d)=>s+d.p,0);
  document.getElementById("tm-overall").innerHTML=`
    <div class="stats-row">
      <div class="stat-chip">累計 <strong>${nf(total)}</strong> P</div>
      <div class="stat-chip">記録 <strong>${ent.length}</strong> 日</div>
    </div>`;

  const mo=TM.months.filter(m=>m.entered>0);
  const maxT=Math.max(1,...mo.map(m=>m.total));
  const bestM=mo.reduce((b,m)=>(!b||m.total>b.total)?m:b,null);
  document.getElementById("tm-months").innerHTML=mo.slice().reverse().map(m=>`
    <button type="button" class="mlist-row" data-m="${m.key}">
      <span class="mlist-name"><span class="mlist-y">${m.y}年</span><span class="mlist-m">${m.m}月</span>${m===bestM&&mo.length>1?'<em>ベスト</em>':""}</span>
      <span class="mlist-bar"><span style="width:${m.total/maxT*100}%"></span></span>
      <span class="mlist-val">${nf(m.total)} P<small>平均 ${nf(ceil10(m.avg))}／${m.entered}日</small></span>
    </button>`).join("");
  document.querySelectorAll("#tm-months .mlist-row").forEach(r=>r.onclick=()=>{
    tmShow(r.dataset.m);
    const a=document.getElementById("torima"); window.scrollTo({top:a.offsetTop, behavior:prefersReduced()?"auto":"smooth"});
  });
  document.querySelectorAll(".mlist-row[data-m]").forEach(r=>r.classList.toggle("on", TM.sel && r.dataset.m===TM.sel.key));
}

/* =====================================================================
   ランニング
   ===================================================================== */
const RUN={ list:[], sort:"pace" };
const RUN_SORTS=[
  { key:"pace", label:"ペースが速い順", cmp:(a,b)=>a.pace-b.pace, val:r=>fmtPace(r.pace), unit:"/km" },
  { key:"dist", label:"距離が長い順",   cmp:(a,b)=>b.km-a.km,     val:r=>r.km.toFixed(2), unit:"km" },
  { key:"time", label:"時間が長い順",   cmp:(a,b)=>b.sec-a.sec,   val:r=>fmtDur(r.sec), unit:"" },
  { key:"date", label:"新しい順",       cmp:(a,b)=>b.dt-a.dt,     val:r=>fmtPace(r.pace), unit:"/km" }
];
function parseDur(s){ const p=String(s||"").trim().split(":").map(Number); if(p.some(isNaN)||!p.length||p[0]==="") return null;
  if(p.length===3) return p[0]*3600+p[1]*60+p[2]; if(p.length===2) return p[0]*60+p[1]; return null; }
function fmtDur(sec){ sec=Math.round(sec); const h=Math.floor(sec/3600), m=Math.floor(sec%3600/60), s=sec%60;
  return h?`${h}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`:`${m}:${String(s).padStart(2,"0")}`; }
function fmtPace(sec){ sec=Math.round(sec); return `${Math.floor(sec/60)}'${String(sec%60).padStart(2,"0")}"`; }

async function loadRun(){
  let rows=[];
  try{ rows=cleanRows((await fetchCSV(URL_RUN)).data); }
  catch(e){ document.getElementById("run-hero").innerHTML=errBox("ランニングのデータを読み込めませんでした。"); return; }
  RUN.list=rows.map(o=>{
    const dt=pd(F(o,"日付")), km=num(F(o,"距離")), sec=parseDur(F(o,"時間"));
    if(!dt||!km||!sec) return null;
    return { dt, km, sec, pace:sec/km };
  }).filter(Boolean).sort((a,b)=>a.dt-b.dt);
  RUN.list.forEach((r,i)=>r.no=i+1);
  if(!RUN.list.length){ document.getElementById("run-hero").innerHTML=errBox("まだ記録がありません。"); return; }
  runRenderHero();
  runRenderTabs();
  runRenderRanking();
  runRenderTrend();
  runRenderMonths();
  runRenderGoal();
}

/* 今月の距離目標 */
function runRenderGoal(){
  const t=today0(), key=ymKey(t), G=RUN_MONTH_GOAL;
  const runs=RUN.list.filter(r=>ymKey(r.dt)===key);
  const km=runs.reduce((s,r)=>s+r.km,0);
  const last=daysInMonth(t.getFullYear(), t.getMonth());
  let rem=last-t.getDate()+1; if(runs.some(r=>sameDay(r.dt,t))) rem--;
  rem=Math.max(0,rem);
  const left=Math.max(0,G-km), pct=Math.min(100,km/G*100);
  let main, sub, cls="";
  if(km>=G){ cls="done"; main="達成！"; sub=`今月 ${km.toFixed(2)} km`; }
  else if(rem>0){
    const per=left/rem;
    main=`あと <strong>${left.toFixed(2)}</strong> km`;
    sub=`残り ${rem} 日 → 1日 ${per.toFixed(2)} km／5kmランなら あと ${Math.ceil(left/5)} 回`;
    cls = per<=2 ? "ok" : per<=5 ? "push" : "far";
  }else{ cls="miss"; main="未達"; sub=`今月 ${km.toFixed(2)} km`; }
  document.getElementById("run-goal").innerHTML=`
    <div class="tgt goal-wide ${cls}">
      <div class="tgt-head"><span class="tgt-goal">${t.getMonth()+1}月の目標 ${G} km</span><span class="tgt-goal">${km.toFixed(2)} km・${runs.length}本</span></div>
      <div class="tgt-main">${main}</div>
      <div class="tgt-bar"><span style="width:${pct}%"></span></div>
      <div class="tgt-sub">${sub}</div>
    </div>`;
}

function runRenderHero(){
  const L=RUN.list, n=L.length;
  const km=L.reduce((s,r)=>s+r.km,0);
  const latest=L[n-1];
  const byPace=L.slice().sort((a,b)=>a.pace-b.pace);
  const rank=byPace.indexOf(latest)+1;
  /* 最新ランが自己ベストか、何位か */
  let headline;
  if(n===1) headline="記念すべき1本目！";
  else if(rank===1) headline=`最新ラン（${fmtMD(latest.dt)}）で自己ベスト更新！`;
  else headline=`最新ラン（${fmtMD(latest.dt)}）はペース <strong>${rank}位</strong> / ${n}本`;

  /* 前回との比較・自己ベストまで（秒/km） */
  let cmpHtml="";
  if(n>1){
    const prev=L[n-2], d=Math.round(latest.pace-prev.pace);
    const prevTxt = d<0 ? `前回（${fmtMD(prev.dt)}）より <strong>${-d}秒/km</strong> 速い`
                  : d>0 ? `前回（${fmtMD(prev.dt)}）より <strong>${d}秒/km</strong> 遅い`
                  : `前回（${fmtMD(prev.dt)}）と同じペース`;
    let bestTxt;
    if(rank===1){
      const oldBest=Math.min(...L.slice(0,n-1).map(r=>r.pace));
      bestTxt=`これまでのベストを <strong>${Math.round(oldBest-latest.pace)}秒/km</strong> 更新`;
    }else{
      const gap=Math.round(latest.pace-byPace[0].pace);
      bestTxt= gap<=0 ? `ベスト（${fmtPace(byPace[0].pace)}）と同タイム` : `ベスト（${fmtPace(byPace[0].pace)}）まで あと <strong>${gap}秒/km</strong>`;
    }
    cmpHtml=`<div class="run-cmp"><span class="${d<0?"up":d>0?"down":""}">${prevTxt}</span><span>${bestTxt}</span></div>`;
  }

  document.getElementById("run-hero").innerHTML=`
    <div class="tm-hero-label">これまでの累計距離</div>
    <div class="tm-big">${km.toFixed(2)}<small>km</small></div>
    <div class="run-headline${rank===1&&n>1?" pb":""}">${headline}</div>
    ${cmpHtml}
    <div class="hero-meta">
      <span class="hero-chip">${n} 本</span>
      <span class="hero-chip accent">ベスト <strong>${fmtPace(byPace[0].pace)}</strong>/km</span>
    </div>`;
}

function runRenderTabs(){
  document.getElementById("run-tabs").innerHTML=RUN_SORTS.map(s=>
    `<button type="button" class="day-tab${s.key===RUN.sort?" active":""}" data-s="${s.key}">${s.label}</button>`).join("");
  document.querySelectorAll("#run-tabs .day-tab").forEach(b=>b.onclick=()=>{
    RUN.sort=b.dataset.s;
    document.querySelectorAll("#run-tabs .day-tab").forEach(x=>x.classList.toggle("active", x===b));
    runRenderRanking();
  });
}

function runRenderRanking(){
  const s=RUN_SORTS.find(x=>x.key===RUN.sort);
  const L=RUN.list.slice().sort(s.cmp).slice(0,10);
  const latest=RUN.list[RUN.list.length-1];
  const medal=["🥇","🥈","🥉"];
  const showRank=s.key!=="date";
  /* 並び替えの基準になっている項目を強調する */
  const hl={pace:"pace", dist:"dist", time:"time", date:""}[s.key];
  const cell=(k,label,val)=>`<div class="rk-cell${k===hl?" hl":""}"><dt>${label}</dt><dd>${val}</dd></div>`;
  document.getElementById("run-rank").innerHTML=L.map((r,i)=>`
    <div class="rk${showRank&&i<3?" top top"+(i+1):""}">
      <div class="rk-pos">${showRank?(i<3?`<span class="rk-medal" aria-label="${i+1}位">${medal[i]}</span>`:`${i+1}`):`#${r.no}`}</div>
      <div class="rk-body">
        <div class="rk-date">${r.dt.getFullYear()}/${fmtMD(r.dt)}${r===latest?'<span class="rk-new">NEW</span>':""}</div>
        <dl class="rk-grid">
          ${cell("dist","距離",`${r.km.toFixed(2)}<small>km</small>`)}
          ${cell("time","タイム",fmtDur(r.sec))}
          ${cell("pace","1kmあたり",`${fmtPace(r.pace)}<small>/km</small>`)}
          ${cell("half","ハーフ換算",fmtDur(r.pace*21.0975))}
          ${cell("full","フル換算",fmtDur(r.pace*42.195))}
        </dl>
      </div>
    </div>`).join("");
}

function runRenderTrend(){
  const L=RUN.list.slice(-10);
  const sp=L.map(r=>3600/r.pace); // km/h
  const lo=Math.min(...sp)*0.85;
  const best=RUN.list.reduce((b,r)=>(!b||r.pace<b.pace)?r:b,null);
  const items=L.map((r,i)=>({ value:sp[i]-lo, label:(i===0||i===L.length-1||L.length<=12)?`${r.dt.getMonth()+1}/${r.dt.getDate()}`:"",
    cls:r===best?"best":"", tip:`#${r.no}　${fmtMD(r.dt)}　<strong>${fmtPace(r.pace)}</strong>/km（${r.km.toFixed(2)}km）${r===best?"　自己ベスト":""}` }));
  document.getElementById("run-trend").innerHTML=barChartHtml("run-chart", items)
    + `<p class="kk-note-s">棒が高いほど速い。タップでその日の記録。</p>`;
  bindBarChart("run-chart", items, L.length-1);
}

function runRenderMonths(){
  const mm={};
  RUN.list.forEach(r=>{ const k=ymKey(r.dt); (mm[k]=mm[k]||{key:k, y:r.dt.getFullYear(), m:r.dt.getMonth()+1, km:0, n:0, sec:0}); mm[k].km+=r.km; mm[k].n++; mm[k].sec+=r.sec; });
  const mo=Object.values(mm).sort((a,b)=>a.key<b.key?1:-1);
  const max=Math.max(...mo.map(m=>m.km));
  const scale=Math.max(max, RUN_MONTH_GOAL);
  document.getElementById("run-months").innerHTML=mo.map(m=>`
    <div class="mlist-row static">
      <span class="mlist-name"><span class="mlist-y">${m.y}年</span><span class="mlist-m">${m.m}月</span>${m.km>=RUN_MONTH_GOAL?`<em>${RUN_MONTH_GOAL}km達成</em>`:m.km===max&&mo.length>1?'<em>ベスト</em>':""}</span>
      <span class="mlist-bar goal"><span style="width:${m.km/scale*100}%"></span><i style="left:${RUN_MONTH_GOAL/scale*100}%"></i></span>
      <span class="mlist-val">${m.km.toFixed(2)} km<small>${m.n}本・平均 ${fmtPace(m.sec/m.km)}/km</small></span>
    </div>`).join("");
}

/* ---------- 経県値マップ（全国・市区町村単位） ----------
   スプレッドシート列 : 団体コード / 都道府県名 / 市区町村名 / レベル / 日付 / メモ
   ・団体コード … 総務省「全国地方公共団体コード」の6桁（例 232017）。5桁でも可
   ・レベル     … 3：宿泊 / 2：訪問 / 1：通過（空欄＝未踏）。数字だけ・言葉だけでも可
   ・政令市の行（例: 名古屋市 231002）は、個別の記入がない配下の全区にまとめて反映
   地図データ : GEO_DIR に「{都道府県名}.geojson」「{都道府県名}_border.geojson」（国土数値情報 N03）
   ------------------------------------------------------------------------ */
const URL_KEIKEN = "https://docs.google.com/spreadsheets/d/e/2PACX-1vS5OcNhfxyK5x1xC4LOilrV-JQNIWHgmywi7kBWrOnOKubY_PApnTDUlVuNZA7h9qcKNjMP06Z4LlF0/pub?gid=889344232&single=true&output=csv";        // ← 経県値シートの公開CSV URL（他のURLと同じ「ウェブに公開→CSV」で取得）
const GEO_DIR = "geojson/";           // GeoJSON の置き場所。index.html と同じフォルダなら ""、geojson フォルダなら "geojson/"
const KK_PREF_DEFAULT = "兵庫県";   // 最初に表示する都道府県

/* 都道府県名と市区町村数（政令市は区単位。総務省 R6.1.1） */
const KK_PREFS=[["北海道",194],["青森県",40],["岩手県",33],["宮城県",39],["秋田県",25],["山形県",35],["福島県",59],["茨城県",44],["栃木県",25],["群馬県",35],["埼玉県",72],["千葉県",59],["東京都",62],["神奈川県",58],["新潟県",37],["富山県",15],["石川県",19],["福井県",17],["山梨県",27],["長野県",77],["岐阜県",42],["静岡県",39],["愛知県",69],["三重県",29],["滋賀県",19],["京都府",36],["大阪府",72],["兵庫県",49],["奈良県",39],["和歌山県",30],["鳥取県",19],["島根県",19],["岡山県",30],["広島県",30],["山口県",19],["徳島県",24],["香川県",17],["愛媛県",20],["高知県",34],["福岡県",72],["佐賀県",20],["長崎県",21],["熊本県",49],["大分県",18],["宮崎県",26],["鹿児島県",43],["沖縄県",41]];
const KK_REGIONS=[["北海道・東北",0,7],["関東",7,14],["中部",14,23],["近畿",23,30],["中国",30,35],["四国",35,39],["九州・沖縄",39,47]];
const KK_PREF_IDX={}; KK_PREFS.forEach((p,i)=>KK_PREF_IDX[p[0]]=i);
const kkPrefCode=pref=>String(KK_PREF_IDX[pref]+1).padStart(2,"0");
/* 政令市（5桁）→ 配下の区（5桁） */
const KK_WARDS=(o=>{ const m={}; Object.keys(o).forEach(k=>m[k]=o[k].split(" ")); return m; })({"01100":"01101 01102 01103 01104 01105 01106 01107 01108 01109 01110","04100":"04101 04102 04103 04104 04105","11100":"11101 11102 11103 11104 11105 11106 11107 11108 11109 11110","12100":"12101 12102 12103 12104 12105 12106","14100":"14101 14102 14103 14104 14105 14106 14107 14108 14109 14110 14111 14112 14113 14114 14115 14116 14117 14118","14130":"14131 14132 14133 14134 14135 14136 14137","14150":"14151 14152 14153","15100":"15101 15102 15103 15104 15105 15106 15107 15108","22100":"22101 22102 22103","22130":"22138 22139 22140","23100":"23101 23102 23103 23104 23105 23106 23107 23108 23109 23110 23111 23112 23113 23114 23115 23116","26100":"26101 26102 26103 26104 26105 26106 26107 26108 26109 26110 26111","27100":"27102 27103 27104 27106 27107 27108 27109 27111 27113 27114 27115 27116 27117 27118 27119 27120 27121 27122 27123 27124 27125 27126 27127 27128","27140":"27141 27142 27143 27144 27145 27146 27147","28100":"28101 28102 28105 28106 28107 28108 28109 28110 28111","33100":"33101 33102 33103 33104","34100":"34101 34102 34103 34104 34105 34106 34107 34108","40100":"40101 40103 40105 40106 40107 40108 40109","40130":"40131 40132 40133 40134 40135 40136 40137","43100":"43101 43102 43103 43104 43105"});

/* レベル（3段階）。遠くからでも見分けやすいよう色の種類を変え、暖かい色ほど深く関わった場所 */
const KK_LEVELS=[
  {lv:3, label:"宿泊", note:"1泊以上した",               color:"#d9453f", words:["宿泊","泊","住んだ","居住","住"]},
  {lv:2, label:"訪問", note:"観光や用事で歩き回った",     color:"#f2b632", words:["訪問","訪れ","観光","遊んだ","降り立った","降りた"]},
  {lv:1, label:"通過", note:"電車や車で通っただけ",       color:"#8ec5e8", words:["通過","乗り換え"]},
  {lv:0, label:"未踏", note:"行ったことがない",           color:"#ffffff", words:["未踏","なし"]}
];
KK_LEVELS.forEach(l=>l.tag=`${l.lv}：${l.label}`);
const KK_MAX=KK_LEVELS[0].lv;
const KK_BY_LV={}; KK_LEVELS.forEach(l=>KK_BY_LV[l.lv]=l);
const KK={ mode:"keiken", ready:false, rows:[], note:"", pref:null, feats:[], byCode:{}, rec:{}, selected:null, filter:null,
           home:null, limit:null, minW:1, view:null, anim:0, geoCache:{}, token:0 };

const kkZen2Han=s=>String(s||"").replace(/[０-９]/g,c=>String.fromCharCode(c.charCodeAt(0)-0xFEE0));
function kkNormName(s){ return String(s||"").replace(/[\s\u3000]/g,""); }
function kkParseLevel(v){
  const s=kkNormName(v);
  if(!s) return 0;
  const n=kkZen2Han(s);
  const m=n.match(/^(\d+)/);   // 「3」「3：泊まった」など先頭の数字を優先
  if(m) return Math.max(0, Math.min(KK_MAX, Number(m[1])));
  const hit=KK_LEVELS.find(l=>l.words.some(w=>s.includes(w)));
  return hit?hit.lv:0;
}
function kkCheckDigitOK(c6){
  const s=[6,5,4,3,2].reduce((a,w,i)=>a+Number(c6[i])*w,0);
  return Number(c6[5])===(11-s%11)%10;
}
/* シートの1行 → { code(5桁), pref, name, lv, memo, date } */
function kkNormRow(o){
  const raw=kkZen2Han(F(o,"団体コード")).replace(/\D/g,"");
  let pref=kkNormName(F(o,"都道府県名"));
  const name=kkNormName(F(o,"市区町村名"));
  if(KK_PREF_IDX[pref]==null) pref="";
  // 6桁は先頭5桁。5桁は「本来の5桁」か「先頭の0が消えた6桁（01〜09の道県）」のどちらか
  const cands = raw.length===6 ? [raw.slice(0,5)]
              : raw.length===5 ? (kkCheckDigitOK("0"+raw) ? [("0"+raw).slice(0,5), raw] : [raw, ("0"+raw).slice(0,5)])
              : [];
  let code="";
  if(pref){ code=cands.find(c=>c.startsWith(kkPrefCode(pref)))||""; }
  else if(cands.length){
    code=cands.find(c=>KK_PREFS[Number(c.slice(0,2))-1])||"";
    if(code) pref=KK_PREFS[Number(code.slice(0,2))-1][0];
  }
  if(!code && !name) return null;
  return { code, pref, name, lv:kkParseLevel(F(o,"レベル")||F(o,"状態")), memo:F(o,"メモ"), date:F(o,"日付") };
}

/* ある都道府県の記録を市区町村コードごとにまとめる。feats があれば名前だけの行も地図の形に結びつける */
function kkPrefRecords(pref, feats){
  const byCode={}, byName={}, parents=[];
  const nameIdx={}; (feats||[]).forEach(f=>{ if(f.real){ nameIdx[kkNormName(f.name)]=f.code; if(!f.ward) nameIdx[kkNormName(f.city)]=f.code; } });
  const put=(map,key,r)=>{
    const cur=map[key];
    if(!cur || r.lv>cur.lv) map[key]={lv:r.lv, memo:r.memo, date:r.date};
    else if(r.lv===cur.lv){ if(!cur.memo && r.memo) cur.memo=r.memo; if(!cur.date && r.date) cur.date=r.date; }
  };
  KK.rows.forEach(r=>{
    if(r.pref!==pref && !(r.pref==="" && feats)) return;
    if(r.code && KK_WARDS[r.code]){ parents.push(r); return; }
    if(r.code){ put(byCode, r.code, r); return; }
    if(feats){ const c=nameIdx[r.name]; if(c) put(byCode, c, r); }
    else put(byName, r.name, r);
  });
  // 政令市の行は、個別の記入がない区だけに反映（政令市の行が複数あれば高いほう）
  const fromParent={};
  parents.forEach(r=>KK_WARDS[r.code].forEach(w=>{ if(!byCode[w]) put(fromParent, w, r); }));
  Object.assign(byCode, fromParent);
  return { byCode, byName };
}

function fetchJSON(url){ return fetch(encodeURI(url)).then(r=>{ if(!r.ok) throw new Error("HTTP "+r.status); return r.json(); }); }
function kkLoadGeo(pref){
  if(!KK.geoCache[pref]){
    KK.geoCache[pref]=Promise.all([
      fetchJSON(`${GEO_DIR}${pref}.geojson`),
      fetchJSON(`${GEO_DIR}${pref}_border.geojson`).catch(()=>null)
    ]).catch(e=>{ delete KK.geoCache[pref]; throw e; });
  }
  return KK.geoCache[pref];
}

async function loadKeiken(){
  // 都道府県セレクト
  const sel=document.getElementById("kk-pref-sel");
  sel.innerHTML=KK_REGIONS.map(([rg,a,b])=>`<optgroup label="${rg}">${
    KK_PREFS.slice(a,b).map(([p])=>`<option value="${p}">${p}</option>`).join("")}</optgroup>`).join("");
  sel.onchange=()=>kkShowPref(sel.value);
  document.querySelectorAll(".kk-ctrl button").forEach(b=>b.addEventListener("click", ()=>{
    if(!KK.home || !document.getElementById("kk-svg")) return;
    const z=b.dataset.z;
    if(z==="in") kkZoomBy(1.6); else if(z==="out") kkZoomBy(1/1.6); else kkZoomTo(KK.home.slice());
  }));

  if(!URL_KEIKEN){
    KK.note="スプレッドシートがまだつながっていません。app.js の URL_KEIKEN に経県値シートの公開CSVのURLを入れると、地図に色が付きます。";
  }else{
    try{
      // 1行目に説明書きがあっても大丈夫なよう、「団体コード」がある行を見出しとして探す
      const r=await fetchCSVRaw(URL_KEIKEN);
      const data=r.data||[];
      const hi=data.findIndex(row=>(row||[]).some(c=>String(c).replace(/^\uFEFF/,"").trim()==="団体コード"));
      if(hi<0) throw new Error("見出し行（団体コード）が見つかりません");
      const head=data[hi].map(c=>String(c).replace(/^\uFEFF/,"").trim());
      KK.rows=data.slice(hi+1).map(row=>{ const o={}; head.forEach((k,i)=>{ if(k) o[k]=(row||[])[i]; }); return o; })
                  .map(kkNormRow).filter(Boolean);
    }
    catch(e){ KK.note="経県値シートを読み込めませんでした。シートが「ウェブに公開」されているか、URLが正しいかを確認してください。"; }
  }
  KK.ready=true;
  kkRenderNation();
  kkShowPref(KK_PREF_IDX[KK_PREF_DEFAULT]!=null ? KK_PREF_DEFAULT : "東京都");
}

/* 経県値ページとグルメページで同じ地図を使い回す（表示中のページへ地図ごと移動） */
function kkSetMode(mode){
  const slot=document.getElementById("kk-slot-"+mode), box=document.getElementById("kk-shared");
  if(slot && box && box.parentNode!==slot) slot.appendChild(box);
  const changed=KK.mode!==mode;
  KK.mode=mode;
  document.getElementById("kk-nation-title").textContent = "全国";
  document.getElementById("kk-pref-anchor").textContent = "都道府県";
  box.classList.toggle("gm-mode", mode==="gourmet");
  document.getElementById("kk-info").innerHTML=`<p class="kk-info-empty">地図の市区町村をタップすると、ここに${mode==="gourmet"?"お店の一覧":"記録"}が表示されます。</p>`;
  if(!changed || !KK.ready) return;
  KK.filter=null; KK.selected=null;
  kkRenderNation();
  if(document.getElementById("kk-svg")) kkRenderPref();
}

/* ---- 全国のまとめ（都道府県ごとの最高レベル＝本家の経県値） ---- */
function kkRenderNation(){
  if(KK.mode==="gourmet") return gmRenderNation();
  let nationScore=0, prefVisited=0, muniVisited=0, muniTotal=0;
  const tiles=KK_PREFS.map(([pref,total])=>{
    const {byCode,byName}=kkPrefRecords(pref, null);
    const vals=Object.values(byCode).concat(Object.values(byName));
    const max=vals.reduce((m,v)=>Math.max(m,v.lv),0);
    const visited=Math.min(total, vals.filter(v=>v.lv>0).length);
    nationScore+=max; if(max>0) prefVisited++; muniVisited+=visited; muniTotal+=total;
    return { pref, total, max, visited };
  });
  document.getElementById("kk-nation-stats").innerHTML=`
    <div class="stat-chip">全国の経県値 <strong>${nationScore}</strong> / ${KK_PREFS.length*KK_MAX}点</div>
    <div class="stat-chip">足を運んだ都道府県 <strong>${prefVisited}</strong> / ${KK_PREFS.length}</div>
    <div class="stat-chip">市区町村 <strong>${muniVisited}</strong> / ${muniTotal}</div>`;
  const byPref={}; tiles.forEach(t=>byPref[t.pref]=t);
  document.getElementById("kk-nation").innerHTML=KK_REGIONS.map(([rg,a,b])=>`
    <div class="kk-region">
      <div class="kk-region-name">${rg}</div>
      <div class="kk-tiles">${KK_PREFS.slice(a,b).map(([p])=>{ const t=byPref[p];
        return `<button type="button" class="kk-tile${p===KK.pref?" active":""}" data-pref="${p}" aria-label="${p}：${KK_BY_LV[t.max].tag}、${t.visited}/${t.total}市区町村">
          <span class="kk-sw" style="background:${KK_BY_LV[t.max].color}"></span><span class="kk-tile-name">${p}</span><span class="kk-tile-n">${t.visited}/${t.total}</span>
        </button>`; }).join("")}</div>
    </div>`).join("");
  document.querySelectorAll(".kk-tile").forEach(b=>b.onclick=()=>{
    kkShowPref(b.dataset.pref);
    const a=document.getElementById("kk-pref-anchor"), nav=document.querySelector("nav");
    window.scrollTo({ top:Math.max(0, window.scrollY+a.getBoundingClientRect().top-(nav?nav.offsetHeight:0)-8), behavior:prefersReduced()?"auto":"smooth" });
  });
  const noteEl=document.getElementById("kk-note");
  noteEl.hidden=!KK.note; noteEl.textContent=KK.note||"";
}

/* ---- 都道府県を切り替え ---- */
async function kkShowPref(pref){
  const token=++KK.token;
  KK.pref=pref; KK.selected=null; KK.filter=null;
  document.getElementById("kk-pref-sel").value=pref;
  document.querySelectorAll(".kk-tile").forEach(t=>t.classList.toggle("active", t.dataset.pref===pref));
  document.getElementById("kk-info").innerHTML='<p class="kk-info-empty">地図の市区町村をタップすると、ここに記録が表示されます。</p>';
  const mapEl=document.getElementById("kk-map");
  mapEl.innerHTML='<div class="loading">読み込み中…</div>';
  let geo, border;
  try{ [geo, border]=await kkLoadGeo(pref); }
  catch(e){
    if(token!==KK.token) return;
    KK.feats=[]; KK.byCode={}; KK.rec={};
    mapEl.innerHTML=`<div class="loading">${escHtml(pref)}の地図データがありません。<br>「${escHtml(GEO_DIR+pref)}.geojson」を置き、Webサーバー経由（GitHub Pages など）で開いてください。</div>`;
    ["kk-stats","kk-legend","kk-list"].forEach(id=>document.getElementById(id).innerHTML="");
    return;
  }
  if(token!==KK.token) return;
  kkBuildMap(geo, border);
  KK.rec=kkPrefRecords(pref, KK.feats).byCode;
  kkRenderPref();
}

/* ---- GeoJSON → SVG ---- */
function kkEachCoord(geom, fn){
  const walk=a=>{ if(typeof a[0]==="number") fn(a); else a.forEach(walk); };
  walk(geom.coordinates);
}
/* N03 の版による属性の違いを吸収（政令市の区が N03_005 か N03_003+N03_004 か） */
function kkFeatInfo(p){
  const code=String(p.N03_007||"").replace(/\D/g,"").padStart(5,"0");
  let city=p.N03_004||"", ward=p.N03_005||"";
  if(!ward && p.N03_003 && /市$/.test(p.N03_003) && /区$/.test(city)){ ward=city; city=p.N03_003; }
  const real=!!city && city!=="所属未定地" && !/000$/.test(code);
  return { code, city, ward, name:city+ward, real };
}
function kkBuildMap(geo, border){
  const src=(geo.features||[]).filter(f=>f.geometry);
  // 古い N03 は島ごとに別フィーチャーなので、コード単位にまとめる
  const groups={}, order=[];
  src.forEach((f,i)=>{
    const inf=kkFeatInfo(f.properties||{});
    const key=inf.real ? inf.code : "void"+i;
    if(!groups[key]){ groups[key]={...inf, geoms:[]}; order.push(key); }
    groups[key].geoms.push(f.geometry);
  });
  const feats=order.map(k=>groups[k]);

  // 中心から極端に離れた島（小笠原など）は「主な範囲」から外す
  const lats=[]; src.forEach(f=>kkEachCoord(f.geometry,([,y])=>lats.push(y)));
  lats.sort((a,b)=>a-b);
  const kx=Math.cos((lats[Math.floor(lats.length/2)]||35)*Math.PI/180);
  feats.forEach(f=>{
    const b=[Infinity,Infinity,-Infinity,-Infinity];
    f.geoms.forEach(g=>kkEachCoord(g,([x,y])=>{ x*=kx; y=-y; if(x<b[0])b[0]=x; if(y<b[1])b[1]=y; if(x>b[2])b[2]=x; if(y>b[3])b[3]=y; }));
    f.rb=b; f.cx=(b[0]+b[2])/2; f.cy=(b[1]+b[3])/2;
  });
  const med=a=>{ const s=a.slice().sort((x,y)=>x-y); return s[Math.floor(s.length/2)]||0; };
  const reals=feats.filter(f=>f.real && isFinite(f.cx));
  const mx=med(reals.map(f=>f.cx)), my=med(reals.map(f=>f.cy));
  reals.forEach(f=>f.dist=Math.hypot(f.cx-mx, f.cy-my));
  const md=Math.max(med(reals.map(f=>f.dist)), 0.05);
  const union=list=>list.reduce((b,f)=>[Math.min(b[0],f.rb[0]),Math.min(b[1],f.rb[1]),Math.max(b[2],f.rb[2]),Math.max(b[3],f.rb[3])],[Infinity,Infinity,-Infinity,-Infinity]);
  const fullR=union(feats.filter(f=>isFinite(f.cx)));
  let mainR=union(reals.filter(f=>f.dist<=md*4));
  const area=b=>(b[2]-b[0])*(b[3]-b[1]);
  const trimmed = area(fullR) > area(mainR)*1.6;
  if(!trimmed) mainR=fullR;

  // 主な範囲の幅を 1000 とする座標系
  const S=1000/Math.max(mainR[2]-mainR[0], 1e-6);
  const P=([lon,lat])=>[ +((lon*kx-mainR[0])*S).toFixed(2), +((-lat-mainR[1])*S).toFixed(2) ];
  const toBox=r=>[(r[0]-mainR[0])*S, (r[1]-mainR[1])*S, (r[2]-mainR[0])*S, (r[3]-mainR[1])*S];
  const lineStr=(pts,close)=>pts.map((c,i)=>{ const [x,y]=P(c); return (i?"L":"M")+x+","+y; }).join("")+(close?"Z":"");
  const ringStr=r=>r.map((p,i)=>(i?"L":"M")+p[0]+","+p[1]).join("")+"Z";
  feats.forEach(f=>{
    // 投影済みのポリゴン [[ring...]...]
    const polys=[];
    f.geoms.forEach(g=>{
      const ps = g.type==="Polygon" ? [g.coordinates] : g.type==="MultiPolygon" ? g.coordinates : [];
      ps.forEach(rings=>polys.push(rings.map(r=>r.map(P))));
    });
    f.d=polys.map(rings=>rings.map(ringStr).join("")).join("");
    f.box=toBox(f.rb);
    // 名前の位置：いちばん大きい島の「内側でいちばん広く空いている点」（形がいびつでも区域内に収まる）
    if(f.real && polys.length){
      const big=polys.reduce((a,b)=>Math.abs(kkRingArea(b[0]))>Math.abs(kkRingArea(a[0]))?b:a);
      const [lx,ly,lr]=kkPolylabel(big);
      f.lx=lx; f.ly=ly; f.lr=lr; f.label=f.ward||f.city;
    }
    delete f.geoms;
  });
  KK.feats=feats;
  KK.byCode={}; feats.forEach(f=>{ if(f.real) KK.byCode[f.code]=f; });

  // 表示範囲：最初は「主な範囲」。縮小は離島まで全部入るところまで、拡大は 16 倍まで
  const pad=(b,m)=>[b[0]-m, b[1]-m, (b[2]-b[0])+m*2, (b[3]-b[1])+m*2];
  const mainBox=pad(toBox(mainR), 14);
  const fb=toBox(fullR);
  KK.home=mainBox;
  KK.limit=kkFitAspect(pad(fb, Math.max(fb[2]-fb[0], fb[3]-fb[1])*0.06), mainBox);
  KK.minW=mainBox[2]/16;
  KK.view=mainBox.slice();

  let borderD="";
  if(border && border.features){
    border.features.forEach(f=>{
      const g=f.geometry; if(!g) return;
      const lines = g.type==="LineString" ? [g.coordinates] : g.type==="MultiLineString" ? g.coordinates
                  : g.type==="Polygon" ? g.coordinates : g.type==="MultiPolygon" ? g.coordinates.flat() : [];
      borderD+=lines.map(l=>lineStr(l,false)).join("");
    });
  }
  const paths=feats.map(f=> f.real
    ? `<path class="kk-muni" data-code="${f.code}" d="${f.d}" tabindex="0" role="button" aria-label="${escHtml(f.name)}"></path>`
    : `<path class="kk-muni kk-void" d="${f.d}" aria-hidden="true"></path>`).join("");
  document.getElementById("kk-map").innerHTML=
    `<svg id="kk-svg" viewBox="${KK.view.join(" ")}" xmlns="http://www.w3.org/2000/svg" role="group" aria-label="${escHtml(KK.pref)}の市区町村 ${KK.mode==="gourmet"?"グルメ地図":"経県値マップ"}">
      <g id="kk-munis">${paths}</g>
      ${borderD?`<path class="kk-border" d="${borderD}"></path>`:""}
      <g id="kk-labels" class="kk-labels" aria-hidden="true">${feats.filter(f=>f.label).map(f=>
        `<text x="${f.lx.toFixed(1)}" y="${f.ly.toFixed(1)}" data-code="${f.code}">${escHtml(f.label)}</text>`).join("")}</g>
    </svg>`;
  kkBindMap();
  kkUpdateLabels();
  if(window.ResizeObserver){
    if(KK.ro) KK.ro.disconnect();
    KK.ro=new ResizeObserver(()=>kkUpdateLabels());
    KK.ro.observe(document.getElementById("kk-svg"));
  }
}

function kkBindMap(){
  const svg=document.getElementById("kk-svg");
  const tip=document.getElementById("kk-tip");
  const wrap=document.getElementById("kk-mapwrap");
  const codeOf=t=>t && t.classList && t.classList.contains("kk-muni") ? t.dataset.code : null;
  svg.addEventListener("click", e=>{ if(KK.dragged){ KK.dragged=false; return; } const c=codeOf(e.target); if(c) kkSelect(c); });
  kkBindPanZoom(svg);
  svg.addEventListener("keydown", e=>{
    if(e.key!=="Enter" && e.key!==" ") return;
    const c=codeOf(e.target); if(c){ e.preventDefault(); kkSelect(c); }
  });
  svg.addEventListener("pointermove", e=>{
    const c=codeOf(e.target);
    if(e.pointerType!=="mouse" || !c){ tip.hidden=true; return; }
    const f=KK.byCode[c], l=kkByLv(kkLv(c));
    const tag=KK.mode==="gourmet" ? `${(GM.byCode[c]||[]).length}軒` : l.tag;
    tip.innerHTML=`<span class="kk-sw" style="background:${l.color}"></span>${escHtml(f.name)}<em>${tag}</em>`;
    const r=wrap.getBoundingClientRect();
    tip.hidden=false;
    tip.style.left=Math.max(6, Math.min(e.clientX-r.left+14, r.width-tip.offsetWidth-6))+"px";
    tip.style.top=(e.clientY-r.top+16)+"px";
  });
  svg.addEventListener("pointerleave", ()=>{ tip.hidden=true; });
}


/* ---- 市区町村名ラベル ---- */
const KK_LABEL_PX=11;   // 画面上の文字の大きさ（px）。拡大縮小しても一定
function kkRingArea(r){ let a=0; for(let i=0,j=r.length-1;i<r.length;j=i++) a+=(r[j][0]-r[i][0])*(r[j][1]+r[i][1]); return a/2; }
function kkSegDist2(px,py,a,b){
  let x=a[0], y=a[1], dx=b[0]-x, dy=b[1]-y;
  if(dx||dy){ const t=((px-x)*dx+(py-y)*dy)/(dx*dx+dy*dy); if(t>1){ x=b[0]; y=b[1]; } else if(t>0){ x+=dx*t; y+=dy*t; } }
  dx=px-x; dy=py-y; return dx*dx+dy*dy;
}
/* 点からポリゴン境界までの距離（内側なら正、外側なら負） */
function kkPointDist(x,y,poly){
  let inside=false, min=Infinity;
  poly.forEach(r=>{
    for(let i=0,j=r.length-1;i<r.length;j=i++){
      const a=r[i], b=r[j];
      if((a[1]>y)!==(b[1]>y) && x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0]) inside=!inside;
      min=Math.min(min, kkSegDist2(x,y,a,b));
    }
  });
  return (inside?1:-1)*Math.sqrt(min);
}
/* polylabel（到達不能極）：ポリゴン内でもっとも境界から遠い点 → [x, y, 半径] */
function kkPolylabel(poly){
  const outer=poly[0];
  let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
  outer.forEach(([x,y])=>{ if(x<x0)x0=x; if(y<y0)y0=y; if(x>x1)x1=x; if(y>y1)y1=y; });
  const w=x1-x0, h=y1-y0, size=Math.min(w,h);
  if(!size) return [x0,y0,0];
  const precision=Math.max(size/40, 0.3);
  const cell=(x,y,hh)=>{ const d=kkPointDist(x,y,poly); return {x,y,h:hh,d,max:d+hh*Math.SQRT2}; };
  const q=[];
  for(let x=x0;x<x1;x+=size) for(let y=y0;y<y1;y+=size) q.push(cell(x+size/2,y+size/2,size/2));
  let best=cell(x0+w/2, y0+h/2, 0);
  // 重心も候補に
  let cx=0,cy=0,ca=0;
  for(let i=0,j=outer.length-1;i<outer.length;j=i++){ const a=outer[i],b=outer[j],f=a[0]*b[1]-b[0]*a[1]; cx+=(a[0]+b[0])*f; cy+=(a[1]+b[1])*f; ca+=f*3; }
  if(ca){ const c=cell(cx/ca, cy/ca, 0); if(c.d>best.d) best=c; }
  let guard=0;
  while(q.length && guard++<4000){
    let mi=0; for(let i=1;i<q.length;i++) if(q[i].max>q[mi].max) mi=i;
    const c=q.splice(mi,1)[0];
    if(c.d>best.d) best=c;
    if(c.max-best.d<=precision) continue;
    const hh=c.h/2;
    q.push(cell(c.x-hh,c.y-hh,hh), cell(c.x+hh,c.y-hh,hh), cell(c.x-hh,c.y+hh,hh), cell(c.x+hh,c.y+hh,hh));
  }
  return [best.x, best.y, Math.max(best.d,0)];
}
/* 今の拡大率で、区域に収まる名前だけを表示する */
function kkUpdateLabels(){
  const svg=document.getElementById("kk-svg"), g=document.getElementById("kk-labels");
  if(!svg || !g || !KK.view) return;
  const r=svg.getBoundingClientRect();
  if(!r.width) return;                                  // ページ非表示中
  const ppu=Math.min(r.width/KK.view[2], r.height/KK.view[3]);   // 1単位あたりの画面px
  const fs=KK_LABEL_PX/ppu;
  g.setAttribute("font-size", fs.toFixed(3));
  g.setAttribute("stroke-width", (fs*0.3).toFixed(3));
  g.querySelectorAll("text").forEach(t=>{
    const f=KK.byCode[t.dataset.code]; if(!f) return;
    const diam=f.lr*2*ppu, textW=f.label.length*KK_LABEL_PX;
    t.classList.toggle("off", !(diam>=KK_LABEL_PX*1.3 && diam>=textW*0.7));
  });
}

/* 拡大しても地図の縦横比（＝表示の高さ）が変わらないよう、全体表示と同じ比率に広げる */
function kkFitAspect(b, ref){
  const ar=ref[2]/ref[3];
  let [x,y,w,h]=b;
  if(w/h<ar){ const nw=h*ar; x-=(nw-w)/2; w=nw; } else { const nh=w/ar; y-=(nh-h)/2; h=nh; }
  return [x,y,w,h];
}

/* ---- 拡大・縮小・移動 ----
   PC：ホイールで拡大縮小、ドラッグで移動、ダブルクリックで拡大
   スマホ：2本指で拡大縮小、1本指で移動
   ボタン：＋ / − / 元に戻す */
function kkClampView(v){
  let [x,y,w,h]=v;
  const ar=KK.home[2]/KK.home[3];
  w=Math.max(KK.minW, Math.min(KK.limit[2], w)); h=w/ar;
  // 表示の中心が地図の範囲から出ないように
  const L=KK.limit, cx=Math.max(L[0], Math.min(L[0]+L[2], x+v[2]/2)), cy=Math.max(L[1], Math.min(L[1]+L[3], y+v[3]/2));
  return [cx-w/2, cy-h/2, w, h];
}
function kkSetView(v){
  const svg=document.getElementById("kk-svg"); if(!svg) return;
  KK.view=v;
  svg.setAttribute("viewBox", v.map(n=>n.toFixed(2)).join(" "));
  kkUpdateLabels();
}
/* 画面上の点 → 地図の座標 */
function kkClientToMap(svg, cx, cy){
  const r=svg.getBoundingClientRect(), v=KK.view;
  const s=Math.min(r.width/v[2], r.height/v[3]);
  const ox=(r.width-v[2]*s)/2, oy=(r.height-v[3]*s)/2;
  return [v[0]+(cx-r.left-ox)/s, v[1]+(cy-r.top-oy)/s, s];
}
/* (ux,uy) を動かさずに factor 倍に拡大 */
function kkZoomAt(ux, uy, factor, base){
  const v=base||KK.view;
  const nw=v[2]/factor, k=nw/v[2];
  return kkClampView([ux-(ux-v[0])*k, uy-(uy-v[1])*k, nw, v[3]*k]);
}
function kkZoomBy(factor){
  const v=KK.view;
  kkZoomTo(kkZoomAt(v[0]+v[2]/2, v[1]+v[3]/2, factor));
}
function kkBindPanZoom(svg){
  const pts=new Map();
  let start=null;     // ジェスチャー開始時の状態
  const snapshot=()=>{
    const list=[...pts.values()];
    const c = list.length>1 ? [(list[0].x+list[1].x)/2, (list[0].y+list[1].y)/2] : [list[0].x, list[0].y];
    const d = list.length>1 ? Math.hypot(list[0].x-list[1].x, list[0].y-list[1].y) : 0;
    start={ view:KK.view.slice(), c, d, n:list.length, moved:false };
  };
  svg.addEventListener("pointerdown", e=>{
    if(e.button>0) return;
    pts.set(e.pointerId,{x:e.clientX,y:e.clientY});
    cancelAnimationFrame(KK.anim);
    snapshot();
  });
  svg.addEventListener("pointermove", e=>{
    if(!pts.has(e.pointerId) || !start) return;
    pts.set(e.pointerId,{x:e.clientX,y:e.clientY});
    const list=[...pts.values()];
    const c = list.length>1 ? [(list[0].x+list[1].x)/2, (list[0].y+list[1].y)/2] : [list[0].x, list[0].y];
    if(!start.moved && Math.hypot(c[0]-start.c[0], c[1]-start.c[1])<5 && list.length<2) return;
    if(!start.moved){ start.moved=true; try{ svg.setPointerCapture(e.pointerId); }catch(_){} svg.classList.add("dragging"); document.getElementById("kk-tip").hidden=true; }
    const r=svg.getBoundingClientRect(), v0=start.view;
    const s=Math.min(r.width/v0[2], r.height/v0[3]);
    // 移動（開始時の表示から、指の移動ぶんずらす）
    let v=[v0[0]-(c[0]-start.c[0])/s, v0[1]-(c[1]-start.c[1])/s, v0[2], v0[3]];
    // 2本指なら拡大縮小
    if(list.length>1 && start.d>0){
      const d=Math.hypot(list[0].x-list[1].x, list[0].y-list[1].y);
      const ox=(r.width-v0[2]*s)/2, oy=(r.height-v0[3]*s)/2;
      const ux=v[0]+(c[0]-r.left-ox)/s, uy=v[1]+(c[1]-r.top-oy)/s;
      v=kkZoomAt(ux, uy, d/start.d, v);
    }
    kkSetView(kkClampView(v));
  });
  const end=e=>{
    if(!pts.has(e.pointerId)) return;
    if(start && start.moved) KK.dragged=true;
    pts.delete(e.pointerId);
    svg.classList.remove("dragging");
    if(pts.size){ snapshot(); start.moved=true; } else start=null;
    setTimeout(()=>{ KK.dragged=false; }, 0);
  };
  svg.addEventListener("pointerup", end);
  svg.addEventListener("pointercancel", end);
  svg.addEventListener("wheel", e=>{
    e.preventDefault();
    const [ux,uy]=kkClientToMap(svg, e.clientX, e.clientY);
    const factor=Math.exp(-e.deltaY*(e.deltaMode===1?0.05:0.0022));
    cancelAnimationFrame(KK.anim);
    kkSetView(kkZoomAt(ux, uy, factor));
  }, { passive:false });
  svg.addEventListener("dblclick", e=>{
    e.preventDefault();
    const [ux,uy]=kkClientToMap(svg, e.clientX, e.clientY);
    kkZoomTo(kkZoomAt(ux, uy, 2));
  });
}
/* 一覧から選んだとき：名前が見えないほど小さければ、その市区町村まで寄る */
function kkFocus(code){
  const f=KK.byCode[code]; if(!f) return;
  const t=document.querySelector(`#kk-labels text[data-code="${code}"]`);
  const b=f.box, cx=(b[0]+b[2])/2, cy=(b[1]+b[3])/2;
  const v=KK.view;
  const inView = cx>v[0] && cx<v[0]+v[2] && cy>v[1] && cy<v[1]+v[3];
  if(t && !t.classList.contains("off") && inView) return;
  const w=Math.max((b[2]-b[0])*3.2, (b[3]-b[1])*3.2*KK.home[2]/KK.home[3]);
  const nw=Math.min(v[2], w);
  kkZoomTo(kkClampView([cx-nw/2, cy-nw*KK.home[3]/KK.home[2]/2, nw, nw*KK.home[3]/KK.home[2]]));
}
function kkZoomTo(target){
  const svg=document.getElementById("kk-svg"); if(!svg) return;
  const from=KK.view.slice();
  const set=v=>kkSetView(v);
  cancelAnimationFrame(KK.anim);
  if(prefersReduced()){ set(target.slice()); return; }
  const t0=performance.now(), dur=420;
  const step=now=>{
    const t=Math.min(1,(now-t0)/dur), e=1-Math.pow(1-t,3);
    set(from.map((v,i)=>v+(target[i]-v)*e));
    if(t<1) KK.anim=requestAnimationFrame(step);
  };
  KK.anim=requestAnimationFrame(step);
}

/* ---- 都道府県ごとの描画 ---- */
function kkLevels(){ return KK.mode==="gourmet" ? GM_LEVELS : KK_LEVELS; }
function kkByLv(lv){ return kkLevels().find(l=>l.lv===lv)||kkLevels()[kkLevels().length-1]; }
function kkLv(code){
  if(KK.mode==="gourmet") return gmBucket((GM.byCode[code]||[]).length);
  return (KK.rec[code]||{}).lv||0;
}

function kkRenderPref(){
  const real=KK.feats.filter(f=>f.real);
  const total=real.length;
  const count={}; kkLevels().forEach(l=>count[l.lv]=0);
  let score=0;
  real.forEach(f=>{ const lv=kkLv(f.code); count[lv]++; score+=lv; });
  const visited=total-count[0];

  document.querySelectorAll("#kk-svg .kk-muni[data-code]").forEach(p=>{
    const c=p.dataset.code, l=kkByLv(kkLv(c));
    p.style.fill=l.color;
    p.setAttribute("aria-label", `${KK.byCode[c].name}、${KK.mode==="gourmet"?(GM.byCode[c]||[]).length+"軒":l.tag}`);
    p.classList.toggle("dim", KK.filter!=null && kkLv(c)!==KK.filter);
  });

  if(KK.mode==="gourmet"){
    const shops=real.reduce((n,f)=>n+(GM.byCode[f.code]||[]).length,0);
    const rated=[].concat(...real.map(f=>GM.byCode[f.code]||[])).filter(r=>r.my!=null);
    const avg=rated.length?rated.reduce((a,r)=>a+r.my,0)/rated.length:0;
    document.getElementById("kk-stats").innerHTML=`
    <div class="stat-chip">${escHtml(KK.pref)}で食べたお店 <strong>${shops}</strong> 軒</div>
    <div class="stat-chip">市区町村 <strong>${visited}</strong> / ${total}</div>
    ${rated.length?`<div class="stat-chip">評価の平均 <strong>${avg.toFixed(2)}</strong></div>`:""}`;
  }else document.getElementById("kk-stats").innerHTML=`
    <div class="stat-chip">${escHtml(KK.pref)}の経県値 <strong>${score}</strong> / ${total*KK_MAX}点</div>
    <div class="stat-chip">足を運んだ <strong>${visited}</strong> / ${total} 市区町村</div>
    <div class="stat-chip">制覇率 <strong>${total?Math.round(visited/total*100):0}%</strong></div>`;

  document.getElementById("kk-legend").innerHTML=kkLevels().slice().reverse().map(l=>`
    <button type="button" class="kk-leg${KK.filter===l.lv?" active":""}" data-lv="${l.lv}" aria-pressed="${KK.filter===l.lv}" title="${l.note}">
      <span class="kk-sw" style="background:${l.color}"></span>${l.tag}<span class="kk-leg-n">${count[l.lv]}</span>
    </button>`).join("");
  document.querySelectorAll(".kk-leg").forEach(b=>b.onclick=()=>{
    const lv=Number(b.dataset.lv);
    KK.filter = KK.filter===lv ? null : lv;
    kkRenderPref();
  });

  // 一覧（レベルの高い順。未踏は折りたたみ）
  const gmN=f=>(GM.byCode[f.code]||[]).length;
  const chip=f=>`<button type="button" class="kk-chip" data-code="${f.code}">${escHtml(f.name)}${KK.mode==="gourmet"&&gmN(f)?`<span class="kk-chip-n">${gmN(f)}</span>`:""}</button>`;
  document.getElementById("kk-list").innerHTML=kkLevels().map(l=>{
    const fs=real.filter(f=>kkLv(f.code)===l.lv).sort((a,b)=>KK.mode==="gourmet"&&gmN(b)!==gmN(a)?gmN(b)-gmN(a):(a.code<b.code?-1:1));
    if(!fs.length) return "";
    const head=`<span class="kk-sw" style="background:${l.color}"></span>${l.tag}<span class="kk-leg-n">${fs.length}</span>`;
    const body=`<div class="kk-chips">${fs.map(chip).join("")}</div>`;
    return l.lv===0
      ? `<details class="kk-group"><summary class="kk-group-head">${head}</summary>${body}</details>`
      : `<div class="kk-group"><div class="kk-group-head">${head}</div>${body}</div>`;
  }).join("");
  document.querySelectorAll(".kk-chip").forEach(b=>b.onclick=()=>{
    const c=b.dataset.code;
    kkFocus(c);
    kkSelect(c);
    const m=document.getElementById("kk-mapwrap"), nav=document.querySelector("nav");
    window.scrollTo({ top:Math.max(0, window.scrollY+m.getBoundingClientRect().top-(nav?nav.offsetHeight:0)-8), behavior:prefersReduced()?"auto":"smooth" });
  });

  if(KK.selected) kkSelect(KK.selected);
}

function kkSelect(code){
  const f=KK.byCode[code]; if(!f) return;
  KK.selected=code;
  const g=document.getElementById("kk-munis");
  g.querySelectorAll(".kk-muni.sel").forEach(p=>p.classList.remove("sel"));
  const p=g.querySelector(`.kk-muni[data-code="${code}"]`);
  if(p){ p.classList.add("sel"); g.appendChild(p); p.focus({preventScroll:true}); }
  if(KK.mode==="gourmet"){ gmRenderInfo(code, f); return; }
  const r=KK.rec[code]||{}, l=KK_BY_LV[r.lv||0];
  document.getElementById("kk-info").innerHTML=`
    <div class="kk-info-head">
      <span class="kk-info-name">${escHtml(f.name)}</span>
      <span class="kk-badge" style="--c:${l.color}">${l.tag}</span>
    </div>
    ${r.date?`<div class="kk-info-date">${escHtml(r.date)}</div>`:""}
    ${r.memo?`<div class="kk-info-memo">${escHtml(r.memo)}</div>`:""}`;
}

/* =====================================================================
   グルメ（食べログ）
   列 : No / 日付 / 曜日 / 店名 / 都道府県 / 市区町村 / 評価 / Instagram（投稿対象・投稿済）/ ジャンル
   ・都道府県＋市区町村を経県値シートの市区町村一覧と照らし合わせて地図に反映します
     （政令市は「神戸市中央区」のように区まで、郡名は付けない）
   ・ジャンルは「、」区切りで複数でも、1つでもOK
   ===================================================================== */
const URL_GOURMET = "https://docs.google.com/spreadsheets/d/e/2PACX-1vS5OcNhfxyK5x1xC4LOilrV-JQNIWHgmywi7kBWrOnOKubY_PApnTDUlVuNZA7h9qcKNjMP06Z4LlF0/pub?gid=1336707621&single=true&output=csv";

/* 市区町村の色分け（軒数）。経県値と見分けがつくよう、食べ物らしい橙系 */
const GM_LEVELS=[
  {lv:4, label:"10軒〜",  tag:"10軒〜",  note:"10軒以上", color:"#b8401c"},
  {lv:3, label:"5〜9軒",  tag:"5〜9軒",  note:"5〜9軒",   color:"#ea7a3b"},
  {lv:2, label:"2〜4軒",  tag:"2〜4軒",  note:"2〜4軒",   color:"#f8b765"},
  {lv:1, label:"1軒",     tag:"1軒",     note:"1軒",      color:"#fde1ad"},
  {lv:0, label:"0軒",     tag:"0軒",     note:"まだ食べていない", color:"#ffffff"}
];
const gmBucket=n=> n>=10?4 : n>=5?3 : n>=2?2 : n>=1?1 : 0;
const gmPrefBucket=n=> n>=50?4 : n>=20?3 : n>=5?2 : n>=1?1 : 0;
const GM={ list:[], byCode:{}, byPref:{}, tab:"すべて", note:"" };

function gmParseYM(s){ const m=String(s||"").match(/(\d{4})\D+(\d{1,2})/); return m?new Date(+m[1], +m[2]-1, 1):null; }
function gmFmtYM(d){ return d?`${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,"0")}`:""; }
function gmFmtDate(r){ return r.dt?`${r.dt.getFullYear()}/${fmtMD(r.dt)}`:gmFmtYM(r.ym); }

async function loadGourmet(){
  let rows=[];
  try{ rows=cleanRows((await fetchCSV(URL_GOURMET)).data); }
  catch(e){ document.getElementById("gm-hero").innerHTML=errBox("食べログのデータを読み込めませんでした。"); return; }

  /* 名前 → 団体コード（経県値シートの全市区町村を辞書として使う） */
  const nameIdx={}; KK.rows.forEach(r=>{ if(r.code && r.pref) nameIdx[r.pref+"\u0001"+r.name]=r.code; });

  GM.list=rows.map(o=>{
    const name=F(o,"店名"); if(!name) return null;
    /* 列名は「都道府県／市区町村」「都道府県名／市区町村名」のどちらでも読めるようにする */
    const pf=F(o,"都道府県")||F(o,"都道府県名"), mu=F(o,"市区町村")||F(o,"市区町村名");
    const k=kkNormRow({ "団体コード":F(o,"団体コード"), "都道府県名":pf, "市区町村名":mu })||{code:"",pref:"",name:""};
    let code=k.code;
    if(!code && k.pref && k.name) code=nameIdx[k.pref+"\u0001"+k.name]||"";
    const dt=pd(F(o,"日付"));
    return { code, pref:k.pref, muni:mu, name, genre:F(o,"ジャンル"),
      genres:F(o,"ジャンル").split(/[、,，]/).map(x=>x.trim()).filter(Boolean),
      dt, ym:dt||gmParseYM(F(o,"訪問月")), my:num(F(o,"評価")||F(o,"自分の評価")) };
  }).filter(Boolean);

  GM.byCode={}; GM.byPref={};
  GM.list.forEach(r=>{
    if(r.code) (GM.byCode[r.code]=GM.byCode[r.code]||[]).push(r);
    if(r.pref) (GM.byPref[r.pref]=GM.byPref[r.pref]||[]).push(r);
  });
  const noMap=GM.list.filter(r=>!r.code).length;
  GM.note = noMap ? `地図に載せられなかったお店が ${noMap} 軒あります（都道府県名・市区町村名を確認してください）。` : "";

  if(!GM.list.length){ document.getElementById("gm-hero").innerHTML=errBox("まだ記録がありません。"); return; }
  gmRenderHero(); gmRenderTabs(); gmRenderRank(); gmRenderGenre();
  if(KK.mode==="gourmet" && KK.ready){ kkRenderNation(); if(document.getElementById("kk-svg")) kkRenderPref(); }
}

function gmRenderHero(){
  const L=GM.list, rated=L.filter(r=>r.my!=null);
  const avg=rated.length?rated.reduce((a,r)=>a+r.my,0)/rated.length:0;
  const prefs=Object.keys(GM.byPref).length, munis=Object.keys(GM.byCode).length;
  document.getElementById("gm-hero").innerHTML=`
    <div class="tm-hero-label">これまでに投稿したお店</div>
    <div class="tm-big">${nf(L.length)}<small>軒</small></div>
    <div class="gm-hero-sub">${prefs}都道府県・${munis}市区町村${rated.length?`・評価の平均 ${avg.toFixed(2)}`:""}</div>`;
}

/* ジャンルの集計（1軒に複数ジャンルがあれば、それぞれに数える） */
function gmGenreStats(){
  const m={};
  GM.list.forEach(r=>r.genres.forEach(g=>{ const s=(m[g]=m[g]||{g, n:0, sum:0, rn:0}); s.n++; if(r.my!=null){ s.sum+=r.my; s.rn++; } }));
  return Object.values(m).sort((a,b)=>b.n-a.n);
}

/* ジャンルのタブ：よく行くジャンル（5軒以上）はボタン、残りも含む全ジャンルは最後の「ほかのジャンル」から選ぶ。
   どちらも1行に収めて横にスクロールするので、ジャンルが増えても縦に伸びない */
const GM_TAB_MIN = 5;
function gmRenderTabs(){
  const rated=GM.list.filter(r=>r.my!=null).length;
  const S=gmGenreStats().filter(s=>s.rn>0);
  if(GM.tab!=="すべて" && !S.some(s=>s.g===GM.tab)) GM.tab="すべて";
  const chips=[{g:"すべて", rn:rated}].concat(S.filter(s=>s.n>=GM_TAB_MIN));
  const inChips=chips.some(t=>t.g===GM.tab);
  const box=document.getElementById("gm-tabs");
  box.classList.add("gm-tabs-scroll");
  box.innerHTML=chips.map(t=>
    `<button type="button" class="day-tab${t.g===GM.tab?" active":""}" data-t="${escHtml(t.g)}">${escHtml(t.g)}<small>${t.rn}</small></button>`).join("")
    + `<label class="day-tab gm-tab-more${inChips?"":" active"}"><span>${inChips?"ほかのジャンル":escHtml(GM.tab)}</span>${inChips?"":`<small>${(S.find(s=>s.g===GM.tab)||{}).rn}</small>`}
        <select aria-label="ジャンルを選ぶ"><option value="">ジャンルを選ぶ（全${S.length}）</option>${S.map(s=>`<option value="${escHtml(s.g)}"${s.g===GM.tab?" selected":""}>${escHtml(s.g)}（${s.rn}）</option>`).join("")}</select></label>`;
  box.querySelectorAll("button.day-tab").forEach(b=>b.onclick=()=>gmSelectTab(b.dataset.t));
  box.querySelector("select").onchange=e=>{ if(e.target.value) gmSelectTab(e.target.value); };
}
function gmSelectTab(t, scroll){
  GM.tab=t;
  gmRenderTabs(); gmRenderRank();
  const box=document.getElementById("gm-tabs"), on=box.querySelector(".day-tab.active");
  if(on) box.scrollTo({left: on.offsetLeft - box.clientWidth/2 + on.offsetWidth/2, behavior:"smooth"});
  if(scroll) box.closest(".card-section").scrollIntoView({behavior:"smooth", block:"start"});
}

function gmShopHtml(r, rank){
  const medal=["🥇","🥈","🥉"];
  const pos = rank<3 ? `<span class="rk-medal" aria-label="${rank+1}位">${medal[rank]}</span>` : `${rank+1}`;
  return `<div class="gm-row">
    <div class="gm-pos">${pos}</div>
    <div class="gm-main">
      <div class="gm-title">${escHtml(r.name)}</div>
      <div class="gm-meta">${escHtml([r.muni||r.pref, r.genres[0]].filter(Boolean).join("・"))}</div>
    </div>
    <div class="gm-score">${gmScore(r.my)}</div>
  </div>`;
}
const gmScore=v=>v==null?"-":v.toFixed(1);     // 自分の評価（1桁）

function gmRenderRank(){
  const L=GM.list.filter(r=>r.my!=null && (GM.tab==="すべて" || r.genres.includes(GM.tab)))
    .sort((a,b)=>b.my-a.my || (b.ym||0)-(a.ym||0)).slice(0,10);
  document.getElementById("gm-rank").innerHTML = L.length ? L.map((r,i)=>gmShopHtml(r, i)).join("") : errBox("このジャンルの記録はまだありません。");
}

function gmRenderGenre(){
  const S=gmGenreStats().slice(0,5), max=Math.max(1,...S.map(s=>s.n));
  const el=document.getElementById("gm-genre");
  /* タップするとそのジャンルの評価ランキングへ */
  el.onclick=e=>{ const r=e.target.closest(".gm-genre[data-g]"); if(r) gmSelectTab(r.dataset.g, true); };
  el.innerHTML=S.map(s=>`
    <div class="gm-genre"${s.rn?` data-g="${escHtml(s.g)}" role="button" tabindex="0"`:""}>
      <span class="gm-genre-name">${escHtml(s.g)}</span>
      <span class="gm-genre-bar"><span style="width:${s.n/max*100}%"></span></span>
      <span class="gm-genre-n">${s.n}</span>
    </div>`).join("");
}

/* 全国タイル（グルメ版）：都道府県ごとの軒数 */
function gmRenderNation(){
  const prefs=Object.keys(GM.byPref).length, munis=Object.keys(GM.byCode).length;
  document.getElementById("kk-nation-stats").innerHTML=`
    <div class="stat-chip">お店 <strong>${nf(GM.list.length)}</strong> 軒</div>
    <div class="stat-chip">都道府県 <strong>${prefs}</strong> / ${KK_PREFS.length}</div>
    <div class="stat-chip">市区町村 <strong>${munis}</strong></div>`;
  document.getElementById("kk-nation").innerHTML=KK_REGIONS.map(([rg,a,b])=>`
    <div class="kk-region">
      <div class="kk-region-name">${rg}</div>
      <div class="kk-tiles">${KK_PREFS.slice(a,b).map(([p])=>{
        const n=(GM.byPref[p]||[]).length, l=kkByLv(gmPrefBucket(n));
        return `<button type="button" class="kk-tile${p===KK.pref?" active":""}" data-pref="${p}" aria-label="${p}：${n}軒">
          <span class="kk-sw" style="background:${l.color}"></span><span class="kk-tile-name">${p}</span><span class="kk-tile-n">${n?n+"軒":"-"}</span>
        </button>`; }).join("")}</div>
    </div>`).join("")
    + `<div class="kk-legend gm-pref-legend" aria-hidden="true">${[[1,"1〜4軒"],[2,"5〜19軒"],[3,"20〜49軒"],[4,"50軒〜"]].map(([lv,t])=>
        `<span class="kk-leg static"><span class="kk-sw" style="background:${kkByLv(lv).color}"></span>${t}</span>`).join("")}</div>`;
  document.querySelectorAll(".kk-tile").forEach(b=>b.onclick=()=>{
    kkShowPref(b.dataset.pref);
    const a=document.getElementById("kk-pref-anchor"), nav=document.querySelector("nav");
    window.scrollTo({ top:Math.max(0, window.scrollY+a.getBoundingClientRect().top-(nav?nav.offsetHeight:0)-8), behavior:prefersReduced()?"auto":"smooth" });
  });
  const noteEl=document.getElementById("kk-note");
  noteEl.hidden=!GM.note; noteEl.textContent=GM.note||"";
}

/* 市区町村をタップしたとき：その町で食べたお店の一覧 */
function gmRenderInfo(code, f){
  const L=(GM.byCode[code]||[]).slice().sort((a,b)=>(b.my||0)-(a.my||0) || (b.ym||0)-(a.ym||0));
  const l=kkByLv(gmBucket(L.length));
  document.getElementById("kk-info").innerHTML=`
    <div class="kk-info-head">
      <span class="kk-info-name">${escHtml(f.name)}</span>
      <span class="kk-badge" style="--c:${l.color}">${L.length}軒</span>
    </div>
    ${L.length ? gmShopList(L.slice(0,10)) + (L.length>10?`<details class="gm-more"><summary>残り ${L.length-10} 軒を見る</summary>${gmShopList(L.slice(10))}</details>`:"") : `<p class="kk-info-empty">まだこの町のお店の記録はありません。</p>`}`;
}
function gmShopList(L){
  return `<ul class="gm-shops">${L.map(r=>`
      <li>
        <div class="gm-shop-top">
          <span>${escHtml(r.name)}</span>
          ${r.my!=null?`<span class="gm-my">${gmScore(r.my)}</span>`:""}
        </div>
        <div class="gm-shop-sub">${escHtml([r.genres.slice(0,2).join("・"), gmFmtDate(r)].filter(Boolean).join("／"))}</div>
      </li>`).join("")}</ul>`;
}

/* =====================================================================
   自転車
   列 : No / 日付 / 曜日 / 行き先 / 距離 / 累計（累計はサイト側で計算し直します）
   ===================================================================== */
const URL_BIKE = "https://docs.google.com/spreadsheets/d/e/2PACX-1vS5OcNhfxyK5x1xC4LOilrV-JQNIWHgmywi7kBWrOnOKubY_PApnTDUlVuNZA7h9qcKNjMP06Z4LlF0/pub?gid=1988798954&single=true&output=csv";
const BK={ list:[] };

async function loadBike(){
  let rows=[];
  try{ rows=cleanRows((await fetchCSV(URL_BIKE)).data); }
  catch(e){ document.getElementById("bk-hero").innerHTML=errBox("自転車のデータを読み込めませんでした。"); return; }
  BK.list=rows.map(o=>{
    const dt=pd(F(o,"日付")), km=num(F(o,"距離"));
    if(!dt||!km) return null;
    return { dt, km, dest:F(o,"行き先") };
  }).filter(Boolean).sort((a,b)=>a.dt-b.dt);
  BK.list.forEach((r,i)=>r.no=i+1);
  if(!BK.list.length){ document.getElementById("bk-hero").innerHTML=errBox("まだ記録がありません。"); return; }
  bkRenderHero(); bkRenderRank(); bkRenderYears();
}
const bkDate=d=>`${d.getFullYear()}/${fmtMD(d)}`;

function bkRenderHero(){
  const L=BK.list, km=L.reduce((a,r)=>a+r.km,0);
  const latest=L[L.length-1], best=L.reduce((b,r)=>(!b||r.km>b.km)?r:b,null);
  const rank=L.slice().sort((a,b)=>b.km-a.km).indexOf(latest)+1;
  const y=new Date().getFullYear(), yKm=L.filter(r=>r.dt.getFullYear()===y).reduce((a,r)=>a+r.km,0);
  document.getElementById("bk-hero").innerHTML=`
    <div class="tm-hero-label">これまでの累計距離</div>
    <div class="tm-big">${nf(km)}<small>km</small></div>
    <div class="run-headline${rank===1&&L.length>1?" pb":""}">${rank===1&&L.length>1
      ? `最新ライド（${fmtMD(latest.dt)}・${escHtml(latest.dest)}）で最長記録！`
      : `最新ライド：${escHtml(latest.dest)} ${latest.km.toFixed(2)}km（${bkDate(latest.dt)}）`}</div>
    <div class="hero-meta">
      <span class="hero-chip">${L.length} 回</span>
      <span class="hero-chip">${y}年 <strong>${yKm.toFixed(1)}</strong> km</span>
      <span class="hero-chip">1回平均 <strong>${(km/L.length).toFixed(1)}</strong> km</span>
      <span class="hero-chip accent">最長 <strong>${best.km.toFixed(1)}</strong> km</span>
    </div>`;
}

function bkRenderRank(){
  const L=BK.list.slice().sort((a,b)=>b.km-a.km).slice(0,10), latest=BK.list[BK.list.length-1];
  const medal=["🥇","🥈","🥉"];
  document.getElementById("bk-rank").innerHTML=L.map((r,i)=>`
    <div class="rk${i<3?" top top"+(i+1):""}">
      <div class="rk-pos">${i<3?`<span class="rk-medal" aria-label="${i+1}位">${medal[i]}</span>`:i+1}</div>
      <div class="rk-body">
        <div class="rk-date">${escHtml(r.dest||"（行き先なし）")}${r===latest?'<span class="rk-new">NEW</span>':""}</div>
        <dl class="rk-grid">
          <div class="rk-cell hl"><dt>距離</dt><dd>${r.km.toFixed(2)}<small>km</small></dd></div>
          <div class="rk-cell"><dt>日付</dt><dd>${bkDate(r.dt)}</dd></div>
        </dl>
      </div>
    </div>`).join("");
}

function bkRenderYears(){
  const m={};
  BK.list.forEach(r=>{ const y=r.dt.getFullYear(); const s=(m[y]=m[y]||{y,km:0,n:0}); s.km+=r.km; s.n++; });
  const Y=Object.values(m).sort((a,b)=>b.y-a.y), max=Math.max(...Y.map(s=>s.km));
  document.getElementById("bk-years").innerHTML=Y.map(s=>`
    <div class="mlist-row static">
      <span class="mlist-name"><span class="mlist-m">${s.y}年</span>${s.km===max&&Y.length>1?'<em>ベスト</em>':""}</span>
      <span class="mlist-bar bk"><span style="width:${s.km/max*100}%"></span></span>
      <span class="mlist-val">${s.km.toFixed(1)} km<small>${s.n}回</small></span>
    </div>`).join("");
}

/* =====================================================================
   栄冠ナイン
   スプレッドシートの5シート（試合ログ／イニングスコア／スタメン／選手成績／卒業生）を読み込みます。
   どのURLがどのシートかは、1行目の見出しから自動で判定するので、順番は気にしなくてOK。
   ===================================================================== */
const URL_EIKAN = [
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vQS4iBoUmfbNovsRGs-ynY9WyQZKBMivhCTVklD7MdmUFVZ2Y4O4AalW_wwXtddE6tkBFhxDwO8qMzn/pub?gid=773705402&single=true&output=csv",
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vQS4iBoUmfbNovsRGs-ynY9WyQZKBMivhCTVklD7MdmUFVZ2Y4O4AalW_wwXtddE6tkBFhxDwO8qMzn/pub?gid=2012687169&single=true&output=csv",
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vQS4iBoUmfbNovsRGs-ynY9WyQZKBMivhCTVklD7MdmUFVZ2Y4O4AalW_wwXtddE6tkBFhxDwO8qMzn/pub?gid=397796211&single=true&output=csv",
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vQS4iBoUmfbNovsRGs-ynY9WyQZKBMivhCTVklD7MdmUFVZ2Y4O4AalW_wwXtddE6tkBFhxDwO8qMzn/pub?gid=667454139&single=true&output=csv",
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vQS4iBoUmfbNovsRGs-ynY9WyQZKBMivhCTVklD7MdmUFVZ2Y4O4AalW_wwXtddE6tkBFhxDwO8qMzn/pub?gid=1031304553&single=true&output=csv",  // 選手成績
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vQS4iBoUmfbNovsRGs-ynY9WyQZKBMivhCTVklD7MdmUFVZ2Y4O4AalW_wwXtddE6tkBFhxDwO8qMzn/pub?gid=130539493&single=true&output=csv"    // 能力
].filter(Boolean);
const ES_SCHOOL = "東洋大姫路";   // 自校名（ページの見出しに使います）
const ES_BAT_MIN = 40;           // 打者ランキングの規定打席（打数＋四死球＋犠打）
const ES_PIT_IP_MIN = 50;        // 投手ランキングの規定投球回（投球回が空欄の選手は登板・試合10以上で判定）

const ES_TAIKAI = [
  {k:"夏の都道府県大会", s:"夏・県"}, {k:"夏の甲子園", s:"夏・甲子園"},
  {k:"秋の都道府県大会", s:"秋・県"}, {k:"秋の地区大会", s:"秋・地区"},
  {k:"神宮大会", s:"神宮"}, {k:"春の甲子園", s:"春・甲子園"}
];
const ES_B9_SLOTS = ["投","捕","一","二","三","遊","外","外","外"];
const ES = { games:[], inn:{}, lineup:[], grads:[], years:[], sel:null, b9:"star", team:"", rk:"star", lineupSeason:"夏", oppPref:"", draftTeam:"", decade:null, pane:"year" };

/* 全角数字→半角、"－" などは空扱い */
const esHalf = s => String(s==null?"":s).replace(/[０-９]/g, c=>String.fromCharCode(c.charCodeAt(0)-0xFEE0));
function esNum(s){ const t=esHalf(s).replace(/[，,]/g,".").replace(/[^\d.\-]/g,""); if(t===""||t==="-"||t==="."||/^-?\.?$/.test(t)) return null; const n=Number(t); return isFinite(n)?n:null; }
function esInt(s){ const t=esHalf(s).replace(/[,，\s]/g,""); if(!/^-?\d+(\.\d+)?$/.test(t)) return null; return Number(t); }
const esYear = s => { const m=esHalf(s).match(/(\d{4})/); return m?+m[1]:null; };
const esMark = s => /[〇○◯●✓✔1]/.test(String(s||""));
function esIP(s){ const t=esHalf(s).trim(); if(!t) return null; const m=t.match(/^(\d+)(?:\.(\d))?$/); if(!m) return esNum(t); return +m[1] + (m[2]?(+m[2])/3:0); }
const esIPfmt = v => { const w=Math.floor(v+1e-9), f=Math.round((v-w)*3); return f?`${w}.${f}`:`${w}`; };
const esAvgFmt = v => v.toFixed(3).replace(/^0/,"");

/* 見出しからシートの種類を判定 */
function esKind(fields){
  const has = k => fields.includes(k);
  if(has("打順")) return "lineup";
  if(has("試合No") && (has("打数") || has("投球回"))) return "box";
  if(has("試合No") && (has("1") || has("R"))) return "inn";
  if(has("相手校") && has("得点")) return "games";
  if(has("時点") && has("名前")) return "abil";
  if(has("卒業時★") || (has("入学年度") && has("名前"))) return "grads";
  return null;
}

async function loadEikan(){
  const hero=document.getElementById("es-hero");
  const res=await Promise.allSettled(URL_EIKAN.map(u=>fetchCSV(u)));
  const got={};
  res.forEach(r=>{
    if(r.status!=="fulfilled") return;
    const fields=(r.value.meta.fields||[]).map(k=>String(k).replace(/^﻿/,"").replace(/\s+/g,"").trim());
    const kind=esKind(fields);
    if(kind && !got[kind]) got[kind]=cleanRows(r.value.data);
  });
  if(!got.games && !got.grads){ hero.innerHTML=errBox("栄冠ナインのデータを読み込めませんでした（シートの見出しを確認してください）。"); return; }

  /* 試合ログ */
  ES.games=(got.games||[]).map((o,i)=>{
    const year=esYear(F(o,"年度")), opp=F(o,"相手校"), rs=esInt(F(o,"得点")), ra=esInt(F(o,"失点"));
    if(!year || !opp || rs==null || ra==null) return null;
    let wl=F(o,"勝敗"); if(!/^[勝負分]$/.test(wl)) wl = rs>ra?"勝":rs<ra?"負":"分";
    return { no:esInt(F(o,"No"))||i+1, year, taikai:F(o,"大会"), round:esHalf(F(o,"回戦")), myPref:F(o,"自校都道府県"),
      side:F(o,"先攻後攻"), opp, oppPref:F(o,"相手都道府県"), power:F(o,"相手戦力").toUpperCase(), rs, ra, wl, note:F(o,"補足") };
  }).filter(Boolean).sort((a,b)=>a.no-b.no);

  /* イニングスコア */
  ES.inn={};
  (got.inn||[]).forEach(o=>{
    const no=esInt(F(o,"試合No")); if(!no) return;
    const inns=[]; for(let k=1;k<=15;k++) inns.push(F(o,String(k)));
    if(inns.every(v=>v==="") && !F(o,"R") && !F(o,"H") && !F(o,"E")) return;   // 試合No・先攻後攻だけ自動で並んだ未入力の行
    (ES.inn[no]=ES.inn[no]||[]).push({ side:F(o,"先攻後攻"), team:F(o,"高校名"), inns, R:F(o,"R"), H:F(o,"H"), E:F(o,"E") });
  });

  /* 選手成績（1試合×1選手） */
  ES.box=(got.box||[]).map(o=>{
    const no=esInt(F(o,"試合No")), name=F(o,"名前"); if(!no||!name) return null;
    const dec=F(o,"決定")||F(o,"勝敗");
    return { no, name, ab:esInt(F(o,"打数")), r:esInt(F(o,"得点")), h:esInt(F(o,"安打")), d2:esInt(F(o,"二塁打")), d3:esInt(F(o,"三塁打")), hr:esInt(F(o,"本塁打")), rbi:esInt(F(o,"打点")),
      so:esInt(F(o,"三振")), bb:esInt(F(o,"四死球")), sh:esInt(F(o,"犠打")), sb:esInt(F(o,"盗塁")), dp:esInt(F(o,"併殺")), e:esInt(F(o,"失策")),
      ip:esIP(F(o,"投球回")), np:esInt(F(o,"球数")), bf:esInt(F(o,"打者")), ha:esInt(F(o,"被安打")), k:esInt(F(o,"奪三振")), pbb:esInt(F(o,"与四死球")),
      pr:esInt(F(o,"失点")), er:esInt(F(o,"自責点")), wp:esInt(F(o,"暴投")), hra:esInt(F(o,"被本塁打")),
      dec: /^(勝|敗)$/.test(dec) ? dec : /^(S|Ｓ|セーブ)$/.test(dec) ? "S" : /^(H|Ｈ|ホールド)$/.test(dec) ? "H" : "" };
  }).filter(b=>b && (b.ab!=null || b.ip!=null));   // 数字が何も入っていない行（出場なし）は無視

  /* スタメン */
  ES.lineup=(got.lineup||[]).map(o=>{
    const year=esYear(F(o,"年度")), name=F(o,"名前"); if(!year||!name) return null;
    return { year, season:F(o,"時期")||"夏", order:esHalf(F(o,"打順")), name, grade:esHalf(F(o,"学年")), num:esHalf(F(o,"背番号")), pos:F(o,"守備"),
      games:esInt(F(o,"試合")), avg:esNum(F(o,"打率")), hr:esInt(F(o,"本塁打")), rbi:esInt(F(o,"打点")), sb:esInt(F(o,"盗塁")),
      app:esInt(F(o,"登板")), gs:esInt(F(o,"先発")), w:esInt(F(o,"勝")), l:esInt(F(o,"敗")), sv:esInt(F(o,"セーブ")),
      cg:esInt(F(o,"完投")), sho:esInt(F(o,"完封")), nh:esInt(F(o,"ノーノー")), ip:esIP(F(o,"投球回")), k:esInt(F(o,"奪三振")),
      bb:esInt(F(o,"与四死球")), era:esNum(F(o,"防御率")) };
  }).filter(Boolean);

  /* 卒業生 */
  ES.grads=(got.grads||[]).map(o=>{
    const name=F(o,"名前"); if(!name) return null;
    const g={ name, year:esYear(F(o,"入学年度")), from:F(o,"出身"), scout:esMark(F(o,"スカウト")), tensei:esMark(F(o,"転生")), transfer:esMark(F(o,"転校生")),
      pos0:F(o,"入学時守備"), star0:esInt(F(o,"入学時★")), pos:F(o,"卒業時守備")||F(o,"入学時守備"), star:esInt(F(o,"卒業時★")),
      games:esInt(F(o,"試合")), avg:esNum(F(o,"打率")), hr:esInt(F(o,"本塁打")), rbi:esInt(F(o,"打点")), sb:esInt(F(o,"盗塁")),
      app:esInt(F(o,"登板")), gs:esInt(F(o,"先発")), w:esInt(F(o,"勝")), l:esInt(F(o,"敗")), sv:esInt(F(o,"セーブ")),
      cg:esInt(F(o,"完投")), sho:esInt(F(o,"完封")), nh:esInt(F(o,"ノーノー")), ip:esIP(F(o,"投球回")), k:esInt(F(o,"奪三振")),
      bb:esInt(F(o,"与四死球")), era:esNum(F(o,"防御率")),
      course:F(o,"進路"), team:F(o,"球団").replace(/^[-－ー]$/,""), rank:esHalf(F(o,"順位")).replace(/^[-－ー]$/,""),
      /* 卒業時の能力 */
      kana:F(o,"よみがな"), birth:F(o,"誕生日"), chara:F(o,"性格"), th:F(o,"投"), bt:F(o,"打") };
    if(g.avg!=null && g.avg>1) g.avg=null;               // 打率の入力ミス（2.810 など）は除外
    g.grow = (g.star!=null && g.star0!=null) ? g.star-g.star0 : null;
    g.pro = g.course==="プロ野球選手" || !!g.team;
    return g;
  }).filter(Boolean);

  /* 能力（入学時・卒業時）：名前＋入学年度で卒業生につなぐ。ランキング等は卒業時（なければ入学時）の値を使う */
  ES.abilLoaded = !!got.abil;
  (got.abil||[]).forEach(o=>{
    const name=F(o,"名前"), when=F(o,"時点"); if(!name || !/^(入学時|卒業時)$/.test(when)) return;
    const yr=esYear(F(o,"入学年度"));
    const g=ES.grads.find(x=>x.name===name && (yr==null || x.year===yr)) || ES.grads.find(x=>x.name===name);
    if(!g) return;
    const a=esParseAbil(o);
    /* 利き腕（投げ・打ち）は能力シートの時点ごと。空欄なら卒業生シートの値を使う */
    const th=F(o,"投げ"), bt=F(o,"打ち"), ch=F(o,"性格"); if(th) a.th=th; if(bt) a.bt=bt; if(ch) a.chara=ch;
    (g.ab=g.ab||{})[when]=a;
  });
  const esMainPos = p => /^[左中右]$/.test(p) ? "外" : p;
  ES.grads.forEach(g=>{
    Object.values(g.ab||{}).forEach(a=>{ a.fld = a.def ? (a.def[esMainPos(g.pos)] ?? null) : null; });
    if(g.ab) Object.assign(g, g.ab["卒業時"]||g.ab["入学時"]);
  });
  ES.gameByNo={}; ES.games.forEach(g=>{ ES.gameByNo[g.no]=g; g.season = /^夏/.test(g.taikai) ? "夏" : "秋春"; });
  /* 1人で投げ切った試合は、勝敗が空欄なら試合の結果から勝ち／負けを付ける */
  ES.box.forEach(b=>{
    if(b.ip==null || b.dec) return;
    const gm=ES.gameByNo[b.no]; if(!gm) return;
    if(ES.box.filter(x=>x.no===b.no && x.ip!=null).length===1) b.dec = gm.wl==="勝"?"勝":gm.wl==="負"?"敗":"";
  });
  esBuildMvp();
  /* 卒業生の成績が空欄なら、選手成績シートから自動計算する */
  ES.grads.forEach(g=>{ esFillFromBox(g); esGradDerived(g); });
  esBuildYears();
  esInitSubnav();
  esRenderHero(); esRenderYears(); esInitYearSel(); esRenderB9Tabs(); esRenderB9();
  esRenderRoster(); esRenderRkTabs(); esRenderRk(); esRenderRecords(); esRenderRivals(); esRenderDraft();
}

/* ---------- 集計 ---------- */
/* 大会ごとの成績の呼び方。秋の県大会・地区大会はゲーム上2試合なので、2回戦が決勝扱い */
const ES_FINAL = { "秋の都道府県大会":"2回戦", "秋の地区大会":"2回戦" };
const ES_LOSS = {
  "秋の都道府県大会": {"1回戦":"ベスト4", "2回戦":"準優勝"},
  "秋の地区大会":     {"1回戦":"ベスト4", "2回戦":"準優勝"},
  "神宮大会":         {"1回戦":"ベスト8", "2回戦":"ベスト8"},
  "春の甲子園":       {"1回戦":"ベスト32", "2回戦":"ベスト16"},
  "夏の甲子園":       {"1回戦":"1回戦敗退", "2回戦":"ベスト32", "3回戦":"ベスト16"}
};
function esResult(games, taikai){
  if(!games.length) return "";
  const last=games[games.length-1], r=last.round.replace(/\s/g,"");
  const fin=ES_FINAL[taikai]||"決勝";
  if(last.wl==="勝") return r===fin ? "優勝" : "勝ち上がり中";
  if(r===fin) return "準優勝";
  const m=ES_LOSS[taikai]||{};
  if(m[r]) return m[r];
  if(r==="準決勝") return "ベスト4";
  if(r==="準々決勝") return "ベスト8";
  return `${r}敗退`;
}
function esBuildYears(){
  const m={};
  ES.games.forEach(g=>{ (m[g.year]=m[g.year]||[]).push(g); });
  ES.lineup.forEach(l=>{ m[l.year]=m[l.year]||[]; });
  ES.years=Object.keys(m).map(Number).sort((a,b)=>b-a).map(y=>{
    const G=m[y], res={};
    ES_TAIKAI.forEach(t=>{ res[t.k]=esResult(G.filter(g=>g.taikai===t.k), t.k); });
    const w=G.filter(g=>g.wl==="勝").length, l=G.filter(g=>g.wl==="負").length;
    const pref=(G.find(g=>g.myPref)||{}).myPref||"";
    return { y, games:G, res, w, l, pref, rs:G.reduce((a,g)=>a+g.rs,0), ra:G.reduce((a,g)=>a+g.ra,0) };
  });
}
function esStreaks(){
  let cur=0, best={n:0}, run=[];
  ES.games.forEach(g=>{
    if(g.wl==="勝"){ cur++; run.push(g); if(cur>best.n) best={n:cur, from:run[0], to:g, stop:null}; }
    else { if(best.to && best.to===run[run.length-1] && !best.stop) best.stop=g; cur=0; run=[]; }
  });
  return { best, cur };
}
const esBadgeCls = r => r==="優勝"?"v" : r==="準優勝"?"s" : r==="ベスト4"?"b4" : r==="勝ち上がり中"?"live" : "";
const esGameLbl = g => `${g.year}年度 ${g.taikai} ${g.round}`;

/* ---------- ヒーロー ---------- */
function esRenderHero(){
  const G=ES.games, w=G.filter(g=>g.wl==="勝").length, l=G.filter(g=>g.wl==="負").length, d=G.length-w-l;
  const cnt=k=>ES.years.filter(y=>y.res[k]==="優勝").length;
  const st=esStreaks(), pro=ES.grads.filter(g=>g.pro).length;
  const rs=G.reduce((a,g)=>a+g.rs,0), ra=G.reduce((a,g)=>a+g.ra,0);
  document.getElementById("es-hero").innerHTML=`
    <div class="tm-hero-label">${escHtml(ES_SCHOOL)}　通算成績</div>
    <div class="tm-big es-big">${nf(w)}<small>勝</small>${nf(l)}<small>敗</small>${d?`${d}<small>分</small>`:""}</div>
    <div class="gm-hero-sub">${G.length}試合・勝率 ${w+l?esAvgFmt(w/(w+l)):"-"}・総得点 ${nf(rs)}／総失点 ${nf(ra)}</div>
    <div class="hero-meta">
      <span class="hero-chip es-gold">夏の甲子園優勝 <strong>${cnt("夏の甲子園")}</strong> 回</span>
      <span class="hero-chip es-gold">春の甲子園優勝 <strong>${cnt("春の甲子園")}</strong> 回</span>
      <span class="hero-chip">神宮大会優勝 <strong>${cnt("神宮大会")}</strong> 回</span>
      <span class="hero-chip accent">最長 <strong>${st.best.n}</strong> 連勝</span>
      ${st.cur>1?`<span class="hero-chip">現在 <strong>${st.cur}</strong> 連勝中</span>`:""}
      ${pro?`<span class="hero-chip">プロ入り <strong>${pro}</strong> 人</span>`:""}
    </div>`;
}

/* ---------- 表示の切り替え（年度／選手／記録・対戦校） ---------- */
function esInitSubnav(){
  const tabs=document.querySelectorAll("#es-subnav .day-tab");
  tabs.forEach(b=>b.onclick=()=>{
    ES.pane=b.dataset.pane;
    tabs.forEach(x=>{ const on=x===b; x.classList.toggle("active", on); x.setAttribute("aria-selected", on?"true":"false"); });
    document.querySelectorAll("#eikan .es-pane").forEach(p=>p.hidden = p.dataset.pane!==ES.pane);
  });
}

/* ---------- 年度別成績（年代ごとに表示） ---------- */
function esRenderYears(){
  const el=document.getElementById("es-years");
  if(!ES.years.length){ el.innerHTML=errBox("まだ試合の記録がありません。"); return; }
  const decades=[...new Set(ES.years.map(Y=>Math.floor(Y.y/10)*10))].sort((a,b)=>b-a);
  if(ES.decade==null || !decades.includes(ES.decade)) ES.decade=decades[0];
  const D=ES.years.filter(Y=>Math.floor(Y.y/10)*10===ES.decade);
  const v=D.reduce((a,Y)=>a+ES_TAIKAI.filter(t=>Y.res[t.k]==="優勝").length,0);
  el.innerHTML=`
    ${decades.length>1?`<div class="day-tabs es-decs" id="es-dec">${decades.map(d=>{
      const n=ES.years.filter(Y=>Math.floor(Y.y/10)*10===d).length;
      return `<button type="button" class="day-tab${d===ES.decade?" active":""}" data-d="${d}">${d}年代<span class="tab-sub">${n}</span></button>`; }).join("")}</div>`:""}
    <div class="es-tbl-wrap"><table class="es-tbl">
    <thead><tr><th class="es-sticky">年度</th>${ES_TAIKAI.map(t=>`<th>${t.s}</th>`).join("")}<th>勝敗</th></tr></thead>
    <tbody>${D.map(Y=>`
      <tr data-y="${Y.y}" tabindex="0" aria-label="${Y.y}年度の記録を見る"${Y.y===ES.sel?' class="on"':""}>
        <th class="es-sticky"><span class="es-y">${Y.y}</span><span class="es-pref">${escHtml(Y.pref)}</span></th>
        ${ES_TAIKAI.map(t=>{ const r=Y.res[t.k]; return `<td>${r?`<span class="es-res ${esBadgeCls(r)}">${escHtml(r)}</span>`:`<span class="es-none">－</span>`}</td>`; }).join("")}
        <td class="es-wl">${Y.w}-${Y.l}</td>
      </tr>`).join("")}</tbody></table></div>
    <p class="kk-note-s">${ES.decade}年代：${D.length}年度・優勝 ${v} 回。年度をタップすると下に詳しい記録が出ます</p>`;
  el.querySelectorAll("#es-dec .day-tab").forEach(b=>b.onclick=()=>{ ES.decade=+b.dataset.d; esRenderYears(); });
  el.querySelectorAll("tbody tr").forEach(tr=>{
    const go=()=>{ esShowYear(+tr.dataset.y);
      const a=document.getElementById("es-year-anchor"), nav=document.querySelector("nav");
      window.scrollTo({ top:Math.max(0, window.scrollY+a.getBoundingClientRect().top-(nav?nav.offsetHeight:0)-8), behavior:prefersReduced()?"auto":"smooth" }); };
    tr.addEventListener("click", go);
    tr.addEventListener("keydown", e=>{ if(e.key==="Enter"||e.key===" "){ e.preventDefault(); go(); } });
  });
}

/* ---------- 年度の記録 ---------- */
function esInitYearSel(){
  const sel=document.getElementById("es-year-sel");
  sel.parentElement.hidden = !ES.years.length;   // 試合がないときは空の選択欄を出さない
  if(!ES.years.length){ sel.innerHTML=""; document.getElementById("es-year").innerHTML=errBox("まだ記録がありません。"); return; }
  sel.innerHTML=ES.years.map(Y=>`<option value="${Y.y}">${Y.y}年度${Y.pref?`（${escHtml(Y.pref)}）`:""}</option>`).join("");
  sel.onchange=()=>esShowYear(+sel.value);
  esShowYear(ES.years[0].y);
}
function esShowYear(y){
  ES.sel=y;
  document.getElementById("es-year-sel").value=String(y);
  const dec=Math.floor(y/10)*10;
  if(ES.decade!=null && dec!==ES.decade){ ES.decade=dec; esRenderYears(); }
  document.querySelectorAll(".es-tbl tbody tr").forEach(tr=>tr.classList.toggle("on", +tr.dataset.y===y));
  const Y=ES.years.find(v=>v.y===y); if(!Y) return;
  const groups=ES_TAIKAI.map(t=>({t, G:Y.games.filter(g=>g.taikai===t.k)})).filter(x=>x.G.length);
  const other=Y.games.filter(g=>!ES_TAIKAI.some(t=>t.k===g.taikai));
  if(other.length) groups.push({t:{k:"その他", s:"その他"}, G:other});
  const seasons=["夏","秋春"].filter(s=>ES.lineup.some(l=>l.year===y && l.season===s));
  if(!seasons.includes(ES.lineupSeason)) ES.lineupSeason=seasons[0]||"夏";
  document.getElementById("es-year").innerHTML=`
    <div class="stats-row">
      <div class="stat-chip"><strong>${Y.w}</strong> 勝 <strong>${Y.l}</strong> 敗</div>
      <div class="stat-chip">得点 <strong>${Y.rs}</strong>／失点 <strong>${Y.ra}</strong></div>
      ${Y.pref?`<div class="stat-chip">${escHtml(Y.pref)}代表</div>`:""}
    </div>
    <div class="es-fold">
    ${groups.length?groups.map(({t,G})=>{ const r=esResult(G, t.k), w=G.filter(g=>g.wl==="勝").length, l=G.filter(g=>g.wl==="負").length; return `
      <details class="es-tk">
        <summary class="es-tk-head"><span class="es-tk-name">${escHtml(t.k)}</span><span class="es-tk-wl">${w}勝${l}敗</span>${r?`<span class="es-res ${esBadgeCls(r)}">${escHtml(r)}</span>`:""}</summary>
        <div class="es-tk-body">${G.map(esGameHtml).join("")}</div>
      </details>`; }).join(""):errBox("この年度の試合はまだありません。")}
      <details class="es-tk">
        <summary class="es-tk-head"><span class="es-tk-name">スタメン</span><span class="es-tk-wl">${seasons.length?seasons.map(s=>s==="夏"?"夏":"秋・春").join("／"):"記録なし"}</span></summary>
        <div class="es-tk-body">
        ${seasons.length?`<div class="day-tabs" id="es-lu-tabs">${seasons.map(s=>`<button type="button" class="day-tab${s===ES.lineupSeason?" active":""}" data-s="${s}">${s==="夏"?"夏":"秋・春"}</button>`).join("")}</div>
          <div id="es-lu"></div>`:`<p class="kk-info-empty">この年度のスタメンはまだありません。</p>`}
        </div>
      </details>
    </div>`;
  document.querySelectorAll("#es-lu-tabs .day-tab").forEach(b=>b.onclick=()=>{
    ES.lineupSeason=b.dataset.s;
    document.querySelectorAll("#es-lu-tabs .day-tab").forEach(x=>x.classList.toggle("active", x===b));
    esRenderLineup();
  });
  if(seasons.length) esRenderLineup();
}
/* ---------- 試合のMVP（打撃・投手それぞれ1人。勝っても負けても選手成績から自動で選ぶ） ---------- */
/*
  評価のしかた
  打撃：①打席の中身を「得点の価値」で数える（単打0.47・二塁打0.78・三塁打1.09・本塁打1.40・四死球0.33点、凡打は−0.27点、
          併殺・三振・失策は追加でマイナス、盗塁＋0.2）
        ②チームの得点のうち、自分が絡んだ割合（打点は6割・ホームインは4割の手柄）を加点。1−0の決勝打は大きく、大差の試合の1打点は小さい
        ③2点差以内の接戦なら②を1.5倍
  投手：①平均的な投手ならこの回数で何点取られるか（全試合の失点率から計算）と比べて、何点防いだか
        ②奪三振を少し加点
        ③接戦（2点差以内）で勝ち投手・セーブなら加点、完投も少し加点
*/
/* その試合の先発投手：スタメンで投手として入っている選手（打順あり、またはDHの「投」）。いなければ最初に入力した投手 */
function esStarterOf(no){
  const P=ES.box.filter(b=>b.no===no && b.ip!=null); if(!P.length) return null;
  const gm=ES.gameByNo[no];
  const L=gm ? ES.lineup.filter(l=>l.year===gm.year && l.season===gm.season && l.pos==="投" && (/^\d+$/.test(l.order)||l.order==="投")) : [];
  return P.find(b=>L.some(l=>esSameName(l.name,b.name))) || P[0];
}
function esGameMargin(no){ const g=ES.gameByNo[no]; return g ? Math.abs(g.rs-g.ra) : 99; }
function esBatScore(b){
  if(b.ab==null) return -Infinity;
  const n=k=>b[k]||0, single=Math.max(0, n("h")-n("d2")-n("d3")-n("hr")), outs=Math.max(0, n("ab")-n("h"));
  const lw = 0.47*single + 0.78*n("d2") + 1.09*n("d3") + 1.40*n("hr") + 0.33*n("bb") + 0.2*n("sb") + 0.05*n("sh")
           - 0.27*outs - 0.37*n("dp") - 0.05*n("so") - 0.5*n("e");
  const gm=ES.gameByNo[b.no], team=gm ? gm.rs : 0;
  /* 得点への関与：打点は6割、ホームインは4割の手柄として数える（本塁打は自分で還るので打点＋得点で1点ぶん） */
  const share = team>0 ? Math.min(1, (0.6*n("rbi") + 0.4*Math.max(n("r"), n("hr")))/team) : 0;
  return lw + share*2*(esGameMargin(b.no)<=2 ? 1.5 : 1);
}
function esRaPerOut(){
  if(ES._raOut!=null) return ES._raOut;
  let o=0, r=0; ES.box.forEach(b=>{ if(b.ip==null) return; o+=Math.round(b.ip*3); r+= b.pr!=null?b.pr:(b.er||0); });
  return ES._raOut = o>0 ? r/o : 4/27;
}
function esPitScore(b, nP){
  if(b.ip==null) return -Infinity;
  const outs=Math.round(b.ip*3), ra=b.pr!=null?b.pr:(b.er||0), close=esGameMargin(b.no)<=2;
  const saved = outs*esRaPerOut() - ra;
  return saved + 0.08*(b.k||0) + ((b.dec==="勝"||b.dec==="S") ? (close?1:0.3) : b.dec==="H" ? (close?0.7:0.2) : 0) + (nP===1?0.5:0);
}
function esBuildMvp(){
  ES.mvp={}; ES._raOut=null;
  const by={}; ES.box.forEach(b=>(by[b.no]=by[b.no]||[]).push(b));
  Object.keys(by).forEach(no=>{
    const B=by[no], nP=B.filter(b=>b.ip!=null).length;
    const top=f=>{ let best=null, bs=-Infinity; B.forEach(b=>{ const v=f(b); if(v>bs){ bs=v; best=b; } }); return {best, bs}; };
    const bt=top(esBatScore), pt=top(b=>esPitScore(b,nP));
    ES.mvp[no]={ bat: bt.best && bt.bs>0 && (bt.best.h||bt.best.rbi||bt.best.bb) ? bt.best : null, pit: pt.best && pt.bs>-Infinity ? pt.best : null };
  });
}
const esIsMvp = (b, kind) => !!(ES.mvp && ES.mvp[b.no] && ES.mvp[b.no][kind]===b);
function esMvpDesc(b, kind){
  const P=[];
  if(kind==="pit"){
    const nP=ES.box.filter(x=>x.no===b.no && x.ip!=null).length, ra=b.pr!=null?b.pr:b.er;
    P.push(`${esIPfmt(b.ip)}回`); if(b.k) P.push(`${b.k}奪三振`); if(ra!=null) P.push(`${ra}失点`);
    if(nP===1) P.push(ra===0?"完封":"完投");
    if(b.dec) P.push(b.dec==="勝"?"勝利":b.dec==="敗"?"敗戦":b.dec==="H"?"ホールド":"セーブ");
  } else {
    P.push(`${b.ab}打数${b.h||0}安打`); if(b.hr) P.push(`${b.hr}本塁打`); if(b.d3) P.push(`三塁打${b.d3>1?b.d3:""}`); if(b.d2) P.push(`二塁打${b.d2>1?b.d2:""}`);
    if(b.rbi) P.push(`${b.rbi}打点`); if(b.sb) P.push(`${b.sb}盗塁`);
  }
  return P.join(" ");
}
/* MVPの見出し（新聞の見出し風のひとこと） */
function esMvpTitle(b, kind){
  const gm=ES.gameByNo[b.no], lost=gm && gm.wl==="負";
  if(kind==="pit"){
    const nP=ES.box.filter(x=>x.no===b.no && x.ip!=null).length, ra=b.pr!=null?b.pr:b.er, cg=nP===1;
    if(cg && b.ha===0) return "ノーヒットノーラン達成！";
    if(cg && ra===0) return `${b.ha!=null?b.ha+"安打":""}完封`;
    if((b.k||0)>=10) return lost ? `${b.k}奪三振も実らず` : `${b.k}奪三振の快投`;
    if(cg && b.ip>9) return `延長${Math.floor(b.ip)}回を一人で投げ抜く`;
    if(cg) return lost ? "最後まで一人で投げ抜いた" : "完投で勝利をつかむ";
    const ipT = (()=>{ const o=Math.round(b.ip*3), w=Math.floor(o/3), f=o%3; return `${w}回${f?`${f}/3`:""}`; })();
    const raT = ra==null ? "" : ra===0 ? "無失点" : `${ra}失点`;
    if(esStarterOf(b.no)===b){
      if(b.dec==="勝") return raT ? `先発${ipT}を${raT}で勝利` : `先発${ipT}で勝利`;
      if(lost) return "負けはしたが粘りの投球";
      return raT ? `先発${ipT}を${raT}` : `先発として${ipT}`;
    }
    if(b.dec==="S") return "最後を締めた守護神";
    if(b.dec==="H") return "リードを守ってつないだ";
    if(b.dec==="勝") return "流れを変えた好リリーフ";
    if(lost) return "負けはしたが粘りのリリーフ";
    return raT ? `${ipT}を${raT}の好救援` : `${ipT}の好救援`;
  }
  const h=b.h||0, hr=b.hr||0, d2=b.d2||0, d3=b.d3||0, single=h-d2-d3-hr;
  const pre = lost ? "意地の" : "";
  if(single>0 && d2>0 && d3>0 && hr>0) return "サイクルヒット達成！";
  if(hr>=2) return `1試合${hr}本のアーチ`;
  if(h>=4) return lost ? `意地の${h}安打` : `${h}安打の固め打ち`;
  if((b.rbi||0)>=4) return `${b.rbi}打点の大暴れ`;
  if(hr===1 && (b.rbi||0)>=2) return `${pre}一発含む${b.rbi}打点`;
  if(h===3) return `${pre}猛打賞`;
  if(hr===1) return lost ? "意地の一発" : "一発で流れを呼ぶ";
  if((b.sb||0)>=2) return "足でかき回す";
  if((b.rbi||0)>=2) return `${pre}${b.rbi}打点の勝負強さ`;
  if((b.bb||0)>=2) return "しぶとく出塁";
  if(h<=1) return lost ? "意地の一打" : "チームを勢いづける一打";
  return lost ? `意地の${h}安打` : `${h}安打の活躍`;
}
function esMvpHtml(no){
  const M=ES.mvp && ES.mvp[no]; if(!M || (!M.bat && !M.pit)) return "";
  const gm=ES.gameByNo[no];
  const one=(b,kind,lbl)=>{
    if(!b) return "";
    const l=gm && ES.lineup.find(x=>x.year===gm.year && x.season===gm.season && esSameName(x.name,b.name));
    const sub=l ? [l.grade?escHtml(l.grade)+"年":"", l.num?escHtml(esCircled(l.num)):""].filter(Boolean).join(" ") : "";
    return `<div class="es-mvp-row"><span class="es-mvp-b ${kind}">${lbl}</span>${l&&l.pos?`<span class="es-pos sm ${esPosCls(l.pos, kind==="pit"&&esStarterOf(b.no)!==b?"rp":"")}">${escHtml(l.pos)}</span>`:""}<b>${escHtml(b.name)}</b>${sub?`<small>${sub}</small>`:""}<span class="es-mvp-d"><b class="es-mvp-t">${escHtml(esMvpTitle(b,kind))}</b>${escHtml(esMvpDesc(b,kind))}</span></div>`;
  };
  return `<div class="es-mvp">${one(M.bat,"bat","打撃MVP")}${one(M.pit,"pit","投手MVP")}</div>`;
}
function esGameHtml(g){
  const ls=ES.inn[g.no];
  const mv=(ES.mvp && ES.mvp[g.no]) || {};
  const mvs=[mv.bat?`打 ${mv.bat.name}`:"", mv.pit?`投 ${mv.pit.name}`:""].filter(Boolean).join("／");
  const meta=[g.oppPref, g.power?`戦力${g.power}`:"", g.note].filter(Boolean).join("・");
  const row=`<span class="es-rd">${escHtml(g.round)}</span>
    <span class="es-opp"><span class="es-opp-name">${escHtml(g.opp)}</span><span class="es-opp-meta">${escHtml(meta)}</span>${mvs?`<span class="es-opp-meta es-opp-mvp">MVP ${escHtml(mvs)}</span>`:""}</span>
    <span class="es-score ${g.wl==="勝"?"w":g.wl==="負"?"l":""}"><span class="es-wlb">${g.wl}</span>${g.rs}-${g.ra}</span>`;
  const box=esBoxScore(g.no);
  if((!ls || !ls.length) && !box) return `<div class="es-game">${row}</div>`;
  return `<details class="es-game"><summary>${row}</summary>${esMvpHtml(g.no)}${ls&&ls.length?esLineScore(ls):""}${box}</details>`;
}
function esLineScore(rows){
  const ord=s=>s==="先攻"?0:s==="後攻"?1:2;
  const R=rows.slice().sort((a,b)=>ord(a.side)-ord(b.side));
  let n=9; R.forEach(r=>r.inns.forEach((v,i)=>{ if(v!=="" && i+1>n) n=i+1; }));
  const cell=v=>{ const t=String(v||"").trim(); return /^[xX✕×]$/.test(t)?"✕":escHtml(esHalf(t)); };
  return `<div class="es-ls-wrap"><table class="es-ls">
    <thead><tr><th></th>${Array.from({length:n},(_,i)=>`<th>${i+1}</th>`).join("")}<th class="es-ls-r">R</th><th>H</th><th>E</th></tr></thead>
    <tbody>${R.map(r=>`<tr class="${r.team===ES_SCHOOL?"me":""}"><th>${escHtml(r.team||r.side)}</th>${r.inns.slice(0,n).map(v=>`<td>${cell(v)}</td>`).join("")}
      <td class="es-ls-r">${cell(r.R)}</td><td>${cell(r.H)}</td><td>${cell(r.E)}</td></tr>`).join("")}</tbody></table></div>`;
}
/* スタメンの名前（名字だけでもOK）から卒業生を探す：名字＋入学年度（年度−学年+1）、同じ名字が複数なら守備で絞る */
const esPosN = p => /^[左中右外]$/.test(p) ? "外" : p;
function esFindGrad(l){
  const ent = /^\d$/.test(l.grade) ? l.year-(+l.grade)+1 : null;
  const sur = n => String(n||"").split(/[\s　]+/)[0];
  let c=ES.grads.filter(g=>(g.name===l.name || sur(g.name)===l.name) && (ent==null || g.year===ent));
  if(c.length>1){ const c2=c.filter(g=>esPosN(l.pos)===esPosN(g.pos) || esPosN(l.pos)===esPosN(g.pos0)); if(c2.length) c=c2; }
  return c[0]||null;
}
/* 守備位置アイコンの色分け：投手=赤、捕手=青、内野=黄、外野=緑 */
/* 守備位置アイコンの色（パワプロに合わせる）：先発=赤、中継ぎ・抑え=ピンク、捕手=青、内野=黄、外野=黄緑
   role に "rp" を渡すと、投手を中継ぎ色（ピンク）にする（控えの投手・救援で投げた投手） */
function esPosCls(p, role){
  p=String(p||"");
  if(p==="投") return role==="rp" ? "p-rel" : "p-pit";
  if(p==="捕") return "p-cat";
  if(/^[一二三遊]$/.test(p)) return "p-inf";
  if(/^[左中右外]$/.test(p)) return "p-of";
  return "p-etc";
}
/* 背番号を丸数字に（1〜50。それ以上は #番号） */
function esCircled(n){
  n=+n; if(!n) return "";
  if(n<=20) return String.fromCharCode(0x2460+n-1);
  if(n<=35) return String.fromCharCode(0x3251+n-21);
  if(n<=50) return String.fromCharCode(0x32B1+n-36);
  return `#${n}`;
}
/* ===== 選手の成績（選手成績シートを足し算して出す） ===== */
const esSur = n => String(n||"").split(/[\s　]+/)[0];
const esSameName = (a,b) => a===b || esSur(a)===b || a===esSur(b);
const esSeasonKey = r => r.year*2 + (r.season==="夏"?0:1);
const esPeriodLbl = (y,s) => `${y}${s==="夏"?"夏":"秋春"}`;
/* 選手を「名前＋入学年度」で特定。卒業生 g があればその名前と入学年度を使う */
function esIdent(l, g){
  if(g) return { name:g.name, entry:g.year };
  const entry = /^\d$/.test(l.grade) ? l.year-(+l.grade)+1 : null;
  return { name:l.name, entry };
}
/* その選手の試合ごとの記録（古い順） */
function esBoxOf(id){
  return ES.box.filter(b=>{
    if(!esSameName(b.name, id.name)) return false;
    const gm=ES.gameByNo[b.no]; if(!gm) return false;
    return id.entry==null || (gm.year>=id.entry && gm.year<=id.entry+2);
  }).sort((a,b)=>a.no-b.no);
}
/* 卒業生の通算：空欄の項目だけ、選手成績の合計で埋める */
function esFillFromBox(g){
  const B=esBoxOf({name:g.name, entry:g.year}); if(!B.length) return;
  const t=esAgg(B);
  /* 先発＝その試合で最初に入力した投手、完投＝1人で投げ切った、完封＝完投で失点0、ノーノー＝完投で被安打0 */
  let gs=0, cg=0, sho=0, nh=0;
  B.forEach(b=>{
    if(b.ip==null) return;
    const P=ES.box.filter(x=>x.no===b.no && x.ip!=null), gm=ES.gameByNo[b.no];
    const sp=gm && ES.lineup.find(l=>l.year===gm.year && l.season===gm.season && (/^\d+$/.test(l.order)||l.order==="投") && l.pos==="投");
    const starter=(sp && P.find(x=>esSameName(x.name, sp.name))) || P[0];
    if(starter===b) gs++;
    if(P.length===1){ cg++; if(gm && gm.ra===0) sho++; if(b.ha===0) nh++; }
  });
  const set=(k,v)=>{ if(g[k]==null && v!=null){ g[k]=v; g.auto=true; } };
  if(t.bat){ set("games",t.g); set("avg",t.avg); set("hr",t.hr); set("rbi",t.rbi); set("sb",t.sb); set("ops",t.ops);
    set("pa",t.ab+t.bb+t.sh); set("h",t.h); set("r",t.r); set("d2",t.d2); set("d3",t.d3); set("bbb",t.bb); set("sh",t.sh); set("obp",t.obp); set("slg",t.slg); }
  else set("games",t.g);
  set("mvpB", B.filter(b=>esIsMvp(b,"bat")).length || null);
  set("mvpP", B.filter(b=>esIsMvp(b,"pit")).length || null);
  if(t.pit){ set("app",t.app); set("gs",gs); set("w",t.w); set("l",t.l); set("sv",t.sv); set("cg",cg); set("sho",sho); set("nh",nh);
    set("ip",t.ip); set("k",t.k); set("bb",t.pbb); set("era",t.era); set("ha",t.ha); set("hd",t.hd||null);
    if(t.outs>0){ set("k9",t.k*27/t.outs); set("whip",(t.ha+t.pbb)*3/t.outs); } }
}
/* 打率などの規定：打席（打数＋四死球＋犠打）が ES_BAT_MIN 以上の野手 */
function esBatQ(g){ return (g.pa!=null ? g.pa : (g.games||0)*4) >= ES_BAT_MIN && g.pos!=="投"; }
function esGradDerived(g){
  g.batScore = (esBatQ(g) && g.avg!=null)
    ? g.avg*100 + (g.hr||0)*3 + (g.rbi||0) + (g.sb||0) : null;
  g.pitQual = g.era!=null && (g.ip!=null ? g.ip>=ES_PIT_IP_MIN : ((g.app||g.games||0)>=10));
}
const esDecCls = d => d==="勝"?"w":d==="敗"?"l":d==="H"?"h":"s";
/* 勝敗の表示：12-3 2S 5H */
const esWLtxt = t => `${t.w}-${t.l}${t.sv?` ${t.sv}S`:""}${t.hd?` ${t.hd}H`:""}`;
function esAgg(B){
  const t={ g:0, ab:0, r:0, h:0, d2:0, d3:0, hr:0, rbi:0, so:0, sb:0, bb:0, sh:0, dp:0, e:0, app:0, outs:0, ha:0, er:0, k:0, pbb:0, w:0, l:0, sv:0, hd:0, bat:false, pit:false };
  B.forEach(b=>{
    t.g++;
    if(b.ab!=null){ t.bat=true; t.ab+=b.ab; t.h+=b.h||0; t.hr+=b.hr||0; t.rbi+=b.rbi||0; t.sb+=b.sb||0; t.bb+=b.bb||0;
      t.r+=b.r||0; t.d2+=b.d2||0; t.d3+=b.d3||0; t.so+=b.so||0; t.sh+=b.sh||0; t.dp+=b.dp||0; t.e+=b.e||0; }
    if(b.ip!=null){ t.pit=true; t.app++; t.outs+=Math.round(b.ip*3); t.ha+=b.ha||0; t.er+=b.er||0; t.k+=b.k||0; t.pbb+=b.pbb||0;
      if(b.dec==="勝") t.w++; else if(b.dec==="敗") t.l++; else if(b.dec==="S") t.sv++; else if(b.dec==="H") t.hd++; }
  });
  t.avg = t.ab>0 ? t.h/t.ab : null;
  /* 出塁率は (安打+四死球)/(打数+四死球)、長打率は 塁打/打数（犠飛は記録しないので含めない） */
  t.obp = (t.ab+t.bb)>0 ? (t.h+t.bb)/(t.ab+t.bb) : null;
  t.slg = t.ab>0 ? (t.h + t.d2 + t.d3*2 + t.hr*3)/t.ab : null;
  t.ops = (t.obp!=null && t.slg!=null) ? t.obp+t.slg : null;
  t.era = t.outs>0 ? t.er*27/t.outs : null;
  t.ip = t.outs/3;
  return t;
}
const esF = (v,fn) => v==null ? "-" : (fn?fn(v):v);
function esCellsHtml(cells){ return `<div class="es-cells">${cells.map(([k,v])=>`<div class="es-cell"><span>${k}</span><b>${escHtml(v)}</b></div>`).join("")}</div>`; }
function esAggCells(t, pit){
  return esCellsHtml(pit
    ? [["防御率", esF(t.era,v=>v.toFixed(2))], ["勝敗", esWLtxt(t)], ["奪三振", t.k], ["投球回", esIPfmt(t.ip)]]
    : [["打率", esF(t.avg,esAvgFmt)], ["本塁打", t.hr], ["打点", t.rbi], ["盗塁", t.sb]]);
}
/* 時期ごとの表 */
function esPeriodTable(B, pit, curKey){
  const per={}; B.forEach(b=>{ const gm=ES.gameByNo[b.no], k=gm.year*2+(gm.season==="夏"?0:1); (per[k]=per[k]||{y:gm.year,s:gm.season,B:[]}).B.push(b); });
  const P=Object.keys(per).map(Number).sort((a,b)=>a-b).map(k=>({k, ...per[k], t:esAgg(per[k].B)}));
  if(!P.length) return "";
  const head = pit ? ["登板","勝敗","投球回","奪三振","防御率"] : ["試合","打率","OPS","本","点","盗"];
  const row = t => pit
    ? [t.app, esWLtxt(t), esIPfmt(t.ip), t.k, esF(t.era,v=>v.toFixed(2))]
    : [t.g, `${esF(t.avg,esAvgFmt)}<small>${t.h}/${t.ab}</small>`, esF(t.ops,esAvgFmt), t.hr, t.rbi, t.sb];
  return `<div class="es-car-sub">時期ごとの成績</div>
    <div class="es-st-wrap"><table class="es-st-tbl"><thead><tr><th>時期</th>${head.map(h=>`<th>${h}</th>`).join("")}</tr></thead>
    <tbody>${P.map(p=>`<tr${p.k===curKey?' class="cur"':""}><th>${esPeriodLbl(p.y,p.s)}</th>${row(p.t).map(v=>`<td>${v}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
}
/* 試合ごとの成績（折りたたみ） */
/* 相手の戦力（S〜G）別の成績 */
const ES_PW = ["S","A","B","C","D","E","F","G"];
function esRankTable(B, pit){
  const per={}; B.forEach(b=>{ const gm=ES.gameByNo[b.no]; if(!gm || !gm.power) return; (per[gm.power]=per[gm.power]||[]).push(b); });
  const ks=ES_PW.filter(k=>per[k]); if(!ks.length) return "";
  const head = pit ? ["登板","勝敗","投球回","奪三振","防御率"] : ["試合","打率","OPS","本","点"];
  const row = t => pit
    ? [t.app, esWLtxt(t), esIPfmt(t.ip), t.k, esF(t.era,v=>v.toFixed(2))]
    : [t.g, `${esF(t.avg,esAvgFmt)}<small>${t.h}/${t.ab}</small>`, esF(t.ops,esAvgFmt), t.hr, t.rbi];
  return `<div class="es-car-sub">相手の戦力別の成績</div>
    <div class="es-st-wrap"><table class="es-st-tbl es-rank-tbl"><thead><tr><th>戦力</th>${head.map(h=>`<th>${h}</th>`).join("")}</tr></thead>
    <tbody>${ks.map(k=>`<tr><th><span class="es-pw pw-${k}">${k}</span></th>${row(esAgg(per[k])).map(v=>`<td>${v}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
}
function esGameLog(B, pit, title){
  if(!B.length) return "";
  const line = b => pit && b.ip!=null
    ? `${esIPfmt(b.ip)}回 ${b.er!=null?b.er:"-"}自責 ${b.k!=null?b.k:"-"}K${b.dec?`<b class="es-dec ${esDecCls(b.dec)}">${b.dec}</b>`:""}`
    : b.ab!=null ? `${b.ab}打数${b.h||0}安打${b.hr?` <b>${b.hr}本</b>`:""}${b.d3?` 三塁打${b.d3>1?b.d3:""}`:""}${b.d2?` 二塁打${b.d2>1?b.d2:""}`:""}${b.rbi?` ${b.rbi}打点`:""}${b.bb?` ${b.bb}四死球`:""}${b.sb?` ${b.sb}盗塁`:""}` : "出場";
  return `<details class="es-glog"><summary>${escHtml(title)}（${B.length}試合）</summary>
    <ul>${B.map(b=>{ const gm=ES.gameByNo[b.no]; return `<li><span class="es-glog-g">${escHtml(`${gm.year} ${gm.taikai.replace(/^(夏の|秋の|春の)/,"")} ${gm.round}`)}<small>vs ${escHtml(gm.opp)}</small></span><span class="es-glog-s">${esIsMvp(b, pit && b.ip!=null ? "pit" : "bat")?`<span class="es-mvp-b sm">MVP</span>`:""}${line(b)}</span></li>`; }).join("")}</ul></details>`;
}
/* 選手カード。l=スタメンの行（年度タブから開いたとき）、g=卒業生 */
/* ---------- 卒業時の能力（パワプロ風） ---------- */
/* ランク：S 90〜／A 80〜／B 70〜／C 60〜／D 50〜／E 40〜／F 20〜／G 1〜 */
function esRankOf(v){ return v>=90?"S":v>=80?"A":v>=70?"B":v>=60?"C":v>=50?"D":v>=40?"E":v>=20?"F":"G"; }
const esSplitList = t => String(t||"").split(/[、,，・\/／\s]+/).map(x=>x.trim()).filter(Boolean);
/* 変化球の方向（右投げ基準）：up=ストレート系 L=シュート DL=シンカー D=フォーク DR=カーブ R=スライダー */
function esPitchDir(n){
  if(/ナックルカーブ|Dスライダー|スラーブ|カーブ|ドロップ/.test(n)) return "DR";
  if(/Vスライダー|フォーク|SFF|スプリット|チェンジアップ|パーム|ナックル/.test(n)) return /サークル/.test(n) ? "DL" : "D";
  if(/スライダー|カット|スラッター/.test(n)) return "R";
  if(/シュート/.test(n)) return "L";
  if(/シンカー|スクリュー|サークル/.test(n)) return "DL";
  return "UP";   // ツーシーム・ムービング・ジャイロ・超スローなど（第2ストレート）
}
function esPitchChart(P, lefty){
  const dirs={ L:[], DL:[], D:[], DR:[], R:[], UP:[] };
  P.forEach(p=>{ let d=p.dir||esPitchDir(p.name); if(lefty) d={L:"R",R:"L",DL:"DR",DR:"DL"}[d]||d; dirs[d].push(p); });
  const cx=160, cy=42, cell=11, gap=2, r0=14;
  const vec={ L:[-1,0], R:[1,0], D:[0,1], DL:[-0.7071,0.7071], DR:[0.7071,0.7071] };
  let svg="";
  Object.keys(vec).forEach(d=>{
    const [vx,vy]=vec[d], L=dirs[d], lv=Math.max(0,...L.map(p=>p.lv)), ang=Math.atan2(vy,vx)*180/Math.PI;
    for(let i=0;i<7;i++){
      const t=r0+i*(cell+gap)+cell/2, x=cx+vx*t, y=cy+vy*t;
      const on=i<lv, col= on ? (i>=5?"#e8343f":i>=3?"#f0602a":"#f59b16") : "#5c9ef0";
      svg+=`<rect x="${(x-cell/2).toFixed(1)}" y="${(y-5).toFixed(1)}" width="${cell}" height="10" rx="2" fill="${col}" stroke="${on?"#b8371b":"#2a64c8"}" stroke-width="1" transform="rotate(${ang.toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)})"/>`;
    }
    if(L.length){
      /* 横の腕は先端の上、斜め・下は先端の外側に名前 */
      const horiz=Math.abs(vy)<0.1, t=r0+7*(cell+gap)+(horiz?-4:0); let x=cx+vx*t; const y=cy+vy*t+(horiz?-10:16);
      const anchor = horiz ? (vx<0?"start":"end") : "middle";
      /* 斜め・下は先端の下に中央ぞろえ。長い名前でも枠からはみ出さないように寄せる */
      if(!horiz){ const hw=L.map(p=>p.name).join("・").length*5.6+2; x=Math.max(hw, Math.min(320-hw, x)); }
      svg+=`<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="${anchor}" class="es-pc-t">${escHtml(L.map(p=>p.name).join("・"))}</text>`;
    }
  });
  const up=dirs.UP.map(p=>p.name);
  svg+=`<path d="M${cx-6} ${cy-14} L${cx} ${cy-22} L${cx+6} ${cy-14} Z" fill="#f08a24"/><text x="${cx}" y="${cy-27}" text-anchor="middle" class="es-pc-t">ストレート${up.length?"・"+escHtml(up.join("・")):""}</text>`;
  svg+=`<circle cx="${cx}" cy="${cy}" r="9" fill="#fff" stroke="#4a8fe0" stroke-width="2"/>`;
  return `<svg class="es-pc" viewBox="0 0 320 182" role="img" aria-label="変化球">${svg}</svg>`;
}
function esParseAbil(o){
  /* 守備力は位置ごと（投〜外）、変化球は方向ごとの列 */
  const def={}; ["投","捕","一","二","三","遊","外"].forEach(p=>{ const v=esInt(F(o,p)); if(v!=null) def[p]=v; });
  const pitches=[]; const st2=F(o,"第2ストレート"); if(st2) pitches.push({dir:"UP", name:st2, lv:0});
  /* 変化球：系統ごとに「球種」と「変化量」の2列（例：カーブ系＝Dスライダー、カーブ変化量＝2） */
  [["スライダー","R"],["カーブ","DR"],["フォーク","D"],["シンカー","DL"],["シュート","L"]].forEach(([k,dir])=>{
    const nm=F(o,k+"系"), lv=esInt(F(o,k+"変化量"));
    if(nm || lv) pitches.push({dir, name:nm||k, lv:lv||1});
  });
  return { apt:F(o,"適性"), def,
    traj:esInt(F(o,"弾道")), meet:esInt(F(o,"ミート")), pow:esInt(F(o,"パワー")), run:esInt(F(o,"走力")),
    arm:esInt(F(o,"肩力")), catch_:esInt(F(o,"捕球")),
    velo:esInt(F(o,"球速")), ctl:esInt(F(o,"コントロール")), sta:esInt(F(o,"スタミナ")),
    pitches, skillsF:F(o,"野手特能")||F(o,"特能"), skillsP:F(o,"投手特能"),
    skills:[F(o,"野手特能")||F(o,"特能"), F(o,"投手特能")].filter(Boolean).join("、"),
    /* ランク特能は A〜G。それ以外の文字（例：チャンスの列に「勝負師」）は金特として「★勝負師」で持つ */
    rk:Object.fromEntries(ES_RANK_SK.map(k=>{ const v=esHalf(F(o,k)).trim();
      return [k, /^[A-Ga-g]$/.test(v) ? v.toUpperCase() : v ? "★"+v.replace(/^[★☆]/,"") : ""]; }).filter(([,v])=>v)) };
}
/* ランクで記録する特能（能力シートの列名） */
const ES_RANK_P = ["対ピンチ","対左打者","打たれ強さ","ケガしにくさ","ノビ","クイック","回復"];
const ES_RANK_F = ["チャンス","対左投手","キャッチャー","ケガしにくさ","盗塁","走塁","送球","回復"];
const ES_RANK_SK = [...new Set([...ES_RANK_F, ...ES_RANK_P])];
/* 「特能」セルの赤特（よくあるもの）。ここにない赤特は先頭に▼か末尾に×を付ければ赤になる */
const ES_RED_SK = /^(四球|寸前|一発|乱調|負け運|軽い球|短気|抜け球|シュート回転|スロースターター|調子極端|三振|併殺|エラー|扇風機|チャンス×|ムード×|ケガしやすい|鈍足|速球中心|変化球中心|調子不安定|ムラッ気|ノミの心臓|ランナー×|送球×|守備職人×|対ストレート×|対変化球×|初球×|三振男|悪球打ち|退場癖|拙攻|打球反応×|ピンチ×|内角×|外角×|チキン)$/;
/* ランク特能の色：A・Bは青特、C〜Eはふつう、F・Gは赤特、文字なら金特 */
const esRankCls = r => /^★/.test(r) ? "gold" : /^[AB]$/.test(r) ? "blue" : /^[FG]$/.test(r) ? "red" : "";
function esRankGrid(g, keys){
  const L=keys.filter(k=>g.rk && g.rk[k]); if(!L.length) return "";
  return `<div class="es-rks">${L.map(k=>`<div class="es-rkc"><span>${k}</span><b class="rkt-${g.rk[k]}">${g.rk[k]}</b></div>`).join("")}</div>`;
}
/* 特能チップ：★付き＝金、赤特＝赤、末尾のランク／記号で色分け（A・B・◎・◯＝青、C・D＝灰、E〜G・×＝赤） */
function esSkillChips(list, base){
  return esSplitList(list).map(x=>{
    let cls=base; if(/^[★☆]/.test(x)){ x=x.slice(1); cls="gold"; } else if(ES_RED_SK.test(x)) cls="red";
    const m=x.match(/^(.*?)([A-GＡ-Ｇ◎◯○〇×✕])$/); let nm=x, rk="";
    if(m){ nm=m[1]; rk=m[2].replace(/[Ａ-Ｇ]/,c=>String.fromCharCode(c.charCodeAt(0)-0xFEE0));
      if(cls!=="gold") cls = /[AB◎◯○〇]/.test(rk) ? "blue" : /[CD]/.test(rk) ? "plain" : "red"; }
    return `<span class="es-sk ${cls}">${escHtml(nm)}${rk?`<b class="es-sk-r rk-${/[A-G]/.test(rk)?rk:"x"}">${escHtml(rk)}</b>`:""}</span>`;
  }).join("");
}
/* ---------- 選手カード（パワプロの選手画面風）：成績・能力・守備・プロフィール ---------- */
function esPwNum(g){   // スタメン表から背番号（最後の時期のもの）
  const L=ES.lineup.filter(l=>l.num && esFindGrad(l)===g).sort((a,b)=>a.year-b.year||(a.season==="夏"?0:1)-(b.season==="夏"?0:1));
  return L.length ? L[L.length-1].num : "";
}
const ES_ABIL_KEYS=["apt","def","traj","meet","pow","run","arm","fld","catch_","velo","ctl","sta","pitches","skills","skillsF","skillsP","rk"];
const esPwRk = (r, sm) => `<b class="pw2-rk rk-${r}${sm?" sm":""}">${r}</b>`;
/* 能力タブの中身。prev があれば入学時からの伸びを小さく出す */
function esAbilityParts(g, prev){
  const dif=k=> (prev && prev[k]!=null && g[k]!=null && g[k]!==prev[k]) ? `<small class="${g[k]>prev[k]?"up":"dn"}">${g[k]>prev[k]?"+":""}${g[k]-prev[k]}</small>` : "";
  const row=(lbl,k)=>{ const v=g[k]; if(v==null) return ""; return `<div class="pw2-row"><span class="pw2-lbl">${lbl}</span>${esPwRk(esRankOf(v))}<span class="pw2-v">${v}${dif(k)}</span></div>`; };
  /* 野手の初期値（球速120・コントロール1・スタミナ1で変化球なし）は投手能力として出さない */
  const pitDefault = g.pos!=="投" && !g.apt && (g.ctl||0)<=1 && (g.sta||0)<=1 && !(g.pitches&&g.pitches.length) && !g.skillsP;
  const hasP = !pitDefault && (g.velo!=null || g.ctl!=null || g.sta!=null || (g.pitches&&g.pitches.length) || ["対ピンチ","対左打者","打たれ強さ","ノビ","クイック"].some(k=>g.rk&&g.rk[k]) || !!g.skillsP);
  const hasF = [g.traj,g.meet,g.pow,g.run,g.arm,g.fld,g.catch_].some(v=>v!=null) || ["チャンス","対左投手","キャッチャー","盗塁","走塁","送球"].some(k=>g.rk&&g.rk[k]) || !!g.skillsF;
  const hasD = g.def && Object.keys(g.def).length;
  const mainP = /^[左中右]$/.test(g.pos) ? "外" : g.pos;
  /* 特能欄：ランク特能＋「特能」セル。空きマスで4の倍数（スマホは2の倍数）にそろえる */
  const grid=(keys, list)=>{
    /* 固定の項目は空欄でも項目名だけ出す（並びも固定）。null は空きマス */
    const cells=keys.map(k=>{ if(k==null) return `<div class="pw2-sk empty gap"></div>`; const r=(g.rk&&g.rk[k])||"";
      if(/^★/.test(r)) return `<div class="pw2-sk gold" title="${k}"><span>${escHtml(r.slice(1))}</span></div>`;
      return `<div class="pw2-sk ${esRankCls(r)}"><span>${k}</span><b class="pw2-skr${r?"":" none"}">${r||"-"}</b></div>`; });
    esSplitList(list).forEach(x=>{
      let cls="blue"; if(/^[★☆]/.test(x)){ x=x.slice(1); cls="gold"; } else if(/^[▼▽]/.test(x)){ x=x.slice(1); cls="red"; } else if(ES_RED_SK.test(x)) cls="red";
      const m=x.match(/^(.*?)([A-GＡ-Ｇ◎◯○〇×✕])$/); let nm=x, rk="";
      if(m && m[1]){ nm=m[1]; rk=m[2]; if(cls==="blue") cls=/[ABＡＢ◎◯○〇]/.test(rk)?"blue":/[CDEＣＤＥ]/.test(rk)?"":"red"; }
      cells.push(`<div class="pw2-sk ${cls}"><span>${escHtml(nm)}</span>${rk?`<b class="pw2-skr">${escHtml(rk)}</b>`:""}</div>`);
    });
    while(cells.length<8 || cells.length%2) cells.push(`<div class="pw2-sk empty"></div>`);
    while(cells.length%4) cells.push(`<div class="pw2-sk empty pad4"></div>`);  // PC（4列）用の穴埋め。スマホでは出さない
    return `<div class="pw2-sks">${cells.join("")}</div>`;
  };
  const out={};
  if(hasP) out.p=`<div class="pw2-cols"><div class="pw2-left">
      ${g.velo!=null?`<div class="pw2-row"><span class="pw2-lbl">球速</span><span class="pw2-v velo">${g.velo}<em>km/h</em>${dif("velo")}</span></div>`:""}
      ${row("コントロール","ctl")}${row("スタミナ","sta")}
      ${g.pitches&&g.pitches.length?`<div class="pw2-pc">${esPitchChart(g.pitches, g.th==="左")}</div>`:""}
    </div><div class="pw2-right">${grid(["対ピンチ","対左打者","打たれ強さ","ケガしにくさ","ノビ","クイック",null,"回復"], g.skillsP)}</div></div>`;
  if(hasF) out.f=`<div class="pw2-cols"><div class="pw2-left">
      ${g.traj!=null?`<div class="pw2-row"><span class="pw2-lbl">弾道</span><svg class="pw2-traj traj-${g.traj}" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 1 L23 12 H16.5 V23 H7.5 V12 H1 Z" transform="rotate(${[0,60,40,20,0][g.traj]||0} 12 12)"/></svg><span class="pw2-v">${g.traj}${dif("traj")}</span></div>`:""}
      ${row("ミート","meet")}${row("パワー","pow")}${row("走力","run")}${row("肩力","arm")}${row("守備力","fld")}${row("捕球","catch_")}
    </div><div class="pw2-right">${grid(ES_RANK_F, g.skillsF)}</div></div>`;
  if(hasD) out.d=`<div class="pw2-left pw2-full"><div class="pw2-row pw2-defrow"><span class="pw2-lbl">守備力</span><div class="pw2-defs">
      ${(()=>{ const top=Math.max(...Object.values(g.def).filter(v=>v!=null));
        return ["投","捕","一","二","三","遊","外"].map(p=>{ const v=g.def[p];
        /* 一番高い守備力より低い位置は薄く */
        return `<div class="pw2-def ${esPosCls(p)}${p===mainP?" main":""}${v==null?" none":v<top?" low":""}"><span class="pw2-dp">${p}</span>${v!=null?`${esPwRk(esRankOf(v),1)}<i>${v}</i>`:`<i>--</i>`}</div>`; }).join(""); })()}
    </div></div></div>`;
  return out;
}
/* 入学時／卒業時の切り替え（同じカードの中の能力タブがまとめて切り替わる） */
document.addEventListener("click", e=>{
  const b=e.target.closest(".es-abseg-b"); if(!b) return;
  const card=b.closest(".pw2"); if(!card) return;
  card.querySelectorAll(".es-abseg-b").forEach(x=>x.classList.toggle("active", x.dataset.w===b.dataset.w));
  card.querySelectorAll(".es-abview").forEach(v=>v.hidden = v.dataset.w!==b.dataset.w);
});
/* タブの切り替え（枠の色もタブに合わせる） */
document.addEventListener("click", e=>{
  const b=e.target.closest(".pw2-tab"); if(!b) return;
  const card=b.closest(".pw2"); if(!card) return;
  card.dataset.tab=b.dataset.t;
  card.querySelectorAll(":scope > .pw2-tabs .pw2-tab").forEach(x=>x.classList.toggle("active", x===b));
  card.querySelectorAll(".pw2-pane").forEach(p=>p.hidden = p.dataset.t!==b.dataset.t);
});
/* 誕生日を「2008年6月9日」の形に */
function esBirthFmt(v){
  const m=String(v||"").match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);
  return m ? `${+m[1]}年${+m[2]}月${+m[3]}日` : (v||"");
}
function esPlayerCard(l, g){
  const id=esIdent(l||{}, g); const B=id.name?esBoxOf(id):[];
  const all=esAgg(B);
  const pit = l ? (l.pos==="投" && all.pit) : (g ? (g.pos==="投" && all.pit) || (!all.bat && all.pit) : all.pit && !all.bat);
  const pos = (g && g.pos) || (l && l.pos) || "";
  const name = g ? g.name : (l ? l.name : "");

  /* --- 成績 --- */
  let st="";
  if(l){
    const cur=B.filter(b=>{ const gm=ES.gameByNo[b.no]; return gm.year===l.year && gm.season===l.season; });
    if(cur.length){
      st+=`<div class="es-car-sub">${l.year}年度 ${l.season==="夏"?"夏":"秋・春"}の成績</div>${esAggCells(esAgg(cur), pit)}`;
      st+=esGameLog(cur, pit, "この時期の試合ごとの成績");
    } else st+=`<p class="es-car-note">この時期の試合ごとの記録はまだありません。</p>`;
  }
  if(B.length){
    st+=`<div class="es-car-sub">通算（記録した試合）</div>${esAggCells(all, pit)}`;
    if(all.pit && all.bat) st+=esAggCells(all, !pit);
    st+=esPeriodTable(B, pit, l?esSeasonKey(l):null);
    st+=esRankTable(B, pit);
    if(!l) st+=esGameLog(B, pit, "試合ごとの成績");
  }
  if(!st) st=`<p class="es-car-note">まだ試合の記録がありません。</p>`;

  /* --- 能力（入学時／卒業時） --- */
  const A=(g&&g.ab)||{}, ws=["入学時","卒業時"].filter(w=>A[w]);
  const base=g?{...g}:{}; ES_ABIL_KEYS.forEach(k=>delete base[k]);
  const views = ws.map(w=>[w, esAbilityParts({...base, ...A[w]}, w==="卒業時"?A["入学時"]:null)]);
  const cur = ws[ws.length-1];
  const wl = w => (w==="入学時" && g && g.transfer) ? "転校時" : w;   // 転校生は「入学時」を「転校時」と表示
  const seg = ws.length>1 ? `<div class="es-abseg">${ws.map(w=>`<button type="button" class="es-abseg-b${w===cur?" active":""}" data-w="${w}">${wl(w)}</button>`).join("")}</div>`
            : (cur ? `<div class="es-abseg one"><span>${wl(cur)}</span></div>` : "");
  const abPane = k => { const vs=views.filter(([,o])=>o[k]); if(!vs.length) return "";
    return seg + vs.map(([w,o])=>`<div class="es-abview" data-w="${w}"${w===cur?"":" hidden"}>${o[k]}</div>`).join(""); };

  /* --- プロフィール --- */
  const pro = g ? (g.team ? `${g.team}${g.rank?` ${g.rank}位`:""}` : g.course) : "";
  const prof = g ? [["氏名", escHtml(g.name)], ["よびかた", escHtml(g.kana)], ["誕生日", escHtml(esBirthFmt(g.birth))], ["出身", escHtml(g.from)], ["性格", (()=>{ const c0=A["入学時"]&&A["入学時"].chara, c1=A["卒業時"]&&A["卒業時"].chara;
      return c0&&c1&&c0!==c1 ? `${escHtml(c0)}<small class="pw2-arrow">→</small>${escHtml(c1)}` : escHtml(c1||c0||g.chara); })()],
    ["スカウト", [g.scout?"スカウト":"", g.tensei?"転生":"", g.transfer?"転校生":""].filter(Boolean).join("・")], ["進路", escHtml(pro)]].filter(([,v])=>v) : [];

  /* --- 上段（ゲームの選手画面の上の部分） --- */
  const num = (l && l.num) || (g ? esPwNum(g) : "");
  const apt = (A["卒業時"]||A["入学時"]||{}).apt;
  const handOf = o => o && (o.th||o.bt) ? `${o.th?escHtml(o.th)+"投":""}${o.bt?escHtml(o.bt==="両"?"両打":o.bt+"打"):""}` : "";
  /* 投打も入学時／卒業時の切り替えに合わせる */
  const hands = ws.map(w=>[w, handOf({...base, th:g.th, bt:g.bt, ...A[w]})]);
  const hand = hands.length>1 && hands[0][1]!==hands[1][1]
    ? hands.map(([w,h])=>`<span class="es-abview" data-w="${w}"${w===cur?"":" hidden"}>${h||"-"}</span>`).join("")
    : (hands.length ? hands[hands.length-1][1] : handOf(g));
  const star = g ? (g.star!=null ? g.star : g.star0) : null;
  const sur = String(name).split(/[\s　]+/)[0];
  const isPit = pos==="投";
  const stat = isPit
    ? `防${all.pit?esF(all.era,v=>v.toFixed(2)):"----"}　${all.pit?all.w:"--"}勝${all.pit?all.l:"--"}敗　${all.pit?all.hd:"--"}H　${all.pit?all.sv:"--"}S`
    : `率${all.bat?esF(all.avg,esAvgFmt):"----"}　${all.bat?all.hr:"--"}本　${all.bat?all.rbi:"--"}点　${all.bat?all.sb:"--"}盗`;
  /* 上段：左右の行の高さをそろえるため、4つの箱を2列のグリッドに並べる */
  const head=`<div class="pw2-head">
      <div class="pw2-hname">
        <div class="pw2-plate ${esPosCls(pos)}">${escHtml(sur)}</div>
        <div class="pw2-nobox">${num?`<span class="pw2-no">${escHtml(num)}</span>`:""}${star!=null?`<span class="pw2-star">★${star}</span>`:""}</div>
      </div>
      <div class="pw2-hbox h-stat"><span class="pw2-lbl">成績</span><b class="stat">${stat}</b></div>
      <div class="pw2-hbox h-pos"><span class="pw2-lbl">${isPit?"適性":"守備位置"}</span><b>${escHtml(isPit?(apt||"-"):(pos||"-"))}</b></div>
      <div class="pw2-hbox h-hand"><span class="pw2-lbl">投打</span><b>${hand||"-"}</b></div>
    </div>`;

  const tabs=[["s","選手成績", `<div class="pw2-stats">${st}</div>`]];
  const pP=abPane("p"), pF=abPane("f"), pD=abPane("d");
  if(pP) tabs.push(["p","投手能力", pP]);
  if(pF) tabs.push(["f","野手能力", pF]);
  if(pD) tabs.push(["d","守備・起用", pD]);
  if(prof.length) tabs.push(["i","プロフィール", `<div class="pw2-left pw2-full pw2-prof">${prof.map(([k,v])=>`<div class="pw2-row"><span class="pw2-lbl">${k}</span><b class="pw2-pv">${v}</b></div>`).join("")}</div>`]);
  const first = (l || B.length) ? "s" : (pP && isPit ? "p" : pF ? "f" : tabs[0][0]);
  return `<div class="pw2" data-tab="${first}">
    <div class="pw2-tabs">${tabs.map(([k,t])=>`<button type="button" class="pw2-tab t-${k}${k===first?" active":""}" data-t="${k}">${t}</button>`).join("")}</div>
    <div class="pw2-panel">
      ${head}
      ${tabs.map(([k,,h])=>`<div class="pw2-pane" data-t="${k}"${k===first?"":" hidden"}>${h}</div>`).join("")}
    </div>
  </div>`;
}
/* 試合のボックススコア（その試合の自校の選手成績） */
function esBoxScore(no){
  const B=ES.box.filter(b=>b.no===no); if(!B.length) return "";
  /* その試合の時期のスタメン表から、打順・守備・背番号を引く（打順が数字＝スタメン、補欠＝途中出場） */
  const gm=ES.gameByNo[no];
  const L=gm ? ES.lineup.filter(l=>l.year===gm.year && l.season===gm.season) : [];
  const luOf=b=>L.find(l=>esSameName(l.name,b.name)) || null;
  const isBat=l=>l && /^\d+$/.test(l.order);
  const tag=(b,l,sub,role)=>`<span class="es-bx-pl">${l&&l.pos?`<span class="es-pos sm ${esPosCls(l.pos,role)}">${escHtml(l.pos)}</span>`:""}<span class="es-bx-nm">${escHtml(b.name)}</span>${l&&(l.grade||l.num)?`<small>${[l.grade?escHtml(l.grade)+"年":"", l.num?escHtml(esCircled(l.num)):""].filter(Boolean).join(" ")}</small>`:""}${sub?`<em class="es-bx-sub">途中</em>`:""}</span>`;

  const bat=B.filter(b=>b.ab!=null).map((b,i)=>({b, l:luOf(b), i}));
  bat.sort((x,y)=>(isBat(x.l)?+x.l.order:100+x.i)-(isBat(y.l)?+y.l.order:100+y.i));
  /* 投手：先発（スタメンの投手）を先頭に、あとは入力順 */
  const pit=B.filter(b=>b.ip!=null).map((b,i)=>({b, l:luOf(b), i}));
  const sp=esStarterOf(no), spIdx=Math.max(0, pit.findIndex(x=>x.b===sp));
  pit.forEach((x,i)=>x.k = i===spIdx ? -1 : x.i);
  pit.sort((x,y)=>x.k-y.k);

  const T=esAgg(bat.map(x=>x.b));
  /* [見出し, 項目, 0でも表示するか] */
  const BC=[["打数","ab",1],["得点","r"],["安打","h",1],["二","d2"],["三","d3"],["本","hr"],["打点","rbi"],["三振","so"],["四死","bb"],["犠打","sh"],["盗塁","sb"],["併殺","dp"],["失策","e"]];
  const PC=[["回","ip",1],["球数","np",1],["打者","bf",1],["安打","ha",1],["本","hra"],["三振","k",1],["四死","pbb"],["失点","pr",1],["自責","er",1],["暴投","wp"]];
  return `<div class="es-box">
    ${bat.length?`<div class="es-st-wrap"><table class="es-box-tbl"><thead><tr><th class="es-bx-no">打順</th><th>打撃</th>${BC.map(c=>`<th>${c[0]}</th>`).join("")}</tr></thead>
      <tbody>${bat.map(({b,l})=>{ const st=isBat(l), sub=!st && !(l && l.order==="投"); return `<tr class="${sub?"sub":""}"><td class="es-bx-no">${st?escHtml(l.order):sub?"途中":""}</td><th>${tag(b,l,false, st||(l&&l.order==="投")?"":"rp")}</th>${BC.map(c=>`<td>${c[2]?esF(b[c[1]]):(b[c[1]]||"")}</td>`).join("")}</tr>`; }).join("")}
      <tr class="tot"><td class="es-bx-no"></td><th>計</th>${BC.map(c=>`<td>${c[2]?T[c[1]]:(T[c[1]]||"")}</td>`).join("")}</tr></tbody></table></div>`:""}
    ${pit.length?`<div class="es-st-wrap"><table class="es-box-tbl"><thead><tr><th class="es-bx-no"></th><th>投手</th>${PC.map(c=>`<th>${c[0]}</th>`).join("")}<th></th></tr></thead>
      <tbody>${pit.map(({b,l},i)=>`<tr class="${i?"sub":""}"><td class="es-bx-no">${i?"":"先発"}</td><th>${tag(b,l,false,i?"rp":"")}</th>${PC.map(c=>`<td>${c[1]==="ip"?esIPfmt(b.ip):c[2]?esF(b[c[1]]):(b[c[1]]||"")}</td>`).join("")}<td>${b.dec?`<b class="es-dec ${esDecCls(b.dec)}">${b.dec}</b>`:""}</td></tr>`).join("")}</tbody></table></div>`:""}
  </div>`;
}
function esLuRow(l, starter){
  const g=esFindGrad(l);
  return `<details class="es-lu-row${starter?"":" bench"}">
    <summary>
      <span class="es-lu-no">${starter?escHtml(l.order==="投"?"先":l.order):"控"}</span>
      <span class="es-pos ${esPosCls(l.pos, starter?"":"rp")}">${escHtml(l.pos)}</span>
      <span class="es-lu-main"><span class="es-lu-name">${escHtml(g?g.name:l.name)}${g?esTags(g):""}</span><span class="es-lu-meta">${[l.grade?escHtml(l.grade)+"年":"", l.num?escHtml(esCircled(l.num)):""].filter(Boolean).join(" ")}</span></span>
      <span class="es-lu-chev" aria-hidden="true"></span>
    </summary>
    ${esPlayerCard(l, g)}
  </details>`;
}
function esRenderLineup(){
  const L=ES.lineup.filter(l=>l.year===ES.sel && l.season===ES.lineupSeason);
  /* 指名打者（DH）制：先発投手は打順「投」で入力 → 9番の後ろに並べる */
  const isSt=l=>/^\d+$/.test(l.order)||l.order==="投", ord=l=>l.order==="投"?99:+l.order;
  const starters=L.filter(isSt).sort((a,b)=>ord(a)-ord(b)), bench=L.filter(l=>!isSt(l));
  document.getElementById("es-lu").innerHTML=`
    <div class="es-lu">${starters.map(l=>esLuRow(l,true)).join("")}</div>
    ${bench.length?`<div class="es-bench-lbl">控え</div><div class="es-lu">${bench.map(l=>esLuRow(l,false)).join("")}</div>`:""}
    <p class="kk-note-s">選手をタップすると、この時期の成績・試合ごとの成績・時期ごとの成績が見られます。</p>`;
}

/* ---------- ベスト9 ---------- */
function esRenderB9Tabs(){
  const tabs=[["star","★"],["stats","成績"],["team","球団別"],["amateur","プロ以外"]];
  document.getElementById("es-b9-tabs").innerHTML=tabs.map(([k,t])=>`<button type="button" class="day-tab${k===ES.b9?" active":""}" data-k="${k}">${t}</button>`).join("");
  document.querySelectorAll("#es-b9-tabs .day-tab").forEach(b=>b.onclick=()=>{
    ES.b9=b.dataset.k;
    document.querySelectorAll("#es-b9-tabs .day-tab").forEach(x=>x.classList.toggle("active", x===b));
    esRenderB9();
  });
  const teams=[...new Set(ES.grads.filter(g=>g.team).map(g=>g.team))]
    .sort((a,b)=>ES.grads.filter(g=>g.team===b).length-ES.grads.filter(g=>g.team===a).length);
  ES.team=teams[0]||"";
  const sel=document.getElementById("es-team-sel");
  sel.innerHTML=teams.map(t=>`<option value="${escHtml(t)}">${escHtml(t)}（${ES.grads.filter(g=>g.team===t).length}人）</option>`).join("");
  sel.onchange=()=>{ ES.team=sel.value; esRenderB9(); };
}
function esPick(pool, key, asc){
  const used=new Set();
  return ES_B9_SLOTS.map(p=>{
    const c=pool.filter(g=>g.pos===p && !used.has(g) && key(g)!=null).sort((a,b)=>asc?key(a)-key(b):key(b)-key(a))[0];
    if(c) used.add(c); return {p, g:c||null};
  });
}
function esRenderB9(){
  document.getElementById("es-b9-team").hidden = ES.b9!=="team";
  let picks, note="", val;
  if(ES.b9==="stats"){
    const bat=esPick(ES.grads.filter(g=>g.pos!=="投"), g=>g.batScore);
    const pit=ES.grads.filter(g=>g.pos==="投" && g.pitQual).sort((a,b)=>a.era-b.era)[0]||null;
    picks=bat.map(x=>x.p==="投"?{p:"投", g:pit}:x);
    val=(x)=> x.p==="投" ? `<b>${x.g.era.toFixed(2)}</b><small>防御率</small>`
      : `<b>${esAvgFmt(x.g.avg)}</b><small>${x.g.hr||0}本 ${x.g.rbi||0}点 ${x.g.sb||0}盗</small>`;
    note=`打者は「打率×100＋本塁打×3＋打点＋盗塁」の点数で守備ごとに1位（${ES_BAT_MIN}打席以上）。投手は防御率1位（投球回${ES_PIT_IP_MIN}以上、投球回が空欄なら登板10以上）。`;
  } else {
    const pool = ES.b9==="team" ? ES.grads.filter(g=>g.team===ES.team)
               : ES.b9==="amateur" ? ES.grads.filter(g=>!g.pro) : ES.grads;
    picks=esPick(pool, g=>g.star);
    val=x=>`<b>${x.g.star}</b><small>★</small>`;
    note = ES.b9==="team" ? "その球団に進んだ卒業生の中で、卒業時の★が一番高い選手（守備は卒業時）。"
         : ES.b9==="amateur" ? "プロ野球選手にならなかった卒業生の中で、卒業時の★が一番高い選手（守備は卒業時）。"
         : "卒業時の★が一番高い選手（守備は卒業時）。";
  }
  /* 1人もいないときは「該当なし」を9行並べず、ひとことだけ */
  if(!picks.some(x=>x.g)){
    document.getElementById("es-b9").innerHTML=errBox(ES.b9==="stats" ? "まだ規定の試合数・投球回に届いた選手がいません。" : "まだ卒業時の★が入った卒業生がいません。");
    document.getElementById("es-b9-note").textContent=note; return;
  }
  document.getElementById("es-b9").innerHTML=`<div class="es-b9">${picks.map(x=>{
    const inner=`
      <span class="es-pos lg ${esPosCls(x.p)}">${x.p}</span>
      <span class="es-b9-main">${x.g?`<span class="es-b9-name">${escHtml(x.g.name)}${esTags(x.g)}</span>
        <span class="es-b9-meta">${escHtml(esGradMeta(x.g))}</span>`:`<span class="es-b9-meta">該当なし</span>`}</span>
      <span class="es-b9-val">${x.g?val(x):""}</span>`;
    return x.g ? esPl("es-b9-row", inner, x.g) : `<div class="es-b9-row empty">${inner}</div>`;
  }).join("")}</div>`;
  document.getElementById("es-b9-note").textContent=note+" 選手をタップすると年度ごとの成績と通算が見られます。";
}
/* 選手の行をタップで開けるようにする（中身は卒業生カード） */
function esPl(cls, inner, g){
  return `<details class="es-pl"><summary class="${cls}">${inner}</summary>${esPlayerCard(null, g)}</details>`;
}
function esTags(g){ return (g.tensei?`<span class="es-tag t">転生</span>`:"") + (g.transfer?`<span class="es-tag tr">転校生</span>`:"") + (g.scout?`<span class="es-tag">スカウト</span>`:""); }
/* ---------- 選手名鑑：入学年度ごとに全選手（在学中も）。タップで成績と能力カード ---------- */
function esRenderRoster(){
  const sel=document.getElementById("es-roster-sel"), box=document.getElementById("es-roster"); if(!sel||!box) return;
  const years=[...new Set(ES.grads.map(g=>g.year).filter(y=>y!=null))].sort((a,b)=>b-a);
  if(!years.length){ box.innerHTML=errBox("まだ卒業生シートに選手がいません。"); sel.parentElement.hidden=true; return; }
  if(!years.includes(ES.rosterYear)) ES.rosterYear=years[0];
  sel.innerHTML=years.map(y=>`<option value="${y}"${y===ES.rosterYear?" selected":""}>${y}年度入学（${ES.grads.filter(g=>g.year===y).length}人）</option>`).join("");
  const posOrd=p=>"投捕一二三遊左中右外".indexOf(p);
  const draw=()=>{
    const L=ES.grads.filter(g=>g.year===ES.rosterYear).sort((a,b)=>posOrd(a.pos)-posOrd(b.pos)||(b.star||b.star0||0)-(a.star||a.star0||0));
    box.innerHTML=`<div class="mlist">${L.map(g=>esPl("gm-row", `
      <div class="gm-pos"><span class="es-pos ${esPosCls(g.pos)}">${escHtml(g.pos||"-")}</span></div>
      <div class="gm-main">
        <div class="gm-title">${escHtml(g.name)}${esTags(g)}${g.ab?`<span class="es-tag ab">能力</span>`:""}</div>
        <div class="gm-meta">${escHtml([g.from, g.team?`${g.team}${g.rank?` ${g.rank}位`:""}`:g.course].filter(Boolean).join("・"))}</div>
      </div>
      <div class="gm-score es-val">★${g.star!=null?g.star:(g.star0!=null?g.star0:"-")}</div>`, g)).join("")}</div>
      <p class="kk-note-s">選手をタップすると成績と能力（入学時／卒業時）が見られます。</p>
      ${ES.abilLoaded?"":`<p class="kk-note-s" style="color:#d9453f">※「能力」シートを読み込めていません（ウェブ公開の設定を確認してください。公開してから反映まで数分かかることがあります）。</p>`}`;
  };
  sel.onchange=()=>{ ES.rosterYear=+sel.value; draw(); };
  draw();
}
function esGradMeta(g){
  const pro = g.team ? `${g.team}${g.rank?` ${g.rank}位`:""}` : g.course;
  return [g.year?`${g.year}年度入学`:"", g.from, pro].filter(Boolean).join("・");
}

/* ---------- 歴代ランキング ---------- */

const ES_BAT_NOTE = `${ES_BAT_MIN}打席以上の野手`, ES_PIT_NOTE = `投球回${ES_PIT_IP_MIN}以上（投球回が空欄なら登板10以上）`;
/* 投手の能力ランキングは投手（守備位置が投、または適性が入っている選手）だけ */
const esIsPit = g => g.pos==="投" || !!g.apt;
const esCnt = u => v => `${v}<small>${u}</small>`;
/* g: 総合／打撃／投手 */
const ES_RK=[
  {g:"総合", k:"star", t:"卒業時★", get:g=>g.star, fmt:v=>v},
  {g:"総合", k:"star0",t:"入学時★", get:g=>g.transfer?null:g.star0, fmt:v=>v, note:"新入生として入学した選手だけ（転校生は「転校生★」で別に並べる）"},
  {g:"総合", k:"trans",t:"転校生★", get:g=>g.transfer?g.star0:null, fmt:v=>v, note:"転校してきた時点の★（卒業生シートの入学時★）"},
  {g:"総合", k:"grow", t:"★の伸び", get:g=>g.grow, fmt:v=>`+${v}`},
  {g:"総合", k:"games",t:"出場試合", get:g=>g.games||null, fmt:esCnt("試合")},
  {g:"能力", k:"velo", t:"球速", get:g=>esIsPit(g)&&g.velo||null, fmt:v=>`${v}<small>km/h</small>`},
  {g:"能力", k:"ctl",  t:"コントロール", get:g=>esIsPit(g)&&g.ctl||null, fmt:v=>`<span class="es-ab-r rk-${esRankOf(v)} in">${esRankOf(v)}</span>${v}`},
  {g:"能力", k:"sta",  t:"スタミナ", get:g=>esIsPit(g)&&g.sta||null, fmt:v=>`<span class="es-ab-r rk-${esRankOf(v)} in">${esRankOf(v)}</span>${v}`},
  {g:"能力", k:"meet", t:"ミート", get:g=>g.meet||null, fmt:v=>`<span class="es-ab-r rk-${esRankOf(v)} in">${esRankOf(v)}</span>${v}`},
  {g:"能力", k:"pow",  t:"パワー", get:g=>g.pow||null, fmt:v=>`<span class="es-ab-r rk-${esRankOf(v)} in">${esRankOf(v)}</span>${v}`},
  {g:"能力", k:"run",  t:"走力", get:g=>g.run||null, fmt:v=>`<span class="es-ab-r rk-${esRankOf(v)} in">${esRankOf(v)}</span>${v}`},
  {g:"能力", k:"arm",  t:"肩力", get:g=>g.arm||null, fmt:v=>`<span class="es-ab-r rk-${esRankOf(v)} in">${esRankOf(v)}</span>${v}`},
  {g:"能力", k:"fld",  t:"守備力", get:g=>g.fld||null, fmt:v=>`<span class="es-ab-r rk-${esRankOf(v)} in">${esRankOf(v)}</span>${v}`},
  {g:"能力", k:"gold", t:"金特の数", get:g=>(esSplitList(g.skills).filter(x=>/^[★☆]/.test(x)).length + Object.values(g.rk||{}).filter(v=>/^★/.test(v)).length)||null, fmt:esCnt("個")},
  {g:"打撃", k:"mvpB", t:"打撃MVP", get:g=>g.mvpB||null, fmt:esCnt("回"), note:"試合ごとの打撃MVPに選ばれた回数。打席の中身を得点の価値で数え、チームの得点に絡んだ割合（接戦ほど重く）を足して選ぶ"},
  {g:"打撃", k:"avg",  t:"打率", get:g=>esBatQ(g)?g.avg:null, fmt:esAvgFmt, note:ES_BAT_NOTE},
  {g:"打撃", k:"ops",  t:"OPS", get:g=>esBatQ(g)?g.ops:null, fmt:esAvgFmt, note:ES_BAT_NOTE},
  {g:"打撃", k:"obp",  t:"出塁率", get:g=>esBatQ(g)?g.obp:null, fmt:esAvgFmt, note:ES_BAT_NOTE},
  {g:"打撃", k:"slg",  t:"長打率", get:g=>esBatQ(g)?g.slg:null, fmt:esAvgFmt, note:ES_BAT_NOTE},
  {g:"打撃", k:"h",    t:"安打", get:g=>g.h||null, fmt:esCnt("本")},
  {g:"打撃", k:"hr",   t:"本塁打", get:g=>g.hr||null, fmt:esCnt("本")},
  {g:"打撃", k:"d2",   t:"二塁打", get:g=>g.d2||null, fmt:esCnt("本")},
  {g:"打撃", k:"d3",   t:"三塁打", get:g=>g.d3||null, fmt:esCnt("本")},
  {g:"打撃", k:"rbi",  t:"打点", get:g=>g.rbi||null, fmt:esCnt("点")},
  {g:"打撃", k:"r",    t:"得点", get:g=>g.r||null, fmt:esCnt("点")},
  {g:"打撃", k:"sb",   t:"盗塁", get:g=>g.sb||null, fmt:esCnt("個")},
  {g:"打撃", k:"bbb",  t:"四死球", get:g=>g.bbb||null, fmt:esCnt("個")},
  {g:"打撃", k:"sh",   t:"犠打", get:g=>g.sh||null, fmt:esCnt("個")},
  {g:"投手", k:"mvpP", t:"投手MVP", get:g=>g.mvpP||null, fmt:esCnt("回"), note:"試合ごとの投手MVPに選ばれた回数。平均的な投手と比べて何点防いだかに、奪三振と接戦での勝ち・セーブを足して選ぶ"},
  {g:"投手", k:"era",  t:"防御率", get:g=>g.pitQual?g.era:null, fmt:v=>v.toFixed(2), asc:true, note:ES_PIT_NOTE},
  {g:"投手", k:"whip", t:"WHIP", get:g=>g.pitQual?g.whip:null, fmt:v=>v.toFixed(2), asc:true, note:`1イニングあたりに出した走者（被安打＋与四死球）。${ES_PIT_NOTE}`},
  {g:"投手", k:"k9",   t:"奪三振率", get:g=>g.pitQual?g.k9:null, fmt:v=>v.toFixed(2), note:`9イニングあたりの奪三振。${ES_PIT_NOTE}`},
  {g:"投手", k:"w",    t:"勝利", get:g=>g.w||null, fmt:esCnt("勝")},
  {g:"投手", k:"k",    t:"奪三振", get:g=>g.k||null, fmt:esCnt("個")},
  {g:"投手", k:"ip",   t:"投球回", get:g=>g.ip||null, fmt:v=>esIPfmt(v)},
  {g:"投手", k:"cg",   t:"完投", get:g=>g.cg||null, fmt:esCnt("回")},
  {g:"投手", k:"sho",  t:"完封", get:g=>g.sho||null, fmt:esCnt("回")},
  {g:"投手", k:"nh",   t:"ノーノー", get:g=>g.nh||null, fmt:esCnt("回")},
  {g:"投手", k:"hd",   t:"ホールド", get:g=>g.hd||null, fmt:esCnt("H")},
  {g:"投手", k:"sv",   t:"セーブ", get:g=>g.sv||null, fmt:esCnt("S")},
  {g:"投手", k:"app",  t:"登板", get:g=>g.app||null, fmt:esCnt("試合")}
];
function esRenderRkTabs(){
  const avail=ES_RK.filter(r=>ES.grads.some(g=>r.get(g)!=null));
  if(!avail.some(r=>r.k===ES.rk)) ES.rk=(avail[0]||{}).k;
  const cur=avail.find(r=>r.k===ES.rk), grp=cur?cur.g:"総合";
  const groups=["総合","打撃","投手","能力"].filter(x=>avail.some(r=>r.g===x));
  const box=document.getElementById("es-rk-tabs");
  box.classList.add("es-rk-tabbox");
  box.innerHTML=`<div class="es-rk-grp">${groups.map(x=>`<button type="button" class="es-rk-g${x===grp?" active":""}" data-g="${x}">${x}</button>`).join("")}</div>
    <div class="es-rk-items">${avail.filter(r=>r.g===grp).map(r=>`<button type="button" class="day-tab${r.k===ES.rk?" active":""}" data-k="${r.k}">${r.t}</button>`).join("")}</div>`;
  box.querySelectorAll(".es-rk-g").forEach(b=>b.onclick=()=>{
    ES.rk=avail.find(r=>r.g===b.dataset.g).k; esRenderRkTabs(); esRenderRk();
  });
  box.querySelectorAll(".day-tab").forEach(b=>b.onclick=()=>{
    ES.rk=b.dataset.k;
    box.querySelectorAll(".day-tab").forEach(x=>x.classList.toggle("active", x===b));
    esRenderRk();
  });
}
function esRenderRk(){
  const R=ES_RK.find(r=>r.k===ES.rk);
  if(!R){ document.getElementById("es-rk").innerHTML=errBox("まだ卒業生の記録がありません。"); return; }
  const L=ES.grads.filter(g=>R.get(g)!=null).sort((a,b)=>R.asc?R.get(a)-R.get(b):R.get(b)-R.get(a)).slice(0,10);
  const medal=["🥇","🥈","🥉"];
  document.getElementById("es-rk").innerHTML=L.map((g,i)=>esPl("gm-row", `
      <div class="gm-pos">${i<3?`<span class="rk-medal" aria-label="${i+1}位">${medal[i]}</span>`:i+1}</div>
      <div class="gm-main">
        <div class="gm-title">${escHtml(g.name)}<span class="es-pos sm ${esPosCls(g.pos)}">${escHtml(g.pos)}</span>${esTags(g)}</div>
        <div class="gm-meta">${escHtml(esGradMeta(g))}</div>
      </div>
      <div class="gm-score es-val">${R.fmt(R.get(g))}</div>`, g)).join("");
  document.getElementById("es-rk-note").textContent=[R.note, "選手をタップすると年度ごとの成績と通算が見られます。"].filter(Boolean).join("　");
}

/* ---------- 記録 ---------- */
function esRenderRecords(){
  const G=ES.games, el=document.getElementById("es-records");
  if(!G.length){ el.innerHTML=errBox("まだ試合の記録がありません。"); document.getElementById("es-pw").innerHTML=errBox("相手戦力が入った試合がまだありません。"); return; }
  const st=esStreaks().best;
  const W=G.filter(g=>g.wl==="勝");
  const most=G.slice().sort((a,b)=>b.rs-a.rs||a.no-b.no)[0];
  const big=W.slice().sort((a,b)=>(b.rs-b.ra)-(a.rs-a.ra)||a.no-b.no)[0];
  const has=(g,w)=>g.note.includes(w);
  /* 延長・サヨナラは補足の文字に加えて、イニングスコアからも判定する */
  const num=v=>{ const n=parseInt(String(v).replace(/[^0-9]/g,""),10); return isNaN(n)?0:n; };
  const lastIdx=r=>{ let i=-1; (r.inns||[]).forEach((v,k)=>{ if(String(v).trim()!=="") i=k; }); return i; };
  const isExt=g=>has(g,"延長") || (ES.inn[g.no]||[]).some(r=>lastIdx(r)>=9);
  /* サヨナラ：後攻が最終回（9回以降）の裏に、同点か負けている状態から勝ち越して終わった試合 */
  const isSayo=g=>{ if(has(g,"サヨナラ")) return true; if(has(g,"コールド")) return false;
    const L=ES.inn[g.no]||[], home=L.find(r=>r.side==="後攻"), away=L.find(r=>r.side==="先攻"); if(!home||!away) return false;
    const k=lastIdx(home); if(k<8 || lastIdx(away)>k) return false;
    const lastV=String(home.inns[k]); if(/[✕×xX]/.test(lastV)) return false;
    const hr=home.inns.reduce((a,v)=>a+num(v),0), ar=away.inns.reduce((a,v)=>a+num(v),0);
    return hr>ar && hr-num(lastV)<=ar; };
  const ext=G.filter(isExt), sayo=G.filter(isSayo);
  const recs=[
    {t:"最長連勝", v:`${st.n}<small>連勝</small>`, s: st.from?`${esGameLbl(st.from)}〜${st.to.year}年度 ${st.to.taikai} ${st.to.round}${st.stop?`／止めたのは ${st.stop.opp}`:"／継続中"}`:""},
    {t:"最多得点", v:`${most.rs}<small>点</small>`, s:`vs ${most.opp}（${esGameLbl(most)}・${most.rs}-${most.ra}）`},
    big?{t:"最大点差の勝利", v:`${big.rs-big.ra}<small>点差</small>`, s:`vs ${big.opp}（${esGameLbl(big)}・${big.rs}-${big.ra}）`}:null,
    {t:"完封勝利", v:`${W.filter(g=>g.ra===0).length}<small>試合</small>`, s:"相手を0点に抑えた勝利"},
    {t:"コールド勝ち", v:`${W.filter(g=>has(g,"コールド")).length}<small>試合</small>`, s:"補足に「コールド」とある試合"},
    ext.length?{t:"延長戦", v:`${ext.filter(g=>g.wl==="勝").length}<small>勝</small>${ext.filter(g=>g.wl==="負").length}<small>敗</small>`, s:"10回以上まで行った試合"}:null,
    sayo.length?{t:"サヨナラ", v:`${sayo.filter(g=>g.wl==="勝").length}<small>勝</small>${sayo.filter(g=>g.wl==="負").length}<small>敗</small>`, s:"最終回の裏で決着した試合"}:null,
    G.some(g=>g.power==="S")?{t:"戦力Sの相手", v:`${W.filter(g=>g.power==="S").length}<small>勝</small>${G.filter(g=>g.power==="S"&&g.wl==="負").length}<small>敗</small>`, s:"格上相手の成績"}:null
  ].filter(Boolean);
  el.innerHTML=`<div class="es-recs">${recs.map(r=>`
    <div class="es-rec"><div class="es-rec-t">${r.t}</div><div class="es-rec-v">${r.v}</div><div class="es-rec-s">${escHtml(r.s)}</div></div>`).join("")}</div>`;
  document.getElementById("es-pw").innerHTML = esTeamRankHtml() || errBox("相手戦力が入った試合がまだありません。");
}

/* チームの相手戦力別成績：勝敗・勝率・平均得失点・チーム打率・チーム防御率 */
function esTeamRankHtml(){
  const ks=ES_PW.filter(k=>ES.games.some(g=>g.power===k)); if(!ks.length) return "";
  const rows=ks.map(k=>{
    const G=ES.games.filter(g=>g.power===k), w=G.filter(g=>g.wl==="勝").length, l=G.filter(g=>g.wl==="負").length, d=G.length-w-l;
    const nos=new Set(G.map(g=>g.no)), B=ES.box.filter(b=>nos.has(b.no)), t=esAgg(B);
    const rs=G.reduce((a,g)=>a+g.rs,0), ra=G.reduce((a,g)=>a+g.ra,0);
    return `<tr><th><span class="es-pw pw-${k}">${k}</span></th><td>${G.length}</td><td>${w}-${l}${d?`-${d}`:""}</td>
      <td>${w+l?esAvgFmt(w/(w+l)):"-"}</td><td>${(rs/G.length).toFixed(1)}</td><td>${(ra/G.length).toFixed(1)}</td>
      <td>${esF(t.avg,esAvgFmt)}</td><td>${esF(t.era,v=>v.toFixed(2))}</td></tr>`;
  }).join("");
  return `<div class="es-st-wrap"><table class="es-st-tbl es-pw-tbl es-rank-tbl"><thead><tr><th>戦力</th><th>試合</th><th>勝敗</th><th>勝率</th><th>平均得点</th><th>平均失点</th><th>打率</th><th>防御率</th></tr></thead>
    <tbody>${rows}</tbody></table></div>
    <p class="kk-note-s">打率・防御率は選手成績を入れた試合から計算。</p>`;
}
/* 長いリストは最初の10件だけ見せて、残りは折りたたむ */
function esFoldList(items, render, n, unit){
  n=n||10;
  if(items.length<=n) return items.map(render).join("");
  return items.slice(0,n).map(render).join("") +
    `<details class="es-more"><summary>残り ${items.length-n} ${unit||"件"}を見る</summary>${items.slice(n).map(render).join("")}</details>`;
}
/* ---------- 対戦校 ---------- */
const ES_PREF_ORDER=["北北海道","南北海道","北海道","青森","岩手","宮城","秋田","山形","福島","茨城","栃木","群馬","埼玉","千葉","東東京","西東京","東京","神奈川",
  "新潟","富山","石川","福井","山梨","長野","岐阜","静岡","愛知","三重","滋賀","京都","大阪","兵庫","奈良","和歌山","鳥取","島根","岡山","広島","山口",
  "徳島","香川","愛媛","高知","福岡","佐賀","長崎","熊本","大分","宮崎","鹿児島","沖縄"];
function esOppStats(){
  const m={};
  ES.games.forEach(g=>{ const k=g.opp+"\u0001"+g.oppPref;
    const s=(m[k]=m[k]||{opp:g.opp, pref:g.oppPref, n:0, w:0, l:0, rs:0, ra:0, last:0});
    s.n++; s.rs+=g.rs; s.ra+=g.ra; if(g.wl==="勝") s.w++; if(g.wl==="負") s.l++; if(g.year>s.last) s.last=g.year; });
  return Object.values(m);
}
function esRenderRivals(){
  const el=document.getElementById("es-rivals"), S=esOppStats();
  if(!S.length){ el.innerHTML=errBox("まだ試合の記録がありません。"); return; }
  const top=S.slice().sort((a,b)=>b.n-a.n||b.l-a.l).slice(0,10), max=top[0].n;
  const beat=S.filter(s=>s.l>0).sort((a,b)=>b.l-a.l||a.n-b.n);
  const byPref={}; S.forEach(s=>{ (byPref[s.pref||"不明"]=byPref[s.pref||"不明"]||[]).push(s); });
  const prefs=Object.keys(byPref).sort((a,b)=>{ const ia=ES_PREF_ORDER.indexOf(a), ib=ES_PREF_ORDER.indexOf(b); return (ia<0?99:ia)-(ib<0?99:ib); });
  if(!prefs.includes(ES.oppPref)) ES.oppPref=prefs[0];
  el.innerHTML=`
    <div class="kk-sub es-sub0">よく戦った高校 TOP10</div>
    <div class="mlist">${top.map(s=>esOppRow(s, max)).join("")}</div>
    ${beat.length?`<div class="kk-sub es-sub">黒星をつけられた高校</div>
      <div class="kk-chips">${beat.map(s=>`<span class="kk-chip">${escHtml(s.opp)}<small>${escHtml(s.pref)}・${s.l}敗</small></span>`).join("")}</div>`:""}
    <div class="kk-sub es-sub">都道府県ごとの対戦校</div>
    <div class="trip-selbox"><select id="es-opp-sel" aria-label="都道府県を選ぶ">${prefs.map(p=>{
      const L=byPref[p], n=L.reduce((a,s)=>a+s.n,0);
      return `<option value="${escHtml(p)}"${p===ES.oppPref?" selected":""}>${escHtml(p)}（${L.length}校・${n}試合）</option>`; }).join("")}</select></div>
    <div id="es-opp-list"></div>`;
  const draw=()=>{
    const L=(byPref[ES.oppPref]||[]).slice().sort((a,b)=>b.n-a.n||b.last-a.last), mx=Math.max(1,...L.map(s=>s.n));
    const w=L.reduce((a,s)=>a+s.w,0), l=L.reduce((a,s)=>a+s.l,0);
    document.getElementById("es-opp-list").innerHTML=`
      <div class="stats-row"><div class="stat-chip">対戦校 <strong>${L.length}</strong> 校</div><div class="stat-chip"><strong>${w}</strong> 勝 <strong>${l}</strong> 敗</div></div>
      <div class="mlist">${esFoldList(L, s=>esOppRow(s, mx, true), 10, "校")}</div>`;
  };
  document.getElementById("es-opp-sel").onchange=e=>{ ES.oppPref=e.target.value; draw(); };
  draw();
}
function esOppRow(s, max, detail){
  return `<div class="mlist-row static es-riv">
    <span class="mlist-name"><span class="es-riv-name">${escHtml(s.opp)}</span><span class="mlist-y">${escHtml(detail?`最後の対戦 ${s.last}年度`:s.pref)}</span></span>
    <span class="mlist-bar es"><span style="width:${s.n/max*100}%"></span></span>
    <span class="mlist-val">${s.n}戦<small>${s.w}勝${s.l}敗${detail?`・${s.rs}-${s.ra}`:""}</small></span>
  </div>`;
}

/* ---------- ドラフト ---------- */
function esRenderDraft(){
  const el=document.getElementById("es-draft");
  const P=ES.grads.filter(g=>g.team);
  if(!P.length){ el.innerHTML=errBox("まだプロ入りした卒業生の記録がありません。"); return; }
  const m={}; P.forEach(g=>{ const s=(m[g.team]=m[g.team]||{t:g.team, n:0, first:0}); s.n++; if(g.rank==="1") s.first++; });
  const S=Object.values(m).sort((a,b)=>b.n-a.n||b.first-a.first), max=S[0].n;
  const first=P.filter(g=>g.rank==="1").length;
  if(!ES.draftTeam) ES.draftTeam=S[0].t;
  el.innerHTML=`
    <div class="stats-row">
      <div class="stat-chip">プロ入り <strong>${P.length}</strong> 人</div>
      <div class="stat-chip">ドラフト1位 <strong>${first}</strong> 人</div>
      <div class="stat-chip">卒業生 <strong>${ES.grads.length}</strong> 人</div>
    </div>
    <div class="mlist">${S.map(s=>`
      <button type="button" class="mlist-row es-riv" data-team="${escHtml(s.t)}">
        <span class="mlist-name"><span class="es-riv-name">${escHtml(s.t)}</span></span>
        <span class="mlist-bar es"><span style="width:${s.n/max*100}%"></span></span>
        <span class="mlist-val">${s.n}人<small>1位 ${s.first}人</small></span>
      </button>`).join("")}</div>
    <div class="kk-sub es-sub" id="es-draft-anchor">指名された選手</div>
    <div class="trip-selbox"><select id="es-draft-sel" aria-label="球団を選ぶ">
      <option value="すべて">すべての球団（${P.length}人）</option>
      <option value="1位">ドラフト1位だけ（${first}人）</option>
      ${S.map(s=>`<option value="${escHtml(s.t)}">${escHtml(s.t)}（${s.n}人）</option>`).join("")}
    </select></div>
    <div id="es-draft-list"></div>`;
  const sel=document.getElementById("es-draft-sel");
  const draw=()=>{
    sel.value=ES.draftTeam;
    el.querySelectorAll(".mlist-row[data-team]").forEach(b=>b.classList.toggle("on", b.dataset.team===ES.draftTeam));
    const L=P.filter(g=>ES.draftTeam==="すべて" || (ES.draftTeam==="1位" ? g.rank==="1" : g.team===ES.draftTeam))
      .sort((a,b)=>(a.year||0)-(b.year||0) || (+a.rank||99)-(+b.rank||99));
    document.getElementById("es-draft-list").innerHTML=L.length?esFoldList(L, g=>esPl("gm-row es-dr", `
        <div class="gm-pos es-dr-rank">${g.rank?`${escHtml(g.rank)}<small>位</small>`:"-"}</div>
        <div class="gm-main">
          <div class="gm-title">${escHtml(g.name)}<span class="es-pos sm ${esPosCls(g.pos)}">${escHtml(g.pos)}</span>${esTags(g)}</div>
          <div class="gm-meta">${escHtml([g.year?`${g.year}年度入学`:"", g.from, ES.draftTeam==="すべて"||ES.draftTeam==="1位"?g.team:""].filter(Boolean).join("・"))}</div>
        </div>
        <div class="gm-score es-val">${g.star!=null?`${g.star}<small>★</small>`:""}</div>`, g), 10, "人"):errBox("該当する選手がいません。");
  };
  sel.onchange=()=>{ ES.draftTeam=sel.value; draw(); };
  el.querySelectorAll(".mlist-row[data-team]").forEach(b=>b.onclick=()=>{
    ES.draftTeam=b.dataset.team; draw();
    const a=document.getElementById("es-draft-anchor"), nav=document.querySelector("nav");
    window.scrollTo({ top:Math.max(0, window.scrollY+a.getBoundingClientRect().top-(nav?nav.offsetHeight:0)-8), behavior:prefersReduced()?"auto":"smooth" });
  });
  draw();
}

/* ---------- 初期化 ---------- */
loadTorima();
loadRun();
loadBike();
loadKeiken().then(loadGourmet);
loadEikan();
(function initRouting(){
  const st=parseHash();
  history.replaceState({page:st.page}, "", location.hash||"#"+PAGES[0]);
  applyPage(st.page);
})();
