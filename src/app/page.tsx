<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>INVOICES.KZ — Счета на оплату за 1 минуту</title>
<link href="https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=Inter:wght@300;400;500;600&display=swap" rel="stylesheet"/>
<style>
:root {
  --navy: #1C2056;
  --green: #2DC48D;
  --dark: #0a0d1f;
  --light: #f8f9ff;
  --glass: rgba(255,255,255,0.07);
  --glass-border: rgba(255,255,255,0.12);
}

*{margin:0;padding:0;box-sizing:border-box}
html{scroll-behavior:smooth}

body {
  font-family:'Inter',sans-serif;
  background: var(--dark);
  color:#fff;
  overflow-x:hidden;
}

/* ---- NOISE OVERLAY ---- */
body::before {
  content:'';
  position:fixed;
  inset:0;
  background-image:url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.04'/%3E%3C/svg%3E");
  pointer-events:none;
  z-index:999;
  opacity:.4;
}

/* ---- ANIMATED BG ORBS ---- */
.orbs {
  position:fixed;
  inset:0;
  pointer-events:none;
  z-index:0;
  overflow:hidden;
}
.orb {
  position:absolute;
  border-radius:50%;
  filter:blur(80px);
  opacity:.25;
  animation:orbFloat 12s ease-in-out infinite;
}
.orb1{width:600px;height:600px;background:radial-gradient(circle,#2DC48D,transparent);top:-200px;left:-200px;animation-delay:0s}
.orb2{width:500px;height:500px;background:radial-gradient(circle,#1C2056,#3b4fd4,transparent);top:30%;right:-150px;animation-delay:-4s}
.orb3{width:400px;height:400px;background:radial-gradient(circle,#2DC48D44,transparent);bottom:-100px;left:40%;animation-delay:-8s}

@keyframes orbFloat{
  0%,100%{transform:translate(0,0) scale(1)}
  33%{transform:translate(30px,-40px) scale(1.05)}
  66%{transform:translate(-20px,30px) scale(0.95)}
}

/* ---- NAV ---- */
nav {
  position:fixed;
  top:0;left:0;right:0;
  z-index:100;
  padding:16px 32px;
  display:flex;
  align-items:center;
  justify-content:space-between;
  background:rgba(10,13,31,0.7);
  backdrop-filter:blur(20px);
  border-bottom:1px solid var(--glass-border);
  transition:all .3s;
}
.nav-logo {
  font-family:'Syne',sans-serif;
  font-weight:800;
  font-size:18px;
  letter-spacing:2px;
  color:#fff;
  text-decoration:none;
}
.nav-logo span{color:var(--green)}
.nav-btns{display:flex;gap:12px;align-items:center}
.btn-ghost {
  font-size:13px;
  color:rgba(255,255,255,.6);
  background:none;
  border:none;
  cursor:pointer;
  padding:8px 16px;
  border-radius:10px;
  transition:.2s;
  font-family:'Inter',sans-serif;
}
.btn-ghost:hover{color:#fff;background:var(--glass)}
.btn-primary {
  font-size:13px;
  font-weight:600;
  color:#fff;
  background:var(--green);
  border:none;
  cursor:pointer;
  padding:10px 20px;
  border-radius:12px;
  transition:.2s;
  font-family:'Inter',sans-serif;
}
.btn-primary:hover{background:#25a877;transform:translateY(-1px);box-shadow:0 8px 25px rgba(45,196,141,.3)}

/* ---- HERO ---- */
.hero {
  position:relative;
  z-index:1;
  min-height:100vh;
  display:flex;
  flex-direction:column;
  align-items:center;
  justify-content:center;
  text-align:center;
  padding:120px 24px 80px;
}
.hero-badge {
  display:inline-flex;
  align-items:center;
  gap:8px;
  background:rgba(45,196,141,.1);
  border:1px solid rgba(45,196,141,.3);
  color:var(--green);
  font-size:12px;
  font-weight:600;
  letter-spacing:1px;
  padding:8px 18px;
  border-radius:100px;
  margin-bottom:32px;
  animation:fadeUp .8s ease both;
}
.hero h1 {
  font-family:'Syne',sans-serif;
  font-size:clamp(48px,8vw,96px);
  font-weight:800;
  line-height:.95;
  letter-spacing:-2px;
  margin-bottom:24px;
  animation:fadeUp .8s .1s ease both;
}
.hero h1 .line2{
  display:block;
  background:linear-gradient(135deg,var(--green),#5ee8b3);
  -webkit-background-clip:text;
  -webkit-text-fill-color:transparent;
  background-clip:text;
}
.hero p {
  max-width:520px;
  color:rgba(255,255,255,.55);
  font-size:16px;
  line-height:1.7;
  margin-bottom:40px;
  animation:fadeUp .8s .2s ease both;
}
.hero-cta {
  display:flex;
  gap:12px;
  flex-wrap:wrap;
  justify-content:center;
  animation:fadeUp .8s .3s ease both;
}
.cta-main {
  background:var(--green);
  color:#fff;
  font-family:'Inter',sans-serif;
  font-weight:700;
  font-size:15px;
  padding:16px 32px;
  border-radius:16px;
  border:none;
  cursor:pointer;
  transition:.25s;
  display:flex;align-items:center;gap:8px;
}
.cta-main:hover{transform:translateY(-2px);box-shadow:0 16px 40px rgba(45,196,141,.35);background:#25a877}
.cta-sec {
  background:var(--glass);
  color:rgba(255,255,255,.8);
  font-family:'Inter',sans-serif;
  font-weight:500;
  font-size:15px;
  padding:16px 32px;
  border-radius:16px;
  border:1px solid var(--glass-border);
  cursor:pointer;
  transition:.25s;
  backdrop-filter:blur(10px);
}
.cta-sec:hover{background:rgba(255,255,255,.12);color:#fff}
.hero-note {
  margin-top:16px;
  font-size:12px;
  color:rgba(255,255,255,.3);
  animation:fadeUp .8s .4s ease both;
}

/* Phone mockup */
.hero-visual {
  margin-top:64px;
  position:relative;
  animation:fadeUp .8s .5s ease both;
}
.phone-wrap {
  position:relative;
  width:280px;
  margin:0 auto;
}
.phone-glow {
  position:absolute;
  inset:-60px;
  background:radial-gradient(ellipse,rgba(45,196,141,.2),transparent 70%);
  pointer-events:none;
}
.phone-frame {
  width:280px;
  background:#111827;
  border-radius:40px;
  border:2px solid rgba(255,255,255,.1);
  overflow:hidden;
  box-shadow:0 40px 80px rgba(0,0,0,.6),inset 0 1px 0 rgba(255,255,255,.1);
  position:relative;
  animation:phoneFloat 4s ease-in-out infinite;
}
@keyframes phoneFloat{
  0%,100%{transform:translateY(0)}
  50%{transform:translateY(-12px)}
}
.phone-notch {
  width:100px;height:28px;
  background:#000;
  border-radius:0 0 20px 20px;
  margin:0 auto 12px;
}
.phone-screen {padding:0 16px 20px}
.phone-header {
  display:flex;justify-content:space-between;align-items:center;
  margin-bottom:16px;
  font-size:11px;color:rgba(255,255,255,.5);
}
.phone-logo{font-family:'Syne',sans-serif;font-weight:800;font-size:13px;color:#fff}
.invoice-card {
  background:rgba(255,255,255,.05);
  border:1px solid rgba(255,255,255,.1);
  border-radius:16px;
  padding:14px;
  margin-bottom:10px;
}
.inv-top{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px}
.inv-num{font-size:11px;color:rgba(255,255,255,.4)}
.inv-title{font-family:'Syne',sans-serif;font-weight:700;font-size:14px}
.inv-badge {
  background:rgba(45,196,141,.2);
  color:var(--green);
  font-size:10px;font-weight:600;
  padding:3px 8px;border-radius:6px;
}
.inv-row{display:flex;justify-content:space-between;font-size:11px;color:rgba(255,255,255,.5);margin-bottom:6px}
.inv-total{font-size:15px;font-weight:700;color:var(--green);text-align:right;margin-top:8px}
.phone-btn {
  width:100%;
  background:var(--green);
  color:#fff;
  border:none;
  border-radius:12px;
  padding:12px;
  font-size:12px;font-weight:600;
  cursor:pointer;
  font-family:'Inter',sans-serif;
}

/* ---- STATS ---- */
.stats {
  position:relative;z-index:1;
  padding:60px 24px;
  display:flex;
  justify-content:center;
  gap:0;
  flex-wrap:wrap;
  border-top:1px solid var(--glass-border);
  border-bottom:1px solid var(--glass-border);
}
.stat {
  text-align:center;
  padding:24px 48px;
  border-right:1px solid var(--glass-border);
  flex:1;min-width:160px;
}
.stat:last-child{border-right:none}
.stat-num {
  font-family:'Syne',sans-serif;
  font-size:36px;font-weight:800;
  color:var(--green);
  margin-bottom:4px;
}
.stat-label{font-size:12px;color:rgba(255,255,255,.4);letter-spacing:.5px}

/* ---- FEATURES ---- */
.section{position:relative;z-index:1;padding:100px 24px;max-width:1100px;margin:0 auto}
.section-tag {
  display:inline-block;
  background:rgba(45,196,141,.1);
  border:1px solid rgba(45,196,141,.2);
  color:var(--green);
  font-size:11px;font-weight:600;letter-spacing:2px;
  padding:6px 14px;border-radius:100px;
  margin-bottom:20px;
  text-transform:uppercase;
}
.section-title {
  font-family:'Syne',sans-serif;
  font-size:clamp(32px,4vw,52px);
  font-weight:800;
  line-height:1.05;
  letter-spacing:-1px;
  margin-bottom:16px;
}
.section-sub{font-size:15px;color:rgba(255,255,255,.45);max-width:480px;line-height:1.7;margin-bottom:60px}

.features-grid {
  display:grid;
  grid-template-columns:repeat(auto-fit,minmax(300px,1fr));
  gap:16px;
}
.feat-card {
  background:var(--glass);
  border:1px solid var(--glass-border);
  border-radius:24px;
  padding:28px;
  backdrop-filter:blur(10px);
  transition:.3s;
  cursor:default;
}
.feat-card:hover{
  transform:translateY(-4px);
  border-color:rgba(45,196,141,.3);
  background:rgba(45,196,141,.05);
  box-shadow:0 20px 60px rgba(0,0,0,.3);
}
.feat-icon{font-size:28px;margin-bottom:16px}
.feat-title{font-family:'Syne',sans-serif;font-size:17px;font-weight:700;margin-bottom:8px}
.feat-desc{font-size:13px;color:rgba(255,255,255,.45);line-height:1.7}

/* ---- STEPS ---- */
.steps-section{
  position:relative;z-index:1;
  padding:100px 24px;
  background:linear-gradient(180deg,transparent,rgba(45,196,141,.03),transparent);
}
.steps-inner{max-width:700px;margin:0 auto;text-align:center}
.steps-grid{display:flex;flex-direction:column;gap:16px;margin-top:48px;text-align:left}
.step-card {
  display:flex;gap:20px;align-items:flex-start;
  background:var(--glass);
  border:1px solid var(--glass-border);
  border-radius:20px;
  padding:24px;
  backdrop-filter:blur(10px);
  transition:.3s;
  position:relative;
  overflow:hidden;
}
.step-card::before{
  content:'';position:absolute;left:0;top:0;bottom:0;width:3px;
  background:linear-gradient(180deg,var(--green),transparent);
  opacity:0;transition:.3s;
}
.step-card:hover::before{opacity:1}
.step-card:hover{transform:translateX(6px);border-color:rgba(45,196,141,.2)}
.step-num {
  width:44px;height:44px;border-radius:14px;
  background:linear-gradient(135deg,var(--green),#1a9969);
  display:flex;align-items:center;justify-content:center;
  font-family:'Syne',sans-serif;font-weight:800;font-size:16px;
  flex-shrink:0;
}
.step-title{font-family:'Syne',sans-serif;font-size:16px;font-weight:700;margin-bottom:6px}
.step-desc{font-size:13px;color:rgba(255,255,255,.45);line-height:1.7}

/* ---- PRICING ---- */
.pricing-section{position:relative;z-index:1;padding:100px 24px}
.pricing-grid{
  max-width:900px;margin:0 auto;
  display:grid;
  grid-template-columns:repeat(auto-fit,minmax(240px,1fr));
  gap:16px;
  margin-top:48px;
}
.price-card {
  background:var(--glass);
  border:1px solid var(--glass-border);
  border-radius:24px;
  padding:28px;
  backdrop-filter:blur(10px);
  transition:.3s;
  position:relative;
  overflow:hidden;
}
.price-card.popular {
  border-color:rgba(45,196,141,.4);
  background:rgba(45,196,141,.06);
}
.price-card.pro {
  background:linear-gradient(135deg,rgba(28,32,86,.9),rgba(45,196,141,.1));
  border-color:rgba(45,196,141,.3);
}
.price-badge {
  display:inline-block;
  background:var(--green);
  color:#fff;
  font-size:10px;font-weight:700;letter-spacing:1px;
  padding:4px 10px;border-radius:8px;
  margin-bottom:16px;
  text-transform:uppercase;
}
.price-badge.max{background:linear-gradient(135deg,#2DC48D,#1C7AB5)}
.price-name{font-family:'Syne',sans-serif;font-size:20px;font-weight:800;margin-bottom:8px}
.price-amount{font-family:'Syne',sans-serif;font-size:40px;font-weight:800;color:var(--green);margin-bottom:4px}
.price-amount span{font-size:14px;font-weight:400;color:rgba(255,255,255,.4)}
.price-features{list-style:none;margin:20px 0 24px;space-y:8px}
.price-features li{
  display:flex;align-items:center;gap:10px;
  font-size:13px;color:rgba(255,255,255,.6);
  padding:6px 0;
  border-bottom:1px solid rgba(255,255,255,.05);
}
.price-features li span{color:var(--green);font-size:14px}
.price-btn {
  width:100%;padding:14px;border-radius:14px;border:none;cursor:pointer;
  font-family:'Inter',sans-serif;font-weight:600;font-size:14px;
  transition:.25s;
}
.price-btn.outline{
  background:transparent;
  color:rgba(255,255,255,.7);
  border:1px solid rgba(255,255,255,.15);
}
.price-btn.outline:hover{border-color:var(--green);color:var(--green)}
.price-btn.solid{
  background:var(--green);color:#fff;
}
.price-btn.solid:hover{background:#25a877;transform:translateY(-1px);box-shadow:0 10px 30px rgba(45,196,141,.3)}

/* ---- FOR WHO ---- */
.who-grid{
  display:grid;
  grid-template-columns:repeat(3,1fr);
  gap:12px;
  max-width:600px;
  margin:40px auto 0;
}
.who-card {
  background:var(--glass);
  border:1px solid var(--glass-border);
  border-radius:18px;
  padding:20px 12px;
  text-align:center;
  transition:.3s;
  cursor:default;
}
.who-card:hover{border-color:rgba(45,196,141,.3);transform:translateY(-3px)}
.who-icon{font-size:24px;margin-bottom:8px}
.who-label{font-size:11px;color:rgba(255,255,255,.55);font-weight:500}

/* ---- FAQ ---- */
.faq-section{position:relative;z-index:1;padding:80px 24px;max-width:700px;margin:0 auto}
.faq-list{margin-top:40px;display:flex;flex-direction:column;gap:10px}
.faq-item{
  background:var(--glass);
  border:1px solid var(--glass-border);
  border-radius:16px;
  overflow:hidden;
  transition:.3s;
}
.faq-q{
  width:100%;
  display:flex;justify-content:space-between;align-items:center;
  padding:18px 20px;
  background:none;border:none;color:#fff;cursor:pointer;
  font-family:'Inter',sans-serif;font-size:14px;font-weight:500;
  text-align:left;gap:16px;
}
.faq-q:hover{background:rgba(255,255,255,.03)}
.faq-icon{
  width:24px;height:24px;border-radius:8px;
  background:rgba(45,196,141,.15);
  color:var(--green);font-size:16px;
  display:flex;align-items:center;justify-content:center;
  flex-shrink:0;transition:.3s;
}
.faq-a{
  max-height:0;overflow:hidden;transition:.35s ease;
  font-size:13px;color:rgba(255,255,255,.45);line-height:1.7;
  padding:0 20px;
}
.faq-item.open .faq-a{max-height:200px;padding:0 20px 18px}
.faq-item.open .faq-icon{transform:rotate(45deg);background:rgba(45,196,141,.25)}

/* ---- CTA FINAL ---- */
.cta-section {
  position:relative;z-index:1;
  padding:100px 24px;
  text-align:center;
}
.cta-inner {
  max-width:600px;margin:0 auto;
  background:linear-gradient(135deg,rgba(45,196,141,.12),rgba(28,32,86,.4));
  border:1px solid rgba(45,196,141,.2);
  border-radius:32px;
  padding:64px 40px;
  position:relative;
  overflow:hidden;
}
.cta-inner::before{
  content:'';position:absolute;
  width:300px;height:300px;
  background:radial-gradient(circle,rgba(45,196,141,.15),transparent);
  top:-100px;right:-100px;
  border-radius:50%;
}
.cta-inner h2{
  font-family:'Syne',sans-serif;
  font-size:clamp(28px,4vw,44px);
  font-weight:800;letter-spacing:-1px;
  margin-bottom:12px;
}
.cta-inner p{font-size:15px;color:rgba(255,255,255,.45);margin-bottom:32px}
.cta-inner .cta-main{margin:0 auto;display:inline-flex}
.cta-note{font-size:12px;color:rgba(255,255,255,.25);margin-top:16px}

/* ---- FOOTER ---- */
footer {
  position:relative;z-index:1;
  padding:32px 24px;
  border-top:1px solid var(--glass-border);
  display:flex;
  align-items:center;
  justify-content:space-between;
  flex-wrap:wrap;
  gap:16px;
  max-width:1100px;margin:0 auto;
}
.footer-logo{font-family:'Syne',sans-serif;font-weight:800;font-size:14px;letter-spacing:2px}
.footer-logo span{color:var(--green)}
.footer-links{display:flex;gap:20px;flex-wrap:wrap}
.footer-links a{font-size:12px;color:rgba(255,255,255,.35);text-decoration:none;transition:.2s}
.footer-links a:hover{color:var(--green)}
.footer-copy{font-size:11px;color:rgba(255,255,255,.2);width:100%;text-align:center}

/* ---- ANIMATIONS ---- */
@keyframes fadeUp{
  from{opacity:0;transform:translateY(30px)}
  to{opacity:1;transform:translateY(0)}
}
.reveal{
  opacity:0;transform:translateY(40px);
  transition:opacity .7s ease,transform .7s ease;
}
.reveal.visible{opacity:1;transform:translateY(0)}

/* ---- MOBILE ---- */
@media(max-width:768px){
  nav{padding:14px 20px}
  .nav-logo{font-size:15px}
  .btn-ghost{display:none}
  .btn-primary{padding:8px 16px;font-size:12px}
  .hero{padding:100px 20px 60px}
  .hero h1{font-size:42px;letter-spacing:-1px}
  .hero p{font-size:14px}
  .hero-cta{flex-direction:column;align-items:center}
  .cta-main,.cta-sec{width:100%;max-width:280px;justify-content:center}
  .stats{padding:40px 20px}
  .stat{padding:20px 24px;min-width:140px}
  .stat-num{font-size:28px}
  .features-grid{grid-template-columns:1fr}
  .pricing-grid{grid-template-columns:1fr}
  .who-grid{grid-template-columns:repeat(3,1fr);gap:8px}
  .section{padding:70px 20px}
  .steps-section{padding:70px 20px}
  .cta-inner{padding:40px 24px}
  footer{flex-direction:column;align-items:center;text-align:center}
  .phone-frame{width:240px}
}
@media(max-width:400px){
  .hero h1{font-size:34px}
  .who-grid{grid-template-columns:repeat(2,1fr)}
  .stat{min-width:120px;padding:16px}
}
</style>
</head>
<body>

<div class="orbs">
  <div class="orb orb1"></div>
  <div class="orb orb2"></div>
  <div class="orb orb3"></div>
</div>

<!-- NAV -->
<nav>
  <a class="nav-logo" href="#">INVOICES<span>.KZ</span></a>
  <div class="nav-btns">
    <button class="btn-ghost" onclick="window.location='/login'">Войти</button>
    <button class="btn-primary" onclick="window.location='/login'">Начать бесплатно</button>
  </div>
</nav>

<!-- HERO -->
<section class="hero">
  <div class="hero-badge">🇰🇿 Сделано для казахстанского бизнеса</div>
  <h1>Счета на оплату<br/><span class="line2">за 1 минуту</span></h1>
  <p>Создавайте профессиональные счета с подписью и печатью. Отправляйте через WhatsApp. Принимайте оплату через Kaspi Pay.</p>
  <div class="hero-cta">
    <button class="cta-main" onclick="window.location='/login'">
      Создать первый счёт →
    </button>
    <button class="cta-sec" onclick="document.getElementById('features').scrollIntoView({behavior:'smooth'})">
      Как это работает
    </button>
  </div>
  <p class="hero-note">7 дней бесплатно · Без карты</p>

  <div class="hero-visual">
    <div class="phone-wrap">
      <div class="phone-glow"></div>
      <div class="phone-frame">
        <div class="phone-notch"></div>
        <div class="phone-screen">
          <div class="phone-header">
            <span>9:41</span>
            <span class="phone-logo">INVOICES.KZ</span>
            <span>●●●</span>
          </div>
          <div class="invoice-card">
            <div class="inv-top">
              <div>
                <div class="inv-num">INV-2024-1024</div>
                <div class="inv-title">ТОО «Ромашка»</div>
              </div>
              <div class="inv-badge">Оплачен</div>
            </div>
            <div class="inv-row"><span>Консалтинг × 10</span><span>150 000 ₸</span></div>
            <div class="inv-row"><span>НДС 12%</span><span>18 000 ₸</span></div>
            <div class="inv-total">168 000 ₸</div>
          </div>
          <button class="phone-btn">📥 Скачать PDF</button>
        </div>
      </div>
    </div>
  </div>
</section>

<!-- STATS -->
<div class="stats reveal">
  <div class="stat">
    <div class="stat-num">1 мин</div>
    <div class="stat-label">создание счёта</div>
  </div>
  <div class="stat">
    <div class="stat-num">2 000+</div>
    <div class="stat-label">бизнесов используют</div>
  </div>
  <div class="stat">
    <div class="stat-num">100%</div>
    <div class="stat-label">стандарты РК</div>
  </div>
  <div class="stat">
    <div class="stat-num">Kaspi</div>
    <div class="stat-label">интеграция оплаты</div>
  </div>
</div>

<!-- FEATURES -->
<section class="section" id="features">
  <div class="section-tag">Возможности</div>
  <h2 class="section-title">Всё для вашего<br/>документооборота</h2>
  <p class="section-sub">Все необходимые инструменты в одном месте — без бухгалтера и сложных программ.</p>
  <div class="features-grid">
    <div class="feat-card reveal">
      <div class="feat-icon">⚡</div>
      <div class="feat-title">Счёт за 1 минуту</div>
      <div class="feat-desc">Заполните данные клиента, добавьте услуги — PDF готов автоматически с вашей подписью и печатью.</div>
    </div>
    <div class="feat-card reveal">
      <div class="feat-icon">💚</div>
      <div class="feat-title">Оплата через Kaspi Pay</div>
      <div class="feat-desc">Клиент оплачивает в один клик через Kaspi. Деньги приходят мгновенно. Интеграция уже работает.</div>
    </div>
    <div class="feat-card reveal">
      <div class="feat-icon">💬</div>
      <div class="feat-title">Отправка в WhatsApp</div>
      <div class="feat-desc">Нажмите одну кнопку — клиент получит красивую страницу счёта прямо в мессенджере.</div>
    </div>
    <div class="feat-card reveal">
      <div class="feat-icon">📋</div>
      <div class="feat-title">КП, АВР, Накладная</div>
      <div class="feat-desc">Все документы по стандартам РК: Форма Р-1, Приложение 50, Форма З-2. Банки принимают без вопросов.</div>
    </div>
    <div class="feat-card reveal">
      <div class="feat-icon">✍️</div>
      <div class="feat-title">Подпись и печать</div>
      <div class="feat-desc">Загрузите один раз — автоматически появятся на всех документах. Поддержка ЭЦП НУЦ РК.</div>
    </div>
    <div class="feat-card reveal">
      <div class="feat-icon">📱</div>
      <div class="feat-title">Работает на телефоне</div>
      <div class="feat-desc">Создавайте счета на встрече, в дороге, дома. Устанавливается как приложение на любое устройство.</div>
    </div>
  </div>
</section>

<!-- HOW IT WORKS -->
<section class="steps-section" id="how">
  <div class="steps-inner">
    <div class="section-tag" style="margin:0 auto 20px">Как работает</div>
    <h2 class="section-title reveal">Три шага<br/>до оплаты</h2>
    <div class="steps-grid">
      <div class="step-card reveal">
        <div class="step-num">1</div>
        <div>
          <div class="step-title">Введите реквизиты</div>
          <div class="step-desc">Один раз заполните данные компании — БИН, ИИК, БИК, КБе. Они будут автоматически появляться во всех документах.</div>
        </div>
      </div>
      <div class="step-card reveal">
        <div class="step-num">2</div>
        <div>
          <div class="step-title">Создайте документ</div>
          <div class="step-desc">Укажите клиента, добавьте услуги и нажмите «Создать». PDF с подписью и печатью готов за 30 секунд.</div>
        </div>
      </div>
      <div class="step-card reveal">
        <div class="step-num">3</div>
        <div>
          <div class="step-title">Отправьте и получите деньги</div>
          <div class="step-desc">Отправьте ссылку через WhatsApp. Клиент видит счёт и оплачивает через Kaspi Pay мгновенно.</div>
        </div>
      </div>
    </div>
  </div>
</section>

<!-- FOR WHO -->
<section class="section" style="text-align:center;padding-top:60px">
  <div class="section-tag">Аудитория</div>
  <h2 class="section-title reveal">Для кого</h2>
  <div class="who-grid reveal">
    <div class="who-card"><div class="who-icon">👨‍💼</div><div class="who-label">ИП и фрилансеры</div></div>
    <div class="who-card"><div class="who-icon">🏢</div><div class="who-label">Малый бизнес</div></div>
    <div class="who-card"><div class="who-icon">👩‍💻</div><div class="who-label">IT компании</div></div>
    <div class="who-card"><div class="who-icon">🎨</div><div class="who-label">Дизайнеры</div></div>
    <div class="who-card"><div class="who-icon">🔧</div><div class="who-label">Подрядчики</div></div>
    <div class="who-card"><div class="who-icon">📦</div><div class="who-label">Поставщики</div></div>
  </div>
</section>

<!-- PRICING -->
<section class="pricing-section" id="pricing">
  <div style="text-align:center;max-width:700px;margin:0 auto">
    <div class="section-tag">Тарифы</div>
    <h2 class="section-title reveal">Без скрытых<br/>платежей</h2>
    <p class="section-sub reveal" style="margin:0 auto 0">Выберите подходящий план. Отмена в любое время.</p>
  </div>
  <div class="pricing-grid">
    <!-- Free -->
    <div class="price-card reveal">
      <div class="price-name">Бесплатно</div>
      <div class="price-amount">0 <span>₸</span></div>
      <ul class="price-features">
        <li><span>✓</span>7 дней бесплатного периода</li>
        <li><span>✓</span>PDF генерация</li>
        <li><span>✓</span>История счетов</li>
        <li><span>✓</span>Профиль компании</li>
        <li><span>✓</span>Публичная ссылка</li>
      </ul>
      <button class="price-btn outline" onclick="window.location='/login'">Начать бесплатно</button>
    </div>
    <!-- Basic -->
    <div class="price-card popular reveal">
      <div class="price-badge">Популярный</div>
      <div class="price-name">Базовый</div>
      <div class="price-amount">2 990 <span>₸/мес</span></div>
      <ul class="price-features">
        <li><span>✓</span>30 счетов в месяц</li>
        <li><span>✓</span>PDF с подписью и печатью</li>
        <li><span>✓</span>Справочник клиентов</li>
        <li><span>✓</span>Услуги и товары</li>
        <li><span>✓</span>Kaspi Pay интеграция</li>
        <li><span>✓</span>Поддержка в WhatsApp</li>
      </ul>
      <button class="price-btn solid" onclick="window.location='/login'">Подключить за 2 990 ₸</button>
    </div>
    <!-- Pro -->
    <div class="price-card pro reveal">
      <div class="price-badge max">Максимум</div>
      <div class="price-name">Про</div>
      <div class="price-amount">5 990 <span>₸/мес</span></div>
      <ul class="price-features">
        <li><span>✓</span>Безлимитные счета</li>
        <li><span>✓</span>КП, АВР, Накладная</li>
        <li><span>✓</span>Email + WhatsApp отправка</li>
        <li><span>✓</span>Аналитика и отчёты</li>
        <li><span>✓</span>ЭЦП НУЦ РК (скоро)</li>
        <li><span>✓</span>Приоритетная поддержка 24/7</li>
      </ul>
      <button class="price-btn solid" onclick="window.location='/login'">Подключить за 5 990 ₸</button>
    </div>
  </div>
</section>

<!-- FAQ -->
<section class="faq-section" id="faq">
  <div style="text-align:center">
    <div class="section-tag">FAQ</div>
    <h2 class="section-title reveal">Частые вопросы</h2>
  </div>
  <div class="faq-list">
    <div class="faq-item reveal">
      <button class="faq-q" onclick="toggleFaq(this)">
        Нужна ли ЭЦП для работы?
        <div class="faq-icon">+</div>
      </button>
      <div class="faq-a">Нет, ЭЦП необязательна. Вы можете загрузить рукописную подпись и печать. Интеграция с ЭЦП НУЦ РК находится в разработке.</div>
    </div>
    <div class="faq-item reveal">
      <button class="faq-q" onclick="toggleFaq(this)">
        Как клиент получает счёт?
        <div class="faq-icon">+</div>
      </button>
      <div class="faq-a">Вы отправляете ссылку через WhatsApp. Клиент открывает страницу счёта без регистрации и оплачивает через Kaspi Pay.</div>
    </div>
    <div class="faq-item reveal">
      <button class="faq-q" onclick="toggleFaq(this)">
        Принимают ли банки такие счета?
        <div class="faq-icon">+</div>
      </button>
      <div class="faq-a">Да. PDF документ соответствует стандартам РК — содержит БИН, ИИК, БИК, КБе и все необходимые реквизиты.</div>
    </div>
    <div class="faq-item reveal">
      <button class="faq-q" onclick="toggleFaq(this)">
        Можно ли работать с нескольких устройств?
        <div class="faq-icon">+</div>
      </button>
      <div class="faq-a">Да. INVOICES.KZ работает в браузере на телефоне, планшете и компьютере. Все данные синхронизируются автоматически.</div>
    </div>
    <div class="faq-item reveal">
      <button class="faq-q" onclick="toggleFaq(this)">
        Как отменить подписку?
        <div class="faq-icon">+</div>
      </button>
      <div class="faq-a">Напишите нам в WhatsApp — отменим в течение часа. Деньги за неиспользованный период возвращаем.</div>
    </div>
  </div>
</section>

<!-- CTA FINAL -->
<section class="cta-section">
  <div class="cta-inner reveal">
    <h2>Готовы начать?</h2>
    <p>Зарегистрируйтесь за 30 секунд — никакой карты не нужно</p>
    <button class="cta-main" onclick="window.location='/login'">Создать первый счёт →</button>
    <div class="cta-note">7 дней бесплатно · Отмена в любое время · Поддержка в WhatsApp</div>
  </div>
</section>

<!-- FOOTER -->
<footer>
  <div class="footer-logo">INVOICES<span>.KZ</span></div>
  <div class="footer-links">
    <a href="https://wa.me/77763555177" target="_blank">WhatsApp</a>
    <a href="mailto:support@invoices.kz">Email</a>
    <a href="/privacy">Политика</a>
    <a href="/terms">Условия</a>
    <a href="https://t.me/invoiceskz_support" target="_blank">Telegram</a>
  </div>
  <div class="footer-copy">© 2026 INVOICES.KZ · ИП First Project · БИН 890525350143 · г. Астана</div>
</footer>

<script>
// Scroll reveal
const observer = new IntersectionObserver((entries) => {
  entries.forEach((e, i) => {
    if(e.isIntersecting){
      setTimeout(()=>e.target.classList.add('visible'), i*80);
    }
  });
}, {threshold:.1, rootMargin:'0px 0px -50px 0px'});
document.querySelectorAll('.reveal').forEach(el=>observer.observe(el));

// FAQ toggle
function toggleFaq(btn){
  const item = btn.closest('.faq-item');
  const isOpen = item.classList.contains('open');
  document.querySelectorAll('.faq-item.open').forEach(el=>el.classList.remove('open'));
  if(!isOpen) item.classList.add('open');
}

// Nav scroll effect
window.addEventListener('scroll',()=>{
  const nav = document.querySelector('nav');
  nav.style.background = window.scrollY > 50
    ? 'rgba(10,13,31,0.95)'
    : 'rgba(10,13,31,0.7)';
});

// Counter animation
function animateCounter(el, target, suffix=''){
  let start=0;
  const duration=1500;
  const step = timestamp => {
    if(!start) start=timestamp;
    const progress = Math.min((timestamp-start)/duration,1);
    const eased = 1-Math.pow(1-progress,3);
    const current = Math.floor(eased*target);
    el.textContent = current.toLocaleString() + suffix;
    if(progress<1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// Trigger counters when stats visible
const statsObserver = new IntersectionObserver((entries)=>{
  entries.forEach(e=>{
    if(e.isIntersecting){
      const nums = document.querySelectorAll('.stat-num');
      nums[1] && animateCounter(nums[1], 2000, '+');
      statsObserver.disconnect();
    }
  });
},{threshold:.5});
const statsEl = document.querySelector('.stats');
if(statsEl) statsObserver.observe(statsEl);
</script>
</body>
</html>