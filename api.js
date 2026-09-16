// ============================================================
//  CONEXÃO COM O BANCO (Supabase)
// ============================================================
const SUPABASE_URL = "https://cseypzniovlxvujapxgv.supabase.co";
const SUPABASE_KEY = "sb_publishable_4yig9S3CCenfU7ff7HNtbQ_MztE4zfy";

// Sem isso, uma conexão que trava no meio do caminho (rede instável, ou o
// próprio servidor engasgando) deixava o app esperando pra sempre — foi a
// causa da "tela vermelha travada". Toda chamada de rede do app passa por
// aqui agora, com um prazo máximo de espera.
async function fetchComLimite(url, opcoes, ms){
  const controlador=new AbortController();
  const limite=setTimeout(function(){ controlador.abort(); }, ms||20000);
  try{
    return await fetch(url, Object.assign({}, opcoes||{}, {signal:controlador.signal}));
  }catch(e){
    if(e.name==='AbortError') throw new Error('A conexão demorou demais e foi cancelada. Verifique a internet e tente de novo.');
    throw new Error('Sem conexão com o servidor. Verifique a internet.');
  }finally{
    clearTimeout(limite);
  }
}

const Sessao = {
  ler(){ try{ return JSON.parse(localStorage.getItem('sessao')) }catch{ return null } },
  gravar(s){ try{ localStorage.setItem('sessao', JSON.stringify(s)) }catch{} },
  limpar(){ try{ localStorage.removeItem('sessao') }catch{} },
};

async function entrar(email, senha){
  const r = await fetchComLimite(SUPABASE_URL+'/auth/v1/token?grant_type=password',{
    method:'POST',
    headers:{'apikey':SUPABASE_KEY,'Content-Type':'application/json'},
    body:JSON.stringify({email:email,password:senha})
  });
  const d = await r.json();
  if(!r.ok) throw new Error(d.error_description || d.msg || 'E-mail ou senha inválidos');
  Sessao.gravar({token:d.access_token, refresh:d.refresh_token, email:(d.user&&d.user.email)||email});
  return d;
}

async function renovarSessao(){
  const s = Sessao.ler(); if(!s || !s.refresh) return false;
  const r = await fetchComLimite(SUPABASE_URL+'/auth/v1/token?grant_type=refresh_token',{
    method:'POST',
    headers:{'apikey':SUPABASE_KEY,'Content-Type':'application/json'},
    body:JSON.stringify({refresh_token:s.refresh})
  });
  if(!r.ok) return false;
  const d = await r.json();
  Sessao.gravar({token:d.access_token, refresh:d.refresh_token, email:(d.user&&d.user.email)||s.email});
  return true;
}

// Chamada à API de dados. Renova a sessão sozinha se o acesso expirar.
async function api(caminho, opcoes, jaRenovou){
  opcoes = opcoes || {};
  const s = Sessao.ler();
  const cab = {
    'apikey':SUPABASE_KEY,
    'Authorization':'Bearer '+((s&&s.token)||SUPABASE_KEY),
    'Content-Type':'application/json',
    'Prefer':'return=representation'
  };
  const r = await fetchComLimite(SUPABASE_URL+'/rest/v1/'+caminho, {
    method:opcoes.method||'GET',
    headers:cab,
    body:opcoes.body
  });
  if(r.status===401 && !jaRenovou){
    if(await renovarSessao()) return api(caminho, opcoes, true);
    Sessao.limpar(); mostrarLogin('Sessão expirada. Entre novamente.');
    throw new Error('Sessão expirada');
  }
  if(!r.ok){
    const t = await r.text();
    throw new Error('Erro ao salvar: '+t.slice(0,140));
  }
  if(r.status===204) return null;
  const txt = await r.text();
  return txt ? JSON.parse(txt) : null;
}

// ============================================================
//  DADOS
// ============================================================
let movimentos=[], produtos=[], contas=[];
let offline=false;

function guardarCopia(){
  try{ localStorage.setItem('copia', JSON.stringify({movimentos:movimentos,produtos:produtos,contas:contas})) }catch(e){}
}
function carregarCopia(){
  try{
    const c=JSON.parse(localStorage.getItem('copia'));
    if(c){ movimentos=c.movimentos||[]; produtos=c.produtos||[]; contas=c.contas||[]; return true; }
  }catch(e){}
  return false;
}

async function carregarTudo(){
  try{
    const res = await Promise.all([
      api('movimentos?select=*&order=data_hora.desc'),
      api('produtos?select=*&order=descricao.asc'),
      api('contas?select=*&order=vencimento.asc'),
      api('categorias?select=*&order=nome.asc')
    ]);
    movimentos = (res[0]||[]).map(function(x){ return {id:x.id, ts:new Date(x.data_hora).getTime(), tipo:x.tipo, categoria:x.categoria, valor:Number(x.valor), desc:x.descricao, contaId:x.conta_id||null, origem:x.origem_pagamento||null, valorDinheiro:x.valor_dinheiro!=null?Number(x.valor_dinheiro):null, valorEletronico:x.valor_eletronico!=null?Number(x.valor_eletronico):null, criadoEm:x.criado_em?new Date(x.criado_em).getTime():null}; });
    produtos   = (res[1]||[]).map(function(x){ return {id:x.id, desc:x.descricao, codigo:x.codigo_barras||'', estoque:Number(x.estoque), minimo:Number(x.estoque_minimo), validade:x.validade}; });
    contas     = (res[2]||[]).map(function(x){ return {id:x.id, tipo:x.tipo, origem:x.origem||'MANUAL', categoria:x.categoria||'', desc:x.descricao, valor:Number(x.valor), valorPago:x.valor_pago!=null?Number(x.valor_pago):0, venc:x.vencimento, status:x.status, linha:x.linha_digitavel||'', documento:x.documento||'', dataBaixa:x.data_baixa||null}; });
    montarCategorias(res[3]);
    carregarBeneficiarios();
    await carregarPermissoes();
    await carregarOperadores();
    montarHistorico();
    offline=false; guardarCopia();
  }catch(e){
    if(String(e.message).indexOf('Sessão')>=0) throw e;
    if(carregarCopia()){ offline=true; }
    else throw e;
  }
}
