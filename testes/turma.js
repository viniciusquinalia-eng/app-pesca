// Teste de ponta a ponta: 5 pescadores, backend falso que imita as funções do banco (schema.sql).
const {chromium}=require('playwright');const http=require('http');const fs=require('fs');const path=require('path');
const ROOT=path.join(__dirname,'..');const PORT=8765;
const srv=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0].split('#')[0]);if(p.endsWith('/'))p+='index.html';const f=path.join(ROOT,p);
 if(p==='/config.js'){r.writeHead(200,{'content-type':'text/javascript'});return r.end("window.BORA_CONFIG={nome:'Turma da Pesca',supabaseUrl:'http://fake',supabaseAnonKey:'fake',codigo:true}")}
 if(p.startsWith('/vendor/')){r.writeHead(200,{'content-type':'text/javascript'});return r.end(fs.readFileSync(__dirname+'/fake-supabase.js'))}
 fs.readFile(f,(e,d)=>{if(e){r.writeHead(404);return r.end()}r.writeHead(200,{'content-type':f.endsWith('.html')?'text/html':f.endsWith('.json')?'application/json':f.endsWith('.svg')?'image/svg+xml':'text/javascript'});r.end(d)})});
// ---- banco falso (mesmas regras do schema.sql) ----
const DB={pesc:{},membros:new Set()};let n=0;const log=[];
const M=(pid,u)=>DB.membros.has(pid+'|'+u);
function rpc(u,name,a){a=a||{};if(!u)return {error:{message:'precisa entrar'}};
 if(name==='criar_pescaria'){const id='p'+(++n)+'-'+Math.random().toString(36).slice(2,8);const conv=Math.random().toString(36).slice(2,14);DB.pesc[id]={id,dono:u,convite:conv,dados:a.p_dados,versao:1,criado:Date.now()};DB.membros.add(id+'|'+u);return {data:[{id,convite:conv}]}}
 if(name==='salvar_pescaria'){if(!M(a.p_id,u))return {error:{message:'sem acesso'}};const p=DB.pesc[a.p_id];if(p.versao!==a.p_versao){log.push('conflito resolvido para '+u);return {data:-1}}p.versao++;p.dados=JSON.parse(JSON.stringify(a.p_dados));return {data:p.versao}}
 if(name==='entrar_pescaria'){const p=Object.values(DB.pesc).find(x=>x.convite===a.p_convite);if(!p)return {data:null};DB.membros.add(p.id+'|'+u);return {data:p.id}}
 if(name==='minhas_pescarias'){return {data:Object.values(DB.pesc).filter(p=>M(p.id,u)&&(!a.p_id||p.id===a.p_id)).map(p=>({id:p.id,dados:JSON.parse(JSON.stringify(p.dados)),versao:p.versao,convite:p.convite}))}}
 if(name==='apagar_pescaria'){return {data:null}}
 return {error:{message:'funcao desconhecida '+name}}}
// ---- conferência independente do acerto ----
function saldos(d){const b={};d.pessoas.forEach(x=>b[x.id]=0);d.gastos.forEach(g=>{b[g.pagou]+=g.valor;g.parts.forEach(id=>b[id]-=g.valor/g.parts.length)});return b}
function crc(s){let c=0xFFFF;for(let i=0;i<s.length;i++){c^=s.charCodeAt(i)<<8;for(let k=0;k<8;k++)c=c&0x8000?((c<<1)^0x1021)&0xFFFF:(c<<1)&0xFFFF}return c.toString(16).toUpperCase().padStart(4,'0')}
function pixOk(code){// TLV + CRC
 let i=0;const f={};while(i<code.length-8){const id=code.substr(i,2),len=+code.substr(i+2,2);f[id]=code.substr(i+4,len);i+=4+len}
 return {crc:code.slice(-4)===crc(code.slice(0,-4)),valor:f['54'],nome:f['59'],chave:(f['26']||'').slice(22)}}
const results=[];const ok=(c,m)=>{results.push((c?'PASSOU':'FALHOU')+' · '+m);if(!c)console.log('FALHOU',m)};
(async()=>{fs.mkdirSync(__dirname+'/saida',{recursive:true});await new Promise(r=>srv.listen(PORT,r));const B=await chromium.launch();
 const VIEW=[{w:390,h:844},{w:320,h:568,old:true},{w:375,h:667,old:true},{w:360,h:740},{w:414,h:896}];
 const NOMES=['Vinícius','Seu Antônio','Zé do Barco','Carlão','Dona Marta'];
 const P=[];const errs=[];
 for(let i=0;i<5;i++){const ctx=await B.newContext({viewport:{width:VIEW[i].w,height:VIEW[i].h},isMobile:true,hasTouch:true,deviceScaleFactor:1,locale:'pt-BR'});
  const email=['vini','antonio','ze','carlao','marta'][i]+'@teste.local';
  await ctx.exposeFunction('__rpc',(u,nm,a)=>rpc(u,nm,a));
  if(VIEW[i].old)await ctx.addInitScript(()=>{delete Array.prototype.at});
  await ctx.addInitScript(()=>{window.open=(u)=>{window.__aberto=u;return {}}});
  const pg=await ctx.newPage();pg.on('pageerror',e=>errs.push(NOMES[i]+': '+e.message));P.push({pg,email,nome:NOMES[i]})}
 const [org,...amigos]=P;const pg0=org.pg;
 const login=async(p)=>{await p.pg.fill('#em',p.email);await p.pg.click('[data-act=mandaCodigo]');await p.pg.fill('#cod','123456');await p.pg.click('[data-act=confereCodigo]');await p.pg.waitForTimeout(300)};
 const t=async(pg)=>(await pg.textContent('#app'));
 // 1. organizador entra e cria
 await pg0.goto(`http://localhost:${PORT}/`);await pg0.waitForTimeout(300);await login(org);
 ok((await t(pg0)).includes('Nenhuma pescaria'),'Organizador entra com código e vê a tela de pescarias');
 await pg0.click('[data-act=nova]');await pg0.fill('#nn','Tucunaré de janeiro');await pg0.fill('#nl','Barra Bonita');await pg0.fill('#nme','Vinícius');await pg0.click('[data-act=criar]');await pg0.waitForTimeout(300);
 const pid=Object.keys(DB.pesc)[0];ok(!!pid,'Pescaria criada e salva no banco');
 // chave pix
 await pg0.click('[data-act=pixkey]');await pg0.fill('#pk','vini.pix@teste.local');await pg0.fill('#pc','Bauru');await pg0.click('[data-act=savepix]');await pg0.waitForTimeout(200);
 // datas sugeridas
 for(const [a,b] of [['2027-01-15','2027-01-17'],['2027-01-22','2027-01-24']]){await pg0.click('[data-act=sub][data-v=datas]');await pg0.fill('#di',a);await pg0.fill('#df',b);await pg0.click('[data-act=adddata]');await pg0.waitForTimeout(150)}
 // convite pelo whatsapp
 await pg0.click('[data-act=sub][data-v=turma]');await pg0.click('[data-act=wa][data-v=convite]');const conviteTxt=await pg0.inputValue('#watxt');await pg0.click('[data-act=waopen]');
 const wa=await pg0.evaluate(()=>window.__aberto);ok(wa&&wa.startsWith('https://wa.me/?text='),'Botão do WhatsApp abre o WhatsApp com a mensagem pronta');
 const link=(conviteTxt.match(/https?:\/\/\S+#c=\S+/)||[])[0];ok(!!link,'Convite traz o link da pescaria');
 await pg0.keyboard.press('Escape');
 // 2. amigos entram pelo convite
 for(const a of amigos){await a.pg.goto(link);await a.pg.waitForTimeout(300);ok((await t(a.pg)).includes('Você foi convidado'),a.nome+': abre o convite e vê "Você foi convidado"');await login(a);
  const tx=await t(a.pg);ok(tx.includes('Quem é você')&&tx.includes('Tucunaré de janeiro'),a.nome+': cai direto na pescaria e escolhe o nome');
  await a.pg.fill('#nq',a.nome);await a.pg.click('[data-act=souNovo]');await a.pg.waitForTimeout(250)}
 // todos agora: votar datas e pegar itens, quase ao mesmo tempo
 const refresh=async(p)=>{await p.pg.evaluate(()=>window.dispatchEvent(new Event('focus')));await p.pg.waitForTimeout(250)};
 for(const p of P)await refresh(p);
 await Promise.all(P.map(async(p,i)=>{await p.pg.click('[data-act=sub][data-v=datas]');await p.pg.locator('[data-act=vote]').nth(i%2===0?0:1).click();await p.pg.waitForTimeout(100);if(i<3)await p.pg.locator('[data-act=vote]').nth(i%2===0?1:0).click()}));
 await Promise.all(P.map(p=>p.pg.waitForTimeout(600)));
 let d=DB.pesc[pid].dados;ok(d.pessoas.length===5,'Turma ficou com 5 pessoas (ninguém se perdeu): '+d.pessoas.map(x=>x.nome).join(', '));
 const votos=d.datas.map(o=>o.votos.length);ok(votos[0]+votos[1]===8,'Votos de todos foram guardados mesmo votando ao mesmo tempo ('+votos.join(' e ')+' votos)');
 // fechar data e itens
 await refresh(org);await pg0.click('[data-act=sub][data-v=datas]');await pg0.locator('[data-act=pick]').nth(0).click();await pg0.waitForTimeout(250);
 await Promise.all(amigos.map(async(a,i)=>{await refresh(a);await a.pg.click('[data-act=sub][data-v=levar]');await a.pg.fill('#ni',['Gelo extra','Carvão','Isca viva','Protetor solar'][i]);await a.pg.click('[data-act=addi]')}));
 await Promise.all(P.map(p=>p.pg.waitForTimeout(600)));d=DB.pesc[pid].dados;ok(d.itens.length===8,'Itens novos de 4 pessoas ao mesmo tempo, nenhum perdido ('+d.itens.length+' itens)');
 ok(d.inicio==='2027-01-15','Data fechada pelo organizador');
 // pix dos amigos (2 deles cadastram)
 for(const [i,k] of [[1,'antonio.pix@teste.local'],[2,'11999998888']]){const a=P[i];await refresh(a);await a.pg.click('[data-act=sub][data-v=turma]');const me=await a.pg.evaluate(pid=>JSON.parse(localStorage.getItem('bp_me_'+pid)),pid);await a.pg.click(`[data-act=pixkey][data-v="${me}"]`);await a.pg.fill('#pk',k);await a.pg.fill('#pc','Bauru');await a.pg.click('[data-act=savepix]');await a.pg.waitForTimeout(300)}
 // 3. gastos com divisões diferentes
 const G=[[0,'Rancho 2 diárias',1200,null],[1,'Combustível',387.5,null],[2,'Mercado',643.21,[0,2,3,4]],[3,'Cerveja',210,[1,3,4]],[4,'Isca viva',99.99,[0,1]],[0,'Gelo',45.3,null]];
 for(const [who,desc,val,parts] of G){const a=P[who];await refresh(a);await a.pg.click('[data-act=sub][data-v=contas]');await a.pg.fill('#gd',desc);await a.pg.fill('#gv',String(val).replace('.',','));
  if(parts){d=DB.pesc[pid].dados;const ids=d.pessoas.map(x=>x.id);for(const cb of await a.pg.$$('.gpart')){const v=await cb.getAttribute('value');const want=parts.map(k=>ids[k]).includes(v);if((await cb.isChecked())!==want)await cb.click()}}
  await a.pg.click('[data-act=addg]');await a.pg.waitForTimeout(300)}
 await Promise.all(P.map(p=>p.pg.waitForTimeout(500)));d=DB.pesc[pid].dados;
 ok(d.gastos.length===6,'6 gastos lançados por 5 pessoas diferentes'+(d.gastos.length===6?'':' (veio '+d.gastos.map(g=>g.desc).join(',')+')'));
 // "Combustível" com vírgula
 const comb=d.gastos.find(g=>g.desc==='Combustível');ok(comb&&comb.valor===387.5,'Valor com vírgula (387,50) entendido certo');
 // acerto
 await refresh(org);await pg0.click('[data-act=sub][data-v=contas]');
 const linhas=await pg0.$$eval('[data-act=pixgo],[data-act=pago]',els=>els.filter(e=>e.dataset.act==='pago').map(e=>e.dataset.v));
 const b=saldos(d);const tot=d.gastos.reduce((s,g)=>s+g.valor,0);
 // pega o acerto calculado pelo app
 const st=await pg0.evaluate(()=>{return [...document.querySelectorAll('[data-act=pixgo]')].map(e=>({k:e.dataset.v,v:+e.dataset.n}))});
 const bb={...b};st.forEach(s=>{const [de,para]=s.k.split('>');bb[de]+=s.v;bb[para]-=s.v});
 const resto=Math.max(...Object.values(bb).map(Math.abs));
 ok(resto<0.02,'Depois de todos pagarem os Pix, todo mundo fica zerado (sobra no máximo '+resto.toFixed(3)+' de arredondamento)');
 const devedores=Object.values(b).filter(v=>v<-0.009).length,credores=Object.values(b).filter(v=>v>0.009).length;
 ok(st.length<=devedores+credores-1,'Número de Pix ('+st.length+') é o mínimo prático (no máximo '+(devedores+credores-1)+')');
 ok(Math.abs(Object.values(b).reduce((s,v)=>s+v,0))<1e-6,'Soma dos saldos dá zero (total gasto R$ '+tot.toFixed(2)+')');
 // conferir o que cada um vê como "você deve / tem a receber"
 for(const [i,p] of P.entries()){await refresh(p);await p.pg.click('[data-act=sub][data-v=contas]');const tx=await t(p.pg);const me=await p.pg.evaluate(pid=>JSON.parse(localStorage.getItem('bp_me_'+pid)),pid);const v=b[me];const brl='R$ '+Math.abs(Math.round(v*100)/100).toLocaleString('pt-BR',{minimumFractionDigits:2});
  ok(tx.includes(v>=0?'Você tem a receber':'Você deve')&&tx.includes(brl),p.nome+' vê "'+(v>=0?'tem a receber ':'deve ')+brl+'"')}
 // pix copia e cola
 for(const s of st){const [de,para]=s.k.split('>');const rec=d.pessoas.find(x=>x.id===para);await pg0.click(`[data-act=pixgo][data-v="${s.k}"]`);await pg0.waitForTimeout(150);
  if(rec.pix){const code=await pg0.inputValue('#pixcode');const r=pixOk(code);ok(r.crc&&Number(r.valor)===s.v&&r.chave===rec.pix,'Pix de '+d.pessoas.find(x=>x.id===de).nome+' para '+rec.nome+': código válido, valor R$ '+r.valor+' e chave certos')}
  else ok((await t(pg0)).length>0&&(await pg0.textContent('#modal')).includes('Falta a chave Pix'),'Pix para '+rec.nome+' (sem chave): app avisa que falta a chave');
  await pg0.keyboard.press('Escape')}
 // mensagem de acerto no WhatsApp
 await pg0.click('[data-act=wa][data-v=contas]');const acTxt=await pg0.inputValue('#watxt');ok(st.every(s=>acTxt.includes(s.v.toLocaleString('pt-BR',{minimumFractionDigits:2}))),'Mensagem de acerto pro WhatsApp tem todos os valores');await pg0.keyboard.press('Escape');
 // marcar pago
 const k0=st[0].k;await pg0.click(`[data-act=pago][data-v="${k0}"]`);await pg0.waitForTimeout(300);ok(DB.pesc[pid].dados.pagos[k0]===true,'Marcar como pago fica salvo');
 // 4. tela: rolagem lateral e tamanho das letras em cada celular
 for(const [i,p] of P.entries()){for(const sub of ['turma','datas','levar','roteiro','contas']){await p.pg.click(`[data-act=sub][data-v=${sub}]`);await p.pg.waitForTimeout(80);
   const r=await p.pg.evaluate(()=>{const over=document.documentElement.scrollWidth>window.innerWidth+1;const small=[];for(const el of document.querySelectorAll('#app *, #nav *')){if(!el.childNodes.length)continue;const own=[...el.childNodes].some(n=>n.nodeType===3&&n.textContent.trim());if(!own)continue;const r=el.getBoundingClientRect();if(!r.width)continue;const fs=parseFloat(getComputedStyle(el).fontSize);if(fs<15)small.push(fs+'px "'+el.textContent.trim().slice(0,30)+'"')}
    const btn=[...document.querySelectorAll('#app button,#nav a')].filter(b=>{const r=b.getBoundingClientRect();return r.width&&r.height<44}).map(b=>(b.getAttribute('aria-label')||b.textContent.trim()).slice(0,20)+' '+Math.round(b.getBoundingClientRect().height)+'px');return {over,w:window.innerWidth,small:[...new Set(small)],btn:[...new Set(btn)]}});
   if(r.over)ok(false,p.nome+' ('+r.w+'px) aba '+sub+': tela passa da largura do celular');
   if(r.small.length)results.push('LETRA PEQUENA · '+p.nome+' ('+r.w+'px) aba '+sub+': '+r.small.join(' | '));
   if(r.btn.length)results.push('BOTÃO BAIXO · '+p.nome+' ('+r.w+'px) aba '+sub+': '+r.btn.join(' | '))}
  await p.pg.screenshot({path:__dirname+'/saida/tela-'+i+'.png',fullPage:false})}
 ok(!errs.length,'Nenhum erro de programa em nenhum celular'+(errs.length?': '+errs.join(' / '):''));
 results.push('Conflitos resolvidos automaticamente: '+log.length);
 console.log(results.join('\n'));fs.writeFileSync(__dirname+'/saida/resultado.txt',results.join('\n'));
 fs.writeFileSync(__dirname+'/saida/saldos.json',JSON.stringify({saldos:Object.fromEntries(Object.entries(b).map(([k,v])=>[d.pessoas.find(x=>x.id===k).nome,Math.round(v*100)/100])),acerto:st.map(s=>{const [de,pa]=s.k.split('>');return d.pessoas.find(x=>x.id===de).nome+' -> '+d.pessoas.find(x=>x.id===pa).nome+' R$ '+s.v})},null,1));
 await B.close();srv.close()})().catch(e=>{console.error('ERRO NO TESTE',e);process.exit(1)});
