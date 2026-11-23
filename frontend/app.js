const API='/api';
const load=k=>{try{const v=JSON.parse(localStorage.getItem(k)||'[]');return Array.isArray(v)?v:[]}catch{return[]}};
let products=[], activeFilter='All', cart=load('zenzy-cart'), wishlist=load('zenzy-wishlist');
const $=s=>document.querySelector(s);
const PAGE=(()=>{const p=location.pathname.split('/').filter(Boolean)[0]||'';return['shop','collections','our-story','book-a-visit'].includes(p)?p:'home'})();
const HEADS={shop:['CURATED FOR YOU','Shop <em>all.</em>','Everyday pieces for women, men and essentials.','Shop all'],collections:['EXPLORE YOUR STYLE','The <em>collections.</em>','Choose a collection to start shopping.','Collections'],'our-story':['A LITTLE ABOUT US','Our <em>story.</em>','More than fashion. It is your expression.','Our story'],'book-a-visit':['PERSONAL SHOPPING','Book a <em>visit.</em>','Store visits, styling consultations and bulk-order enquiries.','Book a visit']};
function applyPage(){
 document.querySelectorAll('[data-page]').forEach(el=>el.classList.toggle('is-hidden',!el.dataset.page.split(' ').includes(PAGE)));
 document.querySelectorAll('#mainNav a[data-nav]').forEach(a=>a.classList.toggle('active',a.dataset.nav===PAGE));
 const ph=$('#pageHead'),h=HEADS[PAGE];if(!ph||!h)return;
 ph.innerHTML=`<nav class="crumbs" aria-label="Breadcrumb"><a href="/">Home</a> / <span>${h[3]}</span></nav><p class="eyebrow">${h[0]}</p><h1>${h[1]}</h1><p>${h[2]}</p>`;
 ph.classList.remove('is-hidden');
}
function initFromUrl(){
 const p=new URLSearchParams(location.search),c=p.get('category');
 if(['Women','Men','Essentials'].includes(c)){activeFilter=c;document.querySelectorAll('.filter').forEach(b=>b.classList.toggle('active',b.dataset.filter===c))}
 if(p.get('q'))$('#searchInput').value=p.get('q');
 if(p.get('focus')==='search')$('#searchInput').focus();
}
const money=n=>'₹'+Number(n).toLocaleString('en-IN');
const toast=msg=>{const t=$('#toast');t.textContent=msg;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2200)};
const save=()=>{localStorage.setItem('zenzy-cart',JSON.stringify(cart));localStorage.setItem('zenzy-wishlist',JSON.stringify(wishlist));renderCart();updateCounts()};
function updateCounts(){$('#cartCount').textContent=cart.reduce((n,x)=>n+x.qty,0);$('#drawerCount').textContent=`(${cart.reduce((n,x)=>n+x.qty,0)})` ;$('#wishCount').textContent=wishlist.length}
function productCard(p){return `<article class="product-card"><div class="product-image-wrap"><img src="${p.image}" alt="${p.name}" loading="lazy"><span class="product-badge">${p.badge||'ZENZY EDIT'}</span><button class="wish-button" data-wish="${p.id}" aria-label="Add to wishlist">${wishlist.includes(p.id)?'♥':'♡'}</button><button class="quick-add" data-quick="${p.id}">QUICK VIEW +</button></div><div class="product-info"><div><h3>${p.name}</h3><p>${p.category}</p></div><span class="product-price">${money(p.price)}</span></div></article>`}
function renderProducts(){let list=[...products];if(activeFilter!=='All')list=list.filter(p=>p.category===activeFilter);const q=$('#searchInput').value.toLowerCase();if(q)list=list.filter(p=>(p.name+' '+p.category).toLowerCase().includes(q));const sort=$('#sortSelect').value;if(sort==='low')list.sort((a,b)=>a.price-b.price);if(sort==='high')list.sort((a,b)=>b.price-a.price);$('#productGrid').innerHTML=list.length?list.map(productCard).join(''):'<p class="empty-state">No pieces found. Try another search.</p>'}
async function loadProducts(){try{let r=await fetch(API+'/products').catch(()=>null);if(!r||!r.ok)r=await fetch('../backend/data/products.json');if(!r.ok)throw new Error('API error');products=await r.json();renderProducts();renderCart()}catch(e){$('#productGrid').innerHTML='<p class="empty-state">Could not load products. Please start the backend server.</p>'}}
function addToCart(id,size='M'){const p=products.find(x=>x.id===id);if(!p)return;const item=cart.find(x=>x.id===id&&x.size===size);if(item)item.qty++;else cart.push({id,size,qty:1});save();toast('Added to your bag')}
function renderCart(){const el=$('#cartItems');if(!cart.length){el.innerHTML='<p class="empty-state">Your bag is waiting for something good.</p>'}else{el.innerHTML=cart.map(x=>{const p=products.find(p=>p.id===x.id);if(!p)return '';return `<div class="cart-row"><img src="${p.image}" alt=""><div><h4>${p.name}</h4><p>Size: ${x.size} · ${money(p.price)}</p><div class="qty"><button data-qty="${x.id}|${x.size}|-1">−</button>${x.qty}<button data-qty="${x.id}|${x.size}|1">+</button></div></div><button class="remove" data-remove="${x.id}|${x.size}">REMOVE</button></div>`}).join('')}const total=cart.reduce((s,x)=>s+(products.find(p=>p.id===x.id)?.price||0)*x.qty,0);$('#cartSubtotal').textContent=money(total);updateCounts()}
function openCart(){$('#cartDrawer').classList.add('open');$('#drawerBackdrop').classList.add('open')}
function closeCart(){$('#cartDrawer').classList.remove('open');$('#drawerBackdrop').classList.remove('open')}
function openProduct(id){const p=products.find(x=>x.id===id);if(!p)return;$('#dialogContent').innerHTML=`<div class="quick-view"><img src="${p.image}" alt="${p.name}"><div><p class="eyebrow">${p.category.toUpperCase()} / ZENZY COLLECTION</p><h2>${p.name}</h2><h3>${money(p.price)}</h3><p>${p.description}</p><p>Designed for everyday comfort. Please check the size guide and product details before ordering.</p><label for="sizeSelect">SELECT SIZE</label><select id="sizeSelect">${p.sizes.map(s=>`<option>${s}</option>`).join('')}</select><button class="button button-dark full" id="modalAdd" data-id="${p.id}">ADD TO BAG ↗</button></div></div>`;$('#productDialog').showModal()}
$('#productGrid').addEventListener('click',e=>{const q=e.target.closest('[data-quick]');const w=e.target.closest('[data-wish]');if(q)openProduct(q.dataset.quick);if(w){const id=w.dataset.wish;wishlist=wishlist.includes(id)?wishlist.filter(x=>x!==id):[...wishlist,id];save();renderProducts();toast(wishlist.includes(id)?'Saved to wishlist':'Removed from wishlist')}});
$('#dialogContent').addEventListener('click',e=>{if(e.target.id==='modalAdd'){addToCart(e.target.dataset.id,$('#sizeSelect').value);$('#productDialog').close()}});
$('#filters').addEventListener('click',e=>{const b=e.target.closest('[data-filter]');if(!b)return;activeFilter=b.dataset.filter;document.querySelectorAll('.filter').forEach(x=>x.classList.toggle('active',x===b));history.replaceState(null,'',activeFilter==='All'?location.pathname:location.pathname+'?category='+encodeURIComponent(activeFilter));renderProducts()});
$('#searchInput').addEventListener('input',renderProducts);$('#sortSelect').addEventListener('change',renderProducts);
$('#cartToggle').onclick=openCart;$('#cartClose').onclick=closeCart;$('#drawerBackdrop').onclick=closeCart;$('#dialogClose').onclick=()=>$('#productDialog').close();$('#checkoutClose').onclick=()=>$('#checkoutDialog').close();
$('#cartItems').addEventListener('click',e=>{if(e.target.dataset.qty){const [id,size,delta]=e.target.dataset.qty.split('|');const x=cart.find(x=>x.id===id&&x.size===size);x.qty+=Number(delta);if(x.qty<=0)cart=cart.filter(y=>y!==x);save()}if(e.target.dataset.remove){const [id,size]=e.target.dataset.remove.split('|');cart=cart.filter(x=>!(x.id===id&&x.size===size));save()}});
$('#checkoutButton').onclick=()=>{if(!cart.length){toast('Your bag is empty');return}closeCart();$('#checkoutDialog').showModal()};
$('#checkoutForm').addEventListener('submit',async e=>{e.preventDefault();const f=new FormData(e.target);const payload={customer:Object.fromEntries(f.entries()),items:cart};try{const r=await fetch(API+'/orders',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});const d=await r.json();if(!r.ok)throw new Error(d.error||'Could not place order');$('#checkoutMessage').textContent=`Thank you. Demo order ${d.orderId} has been created. No payment was taken.`;cart=[];save();e.target.reset()}catch(err){$('#checkoutMessage').textContent=err.message}});
const bookingForm=$('#bookingForm');if(bookingForm)bookingForm.addEventListener('submit',async e=>{e.preventDefault();const payload=Object.fromEntries(new FormData(bookingForm));try{const r=await fetch(API+'/bookings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});const d=await r.json();if(!r.ok)throw new Error(d.error||'Could not send booking request');$('#bookingMessage').textContent=`Request received. Your reference is ${d.reference}. We will contact you to confirm.`;bookingForm.reset()}catch(err){$('#bookingMessage').textContent=err.message}});
$('#newsletterForm').addEventListener('submit',async e=>{e.preventDefault();const email=$('#newsletterEmail').value;try{const r=await fetch(API+'/newsletter',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email})});const d=await r.json();if(!r.ok)throw new Error(d.error);toast(d.message);e.target.reset()}catch(err){toast(err.message||'Please try again')}});
$('#wishlistToggle').onclick=()=>{if(!wishlist.length){toast('Your wishlist is empty');return}const names=wishlist.map(id=>products.find(p=>p.id===id)?.name).filter(Boolean);toast('Wishlist: '+names.slice(0,2).join(', '))};
$('#searchToggle').onclick=()=>{if(PAGE!=='home'&&PAGE!=='shop'){location.href='/shop?focus=search';return}$('#searchInput').focus();$('#shop').scrollIntoView({behavior:'smooth'})};
$('#menuToggle').onclick=()=>$('#mainNav').classList.toggle('open');
document.querySelectorAll('.category-card').forEach(x=>x.addEventListener('click',()=>{activeFilter=x.dataset.category;document.querySelectorAll('.filter').forEach(b=>b.classList.toggle('active',b.dataset.filter===activeFilter));renderProducts()}));
$('#year').textContent=new Date().getFullYear();
if('IntersectionObserver'in window){const io=new IntersectionObserver(entries=>entries.forEach(e=>{if(e.isIntersecting){e.target.classList.add('visible');io.unobserve(e.target)}}),{threshold:.12});document.querySelectorAll('.section,.story-banner,.newsletter').forEach(el=>{el.classList.add('reveal');io.observe(el)})}
applyPage();initFromUrl();loadProducts();renderCart();
fetch('/api/settings').then(r=>r.ok?r.json():null).then(s=>{if(!s)return;
 const a=document.querySelector('#announce');if(a&&s.announcement)a.textContent=s.announcement;
 const set=(k,href)=>document.querySelectorAll('[data-s="'+k+'"]').forEach(el=>{if(href){el.href=href;el.target=href.startsWith('mailto:')?'':'_blank';el.rel='noopener noreferrer';el.hidden=false}});
 set('instagram',s.instagramUrl);set('pinterest',s.pinterestUrl);if(s.contactEmail)set('email','mailto:'+s.contactEmail);
}).catch(()=>{});
document.addEventListener('click',e=>{
 if(e.defaultPrevented||e.button!==0||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;
 const a=e.target.closest('a[href]');if(!a||a.target==='_blank'||a.hasAttribute('download'))return;
 const u=new URL(a.href,location.href);
 if(u.origin!==location.origin||(u.pathname===location.pathname&&u.search===location.search))return;
 if(matchMedia('(prefers-reduced-motion:reduce)').matches)return;
 e.preventDefault();document.body.classList.add('leaving');setTimeout(()=>{location.href=u.href},220);
});
addEventListener('pageshow',e=>{if(e.persisted)document.body.classList.remove('leaving')});
