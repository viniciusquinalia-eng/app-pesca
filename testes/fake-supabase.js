// Cliente Supabase falso: guarda a sessão no navegador e manda as funções para o banco falso do teste.
window.supabase={createClient(){var KEY='fake_sess';var cbs=[];function get(){try{return JSON.parse(localStorage.getItem(KEY))}catch(e){return null}}
 return {auth:{getSession:function(){return Promise.resolve({data:{session:get()}})},onAuthStateChange:function(f){cbs.push(f)},
  signInWithOtp:function(o){window.__pendente=o.email;return Promise.resolve({error:null})},
  verifyOtp:function(o){var s={user:{id:o.email,email:o.email}};localStorage.setItem(KEY,JSON.stringify(s));cbs.forEach(function(f){f('SIGNED_IN',s)});return Promise.resolve({error:null})},
  signOut:function(){localStorage.removeItem(KEY);cbs.forEach(function(f){f('SIGNED_OUT',null)});return Promise.resolve({})}},
  storage:{from:function(b){return {upload:function(path,blob){var s=get();if(!s||path.indexOf(s.user.id+'/')!==0)return Promise.resolve({error:{message:'sem acesso'}});return new Promise(function(res){var r=new FileReader();r.onload=function(){window.__upload(path,r.result).then(function(){res({data:{path:path},error:null})})};r.readAsDataURL(blob)})},
   list:function(){return Promise.resolve({data:[],error:null})},remove:function(){return Promise.resolve({data:[],error:null})},
   getPublicUrl:function(path){return {data:{publicUrl:'/fake-foto/'+path}}}}}},
  rpc:function(n,a){var s=get();return window.__rpc(s&&s.user.id,n,a||{})}}}};
