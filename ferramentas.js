// ============================================================
//  ADMINISTRADOR E PERMISSÕES
// ============================================================
let souAdmin=false;
let permissoes={pode_excluir:true,pode_editar:true,pode_pagar:true,pode_criar:true,pode_ver_relatorios:true};
let nomeAdmin='';

async function carregarPermissoes(){
  const s=Sessao.ler();
  const meuEmail=((s&&s.email)||'').toLowerCase();
  try{
    const admins=await api('administrador_geral?select=*')||[];
    souAdmin = admins.some(function(a){ return String(a.email||'').toLowerCase()===meuEmail; });
    const eu=admins.filter(function(a){ return String(a.email||'').toLowerCase()===meuEmail; })[0];
    nomeAdmin = eu?eu.nome:'';
  }catch(e){ souAdmin=false; }
  try{
    const p=await api('permissoes_operadores?select=*&id=eq.1');
    if(p&&p[0]) permissoes=p[0];
  }catch(e){}
}
// O administrador nunca é limitado. Os demais seguem o que ele definiu.
function podeFazer(acao){
  if(souAdmin) return true;
  if(acao==='excluir')  return permissoes.pode_excluir!==false;
  if(acao==='editar')   return permissoes.pode_editar!==false;
  if(acao==='pagar')    return permissoes.pode_pagar!==false;
  if(acao==='criar')    return permissoes.pode_criar!==false;
  if(acao==='relatorios') return permissoes.pode_ver_relatorios!==false;
  return true;
}
function bloqueado(acao){
  const nomes={excluir:'excluir registros',editar:'editar lançamentos',pagar:'dar baixa em contas',criar:'criar lançamentos',relatorios:'ver relatórios'};
  alert('Você não tem permissão para '+(nomes[acao]||acao)+'.\n\nFale com o administrador do aplicativo.');
}

// Tela de administração — só o administrador enxerga
// ============================================================
//  META DE GASTOS MENSAIS
// ============================================================
let metaTeto=null;
async function carregarMeta(){
  try{
    const r=await api('meta_financeira?select=*&id=eq.1');
    metaTeto=(r&&r[0]&&r[0].teto_mensal!=null)?Number(r[0].teto_mensal):null;
  }catch(e){ metaTeto=null; }
}
let metaLucroPct=15;
async function carregarMetaLucro(){
  try{
    const r=await api('meta_lucro?select=*&id=eq.1');
    metaLucroPct=(r&&r[0]&&r[0].percentual!=null)?Number(r[0].percentual):15;
  }catch(e){ metaLucroPct=15; }
}
// Situação da margem de lucro de um mês: quanto precisa sobrar (meta%) x
// quanto sobrou de verdade (ou está projetado a sobrar).
// Meta de RETIRADA (não é margem sobre o faturamento do mês).
// Base = saldo acumulado (o que sobrou de antes + o que entrou agora),
// descontado do que ainda falta pagar este mês. Sobre esse valor, o
// percentual é o quanto dá pra tirar com segurança sem descapitalizar.
function situacaoRetirada(metaPct){
  const T=saldoAcumuladoTotal();          // tudo que já entrou/saiu, desde o início
  const comp=comprometidoMes();           // já saiu este mês + o que ainda vai vencer
  const saldoDisponivel = T.saldo - comp.aindaVence;
  const retiradaAlvo = saldoDisponivel * (metaPct/100);

  const hoje=new Date();
  const ini=new Date(hoje.getFullYear(),hoje.getMonth(),1).getTime();
  const fim=new Date(hoje.getFullYear(),hoje.getMonth()+1,1).getTime();
  const CATS_RETIRADA=['Retirada','Sangria','Pró-labore','Retirada de sócio'];
  const jaRetirado = movimentos.filter(function(m){
    return m.tipo==='SAIDA' && m.ts>=ini && m.ts<fim && CATS_RETIRADA.indexOf(m.categoria)>=0;
  }).reduce(function(s,m){ return s+m.valor; },0);

  return {saldoAcumulado:T.saldo, aindaVence:comp.aindaVence, saldoDisponivel:saldoDisponivel,
          retiradaAlvo:retiradaAlvo, jaRetirado:jaRetirado, restante:retiradaAlvo-jaRetirado};
}
// Tudo que já saiu do caixa este mês + tudo que ainda vai sair (contas
// pendentes com vencimento dentro do mês). Sem contar duas vezes: contas
// já pagas viram lançamento no caixa e não entram de novo aqui.
function comprometidoMes(){
  const hoje=new Date();
  const ini=new Date(hoje.getFullYear(),hoje.getMonth(),1).getTime();
  const fim=new Date(hoje.getFullYear(),hoje.getMonth()+1,1).getTime();
  // Compra de mercadoria (Distribuidor etc.) fica de fora daqui de propósito:
  // é dinheiro que vira estoque que vira venda que vira lucro, não é gasto
  // fixo. Contar isso dentro do teto geraria alarme falso justamente quando
  // o negócio vai bem (mais venda = mais compra de reposição). Por isso
  // "Meta de gastos" agora só olha despesa operacional, igual ao DRE já fazia.
  const jaSaiu=movimentos.filter(function(m){
    return m.tipo==='SAIDA'&&m.ts>=ini&&m.ts<fim&&grupoDaCategoria(m.categoria)!=='Mercadoria';
  }).reduce(function(s,m){ return s+m.valor; },0);
  const aindaVence=contas.filter(function(c){
    if(c.tipo!=='PAGAR'||c.status==='PAGO') return false;
    if(grupoDaCategoria(c.categoria)==='Mercadoria') return false;
    const t=new Date(c.venc+'T12:00:00').getTime();
    return t<fim;
  }).reduce(function(s,c){ return s+c.valor; },0);
  return {jaSaiu:jaSaiu, aindaVence:aindaVence, total:jaSaiu+aindaVence};
}
// Só a parte de mercadoria (Distribuidor etc.) — separada, porque essa é
// investimento que volta como venda, não despesa que só consome caixa.
function comprasPagas(){
  const hoje=new Date();
  const ini=new Date(hoje.getFullYear(),hoje.getMonth(),1).getTime();
  const fim=new Date(hoje.getFullYear(),hoje.getMonth()+1,1).getTime();
  return movimentos.filter(function(m){
    return m.tipo==='SAIDA'&&m.ts>=ini&&m.ts<fim&&grupoDaCategoria(m.categoria)==='Mercadoria';
  }).reduce(function(s,m){ return s+m.valor; },0);
}
// O que ainda falta pagar de tudo (não só deste mês) — a base pra saber
// quanto do saldo acumulado já está, na prática, comprometido.
function totalAPagarTudo(){
  return contas.filter(function(c){ return c.tipo==='PAGAR'&&c.status!=='PAGO'; })
    .reduce(function(s,c){ return s+c.valor; },0);
}
// Caixa livre = saldo acumulado menos tudo que ainda vai sair, de qualquer
// vencimento. É a resposta pra "quanto eu realmente posso usar agora".
function caixaLivre(){
  const saldo=saldoAcumuladoTotal().saldo;
  const aPagar=totalAPagarTudo();
  return {saldo:saldo, aPagar:aPagar, livre:saldo-aPagar};
}
function cartaoMetaGastos(){
  if(metaTeto==null||metaTeto<=0) return '';
  const c=comprometidoMes();
  // Disponível = teto - comprometido. "Já saiu" já está DENTRO de "comprometido"
  // (comprometido = já saiu + ainda vai vencer) — não pode ser somado de novo,
  // senão o mesmo dinheiro é descontado duas vezes do disponível.
  const disponivel = metaTeto - c.total;
  const pctReal = c.total/metaTeto*100;
  const pctBarra = Math.max(0,Math.min(100,Math.round(pctReal)));
  const pctTxt = Math.round(pctReal);
  const cor = pctReal<80?'var(--emerald)':pctReal<100?'#8A5A00':'var(--rose)';
  const bg  = pctReal<80?'#E7F6EF':pctReal<100?'#FDF1DC':'#FDECEC';
  const msg = pctReal<80?'Dentro do planejado'
    : pctReal<100?'Perto do teto do mês'
    : 'Passou do teto planejado para o mês';

  return '<div class="item" style="cursor:pointer;flex-direction:column;align-items:stretch" onclick="irPara(\'contas\')">'+
    '<div style="display:flex;align-items:center;gap:10px;margin-bottom:16px">'+
      '<div class="iconC" style="background:'+bg+';color:'+cor+'">'+IC.rel+'</div>'+
      '<div style="flex:1"><div style="font-size:14.5px;font-weight:600">'+msg+'</div>'+
      '<div style="font-size:11.5px;color:var(--muted)">Acompanhe os gastos do mês</div></div>'+
    '</div>'+

    '<div style="display:flex;justify-content:center;margin-bottom:16px">'+
      '<div class="donut" style="background:conic-gradient('+cor+' 0% '+pctBarra+'%, #EEEAE9 '+pctBarra+'% 100%)">'+
        '<div class="donutCenter"><div class="donutPct" style="color:'+cor+'">'+pctTxt+'%</div><div class="donutSub">do teto<br/>utilizado</div></div>'+
      '</div>'+
    '</div>'+

    '<div>'+
      '<div class="metaLegLinha"><span class="metaLegPonto" style="background:'+cor+'"></span>Teto máximo<span class="metaLegVal">'+brl(metaTeto)+'</span></div>'+
      '<div class="metaLegLinha"><span class="metaLegPonto" style="background:'+cor+';opacity:.65"></span>Comprometido<span class="metaLegVal">'+brl(c.total)+'</span></div>'+
      '<div class="metaLegLinha"><span class="metaLegPonto" style="background:'+cor+';opacity:.35"></span>Já saiu<span class="metaLegVal">'+brl(c.jaSaiu)+'</span></div>'+
    '</div>'+

    '<div style="text-align:center;margin-top:6px;padding-top:12px;border-top:1px solid var(--line)">'+
      '<div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.03em">Disponível</div>'+
      '<div style="font-size:20px;font-weight:700;font-family:var(--g);color:'+(disponivel>=0?'var(--emerald)':'var(--rose)')+'">'+brl(disponivel)+'</div>'+
    '</div>'+

    '<div style="height:6px;background:#EEEAE9;border-radius:4px;margin-top:12px;overflow:hidden">'+
      '<div style="width:'+pctBarra+'%;height:100%;background:'+cor+'"></div></div>'+
    '<div style="text-align:center;font-size:11px;color:var(--muted);margin-top:6px">Total utilizado: '+brl(c.total)+' de '+brl(metaTeto)+'</div>'+
  '</div>';
}

async function salvarMetaGastos(remover){
  if(!souAdmin){ alert('Área exclusiva do administrador.'); return; }
  const valor = remover ? null : parseValor((document.getElementById('admMeta')||{}).value);
  if(!remover && (isNaN(valor)||valor<=0)){ alert('Informe um valor válido.'); return; }
  const b=document.getElementById('admMetaBtn');
  if(b){ b.textContent='Salvando…'; b.disabled=true; }
  try{
    await api('meta_financeira?id=eq.1',{method:'PATCH',body:JSON.stringify({
      teto_mensal:remover?null:valor, atualizado_em:new Date().toISOString()
    })});
    metaTeto=remover?null:valor;
    await registrar(remover?'BLOQUEOU':'LIBEROU','Meta de gastos', remover?'Teto removido':'Teto: '+brl(valor), null);
    fecharFolha(); abrirAdministracao(); render();
  }catch(e){ alert(e.message); if(b){ b.textContent='Salvar teto'; b.disabled=false; } }
}
async function salvarMetaLucroAdmin(){
  if(!souAdmin){ alert('Área exclusiva do administrador.'); return; }
  const pct=parseValor(document.getElementById('admMetaLucro').value);
  if(isNaN(pct)||pct<=0||pct>=100){ alert('Informe um percentual entre 1 e 99.'); return; }
  const b=document.getElementById('admMetaLucroBtn');
  if(b){ b.textContent='Salvando…'; b.disabled=true; }
  try{
    await api('meta_lucro?id=eq.1',{method:'PATCH',body:JSON.stringify({
      percentual:pct, atualizado_em:new Date().toISOString()
    })});
    metaLucroPct=pct;
    await registrar('LIBEROU','Meta de retirada','Meta: '+pct+'%', null);
    fecharFolha(); abrirAdministracao();
  }catch(e){ alert(e.message); if(b){ b.textContent='Salvar meta de lucro'; b.disabled=false; } }
}
function abrirAdministracao(){
  if(!souAdmin){ alert('Área exclusiva do administrador.'); return; }
  const linha=function(campo,titulo,sub){
    const on=permissoes[campo]!==false;
    return '<div class="item" style="margin-top:8px"><div style="flex:1">'+
      '<div style="font-size:14px;font-weight:500">'+titulo+'</div>'+
      '<div style="font-size:11.5px;color:var(--muted)">'+sub+'</div></div>'+
      '<button class="chave'+(on?' chaveOn':'')+'" onclick="alternarPermissao(\''+campo+'\')"><span></span></button></div>';
  };
  abrirFolha('Administração',
    '<div class="admCartao"><div class="admRot">Administrador geral</div>'+
      '<div class="admNome">'+escapeHtml(nomeAdmin||'—')+'</div>'+
      '<div class="admMail">'+((Sessao.ler()||{}).email||'')+'</div></div>'+
    '<div class="dica">O que os outros usuários (Brenda e Naldo) podem fazer. Você nunca é limitado por estas chaves.</div>'+
    linha('pode_criar','Criar lançamentos','Vendas, saídas, boletos, despesas')+
    linha('pode_editar','Editar lançamentos','Corrigir dentro do prazo de 72h')+
    linha('pode_excluir','Excluir registros','Apagar lançamentos e contas')+
    linha('pode_pagar','Dar baixa em contas','Marcar boletos como pagos')+
    linha('pode_ver_relatorios','Ver relatórios','Aba de relatórios e comparativos')+
    '<h2 class="sec" style="margin-top:16px">Teto de gastos do mês</h2>'+
    (function(){
      const hoje=new Date();
      const mesPassado=resumoMes(hoje.getMonth()===0?hoje.getFullYear()-1:hoje.getFullYear(), hoje.getMonth()===0?12:hoje.getMonth());
      const ref=mesPassado.vendas||mesPassado.ent||0;
      const sugMin=ref*0.65, sugMax=ref*0.72;
      return '<div class="dica" style="margin-top:0">Alerta quando as saídas do mês (já pagas + a vencer) passarem deste valor. '+
        (ref?'Com base no faturamento do mês passado ('+brl(ref)+'), farmácias costumam ficar entre '+brl(sugMin)+' e '+brl(sugMax)+' de compras — mas o número final é seu.':'')+
        '</div>'+
        '<input id="admMeta" inputmode="numeric" placeholder="0,00" oninput="mascaraMoeda(this)" value="'+(metaTeto?metaTeto.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}):'')+'"/>'+
        '<button class="primario" id="admMetaBtn" onclick="salvarMetaGastos()">Salvar teto</button>'+
        (metaTeto?'<button class="btnExcluir" onclick="salvarMetaGastos(true)">Remover teto (desligar alerta)</button>':'');
    })()+
    '<h2 class="sec" style="margin-top:16px">Meta de retirada</h2>'+
    '<div class="dica" style="margin-top:0">Percentual do saldo disponível (acumulado, já descontado o que falta pagar este mês) que pode ser retirado com segurança.</div>'+
    '<input id="admMetaLucro" inputmode="numeric" placeholder="15" value="'+metaLucroPct+'"/>'+
    '<button class="primario" id="admMetaLucroBtn" onclick="salvarMetaLucroAdmin()">Salvar meta de lucro</button>'+
    '<h2 class="sec" style="margin-top:16px">Usuários</h2>'+
    (operadores.length?operadores.map(function(o){
      const ehAdmin=String(o.email).toLowerCase()===String((Sessao.ler()||{}).email||'').toLowerCase()&&souAdmin;
      return '<div class="item" style="margin-top:8px"><div style="flex:1">'+
        '<div style="font-size:14px;font-weight:500">'+escapeHtml(o.nome||o.email)+(ehAdmin?' <span class="selo" style="background:var(--pine)">admin</span>':'')+'</div>'+
        '<div style="font-size:11px;color:var(--muted)">'+escapeHtml(o.email)+'</div>'+
        '<div style="font-size:11px;color:var(--muted);margin-top:2px">'+(o.visao_simples?'Visão de acompanhamento':'App completo')+'</div></div>'+
        (ehAdmin?'':'<button class="chave'+(o.visao_simples?'':' chaveOn')+'" onclick="alternarVisao(\''+encodeURIComponent(o.email)+'\')"><span></span></button>')+
        '</div>';
    }).join(''):'<div class="vazio">Nenhum usuário cadastrado.</div>')+
    '<div class="dica">Chave ligada = app completo. Desligada = só acompanhamento (vê os números, não lança).</div>'+
    '<div class="dica">As mudanças valem assim que a pessoa recarregar o aplicativo.</div>');
}
async function alternarVisao(email){
  email=decodeURIComponent(email);
  if(!souAdmin){ alert('Área exclusiva do administrador.'); return; }
  const o=operadores.filter(function(x){ return x.email===email; })[0]; if(!o) return;
  const novo=!o.visao_simples;
  try{
    await api('operadores?email=eq.'+encodeURIComponent(email),{method:'PATCH',body:JSON.stringify({visao_simples:novo})});
    o.visao_simples=novo;
    await registrar(novo?'BLOQUEOU':'LIBEROU','Usuário',(o.nome||email)+' — '+(novo?'visão de acompanhamento':'app completo'),null);
    fecharFolha(); abrirAdministracao();
  }catch(e){ alert(e.message); }
}
async function alternarPermissao(campo){
  if(!souAdmin){ alert('Área exclusiva do administrador.'); return; }
  const novo = permissoes[campo]===false;
  const corpo={}; corpo[campo]=novo; corpo.atualizado_em=new Date().toISOString();
  try{
    await api('permissoes_operadores?id=eq.1',{method:'PATCH',body:JSON.stringify(corpo)});
    permissoes[campo]=novo;
    await registrar(novo?'LIBEROU':'BLOQUEOU','Permissão',campo,null);
    fecharFolha(); abrirAdministracao();
  }catch(e){ alert('Não consegui alterar: '+e.message); }
}
// ============================================================
//  BACKUP DOS DADOS
// ============================================================
// Monta um pacote com tudo do banco. Serve para guardar fora do app
// (Drive, e-mail, WhatsApp) e para restaurar se algo se perder.
async function montarBackup(){
  const alvos=['movimentos','contas','produtos','categorias','recorrentes','beneficiarios','historico'];
  const pacote={ app:'Farma Familia', versao:1, gerado_em:new Date().toISOString(), tabelas:{} };
  for(let i=0;i<alvos.length;i++){
    try{ pacote.tabelas[alvos[i]]=await api(alvos[i]+'?select=*')||[]; }
    catch(e){ pacote.tabelas[alvos[i]]=[]; }
  }
  return pacote;
}
function nomeArquivoBackup(){
  const d=new Date();
  const p=function(n){ return String(n).padStart(2,'0'); };
  return 'backup-farmafamilia-'+d.getFullYear()+p(d.getMonth()+1)+p(d.getDate())+'-'+p(d.getHours())+p(d.getMinutes())+'.json';
}
async function baixarBackup(){
  const b=document.getElementById('bkBtn');
  if(b){ b.textContent='Gerando…'; b.disabled=true; }
  try{
    const pacote=await montarBackup();
    const txt=JSON.stringify(pacote);
    const blob=new Blob([txt],{type:'application/json'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a'); a.href=url; a.download=nomeArquivoBackup(); a.click();
    setTimeout(function(){ URL.revokeObjectURL(url); },2000);
    // guarda também uma cópia local (última salva) e a data
    try{ localStorage.setItem('ultimoBackup', new Date().toISOString()); }catch(e){}
    const cont=totaisBackup(pacote);
    if(b){ b.textContent='Salvar backup'; b.disabled=false; }
    alert('Backup gerado.\n\n'+cont+'\n\nGuarde o arquivo no Drive, e-mail ou WhatsApp. Se precisar, ele restaura tudo.');
  }catch(e){
    if(b){ b.textContent='Salvar backup'; b.disabled=false; }
    alert('Não consegui gerar o backup: '+e.message);
  }
}
function totaisBackup(pacote){
  const t=pacote.tabelas||{};
  return (t.movimentos||[]).length+' lançamentos · '+
         (t.contas||[]).length+' contas · '+
         (t.categorias||[]).length+' categorias';
}
function ultimoBackupTexto(){
  try{
    const iso=localStorage.getItem('ultimoBackup');
    if(!iso) return 'Nenhum backup salvo ainda.';
    const d=new Date(iso), ag=new Date();
    const dias=Math.floor((ag-d)/86400000);
    const quando=d.toLocaleDateString('pt-BR')+' '+d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
    return 'Último backup: '+quando+(dias>=3?' — faz '+dias+' dias, vale gerar um novo':'');
  }catch(e){ return ''; }
}

// Restauração: relê um arquivo de backup e reinsere o que estiver faltando
function abrirRestaurar(){
  abrirFolha('Restaurar backup',
    '<div class="dica" style="margin-top:0">Selecione um arquivo de backup (.json). O app vai <b>adicionar de volta</b> os registros que não existem mais. Nada do que está hoje é apagado.</div>'+
    '<label class="foto" style="margin-top:10px"><span>'+IC.baixar+' Escolher arquivo de backup</span>'+
    '<input type="file" accept=".json,application/json" onchange="restaurarBackup(event)" style="display:none"/></label>'+
    '<div id="rsAviso" class="dica"></div>');
}
async function restaurarBackup(ev){
  const f=ev.target.files[0]; if(!f) return;
  const aviso=document.getElementById('rsAviso');
  if(aviso){ aviso.innerHTML='<span class="girando">◜</span> Lendo o arquivo…'; aviso.style.color='var(--muted)'; }
  let pacote=null;
  try{ pacote=JSON.parse(await f.text()); }
  catch(e){ if(aviso){ aviso.textContent='Arquivo inválido.'; aviso.style.color='var(--rose)'; } return; }
  if(!pacote.tabelas){ if(aviso){ aviso.textContent='Este arquivo não parece um backup do Farma Família.'; aviso.style.color='var(--rose)'; } return; }
  if(!confirm('Restaurar a partir de '+(pacote.gerado_em?new Date(pacote.gerado_em).toLocaleString('pt-BR'):'?')+'?\n\n'+totaisBackup(pacote)+'\n\nSó serão adicionados registros que não existem hoje.')) return;

  // ids já presentes, para não duplicar
  const existentes={};
  ['movimentos','contas','categorias','recorrentes','beneficiarios'].forEach(function(tb){
    existentes[tb]={};
    (tb==='movimentos'?movimentos:tb==='contas'?contas:[]).forEach(function(x){ existentes[tb][x.id]=1; });
  });
  let add=0;
  async function repoe(tb){
    const linhas=pacote.tabelas[tb]||[];
    for(let i=0;i<linhas.length;i++){
      const row=linhas[i];
      try{
        await api(tb,{method:'POST',headers:{'Prefer':'resolution=ignore-duplicates'},body:JSON.stringify(row)});
        add++;
      }catch(e){ /* já existe */ }
    }
  }
  try{
    // ordem importa: contas antes de movimentos (por causa do vínculo)
    await repoe('categorias'); await repoe('recorrentes'); await repoe('beneficiarios');
    await repoe('contas'); await repoe('movimentos');
    await recarregar(); fecharFolha();
    alert('Restauração concluída. '+add+' registro(s) adicionado(s) de volta.');
  }catch(e){ if(aviso){ aviso.textContent=e.message; aviso.style.color='var(--rose)'; } }
}

// Lembrete: se faz muitos dias sem backup, avisa uma vez ao abrir
function lembrarBackup(){
  try{
    const iso=localStorage.getItem('ultimoBackup');
    const hoje=hojeISO();
    if(localStorage.getItem('avisoBackupDia')===hoje) return;
    let dias=99;
    if(iso) dias=Math.floor((Date.now()-new Date(iso).getTime())/86400000);
    if(dias>=7){
      localStorage.setItem('avisoBackupDia',hoje);
      setTimeout(function(){
        if(confirm('Faz '+(iso?dias+' dias':'um tempo')+' que não é feito um backup dos dados.\n\nQuer gerar um agora? (leva alguns segundos)')) baixarBackup();
      },1500);
    }
  }catch(e){}
}
// ============================================================
//  HISTÓRICO — registra quem fez o quê
// ============================================================
async function registrar(acao, entidade, descricao, valor, detalhe){
  try{
    const s=Sessao.ler();
    await api('historico',{method:'POST',body:JSON.stringify({
      quem:(s&&s.email)||'?', acao:acao, entidade:entidade,
      descricao:descricao||null, valor:(valor==null?null:valor), detalhe:detalhe||null
    })});
  }catch(e){ /* o registro nunca deve travar a ação principal */ }
}
// Tela do histórico de movimentações
const COR_ACAO={CRIOU:'var(--emerald)',EDITOU:'#8A5A00',PAGOU:'var(--pine)',REABRIU:'#8A5A00',EXCLUIU:'var(--rose)'};
async function abrirHistorico(){
  abrirFolha('Histórico de movimentações','<div class="vazio">Carregando…</div>',null);
  let reg=[];
  try{ reg=await api('historico?select=*&order=quando.desc&limit=200')||[]; }catch(e){}
  const cont=document.querySelector('#overlay .folha');
  if(!cont) return;
  const corpo = reg.length
    ? reg.map(function(h){
        const d=new Date(h.quando);
        const data=d.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'})+' '+d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
        const cor=COR_ACAO[h.acao]||'var(--muted)';
        const podeReverter = h.acao==='EXCLUIU' && h.detalhe;
        return '<div class="item" style="margin-top:6px;display:block">'+
          '<div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px">'+
            '<span class="tag" style="color:'+cor+';background:'+cor+'18">'+h.acao+' · '+h.entidade+'</span>'+
            (h.valor!=null?'<strong class="val2">'+brl(h.valor)+'</strong>':'')+
          '</div>'+
          '<div style="font-size:13.5px;margin-top:5px">'+escapeHtml(h.descricao||'—')+'</div>'+
          '<div style="font-size:11px;color:var(--muted);margin-top:3px">'+data+' · '+escapeHtml(h.quem||'?')+'</div>'+
          (podeReverter?'<button class="pagarBtn" style="margin-top:6px" onclick="restaurarDoHistorico(\''+h.id+'\')">Recuperar este lançamento</button>':'')+
        '</div>';
      }).join('')
    : '<div class="vazio">Ainda não há registros. A partir de agora, tudo que for lançado, editado ou excluído aparece aqui.</div>';
  cont.innerHTML='<div class="folhaTopo"><span class="folhaTitulo">Histórico de movimentações</span><button class="fechar" onclick="fecharFolha()">✕</button></div>'+
    '<div class="dica" style="margin-top:0">Últimos 200 registros. Exclusões podem ser recuperadas.</div>'+corpo;
}
// Recupera um lançamento/conta que foi excluído, a partir da cópia guardada no log
async function restaurarDoHistorico(idLog){
  let reg=null;
  try{ const r=await api('historico?id=eq.'+idLog+'&select=*'); reg=r&&r[0]; }catch(e){}
  if(!reg||!reg.detalhe){ alert('Não há dados guardados para recuperar este item.'); return; }
  const d=reg.detalhe;
  if(!confirm('Recuperar "'+(d.descricao||reg.descricao||'')+'"?')) return;
  try{
    if(reg.entidade==='Entrada'||reg.entidade==='Saída'){
      await api('movimentos',{method:'POST',body:JSON.stringify({
        tipo:d.tipo, categoria:d.categoria, valor:d.valor, descricao:d.descricao, data_hora:d.data_hora||new Date().toISOString()
      })});
    }else{
      await api('contas',{method:'POST',body:JSON.stringify({
        tipo:d.tipo, origem:d.origem, categoria:d.categoria, valor:d.valor,
        vencimento:d.vencimento, status:d.status||'PENDENTE', descricao:d.descricao, documento:d.documento
      })});
    }
    await registrar('CRIOU', reg.entidade, (d.descricao||'')+' (recuperado)', d.valor);
    await recarregar(); fecharFolha();
    alert('Recuperado com sucesso.');
  }catch(e){ alert(e.message); }
}
// ============================================================
//  MENU LATERAL (configurações e ferramentas)
// ============================================================
function abrirMenu(){
  const ov=document.createElement('div');
  ov.className='drawerFundo'; ov.id='drawerFundo';
  ov.onclick=function(e){ if(e.target===ov) fecharMenu(); };
  const s=Sessao.ler();
  const item=function(icone,titulo,sub,acao){
    return '<button class="drItem" onclick="fecharMenu();'+acao+'">'+
      '<div class="drIcone">'+icone+'</div>'+
      '<div><div class="drTit">'+titulo+'</div>'+(sub?'<div class="drSub">'+sub+'</div>':'')+'</div></button>';
  };
  if(visaoSimples){
    ov.innerHTML='<div class="drawer" id="drawer">'+
      '<div class="drTopo"><div class="marca"><img src="icone-192.png" alt=""/></div>'+
        '<div><div class="drNome">Farma Família</div><div class="drEmail">'+escapeHtml((s&&s.email)||'')+'</div>'+
        '<span class="selo seloOp">Acompanhamento</span></div></div>'+
      '<div class="drSecao">Ver</div>'+
      item(IC.rel,'Evolução da farmácia','Últimos 6 meses',"abrirEvolucao()")+
      '<div class="drSecao">Conta</div>'+
      item(IC.sair,'Sair do aplicativo','',"sair()")+
      '<div class="drRodape">Farma Família · build 2026-09-07-1</div></div>';
    document.body.appendChild(ov);
    requestAnimationFrame(function(){ const d=document.getElementById('drawer'); if(d) d.classList.add('drAberto'); });
    return;
  }
  ov.innerHTML='<div class="drawer" id="drawer">'+
    '<div class="drTopo"><div class="marca"><img src="icone-192.png" alt=""/></div>'+
      '<div><div class="drNome">Farma Família</div><div class="drEmail">'+escapeHtml((s&&s.email)||'')+'</div>'+
      (souAdmin?'<span class="selo">Administrador</span>':'<span class="selo seloOp">Operador</span>')+'</div></div>'+

    '<div class="drSecao">Categorias</div>'+
    item(IC.rel,'Reclassificar categorias','Corrigir a categoria em massa',"abrirReclassificar()")+
    item(IC.contas,'Gerenciar categorias','Criar, renomear, excluir',"abrirGerenciarCategorias()")+

    '<div class="drSecao">Contas</div>'+
    item(IC.relogio,'Contas de todo mês','Aluguel, luz, salário…',"abrirRecorrentes()")+
    item(IC.alerta,'Avisos de vencimento',(avisosLigados()?'Ligados':'Desligados'),"pedirPermissaoAviso()")+

    (souAdmin?'<div class="drSecao">Administração</div>'+
      item(IC.sair,'Usuários e permissões','Quem pode o quê',"abrirAdministracao()"):'')+

    (souAdmin?'<div class="drSecao">Backup e segurança</div>'+
      item(IC.baixar,'Salvar backup',ultimoBackupTexto(),"baixarBackup()")+
      item(IC.rel,'Restaurar backup','Recuperar de um arquivo',"abrirRestaurar()"):'')+

    '<div class="drSecao">Conferência</div>'+
    item(IC.relogio,'Histórico de movimentações','Quem lançou, editou ou excluiu',"abrirHistorico()")+
    item(IC.lupa,'Auditoria dos dados','Verifica a sincronização',"abrirAuditoria()")+
    item(IC.contas,'Lançamentos repetidos','Procura duplicidades',"conferirDuplicados()")+
    item(IC.baixar,'Exportar CSV','Planilha do período',"irPara('rel')")+

    '<div class="drRodape">Farma Família · controle comercial · build 2026-09-07-1</div>'+
  '</div>';
  document.body.appendChild(ov);
  requestAnimationFrame(function(){ const d=document.getElementById('drawer'); if(d) d.classList.add('drAberto'); });
}
function fecharMenu(){ const o=document.getElementById('drawerFundo'); if(o) o.remove(); }

// ============================================================
//  AUDITORIA — confere se as tabelas estão sincronizadas
// ============================================================
function normNome(t){ return String(t||'').toUpperCase().replace(/[^A-Z0-9]/g,''); }

function rodarAuditoria(){
  const p=[];   // problemas encontrados
  const mapaContas={}; contas.forEach(function(c){ mapaContas[c.id]=c; });
  const movPorConta={}; movimentos.forEach(function(m){ if(m.contaId) (movPorConta[m.contaId]=movPorConta[m.contaId]||[]).push(m); });

  // 1) conta paga sem lançamento no caixa
  contas.forEach(function(c){
    if(c.status==='PAGO' && !(movPorConta[c.id]||[]).length)
      p.push({g:'Conta paga sem lançamento no caixa', t:c.desc+' — '+brl(c.valor), corrige:null});
  });
  // 2) lançamento ligado a conta não paga
  movimentos.forEach(function(m){
    const c=m.contaId?mapaContas[m.contaId]:null;
    if(c && c.status!=='PAGO')
      p.push({g:'Lançamento existe, mas a conta está em aberto', t:c.desc+' — '+brl(c.valor), corrige:{tipo:'marcarPago', id:c.id}});
  });
  // 3,4,5) divergências entre conta e lançamento
  movimentos.forEach(function(m){
    const c=m.contaId?mapaContas[m.contaId]:null; if(!c) return;
    if((m.categoria||'')!==(c.categoria||''))
      p.push({g:'Categoria diferente entre conta e caixa', t:c.desc+': conta "'+(c.categoria||'sem')+'" x caixa "'+(m.categoria||'sem')+'"',
              corrige:{tipo:'catConta', id:c.id, valor:m.categoria}});
    if(Math.abs(m.valor-c.valor)>0.005)
      p.push({g:'Valor diferente entre conta e caixa', t:c.desc+': '+brl(c.valor)+' x '+brl(m.valor), corrige:null});
    if(!textoIgual(m.desc,c.desc))
      p.push({g:'Descrição diferente entre conta e caixa', t:'"'+c.desc+'" x "'+m.desc+'"',
              corrige:{tipo:'descMov', id:m.id, valor:c.desc}});
  });
  // 6) sem categoria
  contas.forEach(function(c){ if(!c.categoria) p.push({g:'Conta sem categoria', t:c.desc+' — '+brl(c.valor), corrige:null}); });
  movimentos.forEach(function(m){ if(!m.categoria) p.push({g:'Lançamento sem categoria', t:(m.desc||'—')+' — '+brl(m.valor), corrige:null}); });

  // 7) nomes parecidos (possível mesma empresa escrita diferente)
  const nomes={};
  contas.forEach(function(c){ if(c.tipo==='PAGAR') nomes[c.desc]=(nomes[c.desc]||0)+1; });
  movimentos.forEach(function(m){ if(m.tipo==='SAIDA'&&m.desc) nomes[m.desc]=(nomes[m.desc]||0)+1; });
  const chaves=Object.keys(nomes);
  const jaVistos={};
  for(let i=0;i<chaves.length;i++){
    for(let j=i+1;j<chaves.length;j++){
      const a=chaves[i], b=chaves[j];
      const na=normNome(a), nb=normNome(b);
      if(na===nb) continue;
      const iguaisOrdenadas = na.split('').sort().join('')===nb.split('').sort().join('');
      const curto=na.length<nb.length?na:nb, longo=na.length<nb.length?nb:na;
      const umDentroDoOutro = curto.length>=2 && longo.length>curto.length+2 && longo.indexOf(curto)===0;
      if(iguaisOrdenadas || umDentroDoOutro){
        const k=[a,b].sort().join('||'); if(jaVistos[k]) continue; jaVistos[k]=1;
        p.push({g:'Nomes parecidos — pode ser a mesma empresa', t:'"'+a+'" ('+nomes[a]+'x) e "'+b+'" ('+nomes[b]+'x)',
                corrige:{tipo:'unificar', de:(nomes[a]<nomes[b]?a:b), para:(nomes[a]<nomes[b]?b:a)}});
      }
    }
  }
  return p;
}

function abrirAuditoria(){
  const p=rodarAuditoria();
  const grupos={};
  p.forEach(function(x){ (grupos[x.g]=grupos[x.g]||[]).push(x); });
  const nomesG=Object.keys(grupos);

  abrirFolha('Auditoria dos dados',
    (p.length
      ? '<div class="totalAberto" style="background:#FDECEC;border-color:#F0C4CB;color:var(--rose)">'+
          '<span>'+p.length+' ponto(s) a revisar</span><strong>'+nomesG.length+' tipo(s)</strong></div>'+
        nomesG.map(function(g){
          return '<h2 class="sec" style="margin-top:12px">'+g+' ('+grupos[g].length+')</h2>'+
            grupos[g].map(function(x,idx){
              const chave=g+'|'+idx;
              return '<div class="item" style="margin-top:6px;display:block">'+
                '<div style="font-size:13.5px">'+escapeHtml(x.t)+'</div>'+
                (x.corrige?'<button class="pagarBtn" style="margin-top:6px" onclick="corrigirAuditoria(\''+encodeURIComponent(JSON.stringify(x.corrige))+'\')">Corrigir</button>':
                           '<div class="dica" style="margin-top:4px">Revise manualmente.</div>')+
              '</div>';
            }).join('');
        }).join('')
      : '<div class="vazio">Tudo sincronizado. Nenhuma inconsistência encontrada.</div>')+
    '<div class="dica">Verifica: contas x caixa (valor, data, categoria, descrição), itens sem categoria e nomes escritos de formas diferentes.</div>');
}

async function corrigirAuditoria(dadosEnc){
  const d=JSON.parse(decodeURIComponent(dadosEnc));
  try{
    if(d.tipo==='catConta'){
      await api('contas?id=eq.'+d.id,{method:'PATCH',body:JSON.stringify({categoria:d.valor||null})});
    }else if(d.tipo==='descMov'){
      await api('movimentos?id=eq.'+d.id,{method:'PATCH',body:JSON.stringify({descricao:d.valor})});
    }else if(d.tipo==='marcarPago'){
      await api('contas?id=eq.'+d.id,{method:'PATCH',body:JSON.stringify({status:'PAGO'})});
    }else if(d.tipo==='unificar'){
      if(!confirm('Passar tudo que está como "'+d.de+'" para "'+d.para+'"?')) return;
      const movs=movimentos.filter(function(m){ return m.desc===d.de; });
      const cts=contas.filter(function(c){ return c.desc===d.de; });
      for(let i=0;i<movs.length;i++) await api('movimentos?id=eq.'+movs[i].id,{method:'PATCH',body:JSON.stringify({descricao:d.para})});
      for(let i=0;i<cts.length;i++) await api('contas?id=eq.'+cts[i].id,{method:'PATCH',body:JSON.stringify({descricao:d.para})});
    }
    await registrar('EDITOU','Auditoria', d.tipo==='unificar'?('Unificou "'+d.de+'" em "'+d.para+'"'):('Correção: '+d.tipo), null);
    await recarregar();
    fecharFolha(); abrirAuditoria();
  }catch(e){ alert(e.message); }
}
// ============================================================
//  PAINEL DE VENCIMENTOS (contas em aberto por período)
// ============================================================
function fimDaSemana(){   // próximos 7 dias, contando hoje
  return inicioDia()+7*86400000;
}
function fimDoMes(){
  const d=new Date();
  return new Date(d.getFullYear(), d.getMonth()+1, 1).getTime();
}
function painelVencimentos(lista){
  const abertas=lista.filter(function(c){ return c.status!=='PAGO'; });
  const hoje0=inicioDia(), amanha=hoje0+86400000;
  const grupo={atrasado:[], hoje:[], semana:[], mes:[], depois:[]};
  abertas.forEach(function(c){
    const t=new Date(c.venc+'T12:00:00').getTime();
    if(t<hoje0) grupo.atrasado.push(c);
    else if(t<amanha) grupo.hoje.push(c);
    else if(t<fimDaSemana()) grupo.semana.push(c);
    else if(t<fimDoMes()) grupo.mes.push(c);
    else grupo.depois.push(c);
  });
  const soma=function(a){ return a.reduce(function(s,c){ return s+c.valor; },0); };
  const totalGeral=soma(abertas);

  if(!abertas.length) return '';

  function bloco(rot,arr,cor,fundo,filtro){
    return '<button class="vcCard" style="background:'+fundo+'" onclick="filtroVenc=\''+filtro+'\';render()">'+
      '<div class="vcRot" style="color:'+cor+'">'+rot+'</div>'+
      '<div class="vcVal" style="color:'+cor+'">'+brl(soma(arr))+'</div>'+
      '<div class="vcQtd">'+arr.length+' conta'+(arr.length===1?'':'s')+'</div></button>';
  }
  // acumulados: semana inclui hoje e atrasados; mês inclui tudo até o fim do mês
  const ateHoje=grupo.atrasado.concat(grupo.hoje);
  const ateSemana=ateHoje.concat(grupo.semana);
  const ateMes=ateSemana.concat(grupo.mes);

  return '<section class="vcTotal">'+
      '<div class="vcTotalRot">Total em aberto</div>'+
      '<div class="vcTotalVal">'+brl(totalGeral)+'</div>'+
      '<div class="vcTotalSub">'+abertas.length+' conta'+(abertas.length===1?'':'s')+
        (grupo.atrasado.length?' · '+grupo.atrasado.length+' em atraso':'')+'</div>'+
    '</section>'+
    '<div class="vcGrade">'+
      bloco('Vence hoje', ateHoje, 'var(--rose)', '#FDECEC', 'hoje')+
      bloco('Nesta semana', ateSemana, '#8A5A00', '#FDF1DC', 'semana')+
      bloco('Neste mês', ateMes, 'var(--pine)', 'var(--amberSoft)', 'mes')+
      bloco('Depois', grupo.depois, 'var(--muted)', '#EEEAE9', 'depois')+
    '</div>'+
    (filtroVenc!=='todos'
      ? '<button class="btnS" style="width:100%" onclick="filtroVenc=\'todos\';render()">Mostrando: '+rotuloFiltro(filtroVenc)+' — ver todas</button>'
      : '');
}
let filtroVenc='todos';
function rotuloFiltro(f){
  return f==='hoje'?'vence hoje e atrasadas':f==='semana'?'até 7 dias':f==='mes'?'até o fim do mês':f==='depois'?'depois deste mês':'todas';
}
function aplicaFiltroVenc(lista){
  if(filtroVenc==='todos') return lista;
  const hoje0=inicioDia(), amanha=hoje0+86400000;
  return lista.filter(function(c){
    if(c.status==='PAGO') return false;
    const t=new Date(c.venc+'T12:00:00').getTime();
    if(filtroVenc==='hoje')   return t<amanha;
    if(filtroVenc==='semana') return t<fimDaSemana();
    if(filtroVenc==='mes')    return t<fimDoMes();
    if(filtroVenc==='depois') return t>=fimDoMes();
    return true;
  });
}
// ============================================================
//  1) RECLASSIFICAR CATEGORIAS EM MASSA
// ============================================================
function abrirReclassificar(){
  const grupos={};
  function juntar(desc,valor,cat){
    const k=desc||'(sem descrição)';
    if(!grupos[k]) grupos[k]={desc:k, qtd:0, total:0, cats:{}};
    grupos[k].qtd++; grupos[k].total+=valor;
    const c=cat||'Outros';
    grupos[k].cats[c]=(grupos[k].cats[c]||0)+1;
  }
  movimentos.forEach(function(m){ if(m.tipo==='SAIDA') juntar(m.desc,m.valor,m.categoria); });
  contas.forEach(function(c){ if(c.tipo==='PAGAR') juntar(c.desc,0,c.categoria); });
  const lista=Object.keys(grupos).map(function(k){ return grupos[k]; })
    .sort(function(a,b){ return b.total-a.total; });

  abrirFolha('Reclassificar categorias',
    '<div class="dica" style="margin-top:0">Toque num item para trocar a categoria de <b>todos</b> os lançamentos com aquela descrição.</div>'+
    lista.map(function(g){
      const cats=Object.keys(g.cats);
      const catAtual=cats.length===1?cats[0]:cats.join(' / ');
      return '<div class="item" style="margin-top:8px;cursor:pointer" onclick="trocarCategoriaGrupo(\''+encodeURIComponent(g.desc)+'\')">'+
        '<div style="flex:1"><div style="font-size:14px;font-weight:500">'+escapeHtml(g.desc)+'</div>'+
        '<div style="font-size:11.5px;color:var(--muted)">'+g.qtd+'x · '+escapeHtml(catAtual)+'</div></div>'+
        '<div class="val2">'+brl(g.total)+'</div></div>';
    }).join(''));
}
let grupoAlvo=null;
function trocarCategoriaGrupo(descEnc){
  grupoAlvo=decodeURIComponent(descEnc);
  fecharFolha();
  abrirFolha('Categoria de: '+grupoAlvo,
    '<div class="chips" id="rcCats"></div>'+
    '<div class="dica">A mudança vale para todos os lançamentos com essa descrição.</div>',
    function(){
      document.getElementById('rcCats').innerHTML=CATS.SAIDA.map(function(c){
        return '<button class="chip" onclick="aplicarCategoriaGrupo(\''+escapeAttrJs(c)+'\')">'+escapeHtml(c)+'</button>';
      }).join('')+'<button class="chip chipNova" onclick="novaCategoria(\'SAIDA\',\'grupo\')">+ nova</button>';
    });
}
async function aplicarCategoriaGrupo(cat){
  if(!grupoAlvo) return;
  const alvos=movimentos.filter(function(m){ return m.tipo==='SAIDA' && (m.desc||'(sem descrição)')===grupoAlvo; });
  // as contas com a mesma descrição também mudam, para as duas telas baterem
  const alvosContas=contas.filter(function(c){ return textoIgual(c.desc,grupoAlvo); });
  if(!alvos.length && !alvosContas.length) return;
  if(!confirm('Marcar como "'+cat+'":\n\n· '+alvos.length+' lançamento(s) do caixa\n· '+alvosContas.length+' conta(s)\n\nConfirmar?')) return;
  try{
    for(let i=0;i<alvos.length;i++){
      await api('movimentos?id=eq.'+alvos[i].id,{method:'PATCH',body:JSON.stringify({categoria:cat})});
    }
    for(let i=0;i<alvosContas.length;i++){
      await api('contas?id=eq.'+alvosContas[i].id,{method:'PATCH',body:JSON.stringify({categoria:cat})});
    }
    await registrar('EDITOU','Categoria','Reclassificou "'+grupoAlvo+'" como "'+cat+'"',null,{lancamentos:alvos.length,contas:alvosContas.length});
    fecharFolha(); await recarregar();
    alert('Pronto: '+alvos.length+' lançamento(s) e '+alvosContas.length+' conta(s) como "'+cat+'".');
  }catch(e){ alert(e.message); }
}

// ============================================================
//  2) CONTAS RECORRENTES
// ============================================================
let recorrentes=[];
async function carregarRecorrentes(){
  try{ recorrentes=await api('recorrentes?select=*&order=descricao.asc')||[]; }catch(e){ recorrentes=[]; }
}
function competenciaAtual(){ const d=new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'); }

// Gera as contas do mês corrente que ainda não existem
async function gerarRecorrentes(){
  const comp=competenciaAtual();
  const [ano,mes]=comp.split('-').map(Number);
  let criadas=0;
  for(let i=0;i<recorrentes.length;i++){
    const r=recorrentes[i];
    if(!r.ativo || r.ultimo_mes===comp) continue;
    const ultimoDia=new Date(ano,mes,0).getDate();
    const dia=Math.min(r.dia,ultimoDia);
    const venc=ano+'-'+String(mes).padStart(2,'0')+'-'+String(dia).padStart(2,'0');
    try{
      await api('contas',{method:'POST',body:JSON.stringify({
        tipo:r.tipo, origem:r.origem, categoria:r.categoria,
        descricao:r.descricao, valor:r.valor, vencimento:venc,
        status:'PENDENTE', recorrente_id:r.id, competencia:comp
      })});
      await api('recorrentes?id=eq.'+r.id,{method:'PATCH',body:JSON.stringify({ultimo_mes:comp})});
      criadas++;
    }catch(e){ /* já existe: índice único impede duplicar */ }
  }
  if(criadas){ await carregarRecorrentes(); await recarregar(); }
  return criadas;
}

function abrirRecorrentes(){
  abrirFolha('Contas de todo mês',
    '<div class="dica" style="margin-top:0">Cadastre uma vez. Todo mês o app cria a conta sozinho.</div>'+
    (recorrentes.length?recorrentes.map(function(r){
      return '<div class="item" style="margin-top:8px"><div style="flex:1">'+
        '<div style="font-size:14px;font-weight:500">'+r.descricao+'</div>'+
        '<div style="font-size:11.5px;color:var(--muted)">todo dia '+r.dia+(r.categoria?' · '+r.categoria:'')+(r.ativo?'':' · pausada')+'</div></div>'+
        '<div style="text-align:right"><div class="val2">'+brl(r.valor)+'</div>'+
        '<button class="lixo" onclick="apagarRecorrente(\''+r.id+'\')">'+IC.lixo+'</button></div></div>';
    }).join(''):'<div class="vazio">Nenhuma conta recorrente ainda.</div>')+
    '<button class="primario" onclick="abrirNovaRecorrente()">Adicionar conta recorrente</button>');
}
let recCat='Outros';
function abrirNovaRecorrente(){
  recCat='Outros'; fecharFolha();
  abrirFolha('Nova conta de todo mês',
    '<label class="campo">Descrição</label><input id="rd" list="sugConta2" placeholder="Ex: Aluguel, Internet, Energia"/>'+listaSugestoes('sugConta2')+
    '<label class="campo">Valor</label><input id="rv" inputmode="numeric" placeholder="0,00" oninput="mascaraMoeda(this);previa(\'rv\',\'rPrev\')"/><div id="rPrev" class="previa"></div>'+
    '<label class="campo">Vence todo dia</label><input id="rdia" type="number" min="1" max="31" value="10"/>'+
    '<label class="campo">Categoria</label><div class="chips" id="rCats"></div>'+
    '<button class="primario" id="rBtn">Salvar</button>',
    function(){
      document.getElementById('rCats').innerHTML=CATS.SAIDA.map(function(c){
        return '<button class="chip '+(c===recCat?'on':'')+'" onclick="recCat=\''+escapeAttrJs(c)+'\';document.querySelectorAll(\'#rCats .chip\').forEach(function(x){x.classList.remove(\'on\')});event.target.classList.add(\'on\')">'+escapeHtml(c)+'</button>';
      }).join('');
      document.getElementById('rd').focus();
      document.getElementById('rBtn').onclick=salvarRecorrente;
    });
}
async function salvarRecorrente(){
  const d=document.getElementById('rd').value.trim();
  const v=parseValor(document.getElementById('rv').value);
  const dia=Number(document.getElementById('rdia').value||0);
  if(!d||!v||isNaN(v)||dia<1||dia>31){ alert('Preencha descrição, valor e dia (1 a 31).'); return; }
  const b=document.getElementById('rBtn'); b.textContent='Salvando…'; b.disabled=true;
  try{
    await api('recorrentes',{method:'POST',body:JSON.stringify({
      descricao:d, valor:v, dia:dia, categoria:recCat, tipo:'PAGAR', origem:'MANUAL'
    })});
    await carregarRecorrentes();
    const n=await gerarRecorrentes();
    fecharFolha();
    alert('Conta recorrente criada.'+(n?' A conta deste mês já foi gerada.':''));
  }catch(e){ alert(e.message); b.textContent='Salvar'; b.disabled=false; }
}
async function apagarRecorrente(id){
  if(!confirm('Parar de gerar esta conta todo mês?\n\nAs contas já criadas continuam.')) return;
  try{ await api('recorrentes?id=eq.'+id,{method:'DELETE'}); await carregarRecorrentes(); fecharFolha(); abrirRecorrentes(); }
  catch(e){ alert(e.message); }
}

// ============================================================
//  3) AVISO DE VENCIMENTO
// ============================================================
function contasVencendo(dias){
  const limite=Date.now()+dias*86400000;
  return contas.filter(function(c){
    return c.tipo==='PAGAR' && c.status!=='PAGO' && new Date(c.venc+'T12:00:00').getTime()<=limite;
  });
}
async function pedirPermissaoAviso(){
  if(!('Notification' in window)){ alert('Este navegador não envia avisos.'); return; }
  const p=await Notification.requestPermission();
  if(p==='granted'){ try{ localStorage.setItem('avisos','1'); }catch(e){}; avisarVencimentos(true); }
  else alert('Permissão negada. Você pode liberar nas configurações do navegador.');
}
function avisosLigados(){ try{ return localStorage.getItem('avisos')==='1'; }catch(e){ return false; } }
function avisarVencimentos(forcar){
  if(!('Notification' in window) || Notification.permission!=='granted') return;
  if(!avisosLigados() && !forcar) return;
  const hoje=hojeISO();
  try{ if(!forcar && localStorage.getItem('avisoDia')===hoje) return; }catch(e){}
  const venc=contasVencendo(2);
  const atras=contas.filter(function(c){ return c.tipo==='PAGAR'&&c.status!=='PAGO'&&diasAte(c.venc)<0; });
  if(!venc.length && !atras.length) { if(forcar) alert('Nenhuma conta vencendo nos próximos dias.'); return; }
  const total=venc.reduce(function(s,c){ return s+c.valor; },0);
  let corpo='';
  if(venc.length) corpo+=venc.length+' conta(s) vencendo — '+brl(total);
  if(atras.length) corpo+=(corpo?' · ':'')+atras.length+' em atraso';
  try{
    new Notification('Farma Família', { body:corpo, icon:'icone-192.png', badge:'icone-192.png', tag:'vencimentos' });
    localStorage.setItem('avisoDia',hoje);
  }catch(e){}
}

// ============================================================
//  4) COMPARATIVO ENTRE MESES
// ============================================================
function limitesMes(ano,mes){                 // mes: 1-12
  return [new Date(ano,mes-1,1).getTime(), new Date(ano,mes,1).getTime()];
}
// Categorias que representam ponto de partida, não movimento do mês.
// Entram no saldo acumulado total, mas ficam fora do desempenho mensal.
const CATS_FORA_DO_MES=['Saldo Inicial'];
function resumoMes(ano,mes){
  const iv=limitesMes(ano,mes);
  let ent=0, sai=0;
  movimentos.forEach(function(m){
    if(m.ts<iv[0]||m.ts>=iv[1]) return;
    if(CATS_FORA_DO_MES.indexOf(m.categoria)>=0) return;   // saldo inicial não é "resultado do mês"
    if(m.tipo==='ENTRADA') ent+=m.valor; else sai+=m.valor;
  });
  const vendas=somaMov('ENTRADA',iv[0],iv[1],'Venda');
  const cats={};
  movimentos.forEach(function(m){
    if(m.tipo!=='SAIDA'||m.ts<iv[0]||m.ts>=iv[1]) return;
    const c=m.categoria||'Outros'; cats[c]=(cats[c]||0)+m.valor;
  });
  return {ent:ent, sai:sai, saldo:ent-sai, vendas:vendas, cats:cats};
}
function variacao(atual,anterior){
  if(!anterior) return atual? {txt:'novo', cor:'var(--muted)'} : {txt:'—', cor:'var(--muted)'};
  const p=((atual-anterior)/anterior)*100;
  const sinal=p>=0?'+':'';
  return {txt:sinal+p.toFixed(0)+'%', cor:p>=0?'var(--emerald)':'var(--rose)', pct:p};
}
const NOMES_MES=['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
function abrirComparativo(){
  const hoje=new Date();
  const ano=hoje.getFullYear(), mes=hoje.getMonth()+1;
  const antMes = mes===1?12:mes-1, antAno = mes===1?ano-1:ano;
  const A=resumoMes(ano,mes), B=resumoMes(antAno,antMes);
  const rotA=NOMES_MES[mes-1]+'/'+String(ano).slice(2), rotB=NOMES_MES[antMes-1]+'/'+String(antAno).slice(2);

  // cartão grande: saldo do mês
  const vSaldo=variacao(A.saldo,B.saldo);
  const heroi='<section class="cmpHero">'+
      '<div class="cmpHeroRot">Saldo de '+rotA+'</div>'+
      '<div class="cmpHeroVal">'+brl(A.saldo)+'</div>'+
      '<div class="cmpHeroSub">'+rotB+': '+brl(B.saldo)+
        ' <span class="cmpBadge" style="background:'+(A.saldo>=B.saldo?'#1E7A55':'#8E1A15')+'">'+vSaldo.txt+'</span></div>'+
    '</section>';

  // cartões de indicador
  function cartao(rot,a,b,menorEhMelhor){
    const v=variacao(a,b);
    let cor=v.cor;
    if(menorEhMelhor && v.pct!==undefined) cor = v.pct>0?'var(--rose)':'var(--emerald)';
    const larg=Math.max(a,b)>0 ? Math.round(a/Math.max(a,b)*100) : 0;
    const largB=Math.max(a,b)>0 ? Math.round(b/Math.max(a,b)*100) : 0;
    return '<div class="cmpCard">'+
      '<div class="cmpCardTopo"><span>'+rot+'</span><strong style="color:'+cor+'">'+v.txt+'</strong></div>'+
      '<div class="cmpCardVal">'+brl(a)+'</div>'+
      '<div class="cmpMini">'+rotB+' '+brl(b)+'</div>'+
      '<div class="cmpBarras">'+
        '<div class="cmpBarra"><span style="width:'+largB+'%;background:#C9BFBD"></span></div>'+
        '<div class="cmpBarra"><span style="width:'+larg+'%;background:'+(menorEhMelhor?'var(--rose)':'var(--emerald)')+'"></span></div>'+
      '</div></div>';
  }

  // categorias com barras comparadas
  const todas={};
  Object.keys(A.cats).forEach(function(c){ todas[c]=1; });
  Object.keys(B.cats).forEach(function(c){ todas[c]=1; });
  const ordem=Object.keys(todas).sort(function(x,y){ return (A.cats[y]||0)-(A.cats[x]||0); });
  const maxCat=ordem.reduce(function(m,c){ return Math.max(m,A.cats[c]||0,B.cats[c]||0); },0);

  const blocosCat = ordem.length ? ordem.map(function(c){
    const a=A.cats[c]||0, b=B.cats[c]||0;
    const v=variacao(a,b);
    const cor = v.pct===undefined ? 'var(--muted)' : (v.pct>0?'var(--rose)':'var(--emerald)');
    return '<div class="cmpCat">'+
      '<div class="cmpCardTopo"><span>'+c+'</span><strong style="color:'+cor+'">'+v.txt+'</strong></div>'+
      '<div class="cmpBarras" style="margin-top:6px">'+
        '<div class="cmpBarra"><span style="width:'+(maxCat?Math.round(b/maxCat*100):0)+'%;background:#C9BFBD"></span><em>'+brl(b)+'</em></div>'+
        '<div class="cmpBarra"><span style="width:'+(maxCat?Math.round(a/maxCat*100):0)+'%;background:var(--pineSoft)"></span><em>'+brl(a)+'</em></div>'+
      '</div></div>';
  }).join('') : '<div class="vazio">Sem saídas nos dois meses.</div>';

  abrirFolha('Comparativo · '+rotB+' → '+rotA,
    heroi+
    '<div class="cmpGrade">'+
      cartao('Vendas',A.vendas,B.vendas,false)+
      cartao('Entradas',A.ent,B.ent,false)+
      cartao('Saídas',A.sai,B.sai,true)+
    '</div>'+
    '<h2 class="sec" style="margin-top:14px">Saídas por categoria</h2>'+
    blocosCat+
    '<div class="dica">Barra cinza = '+rotB+'. Barra colorida = '+rotA+'. Nas saídas, verde significa que gastou menos.</div>');
}

// ---- Verificação de lançamento repetido ----
function textoIgual(a,b){ return String(a||'').trim().toLowerCase()===String(b||'').trim().toLowerCase(); }

// Procura uma conta já cadastrada igual à que está sendo salva. Só é
// considerado duplicado quando os TRÊS baterem ao mesmo tempo: código de
// barras completo (linha digitável), vencimento e valor. Se faltar
// qualquer um dos três — ou não tiver a linha digitável pra comparar —
// o app não assume que é repetido.
function contaRepetida(d){
  if(!d.linha) return null;
  for(let i=0;i<contas.length;i++){
    const c=contas[i];
    if(c.linha && c.linha===d.linha &&
       c.venc===d.vencimento &&
       Math.abs(c.valor-d.valor)<0.005){
      return {conta:c, motivo:'mesmo código de barras, vencimento e valor', forte:true};
    }
  }
  return null;
}

// Procura um lançamento de caixa igual (mesmo dia, valor e descrição)
function movimentoRepetido(d){
  const dia=String(d.data).slice(0,10);
  for(let i=0;i<movimentos.length;i++){
    const m=movimentos[i];
    const diaM=dataLocal(m.ts);
    if(m.tipo===d.tipo && Math.abs(m.valor-d.valor)<0.005 && diaM===dia && textoIgual(m.desc,d.descricao))
      return m;
  }
  return null;
}

// Mostra o aviso e devolve true se a pessoa quiser salvar mesmo assim
function confirmarRepetido(r){
  const c=r.conta;
  return new Promise(function(resolve){
    const ov=document.createElement('div');
    ov.className='overlay';
    const corIcone = r.forte ? 'var(--rose)' : '#8A5A00';
    const corFundo = r.forte ? '#FDECEC' : '#FDF1DC';
    ov.innerHTML='<div class="folha"><div class="folhaAlca"></div>'+
      '<div style="display:flex;align-items:center;gap:10px;margin-bottom:4px">'+
        '<div class="iconC" style="background:'+corFundo+';color:'+corIcone+'">'+IC.alerta+'</div>'+
        '<span class="folhaTitulo">'+(r.forte?'Isso já existe':'Parece repetido')+'</span>'+
      '</div>'+
      '<div class="dica" style="margin-top:10px">'+r.motivo+'</div>'+
      '<div class="item" style="margin-top:8px;flex-direction:column;align-items:stretch">'+
        '<div style="font-size:12px;color:var(--muted)">Lançamento já existente</div>'+
        '<div style="font-size:15px;font-weight:600;margin-top:2px">'+escapeHtml(c.desc||'sem descrição')+'</div>'+
        '<div style="display:flex;justify-content:space-between;margin-top:8px;font-size:13.5px">'+
          '<strong>'+brl(c.valor)+'</strong><span style="color:var(--muted)">vence '+dm(c.venc)+'</span>'+
        '</div>'+
        (c.status==='PAGO'?'<div style="font-size:12px;color:var(--emerald);margin-top:5px;font-weight:600">já paga</div>':'')+
      '</div>'+
      '<button class="primario" style="margin-top:18px" id="repSalvar">Salvar assim mesmo</button>'+
      '<button class="btnS" style="width:100%;margin-top:8px" id="repCancelar">Cancelar</button>'+
    '</div>';
    document.body.appendChild(ov);
    function fechar(v){ ov.remove(); resolve(v); }
    ov.onclick=function(e){ if(e.target===ov) fechar(false); };
    ov.querySelector('#repSalvar').onclick=function(){ fechar(true); };
    ov.querySelector('#repCancelar').onclick=function(){ fechar(false); };
  });
}
// ---- Identificação do beneficiário pelo código de barras ----
// O nome da distribuidora NÃO vem no código de barras. O que vem é banco +
// campo livre, e dentro do campo livre estão a agência/conta do beneficiário.
// O problema: cada banco (e cada carteira) põe esses dados numa posição
// diferente. Em vez de tentar adivinhar o layout, guardamos o código inteiro
// e comparamos POSIÇÃO POR POSIÇÃO com os já conhecidos: os dígitos da conta
// são iguais entre boletos da mesma empresa, onde quer que estejam.
let beneficiarios=[];   // [{chave,nome,codigo_barras,banco,vezes}]

function campoLivreDe(cb){
  const d=String(cb).replace(/\D/g,'');
  return d.length===44 ? d.slice(19,44) : null;
}
function bancoDe(cb){
  const d=String(cb).replace(/\D/g,'');
  return d.length===44 ? d.slice(0,3) : null;
}
// chave grosseira: banco + começo do campo livre (carteira/convênio costuma ser estável)
function chaveBeneficiario(cb){
  const d=String(cb).replace(/\D/g,'');
  const cl=campoLivreDe(d);
  if(!cl) return null;
  return d.slice(0,3)+'-'+cl.slice(0,6);
}
// quantas posições do campo livre coincidem entre dois códigos
function semelhanca(cbA,cbB){
  const a=campoLivreDe(cbA), b=campoLivreDe(cbB);
  if(!a||!b) return 0;
  let iguais=0;
  for(let i=0;i<25;i++) if(a[i]===b[i]) iguais++;
  return iguais;
}
// Procura a empresa mais parecida. Exige banco igual e semelhança alta,
// para não sugerir o fornecedor errado.
const MIN_SEMELHANCA=13;      // de 25 posições do campo livre
function reconhecerBeneficiario(cb){
  const banco=bancoDe(cb);
  if(!banco) return null;
  let melhor=null, melhorPonto=0, segundoPonto=0;
  for(let i=0;i<beneficiarios.length;i++){
    const b=beneficiarios[i];
    if(b.banco && b.banco!==banco) continue;
    let ponto=0;
    if(b.codigo_barras){
      ponto=semelhanca(cb,b.codigo_barras);
    }else if(b.chave && b.chave===chaveBeneficiario(cb)){
      ponto=MIN_SEMELHANCA;   // compatibilidade com o que foi aprendido antes
    }
    if(ponto>melhorPonto){ segundoPonto=melhorPonto; melhorPonto=ponto; melhor=b; }
    else if(ponto>segundoPonto){ segundoPonto=ponto; }
  }
  if(melhor && melhorPonto>=MIN_SEMELHANCA) return {nome:melhor.nome, forca:melhorPonto};
  return null;
}
// "Nosso número" — extração aproximada, só para exibir/registrar
function documentoDe(cb){
  const d=String(cb).replace(/\D/g,'');
  const cl=campoLivreDe(d);
  if(!cl) return null;
  if(d.slice(0,3)==='341') return cl.slice(0,3)+'/'+cl.slice(3,11)+'-'+cl.slice(11,12);
  return cl.slice(0,11);
}
async function carregarBeneficiarios(){
  try{ beneficiarios=await api('beneficiarios?select=*')||[]; }
  catch(e){ beneficiarios=[]; }
}
// Guarda o código lido junto do nome informado. Se já houver um registro
// muito parecido com o mesmo nome, apenas conta mais uma ocorrência.
async function aprenderBeneficiario(cb,nome){
  if(!cb||!nome) return;
  const banco=bancoDe(cb);
  const jaTem=beneficiarios.filter(function(b){
    return b.nome===nome && b.codigo_barras && semelhanca(cb,b.codigo_barras)>=24;
  })[0];
  if(jaTem) return;
  try{
    await api('beneficiarios',{method:'POST',body:JSON.stringify({
      chave:chaveBeneficiario(cb), nome:nome, codigo_barras:cb, banco:banco
    })});
    await carregarBeneficiarios();
  }catch(e){}
}

// ---- Vencimento do boleto (fator de vencimento FEBRABAN) ----
// O contador de 4 dígitos chegou a 9999 em 21/02/2025 e recomeçou em 1000
// no dia 22/02/2025. Por isso o mesmo fator pode significar duas datas:
// uma na contagem antiga (base 07/10/1997) e outra na nova (base 22/02/2025).
// Escolhemos a que fizer mais sentido em relação a hoje.
const BASE_VENC=Date.UTC(1997,9,7);           // contagem antiga
const BASE_VENC_NOVA=Date.UTC(2025,1,22);     // contagem nova (fator 1000)
function dataDoFator(fator){
  if(!fator||fator<=0) return null;
  const antiga=new Date(BASE_VENC + fator*86400000);
  const nova=(fator>=1000) ? new Date(BASE_VENC_NOVA + (fator-1000)*86400000) : null;
  if(!nova) return antiga;
  const hoje=Date.now();
  return Math.abs(nova-hoje) < Math.abs(antiga-hoje) ? nova : antiga;
}
// Linha digitável (47 dígitos)
function decodificarLinha(linha){
  const d=String(linha).replace(/\D/g,''); if(d.length!==47)return null;
  const c=parseInt(d.slice(37,47),10);
  return { valor: isNaN(c)?null:c/100, vencimento: dataDoFator(parseInt(d.slice(33,37),10)), digitos:d };
}
// Código de barras do boleto (44 dígitos)
function decodificarCodigoBarras(cb){
  const d=String(cb).replace(/\D/g,''); if(d.length!==44)return null;
  const c=parseInt(d.slice(9,19),10);
  return { valor: isNaN(c)?null:c/100, vencimento: dataDoFator(parseInt(d.slice(5,9),10)), digitos:d };
}

// Lê a FOTO do boleto e extrai valor e vencimento pelo código de barras.
// A foto NÃO é guardada — serve só para a leitura.
async function lerBoletoDaFoto(arquivo){
  if(!('BarcodeDetector' in window)){
    throw new Error('Este navegador não lê código de barras. Use o Chrome no Android, ou digite a linha do boleto.');
  }
  let formatos=['itf','code_128','codabar','code_39'];
  try{
    const suportados=await BarcodeDetector.getSupportedFormats();
    formatos=formatos.filter(function(f){ return suportados.indexOf(f)>=0; });
    if(!formatos.length) formatos=suportados;
  }catch(e){}
  const detector=new BarcodeDetector({formats:formatos});
  const img=await createImageBitmap(arquivo);
  const codigos=await detector.detect(img);
  if(img.close) img.close();
  for(let i=0;i<codigos.length;i++){
    const d=String(codigos[i].rawValue||'').replace(/\D/g,'');
    if(d.length===44){ const r=decodificarCodigoBarras(d); if(r) return r; }
    if(d.length===47){ const r=decodificarLinha(d); if(r) return r; }
  }
  throw new Error('Não encontrei o código de barras. Aproxime mais, com boa luz, e enquadre só a faixa de barras.');
}

const IC={
  girar:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 3v6h-6"/></svg>',
  inicio:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/></svg>',
  caixa:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></svg>',
  estoque:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 8l-9-5-9 5 9 5 9-5z"/><path d="M3 8v8l9 5 9-5V8"/></svg>',
  contas:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1z"/><path d="M8 8h8M8 12h8"/></svg>',
  rel:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',
  up:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M7 17L17 7M7 7h10v10"/></svg>',
  down:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 7L7 17M17 17H7V7"/></svg>',
  relogio:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  pacote:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 8l-9-5-9 5 9 5 9-5z"/><path d="M3 8v8l9 5 9-5V8"/></svg>',
  alerta:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 9v4M12 17h.01M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/></svg>',
  lixo:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>',
  baixar:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3v12M7 10l5 5 5-5M5 21h14"/></svg>',
  sair:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg>',
  menu:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M3 12h18M3 18h18"/></svg>',
  lupa:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>',
  camera:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>'
};

