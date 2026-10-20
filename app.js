/* Repasses de Cocorretagem · Clube do Seguro Garantia
   App estático (GitHub Pages) + Supabase: login, banco, documentos e notificações. */
(() => {
"use strict";

// ---------------- constantes ----------------
const MODALIDADES = ["Licitante","Executante Construtor","Executante Fornecedor","Prestação de Serviços","Adiantamento de Pagamentos","Retenção de Pagamentos","Judicial Cível","Judicial Trabalhista","Judicial Fiscal / Execução Fiscal","Aduaneiro","Imobiliário","Parcelamento Administrativo","Outra"];
const SEGURADORAS = ["Akad","Avla","Essor","Fairfax","Junto","Newe","Pottencial","Sancor","Sompo"];
const NIVEIS = {"1":{label:"Nível 1 · Apoio Técnico",pct:75},"2":{label:"Nível 2 · Parceria Estratégica",pct:65},"3":{label:"Nível 3 · Condução Especializada",pct:50},"custom":{label:"Percentual negociado",pct:null}};
const CATS = ["Apólice","Boleto","Comprovante de pagamento","Proposta","Endosso","Contrato / Edital","Nota fiscal","Outro"];
const STATUS = {apagar:["A pagar","s-apagar"],atrasado:["Pagamento atrasado","s-atrasado"],pago:["Pago","s-pago"],areceber:["A receber","s-receber"],atrasado_r:["Recebimento atrasado","s-atrasado"],recebido:["Recebido","s-pago"]};
const TYPE_BY_EXT = {pdf:"application/pdf",png:"image/png",jpg:"image/jpeg",jpeg:"image/jpeg",webp:"image/webp",gif:"image/gif"};
const BUCKET = "documentos";
const CLIP = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21.4 11.1l-9.2 9.2a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.5-8.5"/></svg>';
const MARK = "icons/mark.png";

const CFG = window.CONFIG || {};
const COMISSAO_PADRAO = Number(CFG.COMISSAO_PADRAO)||20;
let EMIS = CFG.EMISSORA || {nome:"CS GARANTIA CORRETORA DE SEGUROS LTDA", cnpj:"57.610.106/0001-24", susep:"242162852"};
const configured = CFG.SUPABASE_URL && !/SEU-PROJETO/.test(CFG.SUPABASE_URL) && CFG.SUPABASE_ANON_KEY && !/COLE-AQUI/.test(CFG.SUPABASE_ANON_KEY);
const sb = configured && window.supabase ? window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY) : null;

const today = new Date();
const ymNow = ym(today);
const S = {view:"boot", session:null, me:null, nomes:{}, docs:[], apolices:[], emissoras:[], emisId:null, emisMenu:false, pEdit:null, rep:{periodo:"mes",por:"corretora",open:null}, corretoras:[], seguradoras:[], ctab:"corretoras", sEdit:null, cq:"", cEdit:null, imp:null, loading:true, loadError:null,
  month:ymNow, page:"dashboard", sideOpen:false, calDay:null, cfgL:null, tab:"pagar", det:false, editPay:null, ultimaBaixa:null, q:"", fStatus:"todos", fDir:"todos", fScope:"mes",
  editing:null, confirming:null, dem:null, ext:null, ficha:null, menuOpen:false, push:{supported:false, on:false, busy:false}, channel:null};

// ---------------- utilitários ----------------
function ym(d){return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")}
function isoDay(d){return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0")}
function shiftYM(s,n){const [y,m]=s.split("-").map(Number);return ym(new Date(y,m-1+n,1))}
function monthName(s){const [y,m]=s.split("-").map(Number);const t=new Date(y,m-1,1).toLocaleDateString("pt-BR",{month:"long",year:"numeric"});return t.charAt(0).toUpperCase()+t.slice(1)}
function monthShort(s){if(!s)return"—";const [y,m]=s.split("-").map(Number);return new Date(y,m-1,1).toLocaleDateString("pt-BR",{month:"short"}).replace(".","")+"/"+String(y).slice(2)}
const BRL = new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"});
function money(n){return BRL.format(Number(n)||0)}
function pctFmt(n){return (Number(n)||0).toLocaleString("pt-BR",{maximumFractionDigits:2})+"%"}
function parseBR(v){if(v==null)return NaN;let s=String(v).trim().replace(/[R$\s%]/g,"");if(!s)return NaN;if(s.includes(","))s=s.replace(/\./g,"").replace(",",".");else if(/^-?\d{1,3}(\.\d{3})+$/.test(s))s=s.replace(/\./g,"");return Number(s)}
function numOrNull(v){const n=parseBR(v);return isNaN(n)?null:n}
function moneyInput(n){return (n==null||n===""||isNaN(n))?"":Number(n).toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2})}
function numInput(n){return (n==null||n===""||isNaN(n))?"":Number(n).toLocaleString("pt-BR",{maximumFractionDigits:2,useGrouping:false})}
function dateBR(s){if(!s)return"—";const [y,m,d]=String(s).slice(0,10).split("-");return d+"/"+m+"/"+y}
function dtBR(s){return s?new Date(s).toLocaleString("pt-BR",{dateStyle:"short",timeStyle:"short"}):""}
function esc(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function key(s){return String(s||"").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"")}
function dirDe(d){return d&&d.lider==="parceira"?"receber":"pagar"}
// Em atraso: venceu há mais de 5 dias (depois da 2ª cobrança) e não teve baixa
function venceuHaMais5(d){const v=d.vencimento?String(d.vencimento).slice(0,10):null;if(v)return addDias(v,5)<isoDay(today);return !!(d.competencia&&d.competencia<ymNow)}
function status(d){const r=dirDe(d)==="receber";if(d.pago)return r?"recebido":"pago";if(venceuHaMais5(d))return r?"atrasado_r":"atrasado";return r?"areceber":"apagar"}
function emAtraso(d){const st=status(d);return st==="atrasado"||st==="atrasado_r"}
function parcTxt(d){return d.parcelas_total>1?`parcela ${d.parcela_num}/${d.parcelas_total}`:""}
function chip(st){const [l,c]=STATUS[st];return `<span class="chip ${c}">${l}</span>`}
function calcRepasse(p,c,r,lider){const com=Math.round((Number(p)||0)*(Number(c)||0))/100;const L=lider||(S.editing&&S.editing.data.lider)||"emissora";const parte=L==="parceira"?100-(Number(r)||0):(Number(r)||0);return Math.round(com*parte/100*100)/100}
function nivelDe(pct){return Number(pct)===75?"1":Number(pct)===65?"2":Number(pct)===50?"3":"custom"}
// mesma data N meses depois (31/01 + 1 mês = 28/02)
function addMeses(iso,n){const [y,m,d]=String(iso).slice(0,10).split("-").map(Number);const alvo=new Date(y,m-1+n,1);const ult=new Date(alvo.getFullYear(),alvo.getMonth()+1,0).getDate();alvo.setDate(Math.min(d,ult));return isoDay(alvo)}
// Distribui o total da cocorretagem entre as parcelas (as já pagas ficam como estão)
function recalcParcelas(d){
  let N=Math.max(1,Math.min(60,parseInt(d.parcelas_qtd,10)||1));
  const pagasMax=Math.max(0,...d.parcelas.filter(p=>p.pago).map(p=>p.numero));if(N<pagasMax)N=pagasMax;d.parcelas_qtd=N;
  const base=d.parcelas[0]&&d.parcelas[0].competencia||d.competencia||S.month;const v1=d.parcelas[0]&&d.parcelas[0].vencimento?String(d.parcelas[0].vencimento).slice(0,10):null;
  const arr=[];for(let i=1;i<=N;i++){const ex=d.parcelas.find(p=>p.numero===i);const ven=v1?addMeses(v1,i-1):null;arr.push(ex||{numero:i,vencimento:ven,premio_parcela:null,valor:0,competencia:ven?ven.slice(0,7):shiftYM(base,i-1),pago:false})}
  arr.forEach(p=>{if(p.vencimento)p.competencia=String(p.vencimento).slice(0,7)});
  d.parcelas=arr;
  const total=Number(d.valor_repasse)||0;const pagas=arr.filter(p=>p.pago);const abertas=arr.filter(p=>!p.pago);
  let resto=Math.round((total-pagas.reduce((a,p)=>a+(Number(p.valor)||0),0))*100)/100;if(resto<0)resto=0;
  const pesos=abertas.every(p=>Number(p.premio_parcela)>0)?abertas.map(p=>Number(p.premio_parcela)):abertas.map(()=>1);const somaP=pesos.reduce((a,b)=>a+b,0)||1;
  let acum=0;abertas.forEach((p,i)=>{if(i===abertas.length-1)p.valor=Math.round((resto-acum)*100)/100;else{p.valor=Math.round(resto*pesos[i]/somaP*100)/100;acum+=p.valor}});
  d.competencia=arr[0].competencia;
}
function nomeDe(email){return (email&&S.nomes[email.toLowerCase()])||email||""}
function iniciais(n){return String(n||"?").split(/\s+/).filter(Boolean).slice(0,2).map(x=>x[0]).join("").toUpperCase()}
function guessCat(n){const k=key(n);if(/boleto|guia|fatura/.test(k))return"Boleto";if(/comprov|pix|recibo/.test(k))return"Comprovante de pagamento";if(/endosso/.test(k))return"Endosso";if(/proposta/.test(k))return"Proposta";if(/edital|contrato|minuta/.test(k))return"Contrato / Edital";if(/nota|nf-?e|nfs/.test(k))return"Nota fiscal";if(/apolice|apol/.test(k))return"Apólice";return"Outro"}
function sizeFmt(b){b=Number(b)||0;return b>1048576?(b/1048576).toFixed(1).replace(".",",")+" MB":Math.max(1,Math.round(b/1024))+" KB"}
function extOf(n){const m=/\.([a-z0-9]+)$/i.exec(n||"");return m?m[1].toLowerCase():""}
function safeName(n){return key(n).replace(/[^a-z0-9._-]+/g,"-").replace(/-+/g,"-").replace(/^-|-$/g,"").slice(-80)||"arquivo"}
function uuid(){return (crypto.randomUUID&&crypto.randomUUID())||(Date.now().toString(36)+Math.random().toString(36).slice(2))}
function soDigitos(v){return String(v??"").replace(/\D/g,"")}
function normCnpj(v){let d=soDigitos(v);if(d.length===13)d="0"+d;return d}
function cnpjValido(v){const c=normCnpj(v);if(c.length!==14||/^(\d)\1{13}$/.test(c))return false;
  const calc=n=>{let s=0,pos=n-7;for(let i=n;i>=1;i--){s+=+c[n-i]*pos--;if(pos<2)pos=9}const r=s%11;return r<2?0:11-r};
  return calc(12)===+c[12]&&calc(13)===+c[13]}
function fmtCnpj(v){const c=normCnpj(v);return c.length===14?c.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,"$1.$2.$3/$4-$5"):String(v||"")}
function corrKey(d){const su=soDigitos(d.corretor_susep).replace(/^0+/,"");return d.corretor_cnpj?("c"+d.corretor_cnpj):su?("s"+su):("n"+key(d.corretor))}
function corretoraPorCnpj(c){c=normCnpj(c);return c?S.corretoras.find(x=>x.cnpj===c):null}
function segNomes(){const set=new Map();(S.seguradoras.length?S.seguradoras.map(x=>x.nome):SEGURADORAS).forEach(n=>set.set(key(n),n));S.docs.forEach(d=>{if(d.seguradora&&!set.has(key(d.seguradora)))set.set(key(d.seguradora),d.seguradora)});return [...set.values()].sort((a,b)=>a.localeCompare(b))}
function segReg(n){const k=key(n);return k?S.seguradoras.find(x=>key(x.nome)===k||key(x.razao_social)===k):null}
function comissaoPadraoDe(n){const r=segReg(n);return r&&r.comissao_padrao!=null?Number(r.comissao_padrao):COMISSAO_PADRAO}
function aplicarComissaoPadrao(force){const e=S.editing;if(!e)return;const d=e.data;const ci=$("comissao_pct");if(!ci)return;
  if(ci.value.trim()&&!e.comAuto&&!force)return;const v=comissaoPadraoDe($("seguradora")?$("seguradora").value:d.seguradora);
  ci.value=numInput(v);d.comissao_pct=v;e.comAuto=true;
  if(!d.valor_manual){d.valor_repasse=calcRepasse(d.premio,d.comissao_pct,d.repasse_pct,d.lider);const vr=$("valor_repasse");if(vr)vr.value=moneyInput(d.valor_repasse)}
  recalcParcelas(d);renderParcelas();updateCalc();comHint()}
function comHint(){const h=$("comHint");const e=S.editing;if(!h||!e)return;const seg=$("seguradora")?$("seguradora").value.trim():"";const r=segReg(seg);
  h.textContent=e.comAuto?(r&&r.comissao_padrao!=null?`Padrão da ${r.nome}. Ajuste se esta apólice for diferente.`:`Padrão de ${numInput(COMISSAO_PADRAO)}%. Ajuste se esta apólice for diferente.`):""}
// "AKAD SEGUROS S.A." → "Akad"; "FAIRFAX BRASIL SEGUROS CORPORATIVOS S.A." → "Fairfax"
function segCurto(razao){const fora=/^(cia|companhia|seguradora|seguros?|brasil|brasileira|do|da|de|dos|e|s|a|sa|corporate|solutions|garantias?|credito|crédito|corporativos?|gerais)$/i;
  const w=String(razao||"").replace(/[.,]/g," ").split(/\s+/).filter(Boolean);const i=w.findIndex(x=>!fora.test(x));if(i<0)return tituloCaso(w[0]||"");
  const sigla=x=>x.length<=3&&x===x.toUpperCase()&&/^[A-Z0-9]+$/.test(x)?x:tituloCaso(x);
  return [w[i],w[i+1]&&!fora.test(w[i+1])?w[i+1]:null].filter(Boolean).map(sigla).join(" ")}
function segRazao(n){const r=segReg(n);return r&&r.razao_social?r.razao_social:(n||"")}
function corretoraPorNome(n){const k=key(n);return k?S.corretoras.find(x=>key(x.nome)===k):null}
// pela razão social, mesmo escrita diferente ("MARCA COR DE SEG LT" × "Marca Corretora de Seguros Ltda")
const RZ_FORA=new Set(["ltda","lt","ltd","me","epp","eireli","sa","s","a","corretora","corretagem","cor","corr","de","da","do","dos","das","e","seguros","seguro","seg","segs","adm","administracao","administradora","previdencia","consultoria","gerais","garantia","garantias"]);
function rzTokens(n){return key(n).replace(/[^a-z0-9 ]/g," ").split(/\s+/).filter(w=>w&&!RZ_FORA.has(w))}
function corretoraPorRazao(n){const t=rzTokens(n);if(!t.length)return null;
  const cands=S.corretoras.map(x=>{const u=rzTokens(x.nome);const comuns=t.filter(w=>u.includes(w)).length;return {x,ok:u.length&&u[0]===t[0],sc:comuns/Math.max(t.length,u.length)}}).filter(c=>c.ok&&c.sc>=0.5).sort((a,b)=>b.sc-a.sc);
  return cands.length&&(cands.length===1||cands[0].sc>cands[1].sc)?cands[0].x:null}
function tituloCaso(t){const conect=/^(e|de|da|do|dos|das)$/i;return String(t||"").split(/\s+/).map((w,i)=>conect.test(w)&&i?w.toLowerCase():w.length<=2&&w===w.toUpperCase()?w:w.charAt(0).toUpperCase()+w.slice(1).toLowerCase()).join(" ")}
// selo para apólices emitidas por uma corretora do grupo (ex.: Nosso Porto)
function grupoTag(d){return d&&d.emitida_por?`<span class="tag-grupo" title="Apólice emitida pela ${esc(d.emitida_por)}, do mesmo grupo da ${esc(emisCurto())}">${esc(tituloCaso(curtoDe(d.emitida_por)))}</span>`:""}
// barra da divisão da comissão: azul = nossa parte, dourado = parceira
function splitBar(d){const pp=Math.max(0,Math.min(100,Number(d.repasse_pct)||0));const cs=Math.round((100-pp)*100)/100;
  return `<span class="split-bar" role="img" aria-label="${esc(nossoCurto(d))} ${pctFmt(cs)}, parceira ${pctFmt(pp)}"><span class="sb-l">${esc(tituloCaso(nossoCurto(d)))} <b>${pctFmt(cs)}</b></span><span class="sb-track"><i class="sb-cs" style="width:${cs}%"></i><i class="sb-pa" style="width:${pp}%"></i></span><span class="sb-r"><b>${pctFmt(pp)}</b> parceira</span></span>`}
// cor da etiqueta de cada seguradora: escolhida na página Seguradoras ou automática
const SEG_CORES=["Vermelho","Azul","Roxo","Verde-água","Laranja","Verde","Rosa","Anil","Oliva","Cinza","Marrom","Ciano"];
const SEG_COR_FIXA={sompo:0,sancor:1,akad:2,fairfax:3,junto:4,pottencial:5,avla:6,essor:7,newe:8};
function segCor(nome){const r=segReg(nome);if(r&&r.cor!=null&&r.cor!==""&&!isNaN(+r.cor))return +r.cor%12;const k=key(r?r.nome:nome);
  if(k in SEG_COR_FIXA)return SEG_COR_FIXA[k];let h=0;for(const ch of k)h=(h*31+ch.charCodeAt(0))>>>0;return h%12}
function segTag(nome){if(!nome)return"";const r=segReg(nome);const rs=r&&r.razao_social||nome;
  return `<span class="seg-tag seg-c${segCor(nome)}" title="Seguradora${r&&r.cnpj?" · CNPJ "+esc(fmtCnpj(r.cnpj)):""}">${esc(rs)}</span>`}
function clipBadge(d){const n=(d.anexos||[]).length;return n?`<span class="clip" title="${n} anexo${n>1?"s":""}">${CLIP}${n}</span>`:""}
function missBadge(d){return (d.anexos||[]).some(a=>a.categoria==="Apólice")?"":'<span class="miss">sem apólice</span>'}
function toast(msg,act){const r=document.getElementById("toastRoot");r.innerHTML=`<div class="toast${act?" has-act":""}" role="status"><span>${esc(msg)}</span>${act?`<button class="toast-act" data-action="${esc(act.action)}">${esc(act.label)}</button>`:""}</div>`;clearTimeout(toast.t);toast.t=setTimeout(()=>r.innerHTML="",act?9000:3200)}
function $(id){return document.getElementById(id)}
const root=()=>$("root");

// ---------------- telas de acesso ----------------
function brandCard(inner,foot){return `<div class="gate"><div class="card">
  <div class="card-top"><img src="${MARK}" alt=""><div class="wordmark"><b>Clube</b><span>do Seguro Garantia</span></div></div>
  <div class="card-body">${inner}</div>${foot?`<div class="card-foot">${foot}</div>`:""}</div></div>`}

function viewConfig(){root().innerHTML=brandCard(`<h2>Falta configurar o Supabase</h2><p>Preencha o arquivo <b>config.js</b> com a URL e a chave anon do projeto, como explica o README.</p>`)}

function viewLogin(msg,kind){
  root().innerHTML=brandCard(`<h2>Repasses de Cocorretagem</h2><p>Acesso restrito à equipe do Clube.</p>
    ${msg?`<div class="msg ${kind||"err"}" role="alert">${esc(msg)}</div>`:""}
    <form id="loginForm" class="card-body" style="padding:0">
      <div class="f"><label for="lgEmail">E-mail</label><input id="lgEmail" type="email" autocomplete="username" required></div>
      <div class="f"><label for="lgPass">Senha</label><input id="lgPass" type="password" autocomplete="current-password" required></div>
      <button class="btn primary" id="lgBtn" type="submit">Entrar</button>
    </form>
    <button class="linkbtn" data-action="forgot">Esqueci minha senha</button>`,
    "Especialistas em Seguro Garantia. Parceiros do corretor de seguros.");
  setTimeout(()=>$("lgEmail")&&$("lgEmail").focus(),30);
}
function viewForgot(msg,kind){
  root().innerHTML=brandCard(`<h2>Redefinir senha</h2><p>Enviaremos um link para o seu e-mail cadastrado.</p>
    ${msg?`<div class="msg ${kind||"err"}" role="alert">${esc(msg)}</div>`:""}
    <form id="forgotForm" class="card-body" style="padding:0">
      <div class="f"><label for="fgEmail">E-mail</label><input id="fgEmail" type="email" autocomplete="username" required></div>
      <button class="btn primary" type="submit">Enviar link</button>
    </form>
    <button class="linkbtn" data-action="toLogin">Voltar para o login</button>`);
}
function viewNewPass(msg){
  root().innerHTML=brandCard(`<h2>Crie uma nova senha</h2><p>Use pelo menos 8 caracteres.</p>
    ${msg?`<div class="msg err" role="alert">${esc(msg)}</div>`:""}
    <form id="newPassForm" class="card-body" style="padding:0">
      <div class="f"><label for="np1">Nova senha</label><input id="np1" type="password" autocomplete="new-password" minlength="8" required></div>
      <div class="f"><label for="np2">Repita a senha</label><input id="np2" type="password" autocomplete="new-password" minlength="8" required></div>
      <button class="btn primary" type="submit">Salvar senha</button>
    </form>${S.me?`<button class="linkbtn" data-action="cancelPass">Cancelar</button>`:""}`);
}
function viewDenied(email){
  root().innerHTML=brandCard(`<h2>Acesso não autorizado</h2><p>A conta <b>${esc(email)}</b> não está na lista de pessoas autorizadas. Fale com o Marcelo ou o Guilherme para liberar.</p>
    <button class="btn" data-action="logout">Sair</button>`);
}

// ---------------- sessão ----------------
async function onSession(session){
  S.session=session;
  if(!session){teardown();S.view="login";viewLogin();return}
  const email=(session.user.email||"").toLowerCase();
  const {data,error}=await sb.from("autorizados").select("*");
  if(error){S.view="login";viewLogin("Não foi possível verificar seu acesso. Tente de novo.");return}
  S.nomes=Object.fromEntries((data||[]).map(r=>[r.email.toLowerCase(),r.nome]));
  if(!S.nomes[email]){S.view="denied";viewDenied(email);return}
  S.equipe=data||[];const eu=(data||[]).find(r=>r.email.toLowerCase()===email)||{};
  S.me={email,nome:S.nomes[email],admin:!!eu.admin};
  await carregarEmissoras();
  if(S.view!=="app"){S.view="app";if(S.channel){sb.removeChannel(S.channel);S.channel=null}mountApp();await load();subscribe();initPush()}
}
function teardown(){if(S.channel){sb.removeChannel(S.channel);S.channel=null}S.docs=[];S.me=null;closePanel(false,true)}

// ---------------- painéis (corretoras emissoras) ----------------
function lsGet(k){try{return localStorage.getItem(k)}catch(_){return null}}
function lsSet(k,v){try{localStorage.setItem(k,v)}catch(_){}}
S.det=lsGet("detalhes")==="1";
async function carregarEmissoras(){
  const {data,error}=await sb.from("emissoras").select("*").order("ordem").order("criado_em");
  S.emissoras=!error&&data?data:[];
  const salvo=lsGet("painel");
  S.emisId=(S.emissoras.find(e=>e.id===S.emisId)||S.emissoras.find(e=>e.id===salvo)||S.emissoras[0]||{}).id||null;
  aplicarEmis();
}
function aplicarEmis(){const e=S.emissoras.find(x=>x.id===S.emisId);if(e)EMIS={nome:e.nome,cnpj:e.cnpj?fmtCnpj(e.cnpj):"",susep:e.susep||"",grupo:Array.isArray(e.grupo)?e.grupo.filter(g=>g&&g.nome):[]}}
function painelEq(q){return S.emisId?q.eq("emissora_id",S.emisId):q}
async function trocarPainel(id){
  if(id===S.emisId){S.emisMenu=false;renderEmisCard();return}
  S.emisId=id;lsSet("painel",id);aplicarEmis();S.emisMenu=false;S.confirming=null;S.rep.open=null;S.calDay=null;closePanel(false);
  S.loading=true;S.docs=[];render();renderEmisCard();await load();
  if(S.page==="notificacoes")openLembretes();
  toast(`Painel: ${EMIS.nome}`);
}
function renderEmisCard(){
  const box=$("emisCard");if(!box)return;const multi=S.emissoras.length>1;
  box.innerHTML=`<button class="side-emis${multi?" switch":""}" ${multi?'data-action="emisMenu" aria-haspopup="true" aria-expanded="'+!!S.emisMenu+'"':"disabled"}><span>${S.emissoras.length>1?"Painel · corretora emissora":"Corretora emissora"}</span><b>${esc(EMIS.nome)}</b><i class="num">${esc(EMIS.cnpj||"")}</i>${multi?'<em class="caret" aria-hidden="true">▾</em>':""}</button>
    ${S.emisMenu?`<div class="emis-pop" role="menu">${S.emissoras.map(e=>`<button role="menuitemradio" aria-checked="${e.id===S.emisId}" data-action="emisPick" data-id="${esc(e.id)}"><b>${esc(e.nome)}</b><span class="num">${e.cnpj?esc(fmtCnpj(e.cnpj)):"sem CNPJ"}</span>${e.id===S.emisId?'<i aria-hidden="true">✓</i>':""}</button>`).join("")}</div>`:""}`;
}

// ---------------- dados ----------------
async function load(){
  const [{data,error},cr,cl,sg]=await Promise.all([painelEq(sb.from("cocorretagens").select("*, anexos(*), parcelas(*)")).order("data_emissao",{ascending:false}),sb.from("corretoras").select("*").order("nome"),painelEq(sb.from("config_lembretes").select("*")).maybeSingle(),sb.from("seguradoras").select("*").order("nome")]);
  if(!cr.error)S.corretoras=cr.data||[];
  if(cl&&cl.data)S.cfgL=cl.data;
  if(sg&&!sg.error)S.seguradoras=sg.data||[];
  S.loading=false;
  if(error){S.loadError="Não foi possível carregar os lançamentos. Verifique a conexão e recarregue a página.";render();return}
  S.loadError=null;
  S.apolices=(data||[]).map(d=>({...d,anexos:(d.anexos||[]).sort((a,b)=>String(a.enviado_em).localeCompare(String(b.enviado_em))),parcelas:(d.parcelas||[]).sort((a,b)=>a.numero-b.numero)}));
  S.docs=achatar(S.apolices);
  render();
  if(S.ext&&S.ext.fase==="pronto"&&!S.editing&&!S.dem)renderExtrato();
  else if(S.ficha&&!S.editing&&!S.dem)renderFicha();
  if(S.editing&&S.editing.id&&!S.apolices.find(x=>x.id===S.editing.id)){closePanel(false);toast("Esta apólice foi excluída por outra pessoa.")}
}
// Cada parcela vira um item de pagamento (ou recebimento) com os dados da apólice
function achatar(apolices){
  const out=[];
  apolices.forEach(a=>{
    const ps=a.parcelas&&a.parcelas.length?a.parcelas:[{id:null,numero:1,valor:a.valor_repasse,competencia:a.competencia||ymNow,pago:false}];
    const n=ps.length;const totV=ps.reduce((s2,p)=>s2+(Number(p.valor)||0),0);
    ps.forEach(p=>{const fr=totV?(Number(p.valor)||0)/totV:1/n;
      out.push({...a,parcelas:undefined,pid:p.id,parcela_num:p.numero,parcelas_total:n,vencimento:p.vencimento,competencia:p.vencimento?String(p.vencimento).slice(0,7):p.competencia,
        valor_repasse:Number(p.valor)||0,pago:!!p.pago,data_pagamento:p.data_pagamento,pago_por:p.pago_por,
        premio:a.premio!=null?Math.round(a.premio*fr*100)/100:null,premio_total:a.premio,fr,valor_total:Number(a.valor_repasse)||0})});
  });
  return out;
}
let reloadT;
function subscribe(){
  const again=()=>{clearTimeout(reloadT);reloadT=setTimeout(load,350)};
  S.channel=sb.channel("repasses")
    .on("postgres_changes",{event:"*",schema:"public",table:"cocorretagens"},again)
    .on("postgres_changes",{event:"*",schema:"public",table:"anexos"},again)
    .on("postgres_changes",{event:"*",schema:"public",table:"parcelas"},again)
    .on("postgres_changes",{event:"*",schema:"public",table:"corretoras"},again)
    .on("postgres_changes",{event:"*",schema:"public",table:"seguradoras"},again)
    .on("postgres_changes",{event:"*",schema:"public",table:"emissoras"},()=>carregarEmissoras().then(()=>{renderEmisCard();render()}))
    .subscribe();
}
document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible"&&S.view==="app"){clearTimeout(reloadT);reloadT=setTimeout(load,350)}});

// ---------------- app: estrutura com menu lateral ----------------
const ICON={
  dashboard:'<path d="M4 13h6V4H4zM14 20h6V11h-6zM4 20h6v-3H4zM14 7h6V4h-6z"/>',
  repasses:'<rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6.5 9.5v5M17.5 9.5v5"/>',
  corretoras:'<path d="M4 20V8l8-4 8 4v12"/><path d="M9 20v-5h6v5M8 10h.01M12 10h.01M16 10h.01"/>',
  relatorios:'<path d="M4 20V4M4 20h16"/><path d="M8 16v-5M12 16V8M16 16v-3M20 16V6"/>',
  seguradoras:'<path d="M12 3l7 3v5c0 4.5-3 8.2-7 10-4-1.8-7-5.5-7-10V6z"/><path d="M9 12l2 2 4-4"/>',
  calendario:'<rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  notificacoes:'<path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
  configuracoes:'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  menu:'<path d="M4 7h16M4 12h16M4 17h16"/>'
};
const ico=(k,cls="ico")=>`<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[k]}</svg>`;
const PAGES=[
  {id:"dashboard",label:"Dashboard",title:"Visão geral",eyebrow:"Dashboard"},
  {id:"repasses",label:"Repasses",title:"Repasses de cocorretagem",eyebrow:""},
  {id:"calendario",label:"Calendário",title:"Calendário",eyebrow:"Vencimento das parcelas"},
  {id:"corretoras",label:"Corretoras",title:"Corretoras parceiras",eyebrow:"Nome e CNPJ"},
  {id:"seguradoras",label:"Seguradoras",title:"Seguradoras",eyebrow:"Nome, razão social e CNPJ"},
  {id:"relatorios",label:"Relatórios",title:"Relatórios de comissões",eyebrow:"Por corretora · mês a mês"},
  {id:"notificacoes",label:"Notificações",title:"Notificações",eyebrow:"Lembretes por e-mail e no celular"},
  {id:"configuracoes",label:"Configurações",title:"Configurações",eyebrow:"Usuários e acessos"}
];
function pageFromHash(){const h=location.hash.replace(/^#\/?/,"");return PAGES.some(p=>p.id===h)?h:"dashboard"}
function go(page){if(location.hash!=="#"+page)location.hash="#"+page;else{S.page=page;render()}}
window.addEventListener("hashchange",()=>{if(S.view!=="app")return;S.page=pageFromHash();S.sideOpen=false;S.menuOpen=false;S.cEdit=null;S.sEdit=null;S.calDay=null;
  if(S.page==="notificacoes")openLembretes();if(S.page==="configuracoes")loadUsuarios();render();window.scrollTo(0,0)});

function mountApp(){
  S.page=pageFromHash();
  root().innerHTML=`<div class="shell${S.sideOpen?" side-open":""}" id="shell">
    <aside class="side" aria-label="Menu principal">
      <div class="side-brand"><img src="${MARK}" alt=""><div class="wordmark"><b>Clube</b><span>do Seguro Garantia</span></div></div>
      <div class="emis-wrap" id="emisCard"></div>
      <nav class="side-nav">${PAGES.map(p=>`<a href="#${p.id}" class="nav-item" data-page="${p.id}">${ico(p.id)}<span>${p.label}</span><em class="nav-badge" id="badge-${p.id}" hidden></em></a>`).join("")}</nav>
      <div class="side-foot menu" id="userMenu"></div>
    </aside>
    <div class="side-scrim" data-action="sideClose"></div>
    <div class="main">
      <header class="topbar">
        <button class="iconbtn burger" data-action="sideOpen" aria-label="Abrir menu">${ico("menu")}</button>
        <div class="titlebox"><span class="eyebrow" id="pgEyebrow"></span><h1 id="pgTitle"></h1></div>
        <div class="top-actions" id="pgActions"></div>
      </header>
      <div class="wrap" id="page"></div>
      <footer class="foot">Especialistas em Seguro Garantia. Parceiros do corretor de seguros.</footer>
    </div></div>`;
  if(S.page==="notificacoes")openLembretes();
  if(S.page==="configuracoes")loadUsuarios();
  renderEmisCard();render();
}
const monthNav=()=>`<div class="month" aria-label="Competência"><button class="iconbtn" data-action="prev" aria-label="Mês anterior">‹</button><b id="monthLabel">${esc(monthName(S.month))}</b><button class="iconbtn" data-action="next" aria-label="Próximo mês">›</button></div>`;
function render(){
  if(S.view!=="app"||!$("page"))return;
  const pg=PAGES.find(p=>p.id===S.page)||PAGES[0];
  $("shell").classList.toggle("side-open",!!S.sideOpen);
  document.querySelectorAll(".nav-item").forEach(a=>a.setAttribute("aria-current",a.dataset.page===S.page?"page":"false"));
  $("pgEyebrow").textContent=S.page==="repasses"?`Apólices emitidas pela ${EMIS.nome}`:pg.eyebrow;$("pgTitle").textContent=pg.title;document.title=pg.label+" · Repasses de Cocorretagem";
  const od=overdue().length;const bd=$("badge-repasses");bd.hidden=!od;bd.textContent=od;bd.title=od?`${od} em atraso`:"";
  {const nc=aConfirmar().length;const bn=$("badge-notificacoes");if(bn){bn.hidden=!nc;bn.textContent=nc;bn.title=nc?`${nc} pagamento(s)/recebimento(s) para confirmar`:""}}
  const nova=`<button class="btn primary" data-action="new">+ Nova apólice</button>`;
  $("pgActions").innerHTML=S.page==="dashboard"?monthNav()+nova
    :S.page==="repasses"?monthNav()
    :S.page==="calendario"?monthNav()
    :S.page==="relatorios"?monthNav()+`<button class="btn" data-action="relXlsx">Baixar Excel</button><button class="btn primary" data-action="relPdf">Baixar PDF</button>`:"";
  renderMenu();
  const P=$("page");
  if(S.loadError){P.innerHTML=`<div class="empty"><h3>Algo deu errado</h3><p>${esc(S.loadError)}</p><button class="btn" data-action="reload">Recarregar</button></div>`;return}
  if(S.loading){P.innerHTML=`<p class="loading">Carregando…</p>`;return}
  if(S.page==="dashboard")renderDashboard(P);
  else if(S.page==="repasses"){P.innerHTML=`<div id="alertBox"></div>
      <nav class="dirsel" role="tablist" id="repTabs" aria-label="Repasses"></nav>
      <div class="repsearch"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/></svg><input id="fq" type="search" placeholder="Buscar apólice (seguradora ou SUSEP), corretora, tomador ou CNPJ…" value="${esc(S.q)}" aria-label="Buscar em todas as apólices"><button class="linkbtn" data-tab="apolices" id="listaBtn">${S.tab==="apolices"?"":"Ver lista completa"}</button></div>
      <main id="content"></main>`;renderAlert();renderRepTabs();renderContent()}
  else if(S.page==="corretoras"){P.innerHTML=`<main id="content" class="nomargin"></main>`;renderCorretoras($("content"))}
  else if(S.page==="seguradoras"){P.innerHTML=`<main id="content" class="nomargin"></main>`;renderSeguradoras($("content"))}
  else if(S.page==="calendario")renderCalendario(P);
  else if(S.page==="relatorios")renderRelatorios(P);
  else if(S.page==="notificacoes")renderNotificacoes(P);
  else if(S.page==="configuracoes")renderConfig(P);
}
function renderMenu(){
  const m=$("userMenu");if(!m)return;const me=S.me;
  m.innerHTML=`<button class="who-btn" data-action="menu" aria-haspopup="true" aria-expanded="${!!S.menuOpen}"><span class="avatar">${esc(iniciais(me.nome))}</span><span class="who-txt"><b>${esc(me.nome)}</b><span>${esc(me.email)}</span></span></button>
    ${S.menuOpen?`<div class="menu-pop up" role="menu"><button data-action="toNotif">Lembretes e notificações</button><button data-action="toConfig">Configurações</button><button data-action="changePass">Trocar senha</button><button data-action="logout">Sair</button></div>`:""}`;
}
function monthDocs(){return S.docs.filter(d=>d.competencia===S.month)}
function overdue(){return S.docs.filter(emAtraso)}
function renderAlert(){
  const box=$("alertBox");if(!box)return;const od=overdue();
  if(S.tab==="pagar"||S.tab==="receber"){box.innerHTML="";return}
  if(!od.length){box.innerHTML="";return}
  const somaV=l=>l.reduce((a,d)=>a+(Number(d.valor_repasse)||0),0);const pg=od.filter(d=>dirDe(d)==="pagar"),rc=od.filter(d=>dirDe(d)==="receber");
  const months=[...new Set(od.map(d=>d.competencia))].sort();
  box.innerHTML=`<div class="alert" role="alert"><div>Em atraso: ${pg.length?`<span class="num">${money(somaV(pg))}</span> a pagar (${pg.length})`:""}${pg.length&&rc.length?" · ":""}${rc.length?`<span class="num">${money(somaV(rc))}</span> a receber (${rc.length})`:""}<br><span>Competências não quitadas: ${months.map(monthShort).join(", ")}</span></div><button class="btn small" data-action="goto" data-month="${months[0]}">Ver ${monthShort(months[0])}</button></div>`;
}
function renderSummary(){
  const el=$("summary");if(!el)return;
  const md=monthDocs();const somaV=l=>l.reduce((a,d)=>a+(Number(d.valor_repasse)||0),0);
  const pg=md.filter(d=>dirDe(d)==="pagar"&&!d.pago),rc=md.filter(d=>dirDe(d)==="receber"&&!d.pago),q=md.filter(d=>d.pago);
  const cnt=l=>new Set(l.map(corrKey)).size;const od=overdue();
  el.innerHTML=`
    <div class="stat hl"><label>A pagar no mês</label><div class="v">${money(somaV(pg))}</div><small>${pg.length} parcela${pg.length!==1?"s":""} · ${cnt(pg)} parceira${cnt(pg)!==1?"s":""}</small></div>
    <div class="stat in"><label>A receber no mês</label><div class="v">${money(somaV(rc))}</div><small>${rc.length} parcela${rc.length!==1?"s":""} · ${cnt(rc)} parceira${cnt(rc)!==1?"s":""} líder${cnt(rc)!==1?"es":""}</small></div>
    <div class="stat"><label>Quitado no mês</label><div class="v">${money(somaV(q))}</div><small>${money(somaV(q.filter(d=>dirDe(d)==="pagar")))} pago · ${money(somaV(q.filter(d=>dirDe(d)==="receber")))} recebido</small></div>
    <div class="stat ${od.length?"bad":""}"><label>Em atraso</label><div class="v">${money(somaV(od))}</div><small>${money(somaV(od.filter(d=>dirDe(d)==="pagar")))} a pagar · ${money(somaV(od.filter(d=>dirDe(d)==="receber")))} a receber</small></div>`;
}
function renderContent(){
  const c=$("content");if(!c)return;
  if(S.page==="corretoras"){renderCorretoras(c);return}
  if(S.page==="seguradoras"){renderSeguradoras(c);return}
  if(!S.docs.length){c.innerHTML=`<div class="empty"><h3>Nenhuma cocorretagem lançada ainda</h3><p>Cada apólice emitida pela corretora com cocorretagem entra aqui com o valor devido à corretora parceira, o mês de pagamento e os documentos. No fim do mês, o Fechamento mostra quanto pagar a cada uma.</p><a class="btn primary" href="#dashboard">Ir para o Dashboard e lançar</a></div>`;return}
  if(S.tab==="pagar"||S.tab==="receber")renderDirecao(c,S.tab);
  else renderTabela(c);
}
// ---------------- repasses: abas, faixa de meses e visão mês a mês ----------------
const somaV=l=>l.reduce((a,d)=>a+(Number(d.valor_repasse)||0),0);
function renderRepTabs(){
  const n=$("repTabs");if(!n)return;if(S.tab==="fechamento"||S.tab==="tudo")S.tab="pagar";
  const md=monthDocs();const mes=monthName(S.month).split(" ")[0].toLowerCase();
  const card=(dir)=>{const rec=dir==="receber";const l=md.filter(d=>dirDe(d)===dir);const ab=l.filter(d=>!d.pago),q=l.filter(d=>d.pago);
    const atr=S.docs.filter(d=>dirDe(d)===dir&&emAtraso(d));const on=S.tab===dir;const nc=new Set(ab.map(corrKey)).size;
    return `<button class="dirbtn ${rec?"in":"out"}${on?" on":""}" role="tab" data-tab="${dir}" aria-selected="${on}">
      <span class="db-top"><span class="db-ic" aria-hidden="true">${rec?"↙":"↗"}</span><b>${rec?"A receber":"A pagar"}</b>${atr.length?`<span class="db-atr" title="${esc(money(somaV(atr)))} de meses anteriores">atraso</span>`:""}</span>
      <span class="db-v num">${money(somaV(ab))}</span>
      <span class="db-meta">${ab.length?`${ab.length} parcela${ab.length>1?"s":""} em aberto`:l.length?`tudo ${rec?"recebido":"pago"}`:"nada neste mês"}</span></button>`};
  n.innerHTML=card("pagar")+card("receber");
}
// meses mostrados: 5 antes e 6 depois do mês aberto, mais qualquer mês com parcela em aberto (atrasos e parcelas futuras)
function mesesFaixa(dir){
  const set=new Set();for(let i=-5;i<=6;i++)set.add(shiftYM(S.month,i));
  const lim=shiftYM(S.month,24);
  S.docs.forEach(d=>{if((!dir||dirDe(d)===dir)&&!d.pago&&d.competencia&&d.competencia<=lim)set.add(d.competencia)});
  return [...set].sort();
}
function resumoMes(m,dir){
  const l=S.docs.filter(d=>d.competencia===m&&(!dir||dirDe(d)===dir));
  const p=l.filter(d=>dirDe(d)==="pagar"),r=l.filter(d=>dirDe(d)==="receber");
  const ab=l.filter(d=>!d.pago);
  const sit=!l.length?"vazio":ab.some(emAtraso)?"atraso":!ab.length?"quitado":m===ymNow?"atual":m<ymNow?"atraso":"futuro";
  return {m,l,n:l.length,pagar:somaV(p),receber:somaV(r),pAberto:somaV(p.filter(d=>!d.pago)),rAberto:somaV(r.filter(d=>!d.pago)),aberto:ab.length,sit};
}
const SIT={vazio:["Sem parcelas","s-vazio"],atraso:["Em atraso","s-atrasado"],quitado:["Quitado","s-pago"],atual:["Em aberto","s-apagar"],futuro:["Previsto","s-aguardando"]};
function faixaMeses(dir){
  const ms=mesesFaixa(dir);const rec=dir==="receber";
  return `<div class="mstrip" role="list" aria-label="Mês a mês">${ms.map(m=>{const x=resumoMes(m,dir);const v=rec?x.receber:x.pagar;const ab=rec?x.rAberto:x.pAberto;
    const [mm,yy]=monthShort(m).split("/");
    return `<button class="mchip ${SIT[x.sit][1]}${m===S.month?" on":""}" role="listitem" data-action="mesSel" data-month="${m}" aria-current="${m===S.month}" title="${esc(monthName(m))}: ${x.n?esc(money(v))+(ab?" · "+esc(money(ab))+" em aberto":"")+" · ":""}${esc(SIT[x.sit][0])}">
      <span class="mc-m">${esc(mm)}${mm==="jan"||m===ms[0]?`<small>${esc(yy)}</small>`:""}</span><i class="mc-dot" aria-hidden="true"></i></button>`}).join("")}</div>`;
}
function renderDirecao(c,dir){
  const rec=dir==="receber";const md=monthDocs().filter(d=>dirDe(d)===dir);
  requestAnimationFrame(()=>{const st=c.querySelector(".mstrip"),on=st&&st.querySelector(".mchip.on");if(on)st.scrollLeft=on.offsetLeft-st.offsetLeft-(st.clientWidth-on.offsetWidth)/2});
  const corpo=md.length?secaoDirecao(md,dir)
    :`<div class="empty"><h3>Nada ${rec?"a receber":"a pagar"} em ${esc(monthName(S.month))}</h3><p>Escolha outro mês acima. Os meses com ponto vermelho têm atraso.</p></div>`;
  c.innerHTML=`<div class="dir-bar">${faixaMeses(dir)}<span class="dir-acts">${rec?"":`<button class="btn small" data-action="extrato" title="Leia o extrato de comissão que a seguradora mandou">Ler extrato</button>`}${md.length?`<button class="linkbtn det-tg" data-action="detToggle" aria-pressed="${S.det}">${S.det?"Menos detalhes":"Mais detalhes"}</button>`:""}</span></div>${corpo}`;
}

// ---------------- dashboard ----------------
function renderDashboard(P){
  const ano=S.month.slice(0,4);const md=monthDocs();const sumv=l=>l.reduce((a,d)=>a+(Number(d.valor_repasse)||0),0);
  const pg=md.filter(d=>dirDe(d)==="pagar"&&!d.pago),rc=md.filter(d=>dirDe(d)==="receber"&&!d.pago),od=overdue();
  const prox=S.cfgL?(proximosLembretes(S.cfgL,1)[0]||{}).dt||null:null;
  const meses=Array.from({length:12},(_,i)=>shiftYM(S.month,i-11));
  const serie=meses.map(m=>{const l=S.docs.filter(d=>d.competencia===m);const p=l.filter(d=>dirDe(d)==="pagar"),r=l.filter(d=>dirDe(d)==="receber");
    return {m,pagar:sumv(p),receber:sumv(r),pAberto:sumv(p.filter(d=>!d.pago)),rAberto:sumv(r.filter(d=>!d.pago)),n:l.length}});
  const maxV=Math.max(1,...serie.map(x=>Math.max(x.pagar,x.receber)));
  const nice=v=>{const p=Math.pow(10,Math.floor(Math.log10(v)));const f=v/p;return (f<=1?1:f<=2?2:f<=2.5?2.5:f<=5?5:10)*p};
  const top=nice(maxV);const ticks=[0,top/2,top];
  const W=720,H=240,L=64,R=12,T=14,B=30,cw=(W-L-R)/12,bw=Math.min(16,cw*0.3),gap=2;
  const y=v=>T+(H-T-B)*(1-v/top);
  const kfmt=v=>v>=1000?(v/1000).toLocaleString("pt-BR",{maximumFractionDigits:1})+" mil":v.toLocaleString("pt-BR",{maximumFractionDigits:2});
  const vazio=serie.every(x=>!x.pagar&&!x.receber);
  const barra=(x0,v,cls)=>{const h=Math.max(0,y(0)-y(v));if(!h)return"";const r=Math.min(4,h/2),t=y(v);return `<path class="${cls}" d="M${x0},${y(0)} V${t+r} Q${x0},${t} ${x0+r},${t} H${x0+bw-r} Q${x0+bw},${t} ${x0+bw},${t+r} V${y(0)} Z"/>`};
  const bars=serie.map((x,i)=>{const cx=L+cw*i+cw/2;
    return `<g class="bar${x.m===S.month?" cur":""}" data-i="${i}" tabindex="0" aria-label="${esc(monthShort(x.m))}: a pagar ${esc(money(x.pagar))}, a receber ${esc(money(x.receber))}">
      <rect class="hit" x="${L+cw*i}" y="${T}" width="${cw}" height="${H-T-B}" fill="transparent"/>${barra(cx-bw-gap/2,x.pagar,"s-out")}${barra(cx+gap/2,x.receber,"s-in")}
      <text x="${cx}" y="${H-10}" text-anchor="middle" class="axis${x.m===S.month?" cur":""}">${esc(monthShort(x.m).split("/")[0])}</text></g>`}).join("");
  const rk={};S.docs.filter(d=>String(d.competencia).startsWith(ano)).forEach(d=>{const k=corrKey(d);const r=rk[k]=rk[k]||{nome:d.corretor,p:0,r:0};if(dirDe(d)==="receber")r.r+=Number(d.valor_repasse)||0;else r.p+=Number(d.valor_repasse)||0});
  const rankTodo=Object.values(rk).map(r=>({...r,v:r.p+r.r})).sort((a,b)=>b.v-a.v);const rank=S.rankAll?rankTodo:rankTodo.slice(0,5);const rmax=Math.max(1,...rank.map(r=>r.v));
  const semApolice=new Set(S.docs.filter(d=>!(d.anexos||[]).some(a=>a.categoria==="Apólice")).map(d=>d.id)).size;
  const mesNome=monthName(S.month).split(" ")[0].toLowerCase();
  P.innerHTML=`<section class="summary">
      <button type="button" class="stat hl go" data-action="kpi" data-go="pagar"><label>A pagar em ${esc(mesNome)}</label><div class="v">${money(sumv(pg))}</div><small>${pg.length} parcela${pg.length!==1?"s":""} às parceiras</small></button>
      <button type="button" class="stat in go" data-action="kpi" data-go="receber"><label>A receber em ${esc(mesNome)}</label><div class="v">${money(sumv(rc))}</div><small>${rc.length} parcela${rc.length!==1?"s":""} das parceiras líderes</small></button>
      <button type="button" class="stat go ${od.length?"bad":""}" data-action="kpi" data-go="atraso"><label>Em atraso</label><div class="v">${money(sumv(od))}</div><small>${od.length?`${od.length} parcela${od.length!==1?"s":""} de meses anteriores`:"nada atrasado"}</small></button>
      <button type="button" class="stat go" data-action="kpi" data-go="notif"><label>Próximo lembrete</label><div class="v txt">${prox?esc(prox.toLocaleDateString("pt-BR",{day:"2-digit",month:"short"}).replace(".","")):"—"}</div><small>${prox?esc(prox.toLocaleDateString("pt-BR",{weekday:"long"}))+` às ${String(prox.getHours()).padStart(2,"0")}h`:"configure em Notificações"}</small></button>
    </section>
    <div class="dash">
      <section class="cardbox wide chartbox"><div class="cb-head"><h3>Comissões mês a mês</h3><span class="meta">A pagar e a receber · 12 meses até ${esc(monthShort(S.month))}</span><span class="spacer"></span><span class="legend"><i class="lg s-out"></i>A pagar <i class="lg s-in"></i>A receber</span></div>
        ${vazio?`<p class="meta" style="padding:28px 0;text-align:center">Nenhuma cocorretagem nos últimos 12 meses.</p>`:`<div class="chartwrap"><svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="Comissões a pagar e a receber, mês a mês">
          ${ticks.map(t=>`<line x1="${L}" x2="${W-R}" y1="${y(t)}" y2="${y(t)}" class="grid"/><text x="${L-8}" y="${y(t)+4}" text-anchor="end" class="axis">${t?"R$ "+kfmt(t):"0"}</text>`).join("")}
          ${bars}</svg><div class="tip" id="tip" hidden></div></div>`}
        <details class="tableview"><summary>Ver em tabela</summary><div class="tablebox"><table><thead><tr><th>Mês</th><th class="r">Parcelas</th><th class="r">A pagar</th><th class="r">em aberto</th><th class="r">A receber</th><th class="r">em aberto</th></tr></thead><tbody>${serie.map(x=>`<tr><td>${esc(monthName(x.m))}</td><td class="r num">${x.n}</td><td class="r num">${money(x.pagar)}</td><td class="r num">${money(x.pAberto)}</td><td class="r num">${money(x.receber)}</td><td class="r num">${money(x.rAberto)}</td></tr>`).join("")}</tbody></table></div></details>
      </section>
      <section class="cardbox"><div class="cb-head"><h3>Parceiras com mais cocorretagem em ${ano}</h3><span class="meta">A pagar + a receber</span></div>
        ${rank.length?`<ul class="rank">${rank.map(r=>`<li><div class="rk-top"><span class="rk-name">${esc(r.nome)}</span><span class="num">${money(r.v)}</span></div><div class="rk-bar"><i class="s-out" style="width:${r.p/rmax*100}%"></i><i class="s-in" style="width:${r.r/rmax*100}%"></i></div><div class="rk-sub">${r.p?`pagar ${money(r.p)}`:""}${r.p&&r.r?" · ":""}${r.r?`receber ${money(r.r)}`:""}</div></li>`).join("")}</ul>
          ${rankTodo.length>5?`<button type="button" class="linkbtn rk-mais" data-action="rankMais">${S.rankAll?"Ver menos":`Ver mais (${rankTodo.length-5})`}</button>`:""}`:`<p class="meta">Nenhum lançamento em ${ano}.</p>`}
      </section>
      ${proximasAcoes()}

    </div>`;
  P._serie=serie;
}
// ---- próximas ações: o que pagar ou cobrar agora (a comissão cai 1 dia depois do vencimento do boleto) ----
function proximasAcoes(){
  const hoje=isoDay(today),lim=addDias(hoje,7);
  const it=S.docs.filter(d=>!d.pago&&d.vencimento).map(d=>{const cai=diaUtil(addDias(String(d.vencimento).slice(0,10),1));return {d,cai,rec:dirDe(d)==="receber"}});
  const grupos=[
    {k:"hoje",t:"Hoje",l:it.filter(x=>x.cai===hoje)},
    {k:"aberto",t:"Em aberto · a comissão já caiu",l:it.filter(x=>x.cai<hoje).sort((a,b)=>a.cai.localeCompare(b.cai))},
    {k:"prox",t:"Próximos 7 dias",l:it.filter(x=>x.cai>hoje&&x.cai<=lim).sort((a,b)=>a.cai.localeCompare(b.cai))}];
  const dias=x=>Math.round((new Date(hoje+"T12:00:00")-new Date(x.cai+"T12:00:00"))/864e5);
  const linha=(x,g)=>{const d=x.d,nome=parceiraCurta(d),rec=x.rec;
    const tit=g==="hoje"?(rec?`Cobrar ${nome}`:`Pagar ${nome}`):g==="aberto"?(rec?`Recebeu de ${nome}?`:`Pagou ${nome}?`):(rec?`Receber de ${nome}`:`Pagar ${nome}`);
    const quando=g==="hoje"?"a comissão cai hoje":g==="aberto"?`a comissão caiu há ${dias(x)} dia${dias(x)!==1?"s":""}`:`a comissão cai ${diaCurto(x.cai).toLowerCase()}`;
    const atr=g==="aberto"&&venceuHaMais5(d);
    return `<li class="pa-it ${rec?"in":"out"}${atr?" late":""}"><i class="pa-ic" aria-hidden="true">${rec?"↙":"↗"}</i>
      <div class="pa-tx" data-action="edit" data-id="${esc(d.id)}" tabindex="0"><b>${esc(tit)}</b><small>${esc(quando)} · apólice ${esc(d.apolice||"s/ nº")}${d.parcelas_total>1?` · parcela ${d.parcela_num}/${d.parcelas_total}`:""}</small></div>
      <span class="pa-v num">${money(d.valor_repasse)}</span>
      <span class="pa-bt">${rec&&g!=="prox"?`<button type="button" class="btn small ghost" data-action="copyCob" data-pid="${esc(d.pid||"")}">Copiar cobrança</button>`:""}${g!=="prox"?`<button type="button" class="btn small primary" data-action="confirmParc" data-pid="${esc(d.pid||"")}" data-rec="${rec?1:""}">${rec?"Já recebi":"Já paguei"}</button>`:""}</span></li>`};
  const MAX=4;const tot=grupos.reduce((a,g)=>a+g.l.length,0);
  return `<section class="cardbox acoes"><div class="cb-head"><h3>Próximas ações</h3><span class="meta">${tot?"O que pagar e cobrar, pelo vencimento de cada boleto":"Tudo em dia"}</span></div>
    ${tot?grupos.filter(g=>g.l.length).map(g=>{const all=S.acoesMais===g.k;const l=all?g.l:g.l.slice(0,MAX);
      return `<div class="pa-g ${g.k}"><div class="pa-h">${esc(g.t)} <span class="num">${g.l.length}</span></div><ul class="pa-l">${l.map(x=>linha(x,g.k)).join("")}</ul>
        ${g.l.length>MAX?`<button type="button" class="linkbtn pa-mais" data-action="acoesMais" data-k="${g.k}">${all?"Ver menos":`Ver mais (${g.l.length-MAX})`}</button>`:""}</div>`}).join("")
    :`<p class="pa-vazio">Nenhum pagamento ou cobrança para agora. Os próximos aparecem aqui 7 dias antes.</p>`}
  </section>`;
}
function showTip(g){
  const P=$("page");const serie=P&&P._serie;const tip=$("tip");if(!serie||!tip)return;
  const x=serie[+g.dataset.i];const wrap=g.closest(".chartwrap").getBoundingClientRect();const r=g.querySelector(".hit").getBoundingClientRect();
  tip.innerHTML=`<b>${esc(monthName(x.m))}</b><span><i class="lg s-out"></i>A pagar <i class="num">${money(x.pagar)}</i></span><span class="meta">em aberto ${money(x.pAberto)}</span><span><i class="lg s-in"></i>A receber <i class="num">${money(x.receber)}</i></span><span class="meta">em aberto ${money(x.rAberto)}</span>`;
  tip.hidden=false;const tw=tip.offsetWidth;let left=r.left-wrap.left+r.width/2-tw/2;left=Math.max(0,Math.min(left,wrap.width-tw));tip.style.left=left+"px";tip.style.top="0px";
}

// ---------------- calendário ----------------
function calLinha(d,titulo,confirmar){const rec=dirDe(d)==="receber";
  return `<div class="av-row${d.pago?" ok":""}"><div class="av-main"><b class="av-q">${esc(titulo)}</b><span class="av-v num ${rec?"in":"out"}">${money(d.valor_repasse)}</span>
    <div class="av-sub">Apólice <span class="num">${esc(d.apolice||"s/ nº")}</span>${grupoTag(d)}${d.parcelas_total>1?` · parcela ${d.parcela_num}/${d.parcelas_total}`:""}${d.vencimento?` · vencimento ${esc(dateBR(d.vencimento))}`:""} ${segTag(d.seguradora)} ${chip(status(d))}</div></div>
    <div class="av-act">${confirmar&&!d.pago?`<button class="btn small primary" data-action="confirmParc" data-pid="${esc(d.pid||"")}" data-rec="${rec?1:""}">${rec?"Sim, recebi":"Sim, paguei"}</button>`:""}<button class="btn small ghost" data-action="edit" data-id="${esc(d.id)}">Abrir</button></div></div>`}
function juntarDia(l){const g=new Map();l.forEach(d=>{const k=corrKey(d)+"|"+dirDe(d);const x=g.get(k);if(x)x.push(d);else g.set(k,[d])});
  return [...g.values()].sort((a,b)=>(a.every(x=>x.pago)-b.every(x=>x.pago))||(dirDe(a[0])==="receber")-(dirDe(b[0])==="receber"))}
function renderCalendario(P){
  const [a,m]=S.month.split("-").map(Number);const ult=ultimoDia(a,m);const ini=new Date(a,m-1,1).getDay();const hoje=isoDay(new Date());
  const dia=d=>`${S.month}-${String(d).padStart(2,"0")}`;
  const venc={};S.docs.forEach(d=>{if(d.vencimento&&String(d.vencimento).startsWith(S.month)){const k=String(d.vencimento).slice(0,10);(venc[k]=venc[k]||[]).push(d)}});
  Object.values(venc).forEach(l=>l.sort((x,y)=>(x.pago-y.pago)||String(x.corretor).localeCompare(String(y.corretor))));
  if(!S.calDay||!S.calDay.startsWith(S.month))S.calDay=S.month===hoje.slice(0,7)?hoje:null;
  const estado=d=>d.pago?"ok":emAtraso(d)||String(d.vencimento).slice(0,10)<addDias(hoje,-5)?"late":"";
  // a mesma corretora, no mesmo sentido e situação, vira uma etiqueta só: "VALIANZA ×3"
  const juntar=l=>{const g=new Map();l.forEach(d=>{const k=corrKey(d)+"|"+dirDe(d)+"|"+estado(d);const x=g.get(k);if(x)x.push(d);else g.set(k,[d])});return [...g.values()]};
  const item=l=>{const d=l[0];const rec=dirDe(d)==="receber";const st=estado(d);const tot=l.reduce((a,x)=>a+(Number(x.valor_repasse)||0),0);
    return `<span class="cv ${rec?"in":"out"}${st?" "+st:""}" title="${esc((rec?"Receber de ":"Pagar a ")+(d.corretor||"")+" · "+money(tot)+(l.length>1?` · ${l.length} parcelas`:" · apólice "+(d.apolice||"")))}"><i>${d.pago?"✓":rec?"↙":"↗"}</i><em>${esc(nomeCurtoDem(d.corretor))}</em>${l.length>1?`<b>×${l.length}</b>`:""}</span>`};
  const cells=[];for(let i=0;i<ini;i++)cells.push(`<div class="cal-cell blank" aria-hidden="true"></div>`);
  for(let d=1;d<=ult;d++){const iso=dia(d);const v=venc[iso]||[];const ws=new Date(a,m-1,d).getDay();
    cells.push(`<button class="cal-cell${iso===hoje?" today":""}${S.calDay===iso?" sel":""}${ws===0||ws===6?" wknd":""}${v.length?" tem":""}" data-action="calDay" data-iso="${iso}" aria-label="${d}${v.length?`, ${v.length} parcela${v.length>1?"s":""} vence${v.length>1?"m":""}`:""}">
      <span class="cal-n">${d}</span><span class="cal-ev">${(g=>g.slice(0,3).map(item).join("")+(g.length>3?`<span class="cv more">+${g.length-3}</span>`:""))(juntar(v))}</span></button>`)}
  const sel=S.calDay;let det="";
  if(sel){const v=venc[sel]||[];const d=+sel.slice(8);
    const dt=new Date(a,m-1,d).toLocaleDateString("pt-BR",{weekday:"long",day:"2-digit",month:"long"});
    const cai=diaUtil(addDias(sel,1));const somaDir=r=>v.filter(x=>!x.pago&&(dirDe(x)==="receber")===r).reduce((a,x)=>a+(Number(x.valor_repasse)||0),0);
    const tP=somaDir(false),tR=somaDir(true);
    // um cartão por corretora (e sentido), com as apólices dentro
    const grupos=juntarDia(v);
    det=`<section class="cardbox cal-det">
      <div class="cd-head"><div><h3>${esc(dt.charAt(0).toUpperCase()+dt.slice(1))}${sel===hoje?' <span class="tag">hoje</span>':""}</h3>
        ${v.length?`<p>${v.length} parcela${v.length>1?"s":""} vence${v.length>1?"m":""} · a comissão cai ${esc(diaCurto(cai).toLowerCase())}</p>`:""}</div></div>
      ${v.length?`${tP||tR?`<div class="cd-tot">${tP?`<div class="out"><span>A pagar</span><b class="num">${money(tP)}</b></div>`:""}${tR?`<div class="in"><span>A receber</span><b class="num">${money(tR)}</b></div>`:""}</div>`:""}
      ${grupos.map(l=>{const d0=l[0],rec=dirDe(d0)==="receber",aberto=l.filter(x=>!x.pago),tot=(aberto.length?aberto:l).reduce((a,x)=>a+(Number(x.valor_repasse)||0),0);
        const st=l.every(x=>x.pago)?"ok":l.some(x=>!x.pago&&(emAtraso(x)||String(x.vencimento).slice(0,10)<addDias(hoje,-5)))?"late":"";
        return `<article class="cd-g ${rec?"in":"out"}${st?" "+st:""}">
          <header><i aria-hidden="true">${st==="ok"?"✓":rec?"↙":"↗"}</i><div><b>${esc(String(d0.corretor||"Sem corretora").toLocaleUpperCase("pt-BR"))}</b>
            <small>${st==="ok"?(rec?"Recebido":"Pago"):(rec?"Receber":"Pagar")}${l.length>1?` · ${l.length} parcelas`:""}${st==="late"?' · <span class="late">atrasado</span>':""}</small></div><span class="num cd-v">${money(tot)}</span></header>
          <ul>${l.map(x=>`<li data-action="edit" data-id="${esc(x.id)}" tabindex="0" title="Abrir a apólice"><div class="cd-ap"><span class="num">${esc(x.apolice||"s/ nº")}</span>${x.parcelas_total>1?`<em>${x.parcela_num}/${x.parcelas_total}</em>`:""}${x.pago?'<em class="ok">✓ quitada</em>':""}<div class="cd-seg">${segTag(x.seguradora)}</div></div><span class="num cd-pv">${money(x.valor_repasse)}</span></li>`).join("")}</ul></article>`}).join("")}`
      :`<p class="meta cd-vazio">Nenhuma parcela vence neste dia.</p>`}</section>`}
  const ab=Object.values(venc).flat().filter(x=>!x.pago);const semV=S.docs.filter(x=>!x.pago&&!x.vencimento).length;
  const abP=ab.filter(x=>dirDe(x)==="pagar"),abR=ab.filter(x=>dirDe(x)==="receber");
  const atrP=abP.filter(x=>String(x.vencimento).slice(0,10)<addDias(hoje,-5)).length,atrR=abR.filter(x=>String(x.vencimento).slice(0,10)<addDias(hoje,-5)).length;
  const mesNome=monthName(S.month).split(" ")[0];
  const qt=(n,a)=>`${n} parcela${n!==1?"s":""} em aberto${a?` · <span class="late">${a} atrasada${a!==1?"s":""}</span>`:""}`;
  const mini=`<section class="cal-mini"><h3>${esc(mesNome)} <small>parcelas com vencimento no mês</small></h3><div class="cm-grid dois">
    <div class="cm out"><label>A pagar</label><b class="num">${money(somaV(abP))}</b><small>${qt(abP.length,atrP)}</small></div>
    <div class="cm in"><label>A receber</label><b class="num">${money(somaV(abR))}</b><small>${qt(abR.length,atrR)}</small></div></div></section>`;
  P.innerHTML=mini+`<div class="cal-top"><div class="cal-legend"><span class="cv out"><i>↗</i>A pagar à parceira</span><span class="cv in"><i>↙</i>A receber da parceira</span><span class="cv ok"><i>✓</i>Quitada</span><span class="cv out late"><i>↗</i>Venceu há mais de 5 dias, sem baixa</span></div>
    ${semV?`<span class="meta">${semV} parcela${semV>1?"s":""} em aberto sem vencimento informado</span>`:""}</div>
    <div class="cal-wrap"><div class="cal"><div class="cal-head">${["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"].map(x=>`<span>${x}</span>`).join("")}</div><div class="cal-grid">${cells.join("")}</div></div>
    ${det}</div>`;
}

// ---------------- relatórios ----------------
function repDocs(){const R=S.rep;const ano=S.month.slice(0,4);return S.docs.filter(d=>R.periodo==="ano"?String(d.competencia).startsWith(ano):d.competencia===S.month)}
function repPeriodoTxt(){return S.rep.periodo==="ano"?`Ano de ${S.month.slice(0,4)}`:monthName(S.month)}
function comissaoDe(d){return Math.round((Number(d.premio)||0)*(Number(d.comissao_pct)||0)/100*100)/100}
function margemDe(d){const v=Number(d.valor_repasse)||0;return dirDe(d)==="receber"?v:comissaoDe(d)-v}
function agruparRel(docs,por){
  const g={};
  docs.forEach(d=>{let k,nome,doc,sub="";
    if(por==="seguradora"){const r=segReg(d.seguradora);k=key(r?r.nome:d.seguradora)||"_";nome=r?r.nome:(d.seguradora||"Sem seguradora");doc=r&&r.cnpj||"";sub=r&&r.razao_social||""}
    else{k=corrKey(d);nome=d.corretor||"Sem corretora";doc=d.corretor_cnpj||""}
    const x=g[k]=g[k]||{k,nome,sub,doc,n:0,premio:0,comissao:0,pagar:0,receber:0,abertoP:0,abertoR:0,margem:0,itens:[]};
    if(!x.doc&&doc)x.doc=doc;const c=comissaoDe(d),v=Number(d.valor_repasse)||0;
    x.n++;x.premio+=Number(d.premio)||0;x.comissao+=c;x.margem+=margemDe(d);
    if(dirDe(d)==="receber"){x.receber+=v;if(!d.pago)x.abertoR+=v}else{x.pagar+=v;if(!d.pago)x.abertoP+=v}
    x.itens.push(d)});
  const r2=v=>Math.round(v*100)/100;Object.values(g).forEach(x=>["premio","comissao","pagar","receber","abertoP","abertoR","margem"].forEach(f=>x[f]=r2(x[f])));
  return Object.values(g).sort((a,b)=>(b.pagar+b.receber)-(a.pagar+a.receber)||a.nome.localeCompare(b.nome));
}
const REL_F=["n","premio","comissao","pagar","receber","abertoP","abertoR","margem"];
function relTotais(gs){const t=gs.reduce((t,x)=>{REL_F.forEach(f=>t[f]+=x[f]);return t},Object.fromEntries(REL_F.map(f=>[f,0])));REL_F.forEach(f=>t[f]=Math.round(t[f]*100)/100);return t}
function renderRelatorios(P){
  const R=S.rep;const docs=repDocs();const grupos=agruparRel(docs,R.por);const T=relTotais(grupos);
  const nAp=new Set(docs.map(d=>d.id)).size;
  const semCom=new Set(docs.filter(d=>!d.premio||!d.comissao_pct).map(d=>d.id)).size;
  const ent=R.por==="seguradora"?"seguradora(s)":"corretora(s)";
  P.innerHTML=`<div class="rep-print-head"><b>Relatório de cocorretagens · ${esc(repPeriodoTxt())}</b><span>${esc(EMIS.nome)} · CNPJ ${esc(EMIS.cnpj)} · Clube do Seguro Garantia</span><span>Gerado em ${esc(dtBR(new Date().toISOString()))} por ${esc(S.me.nome)}</span></div>
    <section class="summary rep-sum">
      <div class="stat"><label>Comissão das apólices</label><div class="v">${money(T.comissao)}</div><small>${nAp} apólice${nAp!==1?"s":""} · ${T.n} parcela${T.n!==1?"s":""} · prêmio ${money(T.premio)}</small></div>
      <div class="stat hl"><label>A pagar às parceiras</label><div class="v">${money(T.pagar)}</div><small>${money(T.pagar-T.abertoP)} pago · ${money(T.abertoP)} em aberto</small></div>
      <div class="stat in"><label>A receber das parceiras</label><div class="v">${money(T.receber)}</div><small>${money(T.receber-T.abertoR)} recebido · ${money(T.abertoR)} em aberto</small></div>
      <div class="stat"><label>Fica com a ${esc(emisCurto())}</label><div class="v">${money(T.margem)}</div><small>${T.comissao?Math.round(T.margem/T.comissao*100):0}% da comissão</small></div>
    </section>
    ${semCom?`<p class="meta rep-note">${semCom} apólice${semCom>1?"s":""} sem prêmio ou percentual de comissão; nelas a comissão e o valor que fica com a ${esc(emisCurto())} aparecem zerados.</p>`:""}
    ${grupos.length?`<div class="tablebox"><table class="rtable"><thead><tr><th>${R.por==="seguradora"?"Seguradora":"Corretora"}</th><th class="r">Parcelas</th><th class="r">Comissão</th><th class="r">A pagar</th><th class="r">A receber</th><th class="r">Em aberto</th><th class="r">Fica com a ${esc(emisCurto())}</th></tr></thead>
      <tbody>${grupos.map(g=>{const open=R.open===g.k;const ab=g.abertoP+g.abertoR;return `<tr class="rg${open?" open":""}" data-action="repOpen" data-k="${esc(g.k)}" tabindex="0"><td><b>${esc(g.nome)}</b>${g.sub?`<div class="sub">${esc(g.sub)}</div>`:""}${g.doc?`<div class="sub num">${esc(fmtCnpj(g.doc))}</div>`:""}</td>
        <td class="r num">${g.n}</td><td class="r num">${money(g.comissao)}</td><td class="r num">${g.pagar?`<b class="dir out">${money(g.pagar)}</b>`:"—"}</td><td class="r num">${g.receber?`<b class="dir in">${money(g.receber)}</b>`:"—"}</td>
        <td class="r num ab">${ab?[g.abertoP?`<span class="warn-txt">${money(g.abertoP)}</span><small>a pagar</small>`:"",g.abertoR?`<span class="warn-txt">${money(g.abertoR)}</span><small>a receber</small>`:""].filter(Boolean).join(""):"—"}</td><td class="r num">${money(g.margem)}</td>
</tr>
        ${open?`<tr class="rdet"><td colspan="7">${g.pagar&&R.por!=="seguradora"?`<div class="rdet-act"><button class="btn small" data-action="demRel" data-k="${esc(g.k)}">Demonstrativo de pagamento</button></div>`:""}<div class="dscroll"><table class="dtab"><thead><tr><th>Apólice</th><th>Parcela</th><th>Vencimento</th><th>${R.por==="seguradora"?"Corretora":"Seguradora"}</th><th>Líder</th><th class="r">Prêmio</th><th class="r">Com. %</th><th class="r">Comissão</th><th class="r">Parte parceira</th><th class="r">Valor</th><th>Status</th></tr></thead><tbody>
          ${g.itens.sort((a,b)=>String(a.competencia||"").localeCompare(String(b.competencia||""))||String(a.apolice).localeCompare(String(b.apolice))).map(d=>`<tr data-action="edit" data-id="${esc(d.id)}"><td class="num">${esc(d.apolice)}${grupoTag(d)}${d.numero_susep?`<div class="sub">SUSEP ${esc(d.numero_susep)}</div>`:""}</td><td class="num">${d.parcela_num}/${d.parcelas_total}</td><td class="num">${d.vencimento?esc(dateBR(d.vencimento)):esc(monthShort(d.competencia))}</td><td>${esc(R.por==="seguradora"?d.corretor:(d.seguradora||"—"))}</td><td>${dirDe(d)==="receber"?"Parceira":esc(emisCurto())}</td>
            <td class="r num">${money(d.premio)}</td><td class="r num">${d.comissao_pct!=null?pctFmt(d.comissao_pct):"—"}</td><td class="r num">${money(comissaoDe(d))}</td><td class="r num">${pctFmt(d.repasse_pct)}</td><td class="r num"><span class="dir ${dirDe(d)==="receber"?"in":"out"}">${dirDe(d)==="receber"?"+":"−"} ${money(d.valor_repasse)}</span></td><td>${chip(status(d))}</td></tr>`).join("")}</tbody></table></div></td></tr>`:""}`}).join("")}</tbody>
      <tfoot><tr><td>Total</td><td class="r num">${T.n}</td><td class="r num">${money(T.comissao)}</td><td class="r num">${money(T.pagar)}</td><td class="r num">${money(T.receber)}</td><td class="r num">${money(T.abertoP+T.abertoR)}</td><td class="r num">${money(T.margem)}</td></tr></tfoot></table></div>
      <p class="meta rep-note noprint">Parcelas com vencimento no mês. "A pagar" é o que a ${esc(emisCurto())} repassa quando é a líder; "A receber" é o que a parceira líder deve à ${esc(emisCurto())}. Clique numa linha para ver as parcelas. "Exportar Excel do mês" gera a planilha com o resumo, as corretoras e todas as parcelas.</p>`
    :`<div class="empty"><h3>Nenhuma parcela em ${esc(repPeriodoTxt())}</h3><p>Troque o mês nas setas acima.</p></div>`}`;
}
function xlsxMoney(ws,cols,fromRow){const rg=XLSX.utils.decode_range(ws["!ref"]);for(let r=fromRow;r<=rg.e.r;r++)for(const c of cols){const a=XLSX.utils.encode_cell({r,c});if(ws[a]&&typeof ws[a].v==="number")ws[a].z='"R$" #,##0.00'}}
function linhasApolices(docs){return docs.map(d=>{const sr=segReg(d.seguradora);const rec=dirDe(d)==="receber";const v=Number(d.valor_repasse)||0;
  return [d.apolice,d.numero_susep||"",`${d.parcela_num}/${d.parcelas_total}`,d.competencia,d.vencimento?dateBR(d.vencimento):"",dateBR(d.data_emissao),d.seguradora||"",sr&&sr.razao_social||"",sr&&sr.cnpj?fmtCnpj(sr.cnpj):"",d.corretor,d.corretor_cnpj?fmtCnpj(d.corretor_cnpj):"",rec?"Parceira":(d.emitida_por||EMIS.nome),d.emitida_por||EMIS.nome,d.tomador||"",d.tomador_cnpj?fmtCnpj(d.tomador_cnpj):"",Number(d.premio)||0,Number(d.comissao_pct)||0,comissaoDe(d),Number(d.repasse_pct)||0,rec?"A receber":"A pagar",rec?0:v,rec?v:0,margemDe(d),STATUS[status(d)][0],d.data_pagamento?dateBR(d.data_pagamento):"",d.observacao||""]})}
const HEAD_AP=["Apólice (seguradora)","Apólice (SUSEP)","Parcela","Competência","Vencimento","Emissão","Seguradora","Seguradora (razão social)","CNPJ seguradora","Corretora parceira","CNPJ parceira","Líder","Do grupo na apólice","Tomador","CNPJ tomador","Prêmio da parcela","Comissão %","Comissão","Parte da parceira %","Sentido","A pagar","A receber","Fica com a emissora","Status","Pago/recebido em","Observação"];
const W_AP=[22,28,8,11,11,11,12,30,20,32,20,22,26,30,20,14,10,14,10,10,14,14,14,20,13,40];
const M_AP=[15,17,20,21,22];
async function repExportar(soK){
  try{await loadXLSX()}catch(_){toast("Não foi possível carregar o gerador de Excel. Verifique a conexão.");return}
  const R=S.rep;const docs=repDocs();const grupos=agruparRel(docs,R.por);const per=repPeriodoTxt();const wb=XLSX.utils.book_new();
  const cab=[["Relatório de cocorretagens · "+per],[EMIS.nome+" · CNPJ "+EMIS.cnpj+" · Clube do Seguro Garantia"],["Gerado em "+dtBR(new Date().toISOString())+" por "+S.me.nome],[]];
  const vaz=n=>Array(n).fill("");
  if(soK){const g=grupos.find(x=>x.k===soK);if(!g)return;
    const aoa=[...cab,[(R.por==="seguradora"?"Seguradora: ":"Corretora: ")+g.nome+(g.doc?" · CNPJ "+fmtCnpj(g.doc):"")],[],HEAD_AP,...linhasApolices(g.itens),[],
      ["Total",...vaz(14),g.premio,"",g.comissao,"","",g.pagar,g.receber,g.margem],["Em aberto",...vaz(19),g.abertoP,g.abertoR]];
    const ws=XLSX.utils.aoa_to_sheet(aoa);ws["!cols"]=W_AP.map(wch=>({wch}));xlsxMoney(ws,M_AP,6);
    XLSX.utils.book_append_sheet(wb,ws,"Parcelas");XLSX.writeFile(wb,`cocorretagens-${safeName(g.nome)}-${R.periodo==="ano"?S.month.slice(0,4):S.month}.xlsx`);return}
  const T=relTotais(grupos);
  const resumo=XLSX.utils.aoa_to_sheet([...cab,["Indicador","Valor"],["Apólices",new Set(docs.map(d=>d.id)).size],["Parcelas",T.n],["Prêmio líquido",T.premio],["Comissão das apólices",T.comissao],["A pagar às parceiras",T.pagar],["  pago",T.pagar-T.abertoP],["  em aberto",T.abertoP],["A receber das parceiras",T.receber],["  recebido",T.receber-T.abertoR],["  em aberto",T.abertoR],["Fica com a emissora",T.margem]]);
  resumo["!cols"]=[{wch:28},{wch:18}];xlsxMoney(resumo,[1],7);XLSX.utils.book_append_sheet(wb,resumo,"Resumo");
  for(const por of ["corretora"]){const gs=agruparRel(docs,por);
    const sg=por==="seguradora";const pre=g=>sg?[g.nome,g.sub,g.doc?fmtCnpj(g.doc):""]:[g.nome,g.doc?fmtCnpj(g.doc):""];const off=sg?3:2;
    const ws=XLSX.utils.aoa_to_sheet([...cab,[...(sg?["Seguradora","Razão social","CNPJ"]:["Corretora","CNPJ"]),"Parcelas","Prêmio","Comissão","A pagar","Pagar em aberto","A receber","Receber em aberto","Fica com a emissora"],
      ...gs.map(g=>[...pre(g),g.n,g.premio,g.comissao,g.pagar,g.abertoP,g.receber,g.abertoR,g.margem]),[...(sg?["Total","",""]:["Total",""]),T.n,T.premio,T.comissao,T.pagar,T.abertoP,T.receber,T.abertoR,T.margem]]);
    ws["!cols"]=[...(sg?[{wch:16},{wch:32},{wch:20}]:[{wch:34},{wch:20}]),{wch:9},{wch:14},{wch:14},{wch:14},{wch:15},{wch:14},{wch:17},{wch:18}];xlsxMoney(ws,[1,2,3,4,5,6,7].map(i=>i+off),5);
    XLSX.utils.book_append_sheet(wb,ws,sg?"Por seguradora":"Por corretora")}
  const ap=XLSX.utils.aoa_to_sheet([...cab,HEAD_AP,...linhasApolices(docs)]);ap["!cols"]=W_AP.map(wch=>({wch}));xlsxMoney(ap,M_AP,5);
  XLSX.utils.book_append_sheet(wb,ap,"Parcelas");
  XLSX.writeFile(wb,`relatorio-cocorretagens-${R.periodo==="ano"?S.month.slice(0,4):S.month}.xlsx`);
}

// ---------------- notificações (página) ----------------
function renderNotificacoes(P){
  P.innerHTML=`<div class="notif"><section class="cardbox dev" id="devBox"></section><section class="cardbox" id="avBox"></section>
    <section class="cardbox" id="destBox"><p class="loading">Carregando destinatários…</p></section>
    <details class="cardbox cfg-det" id="cfgDet"${S.cfgOpen?" open":""}><summary><div><h3>Configurações dos avisos</h3><span class="meta" id="cfgResumo"></span></div><i class="chev" aria-hidden="true">▾</i></summary>
      <div class="cfg-in"><div id="avCfgBox"></div><div id="lembBox"><p class="loading">Carregando configuração…</p></div></div></details>
    <section class="cardbox"><div class="cb-head"><h3>Últimos envios</h3><span class="meta">E-mails e notificações que o sistema mandou</span></div><div id="logBox"><p class="loading">Carregando…</p></div></section></div>`;
  $("cfgDet").addEventListener("toggle",ev=>{S.cfgOpen=ev.target.open});
  renderDevice();renderAvisos();
  if(S.lemb){renderLembretes();renderDest()}
  loadLog();
}
function avLinha(a,acao){const d=a.d;const rec=dirDe(d)==="receber";
  return `<div class="av-row${a.tipo==="vence"?" vence":""}">
    <div class="av-main"><b class="av-q">${esc(perguntaAviso(a))}</b><span class="av-v num ${rec?"in":"out"}">${money(d.valor_repasse)}</span>
      <div class="av-sub">Apólice <span class="num">${esc(d.apolice||"s/ nº")}</span>${grupoTag(d)}${d.parcelas_total>1?` · parcela ${d.parcela_num}/${d.parcelas_total}`:""} · ${a.tipo==="vence"?"vence":"venceu"} em ${esc(dateBR(d.vencimento))} ${segTag(d.seguradora)}</div></div>
    <div class="av-act">${acao&&rec?`<button class="btn small ghost" data-action="copyCob" data-pid="${esc(d.pid||"")}">Copiar cobrança</button>`:""}${acao?`<button class="btn small primary" data-action="confirmParc" data-pid="${esc(d.pid||"")}" data-rec="${rec?1:""}">${rec?"Sim, recebi":"Sim, paguei"}</button>`:""}<button class="btn small ghost" data-action="edit" data-id="${esc(d.id)}">Abrir</button></div></div>`}
function renderDevice(){
  const box=$("devBox");if(!box)return;const p=S.push;const ok=CFG.VAPID_PUBLIC_KEY&&p.supported;
  const est=!CFG.VAPID_PUBLIC_KEY?["Push ainda não configurado","Peça ao administrador para concluir a publicação."]:!p.supported?(isIOS()&&!isStandalone()?["Instale o app para receber avisos","No iPhone: Safari → Compartilhar → Adicionar à Tela de Início, e abra o app pelo ícone."]:["Este navegador não aceita notificações","Use o Chrome, o Edge ou o app instalado no celular."]):p.on?["Avisos ativados neste aparelho","Você recebe no celular ou no computador os avisos de pagar e cobrar."]:["Avisos desligados neste aparelho","Ative para receber os avisos de pagar e cobrar no celular ou no computador."];
  box.innerHTML=`<div class="dev-in"><i class="dev-ic ${p.on&&ok?"on":"off"}" aria-hidden="true">${p.on&&ok?"✓":"!"}</i><div class="dev-tx"><b>${esc(est[0])}</b><span>${esc(est[1])}</span><small>E-mail: ${esc(S.me.email)}</small></div>
    <div class="dev-bt">${ok?(p.on?`<button type="button" class="btn small ghost" data-action="pushOff">Desativar</button>`:`<button type="button" class="btn primary" data-action="pushOn">${p.busy?"Ativando…":"Ativar avisos"}</button>`):""}<button type="button" class="btn small" data-action="lembTeste" id="lTesteBtn">Enviar teste agora</button></div></div>`;
}
function cfgResumo(){const el=$("cfgResumo");if(!el)return;const c=avisosCfg();const L=S.lemb&&S.lemb.cfg||S.cfgL||{};const H=horasL(L);
  el.textContent=[`${c.on?"Cobranças "+c.dias.join(" e ")+" dias depois do vencimento":"Cobranças desligadas"}, às ${H.map(hh).join(" e ")}`,
    L.pendencias_fim_mes!==false?"penúltimo dia: faltou alguma pendência?":"",L.relatorio_fim_mes!==false?`último dia ${hh(L.hora_relatorio??19)}: relatório`:"",
    (L.dias||[]).length?"pendências também no dia "+[...L.dias].sort((a,b)=>a-b).map(d=>d===31?"último":d).join(", "):""].filter(Boolean).join(" · ")}
function renderAvisos(){
  const box=$("avBox");if(!box)return;
  if(!S.av||!S.av.dirty){const c=avisosCfg();S.av={on:c.on,dias:[...c.dias],dirty:false}}
  const A=S.av;const hoje=isoDay(today);const fim=addDias(hoje,30);
  const conf=aConfirmar();const todos=todosAvisos();
  const venceHoje=todos.filter(a=>a.tipo==="vence"&&a.data===hoje);
  const prox=todos.filter(a=>a.data>hoje&&a.data<=fim).sort((x,y)=>x.data.localeCompare(y.data)||x.n-y.n);
  const porDia={};prox.forEach(a=>(porDia[a.data]=porDia[a.data]||[]).push(a));
  const semVenc=S.docs.filter(d=>!d.pago&&!d.vencimento).length;
  const rotulo=n=>n===0?"No dia do vencimento":`${n} dia${n>1?"s":""} depois`;
  const cfgBox=$("avCfgBox");if(cfgBox)cfgBox.innerHTML=`<h4 class="cfg-h">Avisos de cada boleto</h4><p class="meta cfg-p">A comissão cai na conta da corretora líder um dia depois do vencimento do boleto. O app cobra por e-mail e no celular nos dias abaixo, contados a partir do vencimento, em cada horário escolhido, até haver baixa.</p>
    <div class="av-cfg">
      <label class="check"><input type="checkbox" id="avOn"${A.on?" checked":""}> Avisos ligados</label>
      <div class="av-chips">${A.dias.map(n=>`<span class="av-chip">${esc(rotulo(n))}${A.dias.length>1?`<button type="button" data-action="avDel" data-n="${n}" aria-label="Tirar ${esc(rotulo(n))}">✕</button>`:""}</span>`).join("")}
        <span class="av-add"><input id="avNovo" type="number" min="0" max="60" placeholder="dias" aria-label="Dias depois do vencimento"><button type="button" class="btn small" data-action="avAdd">+ Aviso</button></span></div>
      ${A.dirty?`<button class="btn small primary" data-action="avSave">Salvar</button>`:""}
      <span class="meta av-fds">Sábado ou domingo: avisa na segunda.</span>
    </div>`;
  cfgResumo();
  const gr=new Map();conf.forEach(a=>{const k=corrKey(a.d)+"|"+dirDe(a.d);(gr.get(k)||gr.set(k,[]).get(k)).push(a)});
  const dias=d=>Math.max(0,Math.round((new Date(hoje+"T12:00:00")-new Date(String(d.vencimento).slice(0,10)+"T12:00:00"))/864e5));
  const cartao=l=>{const d0=l[0].d,rec=dirDe(d0)==="receber",tot=l.reduce((s,a)=>s+(Number(a.d.valor_repasse)||0),0),mx=Math.max(...l.map(a=>dias(a.d))),atr=l.some(a=>emAtraso(a.d));const pids=l.map(a=>a.d.pid).filter(Boolean).join(",");
    return `<article class="cd-g av-g ${rec?"in":"out"}${atr?" late":""}"><header><i aria-hidden="true">${rec?"↙":"↗"}</i><div><b>${esc(String(d0.corretor||"Sem corretora").toLocaleUpperCase("pt-BR"))}</b>
      <small>${rec?"Receber":"Pagar"}${l.length>1?` · ${l.length} parcelas`:""} · ${atr?`<span class="late">venceu há ${mx} dias</span>`:`venceu há ${mx} dia${mx!==1?"s":""}`}</small></div><span class="num cd-v">${money(tot)}</span></header>
      <div class="av-gact">${rec?`<button class="btn small ghost" data-action="copyCobG" data-pids="${esc(pids)}">Copiar cobrança</button>`:""}<button class="btn small primary" data-action="confirmVarias" data-pids="${esc(pids)}" data-rec="${rec?1:""}">${rec?(l.length>1?"Sim, recebi todas":"Sim, recebi"):(l.length>1?"Sim, paguei todas":"Sim, paguei")}</button></div>
      ${l.length>1?`<ul>${l.map(a=>{const d=a.d;return `<li data-action="edit" data-id="${esc(d.id)}" tabindex="0" title="Abrir a apólice"><div class="cd-ap"><span class="num">${esc(d.apolice||"s/ nº")}</span>${d.parcelas_total>1?`<em>${d.parcela_num}/${d.parcelas_total}</em>`:""}<em>venceu ${esc(dateBR(d.vencimento))}</em><div class="cd-seg">${segTag(d.seguradora)}</div></div><span class="num cd-pv">${money(d.valor_repasse)}</span><button class="btn small ghost av-one" data-action="confirmParc" data-pid="${esc(d.pid||"")}" data-rec="${rec?1:""}">${rec?"Recebi":"Paguei"}</button></li>`}).join("")}</ul>`
      :`<ul><li data-action="edit" data-id="${esc(d0.id)}" tabindex="0" title="Abrir a apólice"><div class="cd-ap"><span class="num">${esc(d0.apolice||"s/ nº")}</span>${d0.parcelas_total>1?`<em>${d0.parcela_num}/${d0.parcelas_total}</em>`:""}<em>venceu ${esc(dateBR(d0.vencimento))}</em><div class="cd-seg">${segTag(d0.seguradora)}</div></div><span class="num cd-pv">${money(d0.valor_repasse)}</span></li></ul>`}</article>`};
  const grupos=[...gr.values()].sort((a,b)=>(b.some(x=>emAtraso(x.d))-a.some(x=>emAtraso(x.d)))||String(a[0].d.vencimento).localeCompare(String(b[0].d.vencimento)));
  box.innerHTML=`<div class="cb-head"><h3>Cobranças em aberto ${conf.length?`<span class="av-n">${conf.length}</span>`:""}</h3><span class="meta">A comissão já caiu e ainda não houve baixa · agrupadas por corretora</span></div>
    <div class="av-sec">${conf.length?`<div class="av-grid">${grupos.map(cartao).join("")}</div>`:`<p class="meta">Nenhuma cobrança em aberto. Tudo em dia.</p>`}</div>
    ${venceHoje.length?`<div class="av-sec"><h4>Vencem hoje</h4>${venceHoje.map(a=>avLinha(a,false)).join("")}</div>`:""}
    <div class="av-sec"><h4>Próximos 30 dias</h4>
      ${Object.keys(porDia).length?`<ul class="av-tl">${Object.entries(porDia).map(([dt,l])=>`<li><span class="av-dt">${esc(diaCurto(dt))}</span>
        <div>${l.map(a=>`<button class="av-it ${a.tipo}" data-action="edit" data-id="${esc(a.d.id)}"><i>${a.tipo==="vence"?"vence":a.n<=1?"cobrança":"2º aviso"}</i>${esc(a.tipo==="vence"?`${parceiraCurta(a.d)} · ${dirDe(a.d)==="receber"?"a receber":"a pagar"}`:perguntaAviso(a))} <span class="num">${money(a.d.valor_repasse)}</span></button>`).join("")}</div></li>`).join("")}</ul>`:`<p class="meta">Nenhum aviso nos próximos 30 dias.</p>`}
      ${semVenc?`<p class="meta av-warn">${semVenc} parcela${semVenc>1?"s":""} em aberto sem data de vencimento não ${semVenc>1?"geram":"gera"} aviso. Informe o vencimento na tabela de parcelas da apólice.</p>`:""}</div>`;
}
async function copiarCobrancaParcela(pid){
  const d=S.docs.find(x=>x.pid===pid);if(!d)return;
  const txt=[`Cobrança de cocorretagem`,`Corretora: ${d.corretor}${d.corretor_cnpj?` · CNPJ ${fmtCnpj(d.corretor_cnpj)}`:""}`,"",
    `Apólice ${d.apolice}${d.numero_susep?` (SUSEP ${d.numero_susep})`:""}${d.parcelas_total>1?` · parcela ${d.parcela_num}/${d.parcelas_total}`:""}${d.emitida_por?` · emitida pela ${d.emitida_por}`:""}`,
    `${d.seguradora?segRazao(d.seguradora)+" · ":""}tomador ${d.tomador||"—"}`,`Vencimento da parcela: ${dateBR(d.vencimento)}`,`Valor da nossa parte: ${money(d.valor_repasse)}`,"",
    `Favorecida: ${EMIS.nome} · CNPJ ${EMIS.cnpj}`,"Clube do Seguro Garantia"].join("\n");
  try{await navigator.clipboard.writeText(txt);toast("Cobrança copiada. Cole no WhatsApp ou e-mail.")}catch(_){toast("Não foi possível copiar neste navegador.")}
}
async function copiarCobrancaGrupo(pids){
  const l=pids.map(p=>S.docs.find(x=>x.pid===p)).filter(Boolean);if(!l.length)return;const d0=l[0];const tot=l.reduce((s,d)=>s+(Number(d.valor_repasse)||0),0);
  const txt=[`Cobrança de cocorretagem`,`Corretora: ${d0.corretor}${d0.corretor_cnpj?` · CNPJ ${fmtCnpj(d0.corretor_cnpj)}`:""}`,"",
    ...l.map(d=>`• Apólice ${d.apolice}${d.parcelas_total>1?` · parcela ${d.parcela_num}/${d.parcelas_total}`:""} · ${d.seguradora?segRazao(d.seguradora)+" · ":""}vencimento ${dateBR(d.vencimento)} · ${money(d.valor_repasse)}`),
    "",`Total da nossa parte: ${money(tot)}`,"",`Favorecida: ${EMIS.nome} · CNPJ ${EMIS.cnpj}`,"Clube do Seguro Garantia"].join("\n");
  try{await navigator.clipboard.writeText(txt);toast("Cobrança copiada. Cole no WhatsApp ou e-mail.")}catch(_){toast("Não foi possível copiar neste navegador.")}
}
async function confirmarVarias(pids,rec){
  if(!pids.length){toast("Parcelas sem identificação. Abra a apólice para marcar.");return}
  const dt=isoDay(today);const {error}=await sb.from("parcelas").update({pago:true,data_pagamento:dt,pago_por:S.me.email}).in("id",pids);
  if(error){toast(errMsg(error));return}
  S.ultimaBaixa={ids:pids,rec};toast(`${rec?"Recebimento":"Pagamento"} registrado hoje${pids.length>1?` (${pids.length} parcelas)`:""}.`,{label:"Desfazer",action:"undoLastPay"});load();
}
async function confirmarParcela(pid,rec){
  if(!pid){toast("Parcela sem identificação. Abra a apólice para marcar.");return}
  const dt=isoDay(today);const {error}=await sb.from("parcelas").update({pago:true,data_pagamento:dt,pago_por:S.me.email}).eq("id",pid);
  if(error){toast(errMsg(error));return}
  S.ultimaBaixa={ids:[pid],rec};toast(`${rec?"Recebimento":"Pagamento"} registrado hoje.`,{label:"Desfazer",action:"undoLastPay"});load();
}
async function saveAvisos(){
  const A=S.av;if(!A)return;const dias=[...new Set(A.dias)].sort((a,b)=>a-b);
  const {error}=await sb.from("config_lembretes").update({avisos_venc:A.on,avisos_dias:dias}).eq("emissora_id",S.emisId);
  if(error){toast(errMsg(error));return}
  S.cfgL={...(S.cfgL||{}),avisos_venc:A.on,avisos_dias:dias};A.dirty=false;renderAvisos();render();toast("Avisos de vencimento salvos.");
}
async function loadLog(){
  const {data,error}=await painelEq(sb.from("notificacoes_log").select("*")).order("enviado_em",{ascending:false}).limit(40);
  const box=$("logBox");if(!box)return;
  if(error){box.innerHTML=`<p class="meta">O histórico aparece depois que o SQL atualizado for rodado (passo 2).</p>`;return}
  if(!data.length){box.innerHTML=`<p class="meta">Nenhum envio ainda. O primeiro lembrete aparece aqui, e o botão "Enviar teste agora" também registra.</p>`;return}
  const tipo={fechamento:"Lembrete de repasse",atraso:"Lembrete de atrasos",nova:"Nova apólice",teste:"Teste",vencimento:"Cobrança de parcela",pendencias:"Faltou alguma pendência?",relatorio:"Relatório mensal",revisao:"Revisão do mês"};
  box.innerHTML=`<ul class="log">${data.map(l=>`<li><div class="log-top"><b>${esc(l.titulo||tipo[l.tipo]||l.tipo)}</b><span class="meta">${esc(dtBR(l.enviado_em))}</span></div>
    <div class="meta">${esc(l.resumo||"")}</div><div class="log-ch">${l.email?`<span class="chip ${/enviado/.test(l.email)?"s-pago":"s-atrasado"}">E-mail: ${esc(l.email)}</span>`:""}${l.push?`<span class="chip s-aguardando">Push: ${esc(l.push)}</span>`:""}</div></li>`).join("")}</ul>`;
}

function secaoDirecao(md,dir){
    const groups={};
    md.filter(d=>dirDe(d)===dir).forEach(d=>{const k=grupoKey(d);(groups[k]=groups[k]||{name:d.corretor||"Sem corretora",cnpj:"",pix:"",items:[]}).items.push(d);if(d.corretor_cnpj)groups[k].cnpj=d.corretor_cnpj});
    const list=Object.entries(groups).map(([k,g])=>{g.k=k;g.open=g.items.filter(d=>!d.pago);g.openTot=g.open.reduce((a,d)=>a+(+d.valor_repasse||0),0);g.tot=g.items.reduce((a,d)=>a+(+d.valor_repasse||0),0);
        g.atraso=g.open.some(emAtraso);g.prox=g.open.map(d=>String(d.vencimento||"9999")).sort()[0]||"9999";return g})
      // urgência: atrasadas primeiro, depois quem vence antes; quitadas por último
      .sort((a,b)=>(b.open.length>0)-(a.open.length>0)||(b.atraso-a.atraso)||a.prox.localeCompare(b.prox)||b.openTot-a.openTot||a.name.localeCompare(b.name));
    if(!list.length)return "";
    const rec=dir==="receber";const tot=list.reduce((a,g)=>a+g.openTot,0);const totQ=list.reduce((a,g)=>a+g.tot,0)-tot;
    return `<h3 class="sec-h ${rec?"in":"out"}">${rec?"A receber das parceiras líderes":"A pagar às parceiras"} <span class="num">${money(tot)}</span>${totQ>0.004?`<span class="meta">${tot?"em aberto · ":""}${money(totQ)} ${rec?"já recebido":"já pago"}</span>`:""}<small>${rec?"a parceira recebe da seguradora e paga a "+esc(emisCurto()):"a "+esc(emisCurto())+" recebe da seguradora e paga a parceira"}</small></h3>
    <div class="groups${S.det?" det":""}">${list.map(g=>{
      const allPaid=!g.open.length;const conf=S.confirming===g.k;
      const items=[...g.items].sort((a,b)=>String(a.data_emissao||"").localeCompare(String(b.data_emissao||"")));
      const flag=allPaid?(rec?"tudo recebido":"tudo pago"):"";
      return `<article class="group ${rec?"g-in":"g-out"}${allPaid?" quitado":""}">
        <div class="g-head"><div><div class="g-name"${g.cnpj?` title="CNPJ ${esc(fmtCnpj(g.cnpj))}"`:""}>${esc(String(g.name).toLocaleUpperCase("pt-BR"))}</div>${S.det&&g.cnpj?`<div class="g-meta num">${esc(fmtCnpj(g.cnpj))}</div>`:""}${flag?`<div class="g-meta">${esc(flag)}</div>`:""}</div>
          <div class="g-total num">${money(allPaid?g.tot:g.openTot)}</div></div>
        <div class="rows">${items.map(d=>{const st=status(d);const normal=st==="apagar"||st==="areceber";
          return `<div class="row lean" data-action="edit" data-id="${esc(d.id)}" tabindex="0">
            <div class="cell">
              <div class="ap-info"><span class="lbl">Tomador</span><span class="tom">${esc(d.tomador||"—")}</span>${d.tomador_cnpj?`<span class="num tcnpj">${esc(fmtCnpj(d.tomador_cnpj))}</span>`:""}${segTag(d.seguradora)}</div>
              <div class="ap ap-split" title="Apólice ${esc(d.apolice||"s/ nº")}">${splitBar(d)}${grupoTag(d)}${d.parcelas_total>1?`<span class="pc">${d.parcela_num}/${d.parcelas_total}</span>`:""}</div>
              ${S.det?`<div class="sub det-l">Apólice <span class="num">${esc(d.apolice||"s/ nº")}</span> · Emissão ${esc(dateBR(d.data_emissao))}${d.modalidade?` · ${esc(d.modalidade)}`:""}${(d.anexos||[]).length?` · ${(d.anexos||[]).length} anexo${(d.anexos||[]).length>1?"s":""}`:""}</div>`:""}</div>
            <div class="val num">${g.items.length>1?money(d.valor_repasse):""}</div><div class="c-st">${normal?"":chip(st)}</div></div>`}).join("")}</div>
        ${conf?`<div class="confirm"><p>Registrar ${rec?"recebimento":"pagamento"} de <span class="num">${money(g.openTot)}</span> ${rec?"de":"a"} ${esc(g.name)} (${g.open.length} parcela${g.open.length>1?"s":""})?</p>
            <label class="meta" for="payDate">${rec?"Recebido":"Pago"} em</label><input type="date" id="payDate" value="${isoDay(today)}">
            <button class="btn primary small" data-action="confirmPay" data-k="${esc(g.k)}">Confirmar</button><button class="btn small ghost" data-action="cancelPay">Cancelar</button></div>`
        :S.editPay===g.k?`<div class="confirm"><p>${rec?"Recebimento":"Pagamento"} de <span class="num">${money(somaV(g.items.filter(d=>d.pago)))}</span> (${g.items.filter(d=>d.pago).length} parcela${g.items.filter(d=>d.pago).length>1?"s":""})</p>
            <label class="meta" for="payEditDate">${rec?"Recebido":"Pago"} em</label><input type="date" id="payEditDate" value="${esc(String((g.items.find(d=>d.pago)||{}).data_pagamento||isoDay(today)).slice(0,10))}">
            <button class="btn primary small" data-action="editPaySave" data-k="${esc(g.k)}">Salvar data</button><button class="btn small danger" data-action="undoGroupPay" data-k="${esc(g.k)}">Desfazer ${rec?"recebimento":"pagamento"}</button><button class="btn small ghost" data-action="editPayCancel">Cancelar</button></div>`
        :`<div class="g-actions">${g.items.some(d=>d.pago)?`<span class="paid-info">${rec?"Recebido":"Pago"} em ${[...new Set(g.items.filter(d=>d.pago).map(d=>dateBR(d.data_pagamento)))].join(", ")} <button class="linkbtn" data-action="editPay" data-k="${esc(g.k)}">Alterar ou desfazer</button></span>`:""}<span style="flex:1"></span>
            ${rec?"":`<button class="btn small ghost" data-action="dem" data-k="${esc(g.k)}">Demonstrativo</button>`}<button class="btn small ghost" data-action="copy" data-k="${esc(g.k)}">${rec?"Copiar cobrança":"Copiar extrato"}</button>
            ${!allPaid?`<button class="btn small primary" data-action="pay" data-k="${esc(g.k)}">${rec?"Registrar recebimento":"Registrar pagamento"}</button>`:""}</div>`}
      </article>`}).join("")}</div>`;
}
function filtered(){
  const q=key(S.q);const qd=soDigitos(S.q);
  return S.docs.filter(d=>(!q||[d.apolice,d.numero_susep,d.corretor,d.tomador,d.seguradora,d.observacao].some(v=>key(v).includes(q))||(qd.length>=4&&[d.tomador_cnpj,d.corretor_cnpj,d.numero_susep,d.apolice].some(v=>soDigitos(v).includes(qd)))))
    .sort((a,b)=>String(b.data_emissao||"").localeCompare(String(a.data_emissao||""))||a.parcela_num-b.parcela_num);
}
function renderTabela(c){
  const rows=filtered();const somaV=l=>l.reduce((a,d)=>a+(+d.valor_repasse||0),0);

  c.innerHTML=`<p class="meta lista-info">${S.q.trim()?`Resultados para "${esc(S.q.trim())}" em todas as apólices.`:"Todas as parcelas, da mais recente para a mais antiga. Use a busca acima para filtrar."}</p>
    ${rows.length?`<div class="tablebox"><table>
      <thead><tr><th>Emissão</th><th>Apólice</th><th>Tomador</th><th>Parceira</th><th>Seguradora</th><th class="r">Valor</th><th>Compet.</th><th>Status</th></tr></thead>
      <tbody>${rows.map(d=>`<tr data-action="edit" data-id="${esc(d.id)}" tabindex="0">
        <td class="num">${esc(dateBR(d.data_emissao))}</td><td class="num">${esc(d.apolice||"—")}${grupoTag(d)}${clipBadge(d)}${d.numero_susep?`<div class="sub">SUSEP ${esc(d.numero_susep)}</div>`:""}${parcTxt(d)?`<div class="sub">${parcTxt(d)}</div>`:""}</td>
        <td>${esc(d.tomador||"—")}${d.tomador_cnpj?`<div class="sub num">${esc(fmtCnpj(d.tomador_cnpj))}</div>`:""}</td><td>${esc(d.corretor||"—")}<div class="sub">${d.lider==="parceira"?"líder":"co-corretora"}</div></td><td>${esc(d.seguradora||"—")}</td>
        <td class="r num"><span class="dir ${dirDe(d)==="receber"?"in":"out"}">${dirDe(d)==="receber"?"+":"−"}</span> ${money(d.valor_repasse)}</td><td class="num">${esc(monthShort(d.competencia))}</td><td>${chip(status(d))}</td></tr>`).join("")}</tbody>
      <tfoot><tr><td colspan="5">${rows.length} parcela${rows.length>1?"s":""} · ${new Set(rows.map(d=>d.id)).size} apólice${new Set(rows.map(d=>d.id)).size>1?"s":""}</td><td class="r num" colspan="3">− ${money(somaV(rows.filter(d=>dirDe(d)==="pagar")))} a pagar · + ${money(somaV(rows.filter(d=>dirDe(d)==="receber")))} a receber</td></tr></tfoot></table></div>`
    :`<div class="empty"><h3>Nenhuma parcela encontrada</h3><p>Ajuste a busca.</p></div>`}`;

}

// ---------------- painel de lançamento ----------------
function blank(){return {apolice:"",numero_susep:"",seguradora:"",tomador:"",modalidade:"",data_emissao:isoDay(today),premio:null,comissao_pct:null,emitida_por:"",lider:"emissora",nivel:"custom",repasse_pct:null,valor_repasse:0,valor_manual:false,corretor:"",corretor_cnpj:"",corretor_susep:"",corretor_pix:"",competencia:S.month,parcelas_qtd:1,parcelas:[{numero:1,vencimento:null,premio_parcela:null,valor:0,competencia:S.month,pago:false}],observacao:"",anexos:[]}}
function openPanel(id){
  const d=id?S.apolices.find(x=>x.id===id):null;if(id&&!d)return;
  const data=d?{...blank(),...d,anexos:(d.anexos||[]).map(a=>({...a})),parcelas:(d.parcelas&&d.parcelas.length?d.parcelas:[{numero:1,valor:d.valor_repasse,competencia:d.competencia||S.month,pago:false}]).map(p=>({...p}))}:blank();
  data.parcelas.forEach(p=>{p.pagoOrig=!!p.pago});data.parcelas_qtd=data.parcelas.length;data.competencia=data.parcelas[0].competencia;
  S.editing={id:id||null,data,confirmDel:false,added:[],removed:[],uploading:[],saving:false};
  renderPanel();
}
function closePanel(saved,silent){
  const e=S.editing;S.editing=null;const pr=$("panelRoot");if(pr)pr.innerHTML="";
  if(e&&!saved&&e.added.length&&sb)sb.storage.from(BUCKET).remove(e.added.map(a=>a.path)).catch(()=>{});
  if(e&&S.ext&&!S.dem)renderExtrato();
  else if(e&&S.ficha&&!S.dem)renderFicha();
}
function curtoDe(n){n=n||"";const m=n.replace(/\s+(LTDA|S\.?A\.?|ME|EPP|EIRELI)\.?$/i,"").replace(/\s+(CORRETORA|CORRETAGEM|COR)(\s+DE\s+(SEGUROS|SEG))?\.?$/i,"").replace(/\s+DE\s+SEGUROS$/i,"").replace(/\s+(ADMINISTRADORA\s+E|E)$/i,"").replace(/\s+ADMINISTRADORA$/i,"").trim()||n;return m.length>22?m.split(" ").slice(0,2).join(" "):m}
function emisCurto(){return curtoDe(EMIS.nome)}
// corretoras do mesmo dono da emissora (cadastradas no painel): contam como "nós"
function grupoDe(){return (EMIS.grupo||[])}
function susepN(v){return soDigitos(v).replace(/^0+/,"")}
function membroGrupo(c){if(!c)return null;const cn=normCnpj(c.cnpj||""),su=susepN(c.susep||""),k=key(c.nome||"");
  const bate=(g)=>{const gc=normCnpj(g.cnpj||""),gs=susepN(g.susep||""),gk=key(g.nome||"");if(cn&&gc)return cn===gc;if(su&&gs&&su===gs)return true;
    return !!k&&!!gk&&(k===gk||k.split(" ").slice(0,2).join(" ")===gk.split(" ").slice(0,2).join(" "))};
  if(bate({nome:EMIS.nome,cnpj:EMIS.cnpj,susep:EMIS.susep}))return {nome:EMIS.nome,principal:true};
  const g=grupoDe().find(bate);return g?{nome:g.nome,principal:false}:null}
// quem do grupo aparece na apólice (nome curto para os textos)
function nossoCurto(d){return d&&d.emitida_por?curtoDe(d.emitida_por):emisCurto()}
function resumoApolice(d){const p=[];if(d.apolice)p.push(`<b class="num">${esc(d.apolice)}</b>${grupoTag(d)}${d.numero_susep?` <small class="num">(SUSEP ${esc(d.numero_susep)})</small>`:""}`);if(d.seguradora)p.push(esc(d.seguradora));if(d.modalidade)p.push(esc(d.modalidade));if(d.tomador)p.push(esc(d.tomador));if(d.premio)p.push(`prêmio <b class="num">${money(d.premio)}</b>`);return p}
function renderPanel(){
  const e=S.editing;if(!e)return;const d=e.data;
  const corretores=[...new Map(S.docs.filter(x=>x.corretor).map(x=>[key(x.corretor),x.corretor])).values()].sort();
  const res=resumoApolice(d);const faltam=[!d.apolice&&"nº da apólice"].filter(Boolean);
  const openAp=e.openAp!=null?e.openAp:false;const openPg=e.openPg!=null?e.openPg:false;
  const temIA=e.aiFilled&&[...e.aiFilled].some(f=>["apolice","data_emissao","seguradora","modalidade","tomador","tomador_cnpj","premio"].includes(f));
  $("panelRoot").innerHTML=`<div class="scrim" data-action="close"></div>
  <aside class="panel" role="dialog" aria-modal="true" aria-labelledby="pTitle">
    <div class="p-head"><h2 id="pTitle">${e.id?"Editar apólice":"Nova apólice com cocorretagem"}${grupoTag(e.data)}</h2><button class="iconbtn" data-action="close" aria-label="Fechar">✕</button></div>
    <form class="p-body" id="pform" autocomplete="off">
      <section class="step"><div class="step-h"><span class="step-n">1</span><div><b>Documento da apólice</b><span>${S.iaOk!==false?"Envie o PDF: a IA lê e preenche os dados da apólice.":"Anexe a apólice, o boleto e outros documentos."}</span></div></div>
        <div class="docs" id="anexosBox"></div><div id="aiBox"></div></section>

      <section class="step manual"><div class="step-h"><span class="step-n">2</span><div><b>Cocorretagem</b><span>Não consta na apólice. A comissão é calculada sobre o prêmio e dividida entre a ${esc(emisCurto())} e a parceira.</span></div></div>
        ${grupoDe().length?`<div class="f emit"><label for="emitida_por">Corretora do grupo na apólice</label><select id="emitida_por"><option value="">${esc(EMIS.nome)}</option>${grupoDe().map(g=>`<option value="${esc(g.nome)}"${d.emitida_por===g.nome?" selected":""}>${esc(g.nome)}</option>`).join("")}${d.emitida_por&&!grupoDe().some(g=>g.nome===d.emitida_por)?`<option selected value="${esc(d.emitida_por)}">${esc(d.emitida_por)}</option>`:""}</select><span class="hint">Mesmo dono: para o controle, contam como uma só.</span></div>`:""}
        <div class="lider" role="radiogroup" aria-label="Corretora líder">
          <label class="seg${d.lider!=="parceira"?" on":""}"><input type="radio" name="lider" value="emissora"${d.lider!=="parceira"?" checked":""}><b>${esc(nossoCurto(d))} é a líder</b><span>A ${esc(nossoCurto(d))} recebe da seguradora e <b>paga</b> a parceira</span></label>
          <label class="seg${d.lider==="parceira"?" on":""}"><input type="radio" name="lider" value="parceira"${d.lider==="parceira"?" checked":""}><b>A parceira é a líder</b><span>A parceira recebe da seguradora e <b>paga</b> a ${esc(nossoCurto(d))}</span></label>
        </div>
        <fieldset>
          <div class="f"><label for="corretor">Corretora parceira</label><input id="corretor" list="dlCor" value="${esc(d.corretor)}" required placeholder="Digite para buscar na lista"><datalist id="dlCor">${S.corretoras.map(x=>`<option value="${esc(x.nome)}">${x.cnpj?esc(fmtCnpj(x.cnpj)):""}</option>`).join("")}${corretores.filter(n=>!corretoraPorNome(n)).map(n=>`<option value="${esc(n)}">`).join("")}</datalist></div>
          <div class="f"><label for="corretor_cnpj">CNPJ da parceira</label><input id="corretor_cnpj" class="num" inputmode="numeric" value="${esc(d.corretor_cnpj?fmtCnpj(d.corretor_cnpj):"")}" placeholder="00.000.000/0000-00"><span class="hint" id="cnpjHint"></span></div>
          <div class="f"><label for="premio">Prêmio líquido (R$)</label><input id="premio" class="num" inputmode="decimal" value="${esc(moneyInput(d.premio))}" placeholder="0,00"><span class="hint">Sempre o líquido, sem IOF e custo de apólice. A IA lê da apólice.</span></div>
          <div class="f"><label for="comissao_pct">Comissão sobre o prêmio (%)</label><input id="comissao_pct" class="num" inputmode="decimal" value="${esc(numInput(d.comissao_pct))}" placeholder="ex.: 20"><span class="hint" id="comHint"></span></div>
          <div class="f"><label>Divisão da comissão</label><div class="split"><span><input id="parte_cs" class="num" inputmode="decimal" placeholder="%" required value="${esc(numInput(d.repasse_pct==null?"":100-d.repasse_pct))}" aria-label="Parte da ${esc(nossoCurto(d))} (%)"><small>${esc(nossoCurto(d))} %</small></span><span><input id="repasse_pct" class="num" inputmode="decimal" placeholder="%" required value="${esc(numInput(d.repasse_pct))}" aria-label="Parte da parceira (%)"><small>parceira %</small></span></div>
</div>
          <div class="conta-box full"><div class="cb-t">Como fica a conta</div><div id="calcBox"></div>
            <div class="ajuste" id="ajusteBox"${d.valor_manual||e.ajuste?"":" hidden"}><div class="f"><label for="valor_repasse">${d.lider==="parceira"?`Valor a receber da parceira (R$)`:`Valor a pagar à parceira (R$)`}</label><input id="valor_repasse" class="num" inputmode="decimal" value="${esc(moneyInput(d.valor_repasse))}"><span class="hint" id="valHint">${d.valor_manual?"Ajustado à mão.":"Digite o valor combinado, se for diferente do cálculo."}</span></div></div></div>
          <div class="parc-head full"><div class="f"><label for="parcelas_qtd">Parcelas</label><input id="parcelas_qtd" class="num" type="number" min="1" max="60" value="${d.parcelas_qtd||1}"></div>
            <div class="f"><label for="venc1">${(d.parcelas_qtd||1)>1?"Vencimento da 1ª parcela (boleto)":"Vencimento do boleto"}</label><input id="venc1" type="date" value="${esc(d.parcelas[0]&&d.parcelas[0].vencimento?String(d.parcelas[0].vencimento).slice(0,10):"")}" required></div>
            <p class="hint">A IA lê os vencimentos da apólice ou do boleto. As cobranças saem 1 e 5 dias depois de cada vencimento.</p></div>
          <div class="full" id="parcBox"></div>
        </fieldset></section>

      <details class="step" id="detAp"${openAp?" open":""}><summary><span class="step-n">3</span><div><b>Dados da apólice ${temIA?'<span class="tag">lidos pela IA</span>':""}</b><span class="res-fechado">${d.apolice||d.seguradora||d.tomador?esc([d.apolice?"Apólice "+d.apolice:"",d.seguradora,d.tomador?tituloCaso(d.tomador):""].filter(Boolean).join(" · ")):"Envie a apólice no passo 1 ou toque aqui para preencher à mão."}</span><span class="res-aberto">Confira ou corrija o que ${temIA?"a IA leu":"foi preenchido"}.</span>${faltam.length&&res.length?`<em class="warn-txt res-falta">Falta ${faltam.join(" e ")}</em>`:""}</div><i class="chev" aria-hidden="true">▾</i></summary>
        <fieldset>
          <div class="f"><label for="apolice">Nº da apólice (seguradora)</label><input id="apolice" class="num" value="${esc(d.apolice)}" required></div>
          <div class="f"><label for="numero_susep">Nº da apólice (SUSEP)</label><input id="numero_susep" class="num" value="${esc(d.numero_susep||"")}"></div>
          <div class="f"><label for="data_emissao">Emissão</label><input id="data_emissao" type="date" value="${esc(d.data_emissao||"")}"></div>
          <div class="f"><label for="seguradora">Seguradora</label><input id="seguradora" list="dlSeg" value="${esc(d.seguradora)}"><datalist id="dlSeg">${segNomes().map(n=>{const r=segReg(n);return `<option value="${esc(n)}">${r&&r.razao_social?esc(r.razao_social):""}</option>`}).join("")}</datalist><span class="hint" id="segHint"></span></div>
          <div class="f"><label for="modalidade">Modalidade</label><select id="modalidade"><option value="">Selecione…</option>${MODALIDADES.map(m=>`<option${d.modalidade===m?" selected":""}>${m}</option>`).join("")}</select></div>
          <div class="f"><label for="tomador">Tomador</label><input id="tomador" list="dlTom" value="${esc(d.tomador)}"><datalist id="dlTom">${[...new Map(S.docs.filter(x=>x.tomador).map(x=>[key(x.tomador),x.tomador])).values()].sort().map(n=>`<option value="${esc(n)}">`).join("")}</datalist></div>
          <div class="f"><label for="tomador_cnpj">CNPJ do tomador</label><input id="tomador_cnpj" class="num" inputmode="numeric" value="${esc(d.tomador_cnpj?fmtCnpj(d.tomador_cnpj):"")}" placeholder="00.000.000/0000-00"><span class="hint" id="tomHint"></span></div>
        </fieldset></details>

      <details class="step" id="detPg"${openPg?" open":""}><summary><span class="step-n sm">+</span><div><b>Observações</b><span>${[d.observacao?"tem observação":"sem observação",d.corretor_susep?`SUSEP da parceira ${esc(d.corretor_susep)}`:""].filter(Boolean).join(" · ")}</span></div><i class="chev" aria-hidden="true">▾</i></summary>
        <fieldset>
          <div class="f"><label for="corretor_susep">Registro SUSEP da parceira</label><input id="corretor_susep" class="num" value="${esc(d.corretor_susep||"")}"></div>
          <div class="f full"><label for="observacao">Observação</label><textarea id="observacao" placeholder="Ex.: parceira pediu para pagar junto com a próxima; endosso pendente…">${esc(d.observacao)}</textarea></div>
        </fieldset></details>
      ${e.id?`<p class="meta">Lançado por ${esc(nomeDe(d.criado_por)||"—")} em ${esc(dtBR(d.criado_em))}${d.atualizado_por?` · alterado por ${esc(nomeDe(d.atualizado_por))} em ${esc(dtBR(d.atualizado_em))}`:""}${d.pago&&d.pago_por?` · pagamento registrado por ${esc(nomeDe(d.pago_por))}`:""}</p>`:""}
    </form>
    <div class="p-foot">${e.confirmDel
      ?`<span class="meta" style="color:var(--danger);font-weight:600">Excluir esta apólice e os documentos dela?</span><span class="spacer"></span><button class="btn small ghost" data-action="cancelDel">Cancelar</button><button class="btn small danger" data-action="doDel">Excluir</button>`
      :`${e.id?`<button class="btn small danger" data-action="askDel">Excluir</button>`:""}<span class="spacer"></span><button class="btn" data-action="close">Cancelar</button><button class="btn primary" data-action="save" id="saveBtn">Salvar</button>`}</div>
  </aside>`;
  updateCalc();renderParcelas();renderAnexos();cnpjHint();tomHint();segHint();renderAiBox();
  if(!e.id&&(d.comissao_pct==null||e.comAuto))aplicarComissaoPadrao(true);else comHint();
  $("detAp").addEventListener("toggle",ev=>{e.openAp=ev.target.open});$("detPg").addEventListener("toggle",ev=>{e.openPg=ev.target.open});
  if(e.focusNext){const f=$(e.focusNext);e.focusNext=null;if(f)f.focus()}
}
function readForm(){
  const g=id=>$(id);const d=S.editing.data;
  d.apolice=g("apolice").value.trim();d.numero_susep=g("numero_susep").value.trim();d.data_emissao=g("data_emissao").value;d.seguradora=g("seguradora").value.trim();
  d.modalidade=g("modalidade").value;d.tomador=g("tomador").value.trim();d.tomador_cnpj=normCnpj(g("tomador_cnpj").value);
  const L=document.querySelector('input[name="lider"]:checked');d.lider=L?L.value:"emissora";
  const EP=g("emitida_por");if(EP)d.emitida_por=EP.value;
  d.corretor=g("corretor").value.trim();d.corretor_cnpj=normCnpj(g("corretor_cnpj").value);d.corretor_susep=soDigitos(g("corretor_susep").value);
  d.premio=numOrNull(g("premio").value);d.comissao_pct=numOrNull(g("comissao_pct").value);d.repasse_pct=numOrNull(g("repasse_pct").value);d.nivel=nivelDe(d.repasse_pct);
  d.observacao=g("observacao").value.trim();
  const v=numOrNull(g("valor_repasse").value);d.valor_repasse=v==null?0:v;
  d.parcelas_qtd=parseInt(g("parcelas_qtd").value,10)||1;
  document.querySelectorAll("[data-pv]").forEach(el=>{const p=d.parcelas[+el.dataset.pv];if(p)p.vencimento=el.value||null});
  document.querySelectorAll("[data-pp]").forEach(el=>{const p=d.parcelas[+el.dataset.pp];if(p){p.pago=el.checked;if(p.pago&&!p.data_pagamento)p.data_pagamento=isoDay(today);if(!p.pago){p.data_pagamento=null;p.pago_por=null}}});
  document.querySelectorAll("[data-pd]").forEach(el=>{const p=d.parcelas[+el.dataset.pd];if(p&&p.pago&&el.value)p.data_pagamento=el.value});
  const v1=(g("venc1")||{}).value;if(v1&&d.parcelas[0]&&!d.parcelas[0].pago&&v1!==String(d.parcelas[0].vencimento||"").slice(0,10)){
    const antigo=d.parcelas[0].vencimento;d.parcelas[0].vencimento=v1;
    d.parcelas.forEach((p,i)=>{if(i&&!p.pago&&(!p.vencimento||!antigo))p.vencimento=addMeses(v1,i)})}
  d.parcelas.forEach(p=>{if(p.vencimento)p.competencia=String(p.vencimento).slice(0,7)});
  d.competencia=d.parcelas[0]?d.parcelas[0].competencia:S.month;
  return d;
}
function mesesEntre(a,b){const [y1,m1]=a.split("-").map(Number),[y2,m2]=b.split("-").map(Number);return (y2-y1)*12+(m2-m1)}
function renderParcelas(){
  const box=$("parcBox");const e=S.editing;if(!box||!e)return;const d=e.data;const rec=d.lider==="parceira";
  const tot=d.parcelas.reduce((a,p)=>a+(Number(p.valor)||0),0);
  box.innerHTML=`<div class="tablebox"><table class="ptable"><thead><tr><th>Nº</th><th>Vencimento (boleto)</th><th class="r">Parcela do prêmio</th><th class="r">${rec?"A receber":"A pagar"}</th><th>${rec?"Recebido":"Pago"}</th></tr></thead><tbody>
    ${d.parcelas.map((p,i)=>`<tr><td class="num">${p.numero}/${d.parcelas.length}</td><td><input type="date" data-pv="${i}" value="${esc(p.vencimento?String(p.vencimento).slice(0,10):"")}" aria-label="Vencimento da parcela ${p.numero}"></td><td class="r num">${p.premio_parcela!=null?money(p.premio_parcela):'<span class="meta">—</span>'}</td>
      <td class="r num"><b>${money(p.valor)}</b></td>
      <td class="c pg"><input type="checkbox" data-pp="${i}"${p.pago?" checked":""} aria-label="Parcela ${p.numero} ${rec?"recebida":"paga"}">${p.pago?`<input type="date" data-pd="${i}" value="${esc(String(p.data_pagamento||isoDay(today)).slice(0,10))}" aria-label="Data do ${rec?"recebimento":"pagamento"} da parcela ${p.numero}">`:""}</td></tr>`).join("")}</tbody>
    <tfoot><tr><td colspan="3">Total</td><td class="r num">${money(tot)}</td><td></td></tr></tfoot></table></div>`;
}
function updateCalc(){
  const e=S.editing;if(!e)return;const d=e.data;const box=$("calcBox");if(!box)return;
  const premio=Number(d.premio)||0,pc=Number(d.comissao_pct)||0,temDiv=d.repasse_pct!=null&&!isNaN(d.repasse_pct),pp=Number(d.repasse_pct)||0,pcs=Math.round((100-pp)*100)/100;
  const com=Math.round(premio*pc)/100;const parteP=Math.round(com*pp)/100,parteC=Math.round((com-parteP)*100)/100;
  const cs=tituloCaso(nossoCurto(d)),pa=d.corretor?tituloCaso(curtoDe(d.corretor)):"Parceira";
  const rec=d.lider==="parceira";const fluxo=d.valor_manual?Number(d.valor_repasse)||0:(rec?parteC:parteP);
  const L=(a,b,c)=>`<div class="rc-l${c?" "+c:""}"><span>${a}</span><b>${b}</b></div>`;
  if(!premio){box.innerHTML=`<p class="meta">A conta aparece quando houver o prêmio líquido e a comissão.</p>`;return}
  let h=L("Prêmio líquido",money(premio))+L(`Comissão de ${pctFmt(pc)}`,money(com),"tot");
  if(!temDiv){box.innerHTML=h+`<p class="meta rc-pede">Informe a divisão acima para ver quanto fica com cada uma.</p>`;return}
  const ps=(d.parcelas||[]).map(p=>Number(p.valor)||0);const n=ps.length||1;const iguais=n>1&&ps.every(v=>Math.abs(v-ps[0])<0.005);
  h+=`<div class="rc-bar" aria-hidden="true"><i class="sb-cs" style="width:${pcs}%"></i><i class="sb-pa" style="width:${pp}%"></i></div>`
    +L(`<i class="dot cs"></i>${esc(cs)} · ${pctFmt(pcs)}`,money(parteC))+L(`<i class="dot pa"></i>${esc(pa)} · ${pctFmt(pp)}`,money(parteP));
  h+=`<div class="rc-res ${rec?"in":"out"}"><div><span>${rec?`${esc(pa)} paga à ${esc(cs)}`:`${esc(cs)} paga à ${esc(pa)}`}</span><small>${n>1?`em ${n} parcelas${iguais?` de ${money(ps[0])}`:""}`:"parcela única"}${d.valor_manual?" · valor ajustado à mão":""}</small></div><b>${money(fluxo)}</b></div>`
    +`<div class="rc-act">${d.valor_manual?`<button type="button" class="linkbtn" data-action="ajusteOff">Voltar ao valor calculado</button>`:`<button type="button" class="linkbtn" data-action="ajusteOn">Ajustar o valor à mão</button>`}</div>`;
  box.innerHTML=h;
}

// ---------------- documentos ----------------
function renderAnexos(){
  const box=$("anexosBox");if(!box||!S.editing)return;const e=S.editing;const list=e.data.anexos;
  box.innerHTML=list.map((a,i)=>{const img=/^image\//.test(a.content_type||"");
    return `<div class="file"><div class="thumb" data-thumb="${i}">${img?"":esc((extOf(a.nome)||"doc").toUpperCase())}</div>
      <div style="min-width:0"><div class="nm" title="${esc(a.nome)}">${esc(a.nome)}</div>
        <div class="info"><select data-cat="${i}" aria-label="Tipo do documento">${CATS.map(c=>`<option${c===a.categoria?" selected":""}>${c}</option>`).join("")}</select><span>${sizeFmt(a.tamanho)}</span>${a.enviado_por?`<span>· ${esc(nomeDe(a.enviado_por).split(" ")[0])}</span>`:""}</div></div>
      <div class="acts">${S.iaOk!==false&&/^(application\/pdf|image\/)/.test(a.content_type||"")?`<button type="button" class="btn small ai-btn" data-action="aiRead" data-i="${i}"${e.aiBusy!=null?" disabled":""}>${e.aiBusy===i?"Lendo…":"Ler com IA"}</button>`:""}<button type="button" class="btn small ghost" data-action="openFile" data-i="${i}">Abrir</button><button type="button" class="btn small ghost" data-action="dl" data-i="${i}">Baixar</button><button type="button" class="iconbtn" data-action="rmFile" data-i="${i}" aria-label="Remover ${esc(a.nome)}">✕</button></div></div>`}).join("")
    +e.uploading.map(u=>`<div class="file up"><div class="thumb">…</div><div style="min-width:0"><div class="nm">${esc(u)}</div><div class="info">Enviando…</div></div><div></div></div>`).join("")
    +(list.length||e.uploading.length?`<div class="drop compact" id="dropZone"><span>Arraste mais documentos (boleto, endosso…) ou</span><button type="button" class="btn small" data-action="pick">Adicionar</button>`
     :`<div class="drop" id="dropZone"><span>Arraste a apólice, o boleto ou outros documentos para cá${S.iaOk!==false?". A IA lê a apólice e preenche o formulário.":""}</span>
      <button type="button" class="btn small" data-action="pick">Escolher arquivos</button><small>PDF ou imagem (JPG, PNG), até 20 MB cada</small>`)+`
      <input type="file" id="fileInput" multiple accept=".pdf,.png,.jpg,.jpeg,.webp,.gif,application/pdf,image/*" hidden></div>`;
  list.forEach(async(a,i)=>{if(!/^image\//.test(a.content_type||""))return;
    const {data}=await sb.storage.from(BUCKET).createSignedUrl(a.path,3600);
    const t=box.querySelector(`[data-thumb="${i}"]`);if(t&&data&&S.editing===e)t.innerHTML=`<img src="${esc(data.signedUrl)}" alt="">`});
}
async function uploadFiles(fileList){
  const e=S.editing;if(!e)return;
  for(const f of Array.from(fileList)){
    const type=TYPE_BY_EXT[extOf(f.name)]||(Object.values(TYPE_BY_EXT).includes(f.type)?f.type:"");
    if(!type){toast(`"${f.name}": envie em PDF ou imagem. Word e Excel podem ser salvos como PDF.`);continue}
    if(f.size>20*1048576){toast(`"${f.name}" passa de 20 MB.`);continue}
    e.uploading.push(f.name);renderAnexos();
    const path=`${S.month}/${uuid()}-${safeName(f.name)}`;
    try{
      const {error}=await sb.storage.from(BUCKET).upload(path,f,{contentType:type,upsert:false});
      if(error)throw error;
      if(S.editing!==e){sb.storage.from(BUCKET).remove([path]).catch(()=>{});return}
      const a={path,nome:f.name,categoria:guessCat(f.name),content_type:type,tamanho:f.size,enviado_por:S.me.email,novo:true};
      e.added.push(a);e.data.anexos.push(a);
      if(S.iaOk!==false&&!e.id&&!e.aiAuto&&e.aiBusy==null&&!($("apolice")&&$("apolice").value.trim())){e.aiAuto=true;setTimeout(()=>{if(S.editing===e)aiLer(e.data.anexos.indexOf(a))},0)}
    }catch(err){toast(/size|large/i.test(err.message||"")?`"${f.name}" é grande demais.`:`Não foi possível enviar "${f.name}".`)}
    finally{e.uploading.splice(e.uploading.indexOf(f.name),1);renderAnexos()}
  }
}
async function openFile(a){
  const w=window.open("","_blank");
  const {data,error}=await sb.storage.from(BUCKET).createSignedUrl(a.path,600);
  if(error||!data){if(w)w.close();toast("Não foi possível abrir este arquivo.");return}
  if(w)w.location=data.signedUrl;else location.href=data.signedUrl;
}
async function downloadFile(a){
  const {data,error}=await sb.storage.from(BUCKET).createSignedUrl(a.path,120,{download:a.nome});
  if(error||!data){toast("Não foi possível baixar este arquivo.");return}
  const l=document.createElement("a");l.href=data.signedUrl;l.download=a.nome;document.body.appendChild(l);l.click();l.remove();
}

// ---------------- leitura de documentos por IA ----------------
const AI_CAMPOS={emitida_por:"Corretora do grupo na apólice",apolice:"Nº da apólice (seguradora)",numero_susep:"Nº da apólice (SUSEP)",corretor:"Corretora parceira",corretor_cnpj:"CNPJ da parceira",lider:"Líder",parcelas_qtd:"Parcelas",data_emissao:"Emissão",seguradora:"Seguradora",modalidade:"Modalidade",tomador:"Tomador",tomador_cnpj:"CNPJ do tomador",premio:"Prêmio líquido",comissao_pct:"Comissão (%)"};
const AI_CAT={apolice:"Apólice",endosso:"Endosso",boleto:"Boleto",comprovante:"Comprovante de pagamento",proposta:"Proposta",nota_fiscal:"Nota fiscal",outro:"Outro"};
async function aiLer(i){
  const e=S.editing;if(!e)return;const a=e.data.anexos[i];if(!a)return;
  readForm();e.aiBusy=i;renderAnexos();
  let r;
  try{
    const {data,error}=await sb.functions.invoke("ler-documento",{body:{path:a.path}});
    if(error){let msg="";try{const j=await error.context.json();msg=j.erro||""}catch(_){}
      if(!msg||/not found|404/i.test(String(error.message))){S.iaOk=false;msg="A leitura por IA ainda não foi configurada (README, passo 7)."}
      else if(/não foi configurada/.test(msg))S.iaOk=false;
      throw new Error(msg)}
    if(data&&data.erro)throw new Error(data.erro);
    r=data.dados;
  }catch(err){if(S.editing===e){e.aiBusy=null;renderAnexos()}toast(err.message||"A IA não conseguiu ler este arquivo.");return}
  if(S.editing!==e)return;
  e.aiBusy=null;aplicarIA(r,a);
}
function dupApolice(d,id){const k=key(d.apolice),ks=soDigitos(d.numero_susep);if(!k&&!ks)return null;
  return S.apolices.find(x=>x.id!==id&&((k&&key(x.apolice)===k)||(ks&&ks.length>8&&soDigitos(x.numero_susep)===ks)))||null}
function aplicarIA(r,a){
  const e=S.editing;readForm();const D=e.data;const filled=[],conflitos=[];
  const vazio=v=>v==null||v===""||(typeof v==="number"&&isNaN(v));
  const set=(f,v,cmp)=>{if(vazio(v))return;const atual=D[f];
    if(vazio(atual)||(f==="data_emissao"&&!e.id&&atual===isoDay(today)&&!e.aiTouchedDate)){D[f]=v;filled.push(f);if(f==="data_emissao")e.aiTouchedDate=true;return}
    const igual=cmp?cmp(atual,v):String(atual).trim().toLowerCase()===String(v).trim().toLowerCase();if(!igual)conflitos.push({f,v,atual})};
  set("apolice",r.numero_apolice&&String(r.numero_apolice).trim());
  if(r.numero_apolice_susep&&String(r.numero_apolice_susep).trim()!==String(r.numero_apolice||"").trim())set("numero_susep",String(r.numero_apolice_susep).trim());
  if(r.data_emissao&&/^\d{4}-\d{2}-\d{2}$/.test(r.data_emissao))set("data_emissao",r.data_emissao);
  // seguradora: pelo CNPJ ou pela razão social
  if(r.seguradora_cnpj||r.seguradora_razao_social){const cn=normCnpj(r.seguradora_cnpj||"");
    const reg=(cn&&S.seguradoras.find(x=>x.cnpj===cn))||S.seguradoras.find(x=>x.razao_social&&key(x.razao_social)===key(r.seguradora_razao_social||""))||S.seguradoras.find(x=>key(r.seguradora_razao_social||"").includes(key(x.nome)));
    e.aiSeg={razao:r.seguradora_razao_social||"",cnpj:cn&&cnpjValido(cn)?cn:"",reg:reg||null};
    set("seguradora",reg?reg.nome:(segCurto(r.seguradora_razao_social)||r.seguradora_razao_social),(x,y)=>key(x)===key(y)||(segReg(x)&&segReg(x)===segReg(y)))}
  if(r.modalidade&&MODALIDADES.includes(r.modalidade))set("modalidade",r.modalidade);
  set("tomador",r.tomador_nome&&String(r.tomador_nome).trim(),(x,y)=>key(x)===key(y));
  if(r.tomador_cnpj&&cnpjValido(r.tomador_cnpj))set("tomador_cnpj",normCnpj(r.tomador_cnpj),(x,y)=>normCnpj(x)===normCnpj(y));
  const premio=typeof r.premio_liquido==="number"?r.premio_liquido:null;
  set("premio",premio,(x,y)=>Math.abs(Number(x)-Number(y))<0.01);
  let pct=typeof r.comissao_percentual==="number"?r.comissao_percentual:null;
  if(pct==null&&typeof r.comissao_valor==="number"&&(premio||D.premio))pct=Math.round(r.comissao_valor/(premio||D.premio)*10000)/100;
  if(pct!=null&&e.comAuto){D.comissao_pct=pct;filled.push("comissao_pct");e.comAuto=false}else set("comissao_pct",pct,(x,y)=>Math.abs(Number(x)-Number(y))<0.01);
  // corretoras: quem é a emissora, quem é a parceira e quem lidera
  const avisos=[];
  const cors=Array.isArray(r.corretoras)?r.corretoras.filter(c=>c&&c.nome):[];
  if(cors.length){const nossas=cors.filter(c=>membroGrupo(c));const outras=cors.filter(c=>!membroGrupo(c));
    const minha=nossas.find(c=>c.lider===true)||nossas[0];const mg=minha&&membroGrupo(minha);
    if(mg){const ep=mg.principal?"":mg.nome;if((D.emitida_por||"")!==ep){D.emitida_por=ep;if(ep)filled.push("emitida_por")}}
    // ninguém do grupo na apólice e só uma corretora: ela é a parceira líder (recebe a comissão e repassa a nossa parte)
    const soParceira=!minha&&outras.length===1&&outras[0].lider!==false;
    if(soParceira)avisos.push(`A ${emisCurto()} não aparece na apólice; a única corretora é ${outras[0].nome}. Considerei que ela é a líder e paga a parte da ${emisCurto()}. Confira.`);
    else if(!minha)avisos.push(`Não encontrei a ${EMIS.nome}${grupoDe().length?" nem as corretoras do grupo":""} entre as corretoras do documento (${cors.map(c=>c.nome).join(", ")}). Confira a parceira.`);
    if(minha&&!outras.length){
      // só nós na apólice: somos a líder; a parceira não consta no documento
      if(D.lider!=="emissora"&&!(e.id&&D.parcelas.some(p=>p.pagoOrig))){D.lider="emissora";filled.push("lider")}
      avisos.push(`A apólice só traz ${mg.principal?"a "+emisCurto():`a ${curtoDe(mg.nome)}, do mesmo grupo da ${emisCurto()}`}. Considerei que ${mg.principal?"ela":"o grupo"} é a líder; informe a corretora parceira e a divisão.`)}
    const parc=outras.find(c=>c.lider===true)||outras[0];
    if(outras.length>1)avisos.push(`O documento tem ${outras.length} corretoras parceiras (${outras.map(c=>c.nome).join(", ")}). Preenchi ${parc.nome}; ajuste se for outra.`);
    if(parc){const su=susepN(parc.susep||"");const cn=normCnpj(parc.cnpj||"");
      const ant=su&&S.apolices.find(x=>susepN(x.corretor_susep||"")===su);
      const reg=(cn&&corretoraPorCnpj(cn))||(su&&S.corretoras.find(x=>susepN(x.susep||"")===su))||corretoraPorNome(parc.nome)||corretoraPorRazao(parc.nome)||(ant?{nome:ant.corretor,cnpj:ant.corretor_cnpj||""}:null);
      set("corretor",reg?reg.nome:String(parc.nome).trim(),(x,y)=>key(x)===key(y));
      const cnpjF=cn&&cnpjValido(cn)?cn:(reg&&reg.cnpj)||"";if(cnpjF)set("corretor_cnpj",cnpjF,(x,y)=>normCnpj(x)===normCnpj(y));
      if(su&&!D.corretor_susep)D.corretor_susep=su;
      const lid=minha&&minha.lider===true?"emissora":soParceira||parc.lider===true||(minha&&minha.lider===false)?"parceira":null;
      if(lid&&lid!==D.lider){if(e.id&&D.parcelas.some(p=>p.pagoOrig))conflitos.push({f:"lider",v:lid,atual:D.lider});else{D.lider=lid;filled.push("lider")}}
      else if(!lid)avisos.push("O documento não deixa claro qual corretora é a líder. Confira quem paga quem.")}}
  // parcelas do prêmio
  const ps=(Array.isArray(r.parcelas)?r.parcelas:[]).filter(p=>p&&Number(p.numero)>0).sort((a,b)=>a.numero-b.numero);
  if(ps.length&&!D.parcelas.some(p=>p.pago||p.pagoOrig)){
    D.parcelas_qtd=ps.length;
    D.parcelas=ps.map((p,i)=>{const ven=p.vencimento&&/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(p.vencimento)?p.vencimento:null;
      const ex=D.parcelas.find(x=>x.numero===i+1)||{};
      return {...ex,numero:i+1,vencimento:ven,premio_parcela:typeof p.valor==="number"?p.valor:null,valor:0,competencia:ven?ven.slice(0,7):shiftYM((D.parcelas[0]&&D.parcelas[0].competencia)||S.month,i),pago:false}});
    filled.push("parcelas_qtd")}
  else if(ps.length&&ps.length!==D.parcelas.length)avisos.push(`O documento mostra ${ps.length} parcela(s), mas este lançamento já tem parcelas pagas. Ajuste à mão se precisar.`);
  if(!D.valor_manual)D.valor_repasse=calcRepasse(D.premio,D.comissao_pct,D.repasse_pct,D.lider);
  recalcParcelas(D);
  // documento
  if(r.tipo_documento&&AI_CAT[r.tipo_documento]){a.categoria=AI_CAT[r.tipo_documento];a.dirty=true}
  if(r.tipo_documento==="boleto"&&typeof r.boleto_valor==="number"&&!(ps.length>1)){const linha=`Boleto: ${money(r.boleto_valor)}${r.boleto_vencimento?`, vencimento ${dateBR(r.boleto_vencimento)}`:""}.`;
    if(!String(D.observacao||"").includes(linha))D.observacao=(D.observacao?D.observacao+"\n":"")+linha}
  if(!cors.length){const corrCn=normCnpj(r.corretora_cnpj||"");const emCn=normCnpj(EMIS.cnpj||"");
    if(corrCn&&emCn&&corrCn!==emCn)avisos.push(`A corretora no documento é ${r.corretora_razao_social||"outra"} (${fmtCnpj(corrCn)}), diferente da emissora (${EMIS.nome}).`)}
  {const dup=dupApolice(D,e.id);if(dup)avisos.push(`A apólice ${D.apolice} já foi lançada (${dup.corretor||"sem corretora"}, ${dateBR(dup.data_emissao)}). Confira se não é repetida.`)}
  if(r.premio_total&&premio==null)avisos.push(`O documento mostra só o prêmio total (${money(r.premio_total)}), que inclui IOF e custos. Informe o prêmio líquido na parte 2: a comissão é sempre sobre o líquido.`);
  else if(premio!=null&&r.premio_total&&Math.abs(r.premio_total-premio)>0.009)avisos.push(`Prêmio líquido ${money(premio)} (o total com IOF e custos é ${money(r.premio_total)}). A comissão usa o líquido.`);
  e.ai={arquivo:a.nome,tipo:r.tipo_documento,filled,conflitos,incertos:(r.campos_incertos||[]).filter(Boolean),avisos,obs:r.observacao||"",vig:[r.vigencia_inicio,r.vigencia_fim],is:r.importancia_segurada,segurado:r.segurado_nome};
  e.aiFilled=new Set(filled);
  // a divisão nunca vem na apólice: o cursor já vai para ela
  if(D.repasse_pct==null)e.focusNext="parte_cs";else if(!D.corretor)e.focusNext="corretor";else if(D.comissao_pct==null)e.focusNext="comissao_pct";
  renderPanel();
  toast(filled.length?`IA preencheu ${filled.length} campo${filled.length>1?"s":""}. Confira os destacados.`:conflitos.length?"A IA encontrou valores diferentes dos digitados. Veja o quadro no topo.":"A IA leu o documento, mas não havia campos vazios para preencher.");
}
function renderAiBox(){
  const box=$("aiBox");const e=S.editing;if(!box||!e)return;
  if(e.aiFilled)e.aiFilled.forEach(f=>{const el=$(f);if(el)el.classList.add("ai-filled")});
  const A=e.ai;if(!A){box.innerHTML="";return}
  const D=e.data;const nome=f=>AI_CAMPOS[f]||f;
  const fmt=(f,v)=>f==="lider"?(v==="parceira"?"parceira é a líder":emisCurto()+" é a líder"):f==="premio"?money(v):f==="comissao_pct"?pctFmt(v):f==="data_emissao"?dateBR(v):f==="tomador_cnpj"?fmtCnpj(v):String(v);
  const inc=new Set(A.incertos.map(x=>({numero_apolice:"apolice",numero_apolice_susep:"numero_susep",seguradora_razao_social:"seguradora",seguradora_cnpj:"seguradora",tomador_nome:"tomador",tomador_cnpj:"tomador",premio_liquido:"premio",comissao_percentual:"comissao_pct",parcelas:"parcelas_qtd",corretoras:"corretor"}[x]||x)));
  const ps=D.parcelas||[];const p1=ps[0]&&ps[0].vencimento;
  const parcTxt=ps.length>1?`${ps.length} parcelas${p1?` · 1ª em ${dateBR(p1)}`:""}`:p1?`à vista · vence ${dateBR(p1)}`:"";
  // o que foi lido, em linhas curtas (rótulo → valor)
  const linhas=[["apolice","Apólice",D.apolice],["numero_susep","Apólice SUSEP",D.numero_susep],["seguradora","Seguradora",D.seguradora],
    ["tomador","Tomador",D.tomador?D.tomador+(D.tomador_cnpj?" · "+fmtCnpj(D.tomador_cnpj):""):""],["premio","Prêmio líquido",D.premio!=null?money(D.premio):""],
    ["comissao_pct","Comissão",D.comissao_pct!=null?pctFmt(D.comissao_pct):""],["parcelas_qtd","Parcelas",parcTxt],
    ["corretor","Parceira",D.corretor?D.corretor+(D.corretor_cnpj?" · "+fmtCnpj(D.corretor_cnpj):""):""],
    ["lider","Quem recebe da seguradora",D.lider==="parceira"?(D.corretor?tituloCaso(curtoDe(D.corretor)):"a parceira"):tituloCaso(nossoCurto(D))]].filter(x=>x[2]);
  // o que ainda falta para salvar certo
  const faltam=[];if(!D.corretor)faltam.push("Corretora parceira");else if(!normCnpj(D.corretor_cnpj||""))faltam.push("CNPJ da parceira");
  if(D.premio==null)faltam.push("Prêmio líquido");if(D.comissao_pct==null)faltam.push("Comissão (%)");if(!p1)faltam.push("Vencimento da 1ª parcela");
  const extra=[A.segurado?`Segurado: ${String(A.segurado).replace(/\.$/,"")}`:"",A.vig[0]||A.vig[1]?`Vigência: ${dateBR(A.vig[0])} a ${dateBR(A.vig[1])}`:"",A.is?`Importância segurada: ${money(A.is)}`:"",A.obs||""].filter(Boolean);
  box.innerHTML=`<div class="ai-box">
    <div class="ai-head"><span class="ai-ok" aria-hidden="true">✓</span><b>A IA leu ${A.tipo&&A.tipo!=="apolice"?"o "+esc((AI_CAT[A.tipo]||"documento").toLowerCase()):"a apólice"}</b><span class="spacer"></span><button type="button" class="iconbtn" data-action="aiClose" aria-label="Fechar quadro da IA">✕</button></div>
    ${linhas.length?`<dl class="ai-grid">${linhas.map(([f,l,v])=>`<div${inc.has(f)?' class="inc"':""}><dt>${esc(l)}</dt><dd>${esc(v)}${inc.has(f)?'<span class="ai-tag">conferir</span>':""}</dd></div>`).join("")}</dl>`:`<p class="meta">Nenhum dado da apólice foi encontrado neste arquivo.</p>`}
    ${faltam.length?`<div class="ai-falta"><span>Falta você preencher</span>${faltam.map(x=>`<em>${esc(x)}</em>`).join("")}</div>`:`<p class="ai-pronto">Tudo preenchido. Confira e salve.</p>`}
    ${A.conflitos.length?`<div class="ai-conf"><span class="meta">O documento diz diferente do formulário:</span>${A.conflitos.map((c,i)=>`<div class="ai-c"><span><b>${esc(nome(c.f))}:</b> documento <b>${esc(fmt(c.f,c.v))}</b> · formulário ${esc(fmt(c.f,c.atual))}</span><button type="button" class="btn small" data-action="aiUse" data-i="${i}">Usar o do documento</button></div>`).join("")}</div>`:""}
    ${A.avisos.length?`<ul class="ai-avisos">${A.avisos.map(t=>`<li>${esc(t)}</li>`).join("")}</ul>`:""}
    ${extra.length?`<details class="ai-mais"><summary>Mais informações do documento</summary>${extra.map(t=>`<p>${esc(t)}</p>`).join("")}</details>`:""}
  </div>`;
}

// ---------------- gravações ----------------
async function save(){
  const e=S.editing;if(!e||e.saving)return;const d=readForm();
  if(!d.corretor){toast("Informe a corretora parceira.");$("corretor").focus();return}
  {const mg=membroGrupo({nome:d.corretor,cnpj:d.corretor_cnpj,susep:d.corretor_susep});if(mg){toast(`${curtoDe(mg.nome)} é do mesmo grupo da ${emisCurto()}. Em "Corretora parceira" vai a corretora de fora que divide a comissão.`);$("corretor").focus();return}}
  if(!d.apolice){e.openAp=true;$("detAp").open=true;$("apolice").focus();toast("Falta o nº da apólice: envie a apólice para a IA ler ou preencha em Dados da apólice.");return}
  if(!d.parcelas[0]||!d.parcelas[0].vencimento){const v=$("venc1");if(v)v.focus();toast("Informe o vencimento do boleto (1ª parcela). É dele que saem as cobranças.");return}
  if(d.tomador_cnpj&&!cnpjValido(d.tomador_cnpj)){toast("O CNPJ do tomador não é válido. Confira os números ou deixe em branco.");$("tomador_cnpj").focus();return}
  if(d.corretor_cnpj&&!cnpjValido(d.corretor_cnpj)){toast("O CNPJ da corretora não é válido. Confira os números ou deixe em branco.");$("corretor_cnpj").focus();return}
  if(e.uploading.length){toast("Aguarde o envio dos documentos terminar.");return}
  if(d.repasse_pct==null||d.repasse_pct<0||d.repasse_pct>100){toast("Informe a divisão da comissão: a parte da CS e a da parceira, em %.");$("parte_cs").focus();return}
  {const dup=dupApolice(d,e.id);if(dup&&e.dupOk!==d.apolice){e.dupOk=d.apolice;toast(`A apólice ${d.apolice} já foi lançada (${dup.corretor||"sem corretora"}). Se não for repetida, clique em Salvar de novo.`);return}}
  recalcParcelas(d);
  const row={apolice:d.apolice,numero_susep:d.numero_susep||null,data_emissao:d.data_emissao||null,seguradora:d.seguradora||null,modalidade:d.modalidade||null,tomador:d.tomador||null,tomador_cnpj:d.tomador_cnpj||null,
    lider:d.lider==="parceira"?"parceira":"emissora",emitida_por:d.emitida_por||null,corretor:d.corretor,corretor_cnpj:d.corretor_cnpj||null,corretor_susep:d.corretor_susep||null,
    premio:d.premio,comissao_pct:d.comissao_pct,nivel:nivelDe(d.repasse_pct),repasse_pct:d.repasse_pct,
    valor_repasse:Math.round((Number(d.valor_repasse)||0)*100)/100,valor_manual:!!d.valor_manual,parcelas_qtd:d.parcelas.length,competencia:d.parcelas[0].competencia,observacao:d.observacao||null};
  e.saving=true;const btn=$("saveBtn");if(btn){btn.disabled=true;btn.textContent="Salvando…"}
  try{
    let id=e.id;
    if(id){const {error}=await sb.from("cocorretagens").update(row).eq("id",id);if(error)throw error}
    else{const {data,error}=await sb.from("cocorretagens").insert({...row,emissora_id:S.emisId}).select("id").single();if(error)throw error;id=data.id}
    // parcelas: grava as N atuais e remove as que sobraram (nunca as já pagas)
    const prs=d.parcelas.map(p=>({cocorretagem_id:id,numero:p.numero,vencimento:p.vencimento||null,premio_parcela:p.premio_parcela!=null?p.premio_parcela:null,valor:Math.round((Number(p.valor)||0)*100)/100,
      competencia:p.vencimento?String(p.vencimento).slice(0,7):p.competencia,pago:!!p.pago,data_pagamento:p.pago?(p.data_pagamento||isoDay(today)):null,pago_por:p.pago?(p.pagoOrig?(p.pago_por||null):S.me.email):null}));
    {const {error}=await sb.from("parcelas").upsert(prs,{onConflict:"cocorretagem_id,numero"});if(error)throw error}
    if(e.id){const {error}=await sb.from("parcelas").delete().eq("cocorretagem_id",id).gt("numero",d.parcelas.length).eq("pago",false);if(error)throw error}
    const novos=e.data.anexos.filter(a=>a.novo).map(a=>({cocorretagem_id:id,path:a.path,nome:a.nome,categoria:a.categoria,content_type:a.content_type,tamanho:a.tamanho}));
    if(novos.length){const {error}=await sb.from("anexos").insert(novos);if(error)throw error}
    for(const a of e.data.anexos.filter(a=>!a.novo&&a.dirty)){await sb.from("anexos").update({categoria:a.categoria}).eq("id",a.id)}
    if(e.removed.length){await sb.from("anexos").delete().in("id",e.removed.map(a=>a.id));await sb.storage.from(BUCKET).remove(e.removed.map(a=>a.path))}
    if(row.seguradora){const ai=e.aiSeg||{};const reg=segReg(row.seguradora)||(ai.cnpj&&S.seguradoras.find(x=>x.cnpj===ai.cnpj));
      if(!reg){const ins={nome:row.seguradora};if(ai.razao)ins.razao_social=String(ai.razao).toLocaleUpperCase("pt-BR");if(ai.cnpj)ins.cnpj=ai.cnpj;
        let r1;try{r1=await sb.from("seguradoras").insert(ins)}catch(_){r1={error:1}}if(r1&&!r1.error)e.segNova=`A seguradora ${row.seguradora} entrou na lista${ai.cnpj?" com razão social e CNPJ":""}.`}
      else if((!reg.cnpj&&ai.cnpj)||(!reg.razao_social&&ai.razao)){const up={};if(!reg.cnpj&&ai.cnpj)up.cnpj=ai.cnpj;if(!reg.razao_social&&ai.razao)up.razao_social=String(ai.razao).toLocaleUpperCase("pt-BR");await sb.from("seguradoras").update(up).eq("id",reg.id).then(()=>{},()=>{})}}
    if(row.corretor_cnpj&&!corretoraPorCnpj(row.corretor_cnpj)){await sb.from("corretoras").insert({nome:row.corretor,cnpj:row.corretor_cnpj,susep:row.corretor_susep}).then(()=>{},()=>{})}
    else if(row.corretor_susep&&!S.corretoras.some(x=>x.susep===row.corretor_susep)){const c=corretoraPorCnpj(row.corretor_cnpj)||corretoraPorNome(row.corretor);if(c&&!c.susep)await sb.from("corretoras").update({susep:row.corretor_susep}).eq("id",c.id).then(()=>{},()=>{});else if(!c)await sb.from("corretoras").insert({nome:row.corretor,susep:row.corretor_susep}).then(()=>{},()=>{})}
    const wasNew=!e.id;closePanel(true);
    if(wasNew&&row.competencia!==S.month)S.month=row.competencia;
    toast((wasNew?"Apólice lançada.":"Alterações salvas.")+(e.segNova?" "+e.segNova:""));await load();
  }catch(err){console.error(err);e.saving=false;if(btn){btn.disabled=false;btn.textContent="Salvar"}toast(errMsg(err))}
}
function errMsg(err){const m=(err&&(err.message||err.error_description))||"";
  if(/JWT|session|token/i.test(m))return"Sua sessão expirou. Entre de novo.";
  if(/row-level security|permission/i.test(m))return"Sua conta não tem permissão para esta alteração.";
  if(/competencia/i.test(m))return"Confira o mês da competência.";
  return"Não foi possível salvar agora. Tente de novo em instantes."}
async function deleteRecord(){
  const e=S.editing;if(!e||!e.id)return;
  const paths=[...e.data.anexos.filter(a=>!a.novo).map(a=>a.path),...e.removed.map(a=>a.path)];
  const {error}=await sb.from("cocorretagens").delete().eq("id",e.id);
  if(error){toast(errMsg(error));return}
  if(paths.length)await sb.storage.from(BUCKET).remove(paths);
  closePanel(false);toast("Apólice excluída.");load();
}
function grupoKey(d){return dirDe(d)+":"+corrKey(d)}
async function payGroup(k){
  const dt=($("payDate")||{}).value||isoDay(today);
  const itens=monthDocs().filter(d=>grupoKey(d)===k&&!d.pago);const ids=itens.map(d=>d.pid).filter(Boolean);
  if(!ids.length){S.confirming=null;render();return}
  const {error}=await sb.from("parcelas").update({pago:true,data_pagamento:dt,pago_por:S.me.email}).in("id",ids);
  if(error){toast(errMsg(error));render();return}
  S.confirming=null;S.ultimaBaixa={ids,rec:k.startsWith("receber")};
  toast(`${k.startsWith("receber")?"Recebimento":"Pagamento"} registrado em ${dateBR(dt)}.`,{label:"Desfazer",action:"undoLastPay"});load();
}
// desfaz a baixa (volta as parcelas para "em aberto")
async function desfazerBaixa(ids,rec){
  if(!ids||!ids.length)return;
  const {error}=await sb.from("parcelas").update({pago:false,data_pagamento:null,pago_por:null}).in("id",ids);
  if(error){toast(errMsg(error));return}
  S.ultimaBaixa=null;S.editPay=null;toast(`${rec?"Recebimento":"Pagamento"} desfeito. ${ids.length>1?"As parcelas voltaram":"A parcela voltou"} para em aberto.`);load();
}
// troca a data da baixa de um grupo
async function alterarDataBaixa(k){
  const dt=($("payEditDate")||{}).value;if(!dt){toast("Informe a data.");return}
  const ids=monthDocs().filter(d=>grupoKey(d)===k&&d.pago).map(d=>d.pid).filter(Boolean);if(!ids.length)return;
  const {error}=await sb.from("parcelas").update({data_pagamento:dt}).in("id",ids);
  if(error){toast(errMsg(error));return}
  S.editPay=null;toast(`Data alterada para ${dateBR(dt)}.`);load();
}
async function copyExtrato(k){
  const items=monthDocs().filter(d=>grupoKey(d)===k).sort((a,b)=>String(a.data_emissao||"").localeCompare(String(b.data_emissao||"")));
  if(!items.length)return;const rec=k.startsWith("receber");const open=items.filter(d=>!d.pago);const list=open.length?open:items;
  const tot=list.reduce((a,d)=>a+(+d.valor_repasse||0),0);
  const txt=[`${rec?"Cobrança":"Extrato"} de cocorretagem · ${monthName(S.month)}`,`Corretora: ${items[0].corretor}`+(items[0].corretor_cnpj?` · CNPJ ${fmtCnpj(items[0].corretor_cnpj)}`:""),"",
    ...list.map(d=>`• Apólice ${d.apolice}${d.numero_susep?` (SUSEP ${d.numero_susep})`:""}${parcTxt(d)?` · ${parcTxt(d)}`:""}${d.emitida_por?` · emitida pela ${d.emitida_por}`:""} · ${d.seguradora?segRazao(d.seguradora):"—"} · tomador ${d.tomador||"—"}${d.tomador_cnpj?` (CNPJ ${fmtCnpj(d.tomador_cnpj)})`:""} · ${money(d.valor_repasse)}`),
    "",rec?`Total ${open.length?"a pagar à "+EMIS.nome:"recebido"}: ${money(tot)}`:`Total ${open.length?"a receber":"pago"}: ${money(tot)}`,"",`${rec?"Favorecida":"Emitente"}: ${EMIS.nome} · CNPJ ${EMIS.cnpj}`,"Clube do Seguro Garantia"].join("\n");
  try{await navigator.clipboard.writeText(txt);toast(rec?"Cobrança copiada. Cole no WhatsApp ou e-mail.":"Extrato copiado. Cole no WhatsApp ou e-mail.")}
  catch(_){$("panelRoot").innerHTML=`<div class="scrim" data-action="close"></div><aside class="panel" role="dialog" aria-modal="true"><div class="p-head"><h2>${rec?"Cobrança":"Extrato"}</h2><button class="iconbtn" data-action="close" aria-label="Fechar">✕</button></div><div class="p-body"><p class="meta">Selecione o texto e copie.</p><div class="f"><textarea id="extratoTxt" style="min-height:320px" readonly>${esc(txt)}</textarea></div></div></aside>`;const t=$("extratoTxt");t.focus();t.select()}
}

// ---------------- demonstrativo de pagamento (PDF e Excel por corretora) ----------------
// Mesmo layout do demonstrativo que o Clube manda ao corretor: dados do corretor, apólices,
// comissão, repasse (percentual de cada apólice), adiantamento, saldo e dados do destinatário.
const LOGO = "icons/logo-clube.png";
const LIB_PDF=["https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js","https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js"];
const LIB_XLS=["https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js"];
function loadScript(src){return new Promise((ok,fail)=>{const sc=document.createElement("script");sc.src=src;sc.onload=ok;sc.onerror=fail;document.head.appendChild(sc)})}
async function loadPDF(){if(!(window.jspdf&&window.jspdf.jsPDF))await loadScript(LIB_PDF[0]);if(!window.jspdf.jsPDF.API.autoTable)await loadScript(LIB_PDF[1])}
async function loadXLS(){if(!window.ExcelJS)await loadScript(LIB_XLS[0])}
async function logoData(){if(logoData.v)return logoData.v;const b=await (await fetch(LOGO)).blob();logoData.v=await new Promise((ok,fail)=>{const fr=new FileReader();fr.onload=()=>ok(fr.result);fr.onerror=fail;fr.readAsDataURL(b)});return logoData.v}
function baixarBlob(blob,nome){const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=nome;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),4000)}
const num2=n=>(Number(n)||0).toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2});
function dKey(d){return d.pid||(d.id+":"+d.parcela_num)}
function corrReg(nome,cnpj){return (cnpj&&S.corretoras.find(x=>x.cnpj===cnpj))||S.corretoras.find(x=>key(x.nome)===key(nome))||null}
// "VALIANZA CONSULTORIA E CORRETORA…" → "Valianza"
function nomeCurtoDem(n){const w=String(n||"").trim().split(/\s+/);return tituloCaso(w[0]&&w[0].length<=3&&w[1]?w[0]+" "+w[1]:(w[0]||"Corretora"))}

function openDem(itens,opts){
  opts=opts||{};itens=(itens||[]).filter(d=>dirDe(d)==="pagar");if(!itens.length){toast("Não há nada a pagar a esta corretora.");return}
  const d0=itens[0];const r=corrReg(d0.corretor,d0.corretor_cnpj)||{};
  itens=itens.slice().sort((a,b)=>String(a.vencimento||a.competencia||"").localeCompare(String(b.vencimento||b.competencia||""))||String(a.apolice).localeCompare(String(b.apolice))||a.parcela_num-b.parcela_num);
  S.dem={itens,sel:new Set(itens.map(dKey)),nome:d0.corretor||"",cnpj:d0.corretor_cnpj||r.cnpj||"",regId:r.id||null,rep:r.representante||"",pix:r.pix||"",
    adiant:"",local:lsGet("demLocal")||"Salvador",data:isoDay(today),voltar:opts.voltar||null,titulo:opts.titulo||""};
  renderDem();
}
function demSel(){const D=S.dem;return D?D.itens.filter(d=>D.sel.has(dKey(d))):[]}
function demLer(){const D=S.dem;if(!D)return;const g=id=>{const x=$(id);return x?x.value:null};
  ["rep","pix","local","data"].forEach(f=>{const v=g("dem_"+f);if(v!=null)D[f]=v});const a=g("dem_adiant");if(a!=null)D.adiant=a}
function demTotais(){const it=demSel();const total=Math.round(it.reduce((s,d)=>s+(Number(d.valor_repasse)||0),0)*100)/100;const adi=Math.abs(parseBR(S.dem.adiant)||0);return {it,total,adi,saldo:Math.round((total-adi)*100)/100}}
function renderDemTot(){const T=demTotais();const el=$("demTot");if(!el)return;
  el.innerHTML=`<div><span>Total do repasse</span><b class="num">${money(T.total)}</b></div>${T.adi?`<div><span>Adiantamento</span><b class="num">− ${money(T.adi)}</b></div>`:""}<div class="saldo"><span>Saldo a repassar</span><b class="num">${money(T.saldo)}</b></div>`;
  const n=$("demN");if(n)n.textContent=`${T.it.length} de ${S.dem.itens.length} parcela${S.dem.itens.length>1?"s":""}`;
  document.querySelectorAll("[data-action='demPdf'],[data-action='demXlsx']").forEach(b=>b.disabled=!T.it.length)}
function renderDem(){
  const D=S.dem;if(!D)return;
  $("panelRoot").innerHTML=`<div class="scrim" data-action="demClose"></div>
  <aside class="panel dem" role="dialog" aria-modal="true" aria-labelledby="demT">
    <div class="p-head">${D.voltar?`<button class="iconbtn" data-action="demClose" aria-label="${D.voltar==="ficha"?"Voltar à corretora":"Voltar ao extrato"}">←</button>`:""}<h2 id="demT">Demonstrativo de pagamento</h2><button class="iconbtn" data-action="demFechar" aria-label="Fechar">✕</button></div>
    <div class="p-body">
      <div class="dem-corr"><b>${esc(D.nome||"Corretora sem nome")}</b>${D.cnpj?`<span class="num">CNPJ ${esc(fmtCnpj(D.cnpj))}</span>`:`<span class="warn-txt">sem CNPJ</span>`}${D.titulo?`<span class="meta">${esc(D.titulo)}</span>`:""}</div>
      <div class="dem-list" role="group" aria-label="Parcelas no demonstrativo">${D.itens.map(d=>`<label class="dem-it">
        <input type="checkbox" data-dsel="${esc(dKey(d))}"${D.sel.has(dKey(d))?" checked":""}>
        <span class="di-a"><b class="num">${esc(d.apolice||"s/ nº")}</b>${d.parcelas_total>1?` <span class="pc">${d.parcela_num}/${d.parcelas_total}</span>`:""}<small>${esc(d.tomador||"—")}${d.vencimento?` · venc. ${esc(dateBR(d.vencimento))}`:""}${d.pago?` · <span class="ok-txt">já pago</span>`:""}</small></span>
        <span class="di-c num"><small>${d.comissao_pct!=null?esc(pctFmt(d.comissao_pct))+" de "+esc(money(d.premio)):"sem comissão"}</small><small>repasse ${esc(pctFmt(d.repasse_pct))}</small></span>
        <b class="di-v num">${money(d.valor_repasse)}</b></label>`).join("")}</div>
      <div class="dem-tot" id="demTot"></div>
      <fieldset class="dem-f"><legend>Dados do destinatário do crédito</legend>
        <div class="f"><label for="dem_rep">Representante legal</label><input id="dem_rep" value="${esc(D.rep)}" placeholder="Nome do representante"></div>
        <div class="f"><label for="dem_pix">PIX</label><input id="dem_pix" value="${esc(D.pix)}" placeholder="Chave PIX (pode ficar em branco)"></div>
        <div class="f"><label for="dem_adiant">Adiantamento (R$)</label><input id="dem_adiant" inputmode="decimal" value="${esc(D.adiant)}" placeholder="0,00"><span class="hint">Valor já adiantado; é descontado do saldo.</span></div>
        <div class="f"><label for="dem_local">Local</label><input id="dem_local" value="${esc(D.local)}"></div>
        <div class="f"><label for="dem_data">Data</label><input id="dem_data" type="date" value="${esc(D.data)}"></div>
      </fieldset>
      <p class="meta">O representante e o PIX ficam salvos no cadastro da corretora para o próximo demonstrativo.</p>
    </div>
    <div class="p-foot"><span class="meta" id="demN"></span><span class="spacer"></span><button class="btn" data-action="demXlsx">Baixar Excel</button><button class="btn primary" data-action="demPdf">Baixar PDF</button></div>
  </aside>`;
  renderDemTot();
}
function demFechar(tudo){const D=S.dem;S.dem=null;if(D&&D.voltar==="extrato"&&!tudo&&S.ext)renderExtrato();else if(S.ficha&&!tudo)renderFicha();else{if(tudo){S.ext=null;S.ficha=null}$("panelRoot").innerHTML=""}}
// dados prontos para o arquivo
function demDados(){
  demLer();const D=S.dem;const T=demTotais();if(!T.it.length){toast("Marque pelo menos uma parcela.");return null}
  if(!D.data){toast("Informe a data.");return null}
  const [a,m,d]=D.data.split("-");const curto=nomeCurtoDem(D.nome);
  lsSet("demLocal",D.local||"");
  return {...T,nome:D.nome,cnpj:D.cnpj?fmtCnpj(D.cnpj):"",rep:D.rep.trim(),pix:D.pix.trim(),local:(D.local||"").trim(),dataBR:`${d}/${m}/${a}`,
    titulo:`Demonstrativo de Pagamento ${curto} ${d}${m}${a}`,arquivo:`Demonstrativo_de_Pagamento_${curto.normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^A-Za-z0-9-]+/g,"_")}_${d}${m}${a}`,
    linhas:T.it.map(x=>({apolice:x.apolice||"",parcela:x.parcelas_total>1?`${x.parcela_num}/${x.parcelas_total}`:String(x.parcela_num||1),cliente:x.tomador||"",
      premio:Number(x.premio)||0,com:(Number(x.comissao_pct)||0)/100,vcom:comissaoDe(x),rep:(Number(x.repasse_pct)||0)/100,vrep:Number(x.valor_repasse)||0}))};
}
// guarda representante e PIX na corretora (sem travar o download)
async function demGuardar(){
  const D=S.dem;if(!D||!sb)return;const rep=D.rep.trim()||null,pix=D.pix.trim()||null;
  const r=corrReg(D.nome,D.cnpj);if(r&&(r.representante||null)===rep&&(r.pix||null)===pix)return;
  try{const q=r?await sb.from("corretoras").update({representante:rep,pix}).eq("id",r.id):(D.nome?await sb.from("corretoras").insert({nome:D.nome,cnpj:D.cnpj||null,representante:rep,pix}):{error:null});
    if(!q.error){if(r){r.representante=rep;r.pix=pix}else load()}}catch(_){}
}
const COR={navy:[0,32,96],gold:[153,102,51],gray:[234,234,234]};
const pctTxt=v=>(Math.round(v*10000)/100).toLocaleString("pt-BR",{maximumFractionDigits:2})+"%";
async function demPdf(btn){
  const X=demDados();if(!X)return;btn.disabled=true;
  try{await loadPDF()}catch(_){btn.disabled=false;toast("Não foi possível carregar o gerador de PDF. Verifique a conexão.");return}
  let logo=null;try{logo=await logoData()}catch(_){}
  const {jsPDF}=window.jspdf;const doc=new jsPDF({orientation:"landscape",unit:"mm",format:"a4"});
  const W=297,H=210,M=12,CW=W-2*M,col2=M+CW*0.62;
  const barra=(y,t)=>{doc.setFillColor(...COR.navy);doc.rect(M,y,CW,6,"F");doc.setFont("helvetica","bold");doc.setFontSize(9);doc.setTextColor(255);doc.text(t,W/2,y+4.1,{align:"center"});doc.setTextColor(0);doc.setFont("helvetica","normal")};
  const caixa=(x,y,w,h,t,al)=>{doc.setFillColor(...COR.gray);doc.rect(x,y,w,h,"F");if(t){doc.setFontSize(9);doc.text(String(t),al==="right"?x+w-1.5:x+1.5,y+h-1.8,{align:al||"left",maxWidth:w-3})}};
  const ouro=y=>{doc.setDrawColor(...COR.gold);doc.setLineWidth(0.6);doc.line(M,y,W-M,y)};
  if(logo)doc.addImage(logo,"PNG",M,8,76,21.3);
  doc.setFont("helvetica","bold");doc.setFontSize(14);doc.text(X.titulo,(M+80+W-M)/2,21,{align:"center",maxWidth:W-M-(M+84)});
  let y=34;barra(y,"Dados do Corretor");y+=6;
  doc.setFontSize(9);doc.text("Nome | Razão Social",M+1,y+4.2);doc.text("CNPJ | CPF",col2+1,y+4.2);y+=5.5;
  caixa(M,y,col2-M-1.5,5.6,X.nome);caixa(col2,y,W-M-col2,5.6,X.cnpj,"right");y+=6.3;ouro(y);y+=0.8;
  doc.autoTable({startY:y,margin:{left:M,right:M},theme:"plain",
    head:[["Apólice","Parcela","Cliente","Prêmio","Comissão","Valor da Comissão","Repasse","Valor do Repasse"]],
    body:X.linhas.map(l=>[l.apolice,l.parcela,l.cliente,num2(l.premio),pctTxt(l.com),num2(l.vcom),pctTxt(l.rep),num2(l.vrep)]),
    styles:{font:"helvetica",fontSize:9,cellPadding:{top:1.3,bottom:1.3,left:1.6,right:1.6},textColor:0,overflow:"ellipsize"},
    headStyles:{fontStyle:"normal",halign:"center",fillColor:false},
    bodyStyles:{fillColor:COR.gray,lineColor:[255,255,255],lineWidth:0.7},
    columnStyles:{0:{halign:"center",cellWidth:30},1:{halign:"center",cellWidth:18},2:{cellWidth:"auto"},3:{halign:"right",cellWidth:26},4:{halign:"center",cellWidth:20},5:{halign:"right",cellWidth:32},6:{halign:"center",cellWidth:20},7:{halign:"right",cellWidth:34}},
    didDrawPage:()=>{}});
  y=doc.lastAutoTable.finalY+0.6;ouro(y);
  if(y+62>H-M){doc.addPage();y=M}
  const xl=W-M-34-4,xv=W-M-2;y+=5;
  const tot=(t,v,b)=>{doc.setFont("helvetica",b?"bold":"normal");doc.text(t,xl,y,{align:"right"});if(v!=null)doc.text(v,xv,y,{align:"right"});y+=5.5};
  tot("Total",num2(X.total));tot("Adiantamento",X.adi?"-"+num2(X.adi):"");tot("Saldo a repassar",num2(X.saldo),true);doc.setFont("helvetica","normal");
  y+=0.5;barra(y,"Dados do destinatário do crédito");y+=6;
  const c3=M+CW*0.55,c4=M+CW*0.45;
  doc.setFontSize(9);doc.text("Representante Legal",M+1,y+4.2);doc.text("PIX",c3+1,y+4.2);y+=5.5;
  caixa(M,y,c3-M-1.5,5.6,X.rep);caixa(c3,y,W-M-c3,5.6,X.pix);y+=6.6;
  doc.text("Local e Data",M+1,y+4.2);doc.text("Assinatura",c4+1,y+4.2);y+=5.5;
  caixa(M,y,c4-M-1.5,12,[X.local,X.dataBR].filter(Boolean).join(", "));caixa(c4,y,W-M-c4,12,"");y+=12.7;ouro(y);
  doc.save(X.arquivo+".pdf");btn.disabled=false;demGuardar();toast("PDF baixado. Confira e envie ao corretor.");
}
async function demXlsx(btn){
  const X=demDados();if(!X)return;btn.disabled=true;
  try{await loadXLS()}catch(_){btn.disabled=false;toast("Não foi possível carregar o gerador de Excel. Verifique a conexão.");return}
  let logo=null;try{logo=await logoData()}catch(_){}
  const wb=new ExcelJS.Workbook();wb.creator="Clube do Seguro Garantia";
  const ws=wb.addWorksheet("Demonstrativo",{views:[{showGridLines:false}],pageSetup:{paperSize:9,orientation:"landscape",fitToPage:true,fitToWidth:1,fitToHeight:0,margins:{left:.4,right:.4,top:.5,bottom:.5,header:.2,footer:.2}}});
  ws.columns=[16,9,40,13,11,19,10,19].map(width=>({width}));
  const hex=c=>"FF"+c.map(v=>v.toString(16).padStart(2,"0")).join("").toUpperCase();
  const fill=c=>({type:"pattern",pattern:"solid",fgColor:{argb:hex(c)}});
  const branco={style:"thin",color:{argb:"FFFFFFFF"}};const ouroB={style:"medium",color:{argb:hex(COR.gold)}};
  const fnt={name:"Calibri",size:11};
  if(logo){const id=wb.addImage({base64:logo,extension:"png"});ws.addImage(id,{tl:{col:0,row:0},ext:{width:300,height:84},editAs:"oneCell"})}
  for(let r=1;r<=5;r++)ws.getRow(r).height=17;
  ws.mergeCells("D2:H4");const t=ws.getCell("D2");t.value=X.titulo;t.font={name:"Arial",size:14,bold:true};t.alignment={horizontal:"center",vertical:"middle",wrapText:true};
  const barra=(r,txt)=>{ws.mergeCells(`A${r}:H${r}`);const c=ws.getCell(`A${r}`);c.value=txt;c.fill=fill(COR.navy);c.font={...fnt,bold:true,color:{argb:"FFFFFFFF"}};c.alignment={horizontal:"center"}};
  const cel=(ref,v,o)=>{const c=ws.getCell(ref);c.value=v;c.font=fnt;Object.assign(c,o||{});return c};
  const linhaOuro=r=>{for(let c=1;c<=8;c++){const x=ws.getRow(r).getCell(c);x.border={...(x.border||{}),bottom:ouroB}}};
  let r=6;barra(r,"Dados do Corretor");r++;
  ws.mergeCells(`A${r}:E${r}`);cel(`A${r}`,"Nome | Razão Social");ws.mergeCells(`F${r}:H${r}`);cel(`F${r}`,"CNPJ | CPF");r++;
  ws.mergeCells(`A${r}:E${r}`);cel(`A${r}`,X.nome,{fill:fill(COR.gray)});ws.mergeCells(`F${r}:H${r}`);cel(`F${r}`,X.cnpj,{fill:fill(COR.gray),alignment:{horizontal:"right"}});linhaOuro(r);r++;
  ["Apólice","Parcela","Cliente","Prêmio","Comissão","Valor da Comissão","Repasse","Valor do Repasse"].forEach((h,i)=>{const c=ws.getRow(r).getCell(i+1);c.value=h;c.font=fnt;c.alignment={horizontal:"center"}});r++;
  const r0=r;
  X.linhas.forEach(l=>{const row=ws.getRow(r);[l.apolice,l.parcela,l.cliente,l.premio,l.com,l.vcom,l.rep,l.vrep].forEach((v,i)=>{const c=row.getCell(i+1);c.value=v;c.font=fnt;c.fill=fill(COR.gray);c.border={top:branco,left:branco,bottom:branco,right:branco};
      c.alignment={horizontal:[0,1,4,6].includes(i)?"center":[3,5,7].includes(i)?"right":"left"};
      if([3,5,7].includes(i))c.numFmt="#,##0.00";if(i===4||i===6)c.numFmt=Number.isInteger(Math.round(v*10000)/100)?"0%":"0.00%"});r++});
  linhaOuro(r-1);
  const rt=r;cel(`G${r}`,"Total",{alignment:{horizontal:"right"}});cel(`H${r}`,{formula:`SUM(H${r0}:H${r-1})`,result:X.total},{numFmt:"#,##0.00"});r++;
  cel(`G${r}`,"Adiantamento",{alignment:{horizontal:"right"}});cel(`H${r}`,X.adi?-X.adi:null,{numFmt:"#,##0.00"});r++;
  cel(`G${r}`,"Saldo a repassar",{alignment:{horizontal:"right"},font:{...fnt,bold:true}});cel(`H${r}`,{formula:`H${rt}+N(H${rt+1})`,result:X.saldo},{numFmt:"#,##0.00",font:{...fnt,bold:true}});r++;
  barra(r,"Dados do destinatário do crédito");r++;
  ws.mergeCells(`A${r}:D${r}`);cel(`A${r}`,"Representante Legal");ws.mergeCells(`E${r}:H${r}`);cel(`E${r}`,"PIX");r++;
  ws.mergeCells(`A${r}:D${r}`);cel(`A${r}`,X.rep,{fill:fill(COR.gray)});ws.mergeCells(`E${r}:H${r}`);cel(`E${r}`,X.pix,{fill:fill(COR.gray)});r++;
  ws.mergeCells(`A${r}:C${r}`);cel(`A${r}`,"Local e Data");ws.mergeCells(`D${r}:H${r}`);cel(`D${r}`,"Assinatura");r++;
  ws.getRow(r).height=32;ws.mergeCells(`A${r}:C${r}`);cel(`A${r}`,[X.local,X.dataBR].filter(Boolean).join(", "),{fill:fill(COR.gray),alignment:{vertical:"bottom"}});ws.mergeCells(`D${r}:H${r}`);cel(`D${r}`,"",{fill:fill(COR.gray)});linhaOuro(r);
  ws.pageSetup.printArea=`A1:H${r}`;
  const buf=await wb.xlsx.writeBuffer();baixarBlob(new Blob([buf],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}),X.arquivo+".xlsx");
  btn.disabled=false;demGuardar();toast("Excel baixado.");
}

// ---------------- relatório do mês para baixar (PDF e Excel com a identidade do Clube) ----------------
function relDados(){
  const docs=repDocs().slice().sort((a,b)=>String(a.vencimento||"").localeCompare(String(b.vencimento||""))||String(a.apolice).localeCompare(String(b.apolice)));
  const grupos=agruparRel(docs,"corretora");const T=relTotais(grupos);
  const per=repPeriodoTxt();const nAp=new Set(docs.map(d=>d.id)).size;
  const sit=d=>STATUS[status(d)][0];
  return {docs,grupos,T,per,nAp,sit,arquivo:`Relatorio_Cocorretagem_${S.month.replace("-","_")}`,
    gerado:`Gerado em ${dtBR(new Date().toISOString())} por ${S.me&&S.me.nome||""}`,emissora:`${EMIS.nome} · CNPJ ${EMIS.cnpj}`};
}
async function relPdf(btn){
  const X=relDados();if(!X.docs.length){toast("Não há parcelas neste mês.");return}
  btn.disabled=true;try{await loadPDF()}catch(_){btn.disabled=false;toast("Não foi possível carregar o gerador de PDF. Verifique a conexão.");return}
  let logo=null;try{logo=await logoData()}catch(_){}
  const {jsPDF}=window.jspdf;const doc=new jsPDF({orientation:"landscape",unit:"mm",format:"a4"});
  const W=297,H=210,M=12,CW=W-2*M;const N=COR.navy,G=COR.gold,GR=[244,245,247];
  // cabeçalho
  if(logo)doc.addImage(logo,"PNG",M,9,64,18);
  doc.setFont("helvetica","bold");doc.setFontSize(16);doc.setTextColor(...N);doc.text("Relatório de cocorretagem",W-M,16,{align:"right"});
  doc.setFontSize(12);doc.setTextColor(...G);doc.text(X.per,W-M,22.5,{align:"right"});
  doc.setFont("helvetica","normal");doc.setFontSize(8.5);doc.setTextColor(90,102,121);doc.text(X.emissora+"  ·  "+X.gerado,W-M,28,{align:"right"});
  doc.setDrawColor(...G);doc.setLineWidth(0.8);doc.line(M,32,W-M,32);
  // resumo em 4 quadros
  const cards=[["Comissão das apólices",money(X.T.comissao),`${X.nAp} apólice${X.nAp!==1?"s":""} · ${X.T.n} parcela${X.T.n!==1?"s":""}`,N],
    ["A pagar às parceiras",money(X.T.pagar),`${money(X.T.pagar-X.T.abertoP)} pago · ${money(X.T.abertoP)} em aberto`,N],
    ["A receber das parceiras",money(X.T.receber),`${money(X.T.receber-X.T.abertoR)} recebido · ${money(X.T.abertoR)} em aberto`,[138,103,64]],
    ["Fica com a "+emisCurto(),money(X.T.margem),`${X.T.comissao?Math.round(X.T.margem/X.T.comissao*100):0}% da comissão`,[8,98,86]]];
  const cw=(CW-9)/4;cards.forEach((c,i)=>{const x=M+i*(cw+3),y=37;doc.setFillColor(...GR);doc.roundedRect(x,y,cw,22,2,2,"F");doc.setFillColor(...c[3]);doc.rect(x,y,cw,1.2,"F");
    doc.setFontSize(7.5);doc.setTextColor(90,102,121);doc.text(c[0].toUpperCase(),x+4,y+6.5);
    doc.setFont("helvetica","bold");doc.setFontSize(14);doc.setTextColor(...c[3]);doc.text(c[1],x+4,y+14);
    doc.setFont("helvetica","normal");doc.setFontSize(7.5);doc.setTextColor(90,102,121);doc.text(c[2],x+4,y+19.2,{maxWidth:cw-8})});
  const titulo=(t,y)=>{doc.setFont("helvetica","bold");doc.setFontSize(11);doc.setTextColor(...N);doc.text(t,M,y);doc.setFont("helvetica","normal")};
  const base={theme:"plain",margin:{left:M,right:M,top:16,bottom:14},styles:{font:"helvetica",fontSize:8.5,cellPadding:{top:1.8,bottom:1.8,left:2,right:2},textColor:[13,30,54],lineColor:[220,225,232],lineWidth:{bottom:0.2}},
    headStyles:{fillColor:N,textColor:255,fontStyle:"bold",fontSize:8},footStyles:{fillColor:[230,236,244],fontStyle:"bold",textColor:N}};
  // por corretora
  titulo("Por corretora",68);
  doc.autoTable({...base,startY:71,
    head:[["Corretora","Parcelas","Comissão","A pagar","A receber","Em aberto","Fica com a "+emisCurto()]],
    body:X.grupos.map(g=>[String(g.nome).toLocaleUpperCase("pt-BR"),g.n,money(g.comissao),g.pagar?money(g.pagar):"—",g.receber?money(g.receber):"—",(g.abertoP+g.abertoR)?money(g.abertoP+g.abertoR):"—",money(g.margem)]),
    foot:[["Total",X.T.n,money(X.T.comissao),money(X.T.pagar),money(X.T.receber),money(X.T.abertoP+X.T.abertoR),money(X.T.margem)]],
    columnStyles:{0:{cellWidth:"auto"},1:{halign:"center",cellWidth:20},2:{halign:"right",cellWidth:30},3:{halign:"right",cellWidth:30},4:{halign:"right",cellWidth:30},5:{halign:"right",cellWidth:30},6:{halign:"right",cellWidth:34}},
    didParseCell:h=>{if(h.section==="body"&&h.column.index===5&&h.cell.raw!=="—")h.cell.styles.textColor=[154,91,0]}});
  // parcelas, agrupadas por corretora
  doc.addPage();titulo("Parcelas do período",18);
  const body=[];X.grupos.forEach(g=>{body.push([{content:String(g.nome).toLocaleUpperCase("pt-BR")+(g.doc?"  ·  CNPJ "+fmtCnpj(g.doc):""),colSpan:10,styles:{fillColor:[230,236,244],fontStyle:"bold",textColor:N}}]);
    g.itens.slice().sort((a,b)=>String(a.vencimento||"").localeCompare(String(b.vencimento||""))).forEach(d=>{const rec=dirDe(d)==="receber";
      body.push([d.apolice||"—",`${d.parcela_num}/${d.parcelas_total}`,d.vencimento?dateBR(d.vencimento):"—",d.tomador||"—",d.seguradora||"—",money(d.premio),d.comissao_pct!=null?pctFmt(d.comissao_pct):"—",pctFmt(d.repasse_pct),(rec?"+ ":"- ")+money(d.valor_repasse),X.sit(d)])})});
  doc.autoTable({...base,startY:21,head:[["Apólice","Parc.","Vencimento","Tomador","Seguradora","Prêmio","Com.","Parceira","Valor","Situação"]],body,
    columnStyles:{0:{cellWidth:44},1:{halign:"center",cellWidth:12},2:{halign:"center",cellWidth:21},3:{cellWidth:"auto"},4:{cellWidth:22},5:{halign:"right",cellWidth:27},6:{halign:"center",cellWidth:12},7:{halign:"center",cellWidth:16},8:{halign:"right",cellWidth:27},9:{cellWidth:38}},
    didParseCell:h=>{if(h.section!=="body"||h.cell.raw==null||typeof h.cell.raw==="object")return;
      if(h.column.index===8)h.cell.styles.textColor=String(h.cell.raw).startsWith("+")?[138,103,64]:N;
      if(h.column.index===9){const t=String(h.cell.raw);h.cell.styles.textColor=/atrasad/i.test(t)?[176,38,30]:/^(Pago|Recebido)/.test(t)?[8,98,86]:[90,102,121]}}});
  // rodapé em todas as páginas
  const n=doc.getNumberOfPages();for(let i=1;i<=n;i++){doc.setPage(i);doc.setFontSize(7.5);doc.setTextColor(90,102,121);doc.text("Clube do Seguro Garantia  ·  Relatório de cocorretagem  ·  "+X.per,M,H-6);doc.text(`Página ${i} de ${n}`,W-M,H-6,{align:"right"})}
  doc.save(X.arquivo+".pdf");btn.disabled=false;toast("Relatório em PDF baixado.");
}
async function relXlsx(btn){
  const X=relDados();if(!X.docs.length){toast("Não há parcelas neste mês.");return}
  btn.disabled=true;try{await loadXLS()}catch(_){btn.disabled=false;toast("Não foi possível carregar o gerador de Excel. Verifique a conexão.");return}
  let logo=null;try{logo=await logoData()}catch(_){}
  const wb=new ExcelJS.Workbook();wb.creator="Clube do Seguro Garantia";
  const hex=c=>"FF"+c.map(v=>v.toString(16).padStart(2,"0")).join("").toUpperCase();
  const NAVY=hex(COR.navy),GOLD=hex(COR.gold),SOFT="FFE6ECF4",LINE="FFDCE1E8";
  const R$='"R$" #,##0.00';const fnt={name:"Calibri",size:11};
  const cab=(ws,cols,titulo)=>{ws.views=[{showGridLines:false}];ws.pageSetup={paperSize:9,orientation:"landscape",fitToPage:true,fitToWidth:1,fitToHeight:0,margins:{left:.4,right:.4,top:.5,bottom:.5,header:.2,footer:.2}};if(logo){const id=wb.addImage({base64:logo,extension:"png"});ws.addImage(id,{tl:{col:0,row:0},ext:{width:250,height:70},editAs:"oneCell"})}
    for(let r=1;r<=4;r++)ws.getRow(r).height=15;
    ws.mergeCells(1,3,2,cols);const t=ws.getCell(1,3);t.value=titulo;t.font={name:"Calibri",size:16,bold:true,color:{argb:NAVY}};t.alignment={horizontal:"right",vertical:"middle"};
    ws.mergeCells(3,3,3,cols);const s=ws.getCell(3,3);s.value=X.per+"  ·  "+X.emissora;s.font={...fnt,size:10,color:{argb:GOLD},bold:true};s.alignment={horizontal:"right"};
    ws.mergeCells(4,3,4,cols);const g=ws.getCell(4,3);g.value=X.gerado;g.font={...fnt,size:9,color:{argb:"FF5A6679"}};g.alignment={horizontal:"right"};
    for(let c=1;c<=cols;c++)ws.getRow(5).getCell(c).border={bottom:{style:"medium",color:{argb:GOLD}}}};
  const tabela=(ws,r0,head,linhas,money,total)=>{const hr=ws.getRow(r0);head.forEach((h,i)=>{const c=hr.getCell(i+1);c.value=h;c.font={...fnt,bold:true,color:{argb:"FFFFFFFF"}};c.fill={type:"pattern",pattern:"solid",fgColor:{argb:NAVY}};c.alignment={vertical:"middle",horizontal:money.includes(i)?"right":"left"}});hr.height=20;
    linhas.forEach((l,j)=>{const row=ws.getRow(r0+1+j);l.forEach((v,i)=>{const c=row.getCell(i+1);c.value=v;c.font=fnt;c.border={bottom:{style:"thin",color:{argb:LINE}}};if(money.includes(i)){c.numFmt=R$;c.alignment={horizontal:"right"}}})});
    if(total){const row=ws.getRow(r0+1+linhas.length);total.forEach((v,i)=>{const c=row.getCell(i+1);c.value=v;c.font={...fnt,bold:true,color:{argb:NAVY}};c.fill={type:"pattern",pattern:"solid",fgColor:{argb:SOFT}};if(money.includes(i)){c.numFmt=R$;c.alignment={horizontal:"right"}}})}
    ws.autoFilter={from:{row:r0,column:1},to:{row:r0+linhas.length,column:head.length}};ws.views=[{showGridLines:false,state:"frozen",ySplit:r0}]};
  // Resumo
  const rs=wb.addWorksheet("Resumo");rs.columns=[34,22,16,16,16,30].map(width=>({width}));cab(rs,6,"Relatório de cocorretagem");
  tabela(rs,7,["Indicador","Valor"],[["Apólices",X.nAp],["Parcelas",X.T.n],["Prêmio líquido",X.T.premio],["Comissão das apólices",X.T.comissao],["A pagar às parceiras",X.T.pagar],["   pago",X.T.pagar-X.T.abertoP],["   em aberto",X.T.abertoP],["A receber das parceiras",X.T.receber],["   recebido",X.T.receber-X.T.abertoR],["   em aberto",X.T.abertoR],["Fica com a "+emisCurto(),X.T.margem]],[1],null);
  [8,9].forEach(r=>rs.getRow(r).getCell(2).numFmt="0");rs.views=[{showGridLines:false}];rs.autoFilter=undefined;
  // Por corretora
  const pc=wb.addWorksheet("Por corretora");pc.columns=[62,20,10,16,16,16,16,16,18].map(width=>({width}));cab(pc,9,"Por corretora");
  tabela(pc,7,["Corretora","CNPJ","Parcelas","Comissão","A pagar","Pagar em aberto","A receber","Receber em aberto","Fica com a "+emisCurto()],
    X.grupos.map(g=>[String(g.nome).toLocaleUpperCase("pt-BR"),g.doc?fmtCnpj(g.doc):"",g.n,g.comissao,g.pagar,g.abertoP,g.receber,g.abertoR,g.margem]),[3,4,5,6,7,8],
    ["Total","",X.T.n,X.T.comissao,X.T.pagar,X.T.abertoP,X.T.receber,X.T.abertoR,X.T.margem]);
  // Parcelas
  const pa=wb.addWorksheet("Parcelas");pa.columns=[22,26,8,12,50,34,14,14,9,14,10,11,15,22].map(width=>({width}));cab(pa,14,"Parcelas do período");
  tabela(pa,7,["Apólice","Apólice SUSEP","Parcela","Vencimento","Corretora","Tomador","Seguradora","Prêmio","Com. %","Comissão","Parceira %","Sentido","Valor","Situação"],
    X.docs.map(d=>{const rec=dirDe(d)==="receber";return [d.apolice||"",d.numero_susep||"",`${d.parcela_num}/${d.parcelas_total}`,d.vencimento?dateBR(d.vencimento):"",String(d.corretor||"").toLocaleUpperCase("pt-BR"),d.tomador||"",d.seguradora||"",Number(d.premio)||0,(Number(d.comissao_pct)||0)/100,comissaoDe(d),(Number(d.repasse_pct)||0)/100,rec?"A receber":"A pagar",Number(d.valor_repasse)||0,X.sit(d)]}),[7,9,12],null);
  for(let r=8;r<8+X.docs.length;r++){[9,11].forEach(c=>pa.getRow(r).getCell(c).numFmt="0.##%");const s=pa.getRow(r).getCell(14);if(/atrasad/i.test(String(s.value)))s.font={...fnt,color:{argb:"FFB0261E"},bold:true}}
  const buf=await wb.xlsx.writeBuffer();baixarBlob(new Blob([buf],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}),X.arquivo+".xlsx");
  btn.disabled=false;toast("Relatório em Excel baixado.");
}

// ---------------- extrato de comissão da seguradora ----------------
// A IA lê o extrato (PDF, imagem ou planilha); o app cruza cada linha com as parcelas lançadas.
const EXT_PLAN=["xlsx","xls","csv"];
function openExtrato(){S.ext={fase:"escolher"};renderExtrato()}
function apKey(v){return soDigitos(v).replace(/^0+/,"")}
function casarLinha(it){
  const k=apKey(it.apolice);if(k.length<4)return null;
  const bate=d=>{const a=apKey(d.apolice),s=apKey(d.numero_susep);return a===k||s===k||(k.length>=8&&a.length>=8&&(a.endsWith(k)||k.endsWith(a)))};
  const cand=S.docs.filter(bate);if(!cand.length)return null;
  const n=Number(it.parcela)||null;
  let d=n?cand.find(x=>x.parcela_num===n):null;
  if(!d&&cand.length===1)d=cand[0];
  if(!d&&!n)d=cand.filter(x=>!x.pago).sort((a,b)=>String(a.vencimento||"").localeCompare(String(b.vencimento||"")))[0]||cand[0];
  return d||null;
}
function extLinhas(){
  const X=S.ext&&S.ext.dados;if(!X)return [];
  return (X.itens||[]).map((it,i)=>{const d=casarLinha(it);let tipo=!d?"nova":dirDe(d)==="receber"?"receber":"ok";const avisos=[];
    if(d&&tipo==="ok"){const c=comissaoDe(d);if(it.comissao_valor!=null&&Math.abs(Number(it.comissao_valor)-c)>0.05)avisos.push(`comissão no extrato ${money(it.comissao_valor)}, no sistema ${money(c)}`);
      if(it.comissao_pct!=null&&d.comissao_pct!=null&&Math.abs(Number(it.comissao_pct)-Number(d.comissao_pct))>0.01)avisos.push(`% no extrato ${pctFmt(it.comissao_pct)}, no sistema ${pctFmt(d.comissao_pct)}`);
      if(!d.corretor)avisos.push("apólice sem parceira")}
    return {i,it,d,tipo,avisos}});
}
function extGrupos(L){const g={};L.filter(x=>x.tipo==="ok"&&x.d.corretor).forEach(x=>{const k=corrKey(x.d);const o=g[k]=g[k]||{k,nome:x.d.corretor,itens:[],tot:0};if(!o.itens.includes(x.d)){o.itens.push(x.d);o.tot+=Number(x.d.valor_repasse)||0}});return Object.values(g).sort((a,b)=>b.tot-a.tot)}
function renderExtrato(){
  const E=S.ext;if(!E)return;let corpo="",pe="";
  if(E.fase==="escolher")corpo=`<p class="meta">Envie o extrato de comissão que a seguradora mandou: PDF, foto ou planilha. A IA lê as apólices e o app cruza cada linha com o que já está lançado.</p>
      <div class="drop" id="extDrop"><span>Arraste o extrato para cá ou</span><button type="button" class="btn small" data-action="extPick">Escolher arquivo</button></div>
      <input type="file" id="extFile" accept=".pdf,.png,.jpg,.jpeg,.webp,.xlsx,.xls,.csv" hidden>
      ${E.erro?`<p class="err-txt" role="alert">${esc(E.erro)}</p>`:""}`;
  else if(E.fase==="lendo")corpo=`<div class="ext-lendo" role="status"><span class="spin" aria-hidden="true"></span>Lendo <b>${esc(E.nome)}</b>… pode levar alguns segundos.</div>`;
  else{const X=E.dados;const L=extLinhas();const G=extGrupos(L);const novas=L.filter(x=>x.tipo==="nova").length;const soma=L.reduce((s,x)=>s+(Number(x.it.comissao_valor)||0),0);
    corpo=`<div class="ext-head"><div><b>${esc(X.seguradora_razao_social||"Seguradora não identificada")}</b><small>${esc(E.nome)}${X.data_pagamento?` · crédito em ${esc(dateBR(X.data_pagamento))}`:""}${X.periodo_texto?` · ${esc(X.periodo_texto)}`:""}</small></div>
        <div class="num r"><b>${money(X.total_comissao!=null?X.total_comissao:soma)}</b><small>comissão · ${L.length} linha${L.length!==1?"s":""}</small></div></div>
      ${X.observacao?`<p class="meta">${esc(X.observacao)}</p>`:""}
      ${G.length?`<section class="ext-dem"><h3>Demonstrativos para as parceiras</h3>${G.map(g=>`<div class="ext-g"><span><b title="${esc(g.nome)}">${esc(nomeCurtoDem(g.nome))}</b><small>${g.itens.length} parcela${g.itens.length>1?"s":""}</small></span><b class="num">${money(g.tot)}</b><button class="btn small primary" data-action="extDem" data-k="${esc(g.k)}">Demonstrativo</button></div>`).join("")}</section>`:""}
      <section class="ext-lin"><h3>Linhas do extrato${novas?` <span class="badge">${novas} não lançada${novas>1?"s":""}</span>`:""}</h3>
      ${L.map(x=>{const it=x.it,d=x.d;return `<div class="ext-l ${x.tipo}${x.avisos.length?" warn":""}">
        <div class="el-a"><b class="num">${esc(it.apolice||"—")}</b>${it.parcela&&Number(it.parcelas_total)!==1?` <span class="pc">${it.parcela}${it.parcelas_total?"/"+it.parcelas_total:""}</span>`:""}<small>${esc(it.tomador||(d&&d.tomador)||"—")}</small></div>
        <div class="el-v num">${money(it.comissao_valor)}<small>${it.comissao_pct!=null?esc(pctFmt(it.comissao_pct))+" de ":""}${it.premio!=null?esc(money(it.premio)):""}</small></div>
        <div class="el-s">${x.tipo==="ok"?(d.corretor?`<span class="ok-txt">Lançada</span><small title="${esc(d.corretor)}">${esc(nomeCurtoDem(d.corretor))} · repasse ${esc(pctFmt(d.repasse_pct))} = ${esc(money(d.valor_repasse))}</small>`:`<span class="warn-txt">Lançada, sem parceira</span>`)
          :x.tipo==="receber"?`<span class="meta">Lançada · a parceira é a líder</span>`:`<span class="warn-txt">Não lançada</span><button class="btn small" data-action="extLancar" data-i="${x.i}">Lançar</button>`}
          ${x.avisos.map(a=>`<small class="warn-txt">${esc(a)}</small>`).join("")}${d?`<button class="linkbtn" data-action="extAbrir" data-id="${esc(d.id)}">Abrir apólice</button>`:""}</div></div>`}).join("")||`<p class="meta">A IA não encontrou linhas de comissão neste arquivo.</p>`}</section>`;
    pe=`<div class="p-foot"><button class="btn ghost" data-action="extOutro">Ler outro extrato</button><span class="spacer"></span><button class="btn" data-action="extFechar">Fechar</button></div>`}
  $("panelRoot").innerHTML=`<div class="scrim" data-action="extFechar"></div>
  <aside class="panel ext" role="dialog" aria-modal="true" aria-labelledby="extT">
    <div class="p-head"><h2 id="extT">Extrato de comissão</h2><button class="iconbtn" data-action="extFechar" aria-label="Fechar">✕</button></div>
    <div class="p-body">${corpo}</div>${pe}</aside>`;
}
async function lerExtrato(f){
  const E=S.ext;if(!E||!f)return;const ext=extOf(f.name);const plan=EXT_PLAN.includes(ext);
  const type=TYPE_BY_EXT[ext];
  if(!plan&&!type){E.erro=`"${f.name}": envie PDF, imagem ou planilha (Excel/CSV).`;renderExtrato();return}
  if(f.size>20*1048576){E.erro=`"${f.name}" passa de 20 MB.`;renderExtrato();return}
  E.fase="lendo";E.nome=f.name;E.erro=null;renderExtrato();
  let body,path=null;
  try{
    if(plan){await loadXLSX();const wb=XLSX.read(await f.arrayBuffer(),{type:"array"});
      const texto=wb.SheetNames.map(n=>`### Planilha: ${n}\n`+XLSX.utils.sheet_to_csv(wb.Sheets[n],{FS:";",blankrows:false})).join("\n\n").slice(0,180000);
      body={tipo:"extrato",texto,nome:f.name}}
    else{path=`extratos/${ymNow}/${uuid()}-${safeName(f.name)}`;const up=await sb.storage.from(BUCKET).upload(path,f,{contentType:type,upsert:false});if(up.error)throw new Error("Não foi possível enviar o arquivo.");body={tipo:"extrato",path}}
    const {data,error}=await sb.functions.invoke("ler-documento",{body});
    if(error){let msg="";try{const j=await error.context.json();msg=j.erro||""}catch(_){}throw new Error(msg||"A leitura por IA ainda não foi configurada (README, passo 7).")}
    if(data&&data.erro)throw new Error(data.erro);
    if(S.ext!==E)return;E.dados=data.dados||{itens:[]};E.fase="pronto";
  }catch(err){if(S.ext!==E)return;E.fase="escolher";E.erro=err.message||"A IA não conseguiu ler este extrato."}
  finally{if(path)sb.storage.from(BUCKET).remove([path]).catch(()=>{})}
  if(S.ext===E&&!S.editing&&!S.dem)renderExtrato();
}
// abre o formulário de nova apólice com o que o extrato trouxe
function extLancar(i){
  const E=S.ext;const it=E&&E.dados&&(E.dados.itens||[])[i];if(!it)return;const X=E.dados;
  openPanel(null);const e=S.editing;const d=e.data;
  const raz=X.seguradora_razao_social||"",cn=normCnpj(X.seguradora_cnpj||"");
  const reg=(cn&&S.seguradoras.find(x=>x.cnpj===cn))||S.seguradoras.find(x=>raz&&key(raz).includes(key(x.nome)));
  d.apolice=it.apolice||"";d.seguradora=reg?reg.nome:(segNomes().find(n=>key(raz).includes(key(n)))||raz);
  d.tomador=it.tomador||"";d.tomador_cnpj=normCnpj(it.tomador_cnpj||"");if(it.comissao_pct!=null){d.comissao_pct=Number(it.comissao_pct);e.comAuto=false}
  const tot=Number(it.parcelas_total)||1;if(tot<=1&&it.premio!=null)d.premio=Number(it.premio);
  if(tot>1){d.parcelas_qtd=tot}d.lider="emissora";
  // mesma parceira e divisão das outras apólices deste tomador no extrato, se forem todas iguais
  const irmas=extLinhas().filter(x=>x.tipo==="ok"&&x.d.corretor&&it.tomador&&key(x.it.tomador||x.d.tomador)===key(it.tomador)).map(x=>x.d);
  const sug=irmas.length&&new Set(irmas.map(x=>corrKey(x)+"|"+x.repasse_pct)).size===1?irmas[0]:null;
  if(sug){d.corretor=sug.corretor;d.corretor_cnpj=sug.corretor_cnpj||"";d.corretor_susep=sug.corretor_susep||"";d.repasse_pct=Number(sug.repasse_pct);d.nivel=nivelDe(d.repasse_pct);d.valor_repasse=calcRepasse(d.premio,d.comissao_pct,d.repasse_pct,"emissora")}
  recalcParcelas(d);e.doExtrato=true;renderPanel();
  toast(sug?`Parceira e divisão sugeridas pelas outras apólices deste tomador (${nomeCurtoDem(sug.corretor)}, ${pctFmt(sug.repasse_pct)}). Confira e informe o vencimento.`:tot>1?"Complete o prêmio líquido total, o vencimento, a parceira e a divisão.":"Complete o vencimento, a parceira e a divisão da comissão.");
}

// ---------------- corretoras (nome + CNPJ) ----------------
// apólices (parcelas) de uma corretora da lista: pelo CNPJ, pelo código SUSEP ou pelo nome
function docsDaCorretora(x){const su=susepN(x.susep||""),k=key(x.nome);return S.docs.filter(d=>(x.cnpj&&d.corretor_cnpj===x.cnpj)||(!d.corretor_cnpj&&((su&&susepN(d.corretor_susep||"")===su)||(k&&key(d.corretor)===k))))}
function resumoCorretora(x){const l=docsDaCorretora(x);const ab=l.filter(d=>!d.pago);const sm=f=>Math.round(ab.filter(f).reduce((a,d)=>a+(Number(d.valor_repasse)||0),0)*100)/100;
  return {docs:l,apolices:new Set(l.map(d=>d.id)).size,pagar:sm(d=>dirDe(d)==="pagar"),receber:sm(d=>dirDe(d)==="receber"),atraso:ab.some(emAtraso)}}
const MAI=t=>String(t||"").toLocaleUpperCase("pt-BR");
function renderCorretoras(c){
  const q=key(S.cq);const qd=soDigitos(S.cq);
  const list=S.corretoras.filter(x=>!q||key(x.nome).includes(q)||(qd&&((x.cnpj||"").includes(qd)||soDigitos(x.susep||"").includes(qd)))).map(x=>({x,r:resumoCorretora(x)}))
    .sort((a,b)=>(b.r.pagar+b.r.receber)-(a.r.pagar+a.r.receber)||a.x.nome.localeCompare(b.x.nome));
  const ed=S.cEdit;const focusQ=document.activeElement&&document.activeElement.id==="cq";
  const editRow=(x)=>`<tr class="editing"><td colspan="6"><div class="ce-form">
      <div class="f"><label for="ceNome">Razão social</label><input id="ceNome" value="${esc(x?x.nome:"")}" placeholder="Nome da corretora"></div>
      <div class="f"><label for="ceCnpj">CNPJ</label><input id="ceCnpj" class="num" inputmode="numeric" value="${esc(x&&x.cnpj?fmtCnpj(x.cnpj):"")}" placeholder="00.000.000/0000-00"></div>
      <div class="f"><label for="ceSusep">Código SUSEP</label><input id="ceSusep" class="num" inputmode="numeric" value="${esc(x&&x.susep||"")}" placeholder="Só números"></div>
      <div class="ce-act"><button class="btn small ghost" data-action="cCancel">Cancelar</button><button class="btn small primary" data-action="cSave">Salvar</button></div></div></td></tr>`;
  c.innerHTML=`<div class="filters">
      <input id="cq" type="search" placeholder="Buscar por nome, CNPJ ou SUSEP…" value="${esc(S.cq)}" aria-label="Buscar corretora">
      <button class="btn primary" data-action="cNew">+ Nova corretora</button>
    </div>
    ${S.corretoras.length||ed?`<div class="tablebox"><table class="ctable cortab">
      <thead><tr><th>Corretora</th><th>CNPJ</th><th>SUSEP</th><th class="r">Apólices</th><th class="r">A pagar</th><th class="r">A receber</th><th class="r"></th></tr></thead>
      <tbody>${ed&&ed.id==="novo"?editRow(null):""}${list.map(({x,r})=>ed&&ed.id===x.id?editRow(x):ed&&ed.del===x.id
        ?`<tr><td colspan="6"><b>Excluir ${esc(MAI(x.nome))} da lista?</b> <span class="meta">As apólices já lançadas não mudam.</span></td><td class="r"><button class="btn small ghost" data-action="cCancel">Cancelar</button><button class="btn small danger" data-action="cDelOk" data-id="${esc(x.id)}">Excluir</button></td></tr>`
        :`<tr class="clic" data-action="cFicha" data-id="${esc(x.id)}" tabindex="0"><td class="c-nome">${esc(MAI(x.nome))}${r.atraso?' <span class="tag-atr">atraso</span>':""}</td>
          <td class="num">${x.cnpj?esc(fmtCnpj(x.cnpj)):'<span class="warn-txt">sem CNPJ</span>'}</td><td class="num">${esc(x.susep||"—")}</td><td class="r num">${r.apolices||"—"}</td>
          <td class="r num">${r.pagar?`<b class="dir out">${money(r.pagar)}</b>`:"—"}</td><td class="r num">${r.receber?`<b class="dir in">${money(r.receber)}</b>`:"—"}</td>
          <td class="r nowrap"><button class="btn small ghost" data-action="cEdit" data-id="${esc(x.id)}">Editar</button><button class="iconbtn" data-action="cDel" data-id="${esc(x.id)}" aria-label="Excluir ${esc(x.nome)}">✕</button></td></tr>`).join("")}</tbody>
      <tfoot><tr><td colspan="7">${list.length} de ${S.corretoras.length} corretora${S.corretoras.length!==1?"s":""} · A pagar e A receber somam o que está em aberto</td></tr></tfoot></table></div>`
    :`<div class="empty"><h3>Nenhuma corretora na lista</h3><p>As corretoras da planilha entram na próxima publicação. Corretoras digitadas ao lançar uma apólice também entram aqui.</p></div>`}`;
  if(focusQ){const i=$("cq");i.focus();i.setSelectionRange(i.value.length,i.value.length)}
  if(ed&&!ed.del&&$("ceNome"))$("ceNome").focus();
}
async function cSave(){
  const ed=S.cEdit;const nome=$("ceNome").value.trim();const cn=normCnpj($("ceCnpj").value);const su=susepN($("ceSusep").value)||null;
  if(!nome){toast("Informe a razão social.");return}
  if(cn&&!cnpjValido(cn)){toast("CNPJ inválido. Confira os números ou deixe em branco.");return}
  const dup=cn&&S.corretoras.find(x=>x.cnpj===cn&&x.id!==ed.id);
  if(dup){toast(`Este CNPJ já está na lista como "${dup.nome}".`);return}
  const dupS=su&&S.corretoras.find(x=>susepN(x.susep||"")===su&&x.id!==ed.id);
  if(dupS){toast(`Este código SUSEP já está na lista como "${dupS.nome}".`);return}
  const row={nome,cnpj:cn||null,susep:su};
  const r=ed.id==="novo"?await sb.from("corretoras").insert(row):await sb.from("corretoras").update(row).eq("id",ed.id);
  if(r.error){toast(errMsg(r.error));return}
  S.cEdit=null;toast(ed.id==="novo"?"Corretora incluída.":"Corretora atualizada.");load();
}
async function cDelete(id){const r=await sb.from("corretoras").delete().eq("id",id);if(r.error){toast(errMsg(r.error));return}S.cEdit=null;toast("Corretora excluída da lista.");load()}
// ficha da corretora: dados, saldo em aberto e apólices
function openFicha(id){S.ficha=id;renderFicha()}
function renderFicha(){
  const x=S.corretoras.find(c=>c.id===S.ficha);if(!x){S.ficha=null;$("panelRoot").innerHTML="";return}
  const r=resumoCorretora(x);const pag=r.docs.filter(d=>dirDe(d)==="pagar");
  const aps=[...new Map(r.docs.map(d=>[d.id,d])).values()].sort((a,b)=>String(b.data_emissao||"").localeCompare(String(a.data_emissao||"")));
  const linhaAp=a=>{const ps=r.docs.filter(d=>d.id===a.id).sort((p,q)=>p.parcela_num-q.parcela_num);const rec=dirDe(a)==="receber";const ab=ps.filter(d=>!d.pago);
    const prox=ab.map(d=>d.vencimento).filter(Boolean).sort()[0];const atr=ab.some(emAtraso);
    return `<li data-action="edit" data-id="${esc(a.id)}" tabindex="0"><i class="${rec?"in":"out"}${atr?" late":""}" aria-hidden="true">${!ab.length?"✓":rec?"↙":"↗"}</i>
      <div><b class="num">${esc(a.apolice||"s/ nº")}</b><small>${esc(a.tomador||"—")}</small><span class="fi-meta">${segTag(a.seguradora)}<span>${ps.length>1?`${ps.length-ab.length}/${ps.length} parcelas quitadas`:ab.length?"em aberto":"quitada"}${prox?` · próximo venc. ${esc(dateBR(prox))}`:""}</span></span></div>
      <span class="num fi-v ${rec?"in":"out"}">${money(ab.reduce((s,d)=>s+(Number(d.valor_repasse)||0),0)||ps.reduce((s,d)=>s+(Number(d.valor_repasse)||0),0))}</span></li>`};
  $("panelRoot").innerHTML=`<div class="scrim" data-action="fichaFechar"></div>
  <aside class="panel ficha" role="dialog" aria-modal="true" aria-labelledby="fiT">
    <div class="p-head"><h2 id="fiT">${esc(MAI(x.nome))}</h2><button class="iconbtn" data-action="fichaFechar" aria-label="Fechar">✕</button></div>
    <div class="p-body">
      <dl class="fi-dados"><div><dt>CNPJ</dt><dd class="num">${x.cnpj?esc(fmtCnpj(x.cnpj)):'<span class="warn-txt">não informado</span>'}</dd></div><div><dt>Código SUSEP</dt><dd class="num">${esc(x.susep||"—")}</dd></div><div><dt>Apólices</dt><dd class="num">${r.apolices}</dd></div></dl>
      <div class="cd-tot"><div class="out"><span>A pagar em aberto</span><b class="num">${money(r.pagar)}</b></div><div class="in"><span>A receber em aberto</span><b class="num">${money(r.receber)}</b></div></div>
      <div class="fi-acts"><button class="btn small" data-action="cEditFicha" data-id="${esc(x.id)}">Editar dados</button>${pag.length?`<button class="btn small" data-action="fichaDem">Demonstrativo</button>`:""}</div>
      <section><h3 class="fi-h">Apólices</h3>${aps.length?`<ul class="fi-list">${aps.map(linhaAp).join("")}</ul>`:'<p class="meta">Nenhuma apólice lançada com esta corretora.</p>'}</section>
    </div></aside>`;
}
// ----- seguradoras -----
function renderSeguradoras(c){
  const q=key(S.sq||"");const qd=soDigitos(S.sq||"");const usoS={};S.docs.forEach(d=>{if(d.seguradora){const k=key(d.seguradora);(usoS[k]=usoS[k]||new Set()).add(d.id)}});const uso=Object.fromEntries(Object.entries(usoS).map(([k,v])=>[k,v.size]));
  const reg=new Map(S.seguradoras.map(x=>[key(x.nome),x]));
  const nomes=segNomes().filter(n=>{const r=reg.get(key(n));return !q||key(n).includes(q)||(r&&key(r.razao_social).includes(q))||(qd.length>=3&&r&&(r.cnpj||"").includes(qd))});
  const ed=S.sEdit;const focusQ=document.activeElement&&document.activeElement.id==="sq";
  const editRow=(n)=>{const r=n?reg.get(key(n)):null;return `<tr class="editing"><td><input id="seNome" value="${esc(n||"")}" placeholder="Nome curto (ex.: Junto)" aria-label="Nome curto"></td>
    <td><input id="seRazao" value="${esc(r&&r.razao_social||"")}" placeholder="Razão social" aria-label="Razão social"></td>
    <td><input id="seCnpj" class="num" inputmode="numeric" value="${esc(r&&r.cnpj?fmtCnpj(r.cnpj):"")}" placeholder="00.000.000/0000-00" aria-label="CNPJ"></td>
    <td><input id="seCom" class="num" inputmode="decimal" value="${esc(r&&r.comissao_padrao!=null?numInput(r.comissao_padrao):"")}" placeholder="${numInput(COMISSAO_PADRAO)}" aria-label="Comissão padrão (%)" style="max-width:90px"></td>
    <td><div class="cor-pick" role="radiogroup" aria-label="Cor da etiqueta">${SEG_CORES.map((cn,i)=>{const atual=S.sEdit&&S.sEdit.cor!=null?S.sEdit.cor:(n?segCor(n):null);return `<button type="button" class="cor-sw seg-c${i}${atual===i?" on":""}" data-action="sCor" data-i="${i}" role="radio" aria-checked="${atual===i}" aria-label="${cn}" title="${cn}"></button>`}).join("")}</div></td><td></td>
    <td class="r"><button class="btn small ghost" data-action="sCancel">Cancelar</button><button class="btn small primary" data-action="sSave">Salvar</button></td></tr>`};
  c.innerHTML=`<div class="filters"><input id="sq" type="search" placeholder="Buscar por nome, razão social ou CNPJ…" value="${esc(S.sq||"")}" aria-label="Buscar seguradora"><button class="btn primary" data-action="sNew">+ Nova seguradora</button></div>
    <div class="tablebox"><table class="ctable stable"><thead><tr><th>Seguradora</th><th>Razão social</th><th>CNPJ</th><th>Comissão padrão</th><th>Etiqueta</th><th class="r">Apólices</th><th class="r"></th></tr></thead>
    <tbody>${ed&&ed.novo?editRow(""):""}${nomes.map(n=>{const k=key(n);const r=reg.get(k);
      if(ed&&ed.k===k&&!ed.del)return editRow(n);
      if(ed&&ed.del===k)return `<tr><td colspan="6"><b>Tirar ${esc(n)} da lista?</b> <span class="meta">${uso[k]?`As ${uso[k]} apólices já lançadas continuam com este nome.`:"Nenhuma apólice usa esta seguradora."}</span></td><td class="r"><button class="btn small ghost" data-action="sCancel">Cancelar</button><button class="btn small danger" data-action="sDelOk" data-k="${esc(k)}">Tirar da lista</button></td></tr>`;
      return `<tr><td><b class="sname">${esc(n)}</b>${r?"":' <span class="meta">(só nas apólices)</span>'}</td><td>${r&&r.razao_social?esc(r.razao_social):'<span class="meta">—</span>'}</td><td class="num">${r&&r.cnpj?esc(fmtCnpj(r.cnpj)):'<span class="meta">—</span>'}</td><td class="num">${r&&r.comissao_padrao!=null?pctFmt(r.comissao_padrao):`<span class="meta">${pctFmt(COMISSAO_PADRAO)} (geral)</span>`}</td><td><span class="seg-tag seg-c${segCor(n)}">${esc(n)}</span></td><td class="r num">${uso[k]||""}</td><td class="r"><button class="btn small ghost" data-action="sEdit" data-k="${esc(k)}">Editar</button><button class="iconbtn" data-action="sDel" data-k="${esc(k)}" aria-label="Tirar ${esc(n)} da lista">✕</button></td></tr>`}).join("")}</tbody>
    <tfoot><tr><td colspan="7">${nomes.length} seguradora${nomes.length!==1?"s":""} · seguradora nova entra sozinha ao lançar a apólice, com a razão social e o CNPJ lidos pela IA</td></tr></tfoot></table></div>`;
  if(focusQ){const i=$("sq");i.focus();i.setSelectionRange(i.value.length,i.value.length)}
  if(ed&&!ed.del&&$("seNome"))$("seNome").focus();
}
async function sSave(){
  const ed=S.sEdit;const nome=$("seNome").value.trim().replace(/\s+/g," ");const razao=$("seRazao").value.trim().replace(/\s+/g," ")||null;const cn=normCnpj($("seCnpj").value);
  if(!nome){toast("Informe o nome curto da seguradora.");return}
  if(cn&&!cnpjValido(cn)){toast("CNPJ inválido. Confira os números ou deixe em branco.");return}
  const k=key(nome);const antigo=ed.novo?null:segNomes().find(n=>key(n)===ed.k);
  if((ed.novo||k!==ed.k)&&segNomes().some(n=>key(n)===k)){toast(`"${nome}" já está na lista.`);return}
  const reg=ed.novo?null:S.seguradoras.find(x=>key(x.nome)===ed.k);
  if(cn){const dup=S.seguradoras.find(x=>x.cnpj===cn&&x!==reg);if(dup){toast(`Este CNPJ já está cadastrado para ${dup.nome}.`);return}}
  const comTxt=$("seCom").value.trim();const com=comTxt?parseBR(comTxt):null;
  if(comTxt&&(isNaN(com)||com<0||com>100)){toast("Comissão padrão inválida (use um número de 0 a 100).");return}
  const row={nome,razao_social:razao,cnpj:cn||null,comissao_padrao:com};if(ed.cor!=null)row.cor=String(ed.cor);
  let r=reg?await sb.from("seguradoras").update(row).eq("id",reg.id):await sb.from("seguradoras").insert(row);
  if(r.error){toast(errMsg(r.error));return}
  if(antigo&&antigo!==nome){const ids=S.docs.filter(d=>key(d.seguradora)===ed.k).map(d=>d.id);if(ids.length){const u=await sb.from("cocorretagens").update({seguradora:nome}).in("id",ids);if(u.error){toast(errMsg(u.error));return}}}
  S.sEdit=null;toast(ed.novo?"Seguradora incluída.":antigo!==nome?"Seguradora atualizada, inclusive nas apólices.":"Seguradora atualizada.");load();
}
async function sDelete(k){const reg=S.seguradoras.find(x=>key(x.nome)===k);if(reg){const r=await sb.from("seguradoras").delete().eq("id",reg.id);if(r.error){toast(errMsg(r.error));return}}S.sEdit=null;toast("Seguradora tirada da lista.");load()}

// ----- Excel (biblioteca carregada sob demanda) -----
function loadXLSX(){return window.XLSX?Promise.resolve():new Promise((ok,fail)=>{const sc=document.createElement("script");sc.src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";sc.onload=ok;sc.onerror=fail;document.head.appendChild(sc)})}


// ---------------- avisos por vencimento de parcela ----------------
// A comissão cai na conta da corretora líder ~1 dia depois do vencimento da parcela do prêmio.
// Avisamos no dia do vencimento e N dias depois (padrão 0 e 5), sempre em dia útil.
function addDias(iso,n){const d=new Date(String(iso).slice(0,10)+"T12:00:00");d.setDate(d.getDate()+n);return isoDay(d)}
function diaUtil(iso){const d=new Date(String(iso).slice(0,10)+"T12:00:00");const w=d.getDay();if(w===6)d.setDate(d.getDate()+2);else if(w===0)d.setDate(d.getDate()+1);return isoDay(d)}
function avisosCfg(){const c=S.cfgL||{};const dias=Array.isArray(c.avisos_dias)&&c.avisos_dias.length?c.avisos_dias.map(Number):[1,5];return {on:c.avisos_venc!==false,dias:[...new Set(dias)].sort((a,b)=>a-b)}}
function avisosDe(d){if(!d.vencimento||d.pago)return[];const c=avisosCfg();if(!c.on)return[];const v=String(d.vencimento).slice(0,10);
  return c.dias.map(n=>({d,n,data:diaUtil(addDias(v,n)),tipo:n===0?"vence":"confirma"}))}
function diaCurto(iso){const t=new Date(String(iso).slice(0,10)+"T12:00:00").toLocaleDateString("pt-BR",{weekday:"short",day:"2-digit",month:"short"}).replace(/\./g,"");return t.charAt(0).toUpperCase()+t.slice(1)}
function parceiraCurta(d){return tituloCaso(curtoDe(d.corretor||"a parceira"))}
function perguntaAviso(a){const d=a.d;const rec=dirDe(d)==="receber";const nome=parceiraCurta(d);
  if(a.tipo==="vence")return rec?`Vence hoje: ${nome} recebe a comissão e deve repassar à ${emisCurto()}`:`Vence hoje: a comissão cai amanhã; separe o repasse de ${nome}`;
  if(a.n<=1){const cai=addDias(String(d.vencimento).slice(0,10),1),hoje=isoDay(today);const q=cai===hoje?"a comissão cai hoje":cai>hoje?`a comissão cai em ${dateBR(cai).slice(0,5)}`:`a comissão caiu em ${dateBR(cai).slice(0,5)}`;
    return rec?`Cobrar ${nome}: ${q}`:`Pagar ${nome}: ${q}`}
  return rec?`Recebeu de ${nome}? Se não, cobre`:`Pagou ${nome}?`}
function todosAvisos(){return S.docs.flatMap(avisosDe)}
// perguntas em aberto: já passou a data de algum aviso "pagou/recebeu?" e a parcela não foi quitada
function aConfirmar(){const hoje=isoDay(today);const m=new Map();
  todosAvisos().forEach(a=>{if(a.tipo==="confirma"&&a.data<=hoje){const k=a.d.pid||a.d.id+":"+a.d.parcela_num;const x=m.get(k);if(!x||a.data>x.data)m.set(k,a)}});
  return [...m.values()].sort((a,b)=>String(a.d.vencimento).localeCompare(String(b.d.vencimento)))}

// ---------------- lembretes (e-mail e push) ----------------
const SEMANA=["domingo","segunda-feira","terça-feira","quarta-feira","quinta-feira","sexta-feira","sábado"];
function ultimoDia(a,m){return new Date(a,m,0).getDate()}
function diasEfetivos(a,m,cfg){const ult=ultimoDia(a,m);const out=new Set();
  for(const d of cfg.dias||[]){let alvo=Math.min(Math.max(1,d),ult);
    if(cfg.antecipar_fds){const ws=new Date(a,m-1,alvo).getDay();const aj=ws===6?alvo-1:ws===0?alvo-2:alvo;if(aj>=1)alvo=aj}
    out.add(alvo)}
  return [...out].sort((x,y)=>x-y)}
function diaRevisao(a,m,antecipar){let d=ultimoDia(a,m);if(antecipar){const ws=new Date(a,m-1,d).getDay();d=ws===6?d-1:ws===0?d-2:d}return d}
const hh=h=>String(h).padStart(2,"0")+"h";
function horasL(cfg){const h=Array.isArray(cfg.horas)&&cfg.horas.length?cfg.horas:[8,19];return [...new Set(h.map(Number))].sort((a,b)=>a-b)}
function proximosLembretes(cfg,n){const out=[];const agora=new Date();let a=agora.getFullYear(),m=agora.getMonth()+1;const H=horasL(cfg),hr=cfg.hora_relatorio??19;
  for(let i=0;i<14&&out.length<n;i++){const ult=ultimoDia(a,m);const l=[];
    const pen=cfg.pendencias_fim_mes!==false?ult-1:null;
    diasEfetivos(a,m,cfg).filter(d=>d!==pen).forEach(d=>H.forEach(h=>l.push({dt:new Date(a,m-1,d,h,0,0),tipo:"pend"})));
    if(pen)H.forEach(h=>l.push({dt:new Date(a,m-1,pen,h,0,0),tipo:"falta"}));
    if(cfg.relatorio_fim_mes!==false)l.push({dt:new Date(a,m-1,ult,hr,0,0),tipo:"rel"});
    l.sort((x,y)=>x.dt-y.dt).forEach(x=>{if(x.dt>agora&&out.length<n)out.push(x)});m++;if(m>12){m=1;a++}}
  return out}
const TIPO_LEMB={pend:"pendências do mês (se houver algo em aberto)",falta:"faltou alguma pendência?",rel:"baixe o relatório mensal"};
async function openLembretes(){
  const [{data:cfg,error},dst]=await Promise.all([painelEq(sb.from("config_lembretes").select("*")).maybeSingle(),painelEq(sb.from("destinatarios").select("*")).order("email")]);
  S.dest=dst&&!dst.error?dst.data||[]:null;
  if(error||!cfg){const b=$("lembBox");if(b)b.innerHTML=`<p class="meta">Não foi possível carregar os lembretes. Confira se o SQL do passo 2 foi rodado.</p>`;return}
  S.cfgL=cfg;
  S.lemb={cfg:{dias:[...(cfg.dias||[])],hora:cfg.hora,horas:horasL(cfg),antecipar_fds:cfg.antecipar_fds,atraso_dia_semana:null,avisar_nova_push:cfg.avisar_nova_push,
    pendencias_fim_mes:cfg.pendencias_fim_mes!==false,relatorio_fim_mes:cfg.relatorio_fim_mes!==false,hora_relatorio:cfg.hora_relatorio??19},
    quem:cfg.atualizado_por,quando:cfg.atualizado_em,saving:false,dirty:false};
  renderLembretes();renderDest();
}
function renderLembretes(){
  const L=S.lemb;const box=$("lembBox");if(!L||!box)return;const c=L.cfg;const p=S.push;
  const prox=proximosLembretes(c,5);
  const pushTxt=!CFG.VAPID_PUBLIC_KEY?"Push ainda não configurado (README, passo 6).":!p.supported?(isIOS()&&!isStandalone()?"No iPhone: Safari → Compartilhar → Adicionar à Tela de Início, e abra o app pelo ícone.":"Este navegador não aceita notificações."):p.on?"Ativas neste aparelho.":"Desligadas neste aparelho.";
  const selH=(id,ex,sel)=>`<select id="${id}" aria-label="Horário">${Array.from({length:18},(_,i)=>i+6).filter(h=>!ex.includes(h)).map(h=>`<option value="${h}"${h===sel?" selected":""}>${String(h).padStart(2,"0")}:00</option>`).join("")}</select>`;
  cfgResumo();box.innerHTML=`<div class="lemb-grid">
      <div class="lemb-col">
        <h4 class="cfg-h">Horários</h4><p class="meta cfg-p">Valem para as cobranças de cada boleto e para os lembretes do mês.</p>
        <div class="lemb-dias">${c.horas.map(h=>`<span class="av-chip">${String(h).padStart(2,"0")}:00${c.horas.length>1?`<button type="button" data-action="lembDelHora" data-h="${h}" aria-label="Tirar ${h}h">✕</button>`:""}</span>`).join("")}
          <span class="av-add">${selH("lHoraNova",c.horas,null)}<button type="button" class="btn small" data-action="lembAddHora">+ Horário</button></span></div>
        <h4 class="cfg-h" style="margin-top:16px">Fim do mês</h4>
        <label class="check"><input type="checkbox" id="lPen"${c.pendencias_fim_mes?" checked":""}> <span><b>Penúltimo dia</b>, nos horários acima: "Faltou alguma pendência?", com o que ainda está em aberto</span></label>
        <label class="check lemb-rel"><input type="checkbox" id="lRel"${c.relatorio_fim_mes?" checked":""}> <span><b>Último dia</b>, às ${selH("lHRel",[],c.hora_relatorio)}: "Baixe o relatório mensal"</span></label>
        <h4 class="cfg-h" style="margin-top:16px">Outros dias de pendências <span class="meta">(opcional)</span></h4><p class="meta cfg-p">Só avisa se houver algo em aberto.</p>
        <div class="lemb-dias">${[...c.dias].sort((a,b)=>a-b).map(d=>`<span class="av-chip">${d===31?"Último dia":"Dia "+d}<button type="button" data-action="toggleDay" data-d="${d}" aria-label="Tirar o dia ${d}">✕</button></span>`).join("")||'<span class="meta">Nenhum</span>'}
          <span class="av-add"><select id="lDiaNovo" aria-label="Incluir dia">${Array.from({length:31},(_,i)=>i+1).filter(d=>!c.dias.includes(d)).map(d=>`<option value="${d}">${d===31?"Último dia":"Dia "+d}</option>`).join("")}</select><button type="button" class="btn small" data-action="lembAddDay">+ Dia</button></span></div>
        ${c.dias.length?`<label class="check"><input type="checkbox" id="lFds"${c.antecipar_fds?" checked":""}> Se um desses dias cair no sábado ou domingo, lembrar na sexta anterior</label>`:""}
      </div>
      <div class="lemb-side">
        <div class="calc" style="flex-direction:column;gap:4px"><b style="font-family:var(--f-ui);font-weight:600">Próximos lembretes do mês</b>${prox.length?prox.map(x=>`<span>${esc(x.dt.toLocaleDateString("pt-BR",{weekday:"long",day:"2-digit",month:"long"}))} às ${hh(x.dt.getHours())} · ${TIPO_LEMB[x.tipo]}</span>`).join(""):"<span>Nenhum lembrete ligado.</span>"}</div>
        <p class="meta" style="margin:0">As cobranças de cada boleto (1 e 5 dias depois do vencimento) saem em cada horário até haver baixa. Se você der baixa de manhã, o aviso da noite não sai.</p>
      </div>
    </div>
    <div class="lemb-foot">${L.dirty?`<span class="meta">Alterações não salvas</span>`:""}<span class="spacer"></span>${L.dirty?`<button class="btn" data-action="closeLemb">Descartar</button>`:""}<button class="btn primary" data-action="saveLemb" id="lSave"${L.dirty?"":" disabled"}>Salvar lembretes</button></div>`;
}
function readLemb(){const L=S.lemb;if(!L||!$("lPen"))return;L.cfg.atraso_dia_semana=null;L.cfg.pendencias_fim_mes=$("lPen").checked;L.cfg.relatorio_fim_mes=$("lRel").checked;
  L.cfg.hora_relatorio=+$("lHRel").value;if($("lFds"))L.cfg.antecipar_fds=$("lFds").checked;L.cfg.avisar_nova_push=false;L.cfg.hora=L.cfg.horas[0]}
async function saveLemb(){
  const L=S.lemb;if(!L||L.saving)return;readLemb();
  if(!L.cfg.horas.length){toast("Escolha pelo menos um horário.");return}
  L.saving=true;const b=$("lSave");if(b){b.disabled=true;b.textContent="Salvando…"}
  const r1=await sb.from("config_lembretes").update({dias:[...L.cfg.dias].sort((a,b)=>a-b),hora:L.cfg.hora,horas:L.cfg.horas,antecipar_fds:L.cfg.antecipar_fds,atraso_dia_semana:L.cfg.atraso_dia_semana,avisar_nova_push:L.cfg.avisar_nova_push,pendencias_fim_mes:L.cfg.pendencias_fim_mes,relatorio_fim_mes:L.cfg.relatorio_fim_mes,hora_relatorio:L.cfg.hora_relatorio}).eq("emissora_id",S.emisId);
  const r2={error:null};
  L.saving=false;
  if(r1.error||r2.error){if(b){b.disabled=false;b.textContent="Salvar lembretes"}toast(errMsg(r1.error||r2.error));return}
  L.dirty=false;S.cfgL={...(S.cfgL||{}),...L.cfg};L.quem=S.me.email;L.quando=new Date().toISOString();renderLembretes();const prox=proximosLembretes(L.cfg,1)[0];
  toast(prox?`Lembretes salvos. Próximo: ${prox.dt.toLocaleDateString("pt-BR",{day:"2-digit",month:"short"})} às ${hh(prox.dt.getHours())}.`:"Lembretes salvos.");
}
async function lembTeste(){
  const b=$("lTesteBtn");if(b){b.disabled=true;b.textContent="Enviando…"}
  const {data,error}=await sb.functions.invoke("lembretes",{body:{tipo:"teste",emissora_id:S.emisId}});
  if(b){b.disabled=false;b.textContent="Enviar teste agora"}
  if(error){toast("A função de lembretes ainda não está publicada (README, passo 6).");return}
  const partes=[];if(data){if(data.email==="enviado")partes.push("e-mail enviado");else if(data.email)partes.push("e-mail: "+data.email);if(data.push)partes.push("push: "+data.push)}
  toast(partes.length?partes.join(" · "):"Teste enviado.");
}

// ----- destinatários do e-mail de lembrete -----
const TIPOS_AV=[["cobrancas","Cobranças das parcelas","1 e 5 dias depois do vencimento"],["pendencias","Faltou alguma pendência?","penúltimo dia do mês"],["relatorio","Relatório mensal","último dia do mês"]];
const TODOS_AV=TIPOS_AV.map(t=>t[0]);
function tiposDe(x,canal){const v=x[canal+"_tipos"];return Array.isArray(v)?v:(canal==="email"?(x.fechamento===false?[]:TODOS_AV):(x.push===false?[]:TODOS_AV))}
function renderDest(){
  const box=$("destBox");if(!box)return;
  if(S.dest==null){box.innerHTML=`<div class="cb-head"><h3>Quem recebe os avisos</h3></div><p class="meta">A lista aparece depois que o SQL atualizado for rodado (passo 2).</p>`;return}
  const equipe=new Set((S.equipe||[]).map(x=>x.email.toLowerCase()));const eu=String(S.me.email||"").toLowerCase();
  const d=[...S.dest].sort((a,b)=>(b.email.toLowerCase()===eu)-(a.email.toLowerCase()===eu)||String(a.nome||a.email).localeCompare(String(b.nome||b.email)));
  const pill=(x,canal,t,ok)=>{const on=tiposDe(x,canal).includes(t);return ok?`<button type="button" class="dpill${on?" on":""}" data-action="dTipo" data-email="${esc(x.email)}" data-canal="${canal}" data-t="${t}" aria-pressed="${on}">${canal==="email"?"E-mail":"Celular"}</button>`:`<span class="dpill off" title="Só quem tem acesso ao app instala no celular">Celular</span>`};
  box.innerHTML=`<div class="cb-head"><h3>Quem recebe os avisos</h3><span class="meta">Escolha, para cada pessoa, o que ela recebe por e-mail e no celular · pode incluir e-mails de fora da equipe, como o financeiro</span></div>
    <div class="dgrid">${d.map(x=>{const eq=equipe.has(x.email.toLowerCase());const me=x.email.toLowerCase()===eu;const nada=!tiposDe(x,"email").length&&!tiposDe(x,"push").length;
      return `<article class="dcard${me?" me":""}"><header><div><b>${esc(x.nome||x.email.split("@")[0])}</b>${me?' <span class="tag">você</span>':eq?' <span class="tag">equipe</span>':""}<small>${esc(x.email)}</small></div>
        <button class="iconbtn" data-action="dDel" data-email="${esc(x.email)}" aria-label="Tirar ${esc(x.email)} da lista">✕</button></header>
        ${TIPOS_AV.map(([t,l,q])=>`<div class="drow"><div><span>${l}</span><small>${q}</small></div><div class="dps">${pill(x,"email",t,true)}${pill(x,"push",t,eq)}</div></div>`).join("")}
        ${nada?`<p class="dnada">Não recebe nenhum aviso.</p>`:""}</article>`}).join("")||`<p class="meta">Ninguém na lista. Sem destinatários, o aviso vai para toda a equipe.</p>`}</div>
    <form id="destForm" class="dest-add"><input id="dNome" placeholder="Nome (opcional)" aria-label="Nome"><input id="dEmail" type="email" placeholder="email@empresa.com.br" aria-label="E-mail" required><button class="btn" type="submit">+ Adicionar</button></form>`;
}
async function destTipo(el){
  const x=S.dest.find(d=>d.email===el.dataset.email);if(!x)return;const canal=el.dataset.canal,t=el.dataset.t;
  const atual=tiposDe(x,canal);const novo=atual.includes(t)?atual.filter(v=>v!==t):TODOS_AV.filter(v=>v===t||atual.includes(v));
  const patch={[canal+"_tipos"]:novo,[canal==="email"?"fechamento":"push"]:novo.length>0};if(canal==="email")patch.atraso=novo.length>0;
  el.disabled=true;const {error}=await painelEq(sb.from("destinatarios").update(patch)).eq("email",x.email);
  if(error){el.disabled=false;toast(errMsg(error));return}
  Object.assign(x,patch);renderDest();
}
async function destAdd(){
  const email=$("dEmail").value.trim().toLowerCase();const nome=$("dNome").value.trim()||null;
  if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)){toast("Confira o e-mail.");return}
  if(S.dest.some(x=>x.email===email)){toast("Este e-mail já está na lista.");return}
  const {error}=await sb.from("destinatarios").insert({emissora_id:S.emisId,email,nome,fechamento:true,atraso:true});
  if(error){toast(errMsg(error));return}
  S.dest.push({email,nome,fechamento:true,atraso:true});S.dest.sort((a,b)=>a.email.localeCompare(b.email));renderDest();toast("E-mail incluído nos lembretes.");
}
async function destToggle(el){
  const x=S.dest.find(d=>d.email===el.dataset.email);if(!x)return;const f=el.dataset.f;const v=el.checked;
  const patch=f==="fechamento"?{fechamento:v,atraso:v}:{[f]:v};const {error}=await painelEq(sb.from("destinatarios").update(patch)).eq("email",x.email);
  if(error){el.checked=!v;toast(errMsg(error));return}
  x[f]=v;renderDest();
}
async function destDel(email){
  const {error}=await painelEq(sb.from("destinatarios").delete()).eq("email",email);
  if(error){toast(errMsg(error));return}
  S.dest=S.dest.filter(x=>x.email!==email);renderDest();toast("E-mail tirado dos lembretes.");
}

// ----- painéis em Configurações -----
function painelSection(){
  const adm=S.me.admin;const ed=S.pEdit;
  const grpEd=()=>{const G=ed.grupo||[];return `<tr class="editing grp"><td colspan="4"><div class="grp-box"><b>Corretoras do mesmo grupo</b><span class="meta">Mesmo dono e mesmo propósito: quando uma delas aparece na apólice, o app trata como se fosse esta emissora.</span>
      ${G.map((g,i)=>`<div class="grp-row"><input data-gi="${i}" data-gf="nome" value="${esc(g.nome||"")}" placeholder="Razão social" aria-label="Razão social"><input data-gi="${i}" data-gf="cnpj" class="num" inputmode="numeric" value="${esc(g.cnpj?fmtCnpj(g.cnpj):"")}" placeholder="CNPJ" aria-label="CNPJ"><input data-gi="${i}" data-gf="susep" class="num" inputmode="numeric" value="${esc(g.susep||"")}" placeholder="SUSEP" aria-label="SUSEP"><button class="iconbtn" data-action="gDel" data-i="${i}" aria-label="Tirar do grupo">✕</button></div>`).join("")}
      <button class="btn small" data-action="gAdd">+ Corretora do grupo</button></div></td></tr>`};
  const form=(e)=>`<tr class="editing"><td><input id="peNome" value="${esc(e?e.nome:"")}" placeholder="Razão social da corretora emissora" aria-label="Razão social"></td><td><input id="peCnpj" class="num" inputmode="numeric" value="${esc(e&&e.cnpj?fmtCnpj(e.cnpj):"")}" placeholder="00.000.000/0000-00" aria-label="CNPJ"></td><td><input id="peSusep" class="num" inputmode="numeric" value="${esc(e&&e.susep||"")}" placeholder="SUSEP" aria-label="SUSEP"></td>
    <td class="r"><button class="btn small ghost" data-action="pCancel">Cancelar</button><button class="btn small primary" data-action="pSave">Salvar</button></td></tr>${grpEd()}`;
  const grpTxt=e=>Array.isArray(e.grupo)&&e.grupo.length?`<div class="sub">Mesmo grupo: ${e.grupo.map(g=>esc(g.nome)+(g.susep?` <span class="num">(SUSEP ${esc(g.susep)})</span>`:"")).join(", ")}</div>`:"";
  return `<div class="cb-head"><h3>Corretora emissora e grupo</h3><span class="meta">A CS emite as apólices; a Nosso Porto é do mesmo dono e conta como a mesma corretora. Em Editar dá para corrigir razão social, CNPJ e SUSEP e incluir ou tirar corretoras do grupo.</span></div>
    <div class="tablebox"><table class="ctable"><thead><tr><th>Corretora emissora</th><th>CNPJ</th><th>SUSEP</th><th class="r"></th></tr></thead><tbody>
    ${S.emissoras.map(e=>ed&&ed.id===e.id?form(e):`<tr><td><b>${esc(e.nome)}</b>${grpTxt(e)}</td><td class="num">${e.cnpj?esc(fmtCnpj(e.cnpj)):'<span class="meta">—</span>'}</td><td class="num">${e.susep?esc(e.susep):'<span class="meta">—</span>'}</td>
        <td class="r">${S.emissoras.length>1&&e.id!==S.emisId?`<button class="btn small ghost" data-action="emisPick" data-id="${esc(e.id)}">Abrir</button>`:""}${adm?`<button class="btn small ghost" data-action="pEdit" data-id="${esc(e.id)}">Editar</button>`:""}</td></tr>`).join("")}
    </tbody></table></div>`;
}
function renderPaineis(){const b=$("paineis");if(b){b.innerHTML=painelSection();const i=$("peNome");if(i&&!(S.pEdit&&S.pEdit.keepFocus))i.focus();if(S.pEdit)S.pEdit.keepFocus=false}}
function lerGrupo(){const ed=S.pEdit;if(!ed||!ed.grupo)return;document.querySelectorAll("[data-gi]").forEach(el=>{const g=ed.grupo[+el.dataset.gi];if(g)g[el.dataset.gf]=el.value.trim()})}
async function pSave(){
  const ed=S.pEdit;lerGrupo();const nome=$("peNome").value.trim().replace(/\s+/g," ");const cn=normCnpj($("peCnpj").value);const su=soDigitos($("peSusep").value).replace(/^0+/,"");
  if(!nome){toast("Informe a razão social da corretora emissora.");return}
  if(cn&&!cnpjValido(cn)){toast("CNPJ inválido. Confira os números.");return}
  if(cn&&S.emissoras.some(e=>e.cnpj===cn&&e.id!==ed.id)){toast("Este CNPJ já está em uso.");return}
  const grupo=[];for(const g of ed.grupo||[]){const gn=String(g.nome||"").trim().replace(/\s+/g," ");const gc=normCnpj(g.cnpj);const gs=soDigitos(g.susep).replace(/^0+/,"");
    if(!gn&&!gc&&!gs)continue;if(!gn){toast("Informe a razão social de cada corretora do grupo.");return}
    if(gc&&!cnpjValido(gc)){toast(`CNPJ inválido em ${gn}.`);return}grupo.push({nome:gn,cnpj:gc||null,susep:gs||null})}
  const row={nome,cnpj:cn||null,susep:su||null,grupo};
  const r=await sb.from("emissoras").update(row).eq("id",ed.id);
  if(r.error){toast(errMsg(r.error));return}
  S.pEdit=null;await carregarEmissoras();renderEmisCard();renderPaineis();render();
  toast("Dados da corretora emissora atualizados.");
}

// ---------------- configurações: usuários e acessos ----------------
async function chamarUsuarios(body){
  const {data,error}=await sb.functions.invoke("usuarios",{body});
  if(error){let msg="";try{const j=await error.context.json();msg=j.erro||""}catch(_){}
    throw new Error(msg||"A função de usuários ainda não foi publicada (README, passo 6.3).")}
  if(data&&data.erro)throw new Error(data.erro);
  return data;
}
async function loadUsuarios(){
  S.cfgU=S.cfgU||{form:null,row:null};S.cfgU.loading=true;S.cfgU.erro=null;
  try{const r=await chamarUsuarios({acao:"listar"});S.cfgU.users=r.usuarios||[]}
  catch(e){S.cfgU.erro=e.message;S.cfgU.users=(S.equipe||[]).map(x=>({...x,tem_login:null,ultimo_acesso:null}))}
  S.cfgU.loading=false;if(S.page==="configuracoes")renderConfig($("page"));
}
function senhaAleatoria(){const ch="ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";const a=new Uint32Array(10);crypto.getRandomValues(a);return [...a].map(n=>ch[n%ch.length]).join("")+"!"+(10+a[0]%90)}
function renderConfig(P){
  const U=S.cfgU||{users:[],loading:true};const me=S.me;const adm=me.admin;
  const users=U.users||[];const f=U.form;const row=U.row||{};
  P.innerHTML=`<div class="notif">
    <section class="cardbox"><div class="cb-head"><h3>Minha conta</h3></div>
      <div class="acct"><span class="avatar lg">${esc(iniciais(me.nome))}</span><div><b>${esc(me.nome)}</b><div class="meta">${esc(me.email)} · ${adm?"Administrador":"Usuário"}</div></div>
      <span class="spacer"></span><button class="btn" data-action="changePass">Trocar minha senha</button></div></section>
    <section class="cardbox"><div class="cb-head"><h3>Usuários com acesso</h3><span class="meta">${adm?"Como administrador, você inclui pessoas, redefine senhas e exclui contas.":"Só administradores alteram esta lista."}</span>
      ${adm&&!f?`<span class="spacer"></span><button class="btn primary" data-action="uNew">+ Novo usuário</button>`:""}</div>
      ${U.erro?`<p class="msg err" style="margin:0 0 12px">${esc(U.erro)}</p>`:""}
      ${f?`<form id="uForm" class="uform">
        <div class="f"><label for="uNome">Nome</label><input id="uNome" value="${esc(f.nome||"")}" required></div>
        <div class="f"><label for="uEmail">E-mail</label><input id="uEmail" type="email" value="${esc(f.email||"")}" required></div>
        <div class="f full umodo" role="radiogroup" aria-label="Como a pessoa entra"><label class="check"><input type="radio" name="uModo" value="convite"${f.modo!=="senha"?" checked":""}> Enviar convite por e-mail: a pessoa recebe o link e cria a própria senha</label><label class="check"><input type="radio" name="uModo" value="senha"${f.modo==="senha"?" checked":""}> Definir uma senha inicial e enviar eu mesmo</label></div>
        ${f.modo==="senha"?`<div class="f full"><label for="uSenha">Senha inicial</label><div class="pw"><input id="uSenha" class="num" type="${f.show?"text":"password"}" value="${esc(f.senha||"")}" minlength="8" required autocomplete="new-password"><button type="button" class="btn small" data-action="uShow">${f.show?"Ocultar":"Mostrar"}</button><button type="button" class="btn small" data-action="uGen">Gerar senha</button></div><span class="hint">Pelo menos 8 caracteres. A pessoa pode trocar depois, em Configurações.</span></div>`:""}
        <label class="check"><input type="checkbox" id="uAdmin"${f.admin?" checked":""}> Administrador (pode incluir e excluir pessoas e redefinir senhas)</label>
        <label class="check"><input type="checkbox" id="uRecebe"${f.recebe!==false?" checked":""}> Receber os avisos de pagar e receber (e-mail e celular)</label>
        <div class="uform-foot"><span class="spacer"></span><button type="button" class="btn" data-action="uCancel">Cancelar</button><button type="submit" class="btn primary" id="uGo">Criar acesso</button></div>
      </form>`:""}
      ${U.criado&&U.criado.convite?`<div class="msg ok created"><div><b>Convite enviado para ${esc(U.criado.email)}.</b> A pessoa recebe o e-mail com o link para criar a senha (vale 24 horas). Se não chegar, use <b>Senha → Enviar link</b> na linha dela.</div><button class="iconbtn" data-action="uOk" aria-label="Fechar aviso">✕</button></div>`
        :U.criado?`<div class="msg ok created"><div><b>Acesso criado para ${esc(U.criado.email)}.</b>${U.criado.aviso?` ${esc(U.criado.aviso)}`:""} Envie a senha para a pessoa: <span class="num pwshow">${esc(U.criado.senha)}</span></div><button class="btn small" data-action="uCopy">Copiar</button><button class="iconbtn" data-action="uOk" aria-label="Fechar aviso">✕</button></div>`:""}
      ${U.loading?`<p class="loading">Carregando usuários…</p>`:`<div class="tablebox"><table class="ctable utable"><thead><tr><th>Nome</th><th>E-mail</th><th>Perfil</th><th>Último acesso</th><th class="r"></th></tr></thead><tbody>
      ${users.map(u=>{const em=u.email.toLowerCase();const isMe=em===me.email;const open=row.email===em;
        const line=`<tr${open?' class="editing"':""}><td>${esc(u.nome)}${isMe?' <span class="tag">você</span>':""}</td><td class="mail">${esc(u.email)}</td>
          <td><span class="chip ${u.admin?"s-apagar":"s-aguardando"}">${u.admin?"Administrador":"Usuário"}</span></td>
          <td class="meta">${u.tem_login===false?"sem login criado":u.ultimo_acesso?esc(dtBR(u.ultimo_acesso)):u.tem_login===null?"—":"nunca entrou"}</td>
          <td class="r">${adm?`<button class="btn small ghost" data-action="uEditRow" data-email="${esc(em)}">Editar</button><button class="btn small ghost" data-action="uSenhaRow" data-email="${esc(em)}">Senha</button><button class="btn small ghost" data-action="${isMe&&u.admin?"uSelfDemote":"uAdminToggle"}" data-email="${esc(em)}" data-v="${u.admin?"0":"1"}">${u.admin?"Tirar admin":"Tornar admin"}</button>${isMe?"":`<button class="btn small ghost danger-txt" data-action="uDelRow" data-email="${esc(em)}">Excluir</button>`}`:""}</td></tr>`;
        let extra="";
        if(open&&row.mode==="senha")extra=`<tr class="editing"><td colspan="5"><div class="uinline">
          <div class="f"><label for="uNova">Nova senha para ${esc(u.nome)}</label><div class="pw"><input id="uNova" class="num" type="text" value="${esc(row.senha||"")}" minlength="8" autocomplete="new-password"><button type="button" class="btn small" data-action="uGenRow">Gerar</button><button type="button" class="btn small primary" data-action="uSetPass" data-email="${esc(em)}">Definir senha</button></div></div>
          <div class="or">ou</div>
          <div><button type="button" class="btn small" data-action="uSendLink" data-email="${esc(em)}">Enviar link de redefinição por e-mail</button><div class="hint">A própria pessoa escolhe a senha nova.</div></div>
          <button type="button" class="iconbtn" data-action="uRowClose" aria-label="Fechar">✕</button></div></td></tr>`;
        if(open&&row.mode==="editar")extra=`<tr class="editing"><td colspan="5"><div class="uinline">
          <div class="f"><label for="ueNome">Nome</label><input id="ueNome" value="${esc(u.nome)}"></div>
          <div class="f"><label for="ueEmail">E-mail</label><input id="ueEmail" type="email" value="${esc(u.email)}"${isMe?' disabled title="Para trocar o seu e-mail, peça a outro administrador"':""}></div>
          <div class="f" style="flex:0 1 200px"><label for="uePerfil">Perfil</label><select id="uePerfil"><option value="0"${u.admin?"":" selected"}>Usuário</option><option value="1"${u.admin?" selected":""}>Administrador</option></select></div>
          <div style="display:flex;gap:6px"><button class="btn small ghost" data-action="uRowClose">Cancelar</button><button class="btn small primary" data-action="uEditSave" data-email="${esc(em)}">Salvar</button></div></div>
          ${isMe?`<p class="hint" style="margin:6px 0 0">Para trocar o seu próprio e-mail, peça a outro administrador.${u.admin?" Se você tirar o seu administrador, perde o acesso a esta área.":""}</p>`:`<p class="hint" style="margin:6px 0 0">Ao trocar o e-mail, a pessoa passa a entrar com o e-mail novo e a mesma senha.</p>`}</td></tr>`;
        if(open&&row.mode==="autoadmin")extra=`<tr class="editing"><td colspan="5"><div class="uinline"><div><b>Tirar o seu próprio administrador?</b><div class="meta">Você continua usando o sistema, mas deixa de gerenciar pessoas. Só outro administrador poderá devolver.</div></div><span class="spacer"></span><button class="btn small ghost" data-action="uRowClose">Cancelar</button><button class="btn small danger" data-action="uAdminToggle" data-email="${esc(em)}" data-v="0">Tirar meu admin</button></div></td></tr>`;
        if(open&&row.mode==="excluir")extra=`<tr class="editing"><td colspan="5"><div class="uinline"><div><b>Excluir a conta de ${esc(u.nome)}?</b><div class="meta">A pessoa perde o acesso na hora. Os lançamentos que ela fez continuam no sistema.</div></div><span class="spacer"></span><button class="btn small ghost" data-action="uRowClose">Cancelar</button><button class="btn small danger" data-action="uDelOk" data-email="${esc(em)}">Excluir conta</button></div></td></tr>`;
        return line+extra}).join("")}</tbody></table></div>`}
    </section>
    <section class="cardbox" id="paineis">${painelSection()}</section>
  </div>`;
}
function readUForm(){const f=S.cfgU.form;if(!f||!$("uNome"))return f;f.nome=$("uNome").value;f.email=$("uEmail").value;const m=document.querySelector("input[name=uModo]:checked");if(m)f.modo=m.value;if($("uSenha"))f.senha=$("uSenha").value;f.admin=$("uAdmin").checked;f.recebe=$("uRecebe").checked;return f}
async function uCriar(){
  const f=readUForm();const b=$("uGo");
  if(!f.nome.trim()||!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email.trim())){toast("Preencha nome e um e-mail válido.");return}
  const conv=f.modo!=="senha";
  if(!conv&&(f.senha||"").length<8){toast("A senha precisa ter pelo menos 8 caracteres.");return}
  b.disabled=true;b.textContent=conv?"Enviando convite…":"Criando…";
  try{const r=await chamarUsuarios({acao:"criar",nome:f.nome.trim(),email:f.email.trim().toLowerCase(),convite:conv,senha:conv?undefined:f.senha,admin:!!f.admin,recebe_email:f.recebe!==false});
    if(conv&&r&&r.convite===false){toast(r.aviso||"O convite não pôde ser enviado.");S.cfgU.form=null;S.cfgU.row={email:f.email.trim().toLowerCase(),mode:"senha",senha:senhaAleatoria()};await refreshEquipe();loadUsuarios();return}
    S.cfgU.criado=conv?{email:f.email.trim().toLowerCase(),convite:true}:{email:f.email.trim().toLowerCase(),senha:f.senha};S.cfgU.form=null;toast("Acesso criado.");await refreshEquipe();loadUsuarios()}
  catch(e){b.disabled=false;b.textContent="Criar acesso";toast(e.message)}
}
async function refreshEquipe(){const {data}=await sb.from("autorizados").select("*");if(data){S.equipe=data;S.nomes=Object.fromEntries(data.map(r=>[r.email.toLowerCase(),r.nome]))}}
async function uAcao(body,okMsg){try{await chamarUsuarios(body);toast(okMsg);S.cfgU.row=null;await refreshEquipe();
  const eu=(S.equipe||[]).find(x=>x.email.toLowerCase()===S.me.email);if(eu){S.me.nome=eu.nome;S.me.admin=!!eu.admin}
  loadUsuarios();renderMenu()}catch(e){toast(e.message);const b=document.querySelector("[data-action=uEditSave]");if(b)b.disabled=false}}

// ---------------- notificações push ----------------
function isIOS(){return /iphone|ipad|ipod/i.test(navigator.userAgent)}
function isStandalone(){return window.matchMedia("(display-mode: standalone)").matches||navigator.standalone===true}
function b64ToBytes(s){const p="=".repeat((4-s.length%4)%4);const b=atob((s+p).replace(/-/g,"+").replace(/_/g,"/"));return Uint8Array.from(b,c=>c.charCodeAt(0))}
async function initPush(){
  if(!CFG.VAPID_PUBLIC_KEY||!("serviceWorker" in navigator)||!("PushManager" in window)||!("Notification" in window)){render();return}
  try{const reg=await navigator.serviceWorker.register("sw.js");S.push.reg=reg;S.push.supported=true;
    const sub=await reg.pushManager.getSubscription();S.push.on=!!sub&&Notification.permission==="granted";
  }catch(_){S.push.supported=false}
  render();
}
async function pushOn(){
  S.push.busy=true;render();
  try{
    const perm=await Notification.requestPermission();
    if(perm!=="granted"){toast("As notificações foram bloqueadas. Libere nas configurações do navegador.");return}
    const sub=await S.push.reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:b64ToBytes(CFG.VAPID_PUBLIC_KEY)});
    const j=sub.toJSON();
    const {error}=await sb.from("push_inscricoes").upsert({endpoint:j.endpoint,p256dh:j.keys.p256dh,auth:j.keys.auth,aparelho:navigator.userAgent.slice(0,180)},{onConflict:"endpoint"});
    if(error)throw error;
    S.push.on=true;toast("Notificações ativadas neste aparelho.");
  }catch(err){console.error(err);toast("Não foi possível ativar as notificações.")}
  finally{S.push.busy=false;render();if(S.lemb){readLemb();renderLembretes()}renderDevice()}
}
async function pushOff(){
  try{const sub=await S.push.reg.pushManager.getSubscription();if(sub){await sb.from("push_inscricoes").delete().eq("endpoint",sub.endpoint);await sub.unsubscribe()}
    S.push.on=false;toast("Notificações desativadas neste aparelho.")}catch(_){toast("Não foi possível desativar agora.")}
  render();if(S.lemb){readLemb();renderLembretes()}renderDevice()
}
async function pushTest(){
  const {data,error}=await sb.functions.invoke("lembretes",{body:{tipo:"teste",emissora_id:S.emisId}});
  if(error){toast("A função de notificações ainda não está publicada.");return}
  toast(data&&data.enviados?"Notificação enviada. Deve chegar em instantes.":"Nenhum aparelho seu está inscrito. Ative as notificações de novo.");
}

// ---------------- eventos ----------------
document.addEventListener("submit",async ev=>{
  const f=ev.target;ev.preventDefault();
  if(f.id==="loginForm"){
    const b=$("lgBtn");b.disabled=true;b.textContent="Entrando…";
    const {error}=await sb.auth.signInWithPassword({email:$("lgEmail").value.trim(),password:$("lgPass").value});
    if(error)viewLogin(/invalid/i.test(error.message)?"E-mail ou senha incorretos.":/confirm/i.test(error.message)?"Confirme seu e-mail pelo link que recebeu antes de entrar.":"Não foi possível entrar agora. Tente de novo.");
  }else if(f.id==="forgotForm"){
    const {error}=await sb.auth.resetPasswordForEmail($("fgEmail").value.trim(),{redirectTo:location.origin+location.pathname});
    viewForgot(error?"Não foi possível enviar agora. Tente em alguns minutos.":"Se o e-mail estiver cadastrado, o link chega em instantes. Confira também o spam.",error?"err":"ok");
  }else if(f.id==="newPassForm"){
    const p1=$("np1").value,p2=$("np2").value;
    if(p1.length<8)return viewNewPass("A senha precisa ter pelo menos 8 caracteres.");
    if(p1!==p2)return viewNewPass("As duas senhas não são iguais.");
    const {error}=await sb.auth.updateUser({password:p1});
    if(error)return viewNewPass("Não foi possível salvar a senha. Peça um novo link.");
    S.view="boot";toast("Senha atualizada.");const {data}=await sb.auth.getSession();onSession(data.session);
  }else if(f.id==="pform"){save()}
  else if(f.id==="destForm"){destAdd()}
  else if(f.id==="uForm"){uCriar()}
});
document.addEventListener("click",ev=>{
  if(S.menuOpen&&!ev.target.closest("#userMenu")){S.menuOpen=false;renderMenu()}
  if(S.emisMenu&&!ev.target.closest("#emisCard")){S.emisMenu=false;renderEmisCard()}
  const t=ev.target.closest("[data-action],[data-tab],[data-ctab]");if(!t)return;
  if(t.dataset.tab){S.tab=t.dataset.tab;S.confirming=null;render();return}
  if(t.dataset.ctab){S.ctab=t.dataset.ctab;S.cEdit=null;S.sEdit=null;render();return}
  const a=t.dataset.action;
  switch(a){
    case "forgot":viewForgot();break;
    case "toLogin":viewLogin();break;
    case "logout":S.menuOpen=false;sb.auth.signOut();break;
    case "cancelPass":S.view="boot";onSession(S.session);break;
    case "sNew":S.sEdit={novo:true};renderSeguradoras($("content"));break;
    case "sEdit":S.sEdit={k:t.dataset.k};renderSeguradoras($("content"));break;
    case "sCor":{if(!S.sEdit)break;S.sEdit.cor=+t.dataset.i;document.querySelectorAll(".cor-sw").forEach(b=>{const on=+b.dataset.i===S.sEdit.cor;b.classList.toggle("on",on);b.setAttribute("aria-checked",on)});break}
    case "sDel":S.sEdit={del:t.dataset.k};renderSeguradoras($("content"));break;
    case "sDelOk":sDelete(t.dataset.k);break;
    case "sCancel":S.sEdit=null;renderSeguradoras($("content"));break;
    case "sSave":sSave();break;
    case "cNew":S.cEdit={id:"novo"};renderCorretoras($("content"));break;
    case "cEdit":S.cEdit={id:t.dataset.id};renderCorretoras($("content"));break;
    case "cDel":S.cEdit={del:t.dataset.id};renderCorretoras($("content"));break;
    case "cDelOk":cDelete(t.dataset.id);break;
    case "cCancel":S.cEdit=null;renderCorretoras($("content"));break;
    case "cSave":cSave();break;
    case "cFicha":openFicha(t.dataset.id);break;
    case "fichaFechar":S.ficha=null;$("panelRoot").innerHTML="";break;
    case "cEditFicha":S.ficha=null;$("panelRoot").innerHTML="";S.cEdit={id:t.dataset.id};go("corretoras");break;
    case "fichaDem":{const x=S.corretoras.find(c=>c.id===S.ficha);if(x){const l=resumoCorretora(x).docs.filter(d=>dirDe(d)==="pagar"&&!d.pago);openDem(l.length?l:resumoCorretora(x).docs,{titulo:"Parcelas em aberto",voltar:"ficha"})}break}
    case "toNotif":S.menuOpen=false;go("notificacoes");break;
    case "repOpen":S.rep.open=S.rep.open===t.dataset.k?null:t.dataset.k;render();break;
    case "repXlsx":case "relXlsx":relXlsx(t);break;
    case "relPdf":relPdf(t);break;
    case "emisMenu":S.emisMenu=!S.emisMenu;renderEmisCard();break;
    case "emisPick":trocarPainel(t.dataset.id);break;
    case "pEdit":{const em=S.emissoras.find(x=>x.id===t.dataset.id);S.pEdit={id:t.dataset.id,grupo:JSON.parse(JSON.stringify(em&&Array.isArray(em.grupo)?em.grupo:[]))};renderPaineis();break}
    case "gAdd":{lerGrupo();const ed=S.pEdit;if(!ed)break;const vals=[$("peNome").value,$("peCnpj").value,$("peSusep").value];ed.grupo.push({nome:"",cnpj:"",susep:""});ed.keepFocus=true;renderPaineis();$("peNome").value=vals[0];$("peCnpj").value=vals[1];$("peSusep").value=vals[2];const x=document.querySelector(`[data-gi="${ed.grupo.length-1}"][data-gf="nome"]`);if(x)x.focus();break}
    case "gDel":{lerGrupo();const ed=S.pEdit;if(!ed)break;const vals=[$("peNome").value,$("peCnpj").value,$("peSusep").value];ed.grupo.splice(+t.dataset.i,1);ed.keepFocus=true;renderPaineis();$("peNome").value=vals[0];$("peCnpj").value=vals[1];$("peSusep").value=vals[2];break}
    case "pCancel":S.pEdit=null;renderPaineis();break;
    case "pSave":pSave();break;
    case "toConfig":S.menuOpen=false;go("configuracoes");break;
    case "dDel":destDel(t.dataset.email);break;
    case "dTipo":destTipo(t);break;
    case "uNew":S.cfgU.form={senha:senhaAleatoria(),show:true,recebe:true};S.cfgU.criado=null;renderConfig($("page"));$("uNome").focus();break;
    case "uCancel":S.cfgU.form=null;renderConfig($("page"));break;
    case "uShow":readUForm();S.cfgU.form.show=!S.cfgU.form.show;renderConfig($("page"));break;
    case "uGen":readUForm();S.cfgU.form.senha=senhaAleatoria();S.cfgU.form.show=true;renderConfig($("page"));break;
    case "uCopy":navigator.clipboard.writeText(S.cfgU.criado.senha).then(()=>toast("Senha copiada."),()=>toast("Selecione a senha e copie."));break;
    case "uOk":S.cfgU.criado=null;renderConfig($("page"));break;
    case "uSenhaRow":S.cfgU.row={email:t.dataset.email,mode:"senha",senha:senhaAleatoria()};renderConfig($("page"));break;
    case "uSelfDemote":S.cfgU.row={email:t.dataset.email,mode:"autoadmin"};renderConfig($("page"));break;
    case "uEditRow":S.cfgU.row={email:t.dataset.email,mode:"editar"};renderConfig($("page"));$("ueNome").focus();break;
    case "uEditSave":{const em=t.dataset.email;const nome=$("ueNome").value.trim();const novo=$("ueEmail").value.trim().toLowerCase();const admin=$("uePerfil").value==="1";
      if(!nome){toast("Informe o nome.");break}
      if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(novo)){toast("Confira o e-mail.");break}
      t.disabled=true;uAcao({acao:"alterar",email:em,nome,admin,novo_email:novo!==em?novo:undefined},"Dados atualizados.").then(()=>{if(em===S.me.email){S.me.nome=nome;S.me.admin=admin;render()}});break}
    case "uDelRow":S.cfgU.row={email:t.dataset.email,mode:"excluir"};renderConfig($("page"));break;
    case "uRowClose":S.cfgU.row=null;renderConfig($("page"));break;
    case "uGenRow":S.cfgU.row.senha=senhaAleatoria();renderConfig($("page"));break;
    case "uSetPass":{const v=$("uNova").value;if(v.length<8){toast("A senha precisa ter pelo menos 8 caracteres.");break}
      const em=t.dataset.email;try{navigator.clipboard.writeText(v).catch(()=>{})}catch(_){};uAcao({acao:"definir_senha",email:em,senha:v},`Senha de ${nomeDe(em)} definida e copiada. Envie para a pessoa.`);break}
    case "uSendLink":uAcao({acao:"enviar_link",email:t.dataset.email},"Link de redefinição enviado por e-mail.");break;
    case "uAdminToggle":uAcao({acao:"alterar",email:t.dataset.email,admin:t.dataset.v==="1"},t.dataset.v==="1"?"Agora é administrador.":"Deixou de ser administrador.");break;
    case "uDelOk":t.disabled=true;uAcao({acao:"excluir",email:t.dataset.email},"Conta excluída.");break;
    case "sideOpen":S.sideOpen=true;render();break;
    case "sideClose":S.sideOpen=false;render();break;
    case "calDay":S.calDay=t.dataset.iso;render();if(window.matchMedia("(max-width:1100px)").matches){const det=document.querySelector(".cal-det");if(det)det.scrollIntoView({behavior:"smooth",block:"start"})}break;
    case "pendGo":{const od=overdue().sort((a,b)=>String(a.vencimento||a.competencia).localeCompare(String(b.vencimento||b.competencia)));S.q="";
      if(od.length){S.month=od[0].competencia;S.tab=dirDe(od[0])}go("repasses");break}
    case "closeLemb":openLembretes();break;
    case "lembAddHora":{readLemb();const v=+($("lHoraNova")||{}).value;const L=S.lemb;if(v&&!L.cfg.horas.includes(v)){L.cfg.horas=[...L.cfg.horas,v].sort((a,b)=>a-b);L.dirty=true;renderLembretes()}break}
    case "lembDelHora":{readLemb();const L=S.lemb;L.cfg.horas=L.cfg.horas.filter(h=>h!==+t.dataset.h);L.dirty=true;renderLembretes();break}
    case "lembAddDay":{readLemb();const v=+($("lDiaNovo")||{}).value;const L=S.lemb;if(v&&!L.cfg.dias.includes(v)){L.cfg.dias=[...L.cfg.dias,v];L.dirty=true;renderLembretes()}break}
    case "copyCobG":copiarCobrancaGrupo(t.dataset.pids.split(",").filter(Boolean));break;
    case "confirmVarias":t.disabled=true;confirmarVarias(t.dataset.pids.split(",").filter(Boolean),!!t.dataset.rec);break;
    case "toggleDay":{readLemb();const d=+t.dataset.d;const L=S.lemb;L.cfg.dias=L.cfg.dias.includes(d)?L.cfg.dias.filter(x=>x!==d):[...L.cfg.dias,d];L.dirty=true;renderLembretes();break}
    case "saveLemb":saveLemb();break;
    case "lembTeste":lembTeste();break;
    case "changePass":S.menuOpen=false;S.view="newpass";viewNewPass();break;
    case "menu":S.menuOpen=!S.menuOpen;renderMenu();break;
    case "pushOn":S.menuOpen=false;pushOn();break;
    case "pushOff":S.menuOpen=false;pushOff();break;
    case "pushTest":S.menuOpen=false;renderMenu();pushTest();break;
    case "prev":S.month=shiftYM(S.month,-1);S.confirming=null;render();break;
    case "next":S.month=shiftYM(S.month,1);S.confirming=null;render();break;
    case "goto":{S.month=t.dataset.month;const od=overdue().filter(d=>d.competencia===S.month);S.tab=od.some(d=>dirDe(d)==="pagar")||!od.length?"pagar":"receber";go("repasses");break}
    case "mesSel":S.month=t.dataset.month;S.confirming=null;render();break;
    case "abrirDir":S.month=t.dataset.month;S.tab=t.dataset.dir;S.confirming=null;render();break;
    case "new":openPanel(null);break;
    case "edit":openPanel(t.dataset.id);break;
    case "close":closePanel(false);break;
    case "save":save();break;
    case "askDel":readForm();S.editing.confirmDel=true;renderPanel();break;
    case "cancelDel":readForm();S.editing.confirmDel=false;renderPanel();break;
    case "doDel":t.disabled=true;deleteRecord();break;
    case "pay":S.confirming=t.dataset.k;render();break;
    case "cancelPay":S.confirming=null;render();break;
    case "confirmPay":t.disabled=true;payGroup(t.dataset.k);break;
    case "undoLastPay":{const u=S.ultimaBaixa;$("toastRoot").innerHTML="";if(u)desfazerBaixa(u.ids,u.rec);break}
    case "editPay":S.editPay=t.dataset.k;S.confirming=null;render();break;
    case "copyCob":copiarCobrancaParcela(t.dataset.pid);break;
    case "confirmParc":t.disabled=true;confirmarParcela(t.dataset.pid,!!t.dataset.rec);break;
    case "avDel":{const n=+t.dataset.n;S.av.dias=S.av.dias.filter(x=>x!==n);S.av.dirty=true;renderAvisos();break}
    case "avAdd":{const v=parseInt(($("avNovo")||{}).value,10);if(isNaN(v)||v<0||v>60){toast("Informe de 0 a 60 dias.");break}if(!S.av.dias.includes(v))S.av.dias.push(v);S.av.dias.sort((a,b)=>a-b);S.av.dirty=true;renderAvisos();break}
    case "avSave":saveAvisos();break;
    case "editPayCancel":S.editPay=null;render();break;
    case "editPaySave":t.disabled=true;alterarDataBaixa(t.dataset.k);break;
    case "undoGroupPay":{const k=t.dataset.k;const ids=monthDocs().filter(d=>grupoKey(d)===k&&d.pago).map(d=>d.pid).filter(Boolean);t.disabled=true;desfazerBaixa(ids,k.startsWith("receber"));break}
    case "copy":copyExtrato(t.dataset.k);break;
    case "kpi":{const g=t.dataset.go;if(g==="notif"){go("notificacoes");break}
      if(g==="atraso"){const od=overdue().sort((a,b)=>String(a.vencimento||a.competencia).localeCompare(String(b.vencimento||b.competencia)));if(od.length){S.month=od[0].competencia;S.tab=dirDe(od[0])}else S.tab="pagar"}
      else S.tab=g;S.q="";go("repasses");break}
    case "rankMais":S.rankAll=!S.rankAll;render();break;
    case "acoesMais":S.acoesMais=S.acoesMais===t.dataset.k?null:t.dataset.k;render();break;
    case "dem":openDem(monthDocs().filter(d=>grupoKey(d)===t.dataset.k),{titulo:"Parcelas com vencimento em "+monthName(S.month)});break;
    case "demRel":{const g=agruparRel(repDocs(),"corretora").find(x=>x.k===t.dataset.k);if(g)openDem(g.itens,{titulo:"Parcelas com vencimento em "+repPeriodoTxt()});break}
    case "demClose":demFechar(false);break;
    case "demFechar":demFechar(true);break;
    case "demPdf":demPdf(t);break;
    case "demXlsx":demXlsx(t);break;
    case "extrato":openExtrato();break;
    case "extPick":$("extFile").click();break;
    case "extOutro":openExtrato();break;
    case "extFechar":S.ext=null;$("panelRoot").innerHTML="";break;
    case "extDem":{const g=extGrupos(extLinhas()).find(x=>x.k===t.dataset.k);if(g)openDem(g.itens,{voltar:"extrato",titulo:"Do extrato "+(S.ext.nome||"")});break}
    case "extLancar":extLancar(+t.dataset.i);break;
    case "extAbrir":openPanel(t.dataset.id);break;
    case "detToggle":S.det=!S.det;lsSet("detalhes",S.det?"1":"");renderContent();break;
    case "reload":location.reload();break;
    case "splitSet":{const e=S.editing;if(!e)break;readForm();const d=e.data;d.repasse_pct=+t.dataset.v;d.nivel=nivelDe(d.repasse_pct);$("repasse_pct").value=numInput(d.repasse_pct);$("parte_cs").value=numInput(100-d.repasse_pct);
      document.querySelectorAll(".chipbtn").forEach(b=>b.classList.toggle("on",b===t));
      if(!d.valor_manual){d.valor_repasse=calcRepasse(d.premio,d.comissao_pct,d.repasse_pct,d.lider);$("valor_repasse").value=moneyInput(d.valor_repasse)}recalcParcelas(d);renderParcelas();updateCalc();break}
    case "aiRead":aiLer(+t.dataset.i);break;
    case "ajusteOn":{const e=S.editing;if(!e)break;e.ajuste=true;const b=$("ajusteBox");if(b){b.hidden=false;const v=$("valor_repasse");v.focus();v.select()}break}
    case "ajusteOff":{const e=S.editing;if(!e)break;readForm();const d=e.data;d.valor_manual=false;e.ajuste=false;d.valor_repasse=calcRepasse(d.premio,d.comissao_pct,d.repasse_pct,d.lider);
      $("valor_repasse").value=moneyInput(d.valor_repasse);$("ajusteBox").hidden=true;$("valHint").textContent="Digite o valor combinado, se for diferente do cálculo.";recalcParcelas(d);renderParcelas();updateCalc();break}
    case "aiClose":if(S.editing){S.editing.ai=null;renderAiBox()}break;
    case "aiUse":{const e=S.editing;if(!e||!e.ai)break;readForm();const c=e.ai.conflitos.splice(+t.dataset.i,1)[0];if(c){e.data[c.f]=c.v;e.ai.filled.push(c.f);(e.aiFilled=e.aiFilled||new Set()).add(c.f);
      if(["premio","comissao_pct","lider"].includes(c.f)&&!e.data.valor_manual)e.data.valor_repasse=calcRepasse(e.data.premio,e.data.comissao_pct,e.data.repasse_pct,e.data.lider);recalcParcelas(e.data)}renderPanel();break}
    case "pick":$("fileInput").click();break;
    case "openFile":{const x=S.editing&&S.editing.data.anexos[+t.dataset.i];if(x){if(x.novo||x.path)openFile(x)}break}
    case "dl":{const x=S.editing&&S.editing.data.anexos[+t.dataset.i];if(x)downloadFile(x);break}
    case "rmFile":{const e=S.editing;const [x]=e.data.anexos.splice(+t.dataset.i,1);
      if(x){if(x.novo){e.added=e.added.filter(y=>y!==x);sb.storage.from(BUCKET).remove([x.path]).catch(()=>{})}else e.removed.push(x)}
      renderAnexos();break}
  }
});
document.addEventListener("keydown",ev=>{
  if(ev.key==="Escape"){if(S.menuOpen){S.menuOpen=false;renderMenu()}else if(S.sideOpen){S.sideOpen=false;render()}else if(S.imp){S.imp=null;$("panelRoot").innerHTML=""}else if(S.dem)demFechar(false);else if(S.editing)closePanel(false);else if(S.ext){S.ext=null;$("panelRoot").innerHTML=""}else if(S.ficha){S.ficha=null;$("panelRoot").innerHTML=""}else if($("panelRoot").innerHTML)closePanel(false)}
  if(ev.key==="Enter"&&["ceNome","ceCnpj","ceSusep"].includes(ev.target.id)){ev.preventDefault();cSave();return}
  if(ev.key==="Enter"&&["seNome","seRazao","seCnpj","seCom"].includes(ev.target.id)){ev.preventDefault();sSave();return}
  if(ev.key==="Enter"&&(["peNome","peCnpj","peSusep"].includes(ev.target.id)||ev.target.dataset.gi!=null)){ev.preventDefault();pSave();return}
  if((ev.key==="Enter"||ev.key===" ")&&ev.target.matches("[data-action='edit']")){ev.preventDefault();openPanel(ev.target.dataset.id)}
  if((ev.key==="Enter"||ev.key===" ")&&ev.target.matches("[data-action='cFicha']")){ev.preventDefault();openFicha(ev.target.dataset.id)}
});
function gv(id){return $(id).value}
function segHint(){const h=$("segHint");if(!h)return;const v=$("seguradora").value.trim();if(!v){h.textContent="";return}
  const r=segReg(v);h.style.color="var(--muted)";h.textContent=r?(r.razao_social?`${r.razao_social}${r.cnpj?" · "+fmtCnpj(r.cnpj):""}`:"Cadastrada sem razão social."):"Nova: será incluída na lista de seguradoras ao salvar."}
function tomHint(){const h=$("tomHint");if(!h)return;const cn=normCnpj($("tomador_cnpj").value);
  if(cn.length<14){h.textContent="";return}
  if(!cnpjValido(cn)){h.textContent="CNPJ inválido.";h.style.color="var(--danger)";return}
  h.style.color="var(--muted)";const n=S.docs.filter(x=>x.tomador_cnpj===cn).length;h.textContent=n?`${n} apólice${n>1?"s":""} deste tomador já lançada${n>1?"s":""}.`:""}
function cnpjHint(){const h=$("cnpjHint");if(!h)return;const v=$("corretor_cnpj").value;const cn=normCnpj(v);
  if(!cn){h.textContent="";return}
  if(cn.length<14){h.textContent="";return}
  if(!cnpjValido(cn)){h.textContent="CNPJ inválido.";h.style.color="var(--danger)";return}
  const c=corretoraPorCnpj(cn);h.style.color="var(--muted)";
  h.textContent=c?(key(c.nome)===key($("corretor").value)?"Corretora da lista.":`Na lista como "${c.nome}".`):"Nova: será incluída na lista ao salvar."}
document.addEventListener("input",ev=>{
  const id=ev.target.id;
  if(id==="fq"){S.q=ev.target.value;
    if(S.q.trim()&&S.tab!=="apolices"){S.tabAntes=S.tab;S.tab="apolices";S.fScope="todas";renderRepTabs()}
    else if(!S.q.trim()&&S.tab==="apolices"&&S.tabAntes){S.tab=S.tabAntes;S.tabAntes=null;renderRepTabs()}
    const lb=$("listaBtn");if(lb)lb.textContent=S.tab==="apolices"?"":"Ver lista completa";renderContent();return}
  if(id==="dem_adiant"&&S.dem){S.dem.adiant=ev.target.value;renderDemTot();return}
  if(!S.editing)return;const d=S.editing.data;
  if(ev.target.classList&&ev.target.classList.contains("ai-filled")){ev.target.classList.remove("ai-filled");if(S.editing.aiFilled)S.editing.aiFilled.delete(id)}
  if(id==="comissao_pct"&&S.editing.comAuto){S.editing.comAuto=false;comHint()}
  if(["premio","comissao_pct","repasse_pct","parte_cs","valor_repasse"].includes(id)){
    if(id==="parte_cs"){const v=numOrNull(gv("parte_cs"));$("repasse_pct").value=v==null?"":numInput(Math.round((100-v)*100)/100)}
    if(id==="repasse_pct"){const v=numOrNull(gv("repasse_pct"));$("parte_cs").value=v==null?"":numInput(Math.round((100-v)*100)/100)}
    d.premio=numOrNull(gv("premio"));d.comissao_pct=numOrNull(gv("comissao_pct"));d.repasse_pct=numOrNull(gv("repasse_pct"));d.nivel=nivelDe(d.repasse_pct);
    document.querySelectorAll(".chipbtn").forEach(b=>b.classList.toggle("on",Number(b.dataset.v)===Number(d.repasse_pct)));
    if(id==="valor_repasse"){const v=numOrNull(gv("valor_repasse"));d.valor_manual=v!=null;d.valor_repasse=v==null?calcRepasse(d.premio,d.comissao_pct,d.repasse_pct,d.lider):v;
      $("valHint").textContent=d.valor_manual?"Ajustado à mão.":"Digite o valor combinado, se for diferente do cálculo."}
    else if(!d.valor_manual){d.valor_repasse=calcRepasse(d.premio,d.comissao_pct,d.repasse_pct,d.lider);$("valor_repasse").value=moneyInput(d.valor_repasse)}
    recalcParcelas(d);renderParcelas();updateCalc();
  }
  if(S.editing.ai&&["corretor","corretor_cnpj","premio","comissao_pct","venc1"].includes(id)){clearTimeout(S.editing.aiT);S.editing.aiT=setTimeout(()=>{if(S.editing&&S.editing.ai){readForm();renderAiBox()}},400)}
  if(id==="corretor"){const nome=ev.target.value;const c=corretoraPorNome(nome)||(nome.length>=4?corretoraPorRazao(nome):null);const ci=$("corretor_cnpj");if(c&&c.cnpj&&!ci.value){ci.value=fmtCnpj(c.cnpj)}
    cnpjHint()}
  if(id==="corretor_cnpj"){const cn=normCnpj(ev.target.value);if(cn.length===14){const c=corretoraPorCnpj(cn);const ni=$("corretor");if(c&&!ni.value)ni.value=c.nome;ev.target.value=fmtCnpj(cn)}cnpjHint()}
  if(id==="seguradora"){segHint();if(S.editing.comAuto)aplicarComissaoPadrao(true)}
  if(id==="tomador"){const prev=S.docs.find(x=>key(x.tomador)===key(ev.target.value)&&x.tomador_cnpj);const ti=$("tomador_cnpj");if(prev&&!ti.value)ti.value=fmtCnpj(prev.tomador_cnpj);tomHint()}
  if(id==="tomador_cnpj"){const cn=normCnpj(ev.target.value);if(cn.length===14){ev.target.value=fmtCnpj(cn);const prev=S.docs.find(x=>x.tomador_cnpj===cn&&x.tomador);const ni=$("tomador");if(prev&&!ni.value)ni.value=prev.tomador}tomHint()}
  if(id==="sq"){S.sq=ev.target.value;renderSeguradoras($("content"));return}
  if(id==="cq"){S.cq=ev.target.value;renderCorretoras($("content"));return}
});
document.addEventListener("change",ev=>{
  const id=ev.target.id;
  if(S.lemb&&["lHRel","lFds","lPen","lRel"].includes(id)){readLemb();S.lemb.dirty=true;renderLembretes();return}
  if(ev.target.classList&&ev.target.classList.contains("dchk")){destToggle(ev.target);return}
  if(id==="avOn"){S.av.on=ev.target.checked;S.av.dirty=true;renderAvisos();return}
  if(ev.target.name==="uModo"&&S.cfgU&&S.cfgU.form){readUForm();renderConfig($("page"));return}
  if(ev.target.dataset&&ev.target.dataset.dsel!=null&&S.dem){const k=ev.target.dataset.dsel;if(ev.target.checked)S.dem.sel.add(k);else S.dem.sel.delete(k);renderDemTot();return}
  if(id==="extFile"){const f=ev.target.files&&ev.target.files[0];ev.target.value="";if(f)lerExtrato(f);return}
  if(!S.editing)return;const d=S.editing.data;
  if(id==="fileInput"){uploadFiles(ev.target.files);ev.target.value="";return}
  if(ev.target.dataset&&ev.target.dataset.cat!=null){const a=d.anexos[+ev.target.dataset.cat];if(a){a.categoria=ev.target.value;a.dirty=true}return}
  if(id==="emitida_por"){readForm();renderPanel();return}
  if(ev.target.dataset&&ev.target.dataset.pp!=null){readForm();renderParcelas();return}
  if(ev.target.dataset&&ev.target.dataset.pv!=null){const p=d.parcelas[+ev.target.dataset.pv];if(p&&ev.target.value&&!p.pago){p.vencimento=ev.target.value;p.competencia=ev.target.value.slice(0,7);if(+ev.target.dataset.pv===0){const v=$("venc1");if(v)v.value=ev.target.value}}return}
  if(ev.target.name==="lider"){readForm();if(!d.valor_manual)d.valor_repasse=calcRepasse(d.premio,d.comissao_pct,d.repasse_pct,d.lider);recalcParcelas(d);renderPanel();return}
  if(id==="parcelas_qtd"){readForm();recalcParcelas(d);renderPanel();return}
  if(id==="venc1"){readForm();renderParcelas();return}
  const ds=ev.target.dataset||{};
  if(ds.pp!=null){const p=d.parcelas[+ds.pp];if(p){p.pago=ev.target.checked;p.data_pagamento=p.pago?(p.data_pagamento||isoDay(today)):null}return}
});
document.addEventListener("mouseover",ev=>{const g=ev.target.closest&&ev.target.closest(".chart .bar");if(g)showTip(g)});
document.addEventListener("focusin",ev=>{const g=ev.target.closest&&ev.target.closest(".chart .bar");if(g)showTip(g)});
document.addEventListener("mouseout",ev=>{const w=ev.target.closest&&ev.target.closest(".chartwrap");if(w&&!w.contains(ev.relatedTarget)){const t=$("tip");if(t)t.hidden=true}});
document.addEventListener("dragover",ev=>{const z=ev.target.closest&&ev.target.closest("#dropZone,#extDrop");if(z){ev.preventDefault();z.classList.add("over")}});
document.addEventListener("dragleave",ev=>{const z=ev.target.closest&&ev.target.closest("#dropZone,#extDrop");if(z)z.classList.remove("over")});
document.addEventListener("drop",ev=>{const z=ev.target.closest&&ev.target.closest("#dropZone,#extDrop");if(!z)return;ev.preventDefault();z.classList.remove("over");if(z.id==="extDrop"){if(ev.dataTransfer&&ev.dataTransfer.files.length)lerExtrato(ev.dataTransfer.files[0]);return}if(ev.dataTransfer&&ev.dataTransfer.files.length)uploadFiles(ev.dataTransfer.files)});

// ---------------- baixa pelo aviso (link "Já paguei / Já recebi" do e-mail ou do push) ----------------
// Página pública: não pede login. O token assinado do aviso autoriza só aquela parcela.
async function chamarBaixa(t,acao){
  const {data,error}=await sb.functions.invoke("baixa",{body:{t,acao}});
  if(error){let msg="";try{const j=await error.context.json();msg=j.erro||""}catch(_){}throw new Error(msg||"Não foi possível falar com o servidor. Tente de novo ou abra o app.")}
  if(data&&data.erro)throw new Error(data.erro);return data}
function viewBaixa(t,estado){
  S.view="baixa";const st=estado||{fase:"carregando"};
  const abrirApp=`<button class="btn" data-baixa="app">Abrir o app</button>`;
  if(st.fase==="carregando"){root().innerHTML=brandCard(`<p class="loading">Carregando a cobrança…</p>`);chamarBaixa(t,"ver").then(i=>viewBaixa(t,{fase:i.pago?"feito":"pergunta",i,ja:i.pago})).catch(e=>viewBaixa(t,{fase:"erro",msg:e.message}));return}
  if(st.fase==="erro"){root().innerHTML=brandCard(`<h2>Não deu certo</h2><p>${esc(st.msg)}</p>`,abrirApp);return}
  const i=st.i;const rec=i.dir==="receber";const nome=tituloCaso(curtoDe(i.corretor||""));
  const det=`<div class="bx-det"><div class="bx-v num ${rec?"in":"out"}">${money(i.valor)}</div>
    <div>${rec?"Receber de":"Pagar a"} <b>${esc(i.corretor)}</b></div>
    <div class="meta">Apólice <span class="num">${esc(i.apolice)}</span>${i.parcela?` · parcela ${esc(i.parcela)}`:""}${i.emitida_por?` · ${esc(tituloCaso(curtoDe(i.emitida_por)))}`:""}${i.vencimento?` · venceu em ${esc(dateBR(i.vencimento))}`:""}${i.seguradora?` · ${esc(i.seguradora)}`:""}</div></div>`;
  if(st.fase==="pergunta"){root().innerHTML=brandCard(`<h2>${rec?`Já recebeu de ${esc(nome)}?`:`Já pagou ${esc(nome)}?`}</h2>${det}
      <p class="meta">Ao confirmar, a parcela fica como ${rec?"recebida":"paga"} hoje e as cobranças dela param.</p>
      <button class="btn primary bx-go" data-baixa="confirmar">${rec?"Sim, já recebi":"Sim, já paguei"}</button>`,abrirApp);}
  else if(st.fase==="feito"){root().innerHTML=brandCard(`<h2>${st.ja?(rec?"Já estava recebido":"Já estava pago"):(rec?"Recebimento registrado":"Pagamento registrado")}</h2>${det}
      <p class="bx-ok">✓ ${rec?"Recebido":"Pago"} em ${esc(dateBR(i.data_pagamento))}. As cobranças desta parcela pararam.</p>
      ${st.ja?"":`<button class="btn ghost" data-baixa="desfazer">Desfazer</button>`}`,abrirApp);}
  S.baixa={t,st};
}
document.addEventListener("click",async ev=>{const b=ev.target.closest&&ev.target.closest("[data-baixa]");if(!b||S.view!=="baixa")return;ev.preventDefault();
  const a=b.dataset.baixa;const {t,st}=S.baixa||{};
  if(a==="app"){location.href=location.pathname+"#repasses";location.reload();return}
  b.disabled=true;b.textContent="Aguarde…";
  try{const i=await chamarBaixa(t,a);viewBaixa(t,a==="confirmar"?{fase:"feito",i,ja:!!i.ja}:{fase:"pergunta",i})}
  catch(e){viewBaixa(t,{fase:"erro",msg:e.message})}});

// ---------------- início ----------------
if(!sb){viewConfig();return}
{const m=/^#baixa=(.+)$/.exec(location.hash);if(m)viewBaixa(decodeURIComponent(m[1]))}
sb.auth.onAuthStateChange((event,session)=>{
  if(S.view==="baixa")return;
  if(event==="PASSWORD_RECOVERY"){S.view="newpass";viewNewPass();return}
  if(S.view==="newpass")return;
  if(event==="SIGNED_OUT"){teardown();S.view="login";viewLogin();return}
  if(event==="SIGNED_IN"||event==="INITIAL_SESSION")setTimeout(()=>onSession(session),0);
});
})();
