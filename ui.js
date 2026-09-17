// ============================================================
//  LOGIN
// ============================================================
function mostrarLogin(msg){
  document.getElementById('raiz').innerHTML=
    '<div id="login">'+
      '<div style="text-align:center;margin-bottom:22px">'+
        '<img src="logo.png" alt="Farma Família" class="logoLogin"/>'+
        '<p style="color:var(--amberGlass);font-size:13px;margin-top:10px">Entre para continuar</p>'+
      '</div>'+
      '<label class="lLabel">E-mail</label>'+
      '<input id="lEmail" inputmode="email" autocapitalize="none" autocomplete="username"/>'+
      '<label class="lLabel">Senha</label>'+
      '<input id="lSenha" type="password" autocomplete="current-password"/>'+
      '<div class="erro" id="lErro">'+(msg||'')+'</div>'+
      '<button class="primario" id="lBtn" style="margin-top:14px">Entrar</button>'+
    '</div>';
  const btn=document.getElementById('lBtn');
  async function fazer(){
    const em=document.getElementById('lEmail').value.trim();
    const se=document.getElementById('lSenha').value;
    if(!em||!se){ document.getElementById('lErro').textContent='Informe e-mail e senha.'; return; }
    btn.textContent='Entrando…'; btn.disabled=true;
    try{ await entrar(em,se); await iniciar(); }
    catch(e){ document.getElementById('lErro').textContent=e.message; btn.textContent='Entrar'; btn.disabled=false; }
  }
  btn.onclick=fazer;
  document.getElementById('lSenha').addEventListener('keydown',function(e){ if(e.key==='Enter') fazer(); });
}
function sair(){ if(!confirm('Sair do aplicativo?'))return; Sessao.limpar(); try{localStorage.removeItem('copia')}catch(e){} mostrarLogin(); }

// ============================================================
//  ESTRUTURA
// ============================================================
// Se o Android matar o app em segundo plano e recarregar do zero, volta
// pra mesma aba de antes, em vez de sempre reiniciar no Início.
let aba=(function(){
  try{
    const salva=localStorage.getItem('farmafamilia_ultimaAba');
    const validas=['inicio','caixa','gestao','contas','rel'];
    return validas.indexOf(salva)>=0 ? salva : 'inicio';
  }catch(e){ return 'inicio'; }
})();
const abas=[{id:'inicio',n:'Início',i:IC.inicio},{id:'caixa',n:'Caixa',i:IC.caixa},{id:'gestao',n:'Gestão',i:IC.estoque},{id:'contas',n:'Contas',i:IC.contas},{id:'rel',n:'Relatórios',i:IC.rel}];

function montarApp(){
  const s=Sessao.ler();
  document.getElementById('raiz').innerHTML=
    '<div id="app">'+
      '<header>'+
        '<div style="display:flex;align-items:center;gap:10px">'+
          '<div class="marca"><img src="icone-192.png" alt=""/></div>'+
          '<div><div class="mNome">Farma Família</div><div class="mSub" id="hoje"></div></div>'+
        '</div>'+
        '<div style="display:flex;gap:8px">'+
          '<button class="sair" onclick="abrirBusca()" title="Buscar">'+IC.lupa+'</button>'+
          '<button class="sair" onclick="abrirMenu()" title="Menu">'+IC.menu+'</button>'+
        '</div>'+
      '</header>'+
      '<main id="main"></main>'+
      '<nav id="nav"></nav>'+
    '</div>'+
    '<button class="fab" id="fab" onclick="acaoFab()" style="display:none">'+
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14M5 12h14"/></svg>'+
    '</button>';
  render();
}
function irPara(id){
  // Toda vez que entra na aba Caixa vindo de outro lugar, mostra o dia de
  // hoje de novo — sem isso, se o app ficar aberto passando da meia-noite,
  // ou se você tiver visto outro dia antes, ela ficava presa na data velha.
  if(id==='caixa') caixaData=hojeISO();
  aba=id;
  try{ localStorage.setItem('farmafamilia_ultimaAba', id); }catch(e){}
  render();
}
function render(){
  const h=document.getElementById('hoje'); if(!h) return;
  h.textContent=new Date().toLocaleDateString('pt-BR',{weekday:'long',day:'2-digit',month:'long'});
  const abasVis = visaoSimples ? abas.filter(function(a){ return a.id==='inicio'; }) : abas;
  document.getElementById('nav').innerHTML=abasVis.map(function(a){ return '<button class="'+(aba===a.id?'on':'')+'" onclick="irPara(\''+a.id+'\')"><span class="ponto"></span>'+a.i+'<span class="txt">'+a.n+'</span></button>'; }).join('');
  const m=document.getElementById('main');
  const av = offline?'<div class="aviso">Sem conexão — mostrando os últimos dados carregados. Para lançar, é preciso internet.</div>':'';
  if(visaoSimples){ m.innerHTML=av+vSimples(); document.getElementById('fab').style.display='none'; return; }
  if(aba==='inicio')m.innerHTML=av+vInicio();
  else if(aba==='caixa')m.innerHTML=av+vCaixa();
  else if(aba==='gestao')m.innerHTML=av+vGestao();
  else if(aba==='contas')m.innerHTML=av+vContas();
  else m.innerHTML=av+vRel();
  document.getElementById('fab').style.display=(aba==='caixa'||aba==='contas')?'grid':'none';
}
function acaoFab(){ if(!podeFazer('criar')){ bloqueado('criar'); return; } if(aba==='caixa')abrirMov(); else if(aba==='contas')abrirConta(); }
async function recarregar(){ try{ await carregarTudo(); }catch(e){ console.error(e); } render(); }

// ============================================================
//  INÍCIO
// ============================================================
// Soma as vendas de um período, separadas por dinheiro x eletrônico (Pix/cartão)
function vendaPorOrigem(desde,ate){
  let dinheiro=0, eletronico=0, semInfo=0;
  movimentos.forEach(function(m){
    if(m.tipo!=='ENTRADA'||m.categoria!=='Venda'||m.ts<desde||m.ts>=ate) return;
    if(m.valorDinheiro||m.valorEletronico){
      dinheiro += m.valorDinheiro||0;
      eletronico += m.valorEletronico||0;
    }else if(m.origem==='DINHEIRO'){ dinheiro+=m.valor; }
    else if(m.origem==='BANCO'||m.origem==='CARTAO'){ eletronico+=m.valor; }
    else{ semInfo+=m.valor; }
  });
  return {dinheiro:dinheiro, eletronico:eletronico, semInfo:semInfo};
}
function linhaSplitVenda(sp,escuro){
  if(!sp.dinheiro && !sp.eletronico) return '';
  const cor = escuro ? '#FFD9D5' : 'var(--muted)';
  return '<div style="display:flex;gap:14px;flex-wrap:wrap;margin-top:6px;font-size:12px;color:'+cor+';position:relative">'+
    (sp.dinheiro?'<span>Dinheiro: '+brl(sp.dinheiro)+'</span>':'')+
    (sp.eletronico?'<span>Pix/Cartão: '+brl(sp.eletronico)+'</span>':'')+
    (sp.semInfo?'<span style="opacity:.75">Sem info: '+brl(sp.semInfo)+'</span>':'')+
  '</div>';
}
function vInicio(){
  const r=resumoVendas(), a=alertas();
  const hoje=new Date();
  const inicioMes=new Date(hoje.getFullYear(),hoje.getMonth(),1).getTime();
  const fimMes=new Date(hoje.getFullYear(),hoje.getMonth()+1,1).getTime();
  let projRitmo='';
  try{
    const p=projecaoMes();
    if(p.confiavel) projRitmo='No ritmo atual, deve fechar em '+brl(p.vendaProjetada);
  }catch(e){}
  let al='';
  if(a.contas>0){
    const p=a.proxima;
    al+=alertaCard(IC.relogio,'var(--rose)','#FDECEC',
      a.contas+' conta'+(a.contas===1?'':'s')+' a vencer em 7 dias','',
      brl(a.contasTotal),"irPara('contas')",'Total');
    if(p) al+=alertaCard(IC.contas,'var(--muted)','#EEEAE9',
      'Próxima: '+p.desc, dm(p.venc)+(diasAte(p.venc)===0?' · vence hoje':diasAte(p.venc)<0?' · atrasada':' · em '+diasAte(p.venc)+' dia(s)'),
      brl(p.valor),"irPara('contas')",'Valor');
  }
  if(!al) al='<div class="vazio">Tudo em dia. Nenhum alerta agora.</div>';
  // últimos lançamentos, do mais novo para o mais antigo
  const recentes=[...movimentos].sort(function(a,b){ return (b.criadoEm||b.ts)-(a.criadoEm||a.ts); }).slice(0,6);
  const listaRecentes = recentes.length
    ? recentes.map(function(m){
        const e=m.tipo==='ENTRADA', ed=podeEditar(m), og=origemTag(m.origem);
        return '<div class="item"'+(ed?' style="cursor:pointer" onclick="abrirEditar(\''+m.id+'\')"':'')+'>'+
          '<div class="iconC" style="background:'+(e?'#E7F6EF':'#FDECEC')+';color:'+(e?'var(--emerald)':'var(--rose)')+'">'+(e?IC.up:IC.down)+'</div>'+
          '<div style="flex:1"><div style="font-size:14px;font-weight:500">'+escapeHtml(m.desc||m.categoria||'Lançamento')+'</div>'+
          '<div style="font-size:11.5px;color:var(--muted)">'+dm(dataLocal(m.ts))+' · '+escapeHtml(m.categoria||'')+(splitTexto(m)?' · '+escapeHtml(splitTexto(m)):(og?' · '+escapeHtml(og.t):''))+'</div></div>'+
          '<div style="text-align:right"><div class="val2" style="color:'+(e?'var(--emerald)':'var(--rose)')+'">'+(e?'+':'−')+' '+brl(m.valor)+'</div>'+
          (ed?'<div style="font-size:10.5px;color:var(--muted);margin-top:2px">toque para corrigir</div>':'')+'</div></div>';
      }).join('')
    : '<div class="vazio">Nenhum lançamento ainda.</div>';
  return '<div style="display:grid;gap:10px">'+
      '<section class="hero"><div class="brilho"></div><div class="lbl">Venda do mês</div><div class="val">'+brl(r.mes)+'</div>'+linhaSplitVenda(vendaPorOrigem(inicioMes,fimMes),true)+
        (projRitmo?'<div style="font-size:11px;color:#FFD9D5;margin-top:5px;position:relative">'+projRitmo+'</div>':'')+'</section>'+
      '<div class="duo">'+
        '<div class="mini"><div class="l">Hoje</div><div class="v">'+brl(r.dia)+'</div></div>'+
        '<div class="mini" style="cursor:pointer" onclick="abrirVendasMes()"><div class="l">Semana</div><div class="v">'+brl(r.semana)+'</div></div>'+
      '</div>'+
    '</div>'+
    '<button class="btnP" style="justify-self:start" onclick="abrirVenda()">+ Lançar venda</button>'+
    '<h2 class="sec">Precisa de atenção</h2>'+al+
    '<h2 class="sec">Últimos lançamentos</h2>'+listaRecentes;
}
function alertaCard(icon,cor,bg,titulo,sub,valor,onclick,rotuloValor){
  return '<div class="item" style="cursor:pointer" onclick="'+onclick+'">'+
    '<div class="iconC" style="background:'+bg+';color:'+cor+'">'+icon+'</div>'+
    '<div style="flex:1"><div style="font-size:14.5px;font-weight:600">'+titulo+'</div>'+(sub?'<div style="font-size:12px;color:var(--muted);margin-top:2px">'+sub+'</div>':'')+'</div>'+
    (valor?'<div style="text-align:right">'+
      (rotuloValor?'<div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.03em">'+rotuloValor+'</div>':'')+
      '<div class="val2">'+valor+'</div></div>':'')+'</div>';
}
function hojeISO(){ return dataLocal(Date.now()); }
// Converte qualquer instante (timestamp) na data do calendário LOCAL.
// Nunca usar toISOString().slice(0,10) para isso: toISOString() é UTC e,
// à noite no Brasil (UTC-3), empurra a data para o dia seguinte.
function dataLocal(ts){
  const d=new Date(ts);
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}
// Monta o horário do lançamento: se for hoje, usa a hora atual; se for
// retroativo, usa meio-dia daquele dia.
function montarDataHora(dataISO){
  if(!dataISO || dataISO===hojeISO()) return new Date().toISOString();
  return new Date(dataISO+'T12:00:00').toISOString();
}
// Formata o campo enquanto a pessoa digita, preenchendo vírgula e
// ponto sozinho. Os dígitos entram pelos centavos, da direita para a
// esquerda: 1 -> 0,01 | 177 -> 1,77 | 177119 -> 1.771,19
function mascaraMoeda(el){
  let d=String(el.value).replace(/\D/g,'').replace(/^0+/,'');
  if(!d){ el.value=''; return; }
  if(d.length>11) d=d.slice(0,11);            // limite de segurança
  const n=parseInt(d,10)/100;
  el.value=n.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
}
// Preenche um campo de valor já formatado (usado pelo boleto)
function porValorNoCampo(id,valor){
  const el=document.getElementById(id); if(!el) return;
  el.value=Number(valor).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
}
// Cria uma categoria nova (fica disponível para os 3 usuários)
async function novaCategoria(tipo,alvo){
  const nome=(prompt('Nome da nova categoria:')||'').trim();
  if(!nome) return;
  try{
    await api('categorias',{method:'POST',body:JSON.stringify({nome:nome,tipo:tipo})});
  }catch(e){
    if(String(e.message).indexOf('duplicate')<0 && String(e.message).indexOf('23505')<0){ alert(e.message); return; }
  }
  try{
    const lista=await api('categorias?select=*&order=nome.asc');
    montarCategorias(lista);
  }catch(e){}
  if(alvo==='mov'){ movCat=nome; setMovTipo(movTipo); }
  else if(alvo==='desp'){ despCat=nome; redesenharCatsDespesa(); }
  else if(alvo==='edit'){ editCat=nome; setEditTipo(editTipo,nome); }
  else if(alvo==='grupo'){ aplicarCategoriaGrupo(nome); }
  else if(alvo==='gerenciar'){ try{ const l=await api('categorias?select=*&order=nome.asc'); montarCategorias(l); }catch(e){} fecharFolha(); abrirGerenciarCategorias(); }
}
function escolherDespCat(c){ despCat=c; redesenharCatsDespesa(); }
function redesenharCatsDespesa(){
  const el=document.getElementById('dCats'); if(!el) return;
  el.innerHTML=categoriasOrdenadas('DESPESA').map(function(c){
    return '<button class="chip '+(c===despCat?'on':'')+'" onclick="despCat=\''+escapeAttrJs(c)+'\';redesenharCatsDespesa()">'+escapeHtml(c)+'</button>';
  }).join('')+'<button class="chip chipNova" onclick="novaCategoria(\'DESPESA\',\'desp\')">+ nova</button>';
}
function previa(idCampo,idAviso){
  const el=document.getElementById(idAviso); if(!el) return;
  const v=parseValor(document.getElementById(idCampo).value);
  el.textContent = isNaN(v)||v===0 ? '' : 'Será lançado: '+brl(v);
}
// Lançamentos podem ser corrigidos ou apagados por até 72h após serem feitos.
const PRAZO_EDICAO=72*3600*1000;
// O prazo protege contra edição de lançamento antigo por engano — mas o
// administrador precisa poder corrigir um erro mesmo depois de 72h, sem
// precisar mexer direto no banco. Toda edição continua registrada no
// histórico (quem, quando, valor antigo x novo), então a rastreabilidade
// não se perde.
function podeEditar(m){
  if(souAdmin) return true;
  if(!m.criadoEm) return true;
  return (Date.now()-m.criadoEm) < PRAZO_EDICAO;
}
function horasRestantes(m){
  if(!m.criadoEm) return null;
  const resta=PRAZO_EDICAO-(Date.now()-m.criadoEm);
  if(resta<=0) return 0;
  return Math.ceil(resta/3600000);
}
let editTipo='ENTRADA',editCat='Venda';
// Origem do dinheiro: não é separação de saldo, é só etiqueta — ajuda a
// bater com o extrato do banco depois (o que é dinheiro nunca aparece lá).
const ORIGENS_PAG=[['DINHEIRO','Dinheiro'],['BANCO','Pix / Banco'],['CARTAO','Cartão']];
function origemTag(o){
  const m={DINHEIRO:{t:'Dinheiro',c:'#8A5A00',bg:'#FDF1DC'}, BANCO:{t:'Pix/Banco',c:'var(--pine)',bg:'var(--amberSoft)'}, CARTAO:{t:'Cartão',c:'#5B4B8A',bg:'#EEE9F7'}};
  return m[o]||null;
}
// Texto curto da divisão dentro do próprio card ("Dinheiro R$389,00 · Pix/Cartão R$512,54").
// Devolve null quando o lançamento não tem divisão (mostra a etiqueta única de origem, se houver).
function splitTexto(m){
  const d=m.valorDinheiro, e=m.valorEletronico;
  if(!d && !e) return null;
  const partes=[];
  if(d) partes.push('Dinheiro '+brl(d));
  if(e) partes.push('Pix/Cartão '+brl(e));
  return partes.join(' · ');
}
function chipsOrigem(idContainer, valorAtual, onEscolher){
  return '<div class="chips" id="'+idContainer+'">'+
    ORIGENS_PAG.map(function(o){
      return '<button class="chip '+(valorAtual===o[0]?'on':'')+'" onclick="'+onEscolher+'(\''+o[0]+'\')">'+o[1]+'</button>';
    }).join('')+
  '</div>';
}
// Acha o lançamento de caixa gerado por uma conta (pra saber a origem do pagamento)
function movimentoDaConta(contaId){
  for(let i=0;i<movimentos.length;i++){ if(movimentos[i].contaId===contaId) return movimentos[i]; }
  return null;
}
// Todos os pagamentos já lançados para uma conta (uma conta paga em partes
// tem mais de um), do mais recente para o mais antigo.
function movimentosDaConta(contaId){
  return movimentos.filter(function(m){ return m.contaId===contaId; })
    .sort(function(a,b){ return (b.criadoEm||b.ts)-(a.criadoEm||a.ts); });
}
function abrirEditar(id){
  if(!podeFazer('editar')){ bloqueado('editar'); return; }
  const m=movimentos.filter(function(x){return x.id===id})[0]; if(!m) return;
  if(!podeEditar(m)){ alert('Este lançamento tem mais de 72 horas e não pode mais ser alterado.'); return; }
  editTipo=m.tipo; editCat=m.categoria||CATS[m.tipo][0]; editOrigem=m.origem||null;
  editDividido = !!(m.valorDinheiro||m.valorEletronico);
  const dataISO=new Date(m.ts).getFullYear()+'-'+String(new Date(m.ts).getMonth()+1).padStart(2,'0')+'-'+String(new Date(m.ts).getDate()).padStart(2,'0');
  const h=horasRestantes(m);
  const valorFmt=m.valor.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
  abrirFolha('Corrigir lançamento',
    '<div class="toggle" id="edToggle"><button onclick="setEditTipo(\'ENTRADA\')">Entrada</button><button onclick="setEditTipo(\'SAIDA\')">Saída</button></div>'+
    (editDividido
      ? '<label class="campo">Dinheiro (espécie)</label><input id="evDinheiro" inputmode="numeric" oninput="mascaraMoeda(this);previaEditDividido()" value="'+(m.valorDinheiro||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})+'"/>'+
        '<label class="campo">Pix / Cartão (tudo junto)</label><input id="evEletronico" inputmode="numeric" oninput="mascaraMoeda(this);previaEditDividido()" value="'+(m.valorEletronico||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})+'"/>'+
        '<div id="ePrev" class="previa"></div>'
      : '<label class="campo">Valor</label><input id="ev" inputmode="numeric" oninput="mascaraMoeda(this);previa(\'ev\',\'ePrev\')" value="'+valorFmt+'"/>'+
        '<div id="ePrev" class="previa"></div>')+
    '<label class="campo">Categoria</label><div class="chips" id="eCats"></div>'+
    '<label class="campo">Descrição</label>'+listaSugestoes('sugEdit')+'<input id="ed" list="sugEdit" value="'+escapeHtml(m.desc||'')+'"/>'+
    (editDividido ? '' :
      '<label class="campo" id="eOrigemLabel">'+(editTipo==='SAIDA'?'De onde saiu o dinheiro':'Onde caiu esse dinheiro')+' (opcional)</label>'+chipsOrigem('eOrigemChips',editOrigem,'escolherEditOrigem'))+
    '<label class="campo">Data</label><input id="edata" type="date" value="'+dataISO+'"/>'+
    '<div class="dica">'+(souAdmin?'Como administrador, você pode corrigir a qualquer momento.':'Pode ser corrigido por mais '+(h!=null?h+'h':'algum tempo')+'.')+'</div>'+
    '<button class="primario" id="eBtn">Salvar correção</button>'+
    '<button class="btnExcluir" id="eDel">Excluir lançamento</button>',
    function(){
      setEditTipo(editTipo,editCat);
      if(editDividido) previaEditDividido();
      document.getElementById('eBtn').onclick=function(){ salvarEdicao(id); };
      document.getElementById('eDel').onclick=function(){ apagarMov(id); };
    });
}
let editOrigem=null, editDividido=false;
function previaEditDividido(){
  const d=parseValor((document.getElementById('evDinheiro')||{}).value)||0;
  const e=parseValor((document.getElementById('evEletronico')||{}).value)||0;
  const el=document.getElementById('ePrev');
  if(el) el.textContent = (d||e) ? 'Total: '+brl(d+e) : '';
}
function escolherEditOrigem(o){
  editOrigem=(editOrigem===o)?null:o;
  const el=document.getElementById('eOrigemChips'); if(el) el.outerHTML=chipsOrigem('eOrigemChips',editOrigem,'escolherEditOrigem');
}
function setEditTipo(t,catInicial){
  editTipo=t; editCat=catInicial||CATS[t][0];
  const tg=document.getElementById('edToggle');
  tg.children[0].style.background=t==='ENTRADA'?'var(--emerald)':'transparent'; tg.children[0].style.color=t==='ENTRADA'?'#fff':'var(--muted)';
  tg.children[1].style.background=t==='SAIDA'?'var(--rose)':'transparent'; tg.children[1].style.color=t==='SAIDA'?'#fff':'var(--muted)';
  document.getElementById('eCats').innerHTML=categoriasOrdenadas(t).map(function(c){ return '<button class="chip '+(c===editCat?'on':'')+'" onclick="editCat=\''+escapeAttrJs(c)+'\';setEditTipo(editTipo,\''+escapeAttrJs(c)+'\')">'+escapeHtml(c)+'</button>'; }).join('')+'<button class="chip chipNova" onclick="novaCategoria(\''+escapeAttrJs(t)+'\',\'edit\')">+ nova</button>';
  const rot=document.getElementById('eOrigemLabel'); if(rot) rot.textContent=(t==='SAIDA'?'De onde saiu o dinheiro':'Onde caiu esse dinheiro')+' (opcional)';
}
async function salvarEdicao(id){
  let v, dinheiro=null, eletronico=null;
  if(editDividido){
    dinheiro=parseValor(document.getElementById('evDinheiro').value)||0;
    eletronico=parseValor(document.getElementById('evEletronico').value)||0;
    v=dinheiro+eletronico;
    if(!v){ alert('Informe ao menos um valor.'); return; }
  }else{
    v=parseValor(document.getElementById('ev').value); if(!v||isNaN(v))return;
  }
  const b=document.getElementById('eBtn'); b.textContent='Salvando…'; b.disabled=true;
  try{
    await api('movimentos?id=eq.'+id,{method:'PATCH',body:JSON.stringify({
      tipo:editTipo, categoria:editCat, valor:v,
      descricao:document.getElementById('ed').value.trim()||null,
      data_hora:montarDataHora(document.getElementById('edata').value),
      origem_pagamento:editDividido?null:editOrigem,
      valor_dinheiro: editDividido?(dinheiro>0?dinheiro:null):null,
      valor_eletronico: editDividido?(eletronico>0?eletronico:null):null
    })});
    await registrar('EDITOU', editTipo==='ENTRADA'?'Entrada':'Saída', document.getElementById('ed').value.trim(), v);
    fecharFolha(); await recarregar();
  }catch(e){ alert(e.message); b.textContent='Salvar correção'; b.disabled=false; }
}
// Venda do dia dividida por forma de pagamento. Pix, crédito e débito
// entram juntos como "Pix/Cartão" — só o dinheiro em espécie fica separado,
// que é a divisão que realmente importa para bater o caixa físico.
function totalVendaSplit(){
  const d=parseValor((document.getElementById('vvDinheiro')||{}).value)||0;
  const e=parseValor((document.getElementById('vvEletronico')||{}).value)||0;
  const el=document.getElementById('vPrevTotal');
  if(el) el.textContent = (d||e) ? 'Total do dia: '+brl(d+e) : '';
  return {dinheiro:d, eletronico:e, total:d+e};
}
function abrirVenda(){
  if(!podeFazer('criar')){ bloqueado('criar'); return; }
  abrirFolha('Lançar venda',
    '<label class="campo">Dinheiro (espécie)</label>'+
    '<input id="vvDinheiro" inputmode="numeric" placeholder="0,00" oninput="mascaraMoeda(this);totalVendaSplit()" style="font-size:20px;font-family:var(--g);text-align:center"/>'+
    '<label class="campo">Pix / Cartão (tudo junto)</label>'+
    '<input id="vvEletronico" inputmode="numeric" placeholder="0,00" oninput="mascaraMoeda(this);totalVendaSplit()" style="font-size:20px;font-family:var(--g);text-align:center"/>'+
    '<div id="vPrevTotal" class="previa"></div>'+
    '<label class="campo">Data</label><input id="vdata" type="date" value="'+hojeISO()+'"/>'+
    '<div class="dica">Se foi tudo de um jeito só, preencha um campo e deixe o outro em branco.</div>'+
    '<button class="primario" id="vBtn">Registrar venda</button>',
    function(){
      const e=document.getElementById('vvDinheiro'); e.focus();
      document.getElementById('vBtn').onclick=salvarVenda;
    });
}
async function salvarVenda(){
  const sp=totalVendaSplit();
  if(!sp.total){ alert('Informe ao menos um valor.'); return; }
  const b=document.getElementById('vBtn'); b.textContent='Salvando…'; b.disabled=true;
  const data=montarDataHora(document.getElementById('vdata').value);
  try{
    // Um único lançamento por dia, com o total — a divisão fica guardada
    // dentro dele (valor_dinheiro / valor_eletronico), não em cards separados.
    await api('movimentos',{method:'POST',body:JSON.stringify({
      tipo:'ENTRADA',categoria:'Venda',valor:sp.total,descricao:'Venda',
      data_hora:data,
      valor_dinheiro: sp.dinheiro>0?sp.dinheiro:null,
      valor_eletronico: sp.eletronico>0?sp.eletronico:null
    })});
    await registrar('CRIOU','Venda','Venda',sp.total);
    fecharFolha(); await recarregar();
  }catch(e){ alert(e.message); b.textContent='Registrar venda'; b.disabled=false; }
}

// ============================================================
//  CAIXA
// ============================================================
let caixaData='';
// ============================================================
//  VENDAS DO MÊS — visão dia a dia, para conferir o que já foi lançado
// ============================================================
let mesVendasSel=null;   // {ano, mes} — null até abrir a primeira vez
function diasNoMes(ano,mes){ return new Date(ano,mes,0).getDate(); }

function abrirVendasMes(){
  if(!mesVendasSel){
    const d=new Date(caixaData?caixaData+'T12:00:00':new Date());
    mesVendasSel={ano:d.getFullYear(), mes:d.getMonth()+1};
  }
  abrirFolha('Vendas do mês','<div id="vmCorpo"></div>', redesenharVendasMes);
}
function trocarMesVendas(delta){
  let {ano,mes}=mesVendasSel;
  mes+=delta;
  if(mes<1){ mes=12; ano--; } else if(mes>12){ mes=1; ano++; }
  mesVendasSel={ano,mes};
  redesenharVendasMes();
}
function redesenharVendasMes(){
  const alvo=document.getElementById('vmCorpo'); if(!alvo) return;
  const {ano,mes}=mesVendasSel;
  const ini=new Date(ano,mes-1,1).getTime();
  const fim=new Date(ano,mes,1).getTime();
  const hoje=new Date();
  const ehMesAtual = (ano===hoje.getFullYear() && mes===hoje.getMonth()+1);
  const ultimoDiaConfere = ehMesAtual ? hoje.getDate() : diasNoMes(ano,mes);

  const vendasDoMes = movimentos.filter(function(m){
    return m.tipo==='ENTRADA' && m.categoria==='Venda' && m.ts>=ini && m.ts<fim;
  }).sort(function(a,b){ return a.ts-b.ts; });

  const total = vendasDoMes.reduce(function(s,m){ return s+m.valor; },0);

  // dias do mês (até hoje, se for o mês corrente) que não têm nenhuma venda lançada
  const diasComVenda={};
  vendasDoMes.forEach(function(m){ diasComVenda[dataLocal(m.ts)]=1; });
  const diasFaltando=[];
  for(let dia=1; dia<=ultimoDiaConfere; dia++){
    const iso=ano+'-'+String(mes).padStart(2,'0')+'-'+String(dia).padStart(2,'0');
    if(!diasComVenda[iso]) diasFaltando.push(iso);
  }

  const media = vendasDoMes.length ? total/vendasDoMes.length : 0;

  const lista = vendasDoMes.length
    ? vendasDoMes.slice().reverse().map(function(m){
        const ed=podeEditar(m); const og=origemTag(m.origem);
        const dt=new Date(m.ts);
        return '<div class="item"'+(ed?' style="cursor:pointer" onclick="fecharFolha();abrirEditar(\''+m.id+'\')"':'')+'>'+
          '<div class="iconC" style="background:#E7F6EF;color:var(--emerald)">'+IC.up+'</div>'+
          '<div style="flex:1"><div style="font-size:14px;font-weight:500">'+dt.toLocaleDateString('pt-BR',{weekday:'short',day:'2-digit',month:'2-digit'})+'</div>'+
          '<div style="font-size:11.5px;color:var(--muted)">'+escapeHtml(splitTexto(m)||og&&og.t||(m.desc&&m.desc!=='Venda'?m.desc:'')||'')+'</div></div>'+
          '<div style="text-align:right"><div class="val2" style="color:var(--emerald)">'+brl(m.valor)+'</div>'+
          (ed?'<div style="font-size:10px;color:var(--muted);margin-top:2px">toque para corrigir</div>':'')+'</div></div>';
      }).join('')
    : '<div class="vazio">Nenhuma venda lançada neste mês.</div>';

  alvo.innerHTML =
    '<div class="mesNav">'+
      '<button onclick="trocarMesVendas(-1)">‹</button>'+
      '<span>'+NOMES_MES[mes-1].charAt(0).toUpperCase()+NOMES_MES[mes-1].slice(1)+'/'+ano+'</span>'+
      '<button onclick="trocarMesVendas(1)">›</button>'+
    '</div>'+
    '<div class="totalAberto"><span>'+vendasDoMes.length+' dia(s) com venda lançada</span><strong>'+brl(total)+'</strong></div>'+
    linhaSplitVenda(vendaPorOrigem(ini,fim))+
    (vendasDoMes.length?'<div class="dica" style="text-align:center;margin-top:2px">Média por dia lançado: '+brl(media)+'</div>':'')+
    (diasFaltando.length
      ? '<div class="dica" style="color:var(--rose);background:#FDECEC;border-radius:10px;padding:9px 12px;margin-top:8px">'+
          diasFaltando.length+' dia(s) '+(ehMesAtual?'até hoje ':'')+'sem venda lançada: '+
          diasFaltando.map(function(d){ return dm(d); }).join(', ')+
        '</div>'
      : (vendasDoMes.length?'<div class="dica" style="color:var(--emerald);margin-top:8px;text-align:center">Todos os dias '+(ehMesAtual?'até hoje ':'')+'têm venda lançada.</div>':''))+
    '<h2 class="sec" style="margin-top:14px">Lançamentos</h2>'+lista;
}

function vCaixa(){
  if(!caixaData) caixaData=hojeISO();
  const d0=new Date(caixaData+'T00:00:00').getTime(), am=d0+86400000;
  const ent=somaMov('ENTRADA',d0,am), sai=somaMov('SAIDA',d0,am);
  const doDia=movimentos.filter(function(m){ return m.ts>=d0&&m.ts<am; }).sort(function(a,b){ return b.ts-a.ts; });
  const ehHoje = caixaData===hojeISO();
  return '<div><label class="campo" style="margin-top:0">Dia</label><input type="date" value="'+caixaData+'" onchange="caixaData=this.value;render()"/></div>'+
    '<button class="btnS" style="width:100%" onclick="abrirVendasMes()">Ver vendas do mês, dia a dia</button>'+
    '<div class="trio">'+
      '<div class="mini"><div class="l">Entradas</div><div class="v" style="color:var(--emerald)">'+brl(ent)+'</div></div>'+
      '<div class="mini"><div class="l">Saídas</div><div class="v" style="color:var(--rose)">'+brl(sai)+'</div></div>'+
      '<div class="mini"><div class="l">Saldo</div><div class="v">'+brl(ent-sai)+'</div></div>'+
    '</div>'+
    '<h2 class="sec">Movimentos '+(ehHoje?'de hoje':'de '+dm(caixaData))+'</h2>'+
    (doDia.length?doDia.map(function(m){ const e=m.tipo==='ENTRADA'; const ed=podeEditar(m); const og=origemTag(m.origem); return '<div class="item"'+(ed?' style="cursor:pointer" onclick="abrirEditar(\''+m.id+'\')"':'')+'>'+
      '<div class="iconC" style="background:'+(e?'#E7F6EF':'#FDECEC')+';color:'+(e?'var(--emerald)':'var(--rose)')+'">'+(e?IC.up:IC.down)+'</div>'+
      '<div style="flex:1"><div style="font-size:14px;font-weight:500">'+escapeHtml(m.desc||m.categoria||'Lançamento')+'</div>'+
      '<div style="font-size:11.5px;color:var(--muted);margin-top:2px">'+escapeHtml(m.categoria||'')+' · '+new Date(m.ts).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})+
      (splitTexto(m)?' · '+escapeHtml(splitTexto(m)):(og?' <span class="tag" style="color:'+og.c+';background:'+og.bg+';margin-left:4px;padding:1px 6px">'+escapeHtml(og.t)+'</span>':''))+'</div></div>'+
      '<div style="text-align:right"><div class="val2" style="color:'+(e?'var(--emerald)':'var(--rose)')+'">'+(e?'+':'−')+' '+brl(m.valor)+'</div>'+
      (ed?'<div style="font-size:10.5px;color:var(--muted);margin-top:2px">toque para corrigir</div>':'<div style="font-size:10.5px;color:var(--muted);margin-top:2px">prazo encerrado</div>')+'</div></div>'; }).join('')
      :'<div class="vazio">Nenhum lançamento neste dia. Toque em + para adicionar.</div>');
}
let movTipo='ENTRADA',movCat='Venda',movOrigem=null;
function abrirMov(){
  movTipo='ENTRADA';movCat='Venda';
  abrirFolha('Novo lançamento',
    '<div class="toggle" id="movToggle"><button onclick="setMovTipo(\'ENTRADA\')">Entrada</button><button onclick="setMovTipo(\'SAIDA\')">Saída</button></div>'+
    '<label class="campo">Valor</label><input id="mv" inputmode="numeric" placeholder="0,00" oninput="mascaraMoeda(this);previa(\'mv\',\'mPrev\')"/>'+
    '<div id="mPrev" class="previa"></div>'+
    '<label class="campo">Categoria</label><div class="chips" id="mCats"></div>'+
    '<label class="campo">Descrição / natureza do gasto</label><input id="md" list="sugMov" oninput="aplicarSugestao(\'md\',\'mCats\',movTipo,\'escolherMovCat\')" placeholder="Ex: Energia, frete, salário"/>'+listaSugestoes('sugMov')+'<div id="mCatsSug" class="sugLinha"></div>'+
    '<div id="mOrigemBloco"><label class="campo" id="mOrigemLabel">De onde saiu o dinheiro</label>'+chipsOrigem('mOrigemChips',movOrigem,'escolherMovOrigem')+'</div>'+
    '<label class="campo">Data</label><input id="mdata" type="date" value="'+hojeISO()+'"/>'+
    '<button class="primario" id="mBtn">Salvar lançamento</button>',
    function(){ setMovTipo('ENTRADA'); document.getElementById('mv').focus(); document.getElementById('mBtn').onclick=salvarMov; });
}
function escolherMovCat(c){ movCat=c; setMovTipo(movTipo); }
function escolherMovOrigem(o){
  movOrigem=(movOrigem===o)?null:o;
  const el=document.getElementById('mOrigemChips'); if(el) el.innerHTML=chipsOrigemInterno();
}
function chipsOrigemInterno(){
  return ORIGENS_PAG.map(function(o){ return '<button class="chip '+(movOrigem===o[0]?'on':'')+'" onclick="escolherMovOrigem(\''+o[0]+'\')">'+o[1]+'</button>'; }).join('');
}
function setMovTipo(t){
  movTipo=t;movCat=CATS[t][0]; movOrigem=null;
  const rot=document.getElementById('mOrigemLabel'); if(rot) rot.textContent=(t==='SAIDA')?'De onde saiu o dinheiro':'Onde caiu esse dinheiro';
  const chipsEl=document.getElementById('mOrigemChips'); if(chipsEl) chipsEl.innerHTML=chipsOrigemInterno();
  const tg=document.getElementById('movToggle');
  tg.children[0].style.background=t==='ENTRADA'?'var(--emerald)':'transparent';tg.children[0].style.color=t==='ENTRADA'?'#fff':'var(--muted)';
  tg.children[1].style.background=t==='SAIDA'?'var(--rose)':'transparent';tg.children[1].style.color=t==='SAIDA'?'#fff':'var(--muted)';
  document.getElementById('mCats').innerHTML=categoriasOrdenadas(t).map(function(c){ return '<button class="chip '+(c===movCat?'on':'')+'" onclick="movCat=\''+escapeAttrJs(c)+'\';setMovTipo(movTipo)">'+escapeHtml(c)+'</button>'; }).join('')+'<button class="chip chipNova" onclick="novaCategoria(\''+escapeAttrJs(t)+'\',\'mov\')">+ nova</button>';
}
async function salvarMov(){
  const v=parseValor(document.getElementById('mv').value);if(!v)return;
  const descMov=document.getElementById('md').value.trim();
  const dataMov=document.getElementById('mdata').value||hojeISO();
  const rep=movimentoRepetido({tipo:movTipo, valor:v, descricao:descMov, data:dataMov});
  if(rep && !confirm('ATENÇÃO — parece repetido.\n\nJá existe um lançamento de '+brl(rep.valor)+
      ' em '+dm(dataMov)+' com a mesma descrição.\n\nSalvar assim mesmo?')) return;
  const b=document.getElementById('mBtn'); b.textContent='Salvando…'; b.disabled=true;
  try{
    await api('movimentos',{method:'POST',body:JSON.stringify({
      tipo:movTipo,categoria:movCat,valor:v,
      descricao:document.getElementById('md').value.trim()||null,
      data_hora:montarDataHora(document.getElementById('mdata').value),
      origem_pagamento: movOrigem
    })});
    await registrar('CRIOU', movTipo==='ENTRADA'?'Entrada':'Saída', document.getElementById('md').value.trim()||movCat, v);
    fecharFolha(); await recarregar();
  }catch(e){ alert(e.message); b.textContent='Salvar lançamento'; b.disabled=false; }
}
async function apagarMov(id){
  if(!podeFazer('excluir')){ bloqueado('excluir'); return; }
  const m=movimentos.filter(function(x){return x.id===id})[0];
  if(m && !podeEditar(m)){ alert('Este lançamento tem mais de 72 horas e não pode mais ser excluído.'); return; }
  if(!confirm('Apagar este lançamento?'))return;
  try{
    await registrar('EXCLUIU', m&&m.tipo==='ENTRADA'?'Entrada':'Saída', (m&&m.desc)||'', m&&m.valor, m?{data_hora:new Date(m.ts).toISOString(),tipo:m.tipo,categoria:m.categoria,valor:m.valor,descricao:m.desc}:null);
    await api('movimentos?id=eq.'+id,{method:'DELETE'}); fecharFolha(); await recarregar();
  }catch(e){ alert(e.message); }
}

// ============================================================
//  ESTOQUE
// ============================================================
let filtroEstoque='';
// ============================================================
//  GESTÃO — tudo que é indicador/planejamento, num lugar só
//  (antes estava espalhado: parte no Início, parte no menu ☰)
// ============================================================
// Os quatro indicadores centrais da Gestão, com o mesmo estilo visual do
// medidor de Meta de Gastos (porcentagem + legenda) — antes estava em
// linhas de texto simples, e ficou pra trás visualmente.
function blocoPanoramaGestao(){
  const acumulado=saldoAcumuladoTotal().saldo;
  const compras=comprasPagas();
  const aPagarTudo=totalAPagarTudo();
  const livre=caixaLivre();

  // Quatro cores fixas, uma por indicador — usadas tanto no anel quanto
  // nos pontos da legenda, pra bater exatamente um com o outro.
  const corSaldo='var(--emerald)', corCompras='#3B6FD4', corContas='var(--rose)', corLivreDot='#D9A93B';

  // % do caixa que já está comprometido com contas a pagar — continua
  // sendo o texto central do medidor (o que mais importa de relance).
  const pctReal = acumulado>0 ? Math.min(999,(aPagarTudo/acumulado*100)) : (aPagarTudo>0?999:0);
  const pctTxt = Math.round(pctReal);
  const corTxt = pctReal<60?'var(--emerald)':pctReal<90?'#8A5A00':'var(--rose)';
  const bg  = pctReal<60?'#E7F6EF':pctReal<90?'#FDF1DC':'#FDECEC';
  const msg = pctReal<60?'Caixa folgado'
    : pctReal<90?'Caixa apertado'
    : 'Quase tudo comprometido';
  const corLivre = livre.livre>=0 ? 'var(--emerald)' : 'var(--rose)';

  // O anel mostra os quatro valores lado a lado, proporcional ao peso de
  // cada um — não é só um "comprometido x livre" de antes.
  const vSaldo=Math.max(0,acumulado), vCompras=Math.max(0,compras),
        vContas=Math.max(0,aPagarTudo), vLivre=Math.abs(livre.livre);
  const soma=vSaldo+vCompras+vContas+vLivre || 1;
  const p1=vSaldo/soma*100, p2=p1+vCompras/soma*100, p3=p2+vContas/soma*100;
  const gradiente='conic-gradient('+corSaldo+' 0% '+p1+'%, '+corCompras+' '+p1+'% '+p2+'%, '+corContas+' '+p2+'% '+p3+'%, '+corLivreDot+' '+p3+'% 100%)';

  return '<div class="item" style="flex-direction:column;align-items:stretch">'+
    '<div style="display:flex;align-items:center;gap:10px;margin-bottom:16px">'+
      '<div class="iconC" style="background:'+bg+';color:'+corTxt+'">'+IC.rel+'</div>'+
      '<div style="flex:1"><div style="font-size:14.5px;font-weight:600">'+msg+'</div>'+
      '<div style="font-size:11.5px;color:var(--muted)">Quanto do caixa já está comprometido</div></div>'+
    '</div>'+

    '<div style="display:flex;justify-content:center;margin-bottom:16px">'+
      '<div class="donut" style="background:'+gradiente+'">'+
        '<div class="donutCenter"><div class="donutPct" style="color:'+corTxt+'">'+pctTxt+'%</div><div class="donutSub">do caixa<br/>comprometido</div></div>'+
      '</div>'+
    '</div>'+

    '<div>'+
      '<div class="metaLegLinha"><span class="metaLegPonto" style="background:'+corSaldo+'"></span>Saldo em caixa<span class="metaLegVal">'+brl(acumulado)+'</span></div>'+
      '<div class="metaLegLinha"><span class="metaLegPonto" style="background:'+corCompras+'"></span>Compras pagas (mês)<span class="metaLegVal">'+brl(compras)+'</span></div>'+
      '<div class="metaLegLinha"><span class="metaLegPonto" style="background:'+corContas+'"></span>Contas a pagar (tudo)<span class="metaLegVal">'+brl(aPagarTudo)+'</span></div>'+
      '<div class="metaLegLinha"><span class="metaLegPonto" style="background:'+corLivreDot+'"></span>Caixa livre (saldo - contas a pagar)<span class="metaLegVal">'+brl(livre.livre)+'</span></div>'+
    '</div>'+

    '<div style="text-align:center;margin-top:6px;padding-top:12px;border-top:1px solid var(--line)">'+
      '<div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.03em">Caixa livre</div>'+
      '<div style="font-size:20px;font-weight:700;font-family:var(--g);color:'+corLivre+'">'+brl(livre.livre)+'</div>'+
      '<div style="font-size:11px;color:var(--muted);margin-top:2px">Saldo em caixa − contas a pagar</div>'+
    '</div>'+
  '</div>';
}
function vGestao(){
  return '<h2 class="sec" style="margin-top:0">Panorama</h2>'+
    blocoPanoramaGestao()+
    '<h2 class="sec">Meta de gastos do mês</h2>'+
    '<div class="dica" style="margin-top:0">Só despesa operacional (aluguel, salário, etc). Compra de mercadoria não entra aqui — ela é investimento, não gasto fixo.</div>'+
    (cartaoMetaGastos()||'<div class="vazio">Nenhum teto configurado. Defina em Menu → Administração.</div>')+
    '<h2 class="sec">Indicadores</h2>'+
    '<button class="btnS" style="width:100%" onclick="abrirDRE()">DRE do mês</button>'+
    '<button class="btnS" style="width:100%;margin-top:8px" onclick="abrirMetaLucro()">Meta de retirada</button>'+
    '<button class="btnS" style="width:100%;margin-top:8px" onclick="abrirEvolucao()">Evolução da farmácia (6 meses)</button>'+
    '<button class="btnS" style="width:100%;margin-top:8px" onclick="abrirVisaoAnual()">Visão anual</button>'+
    '<button class="btnS" style="width:100%;margin-top:8px" onclick="abrirSaidasCategoriasMeses()">Saídas por categoria, mês a mês</button>';
}

function vEstoque(){
  const f=(filtroEstoque||'').toLowerCase();
  const vis=produtos.filter(function(p){ return p.desc.toLowerCase().indexOf(f)>=0; });
  const corpo=vis.length?vis.map(function(p){
    const sv=statusValidade(p.validade); const baixo=Number(p.minimo||0)>0&&estoqueDe(p)<Number(p.minimo);
    return '<div class="item"><div style="flex:1"><div style="font-size:14px;font-weight:500">'+escapeHtml(p.desc)+'</div>'+
      '<div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap">'+(sv?'<span class="tag" style="color:'+sv.c+';background:'+sv.bg+'">'+sv.t+'</span>':'')+(baixo?'<span class="tag" style="color:var(--rose);background:#FDECEC">Estoque baixo</span>':'')+'</div></div>'+
      '<div style="text-align:right"><div class="val2" style="font-size:19px;color:'+(baixo?'var(--rose)':'var(--ink)')+'">'+estoqueDe(p)+'</div><div style="font-size:11px;color:var(--muted)">mín '+Number(p.minimo||0)+'</div>'+
      '<button class="pagarBtn" style="color:var(--pine);background:#EEF2F0;margin-top:4px" onclick="abrirMovEstoque(\''+p.id+'\')">Movimentar</button></div></div>';
  }).join(''):'<div class="vazio">Nenhum produto. Toque em + para cadastrar, ou importe uma nota.</div>';
  return '<label class="import"><span>'+IC.baixar+' Importar entrada por XML da nota</span><input type="file" accept=".xml" onchange="importarXml(event)" style="display:none"/></label>'+
    '<input placeholder="Buscar produto…" oninput="filtroEstoque=this.value;render()" value="'+escapeHtml(filtroEstoque||'')+'"/>'+corpo;
}
function abrirProduto(){
  abrirFolha('Novo produto',
    '<label class="campo">Descrição</label><input id="pd" placeholder="Ex: Dipirona 500mg c/10"/>'+
    '<label class="campo">Código de barras (opcional)</label><input id="pc" inputmode="numeric"/>'+
    '<div class="duo"><div style="flex:1"><label class="campo">Estoque atual</label><input id="pe" inputmode="numeric" placeholder="0"/></div>'+
    '<div style="flex:1"><label class="campo">Estoque mínimo</label><input id="pm" inputmode="numeric" placeholder="0"/></div></div>'+
    '<label class="campo">Validade (opcional)</label><input id="pv" type="date"/>'+
    '<button class="primario" id="pBtn">Salvar produto</button>',
    function(){ document.getElementById('pd').focus(); document.getElementById('pBtn').onclick=salvarProduto; });
}
async function salvarProduto(){
  const desc=document.getElementById('pd').value.trim(); if(!desc){alert('Informe a descrição.');return;}
  const b=document.getElementById('pBtn'); b.textContent='Salvando…'; b.disabled=true;
  try{
    await api('produtos',{method:'POST',body:JSON.stringify({
      descricao:desc,
      codigo_barras:document.getElementById('pc').value.replace(/\D/g,'')||null,
      estoque:Number(document.getElementById('pe').value||0),
      estoque_minimo:Number(document.getElementById('pm').value||0),
      validade:document.getElementById('pv').value||null
    })});
    fecharFolha(); await recarregar();
  }catch(e){ alert(e.message); b.textContent='Salvar produto'; b.disabled=false; }
}
let meTipo='ENTRA';
function abrirMovEstoque(id){
  const p=produtos.filter(function(x){return x.id===id})[0]; if(!p)return;
  abrirFolha('Movimentar: '+p.desc,
    '<div class="toggle" id="meT">'+
      '<button style="background:var(--emerald);color:#fff" onclick="meTipo=\'ENTRA\';document.querySelectorAll(\'#meT button\').forEach(function(b,i){b.style.background=i===0?\'var(--emerald)\':\'transparent\';b.style.color=i===0?\'#fff\':\'var(--muted)\'})">Entrada</button>'+
      '<button onclick="meTipo=\'SAI\';document.querySelectorAll(\'#meT button\').forEach(function(b,i){b.style.background=i===1?\'var(--rose)\':\'transparent\';b.style.color=i===1?\'#fff\':\'var(--muted)\'})">Saída/Perda</button>'+
    '</div>'+
    '<label class="campo">Quantidade</label><input id="meq" inputmode="numeric" placeholder="0"/>'+
    '<button class="primario" id="meBtn">Confirmar</button>',
    function(){ meTipo='ENTRA'; document.getElementById('meq').focus(); document.getElementById('meBtn').onclick=function(){ salvarMovEstoque(id); }; });
}
async function salvarMovEstoque(id){
  const p=produtos.filter(function(x){return x.id===id})[0];
  const q=Number(document.getElementById('meq').value||0); if(!q)return;
  const novo=Math.max(0,Number(p.estoque||0)+(meTipo==='ENTRA'?q:-q));
  const b=document.getElementById('meBtn'); b.textContent='Salvando…'; b.disabled=true;
  try{
    await api('produtos?id=eq.'+id,{method:'PATCH',body:JSON.stringify({estoque:novo})});
    fecharFolha(); await recarregar();
  }catch(e){ alert(e.message); b.textContent='Confirmar'; b.disabled=false; }
}
function importarXml(ev){
  const f=ev.target.files[0]; if(!f)return;
  const r=new FileReader();
  r.onload=async function(){
    try{
      const xml=new DOMParser().parseFromString(r.result,'text/xml');
      const dets=xml.getElementsByTagName('det');
      if(!dets.length){ alert('Nenhum item encontrado no XML.'); return; }
      let add=0;
      for(let i=0;i<dets.length;i++){
        const det=dets[i];
        const g=function(t){ const el=det.getElementsByTagName(t)[0]; return el?el.textContent:null; };
        const desc=g('xProd'); if(!desc)continue;
        const qtd=Number(g('qCom')||0);
        const ean=g('cEAN'); const cod=(ean&&ean!=='SEM GTIN')?ean:null;
        const rastro=det.getElementsByTagName('rastro')[0];
        const valEl=rastro?rastro.getElementsByTagName('dVal')[0]:null;
        const val=valEl?valEl.textContent:null;
        const ex=produtos.filter(function(x){ return (cod&&x.codigo===cod)||x.desc.toLowerCase()===desc.toLowerCase(); })[0];
        if(ex){
          const corpo={estoque:Number(ex.estoque||0)+qtd};
          if(val&&!ex.validade) corpo.validade=val;
          await api('produtos?id=eq.'+ex.id,{method:'PATCH',body:JSON.stringify(corpo)});
        }else{
          await api('produtos',{method:'POST',body:JSON.stringify({descricao:desc,codigo_barras:cod,estoque:qtd,estoque_minimo:0,validade:val})});
        }
        add++;
      }
      await recarregar();
      alert(add+' itens importados da nota.');
    }catch(e){ alert('Não consegui importar: '+e.message); }
  };
  r.readAsText(f);
}

// ============================================================
//  CONTAS
// ============================================================
let contaAba='BOLETO';
function vContas(){
  const lista=contasOrd(contaAba);
  const abasC=[['BOLETO','Boletos'],['DESPESA','Despesas'],['RECEBER','A receber']];
  const visiveis=aplicaFiltroMes(aplicaFiltroVenc(lista));

  const cabecalho='<div class="toggle">'+
      abasC.map(function(x){
        return '<button style="'+(contaAba===x[0]?'background:var(--pine);color:#fff':'')+'" onclick="contaAba=\''+x[0]+'\';filtroVenc=\'todos\';filtroMes=\'\';render()">'+x[1]+'</button>';
      }).join('')+
    '</div>';

  const itens = visiveis.length
    ? visiveis.map(function(c){ return linhaContaItem(c); }).join('')
    : '<div class="vazio">'+(filtroVenc==='todos'?'Nenhum registro aqui. Toque em + para adicionar.':'Nenhuma conta neste período.')+'</div>';
  // No filtro padrão (sem nada selecionado), parte da lista fica escondida
  // de propósito (pagas há mais de 60 dias) — avisa e mostra o caminho.
  const escondidas = (filtroVenc==='todos' && !filtroMes) ? (lista.length-visiveis.length) : 0;
  const dicaHistorico = escondidas>0
    ? '<div class="dica" style="text-align:center;margin-top:6px">'+escondidas+' conta(s) paga(s) há mais de 60 dias não aparecem aqui. Toque em "Ver contas por mês" para encontrá-las.</div>'
    : '';

  return cabecalho +
    '<button class="btnS" style="width:100%;margin-top:8px" onclick="abrirContasMes()">Ver contas por mês</button>'+
    painelVencimentos(lista) + painelMeses(lista) + '<h2 class="sec">Lista</h2>' + itens + dicaHistorico;
}
// Linha de uma conta (boleto/despesa/a receber) — usada na lista principal
// e na tela "Contas por mês". contaAbaCtx só muda o texto de "Pago em".
function linhaContaItem(c){
  const dias=diasAte(c.venc);
  const receber=c.tipo==='RECEBER';
  const st = c.status==='PAGO'
    ? {t:(receber?'Recebido':'Pago')+' '+dm(c.dataBaixa||c.venc), c:'var(--emerald)',bg:'#E7F6EF'}
    : dias<0  ? {t:'Atrasado',c:'var(--rose)',bg:'#FDECEC'}
    : dias===0? {t:'Vence hoje',c:'var(--rose)',bg:'#FDECEC'}
    : dias<=3 ? {t:'Vence em '+dias+'d',c:'#8A5A00',bg:'#FDF1DC'}
    : {t:'Vence '+dm(c.venc),c:'var(--muted)',bg:'#EEEAE9'};
  const parcial=c.status==='PARCIAL';
  const mv=(c.status==='PAGO'||parcial)?movimentoDaConta(c.id):null;
  const og=mv?origemTag(mv.origem):null;
  const valorMostrado=parcial?valorRestante(c):c.valor;
  return '<div class="item" style="cursor:pointer" onclick="abrirContaDetalhe(\''+c.id+'\')"><div style="flex:1">'+
    '<div style="font-size:14px;font-weight:500">'+escapeHtml(c.desc)+'</div>'+
    '<div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap">'+
      '<span class="tag" style="color:'+st.c+';background:'+st.bg+'">'+st.t+'</span>'+
      (parcial?'<span class="tag" style="color:#8A5A00;background:#FDF1DC">Parcial</span>':'')+
      (c.categoria?'<span class="tag" style="color:var(--muted);background:#EEEAE9">'+escapeHtml(c.categoria)+'</span>':'')+
      (og?'<span class="tag" style="color:'+og.c+';background:'+og.bg+'">'+og.t+'</span>':'')+
    '</div></div>'+
    '<div style="text-align:right"><div class="val2" style="font-size:16px">'+brl(valorMostrado)+'</div>'+
    (parcial?'<div style="font-size:10px;color:var(--muted)">de '+brl(c.valor)+'</div>':'')+
    '<div style="font-size:10.5px;color:var(--muted);margin-top:4px">toque para ver</div>'+
    '</div></div>';
}
// ---- Contas por mês: navega qualquer mês (passado ou futuro), pagas + pendentes ----
let mesContasSel=null;
function abrirContasMes(){
  if(!mesContasSel){
    const d=new Date();
    mesContasSel={ano:d.getFullYear(), mes:d.getMonth()+1};
  }
  abrirFolha('Contas do mês','<div id="cmCorpo"></div>', redesenharContasMes);
}
function trocarMesContas(delta){
  let {ano,mes}=mesContasSel;
  mes+=delta;
  if(mes<1){ mes=12; ano--; } else if(mes>12){ mes=1; ano++; }
  mesContasSel={ano,mes};
  redesenharContasMes();
}
function redesenharContasMes(){
  const alvo=document.getElementById('cmCorpo'); if(!alvo) return;
  const {ano,mes}=mesContasSel;
  const ini=new Date(ano,mes-1,1).getTime();
  const fim=new Date(ano,mes,1).getTime();
  // pertence ao mês pelo vencimento OU pela data em que foi paga/recebida —
  // assim uma conta vencida em fevereiro mas paga em março aparece nos dois.
  const doMes=contas.filter(function(c){
    const tVenc=new Date(c.venc+'T12:00:00').getTime();
    if(tVenc>=ini && tVenc<fim) return true;
    if(c.dataBaixa){ const tBaixa=new Date(c.dataBaixa).getTime(); if(tBaixa>=ini && tBaixa<fim) return true; }
    return false;
  });
  const pendentes=doMes.filter(function(c){ return c.status!=='PAGO'; }).sort(function(a,b){ return new Date(a.venc)-new Date(b.venc); });
  const pagas=doMes.filter(function(c){ return c.status==='PAGO'; }).sort(function(a,b){ return new Date(b.dataBaixa||b.venc)-new Date(a.dataBaixa||a.venc); });
  const totalPendente=pendentes.reduce(function(s,c){ return s+valorRestante(c); },0);
  const totalPago=pagas.reduce(function(s,c){ return s+c.valor; },0);

  alvo.innerHTML=
    '<div class="mesNav">'+
      '<button onclick="trocarMesContas(-1)">‹</button>'+
      '<span>'+NOMES_MES[mes-1].charAt(0).toUpperCase()+NOMES_MES[mes-1].slice(1)+'/'+ano+'</span>'+
      '<button onclick="trocarMesContas(1)">›</button>'+
    '</div>'+
    (doMes.length===0
      ? '<div class="vazio">Nenhuma conta neste mês.</div>'
      : '<div class="duo">'+
          '<div class="mini"><div class="l">Pendente</div><div class="v" style="color:var(--rose)">'+brl(totalPendente)+'</div></div>'+
          '<div class="mini"><div class="l">Pago/recebido</div><div class="v" style="color:var(--emerald)">'+brl(totalPago)+'</div></div>'+
        '</div>'+
        (pendentes.length?'<h2 class="sec" style="margin-top:10px">Pendentes</h2>'+pendentes.map(function(c){ return linhaContaItem(c); }).join(''):'')+
        (pagas.length?'<h2 class="sec" style="margin-top:10px">Pagas / recebidas</h2>'+pagas.map(function(c){ return linhaContaItem(c); }).join(''):''));
}
// Detalhe da conta — aqui ficam as ações (pagar, editar, excluir), longe da lista
// Formata a linha digitável (47 dígitos corridos) no jeito padrão de
// boleto, em grupos, pra ficar fácil de conferir e copiar.
function formatarLinha(l){
  if(!l||l.length!==47) return l||'';
  return l.slice(0,5)+'.'+l.slice(5,10)+' '+l.slice(10,15)+'.'+l.slice(15,21)+' '+
         l.slice(21,26)+'.'+l.slice(26,32)+' '+l.slice(32,33)+' '+l.slice(33,47);
}
async function copiarLinha(linha){
  try{
    await navigator.clipboard.writeText(linha);
    alert('Linha digitável copiada.');
  }catch(e){
    prompt('Copie manualmente:', linha);
  }
}
function abrirContaDetalhe(id){
  const c=contas.filter(function(x){ return x.id===id; })[0]; if(!c) return;
  const receber=c.tipo==='RECEBER';
  const dias=diasAte(c.venc);
  const pago=Number(c.valorPago||0);
  const restante=valorRestante(c);
  const sit = c.status==='PAGO' ? (receber?'Recebido':'Pago')
    : c.status==='PARCIAL' ? 'Parcialmente '+(receber?'recebido':'pago')
    : dias<0 ? 'Em atraso' : dias===0 ? 'Vence hoje' : 'Vence em '+dias+' dia(s)';
  const pagamentos=movimentosDaConta(c.id);
  abrirFolha(c.desc,
    '<div class="detVal">'+brl(c.valor)+'</div>'+
    '<div class="detLinha"><span>Situação</span><strong>'+sit+'</strong></div>'+
    '<div class="detLinha"><span>Vencimento</span><strong>'+dm(c.venc)+'</strong></div>'+
    (c.categoria?'<div class="detLinha"><span>Categoria</span><strong>'+escapeHtml(c.categoria)+'</strong></div>':'')+
    (c.documento?'<div class="detLinha"><span>Nº do boleto</span><strong>'+escapeHtml(c.documento)+'</strong></div>':'')+
    (pago>0?
      '<div class="detLinha"><span>'+(receber?'Recebido':'Pago')+'</span><strong style="color:var(--emerald)">'+brl(pago)+'</strong></div>'+
      (c.status!=='PAGO'?'<div class="detLinha"><span>Restante</span><strong style="color:var(--rose)">'+brl(restante)+'</strong></div>':'')
      : '')+
    (c.linha?
      '<div style="margin-top:10px"><div style="font-size:12px;color:var(--muted);margin-bottom:4px">Linha digitável (pra pagar mesmo sem o boleto em mãos)</div>'+
      '<div style="font-family:var(--g);font-size:14px;background:var(--card);border:1px solid var(--line);border-radius:10px;padding:10px 12px;word-break:break-all">'+formatarLinha(c.linha)+'</div>'+
      '<button class="btnS" style="width:100%;margin-top:8px" onclick="copiarLinha(\''+c.linha+'\')">Copiar linha digitável</button></div>'
      : '')+
    (pagamentos.length?
      '<h2 class="sec" style="margin-top:14px">Pagamentos</h2>'+
      pagamentos.map(function(p){
        const og=origemTag(p.origem);
        return '<div class="item" style="margin-top:6px"><div style="flex:1">'+
          '<div style="font-size:13.5px">'+dm(dataLocal(p.ts))+(og?' · '+og.t:'')+'</div></div>'+
          '<div class="val2" style="font-size:14px">'+brl(p.valor)+'</div></div>';
      }).join('')
      : '')+
    (pago>0?
      '<button class="btnS" style="width:100%;margin-top:14px" onclick="desfazerUltimoPagamento(\''+c.id+'\')">Desfazer último pagamento</button>'
      : '')+
    (c.status!=='PAGO'?
      '<button class="primario" style="margin-top:10px" onclick="confirmarPagamento(\''+c.id+'\')">'+(receber?'Confirmar recebimento':'Confirmar pagamento')+(pago>0?' (restante '+brl(restante)+')':'')+'</button>'
      : '')+
    '<button class="btnExcluir" onclick="apagarConta(\''+c.id+'\')">Excluir esta conta</button>');
}
function confirmarPagamento(id){
  const c=contas.filter(function(x){ return x.id===id; })[0]; if(!c) return;
  fecharFolha();
  quitar(id);   // já abre a folha pedindo a data do pagamento
}
async function desfazerUltimoPagamento(id){
  if(!podeFazer('excluir')){ bloqueado('excluir'); return; }
  if(!podeFazer('pagar')){ bloqueado('pagar'); return; }
  const c=contas.filter(function(x){ return x.id===id; })[0]; if(!c) return;
  const pagamentos=movimentosDaConta(id);
  const ultimo=pagamentos[0];
  if(!ultimo){ alert('Nenhum pagamento registrado para desfazer.'); return; }
  if(!confirm('Desfazer o pagamento de '+brl(ultimo.valor)+' ('+dm(dataLocal(ultimo.ts))+')?\n\nO lançamento correspondente sairá do caixa.')) return;
  try{
    // remove só o pagamento mais recente — pagamentos parciais anteriores
    // continuam valendo, a conta volta a PARCIAL (ou PENDENTE se era o único)
    await api('movimentos?id=eq.'+ultimo.id,{method:'DELETE'});
    const novoValorPago=Math.max(0, Number(c.valorPago||0)-ultimo.valor);
    const novoStatus = novoValorPago<=0.005 ? 'PENDENTE' : 'PARCIAL';
    await api('contas?id=eq.'+id,{method:'PATCH',body:JSON.stringify({
      status:novoStatus, valor_pago:novoValorPago, data_baixa:null
    })});
    await registrar('REABRIU','Conta',c.desc,ultimo.valor);
    await recarregar(); fecharFolha();
  }catch(e){ alert(e.message); }
}
let despCat='Frete';
let ultimoCodigoLido=null;   // código de barras do boleto que acabou de ser lido
function abrirConta(){
  const boleto = contaAba==='BOLETO';
  const receber = contaAba==='RECEBER';
  const despesa = contaAba==='DESPESA';
  despCat='Frete'; contaJaPaga=false; contaOrigemPag=null; rascunhoAtualId=null;
  const titulo = boleto?'Adicionar boleto' : despesa?'Adicionar despesa' : 'Adicionar conta a receber';
  abrirFolha(titulo,
    (boleto?'<button type="button" class="foto" onclick="abrirScannerBoleto()">'+IC.camera+' Ler código de barras</button>'+
     '<label class="fotoAlt"><span>ou enviar uma foto do boleto</span><input type="file" accept="image/*" capture="environment" onchange="fotoBoleto(event)" style="display:none"/></label>'+
     '<div id="cFoto" class="dica" style="margin:8px 0 2px"></div>':'')+
    '<label class="campo">'+(boleto?'Distribuidor':despesa?'Descrição da despesa':'Cliente / descrição')+'</label>'+
    '<input id="cd" list="sugConta" oninput="aplicarSugestao(\'cd\',\'dCats\',\'DESPESA\',\'escolherDespCat\')" placeholder="'+(boleto?'Ex: Itafarma':despesa?'Ex: Frete da entrega':'Ex: Convênio X')+'"/>'+listaSugestoes('sugConta')+
    (despesa?'<label class="campo">Categoria</label><div id="dCatsSug" class="sugLinha"></div><div class="chips" id="dCats"></div>':'')+
    (boleto?'<label class="campo">Linha digitável (opcional — preenche valor e vencimento)</label><input id="cl" inputmode="numeric" oninput="autoLinha()" placeholder="Números do boleto"/>':'')+
    '<label class="campo">Valor</label><input id="cv" inputmode="numeric" placeholder="0,00" oninput="mascaraMoeda(this);previa(\'cv\',\'cPrev\')"/><div id="cPrev" class="previa"></div>'+
    '<label class="campo">'+(despesa?'Data / vencimento':'Vencimento')+' <span id="cvencOpc" style="font-weight:400;color:var(--muted)"></span></label><input id="cvenc" type="date" value="'+(despesa?hojeISO():'')+'"/>'+
    (boleto?'<div class="dica">Fotografe o boleto ou digite a linha — o valor e o vencimento aparecem sozinhos.</div>':'')+
    '<div class="item" style="margin-top:12px"><div style="flex:1">'+
      '<div style="font-size:14px;font-weight:500">'+(receber?'Já foi recebida':'Já foi paga')+'</div>'+
      '<div style="font-size:11.5px;color:var(--muted)">Marque se o pagamento já aconteceu</div></div>'+
      '<button class="chave" id="cPago" onclick="alternarJaPago()"><span></span></button></div>'+
    '<div id="cPagoData" style="display:none">'+
      '<label class="campo">'+(receber?'Data do recebimento':'Data do pagamento')+'</label>'+
      '<input id="cdpag" type="date" value="'+hojeISO()+'"/>'+
      '<label class="campo">'+(receber?'Onde caiu esse dinheiro':'De onde saiu o dinheiro')+' (opcional)</label>'+chipsOrigem('cOrigemChips',contaOrigemPag,'escolherContaOrigem')+
      '<div class="dica">Entra no caixa nesta data.</div></div>'+
    '<button class="primario" id="cBtn">Salvar</button>'+
    (boleto?'<button class="btnS" style="width:100%;margin-top:10px" id="cBtn2">Salvar e ler o próximo</button>':''),
    function(){
      if(despesa){
        redesenharCatsDespesa();
      }
      document.getElementById('cd').focus();
      document.getElementById('cBtn').onclick=function(){ salvarConta(false); };
      const b2=document.getElementById('cBtn2');
      if(b2) b2.onclick=function(){ salvarConta(true); };
    });
}
let contaJaPaga=false, contaOrigemPag=null;
// Assim que a leitura de um boleto der certo, salva na hora um rascunho
// pendente — mesmo que o usuário feche o app sem terminar de preencher,
// o valor, vencimento e a linha completa já ficam guardados. Se ler de
// novo (2ª tentativa), atualiza esse mesmo rascunho em vez de duplicar.
let rascunhoAtualId=null;
async function salvarRascunhoBoleto(valor,vencimentoISO,linhaCompleta,doc){
  const payload={
    tipo:'PAGAR', origem:'BOLETO', categoria:null,
    descricao:'Boleto lido — revisar antes de confirmar',
    valor:valor, vencimento:vencimentoISO, status:'PENDENTE',
    linha_digitavel:linhaCompleta||null, documento:doc||null
  };
  try{
    if(rascunhoAtualId){
      await api('contas?id=eq.'+rascunhoAtualId,{method:'PATCH',body:JSON.stringify(payload)});
    }else{
      const resp=await api('contas',{method:'POST',body:JSON.stringify(payload)});
      if(resp&&resp[0]) rascunhoAtualId=resp[0].id;
    }
  }catch(e){ console.error('Não consegui salvar o rascunho do boleto:',e); }
}
function escolherContaOrigem(o){
  contaOrigemPag=(contaOrigemPag===o)?null:o;
  const el=document.getElementById('cOrigemChips'); if(el) el.outerHTML=chipsOrigem('cOrigemChips',contaOrigemPag,'escolherContaOrigem');
}
function alternarJaPago(){
  contaJaPaga=!contaJaPaga;
  const ch=document.getElementById('cPago');
  const bloco=document.getElementById('cPagoData');
  if(ch) ch.className='chave'+(contaJaPaga?' chaveOn':'');
  if(bloco) bloco.style.display=contaJaPaga?'block':'none';
  // por padrão, a data do pagamento acompanha o vencimento informado
  const venc=document.getElementById('cvenc');
  const dpag=document.getElementById('cdpag');
  if(contaJaPaga && venc && dpag && venc.value) dpag.value = venc.value <= hojeISO() ? venc.value : hojeISO();
  const opc=document.getElementById('cvencOpc');
  if(opc) opc.textContent = contaJaPaga ? '(opcional)' : '';
}
async function salvarConta(continuar){
  const v=parseValor(document.getElementById('cv').value);
  const campoPagto=document.getElementById('cdpag');
  const dPago=(contaJaPaga&&campoPagto)?campoPagto.value:'';
  // Se a conta já foi paga, a data do pagamento vale como referência —
  // não é preciso lembrar o vencimento original.
  let venc=document.getElementById('cvenc').value || (contaJaPaga?dPago:'');
  if(!v||isNaN(v)){ alert('Informe o valor.'); return; }
  if(!venc){
    alert(contaJaPaga
      ? 'Informe a data do pagamento.'
      : 'Informe o vencimento.\n\nSe a conta já foi paga, ligue "Já foi paga" e informe a data do pagamento.');
    return;
  }
  const el=document.getElementById('cl');
  const boleto = contaAba==='BOLETO';
  const despesa = contaAba==='DESPESA';
  const descricao=document.getElementById('cd').value.trim()||(boleto?'Boleto':despesa?'Despesa':'Recebimento');
  const docNum = ultimoCodigoLido?documentoDe(ultimoCodigoLido):null;
  const dataPag=dPago||venc;
  const rep=contaRepetida({descricao:descricao, valor:v, vencimento:venc, documento:docNum,
                           linha:(el&&el.value.replace(/\D/g,''))||null});
  if(rep && !(await confirmarRepetido(rep))) return;
  const b=document.getElementById('cBtn'); b.textContent='Salvando…'; b.disabled=true;
  try{
    const payloadConta={
      tipo: contaAba==='RECEBER'?'RECEBER':'PAGAR',
      origem: boleto?'BOLETO':'MANUAL',
      categoria: despesa?despCat:null,
      descricao:document.getElementById('cd').value.trim()||(boleto?'Boleto':despesa?'Despesa':'Recebimento'),
      valor:v, vencimento:venc,
      status: contaJaPaga?'PAGO':'PENDENTE',
      valor_pago: contaJaPaga?v:0,
      data_baixa: contaJaPaga?montarDataHora(dataPag):null,
      linha_digitavel:(el&&el.value.replace(/\D/g,''))||null,
      documento: ultimoCodigoLido?documentoDe(ultimoCodigoLido):null
    };
    // Se já existe um rascunho salvo automaticamente na leitura, completa
    // ele em vez de criar uma conta nova (evita duplicar o mesmo boleto).
    let idFinal;
    if(boleto && rascunhoAtualId){
      await api('contas?id=eq.'+rascunhoAtualId,{method:'PATCH',body:JSON.stringify(payloadConta)});
      idFinal=rascunhoAtualId;
    }else{
      const criadaResp=await api('contas',{method:'POST',body:JSON.stringify(payloadConta)});
      idFinal=(criadaResp&&criadaResp[0])?criadaResp[0].id:null;
    }
    rascunhoAtualId=null;
    // se já foi paga, lança no caixa junto e deixa os dois ligados
    if(contaJaPaga){
      const idNova=idFinal;
      await api('movimentos',{method:'POST',body:JSON.stringify({
        tipo: contaAba==='RECEBER'?'ENTRADA':'SAIDA',
        categoria: despesa?despCat:(boleto?'Distribuidor':'Outros'),
        valor:v, descricao:descricao,
        data_hora:montarDataHora(dataPag),
        conta_id:idNova,
        origem_pagamento: contaOrigemPag
      })});
    }
    await registrar(contaJaPaga?'PAGOU':'CRIOU', boleto?'Boleto':despesa?'Despesa':'A receber', descricao, v);
    if(boleto && ultimoCodigoLido){
      await aprenderBeneficiario(ultimoCodigoLido, document.getElementById('cd').value.trim());
    }
    ultimoCodigoLido=null;
    fecharFolha(); await recarregar();
    if(continuar){ abrirConta(); setTimeout(abrirScannerBoleto,120); }
  }catch(e){ alert(e.message); b.textContent='Salvar'; b.disabled=false; }
}
// ---------- Leitura do boleto: câmera ao vivo (rápida) ----------
let scannerStream=null, scannerLoop=null;
function suportaLeitura(){ return ('BarcodeDetector' in window) && navigator.mediaDevices && navigator.mediaDevices.getUserMedia; }

// Diz exatamente o que falta para a leitura funcionar neste aparelho
async function diagnosticoLeitura(){
  const p=[];
  if(!window.isSecureContext) p.push('a página precisa estar em HTTPS');
  if(!(navigator.mediaDevices&&navigator.mediaDevices.getUserMedia)) p.push('o navegador não dá acesso à câmera');
  if(!('BarcodeDetector' in window)) p.push('o navegador não tem leitor de código de barras (BarcodeDetector)');
  else{
    try{
      const sup=await BarcodeDetector.getSupportedFormats();
      const uteis=['itf','code_128','codabar','code_39'].filter(function(f){ return sup.indexOf(f)>=0; });
      if(!uteis.length) p.push('o leitor não suporta o formato de boleto (ITF). Formatos disponíveis: '+(sup.join(', ')||'nenhum'));
    }catch(e){ p.push('não consegui consultar os formatos suportados'); }
  }
  return p;
}
async function abrirScannerBoleto(){
  const problemas=await diagnosticoLeitura();
  if(problemas.length){
    alert('A leitura pela câmera não funciona neste aparelho porque:\n\n· '+problemas.join('\n· ')+
          '\n\nUse a opção de digitar a linha do boleto — o valor e o vencimento são preenchidos sozinhos.');
    return;
  }
  const ov=document.createElement('div');
  ov.className='scanner'; ov.id='scanner';
  ov.innerHTML='<div class="scGiro">'+
      '<video id="scVideo" playsinline muted></video>'+
      '<div class="scMira"></div>'+
      '<div class="scAviso">Ler código de barras<br><small style="font-weight:400;opacity:.85">pode aproximar bem — não precisa caber tudo no quadro</small></div>'+
      '<button class="scFechar" onclick="pararScanner()">Cancelar</button>'+
    '</div>';
  document.body.appendChild(ov);

  try{
    scannerStream=await navigator.mediaDevices.getUserMedia({
      video:{ facingMode:{ideal:'environment'}, width:{ideal:1280}, height:{ideal:720} }
    });
  }catch(e){
    pararScanner();
    alert('Não consegui abrir a câmera. Verifique a permissão do navegador.');
    return;
  }
  const video=document.getElementById('scVideo');
  if(!video){ pararScanner(); return; }
  video.srcObject=scannerStream;
  try{ await video.play(); }catch(e){}

  let formatos=['itf','code_128','codabar','code_39'];
  try{
    const sup=await BarcodeDetector.getSupportedFormats();
    const f=formatos.filter(function(x){ return sup.indexOf(x)>=0; });
    if(f.length) formatos=f;
  }catch(e){}
  const detector=new BarcodeDetector({formats:formatos});

  // Lê alternando entre a imagem normal e girada 90°, para funcionar
  // com o celular na vertical ou na horizontal, mesmo com a tela travada.
  const tela=document.createElement('canvas');
  const ctx=tela.getContext('2d',{willReadFrequently:true});
  let giro=0;

  scannerLoop=setInterval(async function(){
    const v=document.getElementById('scVideo');
    if(!v||v.readyState<2) return;
    const w=v.videoWidth, h=v.videoHeight;
    if(!w||!h) return;

    if(giro%2===0){
      tela.width=w; tela.height=h;
      ctx.setTransform(1,0,0,1,0,0);
      ctx.drawImage(v,0,0,w,h);
    }else{
      tela.width=h; tela.height=w;
      ctx.setTransform(1,0,0,1,0,0);
      ctx.clearRect(0,0,tela.width,tela.height);
      ctx.translate(h/2,w/2);
      ctx.rotate(Math.PI/2);
      ctx.drawImage(v,-w/2,-h/2,w,h);
    }
    giro++;

    let codigos=[];
    try{ codigos=await detector.detect(tela); }catch(e){ return; }
    for(let i=0;i<codigos.length;i++){
      const d=String(codigos[i].rawValue||'').replace(/\D/g,'');
      let r=null;
      if(d.length===44) r=decodificarCodigoBarras(d);
      else if(d.length===47) r=decodificarLinha(d);
      if(r && r.valor){
        if(navigator.vibrate) navigator.vibrate(60);
        pararScanner();
        aplicarLeitura(r,d);
        return;
      }
    }
  },250);
}

function pararScanner(){
  if(scannerLoop){ clearInterval(scannerLoop); scannerLoop=null; }
  if(scannerStream){ scannerStream.getTracks().forEach(function(t){ t.stop(); }); scannerStream=null; }
  const ov=document.getElementById('scanner'); if(ov) ov.remove();
}

// Preenche o formulário com o que foi lido do boleto
function aplicarLeitura(r,digitos){
  if(r.valor!=null){ porValorNoCampo('cv',r.valor); previa('cv','cPrev'); }
  if(r.vencimento){ const cvc=document.getElementById('cvenc'); if(cvc) cvc.value=r.vencimento.toISOString().slice(0,10); }
  const cl=document.getElementById('cl');
  if(cl && digitos){
    if(digitos.length===47) cl.value=digitos;
    else if(digitos.length===44){ const convertida=barrasParaLinha(digitos); if(convertida) cl.value=convertida; }
  }

  // guarda o código de barras (converte da linha, se for o caso)
  let cb=null;
  if(digitos && digitos.length===44) cb=digitos;
  else if(digitos && digitos.length===47) cb=linhaParaBarras(digitos);
  ultimoCodigoLido=cb;

  let extra='';
  if(cb){
    const doc=documentoDe(cb);
    if(doc) extra+=' · nº '+doc;
    const r2=reconhecerBeneficiario(cb);
    const cd=document.getElementById('cd');
    if(r2 && cd && !cd.value){ cd.value=r2.nome; extra+=' · '+r2.nome; }
    // Segurança: salva um rascunho pendente na hora, pra nunca perder o
    // número mesmo que o formulário seja fechado sem terminar.
    if(contaAba==='BOLETO' && r.valor!=null && r.vencimento){
      salvarRascunhoBoleto(r.valor, r.vencimento.toISOString().slice(0,10), cl?cl.value:null, doc);
    }
  }
  const aviso=document.getElementById('cFoto');
  if(aviso){
    aviso.textContent='Lido: '+brl(r.valor)+(r.vencimento?' · vence '+dm(r.vencimento.toISOString().slice(0,10)):'')+extra;
    aviso.style.color='var(--emerald)';
  }
  const cd2=document.getElementById('cd');
  if(cd2 && !cd2.value) cd2.focus();
}

// Alternativa: ler a partir de uma foto (quando a câmera ao vivo não funcionar)
async function fotoBoleto(ev){
  const arq=ev.target.files[0]; if(!arq)return;
  const aviso=document.getElementById('cFoto');
  if(aviso){ aviso.innerHTML='<span class="girando">◜</span> Lendo o boleto…'; aviso.style.color='var(--muted)'; }
  try{
    const r=await lerBoletoDaFoto(arq);
    aplicarLeitura(r,r.digitos||null);
  }catch(e){
    if(aviso){ aviso.textContent=e.message; aviso.style.color='var(--rose)'; }
  }
  ev.target.value='';
}

// Converte a linha digitável (47) para o código de barras (44)
function linhaParaBarras(l){
  const d=String(l).replace(/\D/g,'');
  if(d.length!==47) return null;
  return d.slice(0,4)+d[32]+d.slice(33,47)+d.slice(4,9)+d.slice(10,20)+d.slice(21,31);
}
// Dígito verificador módulo 10 (usado nos 3 primeiros campos da linha digitável)
function dvMod10(digitos){
  let soma=0, mult=2;
  for(let i=digitos.length-1;i>=0;i--){
    let p=parseInt(digitos[i],10)*mult;
    if(p>9) p=Math.floor(p/10)+(p%10);
    soma+=p;
    mult = mult===2?1:2;
  }
  const resto=soma%10;
  return resto===0?0:10-resto;
}
// Caminho inverso do linhaParaBarras: reconstrói a linha digitável (47) a
// partir do código de barras (44) — é o que a câmera lê na maioria das
// vezes. Sem isso, só o "nº" curto (Nosso Número) ficava salvo, e a linha
// completa nunca era gravada nos boletos lidos por foto/câmera.
function barrasParaLinha(cb){
  const d=String(cb).replace(/\D/g,'');
  if(d.length!==44) return null;
  const c1base=d.slice(0,4)+d.slice(19,24);
  const c1=c1base+dvMod10(c1base);
  const c2base=d.slice(24,34);
  const c2=c2base+dvMod10(c2base);
  const c3base=d.slice(34,44);
  const c3=c3base+dvMod10(c3base);
  const c4=d.slice(4,5);
  const c5=d.slice(5,19);
  return c1+c2+c3+c4+c5;
}
// Confere o dígito verificador geral do boleto (módulo 11)
function dvBarrasOk(cb){
  const d=String(cb).replace(/\D/g,'');
  if(d.length!==44) return false;
  const semDv=d.slice(0,4)+d.slice(5);
  let peso=2, soma=0;
  for(let i=semDv.length-1;i>=0;i--){
    soma+=parseInt(semDv[i],10)*peso;
    peso++; if(peso>9) peso=2;
  }
  let dv=11-(soma%11);
  if(dv===0||dv>9) dv=1;
  return dv===parseInt(d[4],10);
}
// Lê o que foi digitado: aceita linha digitável (47) ou código de barras (44)
function lerDigitado(txt){
  const d=String(txt||'').replace(/\D/g,'');
  if(d.length===47){
    const cb=linhaParaBarras(d);
    return { pronto:true, dados:decodificarLinha(d), dvOk:dvBarrasOk(cb), faltam:0, tem:47, alvo:47 };
  }
  if(d.length===44){
    return { pronto:true, dados:decodificarCodigoBarras(d), dvOk:dvBarrasOk(d), faltam:0, tem:44, alvo:44 };
  }
  const alvo = d.length>44 ? 47 : 44;
  return { pronto:false, dados:null, dvOk:null, faltam:Math.max(0,alvo-d.length), tem:d.length, alvo:alvo };
}
// Chamada a cada tecla digitada no campo da linha
function autoLinha(){
  const campo=document.getElementById('cl'); if(!campo) return;
  const aviso=document.getElementById('cFoto');
  const r=lerDigitado(campo.value);

  if(!r.pronto){
    // ainda incompleto: limpa para não ficar valor velho na tela
    const cv=document.getElementById('cv'), cvc=document.getElementById('cvenc');
    if(cv){ cv.value=''; previa('cv','cPrev'); }
    if(cvc) cvc.value='';
    if(aviso){
      aviso.style.color='var(--muted)';
      aviso.textContent = r.tem===0 ? '' : 'Digitado '+r.tem+' de '+r.alvo+' números — faltam '+r.faltam+'.';
    }
    return;
  }
  if(!r.dados || r.dados.valor==null){
    if(aviso){ aviso.style.color='var(--rose)'; aviso.textContent='Não consegui interpretar esses números.'; }
    return;
  }
  const digitos=String(campo.value).replace(/\D/g,'');
  aplicarLeitura(r.dados, digitos);
  if(r.dvOk===false){
    if(aviso){ aviso.style.color='var(--rose)'; aviso.textContent='Atenção: os números não batem no dígito verificador. Confira antes de salvar.'; }
  }
  return;
  if(r.dados.valor!=null){ porValorNoCampo('cv',r.dados.valor); previa('cv','cPrev'); }
  if(r.dados.vencimento){ const cvc=document.getElementById('cvenc'); if(cvc) cvc.value=r.dados.vencimento.toISOString().slice(0,10); }
  if(aviso){
    if(r.dvOk===false){
      aviso.style.color='var(--rose)';
      aviso.textContent='Atenção: os números não batem no dígito verificador. Confira antes de salvar.';
    }else{
      aviso.style.color='var(--emerald)';
      aviso.textContent='Lido: '+brl(r.dados.valor)+(r.dados.vencimento?' · vence '+dm(r.dados.vencimento.toISOString().slice(0,10)):'');
    }
  }
}
// ---------- Leitura do boleto: câmera ao vivo (rápida) ----------
// Pergunta a data do pagamento antes de dar baixa, para que o lançamento
// caia no dia certo do caixa (e não sempre no dia de hoje).
function quitar(id){
  if(!podeFazer('pagar')){ bloqueado('pagar'); return; }
  const c=contas.filter(function(x){return x.id===id})[0]; if(!c)return;
  const receber=c.tipo==='RECEBER';
  const restante=valorRestante(c);
  // sugere a data do vencimento; se ainda não venceu, sugere hoje
  const sugerida = (c.venc && c.venc <= hojeISO()) ? c.venc : hojeISO();
  const valorFmt=restante.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
  abrirFolha(receber?'Marcar recebido':'Marcar pago',
    '<div class="item" style="margin-bottom:4px"><div style="flex:1"><div style="font-size:14px;font-weight:500">'+escapeHtml(c.desc)+'</div>'+
    (c.categoria?'<div style="font-size:11.5px;color:var(--muted)">'+escapeHtml(c.categoria)+'</div>':'')+'</div>'+
    '<div class="val2" style="font-size:16px">'+brl(c.valor)+'</div></div>'+
    ((c.valorPago||0)>0?'<div class="dica" style="margin-top:0">Já '+(receber?'recebido':'pago')+': '+brl(c.valorPago)+' · Restante: '+brl(restante)+'</div>':'')+
    '<label class="campo">Valor '+(receber?'recebido':'pago')+' agora</label>'+
    '<input id="qValor" inputmode="numeric" oninput="mascaraMoeda(this)" value="'+valorFmt+'"/>'+
    '<label class="campo">'+(receber?'Data do recebimento':'Data do pagamento')+'</label>'+
    '<input id="qdata" type="date" value="'+sugerida+'"/>'+
    '<label class="campo">'+(receber?'Onde caiu esse dinheiro':'De onde saiu o dinheiro')+' (opcional)</label>'+chipsOrigem('qOrigemChips',null,'escolherQuitarOrigem')+
    '<div class="dica">O lançamento entra no caixa nesta data. Deixe o valor menor que o total para registrar um pagamento parcial.</div>'+
    '<button class="primario" id="qBtn">Confirmar</button>',
    function(){ quitarOrigem=null; document.getElementById('qBtn').onclick=function(){ confirmarBaixa(id); }; });
}
let quitarOrigem=null;
function escolherQuitarOrigem(o){
  quitarOrigem=(quitarOrigem===o)?null:o;
  const el=document.getElementById('qOrigemChips'); if(el) el.outerHTML=chipsOrigem('qOrigemChips',quitarOrigem,'escolherQuitarOrigem');
}
async function confirmarBaixa(id){
  const c=contas.filter(function(x){return x.id===id})[0]; if(!c)return;
  const valorAgora=parseValor(document.getElementById('qValor').value);
  if(!valorAgora||isNaN(valorAgora)||valorAgora<=0){ alert('Informe o valor.'); return; }
  const data=document.getElementById('qdata').value||hojeISO();
  const b=document.getElementById('qBtn'); b.textContent='Salvando…'; b.disabled=true;
  try{
    const novoValorPago=Number(c.valorPago||0)+valorAgora;
    const completo=novoValorPago >= c.valor-0.005;
    await api('contas?id=eq.'+id,{method:'PATCH',body:JSON.stringify({
      status: completo?'PAGO':'PARCIAL',
      valor_pago: novoValorPago,
      data_baixa: completo?montarDataHora(data):null
    })});
    await api('movimentos',{method:'POST',body:JSON.stringify({
      tipo:c.tipo==='PAGAR'?'SAIDA':'ENTRADA',
      // usa a categoria da própria conta; boleto de distribuidor entra como Distribuidor
      categoria:c.categoria||(c.tipo==='PAGAR'?(c.origem==='BOLETO'?'Distribuidor':'Outros'):'Outros'),
      valor:valorAgora,
      descricao:c.desc,
      data_hora:montarDataHora(data),
      conta_id:c.id,
      origem_pagamento: quitarOrigem
    })});
    await registrar('PAGOU', c.tipo==='PAGAR'?'Boleto/Conta':'Recebimento', c.desc, valorAgora);
    fecharFolha(); await recarregar();
  }catch(e){ alert(e.message); b.textContent='Confirmar'; b.disabled=false; }
}
async function apagarConta(id){
  if(!podeFazer('excluir')){ bloqueado('excluir'); return; }
  const c=contas.filter(function(x){return x.id===id})[0];
  const aviso = (c && c.status==='PAGO')
    ? 'Apagar esta conta? O lançamento correspondente também sairá do caixa.'
    : 'Apagar esta conta?';
  if(!confirm(aviso))return;
  try{
    await registrar('EXCLUIU', c&&c.origem==='BOLETO'?'Boleto':'Conta', (c&&c.desc)||'', c&&c.valor, c?{tipo:c.tipo,origem:c.origem,categoria:c.categoria,valor:c.valor,vencimento:c.venc,descricao:c.desc,status:c.status,documento:c.documento}:null);
    await api('contas?id=eq.'+id,{method:'DELETE'}); fecharFolha&&fecharFolha(); await recarregar();
  }catch(e){ alert(e.message); }
}

// ============================================================
//  RELATÓRIOS
// ============================================================
let relPeriodo='semanal',relDe='',relAte='';
function intervalo(){
  const d0=inicioDia(),am=d0+86400000;
  if(relPeriodo==='diario')return[d0,am];
  if(relPeriodo==='semanal')return[am-7*86400000,am];
  if(relPeriodo==='mensal')return[new Date(new Date().getFullYear(),new Date().getMonth(),1).getTime(),am];
  if(relPeriodo==='custom'&&relDe&&relAte)return[new Date(relDe+'T00:00:00').getTime(),new Date(relAte+'T00:00:00').getTime()+86400000];
  return null;
}
// Agrupa os lançamentos do período por categoria, do maior para o menor
function porCategoria(tipo,inicio,fim){
  const mapa={};
  movimentos.forEach(function(m){
    if(m.tipo!==tipo||m.ts<inicio||m.ts>=fim) return;
    const c=m.categoria||'Sem categoria';
    mapa[c]=(mapa[c]||0)+m.valor;
  });
  return Object.keys(mapa).map(function(c){ return {cat:c,total:mapa[c]}; })
    .sort(function(a,b){ return b.total-a.total; });
}
function blocoCategorias(titulo,tipo,iv,cor){
  const lista=porCategoria(tipo,iv[0],iv[1]);
  if(!lista.length) return '';
  const soma=lista.reduce(function(s,x){ return s+x.total; },0);
  return '<h2 class="sec">'+titulo+'</h2>'+
    lista.map(function(x){
      const pct=soma>0?Math.round(x.total/soma*100):0;
      return '<div class="catLinha" onclick="verCategoria(\''+encodeURIComponent(x.cat)+'\',\''+tipo+'\')">'+
        '<div class="catTopo"><span>'+escapeHtml(x.cat)+'</span><strong>'+brl(x.total)+'</strong></div>'+
        '<div class="catBarra"><div style="width:'+pct+'%;background:'+cor+'"></div></div>'+
        '<div class="catPct">'+pct+'% · toque para ver os lançamentos</div></div>';
    }).join('');
}
// Mostra os lançamentos de uma categoria no período selecionado
function verCategoria(catEnc,tipo){
  const cat=decodeURIComponent(catEnc);
  const iv=intervalo(); if(!iv) return;
  const itens=movimentos.filter(function(m){
    return m.tipo===tipo && m.ts>=iv[0] && m.ts<iv[1] && (m.categoria||'Sem categoria')===cat;
  }).sort(function(a,b){ return a.ts-b.ts; });
  const soma=itens.reduce(function(s,m){ return s+m.valor; },0);
  abrirFolha(cat,
    '<div class="totalAberto"><span>'+itens.length+' lançamento(s)</span><strong>'+brl(soma)+'</strong></div>'+
    itens.map(function(m){
      return '<div class="item" style="margin-top:8px"><div style="flex:1">'+
        '<div style="font-size:14px;font-weight:500">'+escapeHtml(m.desc||cat)+'</div>'+
        '<div style="font-size:11.5px;color:var(--muted)">'+dm(dataLocal(m.ts))+'</div></div>'+
        '<div class="val2">'+brl(m.valor)+'</div></div>';
    }).join(''));
}
function vRel(){
  const per=[['diario','Diário'],['semanal','Semanal'],['mensal','Mensal'],['custom','Período']];
  const iv=intervalo();
  let corpo='';
  if(!iv) corpo='<div class="vazio">Selecione as datas do período.</div>';
  else{
    const ent=somaMov('ENTRADA',iv[0],iv[1]),sai=somaMov('SAIDA',iv[0],iv[1]);
    corpo='<section class="item" style="display:block">'+
      '<div style="font-size:12px;color:var(--muted)">Saldo do período</div>'+
      '<div class="val2" style="font-size:24px">'+brl(ent-sai)+'</div>'+
      '<div style="display:flex;gap:16px;margin-top:8px;font-size:13px"><span style="color:var(--emerald)">▲ Entradas '+brl(ent)+'</span><span style="color:var(--rose)">▼ Saídas '+brl(sai)+'</span></div>'+
    '</section>'+
    blocoCategorias('Saídas por categoria','SAIDA',iv,'var(--rose)')+
    blocoCategorias('Entradas por categoria','ENTRADA',iv,'var(--emerald)')+
    '<button class="btnS" style="width:100%;margin-top:6px" onclick="exportarCsv()">'+IC.baixar+' Exportar em CSV (Excel)</button>'+
    '<button class="btnS" style="width:100%;margin-top:8px" onclick="abrirEvolucao()">Evolução da farmácia (6 meses)</button>'+
    '<button class="btnS" style="width:100%;margin-top:8px" onclick="abrirComparativo()">Comparar com o mês anterior</button>';
  }
  return '<div class="chips">'+per.map(function(p){ return '<button class="chip '+(relPeriodo===p[0]?'on':'')+'" onclick="relPeriodo=\''+p[0]+'\';render()">'+p[1]+'</button>'; }).join('')+'</div>'+
    (relPeriodo==='custom'?'<div class="duo"><div style="flex:1"><label class="campo">De</label><input type="date" value="'+relDe+'" onchange="relDe=this.value;render()"/></div><div style="flex:1"><label class="campo">Até</label><input type="date" value="'+relAte+'" onchange="relAte=this.value;render()"/></div></div>':'')+
    '<button class="btnS" style="width:100%;margin-top:6px" onclick="abrirMesesAnteriores()">Meses anteriores</button>'+
    corpo;
}
// Atalho pra ver um mês passado sem digitar datas: escolhe o mês e o
// relatório já recalcula (entradas/saídas por categoria, CSV etc.) pra ele.
function abrirMesesAnteriores(){
  const hoje=new Date();
  const meses=[];
  for(let k=0;k<12;k++){
    const d=new Date(hoje.getFullYear(), hoje.getMonth()-k, 1);
    meses.push({ano:d.getFullYear(), mes:d.getMonth()+1});
  }
  abrirFolha('Meses anteriores',
    meses.map(function(m){
      const rot=NOMES_MES[m.mes-1].charAt(0).toUpperCase()+NOMES_MES[m.mes-1].slice(1)+'/'+m.ano;
      return '<button class="msCard" style="margin-top:6px" onclick="escolherMesRelatorio('+m.ano+','+m.mes+')">'+
        '<div class="msTopo"><span class="msRot" style="text-transform:none">'+rot+'</span></div></button>';
    }).join(''));
}
function escolherMesRelatorio(ano,mes){
  relPeriodo='custom';
  const ultimoDia=new Date(ano,mes,0).getDate();
  relDe=ano+'-'+String(mes).padStart(2,'0')+'-01';
  relAte=ano+'-'+String(mes).padStart(2,'0')+'-'+String(ultimoDia).padStart(2,'0');
  fecharFolha(); render();
}
function exportarCsv(){
  const iv=intervalo(); if(!iv)return;
  const linhas=[['Data','Hora','Tipo','Categoria','Descricao','Valor']];
  movimentos.filter(function(m){ return m.ts>=iv[0]&&m.ts<iv[1]; }).sort(function(a,b){ return a.ts-b.ts; }).forEach(function(m){
    const d=new Date(m.ts);
    linhas.push([d.toLocaleDateString('pt-BR'),d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}),m.tipo,m.categoria||'',(m.desc||'').replace(/;/g,','),m.valor.toFixed(2)]);
  });
  const ent=somaMov('ENTRADA',iv[0],iv[1]),sai=somaMov('SAIDA',iv[0],iv[1]);
  linhas.push([]);
  linhas.push(['','','','','TOTAL ENTRADAS',ent.toFixed(2)]);
  linhas.push(['','','','','TOTAL SAIDAS',sai.toFixed(2)]);
  linhas.push(['','','','','SALDO',(ent-sai).toFixed(2)]);
  const csv='\uFEFF'+linhas.map(function(l){ return l.join(';'); }).join('\n');
  const blob=new Blob([csv],{type:'text/csv;charset=utf-8;'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='relatorio-'+relPeriodo+'.csv'; a.click();
}

// ============================================================
//  Folha (modal)
// ============================================================
function abrirFolha(titulo,html,apos){
  const ov=document.createElement('div'); ov.className='overlay'; ov.id='overlay';
  ov.onclick=function(e){ if(e.target===ov) fecharFolha(); };
  ov.innerHTML='<div class="folha"><div class="folhaAlca"></div><div class="folhaTopo"><span class="folhaTitulo">'+escapeHtml(titulo)+'</span><button class="fechar" onclick="fecharFolha()">✕</button></div>'+html+'</div>';
  document.body.appendChild(ov); if(apos) apos();
}
function fecharFolha(){ pararScanner(); const o=document.getElementById('overlay'); if(o) o.remove(); }

// ============================================================
//  Início
// ============================================================
async function aposCarregar(){
  try{ await carregarRecorrentes(); await gerarRecorrentes(); }catch(e){}
  try{ avisarVencimentos(false); }catch(e){}
  try{ await carregarMeta(); }catch(e){}
  try{ await carregarMetaLucro(); }catch(e){}
  try{ lembrarBackup(); }catch(e){}
}
async function iniciar(){
  document.getElementById('raiz').innerHTML='<div style="display:grid;place-items:center;height:100vh;background:var(--pine)"><span class="girando" style="color:var(--amber);font-size:34px">◜</span></div>';
  try{ await carregarTudo(); montarApp(); aposCarregar(); }
  catch(e){ Sessao.limpar(); mostrarLogin('Não consegui conectar. Verifique a internet e entre novamente.'); }
}

const _s=Sessao.ler();
if(_s && _s.token) iniciar(); else mostrarLogin();

document.addEventListener('visibilitychange',function(){
  const s=Sessao.ler();
  if(!document.hidden && s && s.token && document.getElementById('main')) recarregar();
});

if('serviceWorker' in navigator){
  window.addEventListener('load',function(){ navigator.serviceWorker.register('service-worker.js').catch(function(){}); });
}
