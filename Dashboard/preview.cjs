const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const types = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.png':'image/png'};
const files = new Set(['index.html','style.css','experience.css','weather.css','script.js','weather.js','LOGO.png']);
http.createServer((req,res)=>{
  const name = new URL(req.url,'http://localhost').pathname.slice(1) || 'index.html';
  if(!files.has(name)){res.writeHead(404).end();return;}
  fs.readFile(path.join(__dirname,name),(error,data)=>{
    if(error){res.writeHead(404).end();return;}
    res.writeHead(200,{'Content-Type':types[path.extname(name)],'Cache-Control':'no-cache'});res.end(data);
  });
}).listen(8766,'127.0.0.1',()=>console.log('AURA: http://127.0.0.1:8766'));
