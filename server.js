import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import pg from 'pg';
import Stripe from 'stripe';
import {z} from 'zod';

const app=express();
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL});
const base=process.env.BASE_URL || 'http://localhost:3000';
const production=process.env.NODE_ENV==='production';
const stripe=process.env.STRIPE_SECRET_KEY?new Stripe(process.env.STRIPE_SECRET_KEY):null;
const billingReady=Boolean(stripe && process.env.STRIPE_PRICE_ID && process.env.STRIPE_WEBHOOK_SECRET);
if(production && (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length<32)) throw new Error('Strong SESSION_SECRET required in production');
app.set('trust proxy',production?1:false);
app.use(helmet({contentSecurityPolicy:false}));
app.use('/api/stripe/webhook',express.raw({type:'application/json'}),async(req,res)=>{
 if(!stripe||!process.env.STRIPE_WEBHOOK_SECRET) return res.status(503).send('Billing not configured');
 let event;
 try{ event=stripe.webhooks.constructEvent(req.body,req.headers['stripe-signature'],process.env.STRIPE_WEBHOOK_SECRET);}
 catch{return res.status(400).send('Invalid signature');}
 try{
  const obj=event.data.object;
  if(event.type==='checkout.session.completed' && obj.mode==='subscription' && obj.customer && obj.metadata?.userId){
   await pool.query('UPDATE users SET stripe_customer_id=$1 WHERE id=$2',[String(obj.customer),Number(obj.metadata.userId)]);
  }
  if(['customer.subscription.created','customer.subscription.updated','customer.subscription.deleted'].includes(event.type)){
   const customer=String(obj.customer);
   const active=['active','trialing'].includes(obj.status);
   await pool.query("UPDATE users SET subscription_status=$1, stripe_subscription_id=$2 WHERE stripe_customer_id=$3",
    [active?'pro':'free',obj.id,customer]);
  }
  res.json({received:true});
 }catch(err){console.error('Webhook processing failed',err);res.status(500).end();}
});
app.use(express.urlencoded({extended:false,limit:'10kb'}));
app.use(express.json({limit:'10kb'}));
const esc=(s)=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=(n)=>new Intl.NumberFormat('de-DE',{style:'currency',currency:'EUR'}).format(Number(n));
const hash=(s)=>crypto.createHash('sha256').update(s).digest('hex');
const makeToken=()=>crypto.randomBytes(32).toString('hex');
const loginSchema=z.object({email:z.string().email().max(254),password:z.string().min(10).max(100)});
const proposalSchema=z.object({client:z.string().trim().min(1).max(120),service:z.string().trim().min(1).max(240),price:z.coerce.number().min(0).max(1e9),current_cost:z.coerce.number().min(0).max(1e9),expected_savings:z.coerce.number().min(0).max(1e9)});
function page(title,body,user){return `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} | DealForge</title><link rel="stylesheet" href="/styles.css"></head><body><header><a class="logo" href="/">◆ DealForge</a><nav><a href="/pricing">Preise</a>${user?'<a href="/dashboard">Dashboard</a><form action="/logout" method="post"><button class="navbtn">Abmelden</button></form>':'<a href="/login">Login</a><a class="cta-sm" href="/register">Starten</a>'}</nav></header><main>${body}</main><footer>DealForge · Demo-MVP · <a href="/legal">Rechtliches</a></footer></body></html>`;}
function setCookie(res,value,age){res.cookie('session',value,{httpOnly:true,secure:production,sameSite:'lax',path:'/',maxAge:age});}
async function auth(req,res,next){
 const t=req.headers.cookie?.split(';').map(s=>s.trim()).find(s=>s.startsWith('session='))?.slice(8);
 req.user=null;
 if(t && /^[0-9a-f]{64}$/.test(t)){
  const result=await pool.query("SELECT u.id,u.email,u.subscription_status FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.token_hash=$1 AND s.expires_at>now()",[hash(t)]);
  req.user=result.rows[0]||null;
  req.token=t;
 }
 next();
}
app.use(auth);
app.get('/styles.css',(req,res)=>res.type('css').send(`*{box-sizing:border-box}body{margin:0;background:#0b1120;color:#ecf2ff;font:16px system-ui,Arial}a{color:#83bbff;text-decoration:none}header{display:flex;justify-content:space-between;align-items:center;gap:16px;padding:20px 6%;border-bottom:1px solid #25304a}nav{display:flex;gap:20px;align-items:center;flex-wrap:wrap}nav form{margin:0}.logo{font-weight:900;color:#fff;font-size:22px}main{max-width:1100px;margin:auto;padding:56px 24px;min-height:75vh}h1{font-size:clamp(36px,5vw,64px);letter-spacing:-.05em;line-height:1.1}h2{font-size:26px}.muted{color:#a9b5cf}p{line-height:1.65}.hero{max-width:800px;padding:50px 0}.accent{color:#69e5d4}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:22px}.card{background:#131e34;border:1px solid #2b3b58;border-radius:18px;padding:24px}.btn,.cta-sm{background:#69e5d4;color:#061525;font-weight:800;border:0;border-radius:9px;padding:13px 20px;display:inline-block;cursor:pointer}.navbtn{border:0;color:#83bbff;background:transparent;cursor:pointer;font:inherit}input,textarea{display:block;width:100%;margin:8px 0 18px;border-radius:9px;border:1px solid #4a5a76;background:#0b1528;color:white;padding:14px;font:inherit}label{font-weight:650}form.box{max-width:540px}.pill{color:#69e5d4}.price{font-size:40px;font-weight:900}.error{color:#ffadad}footer{text-align:center;padding:30px;border-top:1px solid #25304a;color:#a9b5cf}@media print{header,footer,.noprint{display:none}body{background:white;color:#111}main{padding:0}}`));
app.get('/',(req,res)=>res.send(page('B2B Angebote in Minuten',`<section class="hero"><p class="pill">B2B SOFTWARE · MADE SIMPLE</p><h1>Angebote, die den <span class="accent">Wert zeigen.</span></h1><p class="muted">Erstelle professionelle B2B-Angebote mit nachvollziehbaren Kosten- und Einsparungsszenarien. In wenigen Minuten statt stundenlang.</p><a href="/register" class="btn">Kostenlos starten →</a></section><section class="grid"><div class="card"><h2>⚡ Schnell</h2><p>Strukturierte Angebote mit einem Formular.</p></div><div class="card"><h2>📈 ROI-Szenarien</h2><p>Konkrete Annahmen, keine Gewinnversprechen.</p></div><div class="card"><h2>🔗 Teilbar</h2><p>Eigener Link für jedes Angebot.</p></div></section>`,req.user)));
app.get('/pricing',(req,res)=>res.send(page('Preise',`<h1>Einfaches Pricing.</h1><section class="grid"><div class="card"><h2>Free</h2><div class="price">0 €</div><p>3 Angebote insgesamt</p><a class="btn" href="/register">Loslegen</a></div><div class="card"><h2>Pro</h2><div class="price">29 €<small>/Monat</small></div><p>Unbegrenzte Angebote · Share-Links</p>${billingReady?'<form method="post" action="/checkout"><button class="btn">Pro abonnieren</button></form>':'<p class="muted">Bezahlung noch nicht freigeschaltet.</p>'}</div></section>`,req.user)));
app.get('/register',(req,res)=>res.send(page('Registrieren',`<h1>Konto erstellen</h1><form class="box" action="/register" method="post"><label>E-Mail<input name="email" type="email" required maxlength="254"></label><label>Passwort (mindestens 10 Zeichen)<input name="password" type="password" required minlength="10"></label><button class="btn">Registrieren</button></form>`,req.user)));
app.post('/register',async(req,res)=>{
 const v=loginSchema.safeParse(req.body);
 if(!v.success)return res.status(400).send(page('Fehler','<p class="error">Ungültige E-Mail oder Passwort.</p>'));
 const {email,password}=v.data;
 try{
  const hashed=await bcrypt.hash(password,12);
  const result=await pool.query('INSERT INTO users(email,password_hash) VALUES($1,$2) RETURNING id',[email.toLowerCase(),hashed]);
  await establishSession(res,result.rows[0].id);res.redirect('/dashboard');
 }catch(err){if(err.code==='23505')return res.status(409).send(page('Fehler','<p class="error">E-Mail bereits registriert.</p>'));throw err;}
});
async function establishSession(res,id){const token=makeToken();await pool.query("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '30 days')",[hash(token),id]);setCookie(res,token,30*86400000);}
app.get('/login',(req,res)=>res.send(page('Login',`<h1>Login</h1><form class="box" action="/login" method="post"><label>E-Mail<input type="email" name="email" required></label><label>Passwort<input type="password" name="password" required></label><button class="btn">Einloggen</button></form>`)));
app.post('/login',async(req,res)=>{const v=loginSchema.safeParse(req.body);if(!v.success)return res.status(401).send(page('Fehler','<p>Ungültige Login-Daten.</p>'));const result=await pool.query('SELECT id,password_hash FROM users WHERE email=$1',[v.data.email.toLowerCase()]);const user=result.rows[0];if(!user||!(await bcrypt.compare(v.data.password,user.password_hash)))return res.status(401).send(page('Fehler','<p>Ungültige Login-Daten.</p>'));await establishSession(res,user.id);res.redirect('/dashboard');});
app.post('/logout',async(req,res)=>{if(req.token)await pool.query('DELETE FROM sessions WHERE token_hash=$1',[hash(req.token)]);res.clearCookie('session',{path:'/'});res.redirect('/');});
function needLogin(req,res,next){if(!req.user)return res.redirect('/login');next();}
app.get('/dashboard',needLogin,async(req,res)=>{
 const results=await pool.query('SELECT id,client,service,created_at FROM proposals WHERE user_id=$1 ORDER BY created_at DESC',[req.user.id]);
 const rows=results.rows.map(p=>`<div class="card"><b>${esc(p.client)}</b><p>${esc(p.service)}</p><a href="/proposal/${encodeURIComponent(p.id)}">Ansehen →</a></div>`).join('');
 res.send(page('Dashboard',`<h1>Deine Angebote</h1><p class="muted">Plan: ${esc(req.user.subscription_status)} · ${results.rowCount} Angebote</p><p><a class="btn" href="/new">+ Angebot erstellen</a></p><div class="grid">${rows||'<p>Noch keine Angebote vorhanden.</p>'}</div>`,req.user));
});
app.get('/new',needLogin,(req,res)=>res.send(page('Neues Angebot',`<h1>Neues Angebot</h1><form class="box" action="/new" method="post"><label>Kunde<input name="client" required maxlength="120"></label><label>Leistung<textarea name="service" required maxlength="240"></textarea></label><label>Einmaliger Angebotspreis (€)<input type="number" name="price" min="0" step=".01" value="1500" required></label><label>Aktuelle monatliche Kosten beim Kunden (€)<input type="number" name="current_cost" min="0" step=".01" value="2000" required></label><label>Angenommene monatliche Einsparung (€)<input type="number" name="expected_savings" min="0" step=".01" value="400" required></label><button class="btn">Angebot erzeugen</button></form><p class="muted">Die Einsparung ist eine Annahme des Erstellers, kein garantiertes Ergebnis.</p>`,req.user)));
app.post('/new',needLogin,async(req,res)=>{
 const data=proposalSchema.safeParse(req.body);
 if(!data.success)return res.status(400).send(page('Fehler','<p>Bitte gültige Werte eingeben.</p>',req.user));
 const client=await pool.connect();
 try{
  await client.query('BEGIN');
  await client.query('SELECT id FROM users WHERE id=$1 FOR UPDATE',[req.user.id]);
  const u=await client.query('SELECT subscription_status FROM users WHERE id=$1',[req.user.id]);
  const count=await client.query('SELECT count(*)::int AS n FROM proposals WHERE user_id=$1',[req.user.id]);
  if(u.rows[0].subscription_status!=='pro' && count.rows[0].n>=3){await client.query('ROLLBACK');return res.status(402).send(page('Free-Limit erreicht','<h1>3 kostenlose Angebote genutzt.</h1><p><a href="/pricing" class="btn">Pro ansehen</a></p>',req.user));}
  const id=crypto.randomUUID();const p=data.data;
  await client.query('INSERT INTO proposals(id,user_id,client,service,price,current_cost,expected_savings) VALUES($1,$2,$3,$4,$5,$6,$7)',[id,req.user.id,p.client,p.service,p.price,p.current_cost,p.expected_savings]);
  await client.query('COMMIT');res.redirect('/proposal/'+id);
 }catch(err){await client.query('ROLLBACK');throw err;}finally{client.release();}
});
app.get('/proposal/:id',async(req,res)=>{
 if(!/^[0-9a-f-]{36}$/.test(req.params.id))return res.sendStatus(404);
 const result=await pool.query('SELECT * FROM proposals WHERE id=$1',[req.params.id]);const p=result.rows[0];if(!p)return res.sendStatus(404);
 const isOwner=req.user?.id===p.user_id;
 const saving=Number(p.expected_savings);const price=Number(p.price);const yearly=saving*12;
 const roi=price>0?((yearly-price)/price*100).toFixed(0)+' %':'n/a';
 res.send(page('Angebot für '+p.client,`<div class="noprint"><a href="/dashboard">← Dashboard</a></div><p class="pill">BUSINESS ANGEBOT</p><h1>${esc(p.client)}</h1><div class="card"><h2>Leistung</h2><p>${esc(p.service)}</p><h2>Investition: ${money(price)}</h2></div><h2>Wirtschaftlichkeits-Szenario</h2><div class="grid"><div class="card"><p>Angenommene Einsparung / Monat</p><h2>${money(saving)}</h2></div><div class="card"><p>Angenommene Einsparung / Jahr</p><h2>${money(yearly)}</h2></div><div class="card"><p>ROI erstes Jahr (vereinfachtes Szenario)</p><h2>${roi}</h2></div></div><p class="muted">Berechnung basiert ausschließlich auf Annahmen des Erstellers und unterstellt zwölf volle Monate gleichmäßiger Einsparungen. Nicht garantiert. Aktuelle monatliche Kosten laut Ersteller: ${money(p.current_cost)}.</p>${isOwner?'<div class="noprint"><button class="btn" onclick="window.print()">Als PDF drucken</button></div>':''}`,req.user));
});
app.post('/checkout',needLogin,async(req,res)=>{
 if(!billingReady)return res.status(503).send('Billing not configured');
 const latest=await pool.query('SELECT stripe_customer_id,subscription_status FROM users WHERE id=$1',[req.user.id]);
 if(latest.rows[0].subscription_status==='pro')return res.redirect('/dashboard');
 const session=await stripe.checkout.sessions.create({mode:'subscription',customer:latest.rows[0].stripe_customer_id||undefined,customer_email:latest.rows[0].stripe_customer_id?undefined:req.user.email,line_items:[{price:process.env.STRIPE_PRICE_ID,quantity:1}],success_url:base+'/dashboard?checkout=success',cancel_url:base+'/pricing',metadata:{userId:String(req.user.id)},subscription_data:{metadata:{userId:String(req.user.id)}}});
 res.redirect(303,session.url);
});
app.get('/legal',(req,res)=>res.send(page('Rechtliches',`<h1>Rechtliches</h1><p>Vor öffentlicher kommerzieller Nutzung müssen Impressum, Datenschutzinformationen und AGB durch den Betreiber ergänzt werden.</p>`,req.user)));
app.use((err,req,res,next)=>{console.error(err);res.status(500).send(page('Fehler','<h1>Ein Fehler ist aufgetreten.</h1><p>Bitte später erneut versuchen.</p>'));});
app.listen(Number(process.env.PORT||3000),()=>console.log('DealForge listening'));
