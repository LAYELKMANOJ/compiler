import { TT, lex } from "./lexer.js";
import { Parser, ParseError } from "./parser.js";
import { analyze } from "./semantic.js";

/* ==============================================================
   EXAMPLES
   ============================================================== */
const EXAMPLES = [
  'a > 5 && b < 10',
  '!(x == y) || z != 0',
  'a > 1 && b > 2 || c < 3',
  '!true && false || a != b',
  '(p || q) && !(r == s)',
  'a > 5 && && b'
];

/* ==============================================================
   EVALUATOR
   ============================================================== */
function evalAST(node,env){
  if(!node)return undefined;
  if(node.kind==='BOOL')return node.value==='true';
  if(node.kind==='NUMBER')return parseFloat(node.value);
  if(node.kind==='IDENT')return env[node.value];
  if(node.kind==='ERROR')return undefined;
  if(node.kind==='NOT'){const v=evalAST(node.left,env);return v===undefined?undefined:!v;}
  const L=evalAST(node.left,env),R=evalAST(node.right,env);
  if(node.kind==='LOGOP'){if(node.value==='&&')return!!L&&!!R;if(node.value==='||')return!!L||!!R;}
  if(node.kind==='RELOP'){
    if(node.value==='>')return L>R;if(node.value==='<')return L<R;
    if(node.value==='==')return L==R;if(node.value==='!=')return L!=R;
    if(node.value==='>=')return L>=R;if(node.value==='<=')return L<=R;
  }
  return undefined;
}

/* ==============================================================
   AST RENDERER
   ============================================================== */
let nodeCount=0;
function renderAST(node,depth=0){
  if(!node)return '';
  nodeCount++;
  const kindClass={LOGOP:'node-op',RELOP:'node-relop',NOT:'node-not',IDENT:'node-id',NUMBER:'node-num',BOOL:'node-bool',ERROR:'node-id'}[node.kind]||'node-id';
  const kindLabel={LOGOP:'LogOp',RELOP:'RelOp',NOT:'NOT',IDENT:'Ident',NUMBER:'Num',BOOL:'Bool',ERROR:'Error'}[node.kind]||node.kind;
  const children=[node.left,node.right].filter(Boolean);
  let childrenHTML='';
  if(children.length>0){
    const childHTMLs=children.map(c=>`<div class="connector"><div class="child-v-line"></div>${renderAST(c,depth+1)}</div>`).join('');
    childrenHTML=`<div><div class="connector-line-v"></div></div><div class="children-row">${childHTMLs}</div>`;
  }
  return `<div class="tree-node"><div class="node-box ${kindClass}" title="${node.kind}: ${esc(node.value)}"><span class="node-label">${esc(node.value)}</span><span class="node-kind">${kindLabel}</span></div>${childrenHTML}</div>`;
}

function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}

/* ==============================================================
   TRUTH TABLE
   ============================================================== */
function buildTruthTable(ast,variables){
  const vars=[...variables].slice(0,4);
  if(vars.length===0)return null;
  const rows=[],combos=1<<vars.length;
  for(let mask=0;mask<combos;mask++){
    const env={};
    vars.forEach((v,i)=>env[v]=!!(mask&(1<<(vars.length-1-i))));
    rows.push({env:{...env},result:evalAST(ast,env)});
  }
  return{vars,rows};
}

/* ==============================================================
   UI STATE
   ============================================================== */
let currentTab='vis';
function switchTab(tab){
  currentTab=tab;
  document.getElementById('tabVis').classList.toggle('active',tab==='vis');
  document.getElementById('tabTable').classList.toggle('active',tab==='table');
  document.getElementById('tokenVis').style.display=tab==='vis'?'':'none';
  document.getElementById('tokenTable').style.display=tab==='table'?'':'none';
}

function insertOp(op){
  const ta=document.getElementById('exprInput');
  const s=ta.selectionStart,e=ta.selectionEnd;
  // decode HTML entities for actual insertion
  const div=document.createElement('div');div.innerHTML=op;const raw=div.textContent;
  ta.value=ta.value.slice(0,s)+raw+ta.value.slice(e);
  const np=s+raw.length;ta.setSelectionRange(np,np);ta.focus();
}

function loadExample(idx){
  document.getElementById('exprInput').value=EXAMPLES[idx];
}

function copyExpr(){
  const v=document.getElementById('exprInput').value;
  if(!v)return;
  navigator.clipboard.writeText(v).then(()=>{
    const btn=document.getElementById('copyBtn');
    btn.textContent='Copied!';
    setTimeout(()=>btn.innerHTML='&#10697; Copy',1500);
  });
}

function clearAll(){
  document.getElementById('exprInput').value='';
  resetUI();
  document.getElementById('compileStatus').textContent='';
}

function onExprChange(){}

/* ==============================================================
   COMPILE
   ============================================================== */
function compile(){
  const src=document.getElementById('exprInput').value.trim();
  const btn=document.getElementById('compileBtn');
  btn.disabled=true;
  btn.innerHTML='<div class="spinner"></div> Compiling&hellip;';
  setTimeout(()=>{
    runCompiler(src);
    btn.disabled=false;
    btn.innerHTML='<span>&#9654;</span> Compile &amp; Analyze';
  },120);
}

function runCompiler(src){
  const{tokens,errors:lexErrors}=lex(src);
  const parser=new Parser(tokens);
  let ast=null,parseErrors=[];
  try{ast=parser.parse();parseErrors=parser.errors;}
  catch(e){parseErrors.push(new ParseError(e.message,0));}
  const real=tokens.filter(t=>t.type!==TT.EOF);
  const semChecks=analyze(ast,real);
  const variables=new Set();
  tokens.forEach(t=>{if(t.type===TT.IDENTIFIER)variables.add(t.value);});
  let evalResult=undefined;
  if(parseErrors.length===0&&lexErrors.length===0&&ast){
    const pureConst=real.every(t=>t.type===TT.BOOL||t.type===TT.NOT||t.type===TT.LPAREN||t.type===TT.RPAREN||t.type===TT.LOGOP||t.type===TT.RELOP||t.type===TT.NUMBER);
    if(pureConst&&variables.size===0)evalResult=evalAST(ast,{});
  }
  renderTokens(tokens);
  nodeCount=0;
  renderASTPanel(ast);
  const nc=nodeCount;
  renderSemantic(semChecks);
  renderErrors([...lexErrors,...parseErrors]);
  renderStatusBar(real.length,nc,lexErrors.length+parseErrors.length,semChecks,evalResult);
  renderTruthTable(ast,variables);
  document.getElementById('statusBar').style.display='flex';
  document.getElementById('compileStatus').textContent='Compiled at '+new Date().toLocaleTimeString();
}

/* ==============================================================
   RENDER TOKENS
   ============================================================== */
function tokenColor(type){
  return{IDENTIFIER:'#4f8ef7',NUMBER:'#22d3a5',RELOP:'#a855f7',LOGOP:'#00d4ff',NOT:'#fb923c',LPAREN:'#fbbf24',RPAREN:'#fbbf24',BOOL:'#a855f7',EOF:'#4a5568'}[type]||'#e8eaf6';
}
function renderTokens(tokens){
  const grid=document.getElementById('tokenGrid');
  const body=document.getElementById('tokenTableBody');
  const all=tokens;
  if(all.filter(t=>t.type!==TT.EOF).length===0){
    grid.innerHTML='<div class="empty-state"><div class="icon">&#9672;</div><p>No tokens found</p></div>';
    body.innerHTML='';return;
  }
  grid.innerHTML=all.map((t,i)=>`<div class="token-item tk-${t.type}" style="animation-delay:${i*25}ms" title="${t.type} | ${t.value} | pos:${t.pos}"><div class="token-index">${i}</div><div class="token-val">${esc(t.value)}</div><div class="token-type">${t.type}</div></div>`).join('');
  body.innerHTML=all.map((t,i)=>`<tr><td style="padding:8px 12px;color:var(--text-dim)">${i}</td><td style="padding:8px 12px;font-family:'JetBrains Mono',monospace;color:${tokenColor(t.type)}">${esc(t.value)}</td><td style="padding:8px 12px;color:var(--text-secondary)">${t.type}</td><td style="padding:8px 12px;color:var(--text-dim)">${t.pos}</td></tr>`).join('');
}

/* ==============================================================
   RENDER AST
   ============================================================== */
function renderASTPanel(ast){
  const c=document.getElementById('astContainer');
  if(!ast){c.innerHTML='<div class="empty-state"><div class="icon">&#127807;</div><p>Could not build AST &mdash; check errors</p></div>';return;}
  c.innerHTML='<div style="display:flex;justify-content:center;padding-bottom:16px">'+renderAST(ast)+'</div>';
}

/* ==============================================================
   RENDER SEMANTIC
   ============================================================== */
function renderSemantic(checks){
  const list=document.getElementById('semanticList');
  const pc=document.getElementById('semPassCount');
  const pass=checks.filter(c=>c.status==='pass').length;
  const fail=checks.filter(c=>c.status==='fail').length;
  pc.textContent=pass+' passed \u00B7 '+fail+' failed';
  if(checks.length===0){list.innerHTML='<div class="empty-state"><div class="icon">&#128300;</div><p>No checks</p></div>';return;}
  const icon={pass:'&#10003;',fail:'&#10007;',warn:'&#9888;',info:'&#9432;'};
  list.innerHTML=checks.map((c,i)=>`<div class="sem-item ${c.status}" style="animation-delay:${i*35}ms"><div class="sem-icon">${icon[c.status]||'?'}</div><div class="sem-body"><div class="sem-rule">${esc(c.rule)}</div><div class="sem-msg">${esc(c.msg)}</div></div></div>`).join('');
}

/* ==============================================================
   RENDER ERRORS
   ============================================================== */
function renderErrors(errors){
  const list=document.getElementById('errorList');
  const ec=document.getElementById('errCount');
  ec.textContent=errors.length+' error'+(errors.length!==1?'s':'');
  if(errors.length===0){list.innerHTML='<div class="empty-state"><div class="icon">&#10003;</div><p>No errors &mdash; expression is valid</p></div>';return;}
  list.innerHTML=errors.map((e,i)=>`<div class="error-item" style="animation-delay:${i*35}ms"><div class="error-loc">pos:${e.pos!==undefined?e.pos:'?'}</div><div class="error-msg">&#128308; ${esc(e.msg)}</div></div>`).join('');
}

/* ==============================================================
   RENDER STATUS BAR
   ============================================================== */
function renderStatusBar(tokenCount,nc,errCount,semChecks,evalResult){
  document.getElementById('statTokens').textContent=tokenCount;
  document.getElementById('statNodes').textContent=nc;
  document.getElementById('statErrors').textContent=errCount;
  const errChip=document.getElementById('statErrChip');
  errChip.className='stat-chip '+(errCount>0?'err':'ok');
  document.getElementById('statErrIcon').innerHTML=errCount>0?'&#10007;':'&#10003;';
  document.getElementById('statErrors').style.color=errCount>0?'var(--accent-red)':'var(--accent-green)';
  const pass=semChecks.filter(c=>c.status==='pass').length;
  document.getElementById('statChecks').textContent=pass+'/'+semChecks.length;
  const resEl=document.getElementById('statResult');
  const resIco=document.getElementById('statResultIcon');
  const resCh=document.getElementById('statResultChip');
  if(evalResult===true){resEl.textContent='TRUE';resEl.style.color='var(--accent-green)';resIco.innerHTML='&#10003;';resCh.className='stat-chip ok';}
  else if(evalResult===false){resEl.textContent='FALSE';resEl.style.color='var(--accent-red)';resIco.innerHTML='&#10007;';resCh.className='stat-chip err';}
  else{resEl.innerHTML='&ndash;';resEl.style.color='var(--text-dim)';resIco.innerHTML='&#8857;';resCh.className='stat-chip';}
}

/* ==============================================================
   RENDER TRUTH TABLE
   ============================================================== */
function renderTruthTable(ast,variables){
  const panel=document.getElementById('truthPanel');
  const note=document.getElementById('truthNote');
  if(variables.size===0||!ast){panel.style.display='none';return;}
  const data=buildTruthTable(ast,variables);
  if(!data){panel.style.display='none';return;}
  panel.style.display='';
  note.textContent=(variables.size>4?'Showing first 4 of '+variables.size+' variables':data.rows.length+' combinations');
  const tbl=document.getElementById('truthTable');
  tbl.querySelector('thead').innerHTML='<tr>'+data.vars.map(v=>'<th>'+esc(v)+'</th>').join('')+'<th style="color:var(--accent-purple)">Result</th></tr>';
  tbl.querySelector('tbody').innerHTML=data.rows.map(row=>{
    const vc=data.vars.map(v=>`<td class="cell-var ${row.env[v]?'cell-true':'cell-false'}">${row.env[v]?'T':'F'}</td>`).join('');
    const r=row.result;
    const rc=r===true?'cell-true':r===false?'cell-false':'';
    const rt=r===true?'TRUE':r===false?'FALSE':'&mdash;';
    return `<tr>${vc}<td class="cell-result ${rc}">${rt}</td></tr>`;
  }).join('');
}

/* ==============================================================
   RESET
   ============================================================== */
function resetUI(){
  document.getElementById('tokenGrid').innerHTML='<div class="empty-state"><div class="icon">&#9672;</div><p>No tokens yet</p></div>';
  document.getElementById('tokenTableBody').innerHTML='';
  document.getElementById('astContainer').innerHTML='<div class="empty-state"><div class="icon">&#127807;</div><p>AST will appear here</p></div>';
  document.getElementById('semanticList').innerHTML='<div class="empty-state"><div class="icon">&#128300;</div><p>Semantic checks will appear here</p></div>';
  document.getElementById('errorList').innerHTML='<div class="empty-state"><div class="icon">&#10003;</div><p>No errors detected</p></div>';
  document.getElementById('statusBar').style.display='none';
  document.getElementById('truthPanel').style.display='none';
  document.getElementById('semPassCount').textContent='';
  document.getElementById('errCount').textContent='';
}

/* ==============================================================
   KEYBOARD SHORTCUT
   ============================================================== */
document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key==='Enter')compile();});

/* Input starts empty. Examples are loaded only when a user clicks an example button. */

// Expose functions used by existing inline HTML event handlers.
Object.assign(window, {compile, clearAll, copyExpr, insertOp, loadExample, switchTab, onExprChange});
