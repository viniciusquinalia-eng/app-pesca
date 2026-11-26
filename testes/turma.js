// Teste de ponta a ponta: 5 pescadores, backend falso que imita as funções do banco (schema.sql).
const {chromium}=require('playwright');const http=require('http');const fs=require('fs');const path=require('path');
const ROOT=path.join(__dirname,'..');const PORT=8765;
const srv=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0].split('#')[0]);if(p.endsWith('/'))p+='index.html';const f=path.join(ROOT,p);
 if(p==='/config.js'){r.writeHead(200,{'content-type':'text/javascript'});return r.end("window.BORA_CONFIG={nome:'Turma da Pesca',supabaseUrl:'http://fake',supabaseAnonKey:'fake',codigo:true}")}
 if(p.startsWith('/fake-foto/')){const d=FOTOS[p.slice(11)];if(!d){r.writeHead(404);return r.end()}r.writeHead(200,{'content-type':'image/jpeg'});return r.end(Buffer.from(d.split(',')[1],'base64'))}
 if(p.startsWith('/vendor/')){r.writeHead(200,{'content-type':'text/javascript'});return r.end(fs.readFileSync(__dirname+'/fake-supabase.js'))}
 fs.readFile(f,(e,d)=>{if(e){r.writeHead(404);return r.end()}r.writeHead(200,{'content-type':f.endsWith('.html')?'text/html':f.endsWith('.json')?'application/json':f.endsWith('.svg')?'image/svg+xml':'text/javascript'});r.end(d)})});
// ---- banco falso (mesmas regras do schema.sql) ----
const DB={pesc:{},membros:new Set(),ads:[],admins:new Set(['vini@teste.local']),diario:[],aval:[]};const FOTOS={};let n=0;const log=[];
const M=(pid,u)=>DB.membros.has(pid+'|'+u);
function rpc(u,name,a){a=a||{};if(!u)return {error:{message:'precisa entrar'}};
 if(name==='criar_pescaria'){const id='p'+(++n)+'-'+Math.random().toString(36).slice(2,8);const conv=Math.random().toString(36).slice(2,14);DB.pesc[id]={id,dono:u,convite:conv,dados:a.p_dados,versao:1,criado:Date.now()};DB.membros.add(id+'|'+u);return {data:[{id,convite:conv}]}}
 if(name==='salvar_pescaria'){if(!M(a.p_id,u))return {error:{message:'sem acesso'}};const p=DB.pesc[a.p_id];if(p.versao!==a.p_versao){log.push('conflito resolvido para '+u);return {data:-1}}p.versao++;p.dados=JSON.parse(JSON.stringify(a.p_dados));return {data:p.versao}}
 if(name==='entrar_pescaria'){const p=Object.values(DB.pesc).find(x=>x.convite===a.p_convite);if(!p)return {data:null};DB.membros.add(p.id+'|'+u);return {data:p.id}}
 if(name==='minhas_pescarias'){return {data:Object.values(DB.pesc).filter(p=>M(p.id,u)&&(!a.p_id||p.id===a.p_id)).map(p=>({id:p.id,dados:JSON.parse(JSON.stringify(p.dados)),versao:p.versao,convite:p.convite}))}}
 if(name==='apagar_pescaria'){return {data:null}}
 // anúncios (mesmas regras do supabase/003_anuncios.sql)
 const adm=DB.admins.has(u);const out=a=>({id:a.id,status:a.status,motivo:a.motivo,dados:JSON.parse(JSON.stringify(a.dados))});
 if(name==='sou_admin')return {data:adm};
 if(name==='enviar_anuncio'){if(a.p_id){const x=DB.ads.find(y=>y.id===a.p_id&&y.dono===u);if(!x)return {data:null};x.dados=a.p_dados;x.status='pendente';return {data:x.id}}const id='ad'+(DB.ads.length+1);DB.ads.push({id,dono:u,status:'pendente',dados:a.p_dados});return {data:id}}
 if(name==='meus_anuncios')return {data:DB.ads.filter(x=>x.dono===u).map(out)};
 if(name==='anuncios_publicos')return {data:DB.ads.filter(x=>x.status==='aprovado').map(x=>({id:x.id,dados:x.dados}))};
 if(name==='anuncios_para_aprovar'){if(!adm)return {error:{message:'sem acesso'}};return {data:DB.ads.filter(x=>x.status==='pendente').map(out)}}
 if(name==='moderar_anuncio'){if(!adm)return {error:{message:'sem acesso'}};const x=DB.ads.find(y=>y.id===a.p_id);if(x){x.status=a.p_status;x.motivo=a.p_motivo}return {data:null}}
 if(name==='apagar_anuncio'){DB.ads=DB.ads.filter(x=>!(x.id===a.p_id&&(x.dono===u||adm)));return {data:null}}
 // diário e avaliações (mesmas regras do supabase/004_diario_avaliacoes.sql)
 if(name==='salvar_diario'){const id='d'+(DB.diario.length+1);DB.diario.push({id,autor:u,autor_nome:a.p_nome,lugar:a.p_lugar||'',lugar_nome:a.p_lugar_nome||'',dados:a.p_dados,publico:a.p_publico!==false,criado:new Date().toISOString()});return {data:id}}
 if(name==='meu_diario')return {data:DB.diario.filter(x=>x.autor===u).reverse().map(x=>({id:x.id,lugar:x.lugar,lugar_nome:x.lugar_nome,dados:x.dados,publico:x.publico,criado:x.criado}))};
 if(name==='diario_do_lugar')return {data:DB.diario.filter(x=>x.lugar===a.p_lugar&&x.publico).reverse().map(x=>({id:x.id,autor_nome:x.autor_nome,dados:x.dados,criado:x.criado}))};
 if(name==='apagar_diario'){DB.diario=DB.diario.filter(x=>!(x.id===a.p_id&&(x.autor===u||adm)));return {data:null}}
 if(name==='avaliar'){const pode=Object.values(DB.pesc).some(p=>M(p.id,u)&&(p.dados.anuncios||[]).includes(a.p_lugar));if(!pode)return {error:{message:'so quem pescou'}};
  const x=DB.aval.find(y=>y.autor===u&&y.lugar===a.p_lugar);const v={autor:u,autor_nome:a.p_nome,lugar:a.p_lugar,nota:a.p_nota,notas:a.p_notas,comentario:a.p_comentario,criado:new Date().toISOString()};if(x)Object.assign(x,v);else DB.aval.push(Object.assign({id:'v'+(DB.aval.length+1)},v));return {data:null}}
 if(name==='avaliacoes_do_lugar')return {data:DB.aval.filter(x=>x.lugar===a.p_lugar).map(x=>({id:x.id,autor_nome:x.autor_nome,nota:x.nota,notas:x.notas,comentario:x.comentario,resposta:x.resposta||null,criado:x.criado,minha:x.autor===u}))};
 if(name==='responder_avaliacao'){const x=DB.aval.find(y=>y.id===a.p_id);if(x&&DB.ads.some(d=>'u_'+d.id===x.lugar&&d.dono===u))x.resposta=a.p_resposta;return {data:null}}
 if(name==='apagar_avaliacao'){DB.aval=DB.aval.filter(x=>!(x.id===a.p_id&&(x.autor===u||adm)));return {data:null}}
 if(name==='registrar_evento'){DB.ev=DB.ev||[];DB.ev.push({lugar:a.p_lugar,tipo:a.p_tipo,quem:u});return {data:null}}
 if(name==='ocultar_avaliacao'){if(!adm)return {error:{message:'sem acesso'}};const x=DB.aval.find(y=>y.id===a.p_id);if(x)x.oculto=a.p_oculto;return {data:null}}
 if(name==='ocultar_diario'){if(!adm)return {error:{message:'sem acesso'}};const x=DB.diario.find(y=>y.id===a.p_id);if(x)x.oculto=a.p_oculto;return {data:null}}
 if(name==='painel_admin'){if(!adm)return {error:{message:'sem acesso'}};const ev=DB.ev||[];const vis={};ev.filter(e=>e.tipo==='visita').forEach(e=>vis[e.lugar]=(vis[e.lugar]||0)+1);
  const users=new Set([...DB.membros].map(m=>m.split('|')[1]));return {data:{usuarios:users.size,novos7:users.size,novos30:users.size,ativos7:users.size,semanas:[1,0,2,1,0,3,2,5].map((n,i)=>({s:new Date(Date.now()-(7-i)*7*864e5).toISOString().slice(0,10),n})),
  pescarias:Object.keys(DB.pesc).length,pescarias30:Object.keys(DB.pesc).length,pescadores:users.size,dividido:Object.values(DB.pesc).reduce((s,p)=>s+(p.dados.gastos||[]).reduce((t,g)=>t+g.valor,0),0),
  anuncios:DB.ads.reduce((o,x)=>(o[x.status]=(o[x.status]||0)+1,o),{}),diario:DB.diario.length,fotos:DB.diario.filter(x=>x.dados.foto).length,avaliacoes:DB.aval.length,nota_media:DB.aval.length?DB.aval.reduce((s,x)=>s+x.nota,0)/DB.aval.length:null,
  visitas30:ev.filter(e=>e.tipo==='visita').length,whats30:ev.filter(e=>e.tipo==='whatsapp').length,mais_vistos:Object.entries(vis).map(([lugar,n])=>({lugar,n})).sort((x,y)=>y.n-x.n).slice(0,5),
  mais_bem_avaliados:DB.aval.map(x=>({lugar:x.lugar,m:x.nota,n:1})),ult_avaliacoes:DB.aval.map(x=>({id:x.id,lugar:x.lugar,autor_nome:x.autor_nome,nota:x.nota,comentario:x.comentario,oculto:!!x.oculto})),ult_diario:DB.diario.map(x=>({id:x.id,lugar:x.lugar,autor_nome:x.autor_nome,dados:x.dados,oculto:!!x.oculto}))}}}
 if(name==='painel_dono')return {data:DB.ads.filter(x=>x.dono===u).map(x=>({id:x.id,lugar:'u_'+x.id,nome:x.dados.nome,status:x.status,visitas30:(DB.ev||[]).filter(e=>e.lugar==='u_'+x.id&&e.tipo==='visita').length,whats30:(DB.ev||[]).filter(e=>e.lugar==='u_'+x.id&&e.tipo==='whatsapp').length,dias:Array(14).fill(0),nota:null,n_aval:0,n_diario:0}))};
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
  await ctx.exposeFunction('__upload',(path,d)=>{FOTOS[path]=d;return true});
  await ctx.route(/open-meteo\.com/,r=>{const u=r.request().url();if(u.includes('geocoding'))return r.fulfill({json:{results:[{name:'Barra Bonita',admin1:'São Paulo',latitude:-22.49,longitude:-48.55}]}});
   const q=new URL(u).searchParams;if(q.get('current'))return r.fulfill({json:{current:{temperature_2m:28.4,weather_code:1,wind_speed_10m:11}}});
   const ini=q.get('start_date'),fim=q.get('end_date');const time=[];for(let d=Date.parse(ini);d<=Date.parse(fim);d+=864e5)time.push(new Date(d).toISOString().slice(0,10));
   return r.fulfill({json:{daily:{time,weather_code:time.map((_,i)=>i?61:2),temperature_2m_max:time.map(()=>31),temperature_2m_min:time.map(()=>19),precipitation_probability_max:time.map((_,i)=>i?80:10),wind_speed_10m_max:time.map(()=>14)}}})});
  await ctx.route(/images\.unsplash\.com/,r=>r.abort());
  if(VIEW[i].old)await ctx.addInitScript(()=>{delete Array.prototype.at});
  await ctx.addInitScript(()=>{window.open=(u)=>{window.__aberto=u;return {}}});
  await ctx.addInitScript(()=>{if(!localStorage.getItem('teste_areas')){localStorage.setItem('teste_areas','1');localStorage.setItem('bp_onb_pescador','true');localStorage.setItem('bp_area_manual','1')}});
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
 // mudar um gasto já lançado (Gelo 45,30 -> 60,00)
 await refresh(org);await pg0.click('[data-act=sub][data-v=contas]');{const gid=DB.pesc[pid].dados.gastos.find(g=>g.desc==='Gelo').id;await pg0.click(`[data-act=edg][data-v="${gid}"]`);await pg0.fill('#egv','60,00');await pg0.click('[data-act=saveg]');await pg0.waitForTimeout(400);
  ok(DB.pesc[pid].dados.gastos.find(g=>g.id===gid).valor===60,'Mudar um gasto já lançado (Gelo de R$ 45,30 para R$ 60,00)')}
 // licença de pesca
 await pg0.click('[data-act=sub][data-v=turma]');ok((await t(pg0)).includes('a sua não está em dia'),'Aviso de licença aparece para quem não informou a sua');
 {const me=await pg0.evaluate(pid=>JSON.parse(localStorage.getItem('bp_me_'+pid)),pid);await pg0.click(`[data-act=lic][data-v="${me}"]`);await pg0.fill('#lv','2027-12-31');await pg0.click('[data-act=savelic]');await pg0.waitForTimeout(400);
  const tx=await t(pg0);ok(tx.includes('Licença em dia até 31/12/2027')&&tx.includes('4 pessoas ainda não informaram'),'Licença salva e o aviso passa a mostrar só quem falta')}
 d=DB.pesc[pid].dados;
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
 for(const [i,p] of P.entries()){await refresh(p);await p.pg.click('[data-act=sub][data-v=contas]');const tx=await t(p.pg);const me=await p.pg.evaluate(pid=>JSON.parse(localStorage.getItem('bp_me_'+pid)),pid);const v=b[me];const brl='R$ '+(Math.round(Math.abs(v)*100)/100).toLocaleString('pt-BR',{minimumFractionDigits:2});
  ok(tx.includes(v>=0?'Você vai receber':'Você precisa pagar')&&tx.includes(brl),p.nome+' vê "'+(v>=0?'vai receber ':'precisa pagar ')+brl+'"'+(tx.includes(brl)?'':' (tela: '+tx.slice(tx.indexOf('Você'),tx.indexOf('Você')+40)+')'))}
 // pix copia e cola
 for(const s of st){const [de,para]=s.k.split('>');const rec=d.pessoas.find(x=>x.id===para);await pg0.click(`[data-act=pixgo][data-v="${s.k}"]`);await pg0.waitForTimeout(150);
  if(rec.pix){const code=await pg0.inputValue('#pixcode');const r=pixOk(code);ok(r.crc&&Number(r.valor)===s.v&&r.chave===rec.pix,'Pix de '+d.pessoas.find(x=>x.id===de).nome+' para '+rec.nome+': código válido, valor R$ '+r.valor+' e chave certos')}
  else ok((await t(pg0)).length>0&&(await pg0.textContent('#modal')).includes('Falta a chave Pix'),'Pix para '+rec.nome+' (sem chave): app avisa que falta a chave');
  await pg0.keyboard.press('Escape')}
 // mensagem de acerto no WhatsApp
 await pg0.click('[data-act=wa][data-v=contas]');const acTxt=await pg0.inputValue('#watxt');ok(st.every(s=>acTxt.includes(s.v.toLocaleString('pt-BR',{minimumFractionDigits:2}))),'Mensagem de acerto pro WhatsApp tem todos os valores');await pg0.keyboard.press('Escape');
 // marcar pago
 const k0=st[0].k;await pg0.click(`[data-act=pago][data-v="${k0}"]`);await pg0.waitForTimeout(300);ok(DB.pesc[pid].dados.pagos[k0]===true,'Marcar como pago fica salvo');
 // 3b. Explorar (Fase 2): anúncios de exemplo, região e usar roteiro numa pescaria
 await pg0.goto(`http://localhost:${PORT}/#explorar`);await pg0.waitForTimeout(400);
 await pg0.screenshot({path:__dirname+'/saida/explorar.png',fullPage:true});{const tx=await t(pg0);ok(tx.includes('EXEMPLO')&&!/\-?\d{1,2}\.\d{4,}/.test(tx),'Explorar mostra anúncios marcados como EXEMPLO e nenhuma coordenada')}
 await pg0.click('[data-act=dest][data-v="Rio Paraná"]');await pg0.waitForTimeout(150);{const nomes=await pg0.$$eval('[data-act=ad]',els=>els.map(e=>e.textContent));ok(nomes.length>0&&nomes.every(n=>/Três Irmãos|Barranco|Zé Dourado|Dourado no Rio|Corredeira/.test(n)),'Filtro de região mostra só o Rio Paraná ('+nomes.length+' anúncios)')}
 await pg0.click('[data-act=limpafiltro]');await pg0.waitForTimeout(150);await pg0.click('[data-act=ad][data-v=r1]');await pg0.waitForTimeout(150);await pg0.click('[data-act=usead]');await pg0.waitForTimeout(150);
 await pg0.click(`[data-act=addad][data-v="${pid}"]`);await pg0.waitForTimeout(500);
 {const dd=DB.pesc[pid].dados;ok(dd.roteiro.length>=6&&dd.itens.some(i=>i.txt==='Isca artificial'),'Usar roteiro pronto numa pescaria existente: roteiro e lista do que levar entram')}
 ok((await t(pg0)).includes('cai na piracema'),'Pescaria em janeiro mostra o aviso de piracema')
 await pg0.click('[data-act=sub][data-v=turma]');
 // 3c. dono de rancho anuncia; só aparece depois de aprovado
 {const c=P[3].pg;await c.goto(`http://localhost:${PORT}/#explorar`);await c.waitForTimeout(400);await c.click('[data-act=anunciar]');
  await c.fill('#fa-nome','Rancho do Carlão');await c.fill('#fa-local','Barra Bonita, SP');await c.fill('#fa-preco','550');await c.fill('#fa-sub','Rancho inteiro, até 6 pessoas');await c.fill('#fa-feat','Píer, Freezer, Churrasqueira');await c.fill('#fa-peixes','Tucunaré e corvina');
  await c.fill('#fa-txt','Fica em -22.4912, -48.5583');await c.fill('#fa-wa','(14) 99876-5432');await c.setInputFiles('#fa-fotos',[__dirname+'/peixe-teste.jpg',__dirname+'/peixe-teste.jpg']);await c.waitForTimeout(900);ok((await c.$$('.fthumbs img')).length===2,'Dono escolhe 2 fotos e vê as miniaturas');await (await c.$('.fthumbs')).screenshot({path:__dirname+'/saida/form-fotos.png'});await c.check('#fa-ok');await c.click('[data-act=enviarad]');await c.waitForTimeout(300);
  ok(DB.ads.length===0,'Anúncio com coordenada no texto é barrado');
  await c.fill('#fa-txt','Casa com varanda para a represa.');await c.click('[data-act=enviarad]');await c.waitForTimeout(500);
  ok(DB.ads.length===1&&DB.ads[0].status==='pendente','Dono envia anúncio e ele fica esperando aprovação');
  ok((DB.ads[0].dados.fotos||[]).length===2&&DB.ads[0].dados.fotos.every(f=>f.startsWith(P[3].email+'/anuncio-')&&FOTOS[f]),'Fotos do anúncio enviadas para a pasta do dono');
  ok((await t(c)).includes('Esperando aprovação'),'Dono vê o status "Esperando aprovação" em Meus anúncios');
  const z=P[2].pg;await z.goto(`http://localhost:${PORT}/#explorar`);await z.waitForTimeout(500);ok(!(await t(z)).includes('Rancho do Carlão'),'Antes de aprovar, ninguém vê o anúncio');
  ok(!(await t(z)).includes('Aprovar anúncios'),'Quem não é administrador não vê a tela de aprovação');
  await pg0.goto(`http://localhost:${PORT}/#explorar`);await pg0.waitForTimeout(500);await pg0.click('[data-act=fila]');await pg0.waitForTimeout(300);ok((await t(pg0)).includes('Rancho do Carlão'),'Administrador vê o anúncio na fila');
  await pg0.click('[data-act=aprovar]');await pg0.waitForTimeout(400);ok(DB.ads[0].status==='aprovado','Administrador aprova');
  await z.reload();await z.waitForTimeout(600);ok((await t(z)).includes('Rancho do Carlão'),'Depois de aprovado, aparece no Explorar para todos');
  await z.click('[data-act=ad][data-v=u_ad1]');await z.waitForTimeout(200);const href=await z.getAttribute('#wa-ad','href');
  ok(href&&href.startsWith('https://wa.me/5514998765432?text='),'Botão do WhatsApp do anúncio real abre a conversa com o dono');
  ok(!(await z.textContent('.top')).includes('EXEMPLO'),'Anúncio real não leva a etiqueta EXEMPLO');
  for(const pp of [pg0,c,z]){await pp.goto(`http://localhost:${PORT}/#pescarias`);await pp.waitForTimeout(400);await pp.click(`[data-act=open][data-v="${pid}"]`);await pp.waitForTimeout(200)}}
 // 3d. perfil, histórico, clima, pontos, diário com foto e avaliação
 {const d0=new Date(Date.now()-40*864e5).toISOString().slice(0,10),d1=new Date(Date.now()-38*864e5).toISOString().slice(0,10),d3=new Date(Date.now()+3*864e5).toISOString().slice(0,10);
  await pg0.goto(`http://localhost:${PORT}/#perfil`);await pg0.waitForTimeout(700);{const tx=await t(pg0);ok(tx.includes('Assim fica o seu perfil')&&tx.includes('Pintado · 3,1 kg'),'Perfil sem histórico mostra o exemplo com fotos da turma');
   ok(await pg0.evaluate(()=>[...document.querySelectorAll('img.foto')].filter(i=>i.src.includes('/fotos/')).every(i=>i.naturalWidth>0)),'Fotos da turma carregam');await pg0.screenshot({path:__dirname+'/saida/perfil-exemplo.png',fullPage:true})}
  const mk=(id,dados)=>{DB.pesc[id]={id,dono:org.email,convite:'cv'+id,dados,versao:1,criado:Date.now()};DB.membros.add(id+'|'+org.email)};
  mk('pfeita',{id:'pfeita',nome:'Tucunaré de outubro',local:'Rancho Beira-Tietê · Barra Bonita, SP',inicio:d0,fim:d1,pessoas:[{id:'eu1',nome:'Vinícius'},{id:'ou1',nome:'Carlão'}],datas:[],itens:[],roteiro:[],gastos:[{id:'g1',desc:'Rancho',valor:600,pagou:'eu1',parts:['eu1','ou1']},{id:'g2',desc:'Gelo',valor:40,pagou:'ou1',parts:['eu1','ou1']}],pagos:{},anuncios:['a1']});
  mk('pprox',{id:'pprox',nome:'Corvina de fim de ano',local:'Barra Bonita',inicio:d3,fim:new Date(Date.now()+4*864e5).toISOString().slice(0,10),pessoas:[{id:'eu2',nome:'Vinícius'}],datas:[],itens:[],roteiro:[],gastos:[],pagos:{}});
  await pg0.evaluate(()=>{localStorage.setItem('bp_me_pfeita','"eu1"');localStorage.setItem('bp_me_pprox','"eu2"')});
  await pg0.goto(`http://localhost:${PORT}/#perfil`);await pg0.reload();await pg0.waitForTimeout(600);let tx=await t(pg0);
  ok(tx.includes('Seu perfil')&&tx.includes('3 dias')&&!tx.includes('dias de pesca'),'Perfil mostra o histórico, sem indicadores');
  ok(tx.includes('R$ 320,00')&&tx.includes('Tucunaré de outubro'),'Perfil mostra o histórico e a sua parte nos gastos (R$ 320)');
  await pg0.screenshot({path:__dirname+'/saida/perfil.png',fullPage:true});
  await pg0.goto(`http://localhost:${PORT}/#pescarias`);await pg0.waitForTimeout(300);await pg0.click('[data-act=open][data-v=pprox]');await pg0.waitForTimeout(600);tx=await t(pg0);
  ok(tx.includes('Previsão do tempo')&&tx.includes('Sol com nuvens')&&tx.includes('atenção no barco'),'Pescaria próxima mostra a previsão do tempo e avisa chuva forte');
  await pg0.screenshot({path:__dirname+'/saida/clima.png'});
  await pg0.click('[data-act=close]');await pg0.goto(`http://localhost:${PORT}/#explorar`);await pg0.waitForTimeout(400);await pg0.click('[data-act=ad][data-v=a1]');await pg0.waitForTimeout(600);tx=await t(pg0);
  ok((await pg0.$$('.gal .slide')).length===4&&(await pg0.textContent('.galn'))==='1 de 4','Anúncio de exemplo tem galeria com 4 fotos');
  await pg0.click('[data-act=gal][data-v="1"]');await pg0.waitForTimeout(700);ok((await pg0.textContent('.galn'))==='2 de 4','Seta passa para a próxima foto e a contagem acompanha');
  ok(tx.includes('Pontos de pesca')&&tx.includes('Galhadas no braço')&&tx.includes('Tempo agora em Barra Bonita'),'Anúncio mostra pontos de pesca (sem localização) e o tempo agora');
  // diário com foto que tem GPS no arquivo
  await pg0.goto(`http://localhost:${PORT}/#perfil`);await pg0.waitForTimeout(400);await pg0.click('[data-act=novodiario]');await pg0.waitForTimeout(200);
  await pg0.setInputFiles('#d-foto',__dirname+'/peixe-teste.jpg');await pg0.waitForTimeout(800);
  ok(await pg0.isVisible('.fotobox img'),'Foto escolhida aparece antes de salvar');
  await pg0.fill('#d-esp','Tucunaré');await pg0.fill('#d-peso','2,5');await pg0.fill('#d-isca','Hélice de superfície');await pg0.selectOption('#d-lugar','a1');
  ok(!(await pg0.isVisible('#d-ponto')),'Ponto de pesca vem escondido: só mostra se a pessoa quiser');
  await pg0.check('#d-tponto');await pg0.fill('#d-ponto','Galhada');await pg0.click('[data-act=salvadiario]');await pg0.waitForTimeout(800);
  ok(DB.diario.length===1&&DB.diario[0].lugar==='a1'&&DB.diario[0].dados.peso===2.5&&DB.diario[0].dados.ponto==='Galhada','Registro do diário salvo com espécie, peso, isca, ponto e lugar');
  const fk=Object.keys(FOTOS).find(k=>k.startsWith(org.email+'/'));const bin=fk?Buffer.from(FOTOS[fk].split(',')[1],'base64'):Buffer.alloc(0);
  ok(fk&&fk.startsWith(org.email+'/')&&bin.length<350000,'Foto enviada reduzida ('+Math.round(bin.length/1024)+' KB) na pasta do próprio usuário');
  ok(bin.length&&!bin.includes('CameraTeste')&&!bin.includes(Buffer.from('Exif')),'Foto enviada sem os dados escondidos do celular (localização)');
  tx=await t(pg0);ok(tx.includes('Tucunaré · 2,5 kg')&&tx.includes('1 peixe registrado'),'Registro aparece no diário do perfil');
  await pg0.screenshot({path:__dirname+'/saida/diario.png',fullPage:true});
  // outro pescador vê no anúncio; não pode avaliar sem ter pescado lá
  const z=P[2].pg;await z.goto(`http://localhost:${PORT}/#explorar`);await z.waitForTimeout(400);await z.click('[data-act=ad][data-v=a1]');await z.waitForTimeout(700);tx=await t(z);
  ok(tx.includes('Diário dos pescadores')&&tx.includes('Tucunaré · 2,5 kg'),'Outro pescador vê o registro no anúncio do rancho');
  ok(await z.evaluate(()=>{const i=document.querySelector('.dcard img');return !!i&&i.naturalWidth>0}),'Foto do diário carrega no anúncio');
  ok(tx.includes('Só avalia quem usou'),'Quem não pescou lá não consegue avaliar');
  // avaliação
  await pg0.goto(`http://localhost:${PORT}/#explorar`);await pg0.waitForTimeout(400);await pg0.click('[data-act=ad][data-v=a1]');await pg0.waitForTimeout(600);
  await pg0.click('[data-act=avaliar]');await pg0.waitForTimeout(200);await pg0.click('[data-act=salvaraval]');await pg0.waitForTimeout(200);ok(DB.aval.length===0,'Sem nota geral, a avaliação não é enviada');
  await pg0.click('.star[data-k=geral][data-v="4"]');await pg0.click('.star[data-k=peixe][data-v="5"]');await pg0.click('.star[data-k=preco][data-v="3"]');await pg0.fill('#av-txt','Rancho limpo, piloteiro bom. Tucunaré pequeno.');await pg0.click('[data-act=salvaraval]');await pg0.waitForTimeout(600);
  ok(DB.aval.length===1&&DB.aval[0].nota===4&&DB.aval[0].notas.peixe===5&&DB.aval[0].notas.preco===3,'Avaliação salva com nota geral e notas por item');
  await z.reload();await z.waitForTimeout(400);await z.goto(`http://localhost:${PORT}/#explorar`);await z.waitForTimeout(300);await z.click('[data-act=ad][data-v=a1]');await z.waitForTimeout(700);tx=await t(z);
  ok(tx.includes('4,0')&&tx.includes('1 avaliação')&&tx.includes('Rancho limpo'),'Outros veem a nota média e o comentário');
  await z.screenshot({path:__dirname+'/saida/avaliacao.png',fullPage:true});
  delete DB.pesc.pfeita;delete DB.pesc.pprox;await pg0.goto(`http://localhost:${PORT}/#pescarias`);await pg0.reload();await pg0.waitForTimeout(400);await pg0.click(`[data-act=open][data-v="${pid}"]`);await pg0.waitForTimeout(200);
  await z.goto(`http://localhost:${PORT}/#pescarias`);await z.waitForTimeout(400);await z.click(`[data-act=open][data-v="${pid}"]`);await z.waitForTimeout(200)}
 // 3e. fotos: carrossel nos cards e tela que não pisca
 {await pg0.goto(`http://localhost:${PORT}/#explorar`);await pg0.waitForTimeout(500);
  ok((await pg0.$$('.hcard .gal')).length>=5,'Cards do Explorar têm carrossel de fotos');
  const g0=await pg0.$('.hcard .gal');await g0.evaluate(g=>{g.scrollLeft=g.clientWidth});await pg0.waitForTimeout(300);
  ok(await pg0.evaluate(()=>document.querySelector('.hcard .dots i:nth-child(2)').classList.contains('on')),'Deslizar a foto no card muda a bolinha');
  await pg0.evaluate(()=>{window.__img=document.querySelector('.hcard .gal .slide')});await pg0.evaluate(()=>window.__render());await pg0.waitForTimeout(100);
  ok(await pg0.evaluate(()=>window.__img===document.querySelector('.hcard .gal .slide')),'Atualizar sem mudança não refaz a tela (sem piscar)');
  await pg0.evaluate(()=>window.__rerender());await pg0.waitForTimeout(100);
  ok(await pg0.evaluate(()=>document.querySelector('.hcard .gal').scrollLeft>0),'Quando a tela é refeita, a foto continua onde estava');
  await pg0.goto(`http://localhost:${PORT}/#pescarias`);await pg0.waitForTimeout(400);await pg0.click(`[data-act=open][data-v="${pid}"]`);await pg0.waitForTimeout(200)}
 // 3f. entrada profissional: tipo de conta, apresentação, áreas e painéis
 {const ctx=await B.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,locale:'pt-BR'});await ctx.exposeFunction('__rpc',(u,nm,a)=>rpc(u,nm,a));await ctx.exposeFunction('__upload',(p,d)=>{FOTOS[p]=d;return true});
  await ctx.route(/open-meteo\.com|images\.unsplash\.com/,r=>r.abort());
  const q=await ctx.newPage();q.on('pageerror',e=>errs.push('dono: '+e.message));await q.goto(`http://localhost:${PORT}/`);await q.waitForTimeout(400);
  ok((await t(q)).includes('Como você vai usar o app?'),'Tela de entrada pergunta se é pescador ou dono de rancho');await q.screenshot({path:__dirname+'/saida/entrada.png',fullPage:true});
  await q.click('[data-act=tipo][data-v=dono]');await q.fill('#em','dono@teste.local');await q.click('[data-act=mandaCodigo]');await q.fill('#cod','123456');await q.click('[data-act=confereCodigo]');await q.waitForTimeout(500);
  ok((await t(q)).includes('Anuncie grátis')&&(await t(q)).includes('1 de 3'),'Dono vê a apresentação curta do app');await q.screenshot({path:__dirname+'/saida/onboarding.png'});
  await q.click('[data-act=onbnext]');await q.click('[data-act=onbnext]');await q.click('[data-act=onbnext]');await q.waitForTimeout(500);
  const navTx=await q.textContent('#nav');ok(navTx.includes('Painel')&&navTx.includes('Anúncios')&&!navTx.includes('Contas'),'Dono tem menu próprio: Painel, Anúncios, Explorar, Perfil');
  ok((await t(q)).includes('Seu painel')&&(await t(q)).includes('EXEMPLO')&&(await q.$$('.bars')).length>0,'Painel do dono sem anúncio mostra exemplo com gráfico');await q.screenshot({path:__dirname+'/saida/painel-dono.png',fullPage:true});
  await q.click('#nav a[href="#anuncios"]');await q.waitForTimeout(300);ok((await t(q)).includes('Meus anúncios'),'Aba Anúncios mostra os anúncios do dono');
  await q.click('#nav a[href="#perfil"]');await q.waitForTimeout(300);ok(!(await t(q)).includes('dias de pesca'),'Perfil não mostra indicadores');
  await q.click('[data-act=area][data-v=pescador]');await q.waitForTimeout(300);await q.click('[data-act=onbskip]').catch(()=>{});await q.waitForTimeout(200);
  ok((await q.textContent('#nav')).includes('Contas'),'Dá para trocar para a área do pescador no Perfil');
  await q.click('#nav a[href="#perfil"]');await q.waitForTimeout(300);ok(!(await t(q)).includes('Administrador'),'Quem não é administrador não vê a área de administrador');await ctx.close();
  const ctx2=await B.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,locale:'pt-BR'});await ctx2.exposeFunction('__rpc',(u,nm,a)=>rpc(u,nm,a));await ctx2.route(/open-meteo\.com|images\.unsplash\.com/,r=>r.abort());
  const w=await ctx2.newPage();w.on('pageerror',e=>errs.push('admin: '+e.message));await w.goto(`http://localhost:${PORT}/`);await w.waitForTimeout(400);
  await w.fill('#em','vini@teste.local');await w.click('[data-act=mandaCodigo]');await w.fill('#cod','123456');await w.click('[data-act=confereCodigo]');await w.waitForTimeout(900);
  const tx=await t(w);ok(tx.includes('Painel do administrador')&&tx.includes('cadastrados'),'Administrador entra direto no painel de administração');
  ok((await w.$$('.bars')).length>0&&tx.includes('Mais bem avaliados')&&tx.includes('Últimas avaliações'),'Painel do administrador tem gráfico, ranking e moderação');
  await w.screenshot({path:__dirname+'/saida/painel-admin.png',fullPage:true});
  const av0=DB.aval[0];if(av0){await w.click(`[data-act=modav][data-v="${av0.id}"]`);await w.waitForTimeout(400);ok(av0.oculto===true,'Administrador esconde uma avaliação')}
  await ctx2.close()}
 // 4. tela: rolagem lateral e tamanho das letras em cada celular
 for(const [i,p] of P.entries()){for(const sub of ['turma','datas','levar','roteiro','contas']){await p.pg.click(`[data-act=sub][data-v=${sub}]`);await p.pg.waitForTimeout(80);
   const r=await p.pg.evaluate(()=>{const over=document.documentElement.scrollWidth>window.innerWidth+1;const small=[];for(const el of document.querySelectorAll('#app *, #nav *')){if(!el.childNodes.length)continue;const own=[...el.childNodes].some(n=>n.nodeType===3&&n.textContent.trim());if(!own)continue;const r=el.getBoundingClientRect();if(!r.width)continue;const fs=parseFloat(getComputedStyle(el).fontSize);if(fs<15)small.push(fs+'px "'+el.textContent.trim().slice(0,30)+'"')}
    const btn=[...document.querySelectorAll('#app button,#nav a')].filter(b=>{const r=b.getBoundingClientRect();return r.width&&r.height<44}).map(b=>(b.getAttribute('aria-label')||b.textContent.trim()).slice(0,20)+' '+Math.round(b.getBoundingClientRect().height)+'px');return {over,w:window.innerWidth,small:[...new Set(small)],btn:[...new Set(btn)]}});
   if(r.over)ok(false,p.nome+' ('+r.w+'px) aba '+sub+': tela passa da largura do celular');
   if(r.small.length)results.push('LETRA PEQUENA · '+p.nome+' ('+r.w+'px) aba '+sub+': '+r.small.join(' | '));
   if(r.btn.length)results.push('BOTÃO BAIXO · '+p.nome+' ('+r.w+'px) aba '+sub+': '+r.btn.join(' | '))}
  await p.pg.screenshot({path:__dirname+'/saida/tela-'+i+'.png',fullPage:false});if(i===0){await p.pg.evaluate(()=>scrollTo(0,0));await p.pg.screenshot({path:__dirname+'/saida/contas-antes.png',fullPage:true})}}
 ok(!errs.length,'Nenhum erro de programa em nenhum celular'+(errs.length?': '+errs.join(' / '):''));
 results.push('Conflitos resolvidos automaticamente: '+log.length);
 console.log(results.join('\n'));fs.writeFileSync(__dirname+'/saida/resultado.txt',results.join('\n'));
 fs.writeFileSync(__dirname+'/saida/saldos.json',JSON.stringify({saldos:Object.fromEntries(Object.entries(b).map(([k,v])=>[d.pessoas.find(x=>x.id===k).nome,Math.round(v*100)/100])),acerto:st.map(s=>{const [de,pa]=s.k.split('>');return d.pessoas.find(x=>x.id===de).nome+' -> '+d.pessoas.find(x=>x.id===pa).nome+' R$ '+s.v})},null,1));
 await B.close();srv.close()})().catch(e=>{console.error('ERRO NO TESTE',e);process.exit(1)});
