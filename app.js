const $=id=>document.getElementById(id);
const KEY='hacchu.db.v3', GAS_KEY='hacchu.gas.url', LOC_KEY='hacchu.loc';
const DEFAULT_LOC={lat:36.1214,lon:139.6015,name:'加須市(埼玉県)'};
const DEFAULT_GAS_URL = 'https://script.google.com/macros/s/AKfycbxtaQ-NAYOwLHK418teJrMXqC9W2THI4qXTf-0iWXQ24oNZBKTglLNZvKU-HloUDGe6/exec';


const b64e=s=>btoa(String.fromCharCode(...new TextEncoder().encode(s)));
const b64d=s=>new TextDecoder().decode(Uint8Array.from(atob(s),c=>c.charCodeAt(0)));

let DB=null, MODE='o', SORT=false, EDIT=null, LOCK_OVERRIDE=false;

function blank(name,icon){return{name,icon,items:[],hist:[],tgt:{},dow:{...DOW0},rat:JSON.parse(JSON.stringify(RAT0)),
  base:0,up:1,cur:{dt:'',v:{}}}}
function fresh(){const g={};GEN.forEach(([k,n,i])=>{g[k]=blank(n,i);if(typeof SEED!=='undefined'&&SEED[k])Object.assign(g[k],SEED[k])});return{v:3,active:'onigiri',g}}
function load(){try{const r=localStorage.getItem(KEY);if(r){DB=JSON.parse(b64d(r));return true}}catch(e){}
  return false}
function save(){try{DB.ts=Date.now();localStorage.setItem(KEY,b64e(JSON.stringify(DB)));
    $('st').textContent=(DB.ts!==DB.syncedTs?'未同期 ':'保存 ')+hm()}
  catch(e){$('st').textContent='保存エラー'}}
function hm(){const n=new Date();return String(n.getHours()).padStart(2,'0')+':'+String(n.getMinutes()).padStart(2,'0')}
function flash(t){$('st').textContent=t;
  setTimeout(()=>$('st').textContent=(DB&&DB.ts!==DB.syncedTs?'未同期 ':'保存 ')+hm(),2500)}
let sT=null;const autosave=()=>{clearTimeout(sT);sT=setTimeout(save,400)};
const G=()=>DB.g[DB.active];
function dlg(id){if(id==='dSet')renderSet();$(id).showModal()}
function toggleTheme(){const r=document.documentElement;
  r.setAttribute('data-theme',r.getAttribute('data-theme')==='dark'?'light':'dark')}

/* ---------- 天気の自動取得（Open-Meteo：APIキー不要） ---------- */
function getLoc(){try{return JSON.parse(localStorage.getItem(LOC_KEY)||'null')||DEFAULT_LOC}catch(e){return DEFAULT_LOC}}
function setLoc(v){localStorage.setItem(LOC_KEY,JSON.stringify(v))}
async function searchLoc(){
  const name=$('loc_name').value.trim();
  if(!name){alert('地域名を入れてください');return}
  $('loc_status').textContent='検索中...';
  try{
    const res=await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=1&language=ja&format=json`);
    const data=await res.json();
    const r=data.results&&data.results[0];
    if(!r){$('loc_status').textContent='見つかりませんでした';return}
    setLoc({lat:r.latitude,lon:r.longitude,name:r.name+(r.admin1?'('+r.admin1+')':'')});
    $('loc_status').textContent='設定済み: '+getLoc().name;
    flash('地域を保存しました');
  }catch(e){$('loc_status').textContent='検索に失敗しました（通信環境をご確認ください）'}
}
function wmoLabel(c){
  if(c===0||c===1)return '晴';
  if(c===2||c===3||c===45||c===48)return '曇';
  if([71,73,75,77,85,86].includes(c))return '雪';
  if([51,53,55,56,57,61,63,65,66,67,80,81,82,95,96,99].includes(c))return '雨';
  return '曇'}
async function fetchWeather(){
  const loc=getLoc();
  if(!loc){alert('先に「設定」から地域を登録してください');dlg('dSet');return}
  if(!$('dt').value.trim()){
    const tmr=new Date(Date.now()+86400000);
    $('dt').value=(tmr.getMonth()+1)+'/'+tmr.getDate();
    G().cur.dt=$('dt').value;applyDow();$('tq').value='';$('ta').value='';
  }
  const m=($('dt').value||'').trim().match(/(\d{1,2})\s*[\/月]\s*(\d{1,2})/);
  if(!m){alert('納品日を「8/21」のように入力してください');return}
  const now=new Date();let y=now.getFullYear(),mo=+m[1],da=+m[2];
  if(now.getMonth()+1>=11&&mo<=2)y++;
  const dateStr=y+'-'+String(mo).padStart(2,'0')+'-'+String(da).padStart(2,'0');
  flash('天気を取得中...');
  try{
    const url=`https://api.open-meteo.com/v1/forecast?latitude=${loc.lat}&longitude=${loc.lon}&hourly=weathercode&timezone=Asia%2FTokyo&start_date=${dateStr}&end_date=${dateStr}`;
    const res=await fetch(url);
    const data=await res.json();
    const codes=data.hourly&&data.hourly.weathercode;
    if(!codes||codes.length<18){alert('天気予報の取得範囲外でした（直近16日以内の日付のみ対応）');flash('取得失敗');return}
    // 朝(7時=1便の売れ筋帯)/昼(12時=2便)/夕(17時=3便)の3時点で代表させる
    $('wthr').value=`朝${wmoLabel(codes[7])}/昼${wmoLabel(codes[12])}/夕${wmoLabel(codes[17])}`;
    G().cur.wthr=$('wthr').value;renderSetup();autosave();
    flash('天気を取得しました');
  }catch(e){alert('天気の取得に失敗しました。通信環境をご確認ください');flash('取得失敗')}
}

/* ---------- クラウド同期 (CORS完全回避版) ---------- */
function getGasUrl(){return localStorage.getItem(GAS_KEY)||DEFAULT_GAS_URL}
function saveGasUrl(){const u=$('gas_url').value.trim();localStorage.setItem(GAS_KEY,u);flash('同期URL保存');alert('同期URLを設定しました')}

async function cloudSave(){
  const url=getGasUrl();
  if(!url){alert('先に「設定」からGASウェブアプリURLを登録してください');dlg('dSet');return}
  $('st').textContent='保存中...';
  try{
    await fetch(url,{
      method:'POST',
      mode:'no-cors',
      headers:{'Content-Type':'text/plain;charset=utf-8'},
      body:JSON.stringify(DB)
    });
    flash('☁️ クラウド保存完了');
  }catch(e){alert('クラウド保存に失敗しました');flash('保存失敗')}
}

/* 同期＝端末保存＋クラウド保存を1ボタンで。失敗時は端末保存のままにして後で再同期 */
async function syncCloud(){
  save();
  const url=getGasUrl();
  if(!url){alert('先に「設定」からGASウェブアプリURLを登録してください');dlg('dSet');return}
  // 空データでクラウドを上書きしてしまう事故を防ぐ
  const totalItems=Object.values(DB.g||{}).reduce((a,g)=>a+((g.items||[]).length),0);
  const totalHist=Object.values(DB.g||{}).reduce((a,g)=>a+((g.hist||[]).length),0);
  if(totalItems===0&&totalHist===0){
    if(!confirm('この端末のデータが空です。このまま同期するとクラウドのデータが空で上書きされます。\n\n（データを取り戻したい場合は「キャンセル」→設定→「クラウドから読み込む（復元）」を押してください）\n\n本当に空のまま同期しますか？'))return;
  }
  $('st').textContent='同期中...';
  try{
    DB.pendingSync=false;DB.ts=Date.now();DB.syncedTs=DB.ts;
    await fetch(url,{method:'POST',mode:'no-cors',
      headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(DB)});
    localStorage.setItem(KEY,b64e(JSON.stringify(DB)));
    flash('☁️ 同期完了 '+hm());
  }catch(e){
    DB.pendingSync=true;save();
    flash('⚠ 端末に一時保存');
    alert('クラウドに接続できませんでした。データは端末に一時保存されています。通信が戻ったらもう一度「☁️ 同期」を押してください。');
  }
}

/* 起動時：クラウドの方が新しければ自動で読み込む（他の人の端末で同期された更新を反映）
   syncedTs＝最後にこの端末が同期した時点のts。クラウドのtsがそれと違えば
   「他の端末で更新された」と判断して取り込む */
function cloudLoadSilent(){
  const url=getGasUrl();if(!url)return;
  const cb='gasBoot_'+Date.now();
  const s=document.createElement('script');
  window[cb]=function(data){
    delete window[cb];if(s.parentNode)s.parentNode.removeChild(s);
    if(!data||!data.g)return;
    const cloudItems=Object.values(data.g).reduce((a,g)=>a+((g.items||[]).length),0);
    const localItems=Object.values(DB.g||{}).reduce((a,g)=>a+((g.items||[]).length),0);
    if(cloudItems===0&&localItems>0)return; // 空データで端末を上書きしない
    if(DB.pendingSync&&localItems>0)return; // 未同期の変更が端末にある場合は上書きしない
    const localSynced=DB.syncedTs||0;
    if((data.ts||0)!==localSynced){
      const keepUrl=localStorage.getItem(GAS_KEY);
      DB=data;DB.syncedTs=data.ts||0;save();
      if(keepUrl)localStorage.setItem(GAS_KEY,keepUrl);
      renderAll();flash('☁️ 最新データを反映');
    }
  };
  s.src=url+(url.includes('?')?'&':'?')+'callback='+cb+'&t='+Date.now();
  s.onerror=function(){delete window[cb];if(s.parentNode)s.parentNode.removeChild(s)};
  document.body.appendChild(s);
}

function cloudLoad(){
  const url=getGasUrl();
  if(!url){alert('先に「設定」からGASウェブアプリURLを登録してください');dlg('dSet');return}
  $('st').textContent='読込中...';
  
  const cbName = 'gasCallback_' + Date.now();
  let done=false;
  const timer=setTimeout(()=>{
    if(done)return;done=true;
    delete window[cbName];
    if(script.parentNode) script.parentNode.removeChild(script);
    alert('クラウドから応答がありませんでした。通信環境かGASのデプロイ設定をご確認ください。');
    flash('読込タイムアウト');
  },15000);
  window[cbName] = function(data){
    if(done)return;done=true;clearTimeout(timer);
    delete window[cbName];
    if(script.parentNode) script.parentNode.removeChild(script);
    const cloudN=data&&data.g?Object.values(data.g).reduce((a,g)=>a+((g.items||[]).length),0):0;
    if(data && data.g && cloudN===0){
      alert('クラウドのデータが空でした（商品0品）。\n復元できるデータがないため、この端末のデータはそのままにします。');
      flash('読込(空)');
      return;
    }
    if(data && data.g){
      const keepUrl=localStorage.getItem(GAS_KEY);
      DB = data;
      DB.syncedTs = data.ts||0;
      DB.pendingSync = false;
      save();
      if(keepUrl)localStorage.setItem(GAS_KEY,keepUrl);
      renderAll();
      $('dSet').close();
      const n=Object.values(DB.g||{}).reduce((a,g)=>a+((g.items||[]).length),0);
      flash('☁️ 読込完了');
      alert(`クラウドから読み込みました（商品${n}品）`);
    }else{
      alert('Googleドライブに有効なデータがありませんでした');
      flash('読込完了(空)');
    }
  };
  
  const script = document.createElement('script');
  script.src = url + (url.includes('?') ? '&' : '?') + 'callback=' + cbName + '&t=' + Date.now();
  script.onerror = function(){
    if(done)return;done=true;clearTimeout(timer);
    delete window[cbName];
    if(script.parentNode) script.parentNode.removeChild(script);
    alert('クラウド読込に失敗しました。GASのデプロイ設定をご確認ください。');
    flash('読込失敗');
  };
  document.body.appendChild(script);
}

/* ---------- 写真OCR読み取り処理 ---------- */
async function handleImage(input){
  if(!input.files||!input.files[0])return;
  const file=input.files[0];
  const st=$('ocrst');
  if(typeof Tesseract==='undefined'){
    st.className='note crit';
    st.textContent='✕ 文字解析ライブラリを読み込めませんでした。通信環境をご確認のうえページを再読み込みしてください。';
    input.value='';
    return;
  }
  st.className='note warn';
  st.textContent='解析中... 0%（写真の内容により10〜30秒ほどかかります）';
  $('st').textContent='解析中...';
  try{
    const res=await Tesseract.recognize(file,'jpn+eng',{
      logger:m=>{
        if(m.status==='recognizing text'){
          st.textContent=`解析中... ${Math.round((m.progress||0)*100)}%`;
        }
      }
    });
    const txt=res.data.text;
    $('out').value="【写真から読み取ったテキスト】\n"+txt;
    $('out').scrollIntoView({behavior:'smooth',block:'center'});
    st.className='note ok';
    st.textContent='✓ 解析完了。下の書き出し枠にテキストを入れました。コピーしてAIチャットに貼ってください。';
    flash('写真解析完了');
  }catch(e){
    st.className='note crit';
    st.textContent='✕ 写真の読み取りに失敗しました：'+(e&&e.message?e.message:'不明なエラー');
    flash('解析失敗');
  }
  input.value='';
}

/* ---------- 曜日・マニュアル公式学習 ---------- */
function dowOf(t){t=(t||'').trim();let m=t.match(/[（(]?([月火水木金土日])[）)]?/);if(m)return m[1];
  m=t.match(/(\d{1,2})\s*[\/月]\s*(\d{1,2})/);
  if(m){
    const now=new Date(),curM=now.getMonth()+1,inM=+m[1];
    let y=now.getFullYear();
    if(curM>=11&&inM<=2)y++;
    return '日月火水木金土'[new Date(y,inM-1,+m[2]).getDay()]}
  return null}
/* AI推奨は学習データからGW/お盆/年末年始を除外しているため、この期間は意思入れが必須（マニュアル準拠） */
function specialPeriod(t){
  const m=(t||'').trim().match(/(\d{1,2})\s*[\/月]\s*(\d{1,2})/);
  if(!m)return null;
  const mo=+m[1],d=+m[2];
  if((mo===4&&d>=29)||(mo===5&&d<=5))return 'GW';
  if(mo===8&&d>=13&&d<=16)return 'お盆';
  if((mo===12&&d>=29)||(mo===1&&d<=3))return '年末年始';
  return null}
/* 締切ロック：1便は発注日10:00、2便/3便は15:00でストコンへ送信済みとなり編集不可（マニュアル準拠） */
function lockState(){
  if(LOCK_OVERRIDE)return{c0:false,c12:false};
  const t=new Date().getHours()*60+new Date().getMinutes();
  return{c0:t>=600,c12:t>=900}}
function learnDow(){const g=G(),by={},all=[];
  g.hist.forEach(h=>{const d=dowOf(h.d);if(!d||h.s==null)return;(by[d]=by[d]||[]).push(h.s);all.push(h.s)});
  if(all.length<7)return null;
  const avg=all.reduce((a,b)=>a+b,0)/all.length,out={},cnt={};
  Object.keys(by).forEach(d=>{if(by[d].length>=2){out[d]=+(by[d].reduce((a,b)=>a+b,0)/by[d].length/avg).toFixed(3);cnt[d]=by[d].length}});
  return Object.keys(out).length>=4?{f:out,cnt}:null}
function dowInfo(){const d=dowOf($('dt').value);if(!d)return null;
  const L=learnDow(),g=G();
  const f=(L&&L.f[d])||g.dow[d]||1, src=(L&&L.f[d])?('自店'+L.cnt[d]+'日から学習'):'初期値';
  const r=d==='土'?g.rat.sat:d==='日'?g.rat.sun:g.rat.weekday;
  return{d,f,r,src,type:d==='土'?'土曜型':d==='日'?'日曜型':'平日型'}}
const WTHR_F={'晴':1.05,'曇':0.97,'雨':0.90,'雪':0.82};
function weatherFactor(t,r){t=(t||'').trim();if(!t)return 1;
  const m=t.match(/朝(晴|曇|雨|雪).*昼(晴|曇|雨|雪).*夕(晴|曇|雨|雪)/);
  if(m){const w=r?[r[0]/100,r[1]/100,r[2]/100]:[1/3,1/3,1/3];
    return WTHR_F[m[1]]*w[0]+WTHR_F[m[2]]*w[1]+WTHR_F[m[3]]*w[2]}
  if(/雪/.test(t))return 0.82;
  if(/雨/.test(t))return 0.90;
  if(/曇/.test(t))return 0.97;
  if(/晴/.test(t))return 1.05;
  return 1}
function demand(){
  const g=G(),i=dowInfo();if(!i)return null;
  let b=Number(g.base)||0; if(!b)return null;
  let up=Number(g.up)||1;
  if(DB.active==='chilled'&&i.d==='月'){up*=1.5}
  const wf=weatherFactor($('wthr').value,i.r);
  return{q:Math.round(b*i.f*up*wf),
    src:`週平均${b}個 × ${i.d}曜${i.f.toFixed(2)}`+(up!==1?` × 倍率${up.toFixed(2)}`:'')+(wf!==1?` × 天気${wf.toFixed(2)}`:'')}}
function applyDow(){const i=dowInfo();if(!i)return null;
  $('r1').value=i.r[0];$('r2').value=i.r[1];$('r3').value=i.r[2];return i}
function tgtKey(){const m=($('dt').value||'').match(/(\d{1,2})\s*[\/月]\s*(\d{1,2})/);return m?(+m[1]+'/'+ +m[2]):null}

/* ---------- 集計・AI採用率 ---------- */
const vv=(id,m)=>{const o=G().cur.v[id];return (o&&o[m])||[null,null,null]};
function setV(id,m,i,x){const c=G().cur.v;c[id]=c[id]||{o:[null,null,null],i:[null,null,null],a:[null,null,null]};
  c[id][m]=c[id][m]||[null,null,null];c[id][m][i]=x}
function sums(m){const g=G(),b=[0,0,0];let amt=0,n=0;
  g.items.forEach(r=>{const v=vv(r.id,m);if(!v.some(x=>x!==null))return;
    v.forEach((x,i)=>b[i]+=(x||0));const t=v.reduce((a,c)=>a+(c||0),0);amt+=(r.price||0)*t;if(t)n++});
  return{b,T:b[0]+b[1]+b[2],amt,n}}

function getAiAdoption(){
  const g=G();let match=0,total=0;
  g.items.forEach(r=>{
    const vo=vv(r.id,'o'), vi=vv(r.id,'i');
    if(vi.some(x=>x!==null)){
      total++;
      if(vo[0]===vi[0]&&vo[1]===vi[1]&&vo[2]===vi[2]) match++;
    }
  });
  if(!total) return null;
  const rate=Math.round((match/total)*100);
  let label='適正（利益最大ゾーン 70-80%）', cls='ok';
  if(rate>85){label='ストコンAI依存過多（利益低下リスク）';cls='crit'}
  else if(rate<65){label='意思入れ強め';cls='warn'}
  return {rate,label,cls,match,total};
}

/* ---------- 描画 ---------- */
function renderTabs(){const el=$('tabs');el.textContent='';
  GEN.forEach(([k,n,ic])=>{const g=DB.g[k];const b=document.createElement('button');
    b.className='tab';b.setAttribute('aria-selected',String(k===DB.active));
    b.onclick=()=>{DB.active=k;save();renderAll()};
    const a=document.createElement('div');a.className='ic';a.textContent=ic;
    const c=document.createElement('div');c.className='nm';c.textContent=n;
    const d=document.createElement('div');d.className='ct';d.textContent=g.items.length?g.items.length+'品':'—';
    b.append(a,c,d);el.appendChild(b)});
  $('title').textContent=G().icon+' '+G().name+' 発注'}

function renderSetup(){
  const g=G(),i=dowInfo(),k=tgtKey(),t=k?g.tgt[k]:null,s=sums('o');
  const D=demand(); const dem=D?D.q:null, demSrc=D?D.src:'';
  const aiAdp=getAiAdoption();
  if(t){if(!$('tq').value)$('tq').value=t.q;if(!$('ta').value)$('ta').value=t.a}
  const sp=specialPeriod($('dt').value);
  const LK=lockState();
  const lockTxt=LK.c12?'🔒 1便・2便・3便とも締切済（15:00）':LK.c0?'🔒 1便のみ締切済（10:00）／2便・3便は15:00まで編集可':'🔓 全便編集可（1便は10:00、2便・3便は15:00締切）';
  const rows=[
    ['納品日',$('dt').value.trim()||'未入力',$('dt').value.trim()?'':'warn'],
    ['曜日係数',i?`${i.d}曜 ${i.f.toFixed(2)}（${i.src}）`:'納品日を入れてください',i?'':'warn'],
    ['便構成比',i?`${i.type} ${i.r[0]}/${i.r[1]}/${i.r[2]}%`:'—',i?'ok':'warn'],
    ['締切状況',lockTxt+(LOCK_OVERRIDE?'（手動解除中）':''),LK.c0?'warn':'ok'],
    ['ストコンAI採用率',aiAdp?`${aiAdp.rate}% (${aiAdp.match}/${aiAdp.total}品) - ${aiAdp.label}`:'ストコンAI推奨未入力',aiAdp?aiAdp.cls:'warn'],
    ['本部目標',t?`${t.q}個 / ${(t.a||0).toLocaleString()}円`:(k?k+'は未登録':'—'),t?'':'warn'],
    ['今日の需要見込み（提案数）',dem?`${dem}個（${demSrc}）`:'—',dem?'':'warn'],
    ['発注中',s.T?`${s.n}品 ${s.T}個 ${s.amt.toLocaleString()}円（${s.b.join('/')}）`:'まだ空です',s.T?'ok':'warn']
  ];
  if(sp)rows.splice(2,0,['特殊カレンダー',`${sp}期間：ストコンAIの学習対象外のため意思入れ必須`,'crit']);
  // 数日おきに発注するカテゴリ向け：期限内に売り切れる上限と、次回までに必要な数
  const cyc=Number(g.cycle)||0, shelf=Number(g.shelf)||0;
  if(cyc>1&&shelf>0&&dem){
    const need=Math.round(dem*cyc);          // 次回発注日まで持たせるのに必要な数
    const cap=Math.round(dem*shelf);          // 期限内に売り切れる上限
    const over=need-cap;
    rows.splice(rows.length-1,0,['期限と発注間隔',
      over>0
        ? `${cyc}日分=${need}個 必要だが期限${shelf}日で売り切れるのは${cap}個まで。${over}個は期限切れリスク（分けて発注を検討）`
        : `${cyc}日分=${need}個（期限${shelf}日で${cap}個まで売り切れる範囲内）`,
      over>0?'warn':'ok']);
    // 初日にどれだけ売れるかを見て、次回発注日まで在庫がもつか判定する
    const r1=(i&&i.r)?i.r[0]/100:0.59;        // 1便構成比＝初日に集中する割合の目安
    const day1=Math.round(dem*(1+r1));        // 初日に売れる想定（当日需要＋翌朝の立ち上がり分）
    if(s.T){
      const left=s.T-day1;
      const daysLeft=dem>0?(s.T/dem):0;
      rows.splice(rows.length-1,0,['在庫のもち',
        left<=0
          ? `発注${s.T}個は初日想定${day1}個で尽きる見込み。次回発注(${cyc}日後)まで欠品`
          : daysLeft<cyc
            ? `発注${s.T}個は約${daysLeft.toFixed(1)}日分。次回発注(${cyc}日後)まで${(cyc-daysLeft).toFixed(1)}日ぶん不足`
            : `発注${s.T}個は約${daysLeft.toFixed(1)}日分。次回発注(${cyc}日後)まで在庫はもつ見込み`,
        (left<=0||daysLeft<cyc)?'crit':'ok']);
    }
  }
  if(g.binNote)rows.splice(rows.length-1,0,['便構成',g.binNote,'']);
  const aiT=['ai1','ai2','ai3'].reduce((a,id)=>a+(Number($(id).value)||0),0);
  if(aiT&&dem){
    const diff=Math.round((dem-aiT)/aiT*100);
    const close=Math.abs(diff)<=15;
    rows.splice(rows.length-1,0,['提案数とストコンAIの差',`提案${dem}個 / AI${aiT}個（${diff>0?'+':''}${diff}%）${close?'・近い':'・差が大きい'}`,close?'ok':'warn']);
  }
  const B=$('setup');B.textContent='';
  rows.forEach(([a,c,st])=>{const w=document.createElement('div');w.className='row';
    const x=document.createElement('div');x.className='k';x.textContent=a;
    const y=document.createElement('div');y.className='v '+(st||'');y.textContent=c;
    w.append(x,y);B.appendChild(w)});
  const m=$('setupmsg');
  if(!i){m.className='note warn';m.textContent='▲ 納品日を入れると曜日係数と便構成比が入ります'}
  else if(!s.T){m.className='note warn';m.textContent='▲ 目標を入れて「配分」を押してください'}
  else{m.className='note ok';m.textContent='✓ 準備できています'}}

function renderItems(){
  const g=G();
  const H=$('ith');H.textContent='';
  const hr=document.createElement('tr');
  const showOther=!SORT;
  const cols=SORT?['','商品',' ','1便','2便','3便','計']:['商品','適','1便','2便','3便','計',...(showOther?['他']:[])];
  cols.forEach((c,ix)=>{const th=document.createElement('th');th.textContent=c;
    if((SORT&&ix===1)||(!SORT&&ix===0))th.className='l';
    if(!SORT&&showOther&&ix===cols.length-1)th.className='col-other';
    hr.appendChild(th)});
  H.appendChild(hr);
  const B=$('itb');B.textContent='';
  if(!g.items.length){const tr=document.createElement('tr');const td=document.createElement('td');
    td.colSpan=7;td.className='l';td.style.padding='18px 6px';td.style.color='var(--muted)';
    td.textContent='まだ商品がありません。「＋商品」から登録するか、バックアップを読み込んでください。';
    tr.appendChild(td);B.appendChild(tr);return}
  g.items.forEach((r,ix)=>{
    const tr=document.createElement('tr');
    if(SORT){
      const t0=document.createElement('td');const w=document.createElement('div');w.className='mv';
      const up=document.createElement('button');up.className='gh';up.textContent='▲';
      up.onclick=()=>mv(ix,-1);const dn=document.createElement('button');dn.className='gh';dn.textContent='▼';
      dn.onclick=()=>mv(ix,1);w.append(up,dn);t0.appendChild(w);tr.appendChild(t0)}
    const t1=document.createElement('td');t1.className='l nmcell';
    const n1=document.createElement('div');n1.className='nm1';
    if(r.tag){
      const isNew=r.tag.includes('新');
      const sp=document.createElement('span');
      sp.className='pill '+(isNew?'pill-warn':'');
      sp.textContent=r.tag+(isNew?' ⚠':'');
      if(isNew)sp.title='新商品2週目は注意（施策終了後は推奨が多く出やすい）';
      n1.appendChild(sp)}
    const nameSp=document.createElement('span');nameSp.className='nm1-name';nameSp.textContent=r.name;
    n1.appendChild(nameSp);
    const wf=wasteFactor(r);
    const infoParts=['¥'+(r.price||0)+' 日販'+(r.day||0)+((r.unit||1)>1?' 2個単位':'')];
    if(r.memo)infoParts.push(r.memo);
    if(r.my)infoParts.push('本部目安'+r.my+'個');
    if(wf<1)infoParts.push(`廃棄実績${Math.round((1-wf)*100)}%減`);
    // 蓄積した週次データが2週分以上あれば、前週との増減を表示
    const trend=itemTrend(g,r.name);
    if(trend.length>=2){
      const a=trend[trend.length-1].sales,b=trend[trend.length-2].sales;
      if(b>0){const d=Math.round((a-b)/b*100);
        if(Math.abs(d)>=10)infoParts.push(`前週比${d>0?'+':''}${d}%(${b}→${a})`)}
    }
    const n2=document.createElement('div');n2.className='nm2'+(wf<1?' nm2-warn':'');
    n2.textContent=infoParts.join(' ・ ');
    t1.append(n1,n2);
    t1.onclick=()=>{if(SORT)editItem(ix)};
    tr.appendChild(t1);
    const t2=document.createElement('td');
    if(SORT){const b=document.createElement('button');b.className='gh sm';b.textContent='編集';
      b.onclick=()=>editItem(ix);t2.appendChild(b)}
    else{const sp=document.createElement('span');
      sp.className='gr '+({'◎':'g4c','○':'g3c','△':'g2c','×':'g1c','新':'gnc'}[r.grade]||'g2c');
      sp.textContent=r.grade||'—';t2.appendChild(sp)}
    tr.appendChild(t2);
    const v=vv(r.id,MODE);
    const LK=MODE==='o'?lockState():{c0:false,c12:false};
    for(let i=0;i<3;i++){const td=document.createElement('td');
      const inp=document.createElement('input');inp.type='number';inp.inputMode='numeric';
      inp.dataset.row=ix;inp.dataset.col=i;
      inp.value=v[i]===null?'':v[i];
      if((r.unit||1)>1&&v[i]!=null&&v[i]%r.unit!==0){
        inp.classList.add('bad-unit');inp.title=`${r.unit}個単位です`}
      const locked=(i===0&&LK.c0)||(i>0&&LK.c12);
      if(locked){inp.disabled=true;inp.classList.add('locked');inp.title='締切済のため編集できません'}
      inp.onfocus=e=>e.target.select();
      inp.onkeydown=e=>{
        const rIx=+e.target.dataset.row, cIx=+e.target.dataset.col;
        if(e.key==='Enter'||e.key==='ArrowDown'){
          e.preventDefault();
          let nxt=cIx<2?document.querySelector(`input[data-row="${rIx}"][data-col="${cIx+1}"]`)
                       :document.querySelector(`input[data-row="${rIx+1}"][data-col="0"]`);
          if(nxt)nxt.focus();
        }else if(e.key==='ArrowUp'){
          e.preventDefault();
          let prev=cIx>0?document.querySelector(`input[data-row="${rIx}"][data-col="${cIx-1}"]`)
                        :document.querySelector(`input[data-row="${rIx-1}"][data-col="2"]`);
          if(prev)prev.focus();
        }
      };
      inp.onchange=e=>{const x=e.target.value===''?null:Number(e.target.value);
        setV(r.id,MODE,i,x);paintTotals();autosave()};
      td.appendChild(inp);tr.appendChild(td)}
    const t6=document.createElement('td');t6.className='tot';
    t6.textContent=v.reduce((a,c)=>a+(c||0),0)||'';tr.appendChild(t6);
    if(showOther){const t7=document.createElement('td');t7.className='col-other';t7.style.fontSize='11px';t7.style.color='var(--muted)';
      const oth=MODE==='o'?['i']:['o'];
      t7.textContent=oth.map(m=>{const x=vv(r.id,m).reduce((a,c)=>a+(c||0),0);return x||'-'}).join('/');
      tr.appendChild(t7)}
    B.appendChild(tr)});
  addSum()}
function addSum(){const s=sums(MODE),tr=document.createElement('tr');tr.className='sum';
  const c=(t,cl)=>{const td=document.createElement('td');td.textContent=t;if(cl)td.className=cl;tr.appendChild(td)};
  const showOther=!SORT;
  if(SORT)c('');c('合計 '+s.n+'品','l');c('');
  c(s.b[0]);c(s.b[1]);c(s.b[2]);c(s.T);
  if(showOther)c(s.amt.toLocaleString(),'col-other');
  $('itb').appendChild(tr)}
function paintTotals(){renderItems();renderSetup()}
function mv(i,d){const a=G().items;const j=i+d;if(j<0||j>=a.length)return;
  [a[i],a[j]]=[a[j],a[i]];renderItems();autosave()}
function toggleSort(){SORT=!SORT;$('sortb').textContent='並べ替え：'+(SORT?'ON':'OFF');
  $('sortb').setAttribute('aria-pressed',String(SORT));renderItems()}
function setMode(m){MODE=m;['o','i'].forEach(k=>$('m_'+k).setAttribute('aria-pressed',String(k===m)));renderItems()}
function toggleLockOverride(){LOCK_OVERRIDE=!LOCK_OVERRIDE;
  $('lockb').textContent=LOCK_OVERRIDE?'🔓 締切ロック解除中':'🔒 締切ロック解除';
  $('lockb').setAttribute('aria-pressed',String(LOCK_OVERRIDE));paintTotals()}
function fillFrom(src){G().items.forEach(r=>{const v=vv(r.id,src);
  if(v.some(x=>x!==null))v.forEach((x,i)=>setV(r.id,MODE,i,x))});paintTotals();autosave();flash('コピーしました')}
function clearMode(){G().items.forEach(r=>{const c=G().cur.v[r.id];if(c)c[MODE]=[null,null,null]});
  paintTotals();autosave()}

function renderHist(){const B=$('htb');B.textContent='';
  G().hist.forEach((h,i)=>{const tr=document.createElement('tr');
    const c=(t,cl)=>{const td=document.createElement('td');td.textContent=t;if(cl)td.className=cl;tr.appendChild(td);return td};
    c(h.d,'l');c(h.ai??'—');c(h.n??'—');c(h.s??'—');c(h.ha??'—');
    c(h.n&&h.s?(h.s/h.n*100).toFixed(1)+'%':'—');
    c(h.nb?h.nb.map(x=>x??'-').join('/'):'—');
    const x=c('');const b=document.createElement('button');b.className='gh sm';b.textContent='×';
    b.onclick=()=>{G().hist.splice(i,1);renderHist();autosave()};x.appendChild(b);
    B.appendChild(tr)})}

function renderAll(){renderTabs();
  const g=G();$('dt').value=g.cur.dt||'';
  $('wthr').value=g.cur.wthr||'';
  const ai=g.cur.ai||[null,null,null];
  $('ai1').value=ai[0]??'';$('ai2').value=ai[1]??'';$('ai3').value=ai[2]??'';
  $('aiver').value=g.cur.aiVer||'';
  applyDow();renderItems();renderHist();renderSetup();renderWeekly()}

/* ---------- 廃棄実績×値入率による発注数の利益ベース補正 ---------- */
function wasteFactor(r){
  if(!r.pos||r.margin==null)return 1;
  const sales=(r.pos.sales||[]).reduce((a,x)=>a+(x||0),0);
  const waste=(r.pos.waste||[]).reduce((a,x)=>a+(x||0),0);
  if(waste<=0||sales+waste<=0)return 1;
  const wasteRatio=waste/(sales+waste);
  const costRatio=1-r.margin/100, profitRatio=r.margin/100;
  if(profitRatio<=0)return 1;
  const reduce=Math.min(0.3,wasteRatio*(costRatio/profitRatio));
  return 1-reduce;
}
function edayOf(r){return (r.day||0)*wasteFactor(r)}

/* ---------- 公式マニュアル準拠：売筋上位50%傾斜配分 ---------- */
function fix2(v,unit){if((unit||1)<2)return v.slice();v=v.slice();const T=v.reduce((a,b)=>a+b,0);
  if(!v.includes(1))return v;if(T<=1)return[0,0,0];
  const o=[0,1,2].sort((a,b)=>v[b]-v[a]||a-b),k=Math.min(3,Math.floor(T/2)),use=o.slice(0,k);
  const w=use.map(i=>Math.max(v[i],.5)),W=w.reduce((a,b)=>a+b,0),out=[0,0,0];let rem=T;
  use.forEach((i,ix)=>{let q;if(ix===use.length-1)q=rem;
    else{q=Math.max(2,Math.round(T*w[ix]/W));q=Math.min(q,rem-2*(use.length-ix-1))}out[i]=q;rem-=q});
  return out}

function alloc(){
  const g=G();if(!g.items.length){alert('先に商品を登録してください');return}
  applyDow();
  let tq=Number($('tq').value)||0;const ta=Number($('ta').value)||0;
  const live=g.items.filter(r=>(r.day||0)>0);
  if(!live.length){alert('日販が入っている商品がありません');return}
  const W=live.reduce((a,r)=>a+edayOf(r),0);
  let usedDemand=false;
  if(!tq&&!ta){
    const D=demand();
    if(!D){alert('目標個数か金額を入れてください（天気・曜日から提案するには設定で週平均販売数を登録してください）');return}
    if(!confirm(`目標が未入力です。天気・曜日からの提案数(${D.q}個)を使って全商品の発注数を配分しますか？`))return;
    tq=D.q;usedDemand=true;
  }
  let target=tq||Math.round(ta/(live.reduce((a,r)=>a+r.price*r.day,0)/live.reduce((a,r)=>a+r.day,0)));

  const sorted=[...live].sort((a,b)=>edayOf(b)-edayOf(a));
  const topCount=Math.max(1,Math.ceil(sorted.length*0.5));
  const topIds=new Set(sorted.slice(0,topCount).map(r=>r.id));

  const base={},q={};
  const W_top=sorted.slice(0,topCount).reduce((a,r)=>a+edayOf(r),0);
  const minBotTotal=sorted.slice(topCount).reduce((a,r)=>a+Math.round(edayOf(r)),0);
  const allocTop=Math.max(0,target-minBotTotal);

  live.forEach(r=>{
    if(topIds.has(r.id)){
      base[r.id]=W_top>0?(edayOf(r)/W_top*allocTop):edayOf(r);
    }else{
      base[r.id]=Math.max(1,Math.round(edayOf(r)));
    }
    q[r.id]=Math.max(r.my||1,Math.round(base[r.id]));
  });

  const S=()=>live.reduce((a,r)=>a+q[r.id],0);
  let gd=0;
  while(S()>target&&gd++<900){
    const k=live.filter(r=>q[r.id]>Math.max(r.my||1,1))
      .sort((a,b)=>(q[b.id]-base[b.id])-(q[a.id]-base[a.id]))[0];if(!k)break;q[k.id]--}
  gd=0;
  while(S()<target&&gd++<900){
    const k=live.slice().sort((a,b)=>(base[b.id]-q[b.id])-(base[a.id]-q[a.id]))[0];q[k.id]++}
  const T=S();

  const gv=(id,d)=>{const v=$(id).value.trim();return v===''?d:Number(v)};
  const R=[gv('r1',59),gv('r2',24),gv('r3',17)],RS=R[0]+R[1]+R[2];
  const p1=R[0]/RS,p2=R[1]/RS,p3=R[2]/RS;
  const n3=p3<=0?0:Math.max(2,Math.round(T*p3/2));
  const top3=n3===0?[]:live.slice().sort((a,b)=>q[b.id]-q[a.id]).filter(r=>q[r.id]>=6).slice(0,n3).map(r=>r.id);
  
  g.items.forEach(r=>{
    if(!(r.id in q)){setAll(r.id,[0,0,0]);return}
    const t3=top3.includes(r.id)?2:0,rest=Math.max(0,q[r.id]-t3);
    const t2=Math.round(rest*(p2/(p1+p2))),t1=rest-t2;
    setAll(r.id,fix2([t1,t2,t3],r.unit))});
  
  MODE='o';setMode('o');paintTotals();autosave();
  const s=sums('o');
  $('allocnote').className='note ok';
  $('allocnote').textContent=`${s.T}個 / ${s.amt.toLocaleString()}円　便別${R.join('/')}%`
    +(usedDemand?`　※目標未入力のため天気・曜日からの提案数(${tq}個)を使用`:'')
    +(tq&&!usedDemand?`　個数目標の${Math.round(s.T/tq*100)}%`:'')+(ta?`　金額目標の${Math.round(s.amt/ta*100)}%`:'')}
function setAll(id,v){const c=G().cur.v;c[id]=c[id]||{o:[null,null,null],i:[null,null,null],a:[null,null,null]};
  const LK=lockState(),old=c[id].o;
  c[id].o=v.map((x,i)=>((i===0&&LK.c0)||(i>0&&LK.c12))?old[i]:x)}

/* ---------- 商品編集 ---------- */
function editItem(ix){EDIT=ix;const r=ix==null?{}:G().items[ix];
  $('itTitle').textContent=ix==null?'商品を追加':'商品を編集';
  $('f_name').value=r.name||'';$('f_price').value=r.price??'';$('f_day').value=r.day??'';
  $('f_unit').value=String(r.unit||1);$('f_grade').value=r.grade||'○';
  $('f_my').value=r.my??'';$('f_tag').value=r.tag||'';$('f_memo').value=r.memo||'';
  $('f_margin').value=r.margin??'';
  $('dItem').showModal()}
function saveItem(){const n=$('f_name').value.trim();if(!n){alert('商品名を入れてください');return}
  const o={name:n,price:Number($('f_price').value)||0,day:Number($('f_day').value)||0,
    unit:Number($('f_unit').value)||1,grade:$('f_grade').value,my:Number($('f_my').value)||0,
    tag:$('f_tag').value.trim(),memo:$('f_memo').value.trim(),
    margin:$('f_margin').value===''?undefined:Number($('f_margin').value)};
  if(EDIT==null){o.id='i'+Date.now().toString(36)+Math.floor(Math.random()*1e4).toString(36);G().items.push(o)}
  else G().items[EDIT]=Object.assign(G().items[EDIT],o);
  $('dItem').close();renderTabs();paintTotals();autosave();flash('保存しました')}
function delItem(){if(EDIT==null){$('dItem').close();return}
  if(!confirm('この商品を消しますか')) return;
  const r=G().items[EDIT];delete G().cur.v[r.id];G().items.splice(EDIT,1);
  $('dItem').close();renderTabs();paintTotals();autosave()}

/* ---------- 履歴・目標 ---------- */
function openHist(){
  const t=new Date(Date.now()-86400000); // 前日から開始
  loadHistDate((t.getMonth()+1)+'/'+t.getDate());
  $('dHist').showModal()}
function loadHistDate(d){
  const g=G(),Y=new Date().getFullYear();
  const r=g.hist.find(x=>x.d===d&&(x.y||Y)===Y)||{};
  const set=(id,v)=>$(id).value=(v===null||v===undefined)?'':v;
  set('h_d',d);set('h_w',r.w);set('h_ai',r.ai);set('h_n',r.n);set('h_s',r.s);set('h_ha',r.ha);
  set('h_m',r.m);
  // 去年の同時期のメモを表示（なぜうまくいった/いかなかったかの振り返り用）
  showLastYearNote(d);
  const sb=r.sb||[null,null,null],hab=r.hab||[null,null,null];
  // 便別納品：記録済みならそれを、なければその日の発注データから自動入力
  let nb=r.nb;
  if(!nb&&g.cur.dt===d){const s=sums('o');if(s.T)nb=s.b}
  nb=nb||[null,null,null];
  set('h_n1',nb[0]);set('h_n2',nb[1]);set('h_n3',nb[2]);
  if(!r.n&&nb.some(x=>x!=null))set('h_n',nb.reduce((a,x)=>a+(x||0),0));
  set('h_s1',sb[0]);set('h_s2',sb[1]);set('h_s3',sb[2]);
  set('h_ha1',hab[0]);set('h_ha2',hab[1]);set('h_ha3',hab[2]);
}
/* ---------- メモ一覧（週ごと/月ごとにまとめて表示） ---------- */
let MEMO_VIEW='month';
function setMemoView(v){MEMO_VIEW=v;
  $('memoWeek').setAttribute('aria-pressed',String(v==='week'));
  $('memoMonth').setAttribute('aria-pressed',String(v==='month'));
  renderMemos()}
function renderMemos(){
  const el=$('memolist');if(!el)return;el.textContent='';
  const Y=new Date().getFullYear(),groups={};
  (G().hist||[]).forEach(h=>{
    if(!h.m)return;
    const m=(h.d||'').match(/(\d{1,2})\s*[\/月]\s*(\d{1,2})/);if(!m)return;
    const y=h.y||Y;
    const key=MEMO_VIEW==='month'
      ? `${y}年${+m[1]}月`
      : `${y}年 ${weekKey(new Date(y,+m[1]-1,+m[2]))}の週`;
    (groups[key]=groups[key]||[]).push(`${h.d} ${h.m}`);
  });
  const keys=Object.keys(groups);
  if(!keys.length){const p=document.createElement('div');p.className='note';
    p.textContent='まだメモがありません。実績記録のメモ欄に施策やイベントを書くとここにまとまります。';
    el.appendChild(p);return}
  // 同じ時期の年違いが隣り合うよう、月日順→年順に並べる
  const sortKey=k=>{const y=(k.match(/^(\d{4})/)||[])[1]||'0';
    const md=k.match(/(\d{1,2})月/)||k.match(/(\d{1,2})\/(\d{1,2})/);
    const mo=md?+md[1]:0, da=md&&md[2]?+md[2]:0;
    return mo*10000+da*100+(9999-+y)};
  keys.sort((a,b)=>sortKey(b)-sortKey(a)).forEach(k=>{
    const w=document.createElement('div');w.className='row';
    const a=document.createElement('div');a.className='k';a.textContent=k;
    const b=document.createElement('div');b.className='v';b.textContent=groups[k].join(' ／ ');
    w.append(a,b);el.appendChild(w)});
}
/* 指定した年・期間(週/月)のメモをまとめて返す */
function memosIn(year,mo,da,span){
  const Y=new Date().getFullYear(),out=[];
  let from,to;
  if(span==='week'){
    const b=new Date(Y,mo-1,da);b.setDate(b.getDate()-((b.getDay()+6)%7));
    from=new Date(b);to=new Date(b);to.setDate(to.getDate()+6);
  }
  (G().hist||[]).forEach(h=>{
    if(!h.m)return;
    if((h.y||Y)!==year)return;
    const m=(h.d||'').match(/(\d{1,2})\s*[\/月]\s*(\d{1,2})/);if(!m)return;
    if(span==='month'){ if(+m[1]!==mo)return }
    else{ const hd=new Date(Y,+m[1]-1,+m[2]); if(hd<from||hd>to)return }
    out.push(`${h.d} ${h.m}`);
  });
  return out}
/* 去年の同じ週・同じ月のメモをまとめて表示する */
function showLastYearNote(d){
  const el=$('h_lastyear');if(!el)return;el.textContent='';el.className='note';
  const m=(d||'').match(/(\d{1,2})\s*[\/月]\s*(\d{1,2})/);if(!m)return;
  const thisYear=new Date().getFullYear();
  const ly=thisYear-1, mo=+m[1], da=+m[2];
  const wk=memosIn(ly,mo,da,'week'), mn=memosIn(ly,mo,da,'month');
  const lines=[];
  if(wk.length)lines.push(`【去年の同じ週】${wk.join(' ／ ')}`);
  const only=mn.filter(x=>!wk.includes(x));
  if(only.length)lines.push(`【去年の同じ月・その他】${only.join(' ／ ')}`);
  if(lines.length){el.className='note ok';el.textContent='📌 '+lines.join('　')}
  else{el.className='note';el.textContent=`去年（${ly}年）の${mo}月にはメモがありません`}
}
function shiftHistDate(dir){
  const m=($('h_d').value||'').match(/(\d{1,2})\s*[\/月]\s*(\d{1,2})/);
  const now=new Date();
  let base=m?new Date(now.getFullYear(),+m[1]-1,+m[2]):new Date(Date.now()-86400000);
  base.setDate(base.getDate()+dir);
  loadHistDate((base.getMonth()+1)+'/'+base.getDate());
}
function saveHist(){const n=x=>{const v=$(x).value;return v===''?null:Number(v)};
  const d=$('h_d').value.trim()||$('dt').value.trim();if(!d){alert('日付を入れてください');return}
  const nb=[n('h_n1'),n('h_n2'),n('h_n3')],sb=[n('h_s1'),n('h_s2'),n('h_s3')],hab=[n('h_ha1'),n('h_ha2'),n('h_ha3')];
  const Y=new Date().getFullYear();
  const i=G().hist.findIndex(h=>h.d===d&&(h.y||Y)===Y);
  const old=i>=0?G().hist[i]:{};
  const pick=(v,o)=>v===null||v===''||v===undefined?(o??null):v;
  const rec={d,w:pick($('h_w').value.trim(),old.w),ai:pick(n('h_ai'),old.ai),n:pick(n('h_n'),old.n),
    s:pick(n('h_s'),old.s),ha:pick(n('h_ha'),old.ha),
    m:pick($('h_m').value.trim(),old.m),am:old.am??null,kk:old.kk??null,k:old.k??null,
    y:old.y??Y,
    nb:nb.some(x=>x!==null)?nb:(old.nb||null),sb:sb.some(x=>x!==null)?sb:(old.sb||null),
    hab:hab.some(x=>x!==null)?hab:(old.hab||null)};
  if(rec.ha==null&&rec.hab)rec.ha=rec.hab.reduce((a,x)=>a+(x||0),0);
  if(rec.s==null&&rec.sb)rec.s=rec.sb.reduce((a,x)=>a+(x||0),0)||null;
  if(rec.n==null&&rec.nb)rec.n=rec.nb.reduce((a,x)=>a+(x||0),0)||null;
  if(i>=0)G().hist[i]=rec;else G().hist.push(rec);
  G().hist.sort((a,b)=>{const p=s=>{const m=(s.d||'').match(/(\d+)\D+(\d+)/);return m?+m[1]*100+ +m[2]:0};return p(a)-p(b)});
  $('dHist').close();renderHist();renderSetup();autosave();flash('記録しました')}
function saveBase(){const g=G();
  g.base=Number($('s_base').value)||0;g.up=Number($('s_up').value)||1;
  g.shelf=Number($('s_shelf').value)||0;g.cycle=Number($('s_cycle').value)||0;
  g.binNote=$('s_binnote').value.trim();
  renderSetup();autosave();flash('保存しました')}
/* 特殊カレンダー(GW/お盆/年末年始)と当日(集計未確定)を除いた実績平均を提案する */
function suggestBase(){
  const g=G();
  const todayStr=(()=>{const t=new Date();return (t.getMonth()+1)+'/'+t.getDate()})();
  const vals=g.hist.filter(h=>h.s!=null&&h.d!==todayStr&&!specialPeriod(h.d)).map(h=>h.s);
  if(!vals.length)return null;
  return{avg:Math.round(vals.reduce((a,b)=>a+b,0)/vals.length),n:vals.length}}
function applySuggestBase(){const s=suggestBase();if(!s){alert('実績データが足りません');return}
  $('s_base').value=s.avg;flash('提案値を反映しました（保存ボタンを押してください）')}
function saveTgt(){const d=$('tg_d').value.trim();if(!d)return;
  const m=d.match(/(\d{1,2})\s*[\/月]\s*(\d{1,2})/);if(!m){alert('8/22 のように入れてください');return}
  G().tgt[+m[1]+'/'+ +m[2]]={q:Number($('tg_q').value)||0,a:Number($('tg_a').value)||0};
  renderSet();renderSetup();autosave()}
function renderSet(){const g=G(),B=$('setbody');B.textContent='';
  $('wipeToggle').style.display='';$('wipeBtn').style.display='none';
  $('s_base').value=g.base||'';$('s_up').value=g.up||1;$('gas_url').value=getGasUrl();
  $('s_shelf').value=g.shelf||'';$('s_cycle').value=g.cycle||'';$('s_binnote').value=g.binNote||'';
  $('loc_status').textContent='現在の地域: '+getLoc().name;
  renderMemos();
  const sug=suggestBase();
  $('s_base_sug').textContent=sug?`実績平均(特殊カレンダー・当日除く、${sug.n}日分): ${sug.avg}個`:'実績データがまだ足りません';
  const L=learnDow();
  ['月','火','水','木','金','土','日'].forEach(d=>{
    const w=document.createElement('div');w.className='row';
    const k=document.createElement('div');k.className='k';k.textContent=d+'曜';
    const v=document.createElement('div');v.className='v';
    const f=(L&&L.f[d])||g.dow[d];
    v.textContent=f.toFixed(2)+((L&&L.f[d])?`（自店${L.cnt[d]}日 学習）`:'（初期値）');
    w.append(k,v);B.appendChild(w)});
  const t=$('tglist');t.textContent=Object.keys(g.tgt).length
    ? '登録済: '+Object.entries(g.tgt).map(([k,v])=>`${k} ${v.q}個/${(v.a||0).toLocaleString()}円`).join('　')
    : '目標はまだありません'}
function showWipe(){$('wipeToggle').style.display='none';$('wipeBtn').style.display='';}
function wipe(){if(!confirm('この端末のデータを全部消します。よろしいですか'))return;
  localStorage.removeItem(KEY);location.hash='';location.reload()}

/* ---------- 週次データ取り込み（写真→AI→貼り付け） ---------- */
const WK_TASKS={
  mon:{label:'月曜：先週実績の写真',
    guide:'ストコン「店舗分析→日別時系列推移グラフ（中分類：おむすび）」を数量表示で撮影（1枚）'},
  tue:{label:'火曜：品揃え・新商品の写真',
    guide:'ストコン「発注→品揃え状況確認・修正（おむすび）」を全ページ撮影（6枚前後）'}
};
function copyWeeklyPrompt(type){
  const p=type==='mon'
    ? `あなたはコンビニ発注データの読み取りアシスタントです。添付した「日別時系列推移グラフ（中分類）」画面の写真から、当年の日別実績を読み取り、次の形式の1行だけを出力してください（説明文・前置きは一切不要）。
#UPD1:{"type":"mon","days":[{"d":"8/17","ai":134,"n":134,"s":126,"ha":14}]}
ルール:
- d=日付(月/日) ai=AI推奨 n=納品 s=販売 ha=廃棄。写真に写っている日をすべて含める
- 読み取れない・空欄の値はnull
- 集計途中の当日や、まだ実績のない未来日は含めない`
    : `あなたはコンビニ発注データの読み取りアシスタントです。添付した「品揃え状況確認・修正」画面の写真（全ページ）から商品ごとの情報を読み取り、次の形式の1行だけを出力してください（説明文・前置きは一切不要）。
#UPD1:{"type":"tue","items":[{"name":"直巻 明太子マヨネーズ","price":198,"margin":40.4,"ai":[4,2,0],"ws":[40,46,38,35],"ww":[2,2,0,1],"new":false}]}
ルール:
- name=商品名（写真の表記のまま） price=売価 margin=値入率%
- ai=AI推奨値の1便/2便/3便（空欄は0）
- ws=週販売数（4週前→直近週の順）、ww=週廃棄数（同順）。空欄は0
- ランクに「導入」や赤い導入マークがある商品は new を true に
- 全ページの全商品を含め、読み取れない値はnull`;
  navigator.clipboard.writeText(p).then(()=>flash('プロンプトをコピーしました'))
    .catch(()=>{$('out').value=p;flash('下の書き出し枠からコピーしてください')});
}
function normName(s){return (s||'').replace(/[\s　・！!（）()]/g,'')}
/* 蓄積した週次スナップショットから、その商品の週販売数の推移を返す */
function itemTrend(g,name){
  const nx=normName(name),out=[];
  (g.snap||[]).forEach(s=>{
    if(s.type!=='tue'||!Array.isArray(s.items))return;
    const it=s.items.find(x=>{const ni=normName(x.name);return ni===nx||ni.includes(nx)||nx.includes(ni)});
    if(!it||!Array.isArray(it.ws))return;
    const v=it.ws[it.ws.length-1];
    if(v!=null)out.push({week:s.week,sales:v});
  });
  return out}
/* 直近の月曜日を「その週」のキーにする（例 8/17） */
function weekKey(dt){const d=dt?new Date(dt):new Date();
  const off=(d.getDay()+6)%7; d.setDate(d.getDate()-off);
  return (d.getMonth()+1)+'/'+d.getDate()}
/* 週次スナップショットを積み上げる。同じ週は上書き、日付順に保つ */
function pushSnapshot(g,type,payload){
  g.snap=g.snap||[];
  const wk=weekKey();
  const i=g.snap.findIndex(s=>s.week===wk&&s.type===type);
  const rec={week:wk,type,at:new Date().toISOString().slice(0,10),...payload};
  if(i>=0)g.snap[i]=rec;else g.snap.push(rec);
  g.snap.sort((a,b)=>{const p=s=>{const m=(s.week||'').match(/(\d+)\D+(\d+)/);return m?+m[1]*100+ +m[2]:0};
    return p(a)-p(b)||a.type.localeCompare(b.type)});
}
function importWeekly(){
  const m=$('wkbox').value.match(/#UPD1:\s*(\{[\s\S]*\})/);
  const msg=$('wkmsg');
  if(!m){msg.className='note crit';msg.textContent='「#UPD1:」で始まるデータが見つかりません。AIの返信をそのまま貼り付けてください。';return}
  let d;try{d=JSON.parse(m[1])}catch(e){msg.className='note crit';msg.textContent='データを読めませんでした（形式エラー）。AIにもう一度形式どおりの出力を頼んでください。';return}
  const g=G();g.wk=g.wk||{};
  const today=(()=>{const t=new Date();return (t.getMonth()+1)+'/'+t.getDate()})();
  if(d.type==='mon'&&Array.isArray(d.days)){
    let cnt=0;
    d.days.forEach(x=>{
      if(!x.d)return;
      const i=g.hist.findIndex(h=>h.d===x.d);
      const old=i>=0?g.hist[i]:{};
      const pick=(v,o)=>(v===null||v===undefined)?(o??null):v;
      const rec={...old,d:x.d,ai:pick(x.ai,old.ai),n:pick(x.n,old.n),s:pick(x.s,old.s),ha:pick(x.ha,old.ha)};
      if(i>=0)g.hist[i]=rec;else g.hist.push(rec);
      cnt++});
    g.hist.sort((a,b)=>{const p=s=>{const mm=(s.d||'').match(/(\d+)\D+(\d+)/);return mm?+mm[1]*100+ +mm[2]:0};return p(a)-p(b)});
    g.wk.mon=today;
    pushSnapshot(g,'mon',{days:d.days});
    msg.className='note ok';msg.textContent=`✓ ${cnt}日分の実績を履歴に取り込みました（曜日係数・週平均の学習に使われます）`
      +`　（${weekKey()}週として蓄積：計${(g.snap||[]).length}件）`;
  }else if(d.type==='tue'&&Array.isArray(d.items)){
    let upd=0,added=0;const miss=[];
    d.items.forEach(x=>{
      if(!x.name)return;
      const nx=normName(x.name);
      let r=g.items.find(it=>{const ni=normName(it.name);return ni===nx||ni.includes(nx)||nx.includes(ni)});
      if(r){
        if(x.margin!=null)r.margin=x.margin;
        r.pos={sales:x.ws||null,waste:x.ww||null,ai:x.ai||null};
        if(Array.isArray(x.ai)&&x.ai.some(v=>v)){
          const c=g.cur.v;c[r.id]=c[r.id]||{o:[null,null,null],i:[null,null,null],a:[null,null,null]};
          c[r.id].i=x.ai.map(v=>v||null)}
        upd++;
      }else if(x.new){
        const o={id:'i'+Date.now().toString(36)+Math.floor(Math.random()*1e4).toString(36),
          name:x.name,price:x.price?Math.round(x.price/1.08):0,day:0,unit:1,grade:'新',
          my:0,tag:'新',memo:'週次取込で自動追加',margin:x.margin??undefined,
          pos:{sales:x.ws||null,waste:x.ww||null,ai:x.ai||null}};
        g.items.push(o);added++;
      }else miss.push(x.name);
    });
    g.wk.tue=today;
    // その週の品目別スナップショットを蓄積（上書きせず履歴として残す）
    pushSnapshot(g,'tue',{items:d.items.map(x=>({name:x.name,price:x.price??null,
      margin:x.margin??null,ai:x.ai||null,ws:x.ws||null,ww:x.ww||null}))});
    msg.className='note ok';
    msg.textContent=`✓ ${upd}品を更新`+(added?`、新商品${added}品を追加`:'')
      +(miss.length?`　※未登録のため飛ばした商品: ${miss.slice(0,5).join('、')}${miss.length>5?' 他':''}`:'')
      +`　（${weekKey()}週として蓄積：計${(g.snap||[]).length}件）`;
  }else{
    msg.className='note crit';msg.textContent='typeがmon/tueのどちらでもありません。プロンプトをコピーし直して試してください。';return;
  }
  $('wkbox').value='';renderAll();autosave();
}
function renderWeekly(){
  const el=$('wklist');if(!el)return;el.textContent='';
  const g=G(),wk=g.wk||{};
  Object.entries(WK_TASKS).forEach(([k,t])=>{
    const w=document.createElement('div');w.className='row';
    const a=document.createElement('div');a.className='k';a.textContent=t.label;
    const b=document.createElement('div');b.className='v '+(wk[k]?'ok':'warn');
    b.textContent=(wk[k]?`✓ ${wk[k]} 取込済`:'未取込')+'　'+t.guide;
    w.append(a,b);el.appendChild(w)});
  // 蓄積状況（何週分たまっているか）
  const snap=g.snap||[];
  const weeks=[...new Set(snap.map(s=>s.week))];
  const w=document.createElement('div');w.className='row';
  const a=document.createElement('div');a.className='k';a.textContent='蓄積データ';
  const b=document.createElement('div');b.className='v '+(weeks.length?'ok':'');
  b.textContent=weeks.length
    ? `${weeks.length}週分（${weeks.slice(-4).join('・')}${weeks.length>4?' 他':''}）取り込むほど精度が上がります`
    : 'まだありません。取り込むと週ごとに蓄積されます';
  w.append(a,b);el.appendChild(w);
}

/* ---------- 入出力 ---------- */
function outPrompt(){
  const g=G(),s=sums('o'),ai=sums('i');
  const dv=($('dt').value||'').trim(), i=dowInfo(), k=tgtKey(), t=k?g.tgt[k]:null;
  const D=demand(), aiAdp=getAiAdoption(), sp=specialPeriod(dv);
  const ch=[];g.items.forEach(r=>{
    const a=vv(r.id,'o').reduce((x,y)=>x+(y||0),0),b=vv(r.id,'i').reduce((x,y)=>x+(y||0),0);
    if(Math.abs(a-b)>=2&&(a||b))ch.push(`${r.name}: ストコンAI推奨${b}個 → 自店発注${a}個 (日販${r.day||0})`)});
  const h=g.hist.slice(-4).map(x=>`- ${x.d}(${x.w||'天気不明'}): 納品${x.n??'-'} / 販売${x.s??'-'} / 廃棄${x.ha??'-'} (消化率:${x.n&&x.s?(x.s/x.n*100).toFixed(0)+'%':'-'})${x.m?' ['+x.m+']':''}`);

  const p=[
    `【発注アドバイス依頼】`,
    `対象カテゴリ: ${g.name}`,
    `対象日: ${dv}${i?' ('+i.d+'曜・係数'+i.f.toFixed(2)+')':''}`,
    ...(sp?[`⚠ 特殊カレンダー: ${sp}期間（ストコンAIの学習対象外のため参考程度に）`]:[]),
    `ストコンAI採用率: ${aiAdp?aiAdp.rate+'% ('+aiAdp.label+')':'未計算'}`,
    `本部目標: ${t?t.q+'個 / '+(t.a||0).toLocaleString()+'円':'未設定'}`,
    `需要見込み(提案数): ${D?D.q+'個 ('+D.src+')':'未設定'}`,
    ...((()=>{const aiT=['ai1','ai2','ai3'].reduce((a,id)=>a+(Number($(id).value)||0),0);
      return aiT?[`ストコンAI推奨合計(推奨値反映${$('aiver').value?'・'+$('aiver').value:''}): ${aiT}個（1便${$('ai1').value||0}/2便${$('ai2').value||0}/3便${$('ai3').value||0}）`]:[]})()),
    `発注合計: ${s.T}個 (${s.b.join('/')}) 納品金額: ${s.amt.toLocaleString()}円`,
    `\n## 直近の実績推移`,
    h.length?h.join('\n'):'実績データなし',
    `\n## ストコンAI推奨からの主な変更商品（±2個以上）`,
    ch.length?ch.join('\n'):'大きな変更なし',
    `\n## 相談内容`,
    `ファミマ発注マニュアルの「ストコンAI採用率70-80%最適化」および「主力品への売場ボリューム集中」を踏まえ、上記の発注バランスに機会ロスや過剰廃棄のリスクがないか評価・改善提案をお願いします。`
  ];
  $('out').value=p.join('\n');
}
function outCompact(){const g=G(),s=sums('o'),ai=sums('i'),ac=sums('a');
  const i=dowInfo(),k=tgtKey(),t=k?g.tgt[k]:null;
  const dv=($('dt').value||'').trim(), aiAdp=getAiAdoption();
  const L=[`#${g.name} ${dv}${(i&&!/[月火水木金土日]/.test(dv))?'('+i.d+')':''}`];
  if(t)L.push(`目標 ${t.q}個 ${t.a}円`);
  if(s.T)L.push(`発注 ${s.b.join('/')}=${s.T} ${s.amt}円`);
  if(ai.T)L.push(`ストコンAI ${ai.b.join('/')}=${ai.T}${aiAdp?' (採用率'+aiAdp.rate+'%)':''}`);
  if(ac.T)L.push(`実績 納品/販売/廃棄 ${ac.b.join('/')}`);
  const ch=[];g.items.forEach(r=>{const a=vv(r.id,'o').reduce((x,y)=>x+(y||0),0),
    b=vv(r.id,'i').reduce((x,y)=>x+(y||0),0);
    if(Math.abs(a-b)>=3&&(a||b))ch.push({n:r.name,d:a-b,t:`${r.name}${b}→${a}`})});
  ch.sort((x,y)=>Math.abs(y.d)-Math.abs(x.d));
  if(ch.length)L.push('ストコンAI比±3以上 '+ch.slice(0,8).map(x=>x.t).join(' ')+(ch.length>8?` 他${ch.length-8}品`:''));
  const h=g.hist.slice(-3).map(x=>`${x.d} 納${x.n??'-'} 販${x.s??'-'} 廃${x.ha??'-'}${x.w?' '+x.w:''}`);
  if(h.length)L.push('直近 '+h.join(' | '));
  $('out').value=L.join('\n')}
function outFull(){$('out').value='#BK3:'+b64e(JSON.stringify(DB))}
function copyOut(){const t=$('out');if(!t.value){outCompact()}t.select();
  const done=()=>flash('コピーしました');
  if(navigator.clipboard)navigator.clipboard.writeText(t.value).then(done).catch(()=>{document.execCommand('copy');done()});
  else{document.execCommand('copy');done()}}
function doImport(){const m=$('impbox').value.match(/#BK3:([A-Za-z0-9+/=]+)/);
  if(!m){alert('バックアップの文字列が見つかりません');return}
  try{const d=JSON.parse(b64d(m[1]));if(!d.g)throw 0;DB=d;save();$('dImp').close();$('impbox').value='';
    renderAll();flash('読み込みました')}catch(e){alert('読み込めませんでした')}}

/* ---------- マウスドラッグで横スクロール（DeX等タッチ非対応環境向け） ---------- */
function enableDragScroll(el){
  let down=false,startX=0,startLeft=0,moved=false,pid=null;
  el.addEventListener('dragstart',e=>e.preventDefault());
  el.addEventListener('pointerdown',e=>{
    if(e.pointerType==='touch')return;
    down=true;moved=false;startX=e.clientX;startLeft=el.scrollLeft;pid=e.pointerId;
    try{el.setPointerCapture(pid)}catch(err){}
    el.classList.add('dragging');
    e.preventDefault()});
  el.addEventListener('pointermove',e=>{if(!down||e.pointerType==='touch')return;
    const dx=e.clientX-startX;if(Math.abs(dx)>3)moved=true;el.scrollLeft=startLeft-dx;
    e.preventDefault()});
  const end=()=>{if(!down)return;down=false;el.classList.remove('dragging');
    if(pid!=null){try{el.releasePointerCapture(pid)}catch(err){}}};
  el.addEventListener('pointerup',end);
  el.addEventListener('pointercancel',end);
  el.addEventListener('click',e=>{if(moved){e.preventDefault();e.stopPropagation()}},true);
}
function hscrollBy(id,dir){const el=$(id);if(!el)return;
  el.scrollBy({left:dir*160,behavior:'smooth'})}
document.querySelectorAll('.hscroll').forEach(enableDragScroll);

/* ---------- 起動 ---------- */
['dt','wthr'].forEach(id=>$(id).addEventListener('input',()=>{
  G().cur.dt=$('dt').value;G().cur.wthr=$('wthr').value;
  if(id==='dt'){applyDow();$('tq').value='';$('ta').value=''}
  renderSetup();autosave()}));
['ai1','ai2','ai3'].forEach(id=>$(id).addEventListener('input',()=>{
  G().cur.ai=['ai1','ai2','ai3'].map(x=>$(x).value===''?null:Number($(x).value));
  renderSetup();autosave()}));
$('aiver').addEventListener('change',()=>{G().cur.aiVer=$('aiver').value;autosave()});
if(!load())DB=fresh();
if(!DB.g)DB=fresh();
/* 保存データが空(商品0件かつ履歴0件)なら初期データから復旧する。
   キャッシュ削除などでデータが失われても商品マスタが戻るようにする */
(function reseedIfEmpty(){
  const items=Object.values(DB.g||{}).reduce((a,g)=>a+((g.items||[]).length),0);
  const hist=Object.values(DB.g||{}).reduce((a,g)=>a+((g.hist||[]).length),0);
  if(items===0&&hist===0)DB=fresh();
})();
GEN.forEach(([k,n,i])=>{if(!DB.g[k])DB.g[k]=blank(n,i)});
renderAll();save();
cloudLoadSilent();
