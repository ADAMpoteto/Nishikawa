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
const PAGES=["torima","run","bike","keiken","gourmet"];
function applyPage(page){
  if(!PAGES.includes(page)) page=PAGES[0];
  document.querySelectorAll(".page").forEach(p=>p.classList.remove("active"));
  document.getElementById(page).classList.add("active");
  document.querySelectorAll(".nav-btn").forEach(b=>b.classList.toggle("active", b.dataset.nav===page));
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
  document.getElementById("kk-pref-anchor").textContent = mode==="gourmet" ? "グルメ地図" : "都道府県";
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
    document.getElementById("kk-stats").innerHTML=`<p class="gm-pref-sum">${escHtml(KK.pref)}：<strong>${shops}</strong>軒・${visited}市区町村${rated.length?`・平均 ${avg.toFixed(2)}`:""}</p>`;
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

function gmRenderTabs(){
  const tabs=["すべて"].concat(gmGenreStats().slice(0,5).map(s=>s.g));
  document.getElementById("gm-tabs").innerHTML=tabs.map(t=>
    `<button type="button" class="day-tab${t===GM.tab?" active":""}" data-t="${escHtml(t)}">${escHtml(t)}</button>`).join("");
  document.querySelectorAll("#gm-tabs .day-tab").forEach(b=>b.onclick=()=>{
    GM.tab=b.dataset.t;
    document.querySelectorAll("#gm-tabs .day-tab").forEach(x=>x.classList.toggle("active", x===b));
    gmRenderRank();
  });
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
  document.getElementById("gm-genre").innerHTML=S.map(s=>`
    <div class="gm-genre">
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

/* ---------- 初期化 ---------- */
loadTorima();
loadRun();
loadBike();
loadKeiken().then(loadGourmet);
(function initRouting(){
  const st=parseHash();
  history.replaceState({page:st.page}, "", location.hash||"#"+PAGES[0]);
  applyPage(st.page);
})();
