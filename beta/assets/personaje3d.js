/* Punto Ciego · personaje 3D.
   - UN solo contexto WebGL para toda la app (avatares, menú, editor, revelado…).
   - Las vistas vivas se copian a canvas 2D normales; los avatares salen como data: URL (nunca blob:).
   - El bucle de dibujo solo corre si hay una vista 3D visible y la pestaña está activa.
   - Las zonas (capucha, cara, ojos, guantes, ropa) y los estampados se calculan con la POSICIÓN EN
     REPOSO (atributo aR): el esqueleto deforma aR en el shader (skinning) para dibujar, pero los
     colores nunca se mueven de sitio con la pose.
   - Esqueleto: 10 huesos (ver HUESOS), 2 por vértice con reparto de peso (aBI/aBW), calculados en
     fuentes/herramientas/generar_modelo.py por distancia geodésica sobre la malla + varias reglas
     por zona (cara/ojos rígidos a Head, capucha a Head/Hips, mochila rígida a Hips, sudadera con el
     peso del brazo atenuado cerca del torso) para que no se rasgue al mover un brazo del todo. La
     jerarquía y las posiciones de reposo están descritas también en fuentes/esqueleto.json (fuente
     de verdad para la herramienta de posado); si se toca el rig hay que tocar los dos sitios.
   - El skinning es por CUATERNIONES DUALES (uQR/uQD), no por matrices: mezclar matrices de piel en
     giros grandes (p.ej. un brazo levantado del todo) las "encoge" y la malla se ve rota/dentada
     (el clásico "candy-wrapper" del skinning lineal); los cuaterniones duales no tienen ese problema.
   API:  PJ.usa() · PJ.estado ('sin'|'cargando'|'listo'|'fallo') · PJ.onCambio
         PJ.avatar(vista, look, estado, anchoCss) -> data:URL | null
         PJ.aplica() (monta/actualiza los <canvas data-v>) · PJ.config({...})
         PJ.HUESOS · PJ.calculaHuesos(pose) -> {qr,qd} Float32Array(10*4) cada uno, para uQR/uQD     */
(function(G){
'use strict';
const PJ={estado:'sin',onCambio:null,cfg:{antialias:true,bin:'assets/personaje.bin?v=6'}};
G.PJ=PJ;

/* ---------- esqueleto: mismo orden e índices que fuentes/esqueleto.json (y que generar_modelo.py) ---------- */
const HUESOS=[
  {n:'Hips',p:-1,j:[0,-0.30,-0.02]},
  {n:'Head',p:0,j:[0,0.22,0.02]},
  {n:'LeftArm',p:0,j:[-0.40,0.24,-0.08]},
  {n:'LeftForeArm',p:2,j:[-0.45,-0.09,-0.01]},
  {n:'RightArm',p:0,j:[0.40,0.24,-0.08]},
  {n:'RightForeArm',p:4,j:[0.45,-0.09,-0.01]},
  {n:'LeftUpLeg',p:0,j:[-0.19,-0.30,-0.02]},
  {n:'LeftLeg',p:6,j:[-0.19,-0.515,0.02]},
  {n:'RightUpLeg',p:0,j:[0.19,-0.30,-0.02]},
  {n:'RightLeg',p:8,j:[0.19,-0.515,0.02]}
];
PJ.HUESOS=HUESOS;
const NB=HUESOS.length;

/* ---------- shaders ---------- */
const VS=`
attribute vec3 aR;   // posición en REPOSO (estampados y punto de partida del skinning)
attribute float aZ;  // zona de este vértice (1 sudadera, 2 capucha, 3 cara, 4 ojos, 5 guantes, 6 pantalón, 7 mochila y correas, 8 zapatillas)
attribute vec4 aN;   // normal (xyz) y oclusión ambiental (w), en reposo
attribute vec2 aBI;  // índices de los 2 huesos con más peso en este vértice
attribute float aBW; // peso del primero (aBI.x); el segundo se lleva el resto (1-aBW)
uniform mat4 uMV; uniform mat4 uProj; uniform mat3 uNM; uniform vec3 uExt;
uniform vec4 uQR[${NB}]; uniform vec4 uQD[${NB}];   // piel por cuaterniones duales: parte real (giro) y dual (con la traslación)
varying vec3 vN; varying vec3 vR; varying vec3 vNo; varying float vAO; varying vec3 vV; varying float vZ;
// gira v por un cuaternión unitario (u,w)
vec3 qrot(vec4 q,vec3 v){ return v+2.0*cross(q.xyz,cross(q.xyz,v)+q.w*v); }
void main(){
  vec4 qr0=uQR[int(aBI.x)],qd0=uQD[int(aBI.x)],qr1=uQR[int(aBI.y)],qd1=uQD[int(aBI.y)];
  if(dot(qr0,qr1)<0.0){ qr1=-qr1; qd1=-qd1; }   // mismo lado de la doble cobertura: si no, el promedio se cancela
  vec4 qr=qr0*aBW+qr1*(1.0-aBW), qd=qd0*aBW+qd1*(1.0-aBW);
  float qlen=length(qr); qr/=qlen; qd/=qlen;   // combinación lineal de cuaterniones duales (skinning), normalizada
  vec3 rp=aR*uExt; vR=rp; vZ=aZ;   // la malla está cortada por zonas: cada vértice pertenece a una sola, sin mezcla por interpolación
  vec3 t=2.0*(qr.w*qd.xyz-qd.w*qr.xyz+cross(qr.xyz,qd.xyz));
  vec3 p=qrot(qr,rp)+t;
  vec3 n0=aN.xyz*2.0-1.0, n=qrot(qr,n0);   // la normal gira con el hueso (mismo reparto que la posición)
  vN=uNM*n; vNo=n0; vAO=aN.w;
  vec4 v=uMV*vec4(p,1.0); vV=v.xyz;
  gl_Position=uProj*v;
}`;
const FS=`
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec3 vN; varying vec3 vR; varying vec3 vNo; varying float vAO; varying vec3 vV; varying float vZ;
uniform vec3 uCloth,uPants,uShoes,uPack,uHood,uFace,uEye,uGlove,uRimC; uniform float uPat,uPatP,uGray,uAlpha,uRimK,uMask,uAoK; uniform mat3 uNM;
#ifdef DERIV
float fw1(float x){return fwidth(x);}
#else
float fw1(float x){return 0.02;}
#endif
vec3 lin(vec3 c){return pow(c,vec3(2.2));}
float hash(vec3 p){p=fract(p*0.3183099+vec3(.1,.2,.3));p*=17.0;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
float vnoise(vec3 x){vec3 i=floor(x),f=fract(x);f=f*f*(3.0-2.0*f);
  return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);}
// onda cuadrada con borde suavizado por el tamaño del píxel: 0 en las casillas pares, 1 en las impares (bordes en los enteros)
float onda(float f){ float w=min(fw1(f),0.6); float s=0.5-0.5*clamp(sin(3.14159265*f)/(3.14159265*w*0.9+1e-4),-1.0,1.0); return mix(s,0.5,smoothstep(0.35,0.8,w)); }
// estampado pegado al objeto (coordenadas en reposo): id 0 liso, 1 rayas, 2 cuadros, 3 camuflaje. Con antialiasing: sin dientes al verse pequeño
float estampado(float id,vec3 P,vec3 vNo){
  if(id<0.5)return 1.0;
  if(id<1.5)return mix(1.0,0.6,onda(P.y*26.0));
  if(id<2.5){ vec3 a=abs(vNo); vec2 uv=((a.z>=a.x&&a.z>=a.y)?P.xy:((a.x>=a.y)?P.zy:P.xz))*19.0; float sx=onda(uv.x),sy=onda(uv.y); return mix(1.0,0.62,sx+sy-2.0*sx*sy); }
  float q=vnoise(P*7.0)*0.65+vnoise(P*15.0+7.0)*0.35; float w=min(fw1(q)*0.8,0.06)+0.003;
  return mix(mix(1.04,0.8,smoothstep(0.42-w,0.42+w,q)),0.5,smoothstep(0.62-w,0.62+w,q));
}
void main(){
  vec3 n=normalize(vN); vec3 V=normalize(-vV); vec3 P=vR;
  float z=floor(vZ+0.5);
  if(uMask>0.5){ gl_FragColor=vec4(vec3(z*30.0/255.0),1.0); return; }
  float mH=step(abs(z-2.0),0.5), mF=step(abs(z-3.0),0.5), mE=step(abs(z-4.0),0.5), mG=step(abs(z-5.0),0.5);
  float mPn=step(abs(z-6.0),0.5), mPk=step(abs(z-7.0),0.5), mSh=step(abs(z-8.0),0.5);
  // la cara es una esfera lisa: su normal exacta evita reflejos rotos por el ruido de la malla
  n=normalize(mix(n,normalize(uNM*normalize(P-vec3(0.0,0.44,-0.017))),mF));
  float tS=estampado(uPat,P,vNo), tP=estampado(uPatP,P,vNo);
  float grain=vnoise(P*260.0)*0.5+vnoise(P*95.0)*0.5; float gr=0.94+0.12*grain;
  vec3 alb=uCloth*tS;
  alb=mix(alb,uPants*tP,mPn); alb=mix(alb,uShoes,mSh); alb=mix(alb,uPack,mPk);   // mochila y zapatillas siempre lisas
  alb=mix(alb,uHood,mH); alb=mix(alb,uFace,mF); alb=mix(alb,uEye,mE); alb=mix(alb,uGlove,mG);
  float isFace=mF, isEye=mE, isGlove=mG, isHood=mH;
  vec3 Lk=normalize(vec3(-0.55,0.75,0.65)), Lf=normalize(vec3(0.85,0.15,0.45)), Lr=normalize(vec3(0.2,0.35,-1.0));
  float ao=mix(1.0,vAO,0.92*uAoK); ao=ao*ao*(3.0-2.0*ao)*0.35+ao*0.65;
  ao=mix(ao,1.0,0.40*mG);   // guantes: la oclusión bajo el puño no debe verse como una sombra gris
  float wrap=0.35;
  float dk=clamp((dot(n,Lk)+wrap)/(1.0+wrap),0.0,1.0), df=clamp((dot(n,Lf)+0.2)/1.2,0.0,1.0), dr=clamp(dot(n,Lr),0.0,1.0);
  vec3 amb=mix(vec3(0.26,0.22,0.24),vec3(0.62,0.68,0.80),n.y*0.5+0.5);
  vec3 light=amb*0.62*ao + vec3(1.0,0.93,0.84)*dk*1.05*mix(0.35,1.0,ao) + vec3(0.55,0.68,0.95)*df*0.34*ao + vec3(0.9,0.95,1.0)*dr*0.35*ao;
  vec3 col=lin(alb)*light*mix(gr,1.0,mF+mE+mG*0.6);
  float ndv=clamp(dot(n,V),0.0,1.0), fr=pow(1.0-ndv,3.0);
  col+=lin(mix(alb,vec3(1.0),0.35))*fr*0.16*ao*(1.0-isFace);
  vec3 H=normalize(Lk+V); float sp=pow(clamp(dot(n,H),0.0,1.0),isGlove>0.5?24.0:12.0);
  col+=vec3(1.0,0.97,0.92)*sp*(isGlove*0.10+isHood*0.04+(1.0-isFace-isGlove-isHood)*0.03);
  // visera: un solo brillo pequeño y definido + un reflejo de contorno muy suave
  float hl=smoothstep(0.9935,0.9975,dot(n,H));
  col+=vec3(1.0,0.98,0.95)*hl*0.95*isFace;
  col+=vec3(0.28,0.34,0.50)*fr*0.20*isFace;
  col=mix(col,lin(uEye)*(0.92+0.25*dk),isEye);
  // estados: muerto (gris) y luz de contorno (impostor: roja, fantasma: azulada)
  float lum=dot(col,vec3(0.3,0.59,0.11)); col=mix(col,vec3(lum),uGray)*mix(1.0,0.78,uGray);
  col+=uRimC*pow(1.0-ndv,2.2)*uRimK*(0.4+0.6*ao);
  col=col/(1.0+col*0.16)*1.06;
  vec3 o=pow(clamp(col,0.0,1.0),vec3(1.0/2.2));
  gl_FragColor=vec4(o*uAlpha,uAlpha);
}`;

/* ---------- matrices (columna-mayor) ---------- */
const I4=()=>new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);
function mul(a,b){const o=new Float32Array(16);for(let c=0;c<4;c++)for(let r=0;r<4;r++){let s=0;for(let k=0;k<4;k++)s+=a[k*4+r]*b[c*4+k];o[c*4+r]=s}return o}
const T=(x,y,z)=>{const m=I4();m[12]=x;m[13]=y;m[14]=z;return m};
const Sc=(x,y,z)=>{const m=I4();m[0]=x;m[5]=y;m[10]=z;return m};
const RY=a=>{const c=Math.cos(a),s=Math.sin(a),m=I4();m[0]=c;m[2]=-s;m[8]=s;m[10]=c;return m};
const RX=a=>{const c=Math.cos(a),s=Math.sin(a),m=I4();m[5]=c;m[6]=s;m[9]=-s;m[10]=c;return m};
const RZ=a=>{const c=Math.cos(a),s=Math.sin(a),m=I4();m[0]=c;m[1]=s;m[4]=-s;m[5]=c;return m};
function persp(fovy,asp,n,f){const t=1/Math.tan(fovy/2);return new Float32Array([t/asp,0,0,0, 0,t,0,0, 0,0,(f+n)/(n-f),-1, 0,0,2*f*n/(n-f),0]);}

/* ---------- cuaterniones (piel por cuaterniones duales: sin el "efecto caramelo" de mezclar
   matrices en giros grandes, que es lo que pasaba al levantar un brazo del todo) ---------- */
function matAquat(m){   // rotación (3x3 de un mat4 columna-mayor) -> cuaternión [x,y,z,w]
  const m00=m[0],m10=m[1],m20=m[2],m01=m[4],m11=m[5],m21=m[6],m02=m[8],m12=m[9],m22=m[10];
  const tr=m00+m11+m22; let x,y,z,w;
  if(tr>0){const S=Math.sqrt(tr+1)*2;w=0.25*S;x=(m21-m12)/S;y=(m02-m20)/S;z=(m10-m01)/S}
  else if(m00>m11&&m00>m22){const S=Math.sqrt(1+m00-m11-m22)*2;w=(m21-m12)/S;x=0.25*S;y=(m01+m10)/S;z=(m02+m20)/S}
  else if(m11>m22){const S=Math.sqrt(1+m11-m00-m22)*2;w=(m02-m20)/S;x=(m01+m10)/S;y=0.25*S;z=(m12+m21)/S}
  else{const S=Math.sqrt(1+m22-m00-m11)*2;w=(m10-m01)/S;x=(m02+m20)/S;y=(m12+m21)/S;z=0.25*S}
  return [x,y,z,w];
}
function qmul(a,b){const[ax,ay,az,aw]=a,[bx,by,bz,bw]=b;
  return [aw*bx+ax*bw+ay*bz-az*by, aw*by-ax*bz+ay*bw+az*bx, aw*bz+ax*by-ay*bx+az*bw, aw*bw-ax*bx-ay*by-az*bz];
}
const QID=[0,0,0,1];

/* ---------- esqueleto: de una pose (ángulos por hueso) a los cuaterniones duales de piel (uQR/uQD) ----------
   pose: {NombreHueso:{rx,ry,rz}} en radianes, rotación alrededor del propio nudo, encadenada con la del
   padre (si el torso se inclina, el brazo se inclina con él). Sin pose (o hueso sin entrada) = reposo. */
function calculaHuesos(pose){
  const qr=new Float32Array(HUESOS.length*4),qd=new Float32Array(HUESOS.length*4),wr=[],wj=[];
  for(let i=0;i<HUESOS.length;i++){
    const h=HUESOS[i],r=(pose&&pose[h.n])||null;
    const L=r?mul(RZ(r.rz||0),mul(RY(r.ry||0),RX(r.rx||0))):I4();
    const pr=h.p<0?null:wr[h.p], pj=h.p<0?[0,0,0]:wj[h.p], pJoint=h.p<0?[0,0,0]:HUESOS[h.p].j;
    const R=pr?mul(pr,L):L;
    const off=[h.j[0]-pJoint[0],h.j[1]-pJoint[1],h.j[2]-pJoint[2]];
    const ro=pr?[pr[0]*off[0]+pr[4]*off[1]+pr[8]*off[2],pr[1]*off[0]+pr[5]*off[1]+pr[9]*off[2],pr[2]*off[0]+pr[6]*off[1]+pr[10]*off[2]]:off;
    const j=[pj[0]+ro[0],pj[1]+ro[1],pj[2]+ro[2]];
    wr[i]=R;wj[i]=j;
    // t = j - R*h.j (la traslación de la misma matriz de piel T(j)*R*T(-h.j), pero en cuaternión dual)
    const hj=h.j, Rhj=[R[0]*hj[0]+R[4]*hj[1]+R[8]*hj[2],R[1]*hj[0]+R[5]*hj[1]+R[9]*hj[2],R[2]*hj[0]+R[6]*hj[1]+R[10]*hj[2]];
    const t=[j[0]-Rhj[0],j[1]-Rhj[1],j[2]-Rhj[2]];
    const q=matAquat(R), d=qmul([t[0],t[1],t[2],0],q).map(v=>v*0.5);
    qr.set(q,i*4); qd.set(d,i*4);
  }
  return {qr,qd};
}
PJ.calculaHuesos=calculaHuesos;
const HUESOS_REPOSO=(()=>{
  const qr=new Float32Array(HUESOS.length*4),qd=new Float32Array(HUESOS.length*4);
  for(let i=0;i<HUESOS.length;i++)qr.set(QID,i*4);
  return {qr,qd};
})();
/* ---------- poses guardadas (fuentes/posador/poses.json, horneadas aquí en radianes) ----------
   Cada entrada es {Hueso:[rx,ry,rz]}; se expande a {Hueso:{rx,ry,rz}} una vez, al cargar, para que
   calculaHuesos(pose) las use sin más cambios. Si se repinta el modelo o se retocan poses en el
   posador, hay que volver a generar este bloque (fuentes/posador/poses.json -> grados a radianes). */
const POSES=(()=>{
  const RAD={"sentado":{"Head":[0.1745,0.0,0.0],"RightArm":[0.1745,0.0,-0.1396],"RightForeArm":[0.6981,0.1745,0.0],"LeftUpLeg":[-0.6109,0.0,0.0],"LeftLeg":[0.7854,0.0,0.0],"RightUpLeg":[-0.6109,0.0,0.0],"RightLeg":[0.7854,0.0,0.0]},"tumbado":{"Head":[0.2618,0.0,0.2094],"LeftArm":[0.0,0.0,0.2618],"LeftForeArm":[0.2618,0.0,0.0],"RightArm":[0.0,0.0,-0.2618],"RightForeArm":[0.2618,0.0,0.0],"LeftUpLeg":[0.2094,0.0,0.0],"LeftLeg":[0.2618,0.0,0.0],"RightUpLeg":[-0.1396,0.0,0.0],"RightLeg":[0.2094,0.0,0.0]},"cuchillo_lado":{"Hips":[0.0,0.2094,0.0],"Head":[0.0,-0.2618,0.0],"RightArm":[0.1745,0.0,-0.2618],"RightForeArm":[0.2618,0.1745,0.0]},"lupa_cara":{"Head":[0.1396,0.0,0.0],"RightArm":[-0.9599,0.0,-0.1745],"RightForeArm":[1.9199,0.0,0.0]},"saludo":{"Hips":[0.0,0.2618,0.0],"Head":[-0.1396,0.0,0.0],"LeftArm":[-0.1396,0.0,0.1396],"RightArm":[-0.1396,0.0,-0.1396],"LeftUpLeg":[-0.2618,0.0,0.0],"LeftLeg":[0.3142,0.0,0.0],"RightUpLeg":[-0.2618,0.0,0.0],"RightLeg":[0.3142,0.0,0.0]},"reposo":{},"acechando":{"Hips":[0.3491,0.0,0.0],"Head":[-0.2618,0.0,0.0],"LeftArm":[-0.2618,0.0,0.1745],"LeftForeArm":[0.5236,0.0,0.0],"RightArm":[-0.2618,0.0,-0.1745],"RightForeArm":[0.5236,0.0,0.0]},"con_movil":{"Head":[0.2094,0.0,0.0],"RightArm":[0.2618,0.0,-0.1745],"RightForeArm":[1.309,0.0,0.0]},"agachado":{"Hips":[0.1745,0.0,0.0],"LeftArm":[-0.1745,0.0,0.0],"LeftForeArm":[0.2618,0.0,0.0],"RightArm":[-0.1745,0.0,0.0],"RightForeArm":[0.2618,0.0,0.0],"LeftUpLeg":[-0.6109,0.0,0.0],"LeftLeg":[0.9599,0.0,0.0],"RightUpLeg":[-0.6109,0.0,0.0],"RightLeg":[0.9599,0.0,0.0]},"caminando":{"Hips":[0.0873,0.0,0.0],"LeftArm":[0.1745,0.0,0.0],"RightArm":[-0.1745,0.0,0.0],"LeftUpLeg":[-0.2094,0.0,0.0],"LeftLeg":[0.0873,0.0,0.0],"RightUpLeg":[0.1745,0.0,0.0],"RightLeg":[0.2094,0.0,0.0]},"corriendo":{"Hips":[0.1396,0.0,0.0],"LeftArm":[0.2443,0.0,0.0],"RightArm":[-0.2443,0.0,0.0],"LeftUpLeg":[-0.2443,0.0,0.0],"LeftLeg":[0.2618,0.0,0.0],"RightUpLeg":[0.2094,0.0,0.0],"RightLeg":[0.1396,0.0,0.0]},"saltando":{"Hips":[0.0,0.4363,0.0],"Head":[-0.1396,0.0,0.0],"LeftArm":[-0.1396,0.0,0.1396],"RightArm":[-0.1396,0.0,-0.1396],"LeftUpLeg":[-0.6109,0.0,0.0],"LeftLeg":[0.9599,0.0,0.0],"RightUpLeg":[-0.6109,0.0,0.0],"RightLeg":[0.9599,0.0,0.0]}};
  const out={};
  for(const k in RAD){const o={};for(const h in RAD[k]){const a=RAD[k][h];o[h]={rx:a[0],ry:a[1],rz:a[2]}}out[k]=o}
  return out;
})();
PJ.POSES=POSES;
function hex(h,d){ if(!h) return d; h=String(h).replace('#',''); if(h.length===3)h=h.replace(/./g,'$&$&'); return [parseInt(h.slice(0,2),16)/255,parseInt(h.slice(2,4),16)/255,parseInt(h.slice(4,6),16)/255]; }

/* ---------- WebGL compartido ---------- */
const GL={cv:null,gl:null,prog:null,U:null,A:null,vb:null,ib:null,n:0,ext:[1,1,1],buf:null,perdido:false};
const FEET=-0.951;
function creaGL(){
  const cv=GL.cv||(GL.cv=document.createElement('canvas'));
  const gl=cv.getContext('webgl',{alpha:true,premultipliedAlpha:true,antialias:PJ.cfg.antialias,depth:true,preserveDrawingBuffer:false,powerPreference:'low-power'})
        ||cv.getContext('experimental-webgl',{alpha:true,premultipliedAlpha:true,antialias:PJ.cfg.antialias,preserveDrawingBuffer:false});
  if(!gl)throw new Error('sin WebGL');
  GL.gl=gl;GL.lose=gl.getExtension('WEBGL_lose_context');
  const sh=(t,s)=>{const o=gl.createShader(t);gl.shaderSource(o,s);gl.compileShader(o);if(!gl.getShaderParameter(o,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(o));return o};
  // antialiasing del estampado con derivadas de pantalla (fwidth); si el dispositivo no las ofrece, se compila sin ellas
  const crea=der=>{const p=gl.createProgram();gl.attachShader(p,sh(gl.VERTEX_SHADER,VS));gl.attachShader(p,sh(gl.FRAGMENT_SHADER,(der?'#extension GL_OES_standard_derivatives : enable\n#define DERIV 1\n':'')+FS));gl.linkProgram(p);
    if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(p));return p};
  let pr;try{pr=gl.getExtension('OES_standard_derivatives')?crea(true):crea(false)}catch(e){console.warn('PJ: sin derivadas',e);pr=crea(false)}
  GL.prog=pr;gl.useProgram(pr);
  GL.U={};['uMV','uProj','uNM','uExt','uCloth','uPants','uShoes','uPack','uPatP','uHood','uFace','uEye','uGlove','uRimC','uPat','uGray','uAlpha','uRimK','uMask','uAoK'].forEach(k=>GL.U[k]=gl.getUniformLocation(pr,k));
  GL.U.uQR=gl.getUniformLocation(pr,'uQR[0]');GL.U.uQD=gl.getUniformLocation(pr,'uQD[0]');
  GL.A={aR:gl.getAttribLocation(pr,'aR'),aN:gl.getAttribLocation(pr,'aN'),aZ:gl.getAttribLocation(pr,'aZ'),aBI:gl.getAttribLocation(pr,'aBI'),aBW:gl.getAttribLocation(pr,'aBW')};
  if(GL.buf)subeMalla();   // al restaurar el contexto la malla ya está descargada
}
function subeMalla(){
  const gl=GL.gl,buf=GL.buf,dv=new DataView(buf);
  if(dv.getUint32(0,true)!==0x325A4A50)throw new Error('modelo no válido');   // 'PJZ2': 16 B/vértice (añade 2 huesos + peso)
  const nV=dv.getUint32(4,true),nI=dv.getUint32(8,true);
  GL.ext=[dv.getFloat32(16,true),dv.getFloat32(20,true),dv.getFloat32(24,true)];
  const off=32;
  GL.vb=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,GL.vb);gl.bufferData(gl.ARRAY_BUFFER,new Uint8Array(buf,off,nV*16),gl.STATIC_DRAW);
  GL.ib=gl.createBuffer();gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,GL.ib);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,new Uint16Array(buf.slice(off+nV*16,off+nV*16+nI*2)),gl.STATIC_DRAW);
  GL.n=nI;
}
let errores=0;
function fallaDibujo(e){console.warn('PJ dibujo',e);if(++errores>=3&&PJ.estado==='listo'){PJ.estado='fallo';notifica()}}
function notifica(){try{PJ.onCambio&&PJ.onCambio(PJ.estado)}catch(e){console.warn('PJ.onCambio',e)}}

PJ.config=o=>Object.assign(PJ.cfg,o||{});
/* Solo para pruebas: simula la pérdida y la vuelta del contexto (iPhone lo hace al ir a segundo plano). */
PJ.simulaPerdida=(volver)=>{const e=GL.lose;if(!e)return false;volver?e.restoreContext():e.loseContext();return true};
let cargando=null;
PJ.usa=function(){
  if(cargando)return cargando;
  PJ.estado='cargando';
  cargando=(async()=>{
    try{
      creaGL();
      GL.cv.addEventListener('webglcontextlost',e=>{e.preventDefault();GL.perdido=true});
      GL.cv.addEventListener('webglcontextrestored',()=>{
        try{creaGL();GL.perdido=false;notifica();arranca()}catch(err){console.warn('PJ restaura',err);PJ.estado='fallo';notifica()}
      });
      const r=await fetch(PJ.cfg.bin);if(!r.ok)throw new Error('modelo '+r.status);
      GL.buf=await r.arrayBuffer();
      subeMalla();
      PJ.estado='listo';
    }catch(e){console.warn('PJ: sin 3D',e);PJ.estado='fallo'}
    notifica();arranca();
    return PJ.estado==='listo';
  })();
  return cargando;
};

/* ---------- dibujo ---------- */
/* p: yaw,pitch,roll,x,y,sx,sy,alpha,gray,rim ('rojo'|'azul'|null),huesos ({qr,qd} ya calculado) o
   pose (ángulos por hueso, ver calculaHuesos; se recalcula cada llamada, para pocos huesos es barato)
   ·  c: zoom,vy,cx,cp */
function dibuja(w,h,p,c,look){
  const gl=GL.gl;if(!gl||GL.perdido||gl.isContextLost()||PJ.estado!=='listo')return false;
  const cv=GL.cv;if(cv.width!==w||cv.height!==h){cv.width=w;cv.height=h}
  gl.viewport(0,0,w,h);gl.useProgram(GL.prog);
  gl.disable(gl.BLEND);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
  gl.enable(gl.DEPTH_TEST);gl.enable(gl.CULL_FACE);gl.cullFace(gl.BACK);
  const fov=22*Math.PI/180,asp=w/h,z=c.zoom||1;
  const dist=Math.max(1.98/2/Math.tan(fov/2),0.66/(Math.tan(fov/2)*asp))/z;
  const sx=p.sx||1,sy=p.sy||1;
  // pie del modelo fijo al suelo aunque se aplaste o se estire
  let M=mul(T(p.x||0,(p.y||0)+FEET*(1-sy),0),mul(RX(p.pitch||0),mul(RY(p.yaw||0),Sc(sx,sy,sx))));
  if(p.roll){ // caída de lado: gira sobre el borde del pie
    const px=0.56,R=mul(T(px,FEET,0),mul(RZ(p.roll),T(-px,-FEET,0)));
    M=mul(T(p.tx||0,0,0),mul(R,M));
  }
  const MV=mul(T(0,0,-dist),mul(RX(c.cp||0),mul(T(-(c.cx||0),-(c.vy||0),0),M)));
  const NM=new Float32Array([MV[0],MV[1],MV[2],MV[4],MV[5],MV[6],MV[8],MV[9],MV[10]]);
  const U=GL.U;
  gl.uniformMatrix4fv(U.uMV,false,MV);gl.uniformMatrix4fv(U.uProj,false,persp(fov,asp,0.5,30));gl.uniformMatrix3fv(U.uNM,false,NM);
  gl.uniform3fv(U.uExt,GL.ext);
  const L=look||{};
  const tela=(c,pat)=>c?hex(c):(pat?[0.26,0.26,0.28]:[0.075,0.075,0.085]);   // negro liso; con estampado, un gris para que se note
  const patS=L.pat|0,patP=L.patP===undefined?patS:(L.patP|0);
  const cl=tela(L.cloth,patS),cp=L.pants===undefined?tela(L.cloth,patP):tela(L.pants,patP);
  gl.uniform3fv(U.uCloth,cl);gl.uniform3fv(U.uPants,cp);
  gl.uniform3fv(U.uPack,L.pack===undefined?tela(L.cloth,0):tela(L.pack,0));
  gl.uniform3fv(U.uShoes,L.shoes===undefined?(L.pants===undefined?tela(L.cloth,0):tela(L.pants,0)):tela(L.shoes,0));
  gl.uniform1f(U.uPatP,patP);gl.uniform3fv(U.uHood,hex(L.hood,[0.95,0.93,0.89]));gl.uniform3fv(U.uFace,[0.03,0.03,0.04]);
  gl.uniform3fv(U.uEye,hex(L.eye,[0.98,0.98,0.97]));gl.uniform3fv(U.uGlove,hex(L.glove,[0.93,0.92,0.9]));
  gl.uniform1f(U.uPat,patS);
  gl.uniform1f(U.uAoK,PJ.aoK==null?1:PJ.aoK);gl.uniform1f(U.uGray,p.gray||0);gl.uniform1f(U.uAlpha,p.alpha==null?1:p.alpha);gl.uniform1f(U.uMask,PJ.mascara?1:0);
  const rim=p.rim==='rojo'?[1.0,0.16,0.10]:p.rim==='azul'?[0.35,0.6,1.0]:[0,0,0];
  gl.uniform3fv(U.uRimC,rim);gl.uniform1f(U.uRimK,p.rim?(p.rim==='rojo'?1.15:0.9):0);
  const huesos=p.huesos||(p.pose?calculaHuesos(p.pose):HUESOS_REPOSO);
  gl.uniform4fv(U.uQR,huesos.qr);gl.uniform4fv(U.uQD,huesos.qd);
  gl.bindBuffer(gl.ARRAY_BUFFER,GL.vb);
  gl.enableVertexAttribArray(GL.A.aR);gl.vertexAttribPointer(GL.A.aR,3,gl.SHORT,true,16,0);
  gl.enableVertexAttribArray(GL.A.aZ);gl.vertexAttribPointer(GL.A.aZ,1,gl.UNSIGNED_BYTE,false,16,6);
  gl.enableVertexAttribArray(GL.A.aN);gl.vertexAttribPointer(GL.A.aN,4,gl.UNSIGNED_BYTE,true,16,8);
  gl.enableVertexAttribArray(GL.A.aBI);gl.vertexAttribPointer(GL.A.aBI,2,gl.UNSIGNED_BYTE,false,16,12);
  gl.enableVertexAttribArray(GL.A.aBW);gl.vertexAttribPointer(GL.A.aBW,1,gl.UNSIGNED_BYTE,true,16,14);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,GL.ib);gl.drawElements(gl.TRIANGLES,GL.n,gl.UNSIGNED_SHORT,0);
  return true;
}

/* ---------- vistas estáticas (avatares y poses) ---------- */
const VISTAS={
  cabeza:{ar:1,p:{yaw:.35,pitch:.05},c:{zoom:1.6,vy:.36}},
  frente:{ar:.68,p:{yaw:0,pitch:.02},c:{zoom:.96}},
  tresq:{ar:.68,p:{yaw:.6,pitch:.03},c:{zoom:.96}},
  lado:{ar:.68,p:{yaw:1.45,pitch:.03},c:{zoom:.96}},
  espalda:{ar:.68,p:{yaw:3.14,pitch:.03},c:{zoom:.96}},
  movil:{ar:.68,p:{yaw:.45,pitch:.04},c:{zoom:.96}},
  camina:{ar:.68,p:{yaw:.95,pitch:.03,y:.02},c:{zoom:.96}},
  corre:{ar:.68,p:{yaw:1.1,pitch:.13,y:.05},c:{zoom:.9}},
  salta:{ar:.68,p:{yaw:.4,pitch:.02,y:.16,sy:1.03,sx:.98},c:{zoom:.9}},
  sentado:{ar:.68,p:{yaw:.45,pitch:.04,sy:.8,sx:1.06},c:{zoom:.96}},
  agachado:{ar:.68,p:{yaw:.5,pitch:.05,sy:.74,sx:1.08},c:{zoom:.96}},
  feliz:{ar:.68,p:{yaw:.35,pitch:.02,y:.05},c:{zoom:.94}}
};
PJ.VISTAS=VISTAS;
/* resolución real de la pantalla (devicePixelRatio) con tope en 3 para no gastar de más; los avatares nunca bajan de 2x */
const DPR_MAX=3, dprReal=()=>Math.min(G.devicePixelRatio||1,DPR_MAX), dprAvatar=()=>Math.max(2,dprReal());
const cubo=n=>n<=96?96:n<=144?144:n<=192?192:n<=256?256:n<=340?340:n<=420?420:512;
function estadoP(est,p){
  p=Object.assign({},p);
  if(est==='gris')p.gray=1;
  else if(est==='rojo')p.rim='rojo';
  else if(est==='fantasma'){p.alpha=.6;p.gray=.55;p.rim='azul';p.y=(p.y||0)+.05}
  return p;
}
/* Devuelve una data: URL (PNG con transparencia) o null si aún no se puede dibujar. */
PJ.avatar=function(vista,look,est,anchoCss){
  const V=VISTAS[vista];if(!V)return null;
  if(PJ.estado==='sin'){PJ.usa();return null}
  if(PJ.estado!=='listo')return null;
  const w=cubo(Math.round((anchoCss||(vista==='cabeza'?48:150))*dprAvatar())),h=Math.round(w/V.ar);
  try{
    if(!dibuja(w,h,estadoP(est,V.p),V.c,look))return null;
    return GL.cv.toDataURL('image/png');
  }catch(e){fallaDibujo(e);return null}
};
/* Render libre con una vista a medida ({ar,p,c}); útil para pruebas y herramientas. */
PJ.render=function(V,look,est,w){
  if(PJ.estado!=='listo')return null;
  const h=Math.round(w/V.ar);
  try{return dibuja(w,h,estadoP(est,V.p),V.c,look)?GL.cv.toDataURL('image/png'):null}catch(e){return null}
};
/* Como PJ.render, pero deja el resultado en PJ.lienzo() en vez de codificarlo a PNG (para dibujar cada
   fotograma mientras se arrastra un hueso en la herramienta de posado, sin el coste de toDataURL). */
PJ.dibujaCruda=function(V,look,est,w){
  if(PJ.estado!=='listo')return false;
  const h=Math.round(w/V.ar);
  try{return dibuja(w,h,estadoP(est,V.p),V.c,look)}catch(e){return false}
};
PJ.tamano=(vista,anchoCss)=>{const V=VISTAS[vista];if(!V)return null;const w=cubo(Math.round((anchoCss||150)*dprAvatar()));return {w,h:Math.round(w/V.ar)}};
/* Solo para la herramienta de posado: el <canvas> WebGL en sí (tras un dibuja/render), para copiarlo con drawImage
   sin pasar por toDataURL en cada fotograma mientras se arrastra un hueso. */
PJ.lienzo=()=>GL.cv;

/* ---------- animaciones (todas del cuerpo entero, algunas ya terminan en una pose de esqueleto) ---------- */
const RM=G.matchMedia?G.matchMedia('(prefers-reduced-motion: reduce)'):{matches:false};
const ease=t=>t<0?0:t>1?1:1-Math.pow(1-t,3);
/* mezcla lineal desde reposo (todo 0) hasta `pose`, en la fracción f (0..1) -- para que los miembros
   vayan entrando en una pose de esqueleto MIENTRAS avanza una animación de cuerpo entero (p.ej. las
   piernas y brazos de "tumbado" acomodándose según el personaje cae, no de golpe al final). */
function mezclaPose(pose,f){
  if(f<=0)return null;
  const o={};
  for(const h in pose){const r=pose[h];o[h]={rx:r.rx*f,ry:r.ry*f,rz:r.rz*f}}
  return o;
}
const ANIM={
  /* respiración y balanceo suave */
  reposo(v,t,rm){
    if(rm)return {p:{yaw:v.yaw},fin:true};
    const b=Math.sin(t*2.0),sw=v.arrastra||Math.abs(v.vel)>.02?0:1;
    return {p:{yaw:v.yaw+sw*.1*Math.sin(t*.8),roll:0,sy:1+.014*b,sx:1-.007*b,pitch:.02+.01*Math.sin(t*.8+1)},fin:false};
  },
  /* revelar: giro rápido y rebote */
  giro(v,t,rm){
    const dur=1.15,u=Math.min(1,t/dur),fin=rm||t>dur+1.1;
    if(rm)return {p:{yaw:.15},fin:true};
    const yaw=Math.PI*(1-ease(u))*3+.15*ease(u);      // 1,5 vueltas y queda de frente
    const tb=Math.max(0,t-dur*.82),y=.2*Math.abs(Math.sin(tb*6.5))*Math.exp(-tb*3.4);
    const land=tb>0?Math.max(0,1-Math.abs(Math.sin(tb*6.5))*1.6)*Math.exp(-tb*3.4):0;
    const p={yaw:yaw+(u>=1?.08*Math.sin((t-dur)*1.2)*ease((t-dur)/.6):0),y,sy:1-.09*land,sx:1+.05*land,pitch:.02};
    return {p,fin:false};
  },
  /* saltitos */
  salto(v,t,rm){
    if(rm)return {p:{yaw:.35,pitch:.02},fin:true};
    const per=.62,u=(t%per)/per,y=.17*4*u*(1-u);
    const sq=Math.max(0,(.14-u)/.14)+Math.max(0,(u-.9)/.1);
    return {p:{yaw:.35+.3*Math.sin(t*3.1),y,sy:1-.08*sq+.03*Math.sin(u*Math.PI),sx:1+.05*sq,pitch:.03},fin:false};
  },
  /* muerte: cae de lado y queda tumbado, en gris -- los miembros van entrando en la pose "tumbado"
     (piernas y brazos echados, ver fuentes/posador/poses.json) a la vez que el cuerpo gira, no de
     golpe al final, y el giro rígido de cuerpo entero se queda igual que antes (la caída en sí). */
  muerte(v,t,rm){
    const dur=1.3,u=Math.min(1,t/dur);
    let f=u<.72?Math.pow(u/.72,2.3):1-.05*Math.exp(-7*(u-.72))*Math.cos(26*(u-.72));
    if(rm||t>dur+.6)f=1;
    const fp=Math.max(0,Math.min(1,f));
    const p={yaw:.28,pitch:0,roll:-Math.PI/2*f,tx:-1.5*f,gray:rm?1:Math.min(1,u*1.6)};
    if(fp>0)p.pose=mezclaPose(POSES.tumbado,fp);
    return {p,fin:rm||t>dur+.6};
  },
  /* fantasma: semitransparente y flotando */
  fantasma(v,t,rm){
    const p={yaw:v.yaw+(rm?0:.16*Math.sin(t*.7)),y:rm?.06:.07+.06*Math.sin(t*1.5),alpha:.6,gray:.55,rim:'azul',pitch:.03};
    return {p,fin:rm};
  },
  /* victoria: saltitos felices (mismo resorte que "salto") que se acomodan en la pose "saludo"
     (brazos a los lados, cadera girada -- ver el pendiente de brazo levantado en NOTAS_ESQUELETO.md) */
  victoria(v,t,rm){
    const f=rm?1:Math.min(1,t/.5);
    if(rm)return {p:{yaw:.35,pitch:.02,pose:POSES.saludo},fin:true};
    const per=.7,u=(t%per)/per,y=.14*4*u*(1-u);
    const sq=Math.max(0,(.14-u)/.14)+Math.max(0,(u-.9)/.1);
    const p={yaw:.35+.1*Math.sin(t*2.1),y,sy:1-.06*sq+.02*Math.sin(u*Math.PI),sx:1+.04*sq,pitch:.02,pose:mezclaPose(POSES.saludo,f)};
    return {p,fin:false};
  },
  /* expulsado: gira y se aleja flotando, transparentándose, con el mismo tinte rojo que el revelado
     de impostor -- distinto del fantasma (que solo flota) y de la muerte (que cae): aquí se va. */
  expulsado(v,t,rm){
    const dur=1.6,u=Math.min(1,t/dur);
    if(rm)return {p:{yaw:.3,y:.12,alpha:.35,gray:.3,rim:'rojo'},fin:true};
    const e=ease(u);
    const p={yaw:.3+e*Math.PI*2.2,y:.04+.55*e,alpha:1-.68*e,gray:.3*e,rim:'rojo',pitch:.05*Math.sin(u*7),roll:0};
    return {p,fin:u>=1};
  }
};
const CAM={reposo:{zoom:.95},giro:{zoom:.92,vy:.08},salto:{zoom:.9,vy:.08},muerte:{zoom:1.3,vy:-.42,cp:.14},fantasma:{zoom:.88,vy:.05},victoria:{zoom:.9,vy:.08},expulsado:{zoom:.86,vy:.1}};

/* ---------- vistas vivas (<canvas data-v>) ---------- */
const vistas=new Map();
let raf=0,ult=0,cola=false;
function parseLook(s){const a=(s||'').split('|');const f=x=>x?'#'+x:null;return {hood:f(a[0]),cloth:f(a[1]),glove:f(a[2]),eye:f(a[3]),pat:+a[4]||0,pants:a.length>5?f(a[5]):undefined,pack:a.length>6?f(a[6]):undefined,patP:a.length>7&&a[7]!==''?+a[7]:undefined,shoes:a.length>8?f(a[8]):undefined}}
function visible(el){const r=el.getBoundingClientRect();return r.width>0&&r.height>0&&r.bottom>0&&r.top<(G.innerHeight||1e4)&&r.right>0&&r.left<(G.innerWidth||1e4)}
function pintaVista(v,ahora){
  const el=v.el;if(!el||!el.isConnected)return false;
  const t=(ahora-v.t0)/1000,rm=RM.matches;
  if(v.fin&&!v.sucio&&!v.arrastra)return false;   // pose final ya dibujada y sin cambios: no gastes GPU
  const A=(ANIM[v.anim]||ANIM.reposo)(v,t,rm);
  const p=Object.assign({},A.p);
  if(v.est==='rojo'&&!p.rim)p.rim='rojo';
  if(v.est==='gris'&&p.gray==null)p.gray=1;
  const dpr=dprReal(),w=Math.max(2,Math.round(v.w*dpr)),h=Math.max(2,Math.round(v.h*dpr));
  if(el.width!==w||el.height!==h){el.width=w;el.height=h}
  const c=Object.assign({},CAM[v.anim]||CAM.reposo,v.cam);
  try{if(!dibuja(w,h,p,c,v.look))return null}catch(e){fallaDibujo(e);return null}
  const x=v.ctx||(v.ctx=el.getContext('2d'));x.clearRect(0,0,w,h);x.drawImage(GL.cv,0,0);
  if(!v.pintado){v.pintado=true;el.parentNode&&el.parentNode.classList.add('ok')}
  v.fin=!!A.fin;v.sucio=false;
  return !A.fin;
}
function tick(ts){
  raf=0;
  if(G.document.hidden||!vistas.size||PJ.estado!=='listo')return;
  let anima=false;
  for(const [n,v] of vistas){
    if(!v.el||!v.el.isConnected){vistas.delete(n);continue}
    if(!visible(v.el))continue;
    // giro automático hacia un ángulo (p. ej. al editar la mochila se enseña la espalda)
    if(v.obj!=null&&!v.arrastra){
      const d=((v.obj-v.yaw+Math.PI)%(2*Math.PI)+2*Math.PI)%(2*Math.PI)-Math.PI;
      if(RM.matches||Math.abs(d)<.02){v.yaw+=d;v.obj=null}else v.yaw+=d*Math.min(1,Math.min(.05,(ts-ult)/1000||.016)*7);
      v.sucio=true;anima=true;
    }
    // inercia tras soltar
    if(!v.arrastra&&Math.abs(v.vel)>.02){v.yaw+=v.vel*Math.min(.05,(ts-ult)/1000||.016);v.vel*=.94;v.sucio=true;anima=true}
    const suave=(v.anim==='reposo'||v.anim==='fantasma')&&!v.arrastra&&Math.abs(v.vel)<.02&&!v.sucio;
    if(suave&&v.ult&&ts-v.ult<32){anima=true;continue}
    v.ult=ts;
    const r=pintaVista(v,ts);if(r)anima=true;
    if(v.arrastra)anima=true;
  }
  ult=ts;
  if(anima)raf=requestAnimationFrame(tick);
}
function arranca(){if(raf||G.document.hidden||!vistas.size||PJ.estado!=='listo')return;ult=performance.now();raf=requestAnimationFrame(tick)}
PJ.arranca=arranca;
/* Gira la vista viva `nombre` hasta `yaw` (rad). Con yaw=null vuelve al ángulo de antes si fue un giro automático. */
PJ.giraA=function(nombre,yaw){
  const v=vistas.get(nombre);if(!v)return;
  if(yaw!=null){if(!v.auto){v.antes=v.yaw;v.auto=true}v.obj=yaw}
  else if(v.auto){v.obj=v.antes==null?.35:v.antes;v.auto=false}
  arranca();
};
G.document&&G.document.addEventListener('visibilitychange',()=>{if(G.document.hidden){if(raf)cancelAnimationFrame(raf);raf=0}else arranca()});
if(RM.addEventListener)RM.addEventListener('change',()=>{for(const v of vistas.values()){v.t0=performance.now();v.sucio=true}arranca()});

/* Monta o actualiza los <canvas data-v> presentes en el DOM. Se llama tras cada render del HTML. */
PJ.aplica=function(){
  const els=G.document.querySelectorAll('canvas[data-v]'),vistos=new Set();
  els.forEach(el=>{
    const n=el.dataset.v;vistos.add(n);
    let v=vistas.get(n);
    const anim=el.dataset.anim||'reposo',est=el.dataset.est||'',clave=anim+'/'+est+'/'+(el.dataset.k||'');
    if(!v){v={name:n,yaw:+el.dataset.yaw||.3,vel:0,arrastra:false,t0:performance.now(),clave,pintado:false};vistas.set(n,v)}
    if(v.clave!==clave){v.clave=clave;v.t0=performance.now();v.sucio=true}
    if(v.el!==el){v.el=el;v.ctx=null;v.pintado=false;v.sucio=true;if(el.dataset.drag)enlaza(el,v)}
    if(v.lk!==el.dataset.lk){v.lk=el.dataset.lk;v.sucio=true}
    v.anim=anim;v.est=est;v.look=parseLook(el.dataset.lk);v.w=+el.dataset.w||120;v.h=+el.dataset.h||160;
    v.cam=el.dataset.zoom?{zoom:+el.dataset.zoom,vy:+el.dataset.vy||0}:null;
    el.style.width=v.w+'px';el.style.height=v.h+'px';
    if(PJ.estado==='sin')PJ.usa();
    else if(PJ.estado==='listo'&&!v.pintado)pintaVista(v,performance.now());   // dibujo síncrono: sin parpadeo tras el render
  });
  for(const n of [...vistas.keys()])if(!vistos.has(n))vistas.delete(n);
  arranca();
};
function enlaza(el,v){
  let x0=0,id=-1,tprev=0;
  el.addEventListener('pointerdown',e=>{id=e.pointerId;x0=e.clientX;v.arrastra=true;v.vel=0;v.obj=null;tprev=e.timeStamp;try{el.setPointerCapture(id)}catch(_){}arranca()});
  el.addEventListener('pointermove',e=>{if(e.pointerId!==id||!v.arrastra)return;const dx=e.clientX-x0;x0=e.clientX;v.yaw+=dx*.011;v.sucio=true;const dt=Math.max(1,e.timeStamp-tprev);tprev=e.timeStamp;v.vel=Math.max(-14,Math.min(14,dx*.011/(dt/1000)));arranca()});
  const fin=e=>{if(e.pointerId!==id)return;v.arrastra=false;id=-1;if(RM.matches)v.vel=0;arranca()};
  el.addEventListener('pointerup',fin);el.addEventListener('pointercancel',fin);
  el.addEventListener('keydown',e=>{if(e.key==='ArrowLeft'){v.yaw-=.35;v.sucio=true;arranca()}else if(e.key==='ArrowRight'){v.yaw+=.35;v.sucio=true;arranca()}});
}
})(window);
