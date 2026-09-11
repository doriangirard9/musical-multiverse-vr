// Replica of the MagicTool analysis, run on synthetic strokes. See CLAUDE.md, "Magic tool".
// node src/tool/kind/magic/magic.bench.mjs   (env MS=8 MR=0.2 to override the two thresholds)
const ELBOW_SHARPNESS = 0.15, MIN_STRETCH = 0.04
const RELAX = [1, 0.5, 0.25, 0.125]      // how far the elbow threshold may be loosened
const NOISE_BURST = 4                     // a count growing this fast under one loosening is tremor
const MIN_STRETCHES = Number(process.env.MS ?? 8), MIN_WINDOW = 2
const FLAT_ELBOW = 12 * Math.PI / 180
const IDENTITY_ANGLE = 25 * Math.PI / 180, IDENTITY_LENGTH_TOLERANCE = 0.4
const MIN_SCALE = 0.2, MAX_SCALE = 5, MAX_RESIDUAL = Number(process.env.MR ?? 0.2), SAMPLES = 24, EPS = 1e-9

const sub=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]], add=(a,b)=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]]
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2], len=a=>Math.hypot(...a)
const mul=(a,s)=>[a[0]*s,a[1]*s,a[2]*s]
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]]
const clamp=v=>Math.min(1,Math.max(-1,v))

// ---------------- cutting the stroke on its elbows ----------------
function arcs(P){ const a=[0]; for(let i=1;i<P.length;i++) a.push(a[i-1]+len(sub(P[i],P[i-1]))); return a }

function bows(P,from,to,sharpness){
    const start=P[from], chord=sub(P[to],start), span=len(chord)
    if(span<EPS) return false
    const direction=mul(chord,1/span), limit=sharpness*span
    for(let k=from+1;k<to;k++){
        const offset=sub(P[k],start)
        if(len(sub(offset,mul(direction,dot(offset,direction))))>limit) return true
    }
    return false
}

function elbows(P,sharpness,shortest){
    const a=arcs(P), floor=shortest*a[a.length-1], bounds=[0]
    let from=0
    for(let to=2;to<P.length;to++){
        if(a[to]-a[from]<floor) continue
        if(!bows(P,from,to,sharpness)) continue
        bounds.push(to-1); from=to-1
    }
    bounds.push(P.length-1); return bounds
}

function equalParts(P,count){
    const a=arcs(P), total=a[a.length-1], bounds=[0]
    for(let part=1;part<count;part++){
        let i=bounds[bounds.length-1]+1
        while(i<P.length-1 && a[i]<total*part/count) i++
        bounds.push(i)
    }
    bounds.push(P.length-1); return bounds
}

function build(P,bounds){
    const out=[]
    for(let k=1;k<bounds.length;k++){
        const from=bounds[k-1], to=bounds[k]
        if(to<=from) continue
        const chord=sub(P[to],P[from]), length=len(chord)
        if(length<EPS) continue
        const direction=mul(chord,1/length), before=out[out.length-1]
        const angle=before===undefined?0:Math.acos(clamp(dot(before.direction,direction)))
        const axis=before===undefined?[0,0,0]:cross(before.direction,direction)
        const turn=len(axis)
        const bent=angle>FLAT_ELBOW && turn>EPS
        out.push({from,to,direction,length,angle,axis:bent?mul(axis,1/turn):[0,0,0]})
    }
    return out
}

/**
 * Cut the stroke, loosening the elbow threshold while it yields too few stretches, and falling back
 * on equal parts when the stroke has no bend to be cut on at all.
 * The trailing stretch is dropped: the trigger is released wherever it is released, so that one is a
 * piece of a stretch and its length would say more about when the hand stopped than about the drawing.
 */
function cut(P){
    let previous = null
    for(const relax of RELAX){
        const stretches = build(P, elbows(P, ELBOW_SHARPNESS*relax, MIN_STRETCH*relax))
        // A count exploding under one loosening is the tremor of the hand being cut up, not the
        // drawing: nothing below this threshold is worth reading, so equal parts it is.
        if(previous !== null && stretches.length > previous*NOISE_BURST) break
        if(stretches.length > MIN_STRETCHES) return { stretches: stretches.slice(0,-1), how: `relax ${relax}` }
        previous = stretches.length
    }
    const even = build(P, equalParts(P, MIN_STRETCHES+1))
    return { stretches: even.slice(0,-1), how: "equal parts" }
}

// ---------------- the identity of a stretch ----------------
function identityOf(S,index,window){
    if(index-window<0) return null
    const reference=S[index], unit=S[index-1].length
    if(unit<EPS) return null
    const steps=[]
    for(let back=0;back<window;back++){
        const at=S[index-back]
        const flat=len(at.axis)<0.5||len(reference.axis)<0.5
        steps.push({
            angle: at.angle,
            turn: flat?0:Math.acos(clamp(dot(at.axis,reference.axis))),
            ratio: S[index-back-1].length/unit,
        })
    }
    return steps
}

function alike(one,other){
    for(let k=0;k<one.length;k++){
        if(Math.abs(one[k].angle-other[k].angle)>IDENTITY_ANGLE) return false
        if(Math.abs(one[k].turn-other[k].turn)>IDENTITY_ANGLE) return false
        const larger=Math.max(one[k].ratio,other[k].ratio)
        if(larger>EPS && Math.abs(one[k].ratio-other[k].ratio)/larger>IDENTITY_LENGTH_TOLERANCE) return false
    }
    return true
}

// ---------------- least-squares similarity ----------------
function resample(P,n){
    const a=arcs(P), total=a[a.length-1]
    if(P.length<2||total<EPS) return Array.from({length:n},()=>P[0]??[0,0,0])
    const out=[]
    for(let k=0;k<n;k++){
        const t=total*k/(n-1)
        let i=1; while(i<P.length-1&&a[i]<t) i++
        const span=a[i]-a[i-1], f=span<EPS?0:(t-a[i-1])/span
        out.push(add(P[i-1],mul(sub(P[i],P[i-1]),f)))
    }
    return out
}

const applyMat=(M,v)=>[dot(M[0],v),dot(M[1],v),dot(M[2],v)]

function quatToMat([w,x,y,z]){
    return [[1-2*(y*y+z*z),2*(x*y-w*z),2*(x*z+w*y)],
            [2*(x*y+w*z),1-2*(x*x+z*z),2*(y*z-w*x)],
            [2*(x*z-w*y),2*(y*z+w*x),1-2*(x*x+y*y)]]
}

/** The similarity carrying the source points onto the target ones, fitted on all of them at once. */
function fit(source,target){
    const n=source.length
    let ca=[0,0,0], cb=[0,0,0]
    for(let i=0;i<n;i++){ ca=add(ca,source[i]); cb=add(cb,target[i]) }
    ca=mul(ca,1/n); cb=mul(cb,1/n)
    const A=source.map(p=>sub(p,ca)), B=target.map(p=>sub(p,cb))

    const H=[[0,0,0],[0,0,0],[0,0,0]]
    for(let i=0;i<n;i++) for(let r=0;r<3;r++) for(let c=0;c<3;c++) H[r][c]+=A[i][r]*B[i][c]
    const [[Sxx,Sxy,Sxz],[Syx,Syy,Syz],[Szx,Szy,Szz]]=H
    const N=[
        [Sxx+Syy+Szz, Syz-Szy,     Szx-Sxz,     Sxy-Syx],
        [Syz-Szy,     Sxx-Syy-Szz, Sxy+Syx,     Szx+Sxz],
        [Szx-Sxz,     Sxy+Syx,    -Sxx+Syy-Szz, Syz+Szy],
        [Sxy-Syx,     Szx+Sxz,     Syz+Szy,    -Sxx-Syy+Szz]]
    let shift=0
    for(let r=0;r<4;r++){ let s=0; for(let c=0;c<4;c++) s+=Math.abs(N[r][c]); shift=Math.max(shift,s) }
    for(let r=0;r<4;r++) N[r][r]+=shift
    let q=[1,0,0,0]
    for(let it=0;it<128;it++){
        const next=[0,0,0,0]
        for(let r=0;r<4;r++){ let s=0; for(let c=0;c<4;c++) s+=N[r][c]*q[c]; next[r]=s }
        const m=Math.hypot(...next); if(m<EPS) break
        q=next.map(v=>v/m)
    }
    const R=quatToMat(q)

    let num=0, den=0
    for(let i=0;i<n;i++){ num+=dot(applyMat(R,A[i]),B[i]); den+=dot(A[i],A[i]) }
    const scale=den<EPS?1:num/den
    let residual=0
    for(let i=0;i<n;i++) residual+=len(sub(add(cb,mul(applyMat(R,A[i]),scale)),target[i]))
    const spread=Math.sqrt(den/n)
    return { apply:p=>add(cb,mul(applyMat(R,sub(p,ca)),scale)), scale, residual: spread<EPS?Infinity:residual/n/spread }
}

// ---------------- finding the period ----------------
function periodFit(P,S,candidate){
    const last=S.length-1, period=last-candidate
    if(candidate-period<0) return null
    const source=resample(P.slice(S[candidate-period].to,S[candidate].to+1),SAMPLES)
    const target=resample(P.slice(S[candidate].to,S[last].to+1),SAMPLES)
    const fitted=fit(source,target)
    if(fitted.scale<MIN_SCALE||fitted.scale>MAX_SCALE) return null
    return fitted
}

function select(P,S){
    const last=S.length-1
    let discriminating=null, widest=null

    for(let window=MIN_WINDOW;window<=last;window++){
        if(last-window<1) break
        const identity=identityOf(S,last,window)
        if(identity===null) break

        const answering=[]
        for(let other=window;other<last;other++){
            const compared=identityOf(S,other,window)
            if(compared!==null&&alike(identity,compared)) answering.push(other)
        }
        if(answering.length===0) break

        // Widening also shrinks the stretches able to answer, each needing that many elbows behind
        // it too; once one is eligible it wins by default, so such a round is a last resort only.
        if(last-window>=2) discriminating={answering,window}
        widest={answering,window}
    }

    const round=discriminating??widest
    if(round===null) return null

    let chosen=null, best=null, score=Infinity
    for(const candidate of round.answering){
        const fitted=periodFit(P,S,candidate)
        if(fitted===null||fitted.residual>=score) continue
        score=fitted.residual; chosen=candidate; best=fitted
    }
    // A period that does not actually carry the drawing onto itself is no period at all.
    if(chosen===null) return null
    return { chosen, window:round.window, fit:best, rejected: best.residual>MAX_RESIDUAL }
}

// ---------------- bench ----------------
const J=0.004
const wob=p=>[p[0]+(Math.random()-.5)*J,p[1]+(Math.random()-.5)*J,p[2]+(Math.random()-.5)*J]

function run(name,P){
    const {stretches:S,how}=cut(P), last=S.length-1
    if(last<MIN_WINDOW+1) return console.log(`${name}: FIZZLE, only ${S.length} stretches (${how})`)
    const r=select(P,S)
    if(r===null) return console.log(`${name}: FIZZLE, no fit (${S.length} str, ${how})`)
    if(r.rejected) return console.log(`${name}: FIZZLE, residual ${(r.fit.residual*100).toFixed(0)}% (${S.length} str, ${how})`)
    let cur=P.slice(S[r.chosen].to,S[last].to+1), ends=[]
    for(let k=0;k<3;k++){ cur=cur.map(r.fit.apply); ends.push(cur[cur.length-1]) }
    const f=P[S[last].to]
    console.log(`${name}: ${S.length} str (${how}), period ${last-r.chosen}, scale ${r.fit.scale.toFixed(2)}, residual ${(r.fit.residual*100).toFixed(0)}%`)
    console.log(`${' '.repeat(name.length)}  end (${f[0].toFixed(2)},${f[1].toFixed(2)},${f[2].toFixed(2)}) -> `+ends.map(p=>`(${p[0].toFixed(2)},${p[1].toFixed(2)},${p[2].toFixed(2)})`).join(' '))
}

const along=(from,to,n,out)=>{ for(let i=1;i<=n;i++) out.push(wob(add(from,mul(sub(to,from),i/n)))) }

run('straight   ', Array.from({length:60},(_,i)=>wob([0,i*0.01,0])))

{const P=[];let x=0,y=0
 for(let s=0;s<6;s++){for(let i=0;i<12;i++){x+=.01;P.push(wob([x,y,0]))}for(let i=0;i<12;i++){y+=.01;P.push(wob([x,y,0]))}}
 run('staircase  ',P)}

{const P=[];let x=0,y=0,step=0.06
 for(let s=0;s<5;s++){const n=Math.max(6,Math.round(step*100))
   for(let i=0;i<n;i++){x+=step/n;P.push(wob([x,y,0]))}
   for(let i=0;i<n;i++){y+=step/n;P.push(wob([x,y,0]))}
   step*=1.25}
 run('stair grow ',P)}

{const P=[];for(let i=0;i<=240;i++){const t=i/240*3*2*Math.PI,r=.05*Math.pow(1.5,t/(2*Math.PI));P.push(wob([r*Math.cos(t),r*Math.sin(t),0]))}
 run('spiral 1.5 ',P)}

{const P=[];for(let i=0;i<=240;i++){const t=i/240*3*2*Math.PI,r=.2*Math.pow(1.5,t/(2*Math.PI));P.push(wob([r*Math.cos(t),r*Math.sin(t),0]))}
 run('spiral x4  ',P)}

{const P=[];for(let i=0;i<=300;i++){const t=i/300*4*2*Math.PI;P.push(wob([.08*Math.cos(t),.08*Math.sin(t),t/(2*Math.PI)*.06]))}
 run('dna helix  ',P)}

{const P=[];for(let i=0;i<=300;i++){const t=i/300*4*2*Math.PI,r=.25*Math.pow(.7,t/(2*Math.PI));P.push(wob([r*Math.cos(t),r*Math.sin(t),0]))}
 run('whirlpool  ',P)}

// nested squares: one stroke spiralling outwards in square turns, each side 1.2x the one before
{const P=[];let p=[0,0,0];let side=0.05
 const dirs=[[1,0,0],[0,1,0],[-1,0,0],[0,-1,0]]
 for(let k=0;k<12;k++){
   const d=dirs[k%4], q=add(p,mul(d,side))
   along(p,q,Math.max(4,Math.round(side*120)),P); p=q; side*=1.2}
 run('sq nested  ',P)}

// nested circles: one stroke, each turn 1.3x the radius of the previous one
{const P=[];for(let i=0;i<=300;i++){const t=i/300*4*2*Math.PI,r=.05*Math.pow(1.3,t/(2*Math.PI));P.push(wob([r*Math.cos(t),r*Math.sin(t),0]))}
 run('round nest ',P)}

// nested curves: repeated C shapes, each one wider than the last
{const P=[];let cx=0,scale=0.06
 for(let k=0;k<6;k++){
   for(let i=0;i<=30;i++){const t=-Math.PI/2+i/30*Math.PI
     P.push(wob([cx+scale*Math.cos(t),scale*Math.sin(t),0]))}
   cx+=scale*1.1; scale*=1.2}
 run('curve nest ',P)}

// an arc of circle studded with regular spikes
{const P=[];const R=0.3
 for(let k=0;k<8;k++){
   const t0=Math.PI*0.15+k*0.12, t1=t0+0.12
   const base0=[R*Math.cos(t0),R*Math.sin(t0),0], base1=[R*Math.cos(t1),R*Math.sin(t1),0]
   const mid=[(R+0.06)*Math.cos((t0+t1)/2),(R+0.06)*Math.sin((t0+t1)/2),0]
   along(base0,mid,6,P); along(mid,base1,6,P)}
 run('spiked arc ',P)}

{const P=[];for(let i=0;i<=80;i++){const u=i/80;P.push(wob([u*.8,.5*Math.sin(u*Math.PI),0]))}
 run('bell lob   ',P)}

{const P=[];let p=[0,0,0]
 for(let i=0;i<120;i++){p=[p[0]+(Math.random()-.5)*.03,p[1]+(Math.random()-.5)*.03,p[2]+(Math.random()-.5)*.03];P.push(p)}
 run('scribble   ',P)}

console.log('-- small spiral, tremor from 4mm down to 0 (true scale per stretch 1.07) --')
for(const j of [0.004,0.002,0.001,0]){
  const P=[];for(let i=0;i<=240;i++){const t=i/240*3*2*Math.PI,r=.05*Math.pow(1.5,t/(2*Math.PI))
    P.push([r*Math.cos(t)+(Math.random()-.5)*j, r*Math.sin(t)+(Math.random()-.5)*j, (Math.random()-.5)*j])}
  run(`spiral j=${(j*1000).toFixed(0)}mm`,P)}
