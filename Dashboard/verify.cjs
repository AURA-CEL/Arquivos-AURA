const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const elements = new Map();
function element(id) { if(!elements.has(id)) elements.set(id,{textContent:'',innerHTML:'',style:{},attributes:{},classList:{add(){},remove(){},toggle(){}},setAttribute(k,v){this.attributes[k]=v;},addEventListener(){},appendChild(){},children:[]}); return elements.get(id); }
const context = vm.createContext({console,Date,Number,Math,JSON,Boolean,String,Blob,URL,performance,requestAnimationFrame(){},setInterval(){},navigator:{},window:{},document:{getElementById:element,querySelector:()=>null,querySelectorAll:()=>[],addEventListener(){},createElement:()=>element('created')}});
vm.runInContext(fs.readFileSync(__dirname+'/script.js','utf8'),context);
const run = code => vm.runInContext(code,context);
run("AURA.state.mode='serial'; renderOverview()");
assert.equal(element('simple-badge').textContent,'Sem leitura');
for(let count=0;count<4;count++){
  const sensors=Object.fromEntries(['inferior','medio','superior'].map((k,i)=>[k,{active:i<count,raw:600,avg:600,filtered:600}]));
  context.frame={level:Number((count*100/3).toFixed(1)),sensors,pluviometro:{basculadas:40,chuva_mm:38.72}};
  run('applyReading(frame)');
  assert.equal(element('simple-badge').textContent,['Sem detecção','Atenção','Alerta','Crítico'][count]);
  ['inferior','medio','superior'].forEach((key,i)=>assert.equal(element(`ruler-${key}`).attributes['data-state'],i<count?'wet':'dry'));
}
assert.equal(run('AURA.state.rain.hourMm'),0,'Existing tips must not become rain in the current hour');
run('AURA.state.lastUpdate=new Date(Date.now()-6000); renderOverview()');
assert.equal(element('simple-badge').textContent,'Sem atualização');
['inferior','medio','superior'].forEach(key=>assert.equal(element(`ruler-${key}`).attributes['data-state'],'unknown'));
context.frame.sensors.inferior.active=false; context.frame.level=66.7;
run('applyReading(frame)');
assert.equal(element('simple-badge').textContent,'Verificar sensores');
assert.equal(element('ruler-inferior').attributes['data-state'],'dry');
assert.equal(element('ruler-superior').attributes['data-state'],'wet');
assert.match(element('ruler-message').textContent,/Sequência inesperada/);
context.frame.sensors.inferior.active='false';
const last=run('AURA.state.lastUpdate.getTime()');run('applyReading(frame)');
assert.equal(run('AURA.state.lastUpdate.getTime()'),last);
context.frame.sensors.inferior.active=true; context.frame.level=100; delete context.frame.pluviometro;
run('applyReading(frame)');assert.equal(element('simple-rain').textContent,'Ainda sem leitura');
const html=fs.readFileSync(__dirname+'/index.html','utf8');
const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);assert.equal(new Set(ids).size,ids.length,'Unique HTML IDs');
console.log('PASS: 4 sensor states, missing/stale data, inconsistent sensors, invalid payload, missing rain, rain baseline and unique HTML IDs.');
