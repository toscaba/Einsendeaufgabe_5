// Basierend auf dem KAP-Softwaregerüst der Lerneinheit Kamera und Perspektive.
var app = (function () {
  'use strict';
  var gl, prog, models = [];
  var depth = 2, showWire = true;
  var camera = {
    eye: [0, 1.8, 6.5], center: [0, 0, 0], up: [0, 1, 0],
    zAngle: 0.35, distance: 6.5, height: 1.8,
    fovy: Math.PI / 3, vMatrix: mat4.create(), pMatrix: mat4.create()
  };

  function shader(type, id) {
    var s = gl.createShader(type);
    gl.shaderSource(s, document.getElementById(id).textContent);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw Error(gl.getShaderInfoLog(s));
    return s;
  }
  function initWebGL() {
    gl = document.getElementById('canvas').getContext('webgl');
    if (!gl) throw Error('WebGL wird von diesem Browser nicht unterstützt.');
    prog = gl.createProgram();
    gl.attachShader(prog, shader(gl.VERTEX_SHADER, 'vertexshader'));
    gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, 'fragmentshader'));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw Error(gl.getProgramInfoLog(prog));
    gl.useProgram(prog);
    prog.pos = gl.getAttribLocation(prog, 'aPosition');
    prog.normal = gl.getAttribLocation(prog, 'aNormal');
    prog.pMatrix = gl.getUniformLocation(prog, 'uPMatrix');
    prog.mvMatrix = gl.getUniformLocation(prog, 'uMVMatrix');
    prog.baseColor = gl.getUniformLocation(prog, 'uBaseColor');
    prog.wire = gl.getUniformLocation(prog, 'uWireframe');
    gl.clearColor(0.93, 0.96, 1.0, 1);
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.POLYGON_OFFSET_FILL);
    gl.polygonOffset(1, 1);
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
  }
  function makeModel(geometry, center, color) {
    var m = { center: center, color: color };
    geometry.createVertexData.call(m);
    m.vboPos = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, m.vboPos);
    gl.bufferData(gl.ARRAY_BUFFER, m.vertices, gl.STATIC_DRAW);
    m.vboNormal = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, m.vboNormal);
    gl.bufferData(gl.ARRAY_BUFFER, m.normals, gl.STATIC_DRAW);
    m.iboTris = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, m.iboTris);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, m.indicesTris, gl.STATIC_DRAW);
    m.iboLines = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, m.iboLines);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, m.indicesLines, gl.STATIC_DRAW);
    models.push(m);
    return m;
  }
  // Kegel: Mantel und Boden aus Dreiecken, mit Normalen und Kanten.
  var cone = { createVertexData: function () {
    var v = [], n = [], t = [], l = [], segments = 36;
    function triangle(a, b, c, normal) {
      var k = v.length / 3;
      [a, b, c].forEach(function(p) { v.push(p[0],p[1],p[2]); n.push(normal[0],normal[1],normal[2]); });
      t.push(k,k+1,k+2); l.push(k,k+1,k+1,k+2,k+2,k);
    }
    for (var i=0;i<segments;i++) {
      var a=i*2*Math.PI/segments, b=(i+1)*2*Math.PI/segments;
      var p=[0.65*Math.cos(a),-0.7,0.65*Math.sin(a)];
      var q=[0.65*Math.cos(b),-0.7,0.65*Math.sin(b)];
      var normal=[Math.cos((a+b)/2),0.5,Math.sin((a+b)/2)];
      triangle([0,0.85,0],p,q,normal);
      triangle([0,-0.7,0],q,p,[0,-1,0]);
    }
    this.vertices=new Float32Array(v); this.normals=new Float32Array(n);
    this.indicesTris=new Uint16Array(t); this.indicesLines=new Uint16Array(l);
  }};
  // Rekursive Kugel: Start mit einem Oktaeder (8 Dreiecke).
  var sphere = { createVertexData: function () {
    var v=[], n=[], t=[], l=[];
    function normalize(p) {var d=Math.hypot(p[0],p[1],p[2]);return p.map(function(x){return x/d;});}
    function addTriangle(a,b,c) {
      var k=v.length/3;
      [a,b,c].forEach(function(p){v.push(p[0]*0.85,p[1]*0.85,p[2]*0.85);n.push(p[0],p[1],p[2]);});
      t.push(k,k+1,k+2);l.push(k,k+1,k+1,k+2,k+2,k);
    }
    function subdivide(a,b,c,d) {
      if(d===0){addTriangle(a,b,c);return;}
      var ab=normalize([(a[0]+b[0])/2,(a[1]+b[1])/2,(a[2]+b[2])/2]);
      var bc=normalize([(b[0]+c[0])/2,(b[1]+c[1])/2,(b[2]+c[2])/2]);
      var ca=normalize([(c[0]+a[0])/2,(c[1]+a[1])/2,(c[2]+a[2])/2]);
      subdivide(a,ab,ca,d-1);subdivide(ab,b,bc,d-1);
      subdivide(ca,bc,c,d-1);subdivide(ab,bc,ca,d-1);
    }
    var top=[0,1,0], bottom=[0,-1,0];
    var ring=[[1,0,0],[0,0,1],[-1,0,0],[0,0,-1]];
    for(var i=0;i<4;i++){
      subdivide(top,ring[i],ring[(i+1)%4],depth);
      subdivide(bottom,ring[(i+1)%4],ring[i],depth);
    }
    this.vertices=new Float32Array(v);this.normals=new Float32Array(n);
    this.indicesTris=new Uint16Array(t);this.indicesLines=new Uint16Array(l);
  }};
  // Ein festes Bodenraster als räumlicher Orientierungspunkt.
  var floorGrid = { createVertexData: function () {
    var v = [], n = [], l = [];
    function line(a, b) {
      var k = v.length / 3;
      v.push.apply(v, a); v.push.apply(v, b);
      n.push(0, 1, 0, 0, 1, 0);
      l.push(k, k + 1);
    }
    for (var i = -4; i <= 4; i++) {
      line([i, -1.15, -4], [i, -1.15, 4]);
      line([-4, -1.15, i], [4, -1.15, i]);
    }
    this.vertices = new Float32Array(v);
    this.normals = new Float32Array(n);
    this.indicesLines = new Uint16Array(l);
    this.indicesTris = new Uint16Array(0);
  }};
  function initModels(){
    // Die Modelle bilden ein Dreieck statt einer geraden Reihe.
    makeModel(torus,[-1.8,0,-0.9],[0.25,0.66,0.88]);
    makeModel(cone,[1.8,0,-0.9],[0.98,0.62,0.29]);
    makeModel(sphere,[0,0,1.5],[0.62,0.48,0.91]);
    makeModel(floorGrid,[0,0,0],[0.60,0.67,0.76]).isGrid = true;
  }
  function updateSphere(){
    var old=models.splice(2,1)[0];
    [old.vboPos,old.vboNormal,old.iboTris,old.iboLines].forEach(function(b){gl.deleteBuffer(b);});
    var updated = makeModel(sphere,[0,0,1.5],[0.62,0.48,0.91]);
    models.splice(2,0,models.pop());
    document.getElementById('depth').textContent='Rekursionstiefe: '+depth;
    document.getElementById('triangles').textContent=(8*Math.pow(4,depth)).toLocaleString('de-DE')+' Dreiecke';
    document.getElementById('minus').disabled=depth===0;
    document.getElementById('plus').disabled=depth===5;
    render();
  }
  function initEventHandler(){
    window.addEventListener('keydown',function(e){
      var changed=true;
      switch(e.key){
      case 'ArrowLeft':camera.zAngle-=0.20;break;
      case 'ArrowRight':camera.zAngle+=0.20;break;
        case 'ArrowUp':camera.height=Math.min(8,camera.height+0.2);break;
        case 'ArrowDown':camera.height=Math.max(-8,camera.height-0.2);break;
        case 'n':camera.distance=Math.max(3.5,camera.distance-0.35);break;
        case 'N':camera.distance=Math.min(15,camera.distance+0.35);break;
        default:changed=false;
      }
      if(changed){e.preventDefault();render();}
    });
    document.getElementById('minus').addEventListener('click',function(){if(depth>0){depth--;updateSphere();}});
    document.getElementById('plus').addEventListener('click',function(){if(depth<5){depth++;updateSphere();}});
    document.getElementById('mode').addEventListener('click',function(){showWire=!showWire;this.textContent='Drahtgitter: '+(showWire?'ein':'aus');render();});
    document.getElementById('reset').addEventListener('click',function(){camera.zAngle=0.35;camera.distance=6.5;camera.height=1.8;render();});
  }
  function render(){
    gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
    camera.eye=[camera.distance*Math.sin(camera.zAngle),camera.height,camera.distance*Math.cos(camera.zAngle)];
    mat4.lookAt(camera.vMatrix,camera.eye,camera.center,camera.up);
    mat4.perspective(camera.pMatrix,camera.fovy,gl.canvas.width/gl.canvas.height,0.1,100);
    gl.uniformMatrix4fv(prog.pMatrix,false,camera.pMatrix);
    models.forEach(function(m){   

     // Model-Matrix: Position des Objekts in der Welt.
     var modelMatrix = mat4.create();
     mat4.translate(modelMatrix, modelMatrix, m.center);

     // View-Matrix und Model-Matrix kombinieren.
     var mv = mat4.create();
     mat4.multiply(mv, camera.vMatrix, modelMatrix);

  // Ergebnis an den Shader übergeben.
  gl.uniformMatrix4fv(prog.mvMatrix, false, mv);
      gl.uniform3fv(prog.baseColor,new Float32Array(m.color));
      gl.bindBuffer(gl.ARRAY_BUFFER,m.vboPos);
      gl.enableVertexAttribArray(prog.pos);
      gl.vertexAttribPointer(prog.pos,3,gl.FLOAT,false,0,0);
      gl.bindBuffer(gl.ARRAY_BUFFER,m.vboNormal);
      gl.enableVertexAttribArray(prog.normal);
      gl.vertexAttribPointer(prog.normal,3,gl.FLOAT,false,0,0);
      if(!m.isGrid){
        gl.uniform1i(prog.wire,false);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,m.iboTris);
        gl.drawElements(gl.TRIANGLES,m.indicesTris.length,gl.UNSIGNED_SHORT,0);
      }
      if(showWire || m.isGrid){
        gl.uniform1i(prog.wire,!m.isGrid);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,m.iboLines);
        gl.drawElements(gl.LINES,m.indicesLines.length,gl.UNSIGNED_SHORT,0);
      }
    });
    document.getElementById('status').textContent='Kamera: Radius '+camera.distance.toFixed(2)+' · Höhe '+camera.height.toFixed(2)+' · Winkel '+((camera.zAngle*180/Math.PI%360+360)%360).toFixed(0)+'°';
  }
  function start(){
    try{initWebGL();initModels();initEventHandler();updateSphere();}
    catch(err){console.error(err);document.getElementById('status').textContent='Fehler: '+err.message;}
  }
  return {start:start};
}());
window.addEventListener('DOMContentLoaded',app.start);
