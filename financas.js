// ============================================================
//  Utilidades
// ============================================================
// Lê valores no formato brasileiro com segurança:
// "1.771,19" -> 1771.19 | "177119" -> 177119 | "1771,19" -> 1771.19
// "1.771" -> 1771 (ponto de milhar) | "1771.19" -> 1771.19 (ponto decimal)
function parseValor(txt){
  let s=String(txt==null?'':txt).trim().replace(/[^\d.,]/g,'');
  if(!s) return NaN;
  if(s.indexOf(',')>=0){
    s=s.replace(/\./g,'').replace(',','.');            // vírgula é o decimal
  }else{
    const p=s.split('.');
    if(p.length>2) s=p.join('');                        // 1.234.567
    else if(p.length===2 && p[1].length===3) s=p.join(''); // 1.771 = milhar
  }
  const n=parseFloat(s);
  return isNaN(n)?NaN:n;
}
function brl(n){ return Number(n||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}); }
// Todo texto vindo do banco (descrição, categoria, nome...) passa por aqui antes
// de entrar em innerHTML — sem isso, um texto como "<img onerror=...>" digitado
// num lançamento rodaria como código na tela de quem quer que abra o app depois.
function escapeHtml(s){
  return String(s==null?'':s).replace(/[&<>"']/g,function(c){
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
  });
}
// Para texto (ex.: nome de categoria, digitado livremente pelo usuário) que vai
// dentro de um onclick="...='+valor+'..." — primeiro escapa a aspa simples pra
// não fechar a string JS antes da hora, depois escapa pra HTML porque o
// onclick inteiro é um atributo (delimitado por aspas duplas).
function escapeAttrJs(s){
  return escapeHtml(String(s==null?'':s).replace(/\\/g,'\\\\').replace(/'/g,"\\'"));
}
function comHora(d){ return String(d).length===10 ? d+'T12:00:00' : d; }
function dm(d){ return new Date(comHora(d)).toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'}); }
function inicioDia(d){ d=d||new Date(); return new Date(d.getFullYear(),d.getMonth(),d.getDate()).getTime(); }
// Categorias vindas do banco (podem ser criadas pelo usuário)
let CATS={ENTRADA:['Venda','Suprimento','Outros'],SAIDA:['Distribuidor','Outros'],DESPESA:['Frete','Outros']};
let historicoDesc=[];   // descrições já usadas, para sugerir ao digitar
let categoriasFull=[];   // registros completos, para editar/excluir
function montarCategorias(lista){
  categoriasFull=lista||[];
  const m={ENTRADA:[],SAIDA:[],DESPESA:[]};
  categoriasFull.forEach(function(c){ if(m[c.tipo]&&m[c.tipo].indexOf(c.nome)<0) m[c.tipo].push(c.nome); });
  ['ENTRADA','SAIDA','DESPESA'].forEach(function(t){ if(!m[t].length) m[t]=CATS[t]||['Outros']; });
  CATS=m;
}

// ---- Gerenciar categorias (criar, renomear, excluir) ----
function contaUsoCategoria(nome){
  let n=0;
  movimentos.forEach(function(m){ if((m.categoria||'')===nome) n++; });
  contas.forEach(function(c){ if((c.categoria||'')===nome) n++; });
  return n;
}
function abrirGerenciarCategorias(){
  const porTipo={SAIDA:[],ENTRADA:[],DESPESA:[]};
  categoriasFull.forEach(function(c){ if(porTipo[c.tipo]) porTipo[c.tipo].push(c); });
  const rotulo={SAIDA:'Saídas / Contas',ENTRADA:'Entradas',DESPESA:'Despesas'};
  abrirFolha('Gerenciar categorias',
    ['SAIDA','DESPESA','ENTRADA'].map(function(t){
      return '<h2 class="sec" style="margin-top:10px">'+rotulo[t]+'</h2>'+
        (porTipo[t].length?porTipo[t].map(function(c){
          const uso=contaUsoCategoria(c.nome);
          return '<div class="item" style="margin-top:6px"><div style="flex:1">'+
            '<div style="font-size:14px;font-weight:500">'+escapeHtml(c.nome)+'</div>'+
            '<div style="font-size:11px;color:var(--muted)">'+(uso?uso+' lançamento(s)':'não usada')+'</div></div>'+
            '<button class="pagarBtn" style="color:var(--pine);background:#EEF2F0" onclick="renomearCategoria(\''+c.id+'\')">Renomear</button>'+
            '<button class="lixo" onclick="excluirCategoria(\''+c.id+'\')">'+IC.lixo+'</button></div>';
        }).join(''):'<div class="vazio">Nenhuma.</div>')+
        '<button class="chip chipNova" style="margin-top:8px" onclick="novaCategoria(\''+t+'\',\'gerenciar\')">+ nova categoria</button>';
    }).join(''));
}
async function renomearCategoria(id){
  const cat=categoriasFull.filter(function(c){ return c.id===id; })[0]; if(!cat) return;
  const novoNome=(prompt('Novo nome para "'+cat.nome+'":', cat.nome)||'').trim();
  if(!novoNome || novoNome===cat.nome) return;
  const uso=contaUsoCategoria(cat.nome);
  if(uso && !confirm('Renomear e atualizar '+uso+' lançamento(s) de "'+cat.nome+'" para "'+novoNome+'"?')) return;
  try{
    await api('categorias?id=eq.'+id,{method:'PATCH',body:JSON.stringify({nome:novoNome})});
    // atualiza os lançamentos e contas que usavam o nome antigo
    const movs=movimentos.filter(function(m){ return (m.categoria||'')===cat.nome; });
    const cts=contas.filter(function(c){ return (c.categoria||'')===cat.nome; });
    for(let i=0;i<movs.length;i++) await api('movimentos?id=eq.'+movs[i].id,{method:'PATCH',body:JSON.stringify({categoria:novoNome})});
    for(let i=0;i<cts.length;i++) await api('contas?id=eq.'+cts[i].id,{method:'PATCH',body:JSON.stringify({categoria:novoNome})});
    const lista=await api('categorias?select=*&order=nome.asc'); montarCategorias(lista);
    await recarregar(); fecharFolha(); abrirGerenciarCategorias();
  }catch(e){ alert(e.message); }
}
async function excluirCategoria(id){
  const cat=categoriasFull.filter(function(c){ return c.id===id; })[0]; if(!cat) return;
  const uso=contaUsoCategoria(cat.nome);
  if(uso){
    alert('Não dá para excluir "'+cat.nome+'": há '+uso+' lançamento(s) usando ela.\n\nRenomeie esses lançamentos primeiro (ou reclassifique-os) e depois exclua.');
    return;
  }
  if(!confirm('Excluir a categoria "'+cat.nome+'"?')) return;
  try{
    await api('categorias?id=eq.'+id,{method:'DELETE'});
    const lista=await api('categorias?select=*&order=nome.asc'); montarCategorias(lista);
    fecharFolha(); abrirGerenciarCategorias();
  }catch(e){ alert(e.message); }
}
function montarHistorico(){
  const vistos={}, lista=[];
  movimentos.concat(contas.map(function(c){ return {desc:c.desc}; })).forEach(function(x){
    const d=(x.desc||'').trim();
    if(d && d.length>2 && !vistos[d.toLowerCase()]){ vistos[d.toLowerCase()]=1; lista.push(d); }
  });
  historicoDesc=lista.sort();
}
function listaSugestoes(id){
  return '<datalist id="'+id+'">'+historicoDesc.map(function(d){ return '<option value="'+escapeHtml(d)+'"></option>'; }).join('')+'</datalist>';
}
function somaMov(tipo,desde,ate,categoria){ return movimentos.filter(function(m){ return m.tipo===tipo&&m.ts>=desde&&m.ts<ate&&(!categoria||m.categoria===categoria); }).reduce(function(s,m){ return s+m.valor; },0); }
function resumoVendas(){ const d0=inicioDia(),am=d0+86400000,s0=am-7*86400000,m0=new Date(new Date().getFullYear(),new Date().getMonth(),1).getTime(); return {dia:somaMov('ENTRADA',d0,am,'Venda'),semana:somaMov('ENTRADA',s0,am,'Venda'),mes:somaMov('ENTRADA',m0,am,'Venda')}; }
function saldoDia(){ const d0=inicioDia(),am=d0+86400000; return {ent:somaMov('ENTRADA',d0,am),sai:somaMov('SAIDA',d0,am)}; }
function estoqueDe(p){ return Number(p.estoque||0); }
function diasAte(d){ return Math.round((new Date(comHora(d))-new Date())/86400000); }
function statusValidade(v){ if(!v)return null; const dias=diasAte(v); if(dias<0)return {t:'Vencido',c:'var(--rose)',bg:'#FDECEC'}; if(dias<=30)return {t:'Vence em '+dias+'d',c:'var(--amber)',bg:'#FEF3D9'}; return {t:'Val. '+dm(v),c:'var(--muted)',bg:'#EEF2F0'}; }

// Filtro das abas: Boletos e Despesas são contas a pagar; A receber é o que entra.
function filtroAba(a){
  if(a==='RECEBER') return function(c){ return c.tipo==='RECEBER'; };
  if(a==='BOLETO')  return function(c){ return c.tipo==='PAGAR' && c.origem==='BOLETO'; };
  if(a==='DESPESA') return function(c){ return c.tipo==='PAGAR' && c.origem!=='BOLETO'; };
  return function(c){ return c.tipo==='PAGAR'; };   // 'PAGAR' = todas as contas a pagar
}
function contasOrd(aba){
  const lista = contas.filter(filtroAba(aba));
  if(aba==='DESPESA'){
    // pendentes primeiro (vencimento mais próximo no topo, pedem ação);
    // pagas depois, ordenadas pela data em que o pagamento aconteceu —
    // é essa data que interessa numa despesa já quitada, não o vencimento.
    return lista.sort(function(a,b){
      const pa=a.status!=='PAGO', pb=b.status!=='PAGO';
      if(pa!==pb) return pa?-1:1;
      if(pa) return new Date(a.venc)-new Date(b.venc);
      const da=a.dataBaixa?new Date(a.dataBaixa).getTime():new Date(a.venc).getTime();
      const db=b.dataBaixa?new Date(b.dataBaixa).getTime():new Date(b.venc).getTime();
      return db-da;
    });
  }
  return lista.sort(function(a,b){ return new Date(a.venc)-new Date(b.venc); });
}
function alertas(){
  const baixo=produtos.filter(function(p){ return Number(p.minimo||0)>0&&estoqueDe(p)<Number(p.minimo); }).length;
  const venc=produtos.filter(function(p){ return p.validade&&diasAte(p.validade)<0&&estoqueDe(p)>0; }).length;
  const cp=contas.filter(function(c){ return c.tipo==='PAGAR'&&c.status!=='PAGO'&&diasAte(c.venc)<=7; });
  return {baixo:baixo,venc:venc,contas:cp.length,contasTotal:cp.reduce(function(s,c){ return s+c.valor; },0),proxima:contasOrd('PAGAR').filter(function(c){ return c.status!=='PAGO'; })[0]};
}
// ---- Busca de lançamentos e contas ----
let buscaTexto='', buscaDe='', buscaAte='', buscaTipo='TODOS';
function abrirBusca(){
  abrirFolha('Buscar lançamentos',
    '<input id="bqTexto" placeholder="Distribuidora, descrição, categoria ou valor" value="'+escapeHtml(buscaTexto||'')+'" oninput="buscaTexto=this.value;resultadosBusca()"/>'+
    '<div class="chips" style="margin-top:10px">'+
      [['TODOS','Tudo'],['SAIDA','Saídas'],['ENTRADA','Entradas'],['CONTAS','Contas']].map(function(t){
        return '<button class="chip '+(buscaTipo===t[0]?'on':'')+'" onclick="buscaTipo=\''+t[0]+'\';abrirBuscaMantendo()">'+t[1]+'</button>';
      }).join('')+
    '</div>'+
    '<div class="duo" style="margin-top:6px">'+
      '<div style="flex:1"><label class="campo">De</label><input type="date" value="'+buscaDe+'" onchange="buscaDe=this.value;resultadosBusca()"/></div>'+
      '<div style="flex:1"><label class="campo">Até</label><input type="date" value="'+buscaAte+'" onchange="buscaAte=this.value;resultadosBusca()"/></div>'+
    '</div>'+
    '<div id="bqRes" style="margin-top:12px"></div>',
    function(){ resultadosBusca(); const e=document.getElementById('bqTexto'); if(e) e.focus(); });
}
function abrirBuscaMantendo(){ fecharFolha(); abrirBusca(); }

function resultadosBusca(){
  const alvo=document.getElementById('bqRes'); if(!alvo) return;
  const q=(buscaTexto||'').trim().toLowerCase();
  const qNum=parseValor(buscaTexto);
  const de=buscaDe?new Date(buscaDe+'T00:00:00').getTime():null;
  const ate=buscaAte?new Date(buscaAte+'T00:00:00').getTime()+86400000:null;

  function combina(texto,valor,ts){
    if(de && ts<de) return false;
    if(ate && ts>=ate) return false;
    if(!q) return true;
    if(String(texto||'').toLowerCase().indexOf(q)>=0) return true;
    if(!isNaN(qNum) && Math.abs(valor-qNum)<0.005) return true;
    return false;
  }

  let itens=[];
  if(buscaTipo!=='CONTAS'){
    movimentos.forEach(function(m){
      if(buscaTipo==='SAIDA'&&m.tipo!=='SAIDA') return;
      if(buscaTipo==='ENTRADA'&&m.tipo!=='ENTRADA') return;
      if(combina((m.desc||'')+' '+(m.categoria||''), m.valor, m.ts))
        itens.push({tipo:'mov', id:m.id, ts:m.ts, titulo:m.desc||m.categoria||'Lançamento',
                    sub:(m.categoria||'')+' · '+dm(dataLocal(m.ts)),
                    valor:m.valor, entrada:m.tipo==='ENTRADA'});
    });
  }
  if(buscaTipo==='TODOS'||buscaTipo==='CONTAS'){
    contas.forEach(function(c){
      // No modo "Tudo", uma conta paga já aparece como o lançamento de caixa
      // vinculado — listar os dois somaria o mesmo dinheiro em dobro.
      if(buscaTipo==='TODOS' && c.status==='PAGO' && movimentoDaConta(c.id)) return;
      const ts=new Date(c.venc+'T12:00:00').getTime();
      if(combina((c.desc||'')+' '+(c.categoria||'')+' '+(c.documento||''), c.valor, ts))
        itens.push({tipo:'conta', id:c.id, ts:ts, titulo:c.desc,
                    sub:(c.status==='PAGO'?'Pago':'Em aberto')+' · vence '+dm(c.venc)+(c.documento?' · nº '+c.documento:''),
                    valor:c.valor, entrada:c.tipo==='RECEBER'});
    });
  }
  itens.sort(function(a,b){ return b.ts-a.ts; });

  const total=itens.reduce(function(s,x){ return s+(x.entrada?x.valor:-x.valor); },0);
  const soma=itens.reduce(function(s,x){ return s+x.valor; },0);

  if(!itens.length){ alvo.innerHTML='<div class="vazio">Nada encontrado. Tente outra palavra ou limpe as datas.</div>'; return; }

  alvo.innerHTML='<div class="totalAberto"><span>'+itens.length+' resultado(s)</span><strong>'+brl(soma)+'</strong></div>'+
    itens.slice(0,80).map(function(x){
      return '<div class="item" style="margin-top:8px'+(x.tipo==='mov'?';cursor:pointer" onclick="fecharFolha();abrirEditar(\''+x.id+'\')':'"')+'>'+
        '<div style="flex:1"><div style="font-size:14px;font-weight:500">'+escapeHtml(x.titulo)+'</div>'+
        '<div style="font-size:11.5px;color:var(--muted)">'+escapeHtml(x.sub)+'</div></div>'+
        '<div class="val2" style="color:'+(x.entrada?'var(--emerald)':'var(--rose)')+'">'+brl(x.valor)+'</div></div>';
    }).join('')+
    (itens.length>80?'<div class="dica">Mostrando os 80 mais recentes. Refine a busca para ver menos.</div>':'');
}
// Varre o que já está cadastrado e mostra possíveis repetições
function conferirDuplicados(){
  const achados=[];
  for(let i=0;i<contas.length;i++){
    for(let j=i+1;j<contas.length;j++){
      const a=contas[i], b=contas[j];
      let motivo=null;
      // Mesma regra da checagem ao salvar: só considera repetido quando
      // código de barras completo, vencimento e valor batem os três juntos.
      if(a.linha && b.linha && a.linha===b.linha && a.venc===b.venc && Math.abs(a.valor-b.valor)<0.005)
        motivo='mesmo código de barras, vencimento e valor';
      if(motivo) achados.push({a:a,b:b,motivo:motivo,tipo:'Conta'});
    }
  }
  for(let i=0;i<movimentos.length;i++){
    for(let j=i+1;j<movimentos.length;j++){
      const a=movimentos[i], b=movimentos[j];
      if(a.tipo!==b.tipo) continue;
      if(Math.abs(a.valor-b.valor)>=0.005) continue;
      if(dataLocal(a.ts)!==dataLocal(b.ts)) continue;
      if(!textoIgual(a.desc,b.desc)) continue;
      achados.push({a:{desc:a.desc,valor:a.valor,venc:dataLocal(a.ts)},
                    b:{desc:b.desc,valor:b.valor,venc:dataLocal(b.ts)},
                    motivo:'mesmo dia, valor e descrição', tipo:'Lançamento', idB:b.id});
    }
  }
  abrirFolha('Conferência de repetidos',
    achados.length
      ? '<div class="totalAberto"><span>'+achados.length+' possível(is) repetição(ões)</span></div>'+
        achados.slice(0,40).map(function(x){
          return '<div class="item" style="margin-top:8px;display:block">'+
            '<div style="font-size:14px;font-weight:500">'+escapeHtml(x.a.desc)+' — '+brl(x.a.valor)+'</div>'+
            '<div style="font-size:11.5px;color:var(--muted);margin-top:3px">'+x.tipo+' · '+x.motivo+' · '+dm(x.a.venc)+'</div>'+
            (x.idB?'<button class="pagarBtn" style="color:var(--rose);background:#FDECEC;margin-top:6px" onclick="apagarMov(\''+x.idB+'\')">Excluir a segunda cópia</button>':'')+
          '</div>';
        }).join('')
      : '<div class="vazio">Nenhuma repetição encontrada. Está tudo certo.</div>');
}
// Painel dos próximos meses (mês atual + 3 seguintes)
function painelMeses(lista){
  const abertas=lista.filter(function(c){ return c.status!=='PAGO'; });
  if(!abertas.length) return '';
  const hoje=new Date();
  const blocos=[];
  for(let k=0;k<4;k++){
    const d=new Date(hoje.getFullYear(), hoje.getMonth()+k, 1);
    const ano=d.getFullYear(), mes=d.getMonth()+1;
    const ini=new Date(ano,mes-1,1).getTime();
    const fim=new Date(ano,mes,1).getTime();
    const doMes=abertas.filter(function(c){
      const t=new Date(c.venc+'T12:00:00').getTime();
      return t>=ini && t<fim;
    });
    // no mês corrente, inclui também o que já venceu e não foi pago
    let atrasadas=[];
    if(k===0) atrasadas=abertas.filter(function(c){ return new Date(c.venc+'T12:00:00').getTime()<ini; });
    const todas=doMes.concat(atrasadas);
    const total=todas.reduce(function(s,c){ return s+c.valor; },0);
    blocos.push({
      chave:ano+'-'+String(mes).padStart(2,'0'),
      rot:NOMES_MES[mes-1]+'/'+String(ano).slice(2),
      qtd:todas.length, total:total,
      atual:k===0, atrasadas:atrasadas.length
    });
  }
  const maior=blocos.reduce(function(m,b){ return Math.max(m,b.total); },0);
  const somaTudo=blocos.reduce(function(s,b){ return s+b.total; },0);

  return '<h2 class="sec">Próximos meses</h2>'+
    '<div class="msLista">'+
      blocos.map(function(b){
        const pct=maior?Math.round(b.total/maior*100):0;
        const on=filtroMes===b.chave;
        return '<button class="msCard'+(on?' msOn':'')+'" onclick="filtroMes=\''+(on?'':b.chave)+'\';filtroVenc=\'todos\';render()">'+
          '<div class="msTopo"><span class="msRot">'+b.rot+(b.atual?' · atual':'')+'</span>'+
          '<strong class="msVal">'+brl(b.total)+'</strong></div>'+
          '<div class="msBarra"><span style="width:'+pct+'%"></span></div>'+
          '<div class="msQtd">'+b.qtd+' conta'+(b.qtd===1?'':'s')+
            (b.atrasadas?' · '+b.atrasadas+' atrasada'+(b.atrasadas===1?'':'s'):'')+'</div>'+
        '</button>';
      }).join('')+
    '</div>'+
    '<div class="msTotal"><span>Total nos 4 meses</span><strong>'+brl(somaTudo)+'</strong></div>'+
    (filtroMes?'<button class="btnS" style="width:100%;margin-top:8px" onclick="filtroMes=\'\';render()">Mostrando um mês — ver todos</button>':'');
}
let filtroMes='';
function aplicaFiltroMes(lista){
  if(!filtroMes) return lista;
  const [ano,mes]=filtroMes.split('-').map(Number);
  const ini=new Date(ano,mes-1,1).getTime();
  const fim=new Date(ano,mes,1).getTime();
  const hoje=new Date();
  const ehAtual = (ano===hoje.getFullYear() && mes===hoje.getMonth()+1);
  return lista.filter(function(c){
    if(c.status==='PAGO') return false;
    const t=new Date(c.venc+'T12:00:00').getTime();
    if(ehAtual && t<ini) return true;      // atrasadas entram no mês corrente
    return t>=ini && t<fim;
  });
}
// ============================================================
//  VISÃO SIMPLES (para quem usa o app só para acompanhar)
// ============================================================
let visaoSimples=false, meuNome='';
let operadores=[];
async function carregarOperadores(){
  const s=Sessao.ler();
  const meu=((s&&s.email)||'').toLowerCase();
  try{
    operadores=await api('operadores?select=*&order=nome.asc')||[];
    const eu=operadores.filter(function(o){ return String(o.email||'').toLowerCase()===meu; })[0];
    visaoSimples = eu ? eu.visao_simples===true : false;
    meuNome = eu&&eu.nome ? eu.nome : '';
  }catch(e){ visaoSimples=false; }
  if(souAdmin) visaoSimples=false;   // o administrador nunca fica na visão simples
}

function vSimples(){
  const r=resumoVendas();
  const hoje=new Date();
  const A=resumoMes(hoje.getFullYear(), hoje.getMonth()+1);
  const antMes = hoje.getMonth()===0?12:hoje.getMonth();
  const antAno = hoje.getMonth()===0?hoje.getFullYear()-1:hoje.getFullYear();
  const B=resumoMes(antAno, antMes);
  const v=variacao(A.vendas,B.vendas);
  const abertas=contas.filter(function(c){ return c.tipo==='PAGAR'&&c.status!=='PAGO'; });
  const totalAberto=abertas.reduce(function(s,c){ return s+c.valor; },0);
  const proximas=abertas.filter(function(c){ return diasAte(c.venc)<=7; });
  const totalProx=proximas.reduce(function(s,c){ return s+c.valor; },0);
  const positivo=A.saldo>=0;

  return '<div class="simpleOi">Olá'+(meuNome?', '+escapeHtml(meuNome):'')+'</div>'+
    '<section class="hero"><div class="brilho"></div>'+
      '<div class="lbl">Saldo deste mês</div>'+
      '<div class="val">'+brl(A.saldo)+'</div>'+
      '<div style="font-size:12.5px;color:#FFD9D5;margin-top:4px;position:relative">'+
        (positivo?'Entrou mais do que saiu':'Saiu mais do que entrou')+'</div>'+
    '</section>'+

    '<div class="duo">'+
      '<div class="mini"><div class="l">Vendas do mês</div><div class="v" style="color:var(--emerald)">'+brl(A.vendas)+'</div>'+
        '<div style="font-size:11px;color:'+(v.cor||'var(--muted)')+';margin-top:3px">'+v.txt+' vs mês passado</div></div>'+
      '<div class="mini"><div class="l">Gastos do mês</div><div class="v" style="color:var(--rose)">'+brl(A.sai)+'</div>'+
        '<div style="font-size:11px;color:var(--muted);margin-top:3px">tudo que saiu</div></div>'+
    '</div>'+

    '<h2 class="sec">Vendas</h2>'+
    '<div class="item"><div style="flex:1"><div style="font-size:14px;font-weight:500">Hoje</div></div>'+
      '<div class="val2" style="color:var(--emerald)">'+brl(r.dia)+'</div></div>'+
    '<div class="item"><div style="flex:1"><div style="font-size:14px;font-weight:500">Últimos 7 dias</div></div>'+
      '<div class="val2" style="color:var(--emerald)">'+brl(r.semana)+'</div></div>'+

    '<h2 class="sec">Contas a pagar</h2>'+
    '<div class="item"><div style="flex:1"><div style="font-size:14px;font-weight:500">Total em aberto</div>'+
      '<div style="font-size:11.5px;color:var(--muted)">'+abertas.length+' conta(s)</div></div>'+
      '<div class="val2">'+brl(totalAberto)+'</div></div>'+
    (proximas.length
      ? '<div class="item" style="border-color:#F0C4CB;background:#FDECEC"><div style="flex:1">'+
        '<div style="font-size:14px;font-weight:600;color:var(--rose)">Vence nos próximos 7 dias</div>'+
        '<div style="font-size:11.5px;color:var(--muted)">'+proximas.length+' conta(s)</div></div>'+
        '<div class="val2" style="color:var(--rose)">'+brl(totalProx)+'</div></div>'
      : '<div class="vazio">Nada vencendo nos próximos dias.</div>')+

    '<div class="dica" style="text-align:center;margin-top:16px">Esta é a visão resumida. Para lançar ou ver detalhes, fale com o Marcus.</div>';
}

// ============================================================
//  EVOLUÇÃO MENSAL (dashboard)
// ============================================================
function seriesMeses(qtd){
  const hoje=new Date();
  const lista=[];
  for(let k=qtd-1;k>=0;k--){
    const d=new Date(hoje.getFullYear(), hoje.getMonth()-k, 1);
    const ano=d.getFullYear(), mes=d.getMonth()+1;
    const R=resumoMes(ano,mes);
    lista.push({ano:ano,mes:mes,rot:NOMES_MES[mes-1]+'/'+String(ano).slice(2),
      vendas:R.vendas, ent:R.ent, sai:R.sai, saldo:R.saldo, atual:(k===0)});
  }
  return lista;
}
// Soma todo o histórico já lançado, desde o primeiro movimento.
function saldoAcumuladoTotal(){
  let ent=0, sai=0, primeiro=null, saldoInicial=0;
  movimentos.forEach(function(m){
    if(m.tipo==='ENTRADA') ent+=m.valor; else sai+=m.valor;
    if(m.categoria==='Saldo Inicial') saldoInicial+=m.valor;
    if(primeiro===null || m.ts<primeiro) primeiro=m.ts;
  });
  return {ent:ent, sai:sai, saldo:ent-sai, desde:primeiro, saldoInicial:saldoInicial};
}

// Cartão "acumulado x mês atual". Reutilizado na tela inicial e na Evolução.
// Se não receber o mês atual pronto (chamada a partir do Início), calcula sozinho.
function cartaoSaldoAcumulado(atualPronto){
  const hoje=new Date();
  const atual = atualPronto || (function(){
    const R=resumoMes(hoje.getFullYear(), hoje.getMonth()+1);
    return {rot:NOMES_MES[hoje.getMonth()]+'/'+String(hoje.getFullYear()).slice(2), saldo:R.saldo};
  })();
  const T=saldoAcumuladoTotal();
  if(!T.desde) return '';
  const contrib = T.saldo!==0 ? (atual.saldo/T.saldo*100) : null;
  const mesTotalPositivo = atual.saldo>=0;
  const geralPositivo = T.saldo>=0;
  const desdeTxt = new Date(T.desde).toLocaleDateString('pt-BR',{month:'long',year:'numeric'});
  return '<div class="acCompara">'+
      '<div class="acLado">'+
        '<div class="acRot">Acumulado desde '+desdeTxt+'</div>'+
        '<div class="acVal" style="color:'+(geralPositivo?'var(--emerald)':'var(--rose)')+'">'+brl(T.saldo)+'</div>'+
      '</div>'+
      '<div class="acSeparador"></div>'+
      '<div class="acLado">'+
        '<div class="acRot">Só '+atual.rot+'</div>'+
        '<div class="acVal" style="color:'+(mesTotalPositivo?'var(--emerald)':'var(--rose)')+'">'+brl(atual.saldo)+'</div>'+
      '</div>'+
    '</div>'+
    (contrib!==null
      ? '<div class="dica" style="text-align:center;margin-top:6px">'+
          (Math.abs(contrib)<=100
            ? 'Este mês representa '+Math.abs(contrib).toFixed(0)+'% do saldo acumulado'
            : (contrib>0
                ? 'Este mês sozinho é maior que todo o acumulado — os meses anteriores estavam no negativo'
                : 'Este mês está puxando o acumulado para baixo'))+
        '</div>'
      : '')+
    (T.saldoInicial
      ? '<div class="dica" style="text-align:center;margin-top:2px">Inclui '+brl(T.saldoInicial)+' de saldo inicial de caixa</div>'
      : '');
}

// ============================================================
//  PROJEÇÃO DO MÊS (matemática simples, sem IA — grátis e conferível)
// ============================================================
// Ritmo de venda: quanto já vendeu dividido pelos dias já "trabalhados",
// multiplicado pelos dias do mês inteiro. É a projeção mais simples e
// mais fácil de auditar — não tenta adivinhar padrão de fim de semana
// nem sazonalidade, só estica a média observada até aqui.
function projecaoMes(){
  const hoje=new Date();
  const ano=hoje.getFullYear(), mes=hoje.getMonth()+1;
  const R=resumoMes(ano,mes);
  const diasTotal=diasNoMes(ano,mes);
  const diasDecorridos=hoje.getDate();
  const temVendaHoje = movimentos.some(function(m){ return m.tipo==='ENTRADA'&&m.categoria==='Venda'&&dataLocal(m.ts)===hojeISO(); });
  // se a venda de hoje ainda não foi lançada, não conta hoje na média
  // (senão o "dia zerado" puxa a projeção pra baixo sem motivo)
  const diasBase=Math.max(1, temVendaHoje?diasDecorridos:diasDecorridos-1);
  const confiavel = diasBase>=4;   // com poucos dias, a projeção oscila demais pra confiar

  const vendaProjetada = (R.vendas/diasBase)*diasTotal;
  const comp=comprometidoMes();   // saída já lançada + contas que ainda vão vencer no mês
  const saldoProjetado = vendaProjetada - comp.total;

  // média dos últimos 3 meses fechados, pra comparar se o ritmo está melhor ou pior
  const hist=[];
  for(let k=1;k<=3;k++){
    const d=new Date(ano,mes-1-k,1);
    const Rm=resumoMes(d.getFullYear(), d.getMonth()+1);
    if(Rm.vendas>0) hist.push(Rm.vendas);
  }
  const mediaHist = hist.length? hist.reduce(function(s,x){ return s+x; },0)/hist.length : null;

  return {ano:ano, mes:mes, diasTotal:diasTotal, diasBase:diasBase, confiavel:confiavel,
          vendaAteAgora:R.vendas, vendaProjetada:vendaProjetada,
          comp:comp, saldoProjetado:saldoProjetado, mediaHist:mediaHist};
}

function blocoProjecao(){
  const p=projecaoMes();
  if(!p.confiavel){
    return '<h2 class="sec">Projeção do mês</h2>'+
      '<div class="vazio">Ainda cedo no mês ('+p.diasBase+' dia(s) de venda lançada) — a projeção fica confiável a partir do 4º dia.</div>';
  }
  const vComp = p.mediaHist ? variacao(p.vendaProjetada,p.mediaHist) : null;
  const positivo = p.saldoProjetado>=0;
  const pctTeto = metaTeto ? Math.round(p.comp.total/metaTeto*100) : null;

  return '<h2 class="sec">Projeção do mês (com base nos '+p.diasBase+' dia(s) já lançados)</h2>'+
    '<section class="cmpHero">'+
      '<div class="cmpHeroRot">Vendas — no ritmo atual, deve fechar em</div>'+
      '<div class="cmpHeroVal">'+brl(p.vendaProjetada)+'</div>'+
      '<div class="cmpHeroSub">Já vendido: '+brl(p.vendaAteAgora)+
        (vComp?' <span class="cmpBadge" style="background:'+(vComp.pct>=0?'#1E7A55':'#8E1A15')+'">'+vComp.txt+' vs média</span>':'')+
      '</div>'+
    '</section>'+
    '<div class="cmpCard" style="margin-top:9px">'+
      '<div class="cmpCardTopo"><span>Saldo projetado do mês</span><strong style="color:'+(positivo?'var(--emerald)':'var(--rose)')+'">'+brl(p.saldoProjetado)+'</strong></div>'+
      '<div class="cmpMini">vendas projetadas ('+brl(p.vendaProjetada)+') menos o que já saiu e o que ainda vai vencer ('+brl(p.comp.total)+')</div>'+
    '</div>'+
    (metaTeto ? '<div class="cmpCard" style="margin-top:8px">'+
        '<div class="cmpCardTopo"><span>Frente ao teto de gastos</span><strong style="color:'+(pctTeto<100?'var(--emerald)':'var(--rose)')+'">'+pctTeto+'%</strong></div>'+
        '<div class="cmpMini">'+brl(p.comp.total)+' comprometidos de '+brl(metaTeto)+'</div>'+
      '</div>' : '')+
    '<div class="dica">Projeção simples: estica a média de venda por dia até o fim do mês. Não considera fim de semana nem sazonalidade — é só um ritmo, não uma promessa.</div>';
}

// ============================================================
//  META DE LUCRO (área separada, fora do Início)
// ============================================================
// ============================================================
//  DRE SIMPLIFICADO (Demonstrativo de Resultado do mês)
// ============================================================
function grupoDaCategoria(nome){
  const c=categoriasFull.filter(function(x){ return x.nome===nome && x.tipo==='SAIDA'; })[0];
  return (c && c.grupo) ? c.grupo : 'Outros';
}
function montarDRE(ano,mes){
  const iv=limitesMes(ano,mes);
  const R=resumoMes(ano,mes);
  const cats=porCategoria('SAIDA',iv[0],iv[1]);
  const porGrupo={};
  cats.forEach(function(c){ const g=grupoDaCategoria(c.cat); porGrupo[g]=(porGrupo[g]||0)+c.total; });

  const mercadoria=porGrupo['Mercadoria']||0;
  const retiradas=porGrupo['Retiradas']||0;
  const gruposOp=['Pessoal','Ocupação','Administrativa','Operacional','Impostos','Outros'];
  const despesasOp=gruposOp.reduce(function(s,g){ return s+(porGrupo[g]||0); },0);

  const faturamento=R.vendas;
  const lucroBruto=faturamento-mercadoria;
  const resultadoAntesRetiradas=lucroBruto-despesasOp;
  const saldoFinal=resultadoAntesRetiradas-retiradas;

  return {
    faturamento:faturamento, mercadoria:mercadoria, lucroBruto:lucroBruto,
    despesasOp:despesasOp, detalheOp:gruposOp.map(function(g){ return {grupo:g,valor:porGrupo[g]||0}; }).filter(function(x){ return x.valor>0; }),
    resultadoAntesRetiradas:resultadoAntesRetiradas, retiradas:retiradas, saldoFinal:saldoFinal,
    margemBruta: faturamento>0?(lucroBruto/faturamento*100):null,
    margemLiquida: faturamento>0?(resultadoAntesRetiradas/faturamento*100):null
  };
}
function linhaDRE(rot,valor,cor,negrito,pct,indentado){
  return '<div class="dreLinha'+(negrito?' dreForte':'')+(indentado?' dreIndent':'')+'">'+
    '<span>'+rot+'</span>'+
    '<span class="dreVal" style="color:'+(cor||'var(--ink)')+'">'+brl(valor)+(pct!=null?' <em>'+pct.toFixed(0)+'%</em>':'')+'</span></div>';
}
// ============================================================
//  RESUMO DO MÊS POR IA (chama a Edge Function já publicada)
// ============================================================
async function gerarResumoIA(){
  const btn=document.getElementById('iaBtn');
  const area=document.getElementById('iaResultado');
  if(btn){ btn.textContent='Gerando…'; btn.disabled=true; }
  if(area){ area.innerHTML='<div class="dica"><span class="girando">◜</span> Pensando no resumo do mês…</div>'; }

  const hoje=new Date();
  const D=montarDRE(hoje.getFullYear(), hoje.getMonth()+1);
  let sit=null; try{ sit=situacaoRetirada(metaLucroPct); }catch(e){}

  const payload={
    mes: NOMES_MES[hoje.getMonth()]+'/'+hoje.getFullYear(),
    faturamento: D.faturamento,
    mercadoria_distribuidor: D.mercadoria,
    lucro_bruto: D.lucroBruto,
    margem_bruta_pct: D.margemBruta,
    despesas_operacionais_total: D.despesasOp,
    despesas_por_grupo: D.detalheOp,
    resultado_antes_retiradas: D.resultadoAntesRetiradas,
    margem_liquida_pct: D.margemLiquida,
    retiradas_do_mes: D.retiradas,
    saldo_final_do_mes: D.saldoFinal,
    saldo_acumulado_total: sit?sit.saldoAcumulado:null,
    meta_retirada_percentual: metaLucroPct,
    ja_retirado_este_mes: sit?sit.jaRetirado:null
  };

  const s=Sessao.ler();
  try{
    const resp=await fetchComLimite(SUPABASE_URL+'/functions/v1/resumo-mensal',{
      method:'POST',
      headers:{
        'Content-Type':'application/json',
        'apikey':SUPABASE_KEY,
        'Authorization':'Bearer '+((s&&s.token)||SUPABASE_KEY)
      },
      body:JSON.stringify(payload)
    }, 45000);
    const data=await resp.json();
    if(!area){}
    else if(data.erro){
      area.innerHTML='<div class="dica" style="color:var(--rose);background:#FDECEC;border-radius:10px;padding:10px 12px">'+escapeHtml(data.erro)+'</div>';
    }else if(data.texto){
      area.innerHTML='<div class="cmpCard" style="margin-top:2px"><div style="font-size:13.5px;line-height:1.6">'+escapeHtml(data.texto).replace(/\n/g,'<br>')+'</div></div>';
    }else{
      area.innerHTML='<div class="dica" style="color:var(--rose)">Resposta inesperada da IA.</div>';
    }
  }catch(e){
    if(area) area.innerHTML='<div class="dica" style="color:var(--rose)">Não consegui falar com a IA: '+e.message+'</div>';
  }
  if(btn){ btn.textContent='Gerar resumo do mês por IA'; btn.disabled=false; }
}

// ============================================================
//  VISÃO ANUAL (os 12 meses do ano civil, com navegação entre anos —
//  preparada pra crescer conforme o histórico avança)
// ============================================================
function seriesAno(ano){
  const hoje=new Date();
  const inicioMesAtual=new Date(hoje.getFullYear(),hoje.getMonth(),1).getTime();
  const lista=[];
  for(let mes=1; mes<=12; mes++){
    const R=resumoMes(ano,mes);
    const inicioDoMes=new Date(ano,mes-1,1).getTime();
    const futuro = inicioDoMes>inicioMesAtual;
    lista.push({ano:ano, mes:mes, rot:NOMES_MES[mes-1],
      vendas:R.vendas, sai:R.sai, saldo:R.saldo,
      atual:(ano===hoje.getFullYear()&&mes===hoje.getMonth()+1),
      futuro:futuro, semDados:(!futuro && R.vendas===0 && R.sai===0)});
  }
  return lista;
}
let anoVisaoSel=null;
function abrirVisaoAnual(){
  if(!podeFazer('relatorios')){ bloqueado('relatorios'); return; }
  if(!anoVisaoSel) anoVisaoSel=new Date().getFullYear();
  abrirFolha('Visão anual','<div id="vaCorpo"></div>', redesenharVisaoAnual);
}
function trocarAnoVisao(delta){
  anoVisaoSel+=delta;
  redesenharVisaoAnual();
}
function redesenharVisaoAnual(){
  const alvo=document.getElementById('vaCorpo'); if(!alvo) return;
  const ano=anoVisaoSel;
  const meses=seriesAno(ano);
  const comDados=meses.filter(function(m){ return !m.futuro && !m.semDados; });

  const totalVendas=meses.reduce(function(s,m){ return s+m.vendas; },0);
  const totalSaidas=meses.reduce(function(s,m){ return s+m.sai; },0);
  const totalSaldo=totalVendas-totalSaidas;
  const max=meses.reduce(function(m,x){ return Math.max(m,x.vendas,x.sai); },0);

  const barras=meses.map(function(m){
    if(m.futuro){
      return '<div class="evCol"><div class="evBarras"></div><div class="evRot" style="opacity:.35">'+m.rot+'</div></div>';
    }
    const hV=max?Math.round(m.vendas/max*100):0;
    const hS=max?Math.round(m.sai/max*100):0;
    return '<div class="evCol'+(m.atual?' evAtual':'')+'">'+
      '<div class="evBarras">'+
        '<div class="evB evBv" style="height:'+hV+'%" title="Vendas: '+brl(m.vendas)+'"></div>'+
        '<div class="evB evBs" style="height:'+hS+'%" title="Saídas: '+brl(m.sai)+'"></div>'+
      '</div>'+
      '<div class="evRot">'+m.rot+'</div></div>';
  }).join('');

  const tabela=meses.map(function(m){
    if(m.futuro) return '<div class="evLinha" style="opacity:.4"><span class="evMes">'+m.rot+'</span><span class="evVal">—</span><span class="evVal">—</span><span class="evVal">—</span></div>';
    const pos=m.saldo>=0;
    return '<div class="evLinha'+(m.semDados?'':'')+'"><span class="evMes">'+m.rot+'</span>'+
      '<span class="evVal" style="color:'+(m.semDados?'var(--muted)':'var(--emerald)')+'">'+(m.semDados?'—':brl(m.vendas))+'</span>'+
      '<span class="evVal" style="color:'+(m.semDados?'var(--muted)':'var(--rose)')+'">'+(m.semDados?'—':brl(m.sai))+'</span>'+
      '<strong class="evVal" style="color:'+(m.semDados?'var(--muted)':(pos?'var(--emerald)':'var(--rose)'))+'">'+(m.semDados?'—':brl(m.saldo))+'</strong></div>';
  }).join('');

  alvo.innerHTML=
    '<div class="mesNav">'+
      '<button onclick="trocarAnoVisao(-1)">‹</button>'+
      '<span>'+ano+'</span>'+
      '<button onclick="trocarAnoVisao(1)">›</button>'+
    '</div>'+
    '<section class="cmpHero">'+
      '<div class="cmpHeroRot">Saldo do ano</div>'+
      '<div class="cmpHeroVal">'+brl(totalSaldo)+'</div>'+
      '<div class="cmpHeroSub">Vendas '+brl(totalVendas)+' · Saídas '+brl(totalSaidas)+'</div>'+
    '</section>'+
    '<div class="evGrafico" style="gap:2px;padding:12px 6px">'+barras+'</div>'+
    '<div class="evLegenda"><span><i class="evPonto evBv"></i>Vendas</span><span><i class="evPonto evBs"></i>Saídas</span></div>'+
    '<div class="evLinha evCab"><span class="evMes">Mês</span><span class="evVal">Vendas</span><span class="evVal">Saídas</span><span class="evVal">Saldo</span></div>'+
    tabela+
    (comDados.length<3
      ? '<div class="dica" style="margin-top:10px">Ainda são poucos meses de histórico ('+comDados.length+'). Essa tela vai ficar mais reveladora conforme o ano for passando — os meses futuros aparecem apagados de propósito.</div>'
      : '');
}

function abrirDRE(){
  if(!podeFazer('relatorios')){ bloqueado('relatorios'); return; }
  const hoje=new Date();
  const D=montarDRE(hoje.getFullYear(),hoje.getMonth()+1);
  const antMes=hoje.getMonth()===0?12:hoje.getMonth(), antAno=hoje.getMonth()===0?hoje.getFullYear()-1:hoje.getFullYear();
  const Dant=montarDRE(antAno,antMes);
  const vFat=variacao(D.faturamento,Dant.faturamento);
  const vRes=variacao(D.resultadoAntesRetiradas,Dant.resultadoAntesRetiradas);
  const positivo=D.resultadoAntesRetiradas>=0;

  abrirFolha('DRE do mês',
    '<div class="dica" style="margin-top:0">Demonstrativo simplificado: o caminho do faturamento até o que sobra de verdade.</div>'+

    '<section class="cmpHero">'+
      '<div class="cmpHeroRot">Resultado do mês (antes de retiradas)</div>'+
      '<div class="cmpHeroVal" style="color:'+(positivo?'#fff':'#FFD9D5')+'">'+brl(D.resultadoAntesRetiradas)+'</div>'+
      '<div class="cmpHeroSub">'+(D.margemLiquida!=null?D.margemLiquida.toFixed(1)+'% do faturamento':'—')+
        ' <span class="cmpBadge" style="background:'+(vRes.pct>=0?'#1E7A55':'#8E1A15')+'">'+vRes.txt+' vs mês passado</span></div>'+
    '</section>'+

    '<div class="dreBloco">'+
      linhaDRE('Faturamento (vendas)', D.faturamento, 'var(--emerald)', true)+
      linhaDRE('(–) Mercadoria / Distribuidor', -D.mercadoria, 'var(--rose)')+
      linhaDRE('(=) Lucro bruto', D.lucroBruto, null, true, D.margemBruta)+
    '</div>'+

    '<h2 class="sec" style="margin-top:12px">Despesas operacionais</h2>'+
    '<div class="dreBloco">'+
      (D.detalheOp.length?D.detalheOp.map(function(g){ return linhaDRE(g.grupo,-g.valor,'var(--rose)',false,null,true); }).join(''):'<div class="vazio">Nenhuma despesa categorizada este mês.</div>')+
      linhaDRE('(=) Despesas operacionais', -D.despesasOp, 'var(--rose)', true)+
    '</div>'+

    '<div class="dreBloco" style="margin-top:8px">'+
      linhaDRE('(=) Resultado antes de retiradas', D.resultadoAntesRetiradas, null, true, D.margemLiquida)+
      linhaDRE('(–) Retiradas do mês', -D.retiradas, '#8A5A00')+
      linhaDRE('(=) Saldo final do mês', D.saldoFinal, (D.saldoFinal>=0?'var(--emerald)':'var(--rose)'), true)+
    '</div>'+

    '<div class="dica" style="margin-top:10px">Comparado ao mês passado: faturamento '+vFat.txt+', resultado '+vRes.txt+'.</div>'+

    '<button class="primario" id="iaBtn" style="margin-top:16px" onclick="gerarResumoIA()">Gerar resumo do mês por IA</button>'+
    '<div id="iaResultado"></div>'
  );
}


function abrirMetaLucro(){
  if(!podeFazer('relatorios')){ bloqueado('relatorios'); return; }
  const sit=situacaoRetirada(metaLucroPct);
  const dentro = sit.restante>=0;
  const cor = dentro?'var(--emerald)':'var(--rose)';

  // O valor só fecha de verdade no último dia do mês (é quando a retirada
  // acontece de fato). Nos outros dias, é uma prévia que vai se ajustando
  // conforme entram vendas e saem contas.
  const hoje=new Date();
  const ultimoDia=diasNoMes(hoje.getFullYear(),hoje.getMonth()+1);
  const ehUltimoDia = hoje.getDate()===ultimoDia;
  const diasQueFaltam = ultimoDia-hoje.getDate();
  const avisoMomento = ehUltimoDia
    ? '<div class="totalAberto" style="background:var(--amberSoft);border-color:var(--pineSoft)"><span>Hoje é o último dia do mês</span><strong style="color:var(--pine)">Valor final para retirada</strong></div>'
    : '<div class="dica" style="margin-top:0;color:var(--muted)">Prévia de hoje — atualiza sozinha. O valor que vale de verdade é o do último dia do mês ('+diasQueFaltam+' dia'+(diasQueFaltam===1?'':'s')+' faltando).</div>';

  abrirFolha('Meta de retirada',
    '<div class="dica" style="margin-top:0">Meta: retirar até '+metaLucroPct+'% do saldo disponível (o que sobrou de antes + o que entrou este mês, já descontando o que ainda falta pagar).</div>'+
    avisoMomento+

    '<section class="cmpHero">'+
      '<div class="cmpHeroRot">Você já retirou este mês</div>'+
      '<div class="cmpHeroVal">'+brl(sit.jaRetirado)+'</div>'+
      '<div class="cmpHeroSub">Meta do mês: '+brl(sit.retiradaAlvo)+' ('+metaLucroPct+'% do saldo disponível) '+
        '<span class="cmpBadge" style="background:'+(dentro?'#1E7A55':'#8E1A15')+'">'+(dentro?'dentro da meta':'passou da meta')+'</span>'+
      '</div>'+
    '</section>'+

    '<div class="cmpCard" style="margin-top:9px"><div class="cmpCardTopo"><span>Saldo acumulado (desde o início)</span></div>'+
      '<div class="cmpCardVal">'+brl(sit.saldoAcumulado)+'</div></div>'+
    '<div class="cmpCard" style="margin-top:8px"><div class="cmpCardTopo"><span>Ainda falta pagar este mês</span></div>'+
      '<div class="cmpCardVal" style="color:var(--rose)">'+brl(sit.aindaVence)+'</div></div>'+
    '<div class="cmpCard" style="margin-top:8px"><div class="cmpCardTopo"><span>Saldo disponível (base da meta)</span></div>'+
      '<div class="cmpCardVal">'+brl(sit.saldoDisponivel)+'</div>'+
      '<div class="cmpMini">saldo acumulado menos o que ainda falta pagar este mês</div></div>'+
    '<div class="cmpCard" style="margin-top:8px"><div class="cmpCardTopo"><span>'+(dentro?'Ainda cabe retirar':'Passou da meta em')+'</span><strong style="color:'+cor+'">'+brl(Math.abs(sit.restante))+'</strong></div>'+
      '<div class="cmpMini">considera Retirada, Sangria, Pró-labore e Retirada de sócio já lançados este mês</div></div>'+

    (souAdmin ? '<div class="dica" style="margin-top:12px">Para mudar a meta de '+metaLucroPct+'%, vá em Menu → Administração.</div>' : '')
  );
}

// ============================================================
//  SAÍDAS POR CATEGORIA, MÊS A MÊS (o que faltava: não é só hoje x mês
//  passado, é a categoria específica andando ao longo de vários meses)
// ============================================================
function categoriaPorMeses(categoria,qtdMeses){
  const meses=seriesMeses(qtdMeses);
  return meses.map(function(m){
    const iv=limitesMes(m.ano,m.mes);
    const valor=porCategoria('SAIDA',iv[0],iv[1]).filter(function(c){ return c.cat===categoria; })[0];
    return {rot:m.rot, valor:valor?valor.total:0, atual:m.atual};
  });
}
function abrirSaidasCategoriasMeses(){
  const meses=seriesMeses(6);
  const totais={};
  meses.forEach(function(m){
    const iv=limitesMes(m.ano,m.mes);
    porCategoria('SAIDA',iv[0],iv[1]).forEach(function(c){ totais[c.cat]=(totais[c.cat]||0)+c.total; });
  });
  const cats=Object.keys(totais).sort(function(a,b){ return totais[b]-totais[a]; }).slice(0,10);

  const linhas = cats.length ? cats.map(function(c){
    const serie=categoriaPorMeses(c,6);
    const atualV=serie[serie.length-1].valor, antV=serie[serie.length-2]?serie[serie.length-2].valor:0;
    const v=variacao(atualV,antV);
    const cor = v.pct===undefined ? 'var(--muted)' : (v.pct>0?'var(--rose)':'var(--emerald)');
    return '<div class="item" style="cursor:pointer" onclick="verCategoriaMeses(\''+encodeURIComponent(c)+'\')">'+
      '<div style="flex:1"><div style="font-size:14px;font-weight:500">'+c+'</div>'+
      '<div style="font-size:11.5px;color:var(--muted)">total nos 6 meses: '+brl(totais[c])+'</div></div>'+
      '<div style="text-align:right"><div class="val2">'+brl(atualV)+'</div>'+
      '<div style="font-size:11px;color:'+cor+';margin-top:2px">'+v.txt+' vs mês passado</div></div></div>';
  }).join('') : '<div class="vazio">Sem saídas categorizadas nos últimos meses.</div>';

  abrirFolha('Saídas por categoria — 6 meses',
    '<div class="dica" style="margin-top:0">Toque numa categoria pra ver ela mês a mês.</div>'+linhas);
}
function verCategoriaMeses(catEnc){
  const cat=decodeURIComponent(catEnc);
  const serie=categoriaPorMeses(cat,6);
  const max=serie.reduce(function(m,x){ return Math.max(m,x.valor); },0);
  const total=serie.reduce(function(s,x){ return s+x.valor; },0);
  const comDados=serie.filter(function(x){ return x.valor>0; });
  const media=comDados.length?total/comDados.length:0;

  const barras=serie.map(function(m){
    const h=max?Math.round(m.valor/max*100):0;
    return '<div class="evCol'+(m.atual?' evAtual':'')+'">'+
      '<div class="evBarras"><div class="evB" style="height:'+h+'%;background:var(--rose)" title="'+brl(m.valor)+'"></div></div>'+
      '<div class="evRot">'+m.rot+'</div></div>';
  }).join('');

  const tabela=serie.slice().reverse().map(function(m){
    return '<div class="evLinha"><span class="evMes">'+m.rot+'</span><strong class="evVal" style="color:var(--rose)">'+brl(m.valor)+'</strong></div>';
  }).join('');

  fecharFolha();
  abrirFolha(cat,
    '<div class="cmpCard"><div class="cmpCardTopo"><span>Média por mês (com movimento)</span></div>'+
      '<div class="cmpCardVal" style="color:var(--rose)">'+brl(media)+'</div></div>'+
    '<h2 class="sec" style="margin-top:14px">Últimos 6 meses</h2>'+
    '<div class="evGrafico">'+barras+'</div>'+
    tabela+
    '<button class="btnS" style="width:100%;margin-top:12px" onclick="fecharFolha();abrirSaidasCategoriasMeses()">‹ Voltar pra todas as categorias</button>');
}

function abrirEvolucao(){
  const meses=seriesMeses(6);
  const comDados=meses.filter(function(m){ return m.ent>0||m.sai>0; });
  const maxV=meses.reduce(function(m,x){ return Math.max(m,x.vendas,x.sai); },0);

  // indicadores
  const mediaVendas = comDados.length?comDados.reduce(function(s,x){ return s+x.vendas; },0)/comDados.length:0;
  const mediaSaidas = comDados.length?comDados.reduce(function(s,x){ return s+x.sai; },0)/comDados.length:0;
  const melhor = comDados.slice().sort(function(a,b){ return b.vendas-a.vendas; })[0];
  const atual = meses[meses.length-1];
  const anterior = meses[meses.length-2];
  const vV = anterior?variacao(atual.vendas,anterior.vendas):{txt:'—',cor:'var(--muted)'};

  // margem: quanto sobra de cada real vendido
  const margem = atual.vendas>0 ? ((atual.vendas-atual.sai)/atual.vendas*100) : null;

  const barras = meses.map(function(m){
    const hV=maxV?Math.round(m.vendas/maxV*100):0;
    const hS=maxV?Math.round(m.sai/maxV*100):0;
    return '<div class="evCol'+(m.atual?' evAtual':'')+'">'+
      '<div class="evBarras">'+
        '<div class="evB evBv" style="height:'+hV+'%" title="Vendas"></div>'+
        '<div class="evB evBs" style="height:'+hS+'%" title="Saídas"></div>'+
      '</div>'+
      '<div class="evRot">'+m.rot+'</div></div>';
  }).join('');

  const tabela = meses.map(function(m){
    const pos=m.saldo>=0;
    return '<div class="evLinha"><span class="evMes">'+m.rot+'</span>'+
      '<span class="evVal" style="color:var(--emerald)">'+brl(m.vendas)+'</span>'+
      '<span class="evVal" style="color:var(--rose)">'+brl(m.sai)+'</span>'+
      '<strong class="evVal" style="color:'+(pos?'var(--emerald)':'var(--rose)')+'">'+brl(m.saldo)+'</strong></div>';
  }).join('');

  abrirFolha('Evolução da farmácia',
    '<section class="cmpHero">'+
      '<div class="cmpHeroRot">Saldo de '+atual.rot+'</div>'+
      '<div class="cmpHeroVal">'+brl(atual.saldo)+'</div>'+
      '<div class="cmpHeroSub">Vendas '+brl(atual.vendas)+
        ' <span class="cmpBadge" style="background:'+(vV.pct>=0?'#1E7A55':'#8E1A15')+'">'+vV.txt+'</span></div>'+
    '</section>'+

    cartaoSaldoAcumulado(atual)+

    blocoProjecao()+
    '<h2 class="sec">Últimos 6 meses</h2>'+
    '<div class="evGrafico">'+barras+'</div>'+
    '<div class="evLegenda"><span><i class="evPonto evBv"></i>Vendas</span><span><i class="evPonto evBs"></i>Saídas</span></div>'+

    '<div class="evLinha evCab"><span class="evMes">Mês</span><span class="evVal">Vendas</span><span class="evVal">Saídas</span><span class="evVal">Saldo</span></div>'+
    tabela+
    '<button class="btnS" style="width:100%;margin-top:10px" onclick="fecharFolha();abrirSaidasCategoriasMeses()">Ver saídas por categoria, mês a mês</button>'+

    '<h2 class="sec" style="margin-top:14px">Indicadores</h2>'+
    '<div class="cmpCard"><div class="cmpCardTopo"><span>Média de vendas por mês</span></div>'+
      '<div class="cmpCardVal">'+brl(mediaVendas)+'</div>'+
      '<div class="cmpMini">considerando '+comDados.length+' mês(es) com movimento</div></div>'+
    '<div class="cmpCard" style="margin-top:8px"><div class="cmpCardTopo"><span>Média de gastos por mês</span></div>'+
      '<div class="cmpCardVal">'+brl(mediaSaidas)+'</div></div>'+
    (melhor?'<div class="cmpCard" style="margin-top:8px"><div class="cmpCardTopo"><span>Melhor mês de vendas</span></div>'+
      '<div class="cmpCardVal">'+melhor.rot+'</div><div class="cmpMini">'+brl(melhor.vendas)+'</div></div>':'')+
    (margem!==null?'<div class="cmpCard" style="margin-top:8px"><div class="cmpCardTopo"><span>Sobra sobre as vendas ('+atual.rot+')</span>'+
      '<strong style="color:'+(margem>=0?'var(--emerald)':'var(--rose)')+'">'+margem.toFixed(0)+'%</strong></div>'+
      '<div class="cmpMini">de cada R$ 100 vendidos, sobram '+brl(margem).replace('R$','')+' depois das saídas</div></div>':'')+

    (comDados.length<2
      ? '<div class="dica">Com mais meses de uso, este acompanhamento fica mais completo — dá para ver tendência e projetar metas.</div>'
      : '<div class="dica">Barra verde = vendas, barra vermelha = saídas. O mês atual fica destacado.</div>'));
}
// ============================================================
//  SUGESTÃO DE CATEGORIA
// ============================================================
// Palavras que aparecem na descrição e indicam a categoria provável.
const PISTAS=[
  ['Distribuidor',       ['distribuidora','distribuidor','panpharma','cimed','medcentro','nazario','nazário','casmed','nds','dsc','dcs','andrade','fribel','martins','pharma','medicamento','laboratorio','laboratório']],
  ['Compra à vista',     ['a vista','à vista','avista','compra direta']],
  ['Energia elétrica',   ['energia','equatorial','celpa','luz','eletrica','elétrica']],
  ['Água',               ['agua','água','saneamento','cosanpa']],
  ['Internet e telefone',['internet','telefone','celular','fibra','vivo','claro','tim','oi ','wifi']],
  ['Aluguel',            ['aluguel','locacao','locação','imovel','imóvel']],
  ['Condomínio / IPTU',  ['condominio','condomínio','iptu']],
  ['Encargos e FGTS',    ['fgts','inss','encargo','rescisao','rescisão']],
  ['Comissão',           ['comissao','comissão']],
  ['Pró-labore',         ['pro-labore','pró-labore','prolabore','retirada socio','retirada sócio']],
  ['Salário',            ['salario','salário','folha','pagamento funcionario','funcionário','farmaceutico','farmacêutico','atendente','balconista']],
  ['Vale / Benefício',   ['vale ','vale-','beneficio','benefício','cesta']],
  ['Contador',           ['contador','contabil','contábil','contabilidade','honorario','honorário']],
  ['Sistema ERP',        ['erp','sistema','lc sistemas','mensalidade sistema','software','licenca','licença']],
  ['Taxas bancárias',    ['tarifa','taxa banco','banco','manutencao conta','manutenção conta','ted','doc ']],
  ['Taxa de cartão',     ['cartao','cartão','maquininha','cielo','rede','stone','getnet','pagseguro']],
  ['Frete',              ['frete','entrega','transporte','motoboy','correio']],
  ['Combustível',        ['combustivel','combustível','gasolina','etanol','alcool','álcool','diesel','posto']],
  ['Manutenção',         ['manutencao','manutenção','conserto','reparo','eletricista','encanador','ar condicionado']],
  ['Limpeza',            ['limpeza','faxina','higiene','material limpeza']],
  ['Embalagem',          ['embalagem','sacola','saco','etiqueta','bobina']],
  ['Marketing',          ['marketing','propaganda','anuncio','anúncio','publicidade','panfleto','impulsionamento']],
  ['Simples Nacional',   ['simples','das ','imposto','tributo','darf','icms','iss']],
  ['Alvará e licenças',  ['alvara','alvará','licenca','licença','vigilancia','vigilância','crf','anvisa']],
  ['Material de escritório',['escritorio','escritório','papelaria','toner','papel']],
  ['Retirada de sócio',  ['retirada','saque socio','saque sócio']],
  ['Sangria',            ['sangria']]
];
function semAcento(t){
  return String(t||'').toLowerCase()
    .replace(/[áàâã]/g,'a').replace(/[éê]/g,'e').replace(/í/g,'i')
    .replace(/[óôõ]/g,'o').replace(/ú/g,'u').replace(/ç/g,'c');
}
// Devolve a categoria provável para uma descrição, ou null
function sugerirCategoria(descricao,tipo){
  const t=semAcento(descricao);
  if(t.length<3) return null;
  const disponiveis=(CATS[tipo]||[]).concat(CATS.SAIDA||[]);
  for(let i=0;i<PISTAS.length;i++){
    const cat=PISTAS[i][0], palavras=PISTAS[i][1];
    for(let j=0;j<palavras.length;j++){
      if(t.indexOf(semAcento(palavras[j]))>=0){
        if(disponiveis.indexOf(cat)>=0) return cat;
      }
    }
  }
  // se já houve lançamento com descrição parecida, repete a categoria dele
  const parecido=movimentos.filter(function(m){
    return m.categoria && m.desc && semAcento(m.desc).indexOf(t)>=0;
  })[0];
  return parecido?parecido.categoria:null;
}
// Mostra o aviso "sugerido: X" e marca o chip correspondente
function aplicarSugestao(idDesc,idChips,tipo,callbackEscolha){
  const campo=document.getElementById(idDesc); if(!campo) return;
  const cat=sugerirCategoria(campo.value,tipo);
  const aviso=document.getElementById(idChips+'Sug');
  if(!aviso) return;
  if(!cat){ aviso.innerHTML=''; return; }
  aviso.innerHTML='Sugestão: <button class="chipSug" onclick="'+callbackEscolha+'(\''+escapeAttrJs(cat)+'\')">'+escapeHtml(cat)+'</button>';
}
// Ordena as categorias colocando as mais usadas primeiro
function categoriasOrdenadas(tipo){
  const uso={};
  movimentos.forEach(function(m){ if(m.categoria) uso[m.categoria]=(uso[m.categoria]||0)+1; });
  contas.forEach(function(c){ if(c.categoria) uso[c.categoria]=(uso[c.categoria]||0)+1; });
  return (CATS[tipo]||[]).slice().sort(function(a,b){ return (uso[b]||0)-(uso[a]||0); });
}
